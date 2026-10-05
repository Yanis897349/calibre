use crate::metrics::{self, Reference};
use crate::model::*;
use chrono::{NaiveDate, Utc};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
fn fraction(a: f64, b: f64) -> f64 {
    if b > 0.0 {
        (a / b).clamp(0.0, 1.0)
    } else {
        0.0
    }
}
fn dominant(rows: &[&Split]) -> String {
    let mut counts: BTreeMap<&str, f64> = BTreeMap::new();
    for r in rows {
        *counts.entry(role(&r.agent)).or_default() += r.maps;
    }
    let total = counts.values().sum::<f64>();
    let best = counts.iter().max_by(|a, b| a.1.total_cmp(b.1));
    best.map(|(r, n)| {
        if fraction(*n, total) >= 0.55 {
            r.to_string()
        } else {
            "Flex".into()
        }
    })
    .unwrap_or("Flex".into())
}
fn matches<T: PartialEq>(selected: &[T], value: &T) -> bool {
    selected.is_empty() || selected.contains(value)
}
fn matches_agent(selected: &[String], agent: &str) -> bool {
    selected.is_empty() || selected.iter().any(|a| a.eq_ignore_ascii_case(agent))
}
fn days_since(date: &str) -> f64 {
    NaiveDate::parse_from_str(date, "%Y-%m-%d")
        .map(|d| (Utc::now().date_naive() - d).num_days().max(0) as f64)
        .unwrap_or(730.0)
}

/// Per-dataset lookups, built once per import and shared by every analysis.
pub struct Context {
    data: Arc<Dataset>,
    latest: BTreeMap<String, usize>,
    splits: HashMap<String, Vec<usize>>,
    events: HashMap<String, Vec<usize>>,
    history: HashMap<String, Vec<usize>>,
    reference: Reference,
}

fn group<T>(items: &[T], key: impl Fn(&T) -> String) -> HashMap<String, Vec<usize>> {
    let mut groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, item) in items.iter().enumerate() {
        groups.entry(key(item)).or_default().push(i);
    }
    groups
}

impl Context {
    pub fn new(data: Arc<Dataset>) -> Self {
        let mut latest: BTreeMap<String, usize> = BTreeMap::new();
        for (i, s) in data.settings.iter().enumerate() {
            let k = s.name.to_lowercase();
            if s.valid()
                && latest
                    .get(&k)
                    .is_none_or(|&x| data.settings[x].observed_at < s.observed_at)
            {
                latest.insert(k, i);
            }
        }
        Self {
            latest,
            splits: group(&data.splits, |r| r.player.to_lowercase()),
            events: group(&data.events, |e| e.player.to_lowercase()),
            history: group(&data.settings, |s| s.name.to_lowercase()),
            reference: Reference::new(&data),
            data,
        }
    }

    pub fn data(&self) -> &Dataset {
        &self.data
    }

