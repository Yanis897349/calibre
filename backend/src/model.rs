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
    pub map: String,
    pub tournament: String,
    pub tier: String,
    pub maps: f64,
    pub rounds: f64,
    pub kills: f64,
    pub deaths: f64,
    pub assists: f64,
    /// Rounds where kills, deaths, and assists were all reported; the three totals cover only these rounds.
    pub stat_rounds: f64,
    pub fk: f64,
    pub fd: f64,
    pub op_kills: f64,
    pub op_deaths: f64,
    /// Kills and deaths inside kill-matrix coverage, the denominator for Operator shares.
    pub km_kills: f64,
    pub km_deaths: f64,
    pub perf_rounds: f64,
    pub op_rounds: f64,
    /// Round-weighted sums: ADR × rounds, KAST % × rounds, headshot % × rounds.
    pub sum_adr: f64,
    pub adr_rounds: f64,
    pub sum_kast: f64,
    pub kast_rounds: f64,
    pub sum_hs: f64,
    pub hs_rounds: f64,
    pub multi_kills: f64,
    pub clutches: f64,
    pub multi_rounds: f64,
    pub plants: f64,
    pub defuses: f64,
    pub objective_rounds: f64,
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
/// Maps played with one agent or on one map.
#[derive(Debug, Clone, Serialize)]
pub struct Usage {
    pub name: String,
    pub maps: f64,
    pub share: f64,
}
#[derive(Debug, Clone, Serialize)]
pub struct MapUsage {
    pub name: String,
    pub maps: f64,
    pub share: f64,
    pub kd: Option<f64>,
    pub rating: Option<f64>,
}
/// Observed rates for the selected maps. `None` means the source reported no coverage.
#[derive(Debug, Clone, Default, Serialize)]
pub struct CombatStats {
    pub rounds: f64,
    pub kills: f64,
    pub deaths: f64,
    pub assists: f64,
    pub kd: Option<f64>,
    pub kda: Option<f64>,
    pub kpr: Option<f64>,
    pub dpr: Option<f64>,
    pub apr: Option<f64>,
    pub adr: Option<f64>,
    pub kast: Option<f64>,
    pub hs: Option<f64>,
    pub fk_per_round: Option<f64>,
    pub fd_per_round: Option<f64>,
    pub opening_success: Option<f64>,
    pub multi_kill_rate: Option<f64>,
    pub clutches_per_100: Option<f64>,
    pub plants_per_100: Option<f64>,
    pub defuses_per_100: Option<f64>,
    /// Operator kills observed in the kill matrix; `km_kills` is that matrix's kill total.
    pub op_kills: f64,
    pub km_kills: f64,
    pub op_kill_share: Option<f64>,
    pub op_death_share: Option<f64>,
    pub op_kills_per_round: Option<f64>,
    pub rating: Option<f64>,
    pub acs: Option<f64>,
}
#[derive(Debug, Clone, Serialize)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub team: String,
    pub role: String,
    pub region: String,
    pub country: String,
    pub agents: Vec<Usage>,
    pub map_pool: Vec<MapUsage>,
    pub role_history: BTreeMap<i32, String>,
    pub setting: Setting,
    pub edpi: f64,
    pub normalized_800: f64,
    pub performance: f64,
    pub percentiles: BTreeMap<String, f64>,
    pub stats: CombatStats,
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
    /// The setting was last observed more than 90 days ago.
    pub stale: bool,
    pub warnings: Vec<String>,
    /// Pooled source rows behind this player, used for cohort profiles.
    #[serde(skip)]
    pub totals: Split,
}
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PerformanceBasis {
    #[default]
    Composite,
    Rating,
    Kd,
    Kda,
    Adr,
    Kast,
    Hs,
    Acs,
}
/// Accepts one value or a list, so single-value clients and links keep working.
fn one_or_many<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum OneOrMany<T> {
        One(T),
        Many(Vec<T>),
    }
    Ok(match Option::<OneOrMany<T>>::deserialize(deserializer)? {
        None => vec![],
        Some(OneOrMany::One(value)) => vec![value],
        Some(OneOrMany::Many(values)) => values,
    })
}
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct Filters {
    #[serde(alias = "role", deserialize_with = "one_or_many")]
    pub roles: Vec<String>,
    #[serde(alias = "agent", deserialize_with = "one_or_many")]
    pub agents: Vec<String>,
    #[serde(alias = "team", deserialize_with = "one_or_many")]
    pub teams: Vec<String>,
    #[serde(alias = "region", deserialize_with = "one_or_many")]
    pub regions: Vec<String>,
    #[serde(alias = "tournament", deserialize_with = "one_or_many")]
    pub tournaments: Vec<String>,
    #[serde(alias = "year", deserialize_with = "one_or_many")]
    pub years: Vec<i32>,
    #[serde(alias = "tier", deserialize_with = "one_or_many")]
    pub tiers: Vec<String>,
    #[serde(alias = "map", deserialize_with = "one_or_many")]
    pub maps: Vec<String>,
    pub search: Option<String>,
    pub style: Option<String>,
    pub edpi_min: Option<f64>,
    pub edpi_max: Option<f64>,
    pub sensitivity_min: Option<f64>,
    pub sensitivity_max: Option<f64>,
    pub dpi_min: Option<f64>,
    pub dpi_max: Option<f64>,
    pub performance_min: Option<f64>,
    pub performance_basis: PerformanceBasis,
    pub maps_min: Option<f64>,
    /// Minimum share of a player's maps spent on the selected agents.
    pub agent_share_min: Option<f64>,
    pub active_days: Option<f64>,
    pub kd_min: Option<f64>,
    pub kd_max: Option<f64>,
    pub kda_min: Option<f64>,
    pub kda_max: Option<f64>,
    pub adr_min: Option<f64>,
    pub adr_max: Option<f64>,
    pub kast_min: Option<f64>,
    pub kast_max: Option<f64>,
    pub hs_min: Option<f64>,
    pub hs_max: Option<f64>,
    pub rating_min: Option<f64>,
    pub rating_max: Option<f64>,
    pub op_share_min: Option<f64>,
    pub op_share_max: Option<f64>,
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
impl Filters {
    /// Clears playstyle labels so a subgroup can borrow strength from its parent cohort.
    pub fn without_playstyle(&self) -> Self {
        Self {
            agents: vec![],
            agent_share_min: None,
            style: None,
            profile: None,
            op_share_min: None,
            op_share_max: None,
            operator_min: None,
            operator_max: None,
            movement_min: None,
            movement_max: None,
            entry_min: None,
            entry_max: None,
            anchor_min: None,
            anchor_max: None,
            utility_min: None,
            utility_max: None,
            ..self.clone()
        }
    }
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
            (f.op_share_min, f.op_share_max, 1.0),
            (f.kd_min, f.kd_max, 10.0),
            (f.kda_min, f.kda_max, 20.0),
            (f.adr_min, f.adr_max, 500.0),
            (f.kast_min, f.kast_max, 1.0),
            (f.hs_min, f.hs_max, 1.0),
            (f.rating_min, f.rating_max, 5.0),
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
        let thresholds = [
            (f.agent_share_min, 1.0, "Invalid agent share threshold"),
            (f.active_days, 100000.0, "Invalid activity window"),
        ];
        for (value, max, message) in thresholds {
            if value.is_some_and(|v| !v.is_finite() || v < 0.0 || v > max) {
                return Err(message.into());
            }
        }
        let lists = [
            &f.roles,
            &f.agents,
            &f.teams,
            &f.regions,
            &f.tournaments,
            &f.tiers,
            &f.maps,
        ];
        if f.years.len() > 100
            || lists
                .iter()
                .any(|l| l.len() > 100 || l.iter().any(|v| v.len() > 200))
        {
            return Err("Too many filter values".into());
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
