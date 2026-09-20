mod db;
mod model;
mod players;
mod sources;
mod stats;
use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use model::*;
use serde_json::json;
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};
use tokio::sync::{Mutex, RwLock, Semaphore};
#[derive(Clone)]
struct App {
    generation: Arc<AtomicU64>,
    data: Arc<RwLock<Dataset>>,
    pool: Option<PgPool>,
    cache: Arc<RwLock<HashMap<String, serde_json::Value>>>,
    import: Arc<Mutex<()>>,
    compute: Arc<Semaphore>,
    token: Option<String>,
}
struct ApiError(StatusCode, String);
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({"error":self.1}))).into_response()
    }
}
async fn health(State(app): State<App>) -> Json<serde_json::Value> {
    Json(
        json!({"status":"ok","storage":if app.pool.is_some(){"postgresql"}else{"memory"},"model":"1.0.0"}),
    )
}
async fn analyze(
    State(app): State<App>,
    Json(req): Json<AnalysisRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    req.validate()
        .map_err(|e| ApiError(StatusCode::BAD_REQUEST, e))?;
    let key = format!(
        "{}:{}:{}:{}",
        app.generation.load(Ordering::SeqCst),
        chrono::Utc::now().date_naive(),
        serde_json::to_string(&req.filters)
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
        req.dpi
    );
    if let Some(v) = app.cache.read().await.get(&key) {
        return Ok(Json(v.clone()));
    }
    let permit = app
        .compute
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| ApiError(StatusCode::SERVICE_UNAVAILABLE, e.to_string()))?;
    let data = app.data.read().await.clone();
    let value = tokio::task::spawn_blocking(move || {
        let _permit = permit;
        serde_json::to_value(stats::analyze(&data, &req))
    })
    .await
    .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut cache = app.cache.write().await;
    if cache.len() > 128 {
        cache.clear()
    }
    cache.insert(key, value.clone());
    Ok(Json(value))
}
async fn metadata(State(app): State<App>) -> Json<serde_json::Value> {
    let d = app.data.read().await;
    // Stable slider bounds come from all observations, never the filtered cohort.
    let mut setting_maxima = [100.0_f64, 0.25_f64, 400.0_f64];
    for setting in d.settings.iter().filter(|setting| setting.valid()) {
        setting_maxima[0] = setting_maxima[0].max(setting.dpi * setting.sensitivity);
        setting_maxima[1] = setting_maxima[1].max(setting.sensitivity);
        setting_maxima[2] = setting_maxima[2].max(setting.dpi);
    }
    let setting_ranges = json!({
        "edpi": (setting_maxima[0] / 100.0).ceil() * 100.0,
        "sensitivity": (setting_maxima[1] / 0.25).ceil() * 0.25,
        "dpi": (setting_maxima[2] / 400.0).ceil().min(250.0) * 400.0,
    });
    let unique = |v: Vec<String>| {
        let mut v = v;
        v.sort();
        v.dedup();
        v
    };
    Json(
        json!({"setting_ranges":setting_ranges,"teams":unique(d.settings.iter().map(|s|s.team.clone()).collect()),"agents":unique(d.splits.iter().map(|s|s.agent.clone()).collect()),"regions":unique(d.splits.iter().map(|s|s.region.clone()).collect()),"years":unique(d.splits.iter().map(|s|s.season.to_string()).collect()),"tournaments":unique(d.splits.iter().map(|s|s.tournament.clone()).collect()),"tiers":unique(d.splits.iter().map(|s|s.tier.clone()).collect()),"storage":if app.pool.is_some(){"PostgreSQL"}else{"Memory · changes lost on restart"}}),
    )
}
async fn player(State(app): State<App>, Path(id): Path<String>) -> Result<Json<Player>, ApiError> {
    let d = app.data.read().await;
    let mut p = players::build(&d, &Filters::default());
    stats::cap(&mut p);
    p.into_iter()
        .find(|p| p.id == id)
        .map(Json)
        .ok_or(ApiError(StatusCode::NOT_FOUND, "Player not found".into()))
}
async fn refresh(
    State(app): State<App>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let Some(token) = &app.token else {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "Remote import disabled. Use cargo run -- import, or configure IMPORT_TOKEN.".into(),
        ));
    };
    if headers.get("authorization").and_then(|v| v.to_str().ok())
        != Some(&format!("Bearer {token}"))
    {
        return Err(ApiError(
            StatusCode::UNAUTHORIZED,
            "Import token required".into(),
        ));
    }
    let _lock = app
        .import
        .try_lock()
        .map_err(|_| ApiError(StatusCode::CONFLICT, "An import is already running".into()))?;
    let mut d = app.data.read().await.clone();
    let imports = refresh_data(&mut d, app.pool.as_ref())
        .await
        .map_err(|e| ApiError(StatusCode::BAD_GATEWAY, e.to_string()))?;
    if let Some(pool) = &app.pool {
        db::save(pool, &d)
            .await
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    }
    *app.data.write().await = d;
    app.generation.fetch_add(1, Ordering::SeqCst);
    app.cache.write().await.clear();
    Ok(Json(json!({"imports": imports})))
}
#[derive(serde::Serialize)]
struct ImportReport {
    dataset: &'static str,
    status: &'static str,
    records: usize,
    message: String,
}
impl ImportReport {
    fn success(dataset: &'static str, records: usize) -> Self {
        Self {
            dataset,
            status: "imported",
            records,
            message: "Import completed".into(),
        }
    }
    fn from_result(dataset: &'static str, result: Result<usize, &anyhow::Error>) -> Self {
        match result {
            Ok(records) => Self::success(dataset, records),
            Err(error) => Self {
                dataset,
                status: "error",
                records: 0,
                message: format!("{error:#}"),
            },
        }
    }
}
fn apply_imports(
    data: &mut Dataset,
    settings: anyhow::Result<Vec<Setting>>,
    competitive: anyhow::Result<(Vec<Split>, Vec<EventResult>)>,
) -> Vec<ImportReport> {
    let reports = vec![
        ImportReport::from_result("settings", settings.as_ref().map(Vec::len)),
        ImportReport::from_result("competitive", competitive.as_ref().map(|v| v.0.len())),
    ];
    if let Ok(settings) = settings {
        sources::merge_settings(data, settings);
    }
    if let Ok((splits, events)) = competitive {
        data.splits = splits;
        data.events = events;
    }
    reports
}
async fn refresh_data(
    data: &mut Dataset,
    pool: Option<&PgPool>,
) -> anyhow::Result<Vec<ImportReport>> {
    let (settings, competitive) =
        tokio::join!(sources::import_prosettings(), sources::import_vct_full());
    let reports = apply_imports(data, settings, competitive);
    if let Some(pool) = pool {
        for report in &reports {
            db::log(
                pool,
                report.dataset,
                report.status,
                &report.message,
                report.records,
            )
            .await?;
        }
    }
    Ok(reports)
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let pool = match std::env::var("DATABASE_URL") {
        Ok(url) => Some(db::connect(&url).await?),
        Err(_) => None,
    };
    let mut data = match &pool {
        Some(p) => db::load(p).await?.unwrap_or(sources::seed()?),
        None => sources::seed()?,
    };
    let args: Vec<String> = std::env::args().collect();
    if let Some(command) = args.get(1) {
        let p = pool
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("DATABASE_URL is required for persistent imports"))?;
        let imports = match command.as_str() {
            "import" => refresh_data(&mut data, Some(p)).await?,
            "import-vct-file" => {
                let path = args
                    .get(2)
                    .ok_or_else(|| anyhow::anyhow!("Provide the downloaded VCT DuckDB path"))?;
                let (splits, events) = sources::read_vct_database(std::path::Path::new(path))?;
                data.splits = splits;
                data.events = events;
                vec![
                    ImportReport::success("competitive", data.splits.len()),
                    ImportReport::success("events", data.events.len()),
                ]
            }
            "import-settings" => {
                let path = args
                    .get(2)
                    .ok_or_else(|| anyhow::anyhow!("Provide settings JSON path"))?;
                let records: Vec<Setting> = serde_json::from_str(&std::fs::read_to_string(path)?)?;
                anyhow::ensure!(
                    !records.is_empty() && records.iter().all(Setting::valid),
                    "Invalid settings; no records imported"
                );
                let count = records.len();
                sources::merge_settings(&mut data, records);
                vec![ImportReport::success("settings", count)]
            }
            "import-events" => {
                let path = args
                    .get(2)
                    .ok_or_else(|| anyhow::anyhow!("Provide event JSON path"))?;
                let events: Vec<EventResult> =
                    serde_json::from_str(&std::fs::read_to_string(path)?)?;
                anyhow::ensure!(
                    events.iter().all(|e| e.placement > 0
                        && !e.tournament.is_empty()
                        && chrono::NaiveDate::parse_from_str(&e.date, "%Y-%m-%d").is_ok()),
                    "Invalid events"
                );
                let count = events.len();
                for e in events {
                    data.events.retain(|x| {
                        !(x.player.eq_ignore_ascii_case(&e.player)
                            && x.tournament == e.tournament
                            && x.year == e.year)
                    });
                    data.events.push(e);
                }
                vec![ImportReport::success("events", count)]
            }
            _ => anyhow::bail!("Unknown command"),
        };
        db::save(p, &data).await?;
        println!(
            "{}",
            serde_json::to_string_pretty(&json!({"imports": imports}))?
        );
        return Ok(());
    }
    if let Some(p) = &pool {
        db::save(p, &data).await?
    }
    let app = App {
        generation: Arc::new(AtomicU64::new(0)),
        data: Arc::new(RwLock::new(data)),
        pool,
        cache: Arc::new(RwLock::new(HashMap::new())),
        import: Arc::new(Mutex::new(())),
        compute: Arc::new(Semaphore::new(4)),
        token: std::env::var("IMPORT_TOKEN").ok().filter(|s| !s.is_empty()),
    };
    let router = Router::new()
        .route("/api/health", get(health))
        .route("/api/meta", get(metadata))
        .route("/api/analyze", post(analyze))
        .route("/api/players/{id}", get(player))
        .route("/api/import", post(refresh))
        .with_state(app)
        .layer(tower_http::trace::TraceLayer::new_for_http());
    let address = std::env::var("BIND_ADDRESS").unwrap_or_else(|_| "127.0.0.1:3001".into());
    println!("Calibre API listening on http://{address}");
    axum::serve(tokio::net::TcpListener::bind(&address).await?, router)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}

