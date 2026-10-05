import { type Filters, performanceBases } from "./types";

const listKeys = [
  "roles",
  "agents",
  "teams",
  "regions",
  "tournaments",
  "tiers",
  "maps",
] as const satisfies readonly (keyof Filters)[];

const textKeys = [
  "search",
  "style",
] as const satisfies readonly (keyof Filters)[];

const numberKeys = [
  "edpi_min",
  "edpi_max",
  "sensitivity_min",
  "sensitivity_max",
  "dpi_min",
  "dpi_max",
  "performance_min",
  "maps_min",
  "agent_share_min",
  "active_days",
  "kd_min",
  "kd_max",
  "kda_min",
  "kda_max",
  "adr_min",
  "adr_max",
  "kast_min",
  "kast_max",
  "hs_min",
  "hs_max",
  "rating_min",
  "rating_max",
  "op_share_min",
  "op_share_max",
  "operator_min",
  "operator_max",
  "movement_min",
  "movement_max",
  "entry_min",
  "entry_max",
  "anchor_min",
  "anchor_max",
  "utility_min",
  "utility_max",
] as const satisfies readonly (keyof Filters)[];

export type ViewState = { filters: Filters; dpi: number; player?: string };

const defaultDpi = 800;

const finite = (value: string | null) => {
  const number = value === null || value === "" ? NaN : Number(value);

  return Number.isFinite(number) ? number : undefined;
};

/** Parses a shared link. The API still validates every value it receives. */
export function readState(search: string): ViewState {
  const params = new URLSearchParams(search);
  const filters: Filters = {};

  for (const key of listKeys) {
    const values = params.getAll(key).filter(Boolean);

    if (values.length) filters[key] = values;
  }

  const years = params.getAll("years").flatMap((y) => finite(y) ?? []);

  if (years.length) filters.years = years;

  for (const key of textKeys) {
    const value = params.get(key);

    if (value) filters[key] = value;
  }

  for (const key of numberKeys) {
    const value = finite(params.get(key));

    if (value !== undefined) filters[key] = value;
  }

  const basis = performanceBases.find(
    ([b]) => b === params.get("performance_basis"),
  )?.[0];

  if (basis && basis !== "composite") filters.performance_basis = basis;

  const dpi = finite(params.get("dpi"));

  return {
    filters,
    dpi: dpi && dpi > 0 ? dpi : defaultDpi,
    player: params.get("player") ?? undefined,
  };
}

export function writeState({ filters, dpi, player }: ViewState) {
  const params = new URLSearchParams();

  for (const key of listKeys)
    for (const value of filters[key] ?? []) params.append(key, value);

  for (const year of filters.years ?? []) params.append("years", String(year));

  for (const key of [
    ...textKeys,
    ...numberKeys,
    "performance_basis",
  ] as const) {
    const value = filters[key];

    if (value !== undefined && value !== "") params.set(key, String(value));
  }

  if (dpi !== defaultDpi) params.set("dpi", String(dpi));

  if (player) params.set("player", player);

  const query = params.toString();

  return query ? `?${query}` : "";
}