    fn rows<'a, T>(
        &self,
        index: &HashMap<String, Vec<usize>>,
        items: &'a [T],
        id: &str,
    ) -> Vec<&'a T> {
        index
            .get(id)
            .map_or(vec![], |ix| ix.iter().map(|&i| &items[i]).collect())
    }

    pub fn build(&self, f: &Filters) -> Vec<Player> {
        self.latest
            .iter()
            .filter_map(|(id, &i)| self.player(id, &self.data.settings[i], f))
            .collect()
    }

    fn player(&self, id: &str, s: &Setting, f: &Filters) -> Option<Player> {
        if !matches(&f.teams, &s.team)
            || f.search.as_ref().is_some_and(|q| {
                !format!("{} {}", s.name, s.team)
                    .to_lowercase()
                    .contains(&q.to_lowercase())
            })
        {
            return None;
        }
        let all = self.rows(&self.splits, &self.data.splits, id);
        // Determine primary role before agent filtering so the child stays inside its role parent.
        let context: Vec<&Split> = all
            .iter()
            .copied()
            .filter(|r| {
                matches(&f.tournaments, &r.tournament)
                    && matches(&f.tiers, &r.tier)
                    && matches(&f.years, &r.season)
                    && matches(&f.regions, &r.region)
                    && matches(&f.maps, &r.map)
            })
            .collect();
        let player_role = dominant(&context);
        if !matches(&f.roles, &player_role) {
            return None;
        }
        let rows: Vec<&Split> = context
            .iter()
            .copied()
            .filter(|r| matches_agent(&f.agents, &r.agent))
            .collect();
        let totals = metrics::total(rows.iter().copied());
        if totals.maps <= 0.0 {
            return None;
        }
        let context_maps = context.iter().map(|r| r.maps).sum::<f64>();
        if f.agent_share_min
            .is_some_and(|min| fraction(totals.maps, context_maps) < min)
        {
            return None;
        }
        let profile = Profile::new(&rows, &totals);
        if f.style
            .as_ref()
            .is_some_and(|s| profile.styles.get(s).copied().unwrap_or(0.0) < 0.45)
        {
            return None;
        }
        let stats = metrics::combat(&totals);
        let percentiles = self.reference.percentiles(&totals);
        let performance = metrics::performance(&percentiles, f.performance_basis);
        let edpi = s.dpi * s.sensitivity;
        let last = rows
            .iter()
            .map(|r| r.last_played.clone())
            .max()
            .unwrap_or_default();
        let days = days_since(&last);
        if !passes_ranges(f, s, &profile.mechanical, &stats, performance, totals.maps)
            || f.active_days.is_some_and(|d| days > d)
        {
            return None;
        }
        let events: Vec<EventResult> = self
            .rows(&self.events, &self.data.events, id)
            .into_iter()
            .cloned()
            .collect();
        let achievement = achievement(&events, &rows, f);
        let setting_age = (Utc::now() - s.observed_at).num_days().max(0) as f64;
        let reliability = s.reliability * (0.7 + 0.3 * fraction(totals.n_rating, totals.maps));
        let recency = 0.2 + 0.8 * 2.0f64.powf(-days / 180.0);
        let fresh = 0.3 + 0.7 * 2.0f64.powf(-setting_age / 180.0);
        let mut weight = (0.5 + performance)
            * (0.75 + 0.5 * achievement.unwrap_or(0.5))
            * (totals.maps / (totals.maps + 30.0)).sqrt()
            * recency
            * reliability
            * fresh;
        if let Some(target) = &f.profile {
            let dist = profile
                .mechanical
                .values()
                .iter()
                .zip(target.values())
                .map(|(a, b)| (a - b).powi(2))
                .sum::<f64>();
            weight *= (-dist / (2.0 * 0.35f64.powi(2))).exp();
        }
        let mut seasons: BTreeMap<i32, Vec<&Split>> = BTreeMap::new();
        for &r in &all {
            seasons.entry(r.season).or_default().push(r);
        }
        let role_history = seasons
            .into_iter()
            .map(|(y, r)| (y, dominant(&r)))
            .collect();
        let region = rows
            .iter()
            .filter(|r| r.region != "International")
            .max_by_key(|r| r.season)
            .or_else(|| rows.first())
            .map(|r| r.region.clone())
            .unwrap_or_default();
        let mut history: Vec<Setting> = self
            .rows(&self.history, &self.data.settings, id)
            .into_iter()
            .cloned()
            .collect();
        history.sort_by_key(|h| h.observed_at);
        let warnings = warnings(s, &totals, &stats, achievement.is_none());
        Some(Player {
            id: id.to_string(),
            name: s.name.clone(),
            team: s.team.clone(),
            role: player_role,
            region,
            country: rows[0].country.clone(),
            agents: profile.agents,
            map_pool: map_pool(&rows, totals.maps),
            role_history,
            setting: s.clone(),
            edpi,
            normalized_800: edpi / 800.0,
            performance,
            percentiles,
            rating: stats.rating,
            acs: stats.acs,
            stats,
            achievement,
            maps: totals.maps,
            mechanical: profile.mechanical,
            styles: profile.styles,
            weight,
            contribution: 0.0,
            reliability,
            last_played: last,
            events,
            history,
            // A missing publisher date is reported in warnings; every bundled setting lacks one.
            stale: setting_age > 90.0,
            warnings,
            totals,
        })
    }
}

