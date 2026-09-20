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

export type Player = {
  id: string;
  name: string;
  team: string;
  role: string;
  region: string;
  country: string;
  agents: { name: string; maps: number; share: number }[];
  role_history: Record<string, string>;
  setting: Setting;
  edpi: number;
  normalized_800: number;
  performance: number;
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

export type Filters = {
  role?: string;
  agent?: string;
  team?: string;
  region?: string;
  tournament?: string;
  year?: number;
  tier?: string;
  search?: string;
  style?: string;
  edpi_min?: number;
  edpi_max?: number;
  sensitivity_min?: number;
  sensitivity_max?: number;
  dpi_min?: number;
  dpi_max?: number;
  performance_min?: number;
  maps_min?: number;
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

export type Comparison = {
  name: string;
  count: number;
  peak: number | null;
  density: number[];
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
