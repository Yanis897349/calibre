export type Mechanical = {
  operator: number;
  movement: number;
  entry: number;
  anchor: number;
  utility: number;
};

export type Setting = {
  name: string;
  team: string;
  dpi: number;
  sensitivity: number;
  observed_at: string;
  updated_at: string | null;
  reliability: number;
};

export type EventResult = {
  player: string;
  tournament: string;
  year: number;
  tier: string;
  placement: number;
  date: string;
};

export type Usage = { name: string; maps: number; share: number };

export type MapUsage = Usage & { kd: number | null; rating: number | null };

export type CombatStats = {
  rounds: number;
  kills: number;
  deaths: number;
  assists: number;
  kd: number | null;
  kda: number | null;
  kpr: number | null;
  dpr: number | null;
  apr: number | null;
  adr: number | null;
  kast: number | null;
  hs: number | null;
  fk_per_round: number | null;
  fd_per_round: number | null;
  opening_success: number | null;
  multi_kill_rate: number | null;
  clutches_per_100: number | null;
  plants_per_100: number | null;
  defuses_per_100: number | null;
  /** Operator kills and all kills inside kill-matrix coverage. */
  op_kills: number;
  km_kills: number;
  op_kill_share: number | null;
  op_death_share: number | null;
  op_kills_per_round: number | null;
  rating: number | null;
  acs: number | null;
};

export type Player = {
  id: string;
  name: string;
  team: string;
  role: string;
  region: string;
  country: string;
  agents: Usage[];
  map_pool: MapUsage[];
  role_history: Record<string, string>;
  setting: Setting;
  edpi: number;
  normalized_800: number;
  performance: number;
  percentiles: Partial<Record<PercentileKey, number>>;
  stats: CombatStats;
  rating: number | null;
  acs: number | null;
  achievement: number | null;
  maps: number;
  mechanical: Mechanical;
  styles: Record<string, number>;
  weight: number;
  contribution: number;
  reliability: number;
  last_played: string;
  events: EventResult[];
  history: Setting[];
  stale: boolean;
  warnings: string[];
};

export const performanceBases = [
  ["composite", "Composite"],
  ["rating", "Rating"],
  ["kd", "K/D"],
  ["kda", "KDA"],
  ["adr", "ADR"],
  ["kast", "KAST"],
  ["hs", "Headshot %"],
  ["acs", "ACS"],
] as const;

export type PerformanceBasis = (typeof performanceBases)[number][0];

export type PercentileKey = Exclude<PerformanceBasis, "composite">;

export type Filters = {
  roles?: string[];
  agents?: string[];
  teams?: string[];
  regions?: string[];
  tournaments?: string[];
  years?: number[];
  tiers?: string[];
  maps?: string[];
  search?: string;
  style?: string;
  edpi_min?: number;
  edpi_max?: number;
  sensitivity_min?: number;
  sensitivity_max?: number;
  dpi_min?: number;
  dpi_max?: number;
  performance_min?: number;
  performance_basis?: PerformanceBasis;
  maps_min?: number;
  agent_share_min?: number;
  active_days?: number;
  kd_min?: number;
  kd_max?: number;
  kda_min?: number;
  kda_max?: number;
  adr_min?: number;
  adr_max?: number;
  kast_min?: number;
  kast_max?: number;
  hs_min?: number;
  hs_max?: number;
  rating_min?: number;
  rating_max?: number;
  op_share_min?: number;
  op_share_max?: number;
  operator_min?: number;
  operator_max?: number;
  movement_min?: number;
  movement_max?: number;
  entry_min?: number;
  entry_max?: number;
  anchor_min?: number;
  anchor_max?: number;
  utility_min?: number;
  utility_max?: number;
  profile?: Mechanical;
};

export type ListFilter =
  | "roles"
  | "agents"
  | "teams"
  | "regions"
  | "tournaments"
  | "tiers"
  | "maps";

export type Comparison = {
  name: string;
  count: number;
  peak: number | null;
  density: number[];
};

export type CohortProfile = {
  name: string;
  count: number;
  maps: number;
  stats: CombatStats;
  agents: Usage[];
  map_pool: Usage[];
};

export type Analysis = {
  summary: {
    peak: number;
    raw_peak: number;
    median: number;
    range: [number, number];
    confidence: [number, number] | null;
    secondary_peaks: number[];
    sample_size: number;
    effective_sample: number;
    bandwidth: number;
    subgroup_share: number;
    parent_size: number;
    normalized: number;
    normalized_800: number;
    confidence_label: string;
  } | null;
  density: { edpi: number; density: number; raw: number; parent: number }[];
  histogram: { edpi: number; weight: number; count: number }[];
  players: Player[];
  roles: Comparison[];
  styles: Comparison[];
  cohort: CohortProfile | null;
  role_profiles: CohortProfile[];
  warnings: string[];
  dpi: number;
  total_players: number;
  model_version: string;
};

export type Meta = {
  setting_ranges?: { edpi: number; sensitivity: number; dpi: number };
  teams: string[];
  agents: string[];
  regions: string[];
  years: string[];
  tournaments: string[];
  tiers: string[];
  maps?: string[];
  storage: string;
};

export const roles = ["Duelist", "Initiator", "Controller", "Sentinel", "Flex"];

export const styles = [
  "Operator-heavy",
  "Movement-heavy",
  "Anchor-lurk",
  "Rifle-entry",
  "Aggressive-hybrid",
  "Utility-heavy",
  "Flexible",
];

export const mechanics: [keyof Mechanical, string][] = [
  ["operator", "Operator tendency"],
  ["movement", "Movement demand"],
  ["entry", "Entry aggression"],
  ["anchor", "Anchor tendency"],
  ["utility", "Utility demand"],
];

export const colors = new Map<string, string>(
  Object.entries({
    Duelist: "#c6f27b",
    Initiator: "#a68bea",
    Controller: "#71bdd8",
    Sentinel: "#e5ab70",
    Flex: "#c9a7c4",
  }),
);

export const num = (v: number | undefined | null, d = 0) =>
  v == null
    ? "—"
    : v.toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });

export const pct = (v: number | undefined | null, d = 0) =>
  v == null ? "—" : num(v * 100, d) + "%";

export const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Never";

export const title = (s: string) =>
  s === "kayo" ? "KAY/O" : s.charAt(0).toUpperCase() + s.slice(1);
