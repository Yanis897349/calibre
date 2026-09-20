use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Setting {
    pub name: String,
    pub team: String,
    pub dpi: f64,
    pub sensitivity: f64,
    pub observed_at: DateTime<Utc>,
    #[serde(alias = "source_updated_at")]
    pub updated_at: Option<DateTime<Utc>>,
    pub reliability: f64,
}
impl Setting {
    pub fn valid(&self) -> bool {
        self.dpi.is_finite()
            && (50.0..=100000.0).contains(&self.dpi)
            && self.sensitivity.is_finite()
            && self.sensitivity > 0.0
            && self.sensitivity <= 10.0
            && (self.dpi * self.sensitivity) <= 10000.0
            && (0.0..=1.0).contains(&self.reliability)
            && !self.name.trim().is_empty()
            && self.observed_at <= Utc::now()
    }
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Split {
    pub player: String,
    pub player_id: u64,
    pub country: String,
    pub season: i32,
    pub region: String,
    pub agent: String,
    pub tournament: String,
    pub tier: String,
    pub maps: f64,
    pub rounds: f64,
    pub kills: f64,
    pub assists: f64,
    pub fk: f64,
    pub fd: f64,
    pub op_kills: f64,
    pub perf_rounds: f64,
    pub op_rounds: f64,
    pub sum_rating: f64,
    pub n_rating: f64,
    pub sum_acs: f64,
    pub n_acs: f64,
    pub last_played: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventResult {
    pub player: String,
    pub tournament: String,
    pub year: i32,
    pub tier: String,
    pub placement: u32,
    pub date: String,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Mechanical {
    pub operator: f64,
    pub movement: f64,
    pub entry: f64,
    pub anchor: f64,
    pub utility: f64,
}
impl Mechanical {
    pub fn values(&self) -> [f64; 5] {
        [
            self.operator,
            self.movement,
            self.entry,
            self.anchor,
            self.utility,
        ]
    }
}
#[derive(Debug, Clone, Serialize)]
pub struct AgentUsage {
    pub name: String,
    pub maps: f64,
    pub share: f64,
}
#[derive(Debug, Clone, Serialize)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub team: String,
    pub role: String,
    pub region: String,
    pub country: String,
    pub agents: Vec<AgentUsage>,
    pub role_history: BTreeMap<i32, String>,
    pub setting: Setting,
    pub edpi: f64,
    pub normalized_800: f64,
    pub performance: f64,
    pub rating: Option<f64>,
    pub acs: Option<f64>,
    pub achievement: Option<f64>,
    pub maps: f64,
    pub mechanical: Mechanical,
    pub styles: BTreeMap<String, f64>,
    pub weight: f64,
    pub contribution: f64,
    pub reliability: f64,
    pub last_played: String,
    pub events: Vec<EventResult>,
    pub history: Vec<Setting>,
    pub stale: bool,
    pub warnings: Vec<String>,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Filters {
    pub role: Option<String>,
    pub agent: Option<String>,
    pub team: Option<String>,
    pub region: Option<String>,
    pub tournament: Option<String>,
    pub year: Option<i32>,
    pub tier: Option<String>,
    pub search: Option<String>,
    pub style: Option<String>,
    pub edpi_min: Option<f64>,
    pub edpi_max: Option<f64>,
    pub sensitivity_min: Option<f64>,
    pub sensitivity_max: Option<f64>,
    pub dpi_min: Option<f64>,
    pub dpi_max: Option<f64>,
    pub performance_min: Option<f64>,
    pub maps_min: Option<f64>,
    pub operator_min: Option<f64>,
    pub operator_max: Option<f64>,
    pub movement_min: Option<f64>,
    pub movement_max: Option<f64>,
    pub entry_min: Option<f64>,
    pub entry_max: Option<f64>,
    pub anchor_min: Option<f64>,
    pub anchor_max: Option<f64>,
    pub utility_min: Option<f64>,
    pub utility_max: Option<f64>,
    pub profile: Option<Mechanical>,
}
#[derive(Debug, Clone, Deserialize)]
pub struct AnalysisRequest {
    #[serde(default)]
    pub filters: Filters,
    #[serde(default = "default_dpi")]
    pub dpi: f64,
}
pub fn default_dpi() -> f64 {
    800.0
}
impl AnalysisRequest {
    pub fn validate(&self) -> Result<(), String> {
        if !self.dpi.is_finite() || !(50.0..=100000.0).contains(&self.dpi) {
            return Err("Display DPI must be between 50 and 100,000".into());
        }
        let f = &self.filters;
        let ranges = [
            (f.edpi_min, f.edpi_max, 10000.0),
            (f.sensitivity_min, f.sensitivity_max, 200.0),
            (f.dpi_min, f.dpi_max, 100000.0),
            (f.operator_min, f.operator_max, 1.0),
            (f.movement_min, f.movement_max, 1.0),
            (f.entry_min, f.entry_max, 1.0),
            (f.anchor_min, f.anchor_max, 1.0),
            (f.utility_min, f.utility_max, 1.0),
        ];
        for (a, b, max) in ranges {
            if a.into_iter()
                .chain(b)
                .any(|v| !v.is_finite() || v < 0.0 || v > max)
                || a.zip(b).is_some_and(|(a, b)| a > b)
            {
                return Err("Invalid filter range".into());
            }
        }
        if f.profile.as_ref().is_some_and(|p| {
            p.values()
                .iter()
                .any(|v| !v.is_finite() || !(0.0..=1.0).contains(v))
        }) {
            return Err("Profile scores must be between zero and one".into());
        }
        if f.performance_min.is_some_and(|x| !(0.0..=1.0).contains(&x))
            || f.maps_min.is_some_and(|x| !(0.0..=100000.0).contains(&x))
        {
            return Err("Invalid performance or map threshold".into());
        }
        Ok(())
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Dataset {
    pub settings: Vec<Setting>,
    pub splits: Vec<Split>,
    pub events: Vec<EventResult>,
}

pub fn role(agent: &str) -> &'static str {
    match agent.to_lowercase().as_str() {
        "jett" | "raze" | "neon" | "reyna" | "phoenix" | "yoru" | "iso" | "waylay" => "Duelist",
        "sova" | "breach" | "skye" | "kayo" | "kay/o" | "fade" | "gekko" | "tejo" => "Initiator",
        "omen" | "astra" | "viper" | "brimstone" | "harbor" | "clove" => "Controller",
        "cypher" | "killjoy" | "chamber" | "sage" | "deadlock" | "vyse" | "veto" => "Sentinel",
        _ => "Flex",
    }
}
