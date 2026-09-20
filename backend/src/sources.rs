use crate::model::*;
use anyhow::{Context, Result, bail};
use chrono::Utc;
use scraper::{Html, Selector};
use serde_json::Value;
use std::time::Duration;
pub const PRO_URL: &str = "https://prosettings.net/lists/valorant/";
pub fn client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent("Calibre/0.1 (self-hosted VALORANT research; public statistics)")
        .build()?)
}
pub fn decode_vct(value: Value) -> Result<Vec<Split>> {
    if value.is_array() {
        let splits: Vec<Split> = serde_json::from_value(value)?;
        anyhow::ensure!(!splits.is_empty(), "Empty dataset");
        return Ok(splits);
    }
    let cols = value["cols"].as_array().context("VCT columns missing")?;
    let rows = value["rows"].as_array().context("VCT rows missing")?;
    let mut out = Vec::new();
    for row in rows {
        let r = row.as_array().context("Invalid VCT row")?;
        if r.len() != cols.len() {
            bail!("VCT schema changed: row length mismatch")
        }
        let mut obj = serde_json::Map::new();
        for (k, v) in cols.iter().zip(r) {
            obj.insert(k.as_str().context("Invalid column")?.into(), v.clone());
        }
        let split: Split = serde_json::from_value(Value::Object(obj))?;
        if split.maps < 0.0 || split.rounds < 0.0 || split.player.is_empty() {
            bail!("Invalid competitive record")
        }
        out.push(split);
    }
    if out.is_empty() {
        bail!("No competitive records found")
    };
    Ok(out)
}
fn parse_selector(selector: &str) -> Result<Selector> {
    Selector::parse(selector)
        .map_err(|error| anyhow::anyhow!("Invalid source selector {selector}: {error}"))
}

pub fn parse_prosettings(html: &str) -> Result<Vec<Setting>> {
    if html.contains("Just a moment...") || html.contains("cf-chl-") {
        bail!(
            "ProSettings requires browser verification. Last successful observations retained; import a permitted export using the CLI."
        )
    }
    let doc = Html::parse_document(html);
    let tr = parse_selector("table tr")?;
    let td = parse_selector("td")?;
    let th = parse_selector("th")?;
    let a = parse_selector("a[href*='/players/']")?;
    let headers: Vec<_> = doc
        .select(&th)
        .map(|e| e.text().collect::<String>().trim().to_lowercase())
        .collect();
    let dpi_i = headers.iter().position(|s| s == "dpi");
    let sens_i = headers
        .iter()
        .position(|s| s == "sens" || s == "sensitivity");
    let team_i = headers.iter().position(|s| s == "team");
    let (Some(di), Some(si)) = (dpi_i, sens_i) else {
        bail!("ProSettings table schema changed or page blocked; nothing imported")
    };
    let mut out = Vec::new();
    for row in doc.select(&tr) {
        let cells: Vec<_> = row
            .select(&td)
            .map(|e| e.text().collect::<String>().trim().to_string())
            .collect();
        let Some(link) = row.select(&a).next() else {
            continue;
        };
        let name = link.text().collect::<String>().trim().to_string();
        let num = |i: usize| {
            cells
                .get(i)
                .and_then(|s| s.replace(',', "").parse::<f64>().ok())
        };
        if let (Some(dpi), Some(sensitivity)) = (num(di), num(si)) {
            let s = Setting {
                name,
                team: team_i
                    .and_then(|i| cells.get(i))
                    .cloned()
                    .unwrap_or_default(),
                dpi,
                sensitivity,
                observed_at: Utc::now(),
                updated_at: None,
                reliability: 0.75,
            };
            if s.valid() {
                out.push(s)
            }
        }
    }
    if out.is_empty() {
        bail!("No valid sensitivity records; last successful import retained")
    };
    Ok(out)
}
pub async fn import_prosettings() -> Result<Vec<Setting>> {
    let html = client()?
        .get(PRO_URL)
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;
    parse_prosettings(&html)
}
pub fn seed() -> Result<Dataset> {
    let settings: Vec<Setting> = serde_json::from_str(include_str!("../../data/settings.json"))?;
    let splits = decode_vct(serde_json::from_str(include_str!(
        "../../data/competitive.json"
    ))?)?;
    let events: Vec<EventResult> = serde_json::from_str(include_str!("../../data/events.json"))?;
    Ok(Dataset {
        settings,
        splits,
        events,
    })
}
pub async fn import_vct_full() -> Result<(Vec<Split>, Vec<EventResult>)> {
    let response = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .connect_timeout(Duration::from_secs(12))
        .http1_only()
        .user_agent("Calibre/0.1 (self-hosted VALORANT research)")
        .build()?
        .get("https://vct-reference.com/dataset/vct.duckdb")
        .send()
        .await?
        .error_for_status()?;
    if response
        .content_length()
        .is_some_and(|n| n > 512 * 1024 * 1024)
    {
        bail!("Source database exceeds 512 MiB import limit")
    }
    let bytes = response.bytes().await?;
    anyhow::ensure!(
        bytes.len() <= 512 * 1024 * 1024,
        "Source database exceeds import limit"
    );
    let file = tempfile::NamedTempFile::new()?;
    tokio::fs::write(file.path(), bytes).await?;
    tokio::task::spawn_blocking(move || read_vct_database(file.path())).await?
}