#[cfg(test)]
pub fn build(data: &Dataset, f: &Filters) -> Vec<Player> {
    Context::new(Arc::new(data.clone())).build(f)
}

struct Profile {
    agents: Vec<Usage>,
    mechanical: Mechanical,
    styles: BTreeMap<String, f64>,
}

impl Profile {
    fn new(rows: &[&Split], t: &Split) -> Self {
        let agents = metrics::usage(rows.iter().map(|r| (r.agent.clone(), r.maps)));
        let share = |names: &[&str]| {
            agents
                .iter()
                .filter(|a| names.contains(&a.name.as_str()))
                .map(|a| a.share)
                .sum::<f64>()
        };
        let entry = fraction(t.fk + t.fd, t.perf_rounds * 0.4);
        let op_coverage = fraction(t.op_rounds, t.rounds);
        // A dedicated Operator player lands roughly a third of kills with it. Data stored
        // before kill-matrix totals were imported falls back to Operator kills per round.
        let op_observed = if t.km_kills > 0.0 {
            fraction(t.op_kills, t.km_kills * 0.35)
        } else {
            fraction(t.op_kills, t.op_rounds * 0.18)
        };
        let movement = 0.8 * share(&["raze", "neon", "jett", "waylay"]) + 0.2 * entry;
        let mechanical = Mechanical {
            operator: op_coverage * op_observed
                + (1.0 - op_coverage) * share(&["jett", "chamber"]) * 0.6,
            movement,
            entry,
            anchor: (0.8
                * share(&[
                    "cypher", "killjoy", "vyse", "viper", "astra", "deadlock", "veto",
                ])
                + 0.2 * (1.0 - entry))
                .clamp(0.0, 1.0),
            utility: (0.6
                * share(&[
                    "sova",
                    "breach",
                    "skye",
                    "kayo",
                    "fade",
                    "gekko",
                    "omen",
                    "astra",
                    "brimstone",
                    "harbor",
                    "tejo",
                ])
                + 0.4 * fraction(t.assists, t.rounds * 0.45))
            .clamp(0.0, 1.0),
        };
        let m = &mechanical;
        let styles = BTreeMap::from([
            ("Operator-heavy".into(), m.operator),
            ("Movement-heavy".into(), m.movement),
            ("Anchor-lurk".into(), m.anchor),
            ("Rifle-entry".into(), m.entry * (1.0 - m.operator)),
            (
                "Aggressive-hybrid".into(),
                (m.entry + m.movement + m.operator) / 3.0,
            ),
            ("Utility-heavy".into(), m.utility),
            (
                "Flexible".into(),
                1.0 - agents.first().map_or(0.0, |a| a.share),
            ),
        ]);
        Self {
            agents,
            mechanical,
            styles,
        }
    }
}

