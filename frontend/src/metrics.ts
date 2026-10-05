import {
  type CombatStats,
  type PercentileKey,
  type Player,
  mechanics,
  num,
  pct,
} from "./types";

export type StatKey = keyof Omit<
  CombatStats,
  "rounds" | "kills" | "deaths" | "assists"
>;

export type StatDefinition = {
  key: StatKey;
  label: string;
  description: string;
  format: (v: number | null) => string;
  percentile?: PercentileKey;
};

export const stats: StatDefinition[] = [
  {
    key: "rating",
    label: "Rating",
    description: "VLR rating, averaged per map",
    format: (v) => num(v, 2),
    percentile: "rating",
  },
  {
    key: "kd",
    label: "K/D",
    description: "Kills per death",
    format: (v) => num(v, 2),
    percentile: "kd",
  },
  {
    key: "kda",
    label: "KDA",
    description: "Kills plus assists per death",
    format: (v) => num(v, 2),
    percentile: "kda",
  },
  {
    key: "adr",
    label: "ADR",
    description: "Average damage per round",
    format: (v) => num(v, 1),
    percentile: "adr",
  },
  {
    key: "kast",
    label: "KAST",
    description: "Rounds with a kill, assist, survival, or trade",
    format: (v) => pct(v, 1),
    percentile: "kast",
  },
  {
    key: "hs",
    label: "Headshot %",
    description: "Share of hits landing on the head",
    format: (v) => pct(v, 1),
    percentile: "hs",
  },
  {
    key: "acs",
    label: "ACS",
    description: "Average combat score",
    format: (v) => num(v, 0),
    percentile: "acs",
  },
  {
    key: "kpr",
    label: "Kills / round",
    description: "Kills per round",
    format: (v) => num(v, 2),
  },
  {
    key: "dpr",
    label: "Deaths / round",
    description: "Deaths per round",
    format: (v) => num(v, 2),
  },
  {
    key: "apr",
    label: "Assists / round",
    description: "Assists per round",
    format: (v) => num(v, 2),
  },
  {
    key: "fk_per_round",
    label: "First kills / round",
    description: "Opening kills per round",
    format: (v) => num(v, 3),
  },
  {
    key: "fd_per_round",
    label: "First deaths / round",
    description: "Opening deaths per round",
    format: (v) => num(v, 3),
  },
  {
    key: "opening_success",
    label: "Opening success",
    description: "First kills as a share of opening duels",
    format: (v) => pct(v, 1),
  },
  {
    key: "multi_kill_rate",
    label: "Multi-kills / round",
    description: "Rounds with two or more kills",
    format: (v) => num(v, 3),
  },
  {
    key: "clutches_per_100",
    label: "Clutches / 100",
    description: "Won clutches per 100 rounds",
    format: (v) => num(v, 2),
  },
  {
    key: "op_kill_share",
    label: "Operator kills",
    description: "Share of kills with the Operator",
    format: (v) => pct(v, 1),
  },
  {
    key: "op_death_share",
    label: "Deaths to Operator",
    description: "Share of deaths to an enemy Operator",
    format: (v) => pct(v, 1),
  },
  {
    key: "plants_per_100",
    label: "Plants / 100",
    description: "Spike plants per 100 rounds",
    format: (v) => num(v, 1),
  },
];

export const statByKey = new Map(stats.map((s) => [s.key, s]));

export const formatStat = (key: StatKey, v: number | null) =>
  statByKey.get(key)?.format(v) ?? num(v, 2);

export type ScatterAxis = {
  key: string;
  label: string;
  value: (p: Player) => number | null;
  format: (v: number) => string;
  /** Fixed domain for bounded scores; data-driven otherwise. */
  domain?: [number, number];
};

const statAxis = (key: StatKey): ScatterAxis => {
  const definition = statByKey.get(key)!;

  return {
    key,
    label: definition.label,
    value: (p) => p.stats[key],
    format: (v) => definition.format(v),
  };
};

export const scatterAxes: ScatterAxis[] = [
  {
    key: "performance",
    label: "Performance",
    value: (p) => p.performance,
    format: (v) => pct(v),
    domain: [0, 1],
  },
  ...(["kd", "kda", "adr", "kast", "hs", "op_kill_share"] as const).map(
    statAxis,
  ),
  ...mechanics.map(([key, label]): ScatterAxis => ({
    key,
    label,
    value: (p) => p.mechanical[key],
    format: (v) => pct(v),
    domain: [0, 1],
  })),
];

export function axisDomain(axis: ScatterAxis, players: Player[]) {
  if (axis.domain) return axis.domain;
  const values = players.flatMap((p) => axis.value(p) ?? []);

  if (!values.length) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.06 || Math.abs(max) * 0.1 || 1;

  return [Math.max(0, min - pad), max + pad];
}