pub fn read_vct_database(path: &std::path::Path) -> Result<(Vec<Split>, Vec<EventResult>)> {
    let config = duckdb::Config::default()
        .access_mode(duckdb::AccessMode::ReadOnly)?
        .enable_external_access(false)?;
    let conn = duckdb::Connection::open_with_flags(path, config)?;
    let mut stmt = conn.prepare(include_str!("vct_splits.sql"))?;
    let mut rows = stmt.query([])?;
    let mut splits = Vec::new();
    while let Some(row) = rows.next()? {
        let json: String = row.get(0)?;
        splits.push(serde_json::from_str::<Split>(&json)?);
    }
    let mut stmt = conn.prepare(include_str!("vct_events.sql"))?;
    let mut rows = stmt.query([])?;
    let mut events = Vec::new();
    while let Some(row) = rows.next()? {
        let json: String = row.get(0)?;
        events.push(serde_json::from_str::<EventResult>(&json)?);
    }
    anyhow::ensure!(
        !splits.is_empty(),
        "No competitive records; previous dataset retained"
    );
    Ok((splits, events))
}

/// Re-importing the same observation is idempotent; new dates remain history.
pub fn merge_settings(data: &mut Dataset, incoming: Vec<Setting>) {
    use std::collections::HashSet;
    let mut keys: HashSet<_> = data
        .settings
        .iter()
        .map(|s| {
            (
                s.name.to_lowercase(),
                s.observed_at,
                s.dpi.to_bits(),
                s.sensitivity.to_bits(),
            )
        })
        .collect();
    for s in incoming {
        if keys.insert((
            s.name.to_lowercase(),
            s.observed_at,
            s.dpi.to_bits(),
            s.sensitivity.to_bits(),
        )) {
            data.settings.push(s);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duckdb_json_available_without_external_access() {
        let config = duckdb::Config::default()
            .enable_external_access(false)
            .unwrap();
        let conn = duckdb::Connection::open_in_memory_with_flags(config).unwrap();
        let json: String = conn
            .query_row(
                "SELECT to_json(player) FROM (SELECT 'Test' AS name, 800 AS dpi) player",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&json).unwrap(),
            serde_json::json!({"name": "Test", "dpi": 800})
        );
    }

    #[test]
    fn blocked_page_never_overwrites() {
        assert!(parse_prosettings("<title>Just a moment...</title>").is_err())
    }
    #[test]
    fn parses_columns_without_fixed_order() {
        let html = "<table><tr><th>Player</th><th>Sens</th><th>DPI</th><th>Team</th></tr><tr><td><a href='https://prosettings.net/players/test/'>Test</a></td><td>0.25</td><td>800</td><td>ABC</td></tr></table>";
        let x = parse_prosettings(html).unwrap();
        assert_eq!(x[0].dpi * x[0].sensitivity, 200.);
    }
    #[test]
    fn bundled_data_valid() {
        let d = seed().unwrap();
        assert!(d.settings.len() > 100);
        assert!(d.settings.iter().all(Setting::valid));
        assert!(d.splits.len() > 1000);
    }

    #[test]
    fn deduplicates_measurements_without_losing_changes() {
        let mut data = seed().unwrap();
        let original = data.settings[0].clone();
        data.settings = vec![original.clone()];
        let mut duplicate = original.clone();
        duplicate.name = duplicate.name.to_uppercase();
        let mut changed = original.clone();
        changed.sensitivity += 0.001;
        let mut later = original.clone();
        later.observed_at += chrono::Duration::seconds(1);
        let incoming = vec![duplicate, changed, later];
        merge_settings(&mut data, incoming.clone());
        merge_settings(&mut data, incoming);
        assert_eq!(data.settings.len(), 3);
        assert_eq!(data.settings[0].sensitivity, original.sensitivity);
        assert_eq!(data.settings[1].sensitivity, original.sensitivity + 0.001);
        assert!(data.settings[2].observed_at > original.observed_at);
    }

    #[test]
    fn accepts_clean_and_legacy_settings_exports() {
        let mut record = serde_json::to_value(&seed().unwrap().settings[0]).unwrap();
        let clean: Setting = serde_json::from_value(record.clone()).unwrap();
        assert!(clean.valid());
        record.as_object_mut().unwrap().remove("updated_at");
        record["source_updated_at"] = serde_json::to_value(clean.observed_at).unwrap();
        record["source_url"] = "https://example.com/settings".into();
        record["acquisition"] = "legacy import".into();
        let legacy: Setting = serde_json::from_value(record).unwrap();
        assert_eq!(legacy.updated_at, Some(clean.observed_at));
        let serialized = serde_json::to_value(&legacy).unwrap();
        assert!(serialized.get("source_url").is_none());
        assert!(serialized.get("source_updated_at").is_none());
        assert!(serialized.get("acquisition").is_none());
        let mut invalid = clean;
        invalid.dpi = 0.0;
        assert!(!invalid.valid());
    }
}
