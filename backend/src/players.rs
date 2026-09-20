use crate::model::*;
use chrono::{NaiveDate, Utc};
use std::collections::BTreeMap;
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
pub fn build(data: &Dataset, f: &Filters) -> Vec<Player> {
    let mut latest: BTreeMap<String, &Setting> = BTreeMap::new();
    for s in &data.settings {
        let k = s.name.to_lowercase();
        if s.valid() && latest.get(&k).is_none_or(|x| x.observed_at < s.observed_at) {
            latest.insert(k, s);
        }
    }
    latest
        .iter()
        .filter_map(|(id, s)| build_player(id, s, data, f))
        .collect()
}
fn build_player(id: &str, s: &Setting, data: &Dataset, f: &Filters) -> Option<Player> {
    if f.team.as_ref().is_some_and(|t| t != &s.team)
        || f.search.as_ref().is_some_and(|q| {
            !format!("{} {}", s.name, s.team)
                .to_lowercase()
                .contains(&q.to_lowercase())
        })
    {
        return None;
    }
    let events: Vec<EventResult> = data
        .events
        .iter()
        .filter(|e| e.player.to_lowercase() == id)
        .cloned()
        .collect();
    let all: Vec<&Split> = data
        .splits
        .iter()
        .filter(|r| r.player.to_lowercase() == id)
        .collect();
    // Determine primary role before agent filtering so the child stays inside its role parent.
    let context: Vec<&Split> = all
        .iter()
        .copied()
        .filter(|r| {
            f.tournament.as_ref().is_none_or(|t| t == &r.tournament)
                && f.tier.as_ref().is_none_or(|t| t == &r.tier)
                && f.year.is_none_or(|y| y == r.season)
                && f.region.as_ref().is_none_or(|v| v == &r.region)
        })
        .collect();
    let player_role = dominant(&context);
    let rows: Vec<&Split> = context
        .into_iter()
        .filter(|r| {
            f.agent
                .as_ref()
                .is_none_or(|a| a.eq_ignore_ascii_case(&r.agent))
        })
        .collect();
    if rows.is_empty() {
        return None;
    }
    let sum = |getter: fn(&Split) -> f64| rows.iter().map(|r| getter(r)).sum::<f64>();
    let maps = sum(|r| r.maps);
    if maps <= 0.0 {
        return None;
    }
    if f.role.as_ref().is_some_and(|r| r != &player_role) {
        return None;
    }
    let mut usage: BTreeMap<String, f64> = BTreeMap::new();
    for r in &rows {
        *usage.entry(r.agent.clone()).or_default() += r.maps;
    }
    let share = |names: &[&str]| {
        usage
            .iter()
            .filter(|(a, _)| names.contains(&a.as_str()))
            .map(|(_, n)| n)
            .sum::<f64>()
            / maps
    };
    let entry_coverage = fraction(sum(|r| r.perf_rounds), sum(|r| r.rounds));
    let entry = fraction(sum(|r| r.fk + r.fd), sum(|r| r.perf_rounds) * 0.4);
    let op_coverage = fraction(sum(|r| r.op_rounds), sum(|r| r.rounds));
    let op_observed = fraction(sum(|r| r.op_kills), sum(|r| r.op_rounds) * 0.18);
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
            + 0.4 * fraction(sum(|r| r.assists), sum(|r| r.rounds) * 0.45))
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
            1.0 - usage.values().copied().fold(0.0, f64::max) / maps,
        ),
    ]);
    if f.style
        .as_ref()
        .is_some_and(|s| styles.get(s).copied().unwrap_or(0.0) < 0.45)
    {
        return None;
    }
    let n_rating = sum(|r| r.n_rating);
    let rating = (n_rating > 0.0).then(|| sum(|r| r.sum_rating) / n_rating);
    let acs = (sum(|r| r.n_acs) > 0.0).then(|| sum(|r| r.sum_acs) / sum(|r| r.n_acs));
    let performance = rating
        .map(|r| ((r - 0.6) / 0.8).clamp(0.0, 1.0))
        .unwrap_or(0.5);
    let selected_events: Vec<_> = events
        .iter()
        .filter(|e| {
            rows.iter().any(|r| r.tournament == e.tournament)
                && f.year.is_none_or(|y| e.year == y)
                && f.tournament.as_ref().is_none_or(|t| t == &e.tournament)
                && f.tier.as_ref().is_none_or(|t| t == &e.tier)
        })
        .collect();
    let achievement = (!selected_events.is_empty()).then(|| {
        selected_events
            .iter()
            .map(|e| {
                let tier = match e.tier.as_str() {
                    "International" => 1.0,
                    "Regional" => 0.6,
                    _ => 0.3,
                };
                let age = NaiveDate::parse_from_str(&e.date, "%Y-%m-%d")
                    .map(|d| (Utc::now().date_naive() - d).num_days().max(0) as f64)
                    .unwrap_or(730.0);
                tier / (e.placement.max(1) as f64).sqrt() * 2.0f64.powf(-age / 730.0)
            })
            .sum::<f64>()
            / selected_events.len() as f64
    });
    let edpi = s.dpi * s.sensitivity;
    let ranges = [
        (edpi, f.edpi_min, f.edpi_max),
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
    if ranges
        .iter()
        .any(|(v, min, max)| min.is_some_and(|x| *v < x) || max.is_some_and(|x| *v > x))
    {
        return None;
    }
    let last = rows
        .iter()
        .map(|r| r.last_played.clone())
        .max()
        .unwrap_or_default();
    let days = NaiveDate::parse_from_str(&last, "%Y-%m-%d")
        .map(|d| (Utc::now().date_naive() - d).num_days().max(0) as f64)
        .unwrap_or(730.0);
    let setting_age = (Utc::now() - s.observed_at).num_days().max(0) as f64;
    let reliability = s.reliability * (0.7 + 0.3 * fraction(n_rating, maps));
    let recency = 0.2 + 0.8 * 2.0f64.powf(-days / 180.0);
    let fresh = 0.3 + 0.7 * 2.0f64.powf(-setting_age / 180.0);
    let mut weight = (0.5 + performance)
        * (0.75 + 0.5 * achievement.unwrap_or(0.5))
        * (maps / (maps + 30.0)).sqrt()
        * recency
        * reliability
        * fresh;
    if let Some(profile) = &f.profile {
        let dist = m
            .values()
            .iter()
            .zip(profile.values())
            .map(|(a, b)| (a - b).powi(2))
            .sum::<f64>();
        weight *= (-dist / (2.0 * 0.35f64.powi(2))).exp();
    }
    let mut agents: Vec<_> = usage
        .into_iter()
        .map(|(name, n)| AgentUsage {
            name,
            maps: n,
            share: n / maps,
        })
        .collect();
    agents.sort_by(|a, b| b.maps.total_cmp(&a.maps));
    let mut seasons: BTreeMap<i32, Vec<&Split>> = BTreeMap::new();
    for r in &all {
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
    let mut history: Vec<_> = data
        .settings
        .iter()
        .filter(|h| h.name.eq_ignore_ascii_case(&s.name))
        .cloned()
        .collect();
    history.sort_by_key(|h| h.observed_at);
    let mut warnings = vec![];
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
    if achievement.is_none() {
        warnings.push("No verified placement imported; neutral achievement factor.".into())
    }
    if op_coverage < 0.8 {
        warnings.push(format!(
            "Operator coverage {:.0}%; missing portion uses agent evidence.",
            op_coverage * 100.0
        ))
    }
    Some(Player {
        id: id.to_string(),
        name: s.name.clone(),
        team: s.team.clone(),
        role: player_role,
        region,
        country: rows[0].country.clone(),
        agents,
        role_history,
        setting: s.clone(),
        edpi,
        normalized_800: edpi / 800.0,
        performance,
        rating,
        acs,
        achievement,
        maps,
        mechanical,
        styles,
        weight,
        contribution: 0.0,
        reliability,
        last_played: last,
        events,
        history,
        stale: setting_age > 90.0 || s.updated_at.is_none(),
        warnings,
    })
}