fn passes_ranges(
    f: &Filters,
    s: &Setting,
    m: &Mechanical,
    stats: &CombatStats,
    performance: f64,
    maps: f64,
) -> bool {
    let ranges = [
        (s.dpi * s.sensitivity, f.edpi_min, f.edpi_max),
        (s.sensitivity, f.sensitivity_min, f.sensitivity_max),
        (s.dpi, f.dpi_min, f.dpi_max),
        (performance, f.performance_min, None),
        (maps, f.maps_min, None),
        (m.operator, f.operator_min, f.operator_max),
        (m.movement, f.movement_min, f.movement_max),
        (m.entry, f.entry_min, f.entry_max),
        (m.anchor, f.anchor_min, f.anchor_max),
        (m.utility, f.utility_min, f.utility_max),
    ];
    // Unreported statistics never satisfy an explicit threshold.
    let observed = [
        (stats.kd, f.kd_min, f.kd_max),
        (stats.kda, f.kda_min, f.kda_max),
        (stats.adr, f.adr_min, f.adr_max),
        (stats.kast, f.kast_min, f.kast_max),
        (stats.hs, f.hs_min, f.hs_max),
        (stats.rating, f.rating_min, f.rating_max),
        (stats.op_kill_share, f.op_share_min, f.op_share_max),
    ];
    let outside = |v: f64, min: Option<f64>, max: Option<f64>| {
        min.is_some_and(|x| v < x) || max.is_some_and(|x| v > x)
    };
    !ranges.iter().any(|(v, min, max)| outside(*v, *min, *max))
        && !observed.iter().any(|(v, min, max)| match v {
            Some(v) => outside(*v, *min, *max),
            None => min.is_some() || max.is_some(),
        })
}

fn achievement(events: &[EventResult], rows: &[&Split], f: &Filters) -> Option<f64> {
    let selected: Vec<_> = events
        .iter()
        .filter(|e| {
            rows.iter().any(|r| r.tournament == e.tournament)
                && matches(&f.years, &e.year)
                && matches(&f.tournaments, &e.tournament)
                && matches(&f.tiers, &e.tier)
        })
        .collect();
    (!selected.is_empty()).then(|| {
        selected
            .iter()
            .map(|e| {
                let tier = match e.tier.as_str() {
                    "International" => 1.0,
                    "Regional" => 0.6,
                    _ => 0.3,
                };
                tier / (e.placement.max(1) as f64).sqrt()
                    * 2.0f64.powf(-days_since(&e.date) / 730.0)
            })
            .sum::<f64>()
            / selected.len() as f64
    })
}

fn map_pool(rows: &[&Split], maps: f64) -> Vec<MapUsage> {
    let mut by_map: BTreeMap<&str, Split> = BTreeMap::new();
    for r in rows {
        metrics::absorb(by_map.entry(r.map.as_str()).or_default(), r);
    }
    let mut pool: Vec<_> = by_map
        .into_iter()
        .filter(|(name, _)| !name.is_empty())
        .map(|(name, t)| {
            let stats = metrics::combat(&t);
            MapUsage {
                name: name.to_string(),
                maps: t.maps,
                share: t.maps / maps,
                kd: stats.kd,
                rating: stats.rating,
            }
        })
        .collect();
    pool.sort_by(|a, b| b.maps.total_cmp(&a.maps));
    pool
}

