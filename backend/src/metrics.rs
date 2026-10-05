use crate::model::*;
use std::collections::{BTreeMap, HashMap};

macro_rules! absorb_fields {
    ($target:expr, $source:expr, $($field:ident),+ $(,)?) => {
        $($target.$field += $source.$field;)+
    };
}

/// Pools the additive counters of source rows; labels are left untouched.
pub fn total<'a>(rows: impl IntoIterator<Item = &'a Split>) -> Split {
    let mut t = Split::default();
    for r in rows {
        absorb(&mut t, r);
    }
    t
}

pub fn absorb(t: &mut Split, r: &Split) {
    absorb_fields!(
        t,
        r,
        maps,
        rounds,
        kills,
        deaths,
        assists,
        stat_rounds,
        fk,
        fd,
        op_kills,
        op_deaths,
        km_kills,
        km_deaths,
        perf_rounds,
        op_rounds,
        sum_adr,
        adr_rounds,
        sum_kast,
        kast_rounds,
        sum_hs,
        hs_rounds,
        multi_kills,
        clutches,
        multi_rounds,
        plants,
        defuses,
        objective_rounds,
        sum_rating,
        n_rating,
        sum_acs,
        n_acs,
    );
}

/// Maps played per name (agent or map), most played first; shares sum to one.
pub fn usage(entries: impl IntoIterator<Item = (String, f64)>) -> Vec<Usage> {
    let mut counts: BTreeMap<String, f64> = BTreeMap::new();
    for (name, maps) in entries {
        *counts.entry(name).or_default() += maps;
    }
    let total = counts.values().sum::<f64>();
    let mut out: Vec<_> = counts
        .into_iter()
        .map(|(name, maps)| Usage {
            name,
            maps,
            share: ratio(maps, total).unwrap_or(0.0),
        })
        .collect();
    out.sort_by(|a, b| b.maps.total_cmp(&a.maps));
    out
}

fn ratio(num: f64, den: f64) -> Option<f64> {
    (den > 0.0).then(|| num / den)
}

fn covered(coverage: f64, num: f64, den: f64) -> Option<f64> {
    if coverage > 0.0 {
        ratio(num, den)
    } else {
        None
    }
}

