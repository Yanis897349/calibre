use crate::{model::*, players};
use rand::{Rng, SeedableRng, rngs::StdRng};
use serde::Serialize;

const GRID_SIZE: usize = 241;
#[derive(Clone, Serialize)]
pub struct Point {
    pub edpi: f64,
    pub density: f64,
    pub raw: f64,
    pub parent: f64,
}
#[derive(Clone, Serialize)]
pub struct Bin {
    pub edpi: f64,
    pub weight: f64,
    pub count: usize,
}
#[derive(Clone, Serialize)]
pub struct Summary {
    pub peak: f64,
    pub raw_peak: f64,
    pub median: f64,
    pub range: [f64; 2],
    pub confidence: Option<[f64; 2]>,
    pub secondary_peaks: Vec<f64>,
    pub sample_size: usize,
    pub effective_sample: f64,
    pub bandwidth: f64,
    pub subgroup_share: f64,
    pub parent_size: usize,
    pub normalized: f64,
    pub normalized_800: f64,
    pub confidence_label: String,
}
#[derive(Clone, Serialize)]
pub struct Comparison {
    pub name: String,
    pub count: usize,
    pub peak: Option<f64>,
    pub density: Vec<f64>,
}
#[derive(Serialize)]
pub struct Analysis {
    pub summary: Option<Summary>,
    pub density: Vec<Point>,
    pub histogram: Vec<Bin>,
    pub players: Vec<Player>,
    pub roles: Vec<Comparison>,
    pub styles: Vec<Comparison>,
    pub warnings: Vec<String>,
    pub dpi: f64,
    pub total_players: usize,
    pub model_version: &'static str,
}
fn effective(v: &[(f64, f64)]) -> f64 {
    let total = v.iter().map(|p| p.1).sum::<f64>();
    total * total / v.iter().map(|p| p.1 * p.1).sum::<f64>().max(1e-30)
}
fn quantile(v: &[(f64, f64)], q: f64) -> f64 {
    let mut sorted = v.to_vec();
    sorted.sort_by(|a, b| a.0.total_cmp(&b.0));
    let target = sorted.iter().map(|p| p.1).sum::<f64>() * q;
    let mut accum = 0.0;
    for (x, w) in &sorted {
        accum += w;
        if accum >= target {
            return *x;
        }
    }
    sorted.last().map(|p| p.0).unwrap_or(0.0)
}
fn bandwidth(v: &[(f64, f64)]) -> f64 {
    let n = effective(v);
    let total = v.iter().map(|p| p.1).sum::<f64>();
    let mean = v.iter().map(|p| p.0 * p.1).sum::<f64>() / total;
    let sd = (v.iter().map(|p| p.1 * (p.0 - mean).powi(2)).sum::<f64>() / total).sqrt();
    let robust = (quantile(v, 0.75) - quantile(v, 0.25)) / 1.34;
    let spread = if robust > 0.0 { sd.min(robust) } else { sd };
    (0.9 * spread * n.powf(-0.2)).clamp(8.0, 150.0)
}
fn kde(v: &[(f64, f64)], grid: &[f64], h: f64) -> Vec<f64> {
    let sum = v.iter().map(|p| p.1).sum::<f64>();
    grid.iter()
        .map(|x| {
            v.iter()
                .map(|(mu, w)| {
                    w * ((-0.5 * ((x - mu) / h).powi(2)).exp()
                        + (-0.5 * ((x + mu) / h).powi(2)).exp())
                })
                .sum::<f64>()
                / (sum * h * (2.0 * std::f64::consts::PI).sqrt())
        })
        .collect()
}
fn peak(grid: &[f64], d: &[f64]) -> f64 {
    grid[d
        .iter()
        .enumerate()
        .max_by(|a, b| a.1.total_cmp(b.1))
        .map(|(i, _)| i)
        .unwrap_or(0)]
}
// Cap normalized influence with water filling: <=10% where n>=10, <=1/n otherwise.
pub fn cap(players: &mut [Player]) {
    if players.is_empty() {
        return;
    }
    let ceiling = (1.0 / players.len() as f64).max(0.10);
    let weights: Vec<f64> = players.iter().map(|p| p.weight.max(1e-15)).collect();
    let mut fixed = vec![false; players.len()];
    let mut out = vec![0.0; players.len()];
    let mut remaining = 1.0;
    loop {
        let total = weights
            .iter()
            .enumerate()
            .filter(|(i, _)| !fixed[*i])
            .map(|(_, w)| w)
            .sum::<f64>();
        let mut changed = false;
        for i in 0..players.len() {
            if !fixed[i] && weights[i] / total * remaining > ceiling + 1e-12 {
                out[i] = ceiling;
                fixed[i] = true;
                changed = true;
            }
        }
        if !changed {
            for i in 0..players.len() {
                if !fixed[i] {
                    out[i] = weights[i] / total * remaining;
                }
            }
            break;
        }
        remaining = 1.0 - out.iter().sum::<f64>();
        if fixed.iter().all(|v| *v) {
            break;
        }
    }
    for (p, w) in players.iter_mut().zip(out) {
        p.contribution = w;
    }
}
fn values(p: &[Player]) -> Vec<(f64, f64)> {
    p.iter().map(|p| (p.edpi, p.contribution)).collect()
}
fn resample(v: &[(f64, f64)], rng: &mut StdRng) -> Vec<(f64, f64)> {
    // Uniform player bootstrap; retain analytic weights (avoid applying weights twice).
    (0..v.len())
        .map(|_| v[rng.random_range(0..v.len())])
        .collect()
}
fn comparison(name: &str, mut p: Vec<Player>, grid: &[f64]) -> Comparison {
    cap(&mut p);
    if p.is_empty() {
        return Comparison {
            name: name.into(),
            count: 0,
            peak: None,
            density: vec![0.0; grid.len()],
        };
    }
    let v = values(&p);
    let d = kde(&v, grid, bandwidth(&v));
    Comparison {
        name: name.into(),
        count: p.len(),
        peak: Some(peak(grid, &d)),
        density: d,
    }
}
pub fn analyze(data: &Dataset, request: &AnalysisRequest) -> Analysis {
    let f = &request.filters;
    let all = players::build(data, &Filters::default());
    let mut selected = players::build(data, f);
    cap(&mut selected);
    selected.sort_by(|a, b| b.contribution.total_cmp(&a.contribution));
    // Keep time, region, team, performance, and sensitivity constraints in the parent.
    // Relax mechanical/agent/role labels only; a role subgroup borrows from that role, a role itself from all roles.
    let mut parent_filters = f.clone();
    parent_filters.agent = None;
    parent_filters.style = None;
    parent_filters.profile = None;
    parent_filters.operator_min = None;
    parent_filters.operator_max = None;
    parent_filters.movement_min = None;
    parent_filters.movement_max = None;
    parent_filters.entry_min = None;
    parent_filters.entry_max = None;
    parent_filters.anchor_min = None;
    parent_filters.anchor_max = None;
    parent_filters.utility_min = None;
    parent_filters.utility_max = None;
    let mut parent = players::build(data, &parent_filters);
    if parent.len() == selected.len() {
        parent_filters.role = None;
        parent = players::build(data, &parent_filters);
    }
    cap(&mut parent);
    let max = all.iter().map(|p| p.edpi).fold(600.0, f64::max);
    let grid: Vec<f64> = (0..GRID_SIZE)
        .map(|i| i as f64 * (max + 80.0) / (GRID_SIZE - 1) as f64)
        .collect();
    let mut comp_filters = f.clone();
    comp_filters.role = None;
    comp_filters.style = None;
    let comp_players = players::build(data, &comp_filters);
    let roles = ["Duelist", "Initiator", "Controller", "Sentinel", "Flex"]
        .iter()
        .map(|r| {
            comparison(
                r,
                comp_players
                    .iter()
                    .filter(|p| p.role == *r)
                    .cloned()
                    .collect(),
                &grid,
            )
        })
        .collect();
    let styles = [
        "Operator-heavy",
        "Movement-heavy",
        "Anchor-lurk",
        "Rifle-entry",
        "Aggressive-hybrid",
        "Utility-heavy",
        "Flexible",
    ]
    .iter()
    .map(|r| {
        comparison(
            r,
            comp_players
                .iter()
                .filter(|p| p.styles.get(*r).copied().unwrap_or(0.0) >= 0.45)
                .cloned()
                .collect(),
            &grid,
        )
    })
    .collect();
    let mut response = Analysis {
        summary: None,
        density: vec![],
        histogram: vec![],
        players: selected,
        roles,
        styles,
        warnings: vec![],
        dpi: request.dpi,
        total_players: all.len(),
        model_version: "1.0.0",
    };
    if response.players.is_empty() {
        response.warnings.push(
            "No players match these filters. Broaden the cohort to estimate a recommendation."
                .into(),
        );
        return response;
    }
    let v = values(&response.players);
    let pv = values(&parent);
    let h = bandwidth(&v);
    let n = effective(&v);
    let raw = kde(&v, &grid, h);
    let pd = if pv.is_empty() {
        raw.clone()
    } else {
        kde(&pv, &grid, bandwidth(&pv))
    };
    let is_subgroup = parent.len() > response.players.len() || f.profile.is_some();
    let alpha = if is_subgroup { n / (n + 12.0) } else { 1.0 };
    let density: Vec<f64> = raw
        .iter()
        .zip(&pd)
        .map(|(a, b)| alpha * a + (1.0 - alpha) * b)
        .collect();
    let recommended = peak(&grid, &density);
    let confidence = if n >= 5.0 {
        let mut rng = StdRng::seed_from_u64(81731);
        let mut estimates = Vec::with_capacity(160);
        for _ in 0..160 {
            let boot = resample(&v, &mut rng);
            let d = kde(&boot, &grid, h);
            let pb = if pv.is_empty() {
                d.clone()
            } else {
                kde(&resample(&pv, &mut rng), &grid, bandwidth(&pv))
            };
            let mix: Vec<_> = d
                .iter()
                .zip(pb)
                .map(|(a, b)| alpha * a + (1.0 - alpha) * b)
                .collect();
            estimates.push(peak(&grid, &mix));
        }
        estimates.sort_by(f64::total_cmp);
        Some([estimates[4], estimates[155]])
    } else {
        None
    };
    let peak_height = density.iter().copied().fold(0.0, f64::max);
    let secondary_peaks = (1..grid.len() - 1)
        .filter(|&i| {
            density[i] > density[i - 1]
                && density[i] >= density[i + 1]
                && density[i] > peak_height * 0.2
                && (grid[i] - recommended).abs() > h
        })
        .map(|i| grid[i])
        .collect();
    if n < 10.0 {
        response.warnings.push(
            "Small effective sample: exploratory estimate, not a precise recommendation.".into(),
        )
    }
    response.warnings.push("Professional settings show association, not the sensitivity that will maximize your performance. Current settings are paired with historical competitive data; historical use is not implied.".into());
    response.summary = Some(Summary {
        peak: recommended,
        raw_peak: peak(&grid, &raw),
        median: quantile(&v, 0.5),
        range: [quantile(&v, 0.10), quantile(&v, 0.90)],
        confidence,
        secondary_peaks,
        sample_size: v.len(),
        effective_sample: n,
        bandwidth: h,
        subgroup_share: alpha,
        parent_size: parent.len(),
        normalized: recommended / request.dpi,
        normalized_800: recommended / 800.0,
        confidence_label: "95% player bootstrap interval for regularized KDE peak (160 replicates)"
            .into(),
    });
    response.density = grid
        .iter()
        .enumerate()
        .map(|(i, x)| Point {
            edpi: *x,
            density: density[i],
            raw: raw[i],
            parent: pd[i],
        })
        .collect();
    let width = (max + 80.0) / 24.0;
    response.histogram = (0..24)
        .map(|i| {
            let lo = i as f64 * width;
            let items: Vec<_> = v
                .iter()
                .filter(|(x, _)| *x >= lo && *x < lo + width)
                .collect();
            Bin {
                edpi: lo + width / 2.0,
                weight: items.iter().map(|p| p.1).sum(),
                count: items.len(),
            }
        })
        .collect();
    response
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn weighted_median_resists_outlier() {
        assert_eq!(quantile(&[(200., 1.), (220., 1.), (1000., 0.1)], 0.5), 220.);
    }
    #[test]
    fn kde_finds_dominant_cluster() {
        let v = vec![(200., 1.), (210., 1.), (220., 1.), (800., 0.1)];
        let grid: Vec<_> = (0..1000).map(|x| x as f64).collect();
        let d = kde(&v, &grid, bandwidth(&v));
        assert!((peak(&grid, &d) - 210.).abs() < 15.);
        let integral = d.iter().sum::<f64>();
        assert!((integral - 1.).abs() < 0.01);
    }
    #[test]
    fn equal_values_have_finite_bandwidth() {
        assert_eq!(bandwidth(&[(200., 1.), (200., 1.)]), 8.);
    }
    #[test]
    fn bootstrap_is_reproducible() {
        let v = vec![(200., 1.), (400., 0.5)];
        assert_eq!(
            resample(&v, &mut StdRng::seed_from_u64(1)),
            resample(&v, &mut StdRng::seed_from_u64(1))
        );
    }
    #[test]
    fn dpi_and_range_validation() {
        let mut r = AnalysisRequest {
            dpi: 0.,
            filters: Filters::default(),
        };
        assert!(r.validate().is_err());
        r.dpi = 800.;
        r.filters.anchor_min = Some(0.8);
        r.filters.anchor_max = Some(0.2);
        assert!(r.validate().is_err());
    }
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    #[test]
    fn normalization_never_changes_model() {
        let d = crate::sources::seed().unwrap();
        let a = analyze(
            &d,
            &AnalysisRequest {
                dpi: 800.0,
                filters: Filters::default(),
            },
        );
        let b = analyze(
            &d,
            &AnalysisRequest {
                dpi: 1600.0,
                filters: Filters::default(),
            },
        );
        let sa = a.summary.unwrap();
        let sb = b.summary.unwrap();
        assert_eq!(sa.peak, sb.peak);
        assert_eq!(sa.confidence, sb.confidence);
        assert_eq!(sa.normalized, sb.normalized * 2.0);
        assert!((a.histogram.iter().map(|x| x.weight).sum::<f64>() - 1.0).abs() < 1e-8);
    }
    #[test]
    fn influence_is_capped_and_finite() {
        let d = crate::sources::seed().unwrap();
        let mut players = players::build(&d, &Filters::default());
        players[0].weight = 10000.;
        cap(&mut players);
        assert!(
            players
                .iter()
                .all(|p| p.contribution.is_finite() && p.contribution <= 0.100001)
        );
        assert!((players.iter().map(|p| p.contribution).sum::<f64>() - 1.).abs() < 1e-8);
    }
    #[test]
    fn tournament_filter_restricts_maps() {
        let d = crate::sources::seed().unwrap();
        let all = players::build(&d, &Filters::default());
        let event = d.events.first().unwrap().tournament.clone();
        let f = Filters {
            tournament: Some(event.clone()),
            ..Default::default()
        };
        let selected = players::build(&d, &f);
        assert!(!selected.is_empty());
        for p in selected {
            let expected: f64 = d
                .splits
                .iter()
                .filter(|r| r.player.eq_ignore_ascii_case(&p.name) && r.tournament == event)
                .map(|r| r.maps)
                .sum();
            assert_eq!(p.maps, expected);
            assert!(p.maps <= all.iter().find(|x| x.id == p.id).unwrap().maps);
        }
    }
    #[test]
    fn empty_and_small_cohorts_do_not_claim_certainty() {
        let d = crate::sources::seed().unwrap();
        let empty = analyze(
            &d,
            &AnalysisRequest {
                dpi: 800.,
                filters: Filters {
                    search: Some("zz_not_a_player_zz".into()),
                    ..Default::default()
                },
            },
        );
        assert!(empty.summary.is_none());
        let one = analyze(
            &d,
            &AnalysisRequest {
                dpi: 800.,
                filters: Filters {
                    search: Some("aspas".into()),
                    ..Default::default()
                },
            },
        );
        assert!(one.summary.unwrap().confidence.is_none());
    }
    #[test]
    fn agent_subgroups_stay_inside_role_parent() {
        let d = crate::sources::seed().unwrap();
        let parent = players::build(
            &d,
            &Filters {
                role: Some("Sentinel".into()),
                ..Default::default()
            },
        );
        let child = players::build(
            &d,
            &Filters {
                role: Some("Sentinel".into()),
                agent: Some("chamber".into()),
                ..Default::default()
            },
        );
        for p in child {
            assert!(parent.iter().any(|q| q.id == p.id));
        }
    }
}