fn warnings(s: &Setting, t: &Split, stats: &CombatStats, no_achievement: bool) -> Vec<String> {
    let mut warnings = vec![];
    let entry_coverage = fraction(t.perf_rounds, t.rounds);
    if entry_coverage < 0.8 {
        warnings.push(format!(
            "Opening-duel coverage {:.0}%; entry and anchor estimates have limited evidence.",
            entry_coverage * 100.0
        ))
    }
    if s.updated_at.is_none() {
        warnings.push(
            "Publisher update date unknown; observation time is not the setting change date."
                .into(),
        )
    }
    if no_achievement {
        warnings.push("No verified placement imported; neutral achievement factor.".into())
    }
    let op_coverage = fraction(t.op_rounds, t.rounds);
    if op_coverage < 0.8 {
        warnings.push(format!(
            "Operator coverage {:.0}%; missing portion uses agent evidence.",
            op_coverage * 100.0
        ))
    }
    if stats.kd.is_none() {
        warnings
            .push("Kill/death data unavailable for this sample; re-import competitive data.".into())
    }
    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn multiple_agents_pool_their_maps() {
        let d = crate::sources::seed().unwrap();
        let ctx = Context::new(Arc::new(d));
        let pick = |agents: &[&str]| {
            ctx.build(&Filters {
                agents: agents.iter().map(|a| a.to_string()).collect(),
                ..Default::default()
            })
        };
        let jett = pick(&["jett"]);
        let raze = pick(&["raze"]);
        let both = pick(&["jett", "raze"]);
        assert!(both.len() >= jett.len().max(raze.len()));
        for p in &both {
            assert!(
                p.agents
                    .iter()
                    .all(|a| a.name == "jett" || a.name == "raze")
            );
            let expected = jett
                .iter()
                .chain(&raze)
                .filter(|q| q.id == p.id)
                .map(|q| q.maps)
                .sum::<f64>();
            assert_eq!(p.maps, expected);
        }
    }

    #[test]
    fn agent_share_keeps_specialists() {
        let d = crate::sources::seed().unwrap();
        let f = Filters {
            agents: vec!["jett".into()],
            agent_share_min: Some(0.6),
            ..Default::default()
        };
        let specialists = build(&d, &f);
        let everyone = build(&d, &Filters::default());
        assert!(!specialists.is_empty());
        for p in specialists {
            let career = everyone.iter().find(|q| q.id == p.id).unwrap();
            assert!(p.maps / career.maps >= 0.6 - 1e-9);
        }
    }

    #[test]
    fn stat_thresholds_exclude_missing_and_low_values() {
        let d = crate::sources::seed().unwrap();
        let f = Filters {
            kd_min: Some(1.1),
            hs_min: Some(0.25),
            ..Default::default()
        };
        let selected = build(&d, &f);
        assert!(!selected.is_empty());
        assert!(
            selected
                .iter()
                .all(|p| p.stats.kd.unwrap() >= 1.1 && p.stats.hs.unwrap() >= 0.25)
        );
    }

    #[test]
    fn map_filter_restricts_pool() {
        let d = crate::sources::seed().unwrap();
        let selected = build(
            &d,
            &Filters {
                maps: vec!["Ascent".into(), "Bind".into()],
                ..Default::default()
            },
        );
        assert!(!selected.is_empty());
        for p in selected {
            assert!(
                p.map_pool
                    .iter()
                    .all(|m| m.name == "Ascent" || m.name == "Bind")
            );
            assert!((p.map_pool.iter().map(|m| m.share).sum::<f64>() - 1.0).abs() < 1e-9);
        }
    }

    #[test]
    fn legacy_single_value_filters_still_parse() {
        let f: Filters = serde_json::from_value(serde_json::json!({
            "role": "Duelist",
            "agent": "jett",
            "year": 2025,
            "maps": ["Ascent"],
            "performance_basis": "kd"
        }))
        .unwrap();
        assert_eq!(f.roles, vec!["Duelist"]);
        assert_eq!(f.agents, vec!["jett"]);
        assert_eq!(f.years, vec![2025]);
        assert_eq!(f.maps, vec!["Ascent"]);
        assert_eq!(f.performance_basis, PerformanceBasis::Kd);
        let empty: Filters = serde_json::from_value(serde_json::json!({"agent": null})).unwrap();
        assert!(empty.agents.is_empty());
    }

    #[test]
    fn operator_score_survives_legacy_rows() {
        let legacy = Split {
            agent: "jett".into(),
            maps: 10.0,
            rounds: 220.0,
            op_rounds: 220.0,
            op_kills: 40.0,
            ..Default::default()
        };
        let profile = Profile::new(&[&legacy], &legacy);
        assert!(profile.mechanical.operator > 0.9);
    }

    #[test]
    fn combat_stats_are_reported() {
        let d = crate::sources::seed().unwrap();
        let players = build(&d, &Filters::default());
        let with_kd = players.iter().filter(|p| p.stats.kd.is_some()).count();
        assert!(with_kd * 10 >= players.len() * 9);
        assert!(players.iter().all(|p| (0.0..=1.0).contains(&p.performance)));
        assert!(
            players
                .iter()
                .any(|p| p.stats.op_kill_share.is_some_and(|s| s > 0.2))
        );
    }
}
