use crate::model::Dataset;
use anyhow::Result;
use sqlx::{PgPool, Row, postgres::PgPoolOptions};
pub async fn connect(url: &str) -> Result<PgPool> {
    let pool = PgPoolOptions::new().max_connections(5).connect(url).await?;
    let mut migration = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(1562911187)")
        .execute(&mut *migration)
        .await?;
    sqlx::raw_sql(include_str!("../migrations/001_initial.sql"))
        .execute(&mut *migration)
        .await?;
    sqlx::raw_sql(include_str!("../migrations/002_remove_provenance.sql"))
        .execute(&mut *migration)
        .await?;
    migration.commit().await?;
    Ok(pool)
}
pub async fn load(pool: &PgPool) -> Result<Option<Dataset>> {
    let row = sqlx::query("SELECT payload FROM dataset_state WHERE id=TRUE")
        .fetch_optional(pool)
        .await?;
    row.map(|r| serde_json::from_value(r.get("payload")))
        .transpose()
        .map_err(Into::into)
}
pub async fn save(pool: &PgPool, data: &Dataset) -> Result<()> {
    let mut tx = pool.begin().await?;
    for s in &data.settings {
        sqlx::query("INSERT INTO sensitivity_observations (player_key,dpi,sensitivity,observed_at,updated_at,payload) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING").bind(s.name.to_lowercase()).bind(s.dpi).bind(s.sensitivity).bind(s.observed_at).bind(s.updated_at).bind(serde_json::to_value(s)?).execute(&mut *tx).await?;
    }
    sqlx::query("INSERT INTO dataset_state (id,payload) VALUES (TRUE,$1) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload,updated_at=now()").bind(serde_json::to_value(data)?).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}
pub async fn log(
    pool: &PgPool,
    dataset: &str,
    status: &str,
    message: &str,
    records: usize,
) -> Result<()> {
    sqlx::query("INSERT INTO import_runs(dataset,status,message,records) VALUES ($1,$2,$3,$4)")
        .bind(dataset)
        .bind(status)
        .bind(message)
        .bind(records as i32)
        .execute(pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "requires TEST_DATABASE_URL pointing to an empty disposable database"]
    async fn persistence_round_trip() {
        let url = std::env::var("TEST_DATABASE_URL").expect("Set TEST_DATABASE_URL");
        let mut data = crate::sources::seed().unwrap();
        data.settings[0].updated_at =
            Some(data.settings[0].observed_at - chrono::Duration::days(2));
        seed_legacy_database(&url, &data).await;
        let pool = connect(&url).await.unwrap();
        let migrated = load(&pool).await.unwrap().unwrap();
        assert_eq!(
            serde_json::to_value(&migrated).unwrap(),
            serde_json::to_value(&data).unwrap()
        );
        let payload: serde_json::Value = sqlx::query_scalar("SELECT payload FROM dataset_state")
            .fetch_one(&pool)
            .await
            .unwrap();
        let serialized = payload.to_string();
        for key in ["source_url", "sources", "source_updated_at", "acquisition"] {
            assert!(
                !serialized.contains(key),
                "Legacy field {key} survived migration"
            );
        }
        let observations: i64 = sqlx::query_scalar("SELECT count(*) FROM sensitivity_observations")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(
            observations, 1,
            "Duplicate measurements should merge across old source URLs"
        );
        let updated_at: Option<chrono::DateTime<chrono::Utc>> =
            sqlx::query_scalar("SELECT updated_at FROM sensitivity_observations")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(updated_at, data.settings[0].updated_at);
        let dataset: String = sqlx::query_scalar("SELECT dataset FROM import_runs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(dataset, "settings");
        log(
            &pool,
            "settings",
            "imported",
            "Import completed",
            data.settings.len(),
        )
        .await
        .unwrap();
        let mut changed = data.settings[0].clone();
        changed.observed_at += chrono::Duration::seconds(1);
        changed.sensitivity += 0.001;
        crate::sources::merge_settings(&mut data, vec![changed.clone()]);
        let count = data.settings.len() as i64;
        save(&pool, &data).await.unwrap();
        save(&pool, &data).await.unwrap();
        let stored: i64 = sqlx::query_scalar("SELECT count(*) FROM sensitivity_observations")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(stored, count, "Repeated imports must be idempotent");
        pool.close().await;
        let reopened = connect(&url).await.unwrap();
        let restored = load(&reopened).await.unwrap().unwrap();
        assert_eq!(restored.settings.len(), count as usize);
        let history: Vec<_> = restored
            .settings
            .iter()
            .filter(|s| s.name == changed.name)
            .collect();
        assert_eq!(history.len(), 2);
        assert!(history.iter().any(|s| s.sensitivity == changed.sensitivity));
        assert_eq!(restored.splits.len(), data.splits.len());
        assert_eq!(restored.events.len(), data.events.len());
    }

    async fn seed_legacy_database(url: &str, data: &Dataset) {
        let pool = PgPoolOptions::new().connect(url).await.unwrap();
        let empty: bool = sqlx::query_scalar("SELECT to_regclass('dataset_state') IS NULL")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(empty, "Use an empty disposable database");
        sqlx::raw_sql(include_str!("../migrations/001_initial.sql"))
            .execute(&pool)
            .await
            .unwrap();
        let mut legacy = serde_json::to_value(data).unwrap();
        legacy["sources"] = serde_json::json!([{"name": "ProSettings"}]);
        for setting in legacy["settings"].as_array_mut().unwrap() {
            setting["source_url"] = "https://example.com/settings".into();
            setting["acquisition"] = "legacy import".into();
            setting["source_updated_at"] = setting["updated_at"].take();
            setting.as_object_mut().unwrap().remove("updated_at");
        }
        for event in legacy["events"].as_array_mut().unwrap() {
            event["source_url"] = "https://example.com/events".into();
        }
        sqlx::query("INSERT INTO dataset_state (id, payload) VALUES (TRUE, $1)")
            .bind(&legacy)
            .execute(&pool)
            .await
            .unwrap();
        let setting = &data.settings[0];
        for source in ["https://example.com/first", "https://example.com/second"] {
            sqlx::query("INSERT INTO sensitivity_observations (player_key,dpi,sensitivity,source_url,observed_at,source_updated_at,payload) VALUES ($1,$2,$3,$4,$5,$6,$7)")
                .bind(setting.name.to_lowercase()).bind(setting.dpi).bind(setting.sensitivity)
                .bind(source).bind(setting.observed_at).bind(setting.updated_at)
                .bind(&legacy["settings"][0]).execute(&pool).await.unwrap();
        }
        sqlx::query("INSERT INTO import_runs(source,status,message,records) VALUES ('ProSettings','imported','Import completed',1)")
            .execute(&pool).await.unwrap();
        pool.close().await;
    }
}