#[cfg(test)]
mod import_tests {
    use super::*;

    #[test]
    fn partial_import_retains_failed_dataset() {
        let mut data = sources::seed().unwrap();
        let before = serde_json::to_value(&data.settings).unwrap();
        let reports = apply_imports(
            &mut data,
            Err(anyhow::anyhow!("settings unavailable")),
            Ok((vec![], vec![])),
        );
        assert_eq!(serde_json::to_value(&data.settings).unwrap(), before);
        assert_eq!(reports[0].status, "error");
        assert_eq!(reports[1].status, "imported");
        assert!(data.splits.is_empty());
        assert!(data.events.is_empty());
    }

    #[test]
    fn failed_competitive_import_preserves_history() {
        let mut data = sources::seed().unwrap();
        let before = serde_json::to_value((&data.splits, &data.events)).unwrap();
        let mut setting = data.settings[0].clone();
        setting.sensitivity += 0.001;
        let count = data.settings.len();
        let reports = apply_imports(
            &mut data,
            Ok(vec![setting]),
            Err(anyhow::anyhow!("competitive data unavailable")),
        );
        assert_eq!(
            serde_json::to_value((&data.splits, &data.events)).unwrap(),
            before
        );
        assert_eq!(data.settings.len(), count + 1);
        assert_eq!(reports[0].status, "imported");
        assert_eq!(reports[1].status, "error");
    }
}