pub fn combat(t: &Split) -> CombatStats {
    let r = t.stat_rounds;
    CombatStats {
        rounds: t.rounds,
        kills: t.kills,
        deaths: t.deaths,
        assists: t.assists,
        // A deathless sample has an undefined ratio; report it as missing rather than infinite.
        kd: covered(r, t.kills, t.deaths),
        kda: covered(r, t.kills + t.assists, t.deaths),
        kpr: ratio(t.kills, r),
        dpr: ratio(t.deaths, r),
        apr: ratio(t.assists, r),
        adr: ratio(t.sum_adr, t.adr_rounds),
        kast: ratio(t.sum_kast / 100.0, t.kast_rounds),
        hs: ratio(t.sum_hs / 100.0, t.hs_rounds),
        fk_per_round: ratio(t.fk, t.perf_rounds),
        fd_per_round: ratio(t.fd, t.perf_rounds),
        opening_success: covered(t.perf_rounds, t.fk, t.fk + t.fd),
        multi_kill_rate: ratio(t.multi_kills, t.multi_rounds),
        clutches_per_100: ratio(t.clutches * 100.0, t.multi_rounds),
        plants_per_100: ratio(t.plants * 100.0, t.objective_rounds),
        defuses_per_100: ratio(t.defuses * 100.0, t.objective_rounds),
        op_kills: t.op_kills,
        km_kills: t.km_kills,
        op_kill_share: covered(t.op_rounds, t.op_kills, t.km_kills),
        op_death_share: covered(t.op_rounds, t.op_deaths, t.km_deaths),
        op_kills_per_round: ratio(t.op_kills, t.op_rounds),
        rating: ratio(t.sum_rating, t.n_rating),
        acs: ratio(t.sum_acs, t.n_acs),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Metric {
    Rating,
    Kd,
    Kda,
    Adr,
    Kast,
    Hs,
    Acs,
}

/// Composite weights: overall rating first, then damage, aim, and survival.
const COMPOSITE: [(Metric, f64); 6] = [
    (Metric::Rating, 0.30),
    (Metric::Adr, 0.20),
    (Metric::Hs, 0.15),
    (Metric::Kd, 0.15),
    (Metric::Kda, 0.10),
    (Metric::Kast, 0.10),
];

impl Metric {
    pub const ALL: [Metric; 7] = [
        Metric::Rating,
        Metric::Kd,
        Metric::Kda,
        Metric::Adr,
        Metric::Kast,
        Metric::Hs,
        Metric::Acs,
    ];

    pub fn key(self) -> &'static str {
        match self {
            Metric::Rating => "rating",
            Metric::Kd => "kd",
            Metric::Kda => "kda",
            Metric::Adr => "adr",
            Metric::Kast => "kast",
            Metric::Hs => "hs",
            Metric::Acs => "acs",
        }
    }

    /// Numerator, denominator, and evidence (in prior units) for the metric.
    fn parts(self, t: &Split) -> (f64, f64, f64) {
        match self {
            Metric::Rating => (t.sum_rating, t.n_rating, t.n_rating),
            Metric::Acs => (t.sum_acs, t.n_acs, t.n_acs),
            Metric::Kd => (t.kills, t.deaths, t.stat_rounds),
            Metric::Kda => (t.kills + t.assists, t.deaths, t.stat_rounds),
            Metric::Adr => (t.sum_adr, t.adr_rounds, t.adr_rounds),
            Metric::Kast => (t.sum_kast, t.kast_rounds, t.kast_rounds),
            Metric::Hs => (t.sum_hs, t.hs_rounds, t.hs_rounds),
        }
    }

    /// Pseudo-evidence of league-average play: ten maps, or roughly ten maps of rounds.
    fn prior(self) -> f64 {
        match self {
            Metric::Rating | Metric::Acs => 10.0,
            _ => 220.0,
        }
    }
}

/// Population reference: pooled league rates for shrinkage and career values for percentiles.
pub struct Reference {
    league: Split,
    sorted: BTreeMap<Metric, Vec<f64>>,
}

impl Reference {
    pub fn new(data: &Dataset) -> Self {
        let league = total(&data.splits);
        let mut careers: HashMap<String, Split> = HashMap::new();
        for r in &data.splits {
            absorb(careers.entry(r.player.to_lowercase()).or_default(), r);
        }
        let mut reference = Self {
            league,
            sorted: BTreeMap::new(),
        };
        for metric in Metric::ALL {
            let mut values: Vec<f64> = careers
                .values()
                .filter_map(|t| reference.shrunk(metric, t))
                .collect();
            values.sort_by(f64::total_cmp);
            reference.sorted.insert(metric, values);
        }
        reference
    }

    /// Empirical-Bayes estimate: small samples are pulled toward the league rate.
    pub fn shrunk(&self, metric: Metric, t: &Split) -> Option<f64> {
        let (num, den, evidence) = metric.parts(t);
        let (league_num, league_den, league_evidence) = metric.parts(&self.league);
        if evidence <= 0.0 || league_evidence <= 0.0 {
            return None;
        }
        let k = metric.prior() / league_evidence;
        ratio(num + k * league_num, den + k * league_den)
    }

    /// Mid-rank percentile of a value among all professionals' career estimates.
    pub fn percentile(&self, metric: Metric, value: f64) -> f64 {
        let Some(values) = self.sorted.get(&metric).filter(|v| !v.is_empty()) else {
            return 0.5;
        };
        let below = values.partition_point(|v| *v < value);
        let not_above = values.partition_point(|v| *v <= value);
        (below + not_above) as f64 / (2 * values.len()) as f64
    }

    pub fn percentiles(&self, t: &Split) -> BTreeMap<String, f64> {
        Metric::ALL
            .iter()
            .filter_map(|m| {
                self.shrunk(*m, t)
                    .map(|v| (m.key().to_string(), self.percentile(*m, v)))
            })
            .collect()
    }
}

/// Performance score in [0, 1]; neutral when the source has no evidence for the basis.
pub fn performance(percentiles: &BTreeMap<String, f64>, basis: PerformanceBasis) -> f64 {
    let single = |m: Metric| percentiles.get(m.key()).copied().unwrap_or(0.5);
    match basis {
        PerformanceBasis::Composite => {
            let (sum, weight) = COMPOSITE
                .iter()
                .filter_map(|(m, w)| percentiles.get(m.key()).map(|p| (p * w, *w)))
                .fold((0.0, 0.0), |a, b| (a.0 + b.0, a.1 + b.1));
            if weight > 0.0 { sum / weight } else { 0.5 }
        }
        PerformanceBasis::Rating => single(Metric::Rating),
        PerformanceBasis::Kd => single(Metric::Kd),
        PerformanceBasis::Kda => single(Metric::Kda),
        PerformanceBasis::Adr => single(Metric::Adr),
        PerformanceBasis::Kast => single(Metric::Kast),
        PerformanceBasis::Hs => single(Metric::Hs),
        PerformanceBasis::Acs => single(Metric::Acs),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(kills: f64, deaths: f64, rounds: f64) -> Split {
        Split {
            player: "p".into(),
            maps: rounds / 22.0,
            rounds,
            stat_rounds: rounds,
            kills,
            deaths,
            ..Default::default()
        }
    }

    #[test]
    fn combat_stats_require_coverage() {
        let mut t = row(20.0, 10.0, 22.0);
        let s = combat(&t);
        assert_eq!(s.kd, Some(2.0));
        assert_eq!(s.adr, None);
        assert_eq!(s.op_kill_share, None);
        t.stat_rounds = 0.0;
        assert_eq!(combat(&t).kd, None);
    }

    #[test]
    fn shrinkage_pulls_small_samples_toward_league() {
        let data = Dataset {
            settings: vec![],
            splits: vec![row(1000.0, 1000.0, 5000.0)],
            events: vec![],
        };
        let reference = Reference::new(&data);
        let small = reference.shrunk(Metric::Kd, &row(10.0, 2.0, 22.0)).unwrap();
        let large = reference
            .shrunk(Metric::Kd, &row(1000.0, 200.0, 2200.0))
            .unwrap();
        assert!(small > 1.0 && small < large && large < 5.0);
    }

    #[test]
    fn percentiles_use_mid_rank() {
        let reference = Reference {
            league: Split::default(),
            sorted: BTreeMap::from([(Metric::Kd, vec![1.0, 2.0, 3.0, 4.0])]),
        };
        assert_eq!(reference.percentile(Metric::Kd, 0.5), 0.0);
        assert_eq!(reference.percentile(Metric::Kd, 2.0), 0.375);
        assert_eq!(reference.percentile(Metric::Kd, 9.0), 1.0);
    }

    #[test]
    fn composite_ignores_missing_components() {
        let p = BTreeMap::from([("kd".to_string(), 0.8), ("rating".to_string(), 0.2)]);
        let expected = (0.8 * 0.15 + 0.2 * 0.30) / 0.45;
        assert!((performance(&p, PerformanceBasis::Composite) - expected).abs() < 1e-12);
        assert_eq!(performance(&p, PerformanceBasis::Adr), 0.5);
        assert_eq!(
            performance(&BTreeMap::new(), PerformanceBasis::Composite),
            0.5
        );
    }
}
