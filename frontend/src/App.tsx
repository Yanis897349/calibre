import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Link2,
  ChevronRight,
  Focus,
  Info,
  Layers3,
  Menu,
  Mouse,
  Search,
  Settings2,
  Trophy,
  SlidersHorizontal,
  Users,
  X,
  RotateCcw,
} from "lucide-react";
import { Button } from "./components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from "./components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { RatioSlider } from "./components/ui/ratio-slider";
import { Tabs, TabsList, TabItem, TabPanel } from "./components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./components/ui/table";
import { SummaryMetrics } from "./components/summary-metrics";
import { MultiSelect } from "./components/multi-select";
import { Badge, RoleBadge } from "./components/badges";
import { CohortCombat, RoleProfiles } from "./combat";
import { PlayerDetail } from "./player-detail";
import { readState, writeState } from "./url-state";
import { useCopy } from "./hooks/use-copy";
import { MapLabel, MapThumb, WeaponIcon } from "./components/game-media";
import { StyleIcon, StyleLabel } from "./components/style-icon";
import { type StatKey, formatStat, scatterAxes } from "./metrics";
import { AnalysisUnavailable } from "./components/analysis-unavailable";
import { AgentIcon, agentDisplayName } from "./components/agent-icon";
import {
  PlayerPortrait,
  TeamIcon,
  TeamLabel,
  RoleIcon,
} from "./components/identity-media";
import {
  Distribution,
  MiniDensity,
  CompareChart,
  MechanicalRadar,
  Scatter,
} from "./charts";
import {
  type Analysis,
  type Filters,
  type Meta,
  type ListFilter,
  type Player,
  type Mechanical,
  roles,
  styles,
  mechanics,
  performanceBases,
  colors,
  num,
  pct,
  title,
} from "./types";

type Page = "overview" | "roles" | "styles" | "players" | "profile";

const nav = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "roles", label: "Role comparison", icon: Layers3 },
  { id: "styles", label: "Mechanical styles", icon: Focus },
  { id: "players", label: "Player database", icon: Users },
  { id: "profile", label: "My sensitivity", icon: SlidersHorizontal },
] as const;

const defaultProfile: Mechanical = {
  operator: 0.2,
  movement: 0.35,
  entry: 0.4,
  anchor: 0.6,
  utility: 0.5,
};

const serverUnavailable =
  "Can’t reach the server. Check that it’s running, then try again.";

function Choose({
  label,
  value,
  options,
  onChange,
  all = true,
  renderOption,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (v: string) => void;
  all?: boolean;
  renderOption?: (value: string) => ReactNode;
}) {
  return (
    <Select
      value={value || "all"}
      onValueChange={(v) => onChange(v === "all" ? "" : v)}
    >
      <SelectTrigger
        aria-label={label}
        className={
          "select-control" + (renderOption ? " media-select-control" : "")
        }
      />
      <SelectContent
        className={renderOption ? "media-select-options" : undefined}
      >
        {all && (
          <SelectItem index={0} value="all">
            {label}
          </SelectItem>
        )}
        {options.map((o, i) => (
          <SelectItem key={o} index={i + 1} value={o}>
            {renderOption ? renderOption(o) : title(o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SectionTitle({
  title: heading,
  description,
  children,
}: {
  title: ReactNode;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        <h2>{heading}</h2>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}

function pageFromHash(): Page {
  const page = location.hash.slice(1);

  return nav.find((item) => item.id === page)?.id ?? "overview";
}

/** Keeps the address bar shareable and opens a player from a shared link once loaded. */
function useSharedLink({
  linkedPlayer,
  data,
  filters,
  dpi,
  selected,
  onOpen,
}: {
  linkedPlayer: RefObject<string | undefined>;
  data: Analysis | null;
  filters: Filters;
  dpi: number;
  selected: Player | null;
  onOpen: (player: Player, list: Player[]) => void;
}) {
  useEffect(() => {
    const id = linkedPlayer.current;

    if (!data || !id) return;
    linkedPlayer.current = undefined;

    const match = data.players.find((p) => p.id === id);

    if (match) onOpen(match, data.players);
  }, [data, linkedPlayer, onOpen]);

  useEffect(() => {
    const query = writeState({ filters, dpi, player: selected?.id });

    if (query !== location.search)
      history.replaceState(
        history.state,
        "",
        `${location.pathname}${query}${location.hash}`,
      );
  }, [filters, dpi, selected]);
}

export default function App() {
  const [initial] = useState(() => readState(location.search));
  const [page, setPage] = useState<Page>(pageFromHash);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [dpi, setDpi] = useState(initial.dpi);
  const [data, setData] = useState<Analysis | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const [retry, setRetry] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);
  const [browse, setBrowse] = useState<Player[]>([]);
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(defaultProfile);
  const [unit, setUnit] = useState("sensitivity");
  const [raw, setRaw] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const dialogOpener = useRef<HTMLElement | SVGElement | null>(null);
  const linkedPlayer = useRef(initial.player);

  function openPlayer(player: Player, list?: Player[]) {
    const activeElement = document.activeElement;
    dialogOpener.current =
      activeElement instanceof HTMLElement ||
      activeElement instanceof SVGElement
        ? activeElement
        : null;
    setBrowse(list ?? data?.players ?? []);
    setSelected(player);
  }

  function restoreDialogFocus(event: Event) {
    event.preventDefault();

    if (dialogOpener.current?.isConnected) dialogOpener.current.focus();
  }

  const effectiveFilters = useMemo(
    () => (page === "profile" ? { ...filters, profile } : filters),
    [filters, profile, page],
  );

  function go(p: Page) {
    setPage(p);
    location.hash = p;
    setMobile(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function update<K extends keyof Filters>(k: K, v: Filters[K]) {
    setFilters((f) => ({ ...f, [k]: v === "" ? undefined : v }));
  }

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => {
        if (!r.ok) throw Error("Metadata unavailable");

        return r.json();
      })
      .then(setMeta)
      .catch(() => {});
  }, [retry]);
  useEffect(() => {
    const controller = new AbortController();
    setPending(true);

    const timer = setTimeout(() => {
      fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: effectiveFilters, dpi }),
        signal: controller.signal,
      })
        .then(async (r) => {
          const body = await r.json().catch(() => null);

          if (!r.ok || !body) throw Error(body?.error || serverUnavailable);

          return body;
        })
        .then((d) => {
          setData(d);
          setError("");
          setPending(false);
        })
        .catch((e) => {
          if (e.name !== "AbortError") {
            setError(e instanceof TypeError ? serverUnavailable : e.message);
            setPending(false);
          }
        });
    }, 140);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [effectiveFilters, dpi, retry]);

  useSharedLink({
    linkedPlayer,
    data,
    filters,
    dpi,
    selected,
    onOpen: (player, list) => {
      setBrowse(list);
      setSelected(player);
    },
  });

  const pageHeading = {
    overview: "Sensitivity, backed by data.",
    roles: "Different roles. Different demands.",
    styles: "Beyond the role.",
    players: "The players behind the numbers.",
    profile: "Find your operating range.",
  }[page];

  const pageSubtitle = {
    overview:
      "Explore the settings of VALORANT’s best. Find the sensitivity that fits the way you play.",
    roles:
      "Compare the statistical fingerprints of all five professional roles.",
    styles:
      "Explore overlapping playstyles derived from agent usage and competitive statistics.",
    players:
      "Inspect settings, performance, and every player’s contribution to the model.",
    profile:
      "Describe how you play. Let professional data find your closest starting point.",
  }[page];

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to analysis
      </a>
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a className="brand" href="#overview" onClick={() => go("overview")}>
          <span className="brand-mark">
            <span />
            <span />
          </span>
          calibre<span className="brand-period">.</span>
        </a>
        <span className="nav-heading">WORKSPACE</span>
        <nav aria-label="Main navigation">
          {nav.map((n) => (
            <button
              key={n.id}
              className={"nav-item " + (page === n.id ? "active" : "")}
              onClick={() => go(n.id)}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={17} />
              {n.label}
              {n.id === "profile" && <span className="nav-new">NEW</span>}
            </button>
          ))}
        </nav>
      </aside>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Workspace
            <ChevronRight size={13} />
            <span>{nav.find((n) => n.id === page)?.label || title(page)}</span>
          </div>
        </header>
        <main id="main">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                THE SENSITIVITY LAB <span>/</span>{" "}
                {page === "overview" ? "OVERVIEW" : page.toUpperCase()}
              </div>
              <h1>{pageHeading}</h1>
              <p>{pageSubtitle}</p>
            </div>
          </div>
          <CohortControls
            filters={filters}
            meta={meta}
            dpi={dpi}
            setDpi={setDpi}
            setFilters={setFilters}
            onAdvanced={(event) => {
              dialogOpener.current = event.currentTarget;
              setAdvanced(true);
            }}
          />
          {error ? (
            <AnalysisUnavailable
              message={error}
              pending={pending}
              onRetry={() => setRetry((r) => r + 1)}
            />
          ) : !data ? (
            <div className="loading-panel" role="status">
              <span className="loading-dot" />
              Loading professional data and calculating distributions…
            </div>
          ) : (
            <div
              className={
                pending ? "analysis-content is-pending" : "analysis-content"
              }
              aria-busy={pending}
            >
              {["overview", "profile"].includes(page) && (
                <Overview
                  unit={unit}
                  setUnit={setUnit}
                  raw={raw}
                  setRaw={setRaw}
                  page={page}
                  data={data}
                  dpi={dpi}
                  profile={profile}
                  setProfile={setProfile}
                  filters={filters}
                  update={update}
                  setFilters={setFilters}
                  go={go}
                  openPlayer={openPlayer}
                  search={search}
                />
              )}
              {(page === "roles" || page === "styles") && (
                <ComparisonView
                  page={page}
                  data={data}
                  dpi={dpi}
                  onExplore={(name) => {
                    if (page === "roles")
                      updateList(setFilters, "roles", [name]);
                    else update("style", name);
                    go("overview");
                  }}
                  openPlayer={openPlayer}
                />
              )}
              {page === "players" && (
                <>
                  <PlayerTable
                    players={data.players}
                    onPlayer={openPlayer}
                    searchRef={search}
                    searchValue={filters.search || ""}
                    onSearch={(v) => update("search", v)}
                  />
                  <div className="panel mt">
                    <SectionTitle
                      title="Performance & sensitivity"
                      description="Explore the relationship. Association does not establish causation."
                    />
                    <ScatterExplorer
                      players={data.players}
                      dpi={dpi}
                      onPlayer={openPlayer}
                    />
                  </div>
                </>
              )}
            </div>
          )}
          <footer>
            <span>
              CALIBRE <span className="footer-slash">/</span> Built for the way
              you play.
            </span>
            <span>Independent analysis. Not affiliated with Riot Games.</span>
          </footer>
        </main>
      </div>
      <AdvancedFilters
        advanced={advanced}
        setAdvanced={setAdvanced}
        filters={filters}
        meta={meta}
        update={update}
        setFilters={setFilters}
        pending={pending}
        data={data}
        restoreDialogFocus={restoreDialogFocus}
      />
      <PlayerDialog
        selected={selected}
        browse={browse}
        data={data}
        dpi={dpi}
        onSelect={setSelected}
        onFilter={(key, value) => updateList(setFilters, key, [value])}
        restoreDialogFocus={restoreDialogFocus}
      />
    </div>
  );
}

function PlayerDialog({
  selected,
  browse,
  data,
  dpi,
  onSelect,
  onFilter,
  restoreDialogFocus,
}: {
  selected: Player | null;
  browse: Player[];
  data: Analysis | null;
  dpi: number;
  onSelect: (player: Player | null) => void;
  onFilter: (key: "agents" | "teams", value: string) => void;
  restoreDialogFocus: (event: Event) => void;
}) {
  return (
    <Dialog
      open={!!selected}
      onOpenChange={(open) => {
        if (!open) onSelect(null);
      }}
    >
      <DialogContent
        size="xl"
        className="player-dialog max-w-[1120px]"
        onCloseAutoFocus={restoreDialogFocus}
      >
        {selected && (
          <PlayerDetail
            player={selected}
            players={browse}
            cohort={data?.players ?? browse}
            onNavigate={onSelect}
            summary={data?.summary ?? undefined}
            dpi={dpi}
            baseline={data?.cohort?.stats}
            onFilter={(key, value) => {
              onSelect(null);
              onFilter(key, value);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const styleColors = [
  "#c6f27b",
  "#a68bea",
  "#71bdd8",
  "#e5ab70",
  "#c9a7c4",
  "#ee8181",
  "#9da1a8",
];

function groupLeaders(
  players: Player[],
  page: "roles" | "styles",
  name: string,
) {
  const members =
    page === "roles"
      ? players.filter((p) => p.role === name)
      : [...players].sort(
          (a, b) => (b.styles[name] ?? 0) - (a.styles[name] ?? 0),
        );

  return members
    .slice(0, page === "roles" ? undefined : 40)
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 5);
}

function GroupLeaders({
  players,
  onPlayer,
}: {
  players: Player[];
  onPlayer: (player: Player, list?: Player[]) => void;
}) {
  if (!players.length) return null;

  return (
    <div className="group-leaders">
      <span>Most influential</span>
      <div>
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            className="leader"
            aria-label={`Open ${p.name}`}
            title={`${p.name} · ${num(p.edpi, 0)} eDPI`}
            onClick={() => onPlayer(p, players)}
          >
            <PlayerPortrait id={p.id} name={p.name} size={30} />
          </button>
        ))}
      </div>
    </div>
  );
}

function ComparisonView({
  page,
  data,
  dpi,
  onExplore,
  openPlayer,
}: {
  page: "roles" | "styles";
  data: Analysis;
  dpi: number;
  onExplore: (name: string) => void;
  openPlayer: (player: Player, list?: Player[]) => void;
}) {
  return (
    <section className="comparison-view">
      <div className="panel">
        <SectionTitle
          title={
            page === "roles"
              ? "Role distributions"
              : "Mechanical-style distributions"
          }
        />
        <CompareChart
          data={data}
          groups={page === "roles" ? data.roles : data.styles}
          dpi={dpi}
        />
        <div className="comparison-legend">
          {(page === "roles" ? data.roles : data.styles).map((g, i) => (
            <span key={g.name}>
              {page === "roles" ? (
                <RoleBadge role={g.name} />
              ) : (
                <span
                  className="style-legend"
                  style={{ color: styleColors[i] }}
                >
                  <StyleIcon style={g.name} size={12} />
                  <span>{g.name}</span>
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="comparison-cards">
        {(page === "roles" ? data.roles : data.styles).map((g, i) => (
          <div className="panel compare-card" key={g.name}>
            <SectionTitle
              title={
                page === "roles" ? (
                  <RoleBadge role={g.name} />
                ) : (
                  <StyleLabel style={g.name} />
                )
              }
            >
              <Badge>{g.count} players</Badge>
            </SectionTitle>
            <MiniDensity group={g} index={i} />
            <div className="metric-number">
              {g.peak === null ? "—" : num(g.peak / dpi, 3)}
              <span>@ {dpi} DPI</span>
            </div>
            <GroupLeaders
              players={groupLeaders(data.players, page, g.name)}
              onPlayer={openPlayer}
            />
            <Button variant="tertiary" onClick={() => onExplore(g.name)}>
              Explore cohort
              <ArrowUpRight size={14} />
            </Button>
          </div>
        ))}
      </div>
      {page === "roles" && <RoleProfiles profiles={data.role_profiles} />}
      <div className="panel">
        <SectionTitle
          title="Sensitivity meets mechanics"
          description="Each point is a player. Point size reflects statistical influence."
        />
        <ScatterExplorer
          players={data.players}
          dpi={dpi}
          onPlayer={openPlayer}
        />
      </div>
    </section>
  );
}

type UpdateFilter = <K extends keyof Filters>(
  key: K,
  value: Filters[K],
) => void;

type SetFilters = Dispatch<SetStateAction<Filters>>;

const listLabels: Record<ListFilter | "years", string> = {
  roles: "Role",
  agents: "Agent",
  teams: "Team",
  regions: "Region",
  tournaments: "Tournament",
  years: "Season",
  tiers: "Tier",
  maps: "Map",
};

const listKeys = [
  "roles",
  "agents",
  "teams",
  "regions",
  "tournaments",
  "years",
  "tiers",
  "maps",
] as const;

const scalarLabels: Partial<Record<keyof Filters, string>> = {
  search: "Search",
  style: "Style",
  performance_basis: "Performance",
  performance_min: "Min performance",
  maps_min: "Min maps",
  agent_share_min: "Min agent share",
  active_days: "Active within",
  op_share_min: "Min Operator kills",
  op_share_max: "Max Operator kills",
};

const fractionFilters = new Set<keyof Filters>([
  "performance_min",
  "agent_share_min",
  "op_share_min",
  "op_share_max",
]);

function updateList(setFilters: SetFilters, key: ListFilter, values: string[]) {
  setFilters((f) => ({ ...f, [key]: values.length ? values : undefined }));
}

function scalarText(key: keyof Filters, value: Filters[keyof Filters]) {
  const stat = statRanges.find(
    (r) => key === `${r.key}_min` || key === `${r.key}_max`,
  );

  if (stat) {
    const bound = key.endsWith("_min") ? "Min" : "Max";

    return `${bound} ${stat.label}: ${stat.format(Number(value))}`;
  }

  const label =
    scalarLabels[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replaceAll("_", " ");

  const shown =
    key === "performance_basis"
      ? performanceBases.find(([k]) => k === value)?.[1]
      : key === "active_days"
        ? `${num(Number(value))} days`
        : fractionFilters.has(key)
          ? pct(Number(value))
          : String(value);

  return `${label}: ${shown}`;
}

type FilterChip = {
  id: string;
  text: string;
  icon?: ReactNode;
  remove: () => void;
};

function listChipIcon(key: (typeof listKeys)[number], value: string) {
  if (key === "agents") return <AgentIcon name={value} size={18} />;

  if (key === "roles") return <RoleIcon role={value} />;

  if (key === "teams") return <TeamIcon team={value} size={18} />;

  if (key === "maps") return <MapThumb name={value} className="chip-map" />;

  return undefined;
}

function scalarChipIcon(key: keyof Filters, value: Filters[keyof Filters]) {
  if (key === "style") return <StyleIcon style={String(value)} size={12} />;

  if (key === "op_share_min" || key === "op_share_max")
    return <WeaponIcon name="Operator" height={9} className="chip-weapon" />;

  return undefined;
}

function filterChips(filters: Filters, setFilters: SetFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  for (const key of listKeys) {
    for (const value of filters[key] ?? []) {
      const text = String(value);

      chips.push({
        id: `${key}:${text}`,
        text: `${listLabels[key]}: ${key === "agents" ? agentDisplayName(text) : text}`,
        icon: listChipIcon(key, text),
        remove: () =>
          setFilters((f) => {
            const rest =
              key === "years"
                ? f.years?.filter((y) => y !== value)
                : f[key]?.filter((v) => v !== value);

            return { ...f, [key]: rest?.length ? rest : undefined };
          }),
      });
    }
  }

  for (const [k, v] of Object.entries(filters)) {
    // SAFETY: entries come from the typed Filters state.
    const key = k as keyof Filters;

    if (v === undefined || v === "" || listKeys.some((l) => l === key))
      continue;

    chips.push({
      id: key,
      text: scalarText(key, v),
      icon: scalarChipIcon(key, v),
      remove: () => setFilters((f) => ({ ...f, [key]: undefined })),
    });
  }

  return chips;
}

const presetDpis = [400, 800, 1600];

function CohortControls({
  filters,
  meta,
  dpi,
  setDpi,
  setFilters,
  onAdvanced,
}: {
  filters: Filters;
  meta: Meta | null;
  dpi: number;
  setDpi: (dpi: number) => void;
  setFilters: SetFilters;
  onAdvanced: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [customDpi, setCustomDpi] = useState(String(dpi));
  const [custom, setCustom] = useState(() => !presetDpis.includes(dpi));
  const { copied, copy } = useCopy();

  const active = filterChips(filters, setFilters);

  return (
    <>
      <section className="filter-bar" aria-label="Cohort filters">
        <div className="filter-main">
          <span className="filter-caption">
            <SlidersHorizontal size={14} />
            Cohort
          </span>
          <MultiSelect
            label="All roles"
            values={filters.roles ?? []}
            options={roles}
            renderOption={(role) => <RoleBadge role={role} />}
            onChange={(v) => updateList(setFilters, "roles", v)}
          />
          <MultiSelect
            label="All regions"
            values={filters.regions ?? []}
            options={meta?.regions || []}
            onChange={(v) => updateList(setFilters, "regions", v)}
          />
          <MultiSelect
            label="All seasons"
            values={(filters.years ?? []).map(String)}
            options={meta?.years || []}
            onChange={(v) =>
              setFilters((f) => ({
                ...f,
                years: v.length ? v.map(Number) : undefined,
              }))
            }
          />
          <Button variant="ghost" className="more-filters" onClick={onAdvanced}>
            <Settings2 size={14} />
            More filters
            {active.length > 0 && (
              <span className="count-chip">{active.length}</span>
            )}
          </Button>
        </div>
        <div className="dpi-control">
          <Mouse size={14} />
          <span>Display DPI</span>
          <div className="segmented">
            {presetDpis.map((d) => (
              <button
                key={d}
                className={!custom && dpi === d ? "selected" : ""}
                onClick={() => {
                  setDpi(d);
                  setCustom(false);
                }}
              >
                {d}
              </button>
            ))}
            <button
              className={custom ? "selected" : ""}
              onClick={() => setCustom(true)}
            >
              Custom
            </button>
          </div>
          {custom && (
            <input
              aria-label="Custom display DPI"
              type="number"
              min="50"
              max="100000"
              value={customDpi}
              onChange={(e) => {
                setCustomDpi(e.target.value);
                const n = Number(e.target.value);

                if (n >= 50 && n <= 100000) setDpi(n);
              }}
            />
          )}
        </div>
      </section>
      {custom && (Number(customDpi) < 50 || Number(customDpi) > 100000) && (
        <p className="field-error" role="alert">
          Enter a DPI between 50 and 100,000.
        </p>
      )}
      {active.length > 0 && (
        <div className="active-filters">
          {active.map((chip) => (
            <button
              key={chip.id}
              aria-label={`Remove ${chip.text}`}
              onClick={chip.remove}
            >
              {chip.icon}
              {chip.text}
              <X size={11} />
            </button>
          ))}
          <button className="clear-filters" onClick={() => setFilters({})}>
            Clear all
          </button>
          <button
            className={"share-filters" + (copied ? " copied" : "")}
            onClick={() => copy("cohort", location.href)}
          >
            {copied ? <Check size={11} /> : <Link2 size={11} />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      )}
    </>
  );
}

const activityWindows = [
  ["90", "Last 90 days"],
  ["180", "Last 6 months"],
  ["365", "Last year"],
  ["730", "Last 2 years"],
] as const;

const basisHint: Record<NonNullable<Filters["performance_basis"]>, string> = {
  composite:
    "Blends rating, ADR, headshot %, K/D, KDA, and KAST percentiles. Small samples are pulled toward the league average.",
  rating: "VLR rating percentile among all professionals.",
  kd: "Kills per death percentile among all professionals.",
  kda: "Kills plus assists per death percentile.",
  adr: "Average damage per round percentile.",
  kast: "Percentile of rounds with a kill, assist, survival, or trade.",
  hs: "Headshot percentage percentile, the closest aim-precision signal.",
  acs: "Average combat score percentile.",
};

type StatRangeConfig = {
  key: "kd" | "kda" | "adr" | "kast" | "hs" | "rating" | "op_share";
  label: string;
  low: number;
  high: number;
  step: number;
  format: (v: number) => string;
};

const statRanges: StatRangeConfig[] = [
  {
    key: "rating",
    label: "Rating",
    low: 0.5,
    high: 1.5,
    step: 0.01,
    format: (v) => num(v, 2),
  },
  {
    key: "kd",
    label: "K/D",
    low: 0.5,
    high: 1.6,
    step: 0.01,
    format: (v) => num(v, 2),
  },
  {
    key: "kda",
    label: "KDA",
    low: 0.8,
    high: 2.2,
    step: 0.01,
    format: (v) => num(v, 2),
  },
  {
    key: "adr",
    label: "ADR",
    low: 80,
    high: 180,
    step: 1,
    format: (v) => num(v),
  },
  {
    key: "kast",
    label: "KAST",
    low: 0.6,
    high: 0.82,
    step: 0.005,
    format: (v) => pct(v, 1),
  },
  {
    key: "hs",
    label: "Headshot %",
    low: 0.15,
    high: 0.4,
    step: 0.005,
    format: (v) => pct(v, 1),
  },
];

const operatorRange: StatRangeConfig = {
  key: "op_share",
  label: "Operator kills",
  low: 0,
  high: 0.5,
  step: 0.01,
  format: (v) => pct(v),
};

function StatRange({
  range,
  filters,
  setFilters,
}: {
  range: StatRangeConfig;
  filters: Filters;
  setFilters: SetFilters;
}) {
  const minimum = `${range.key}_min` as const;
  const maximum = `${range.key}_max` as const;

  return (
    <div className="slider-field">
      <div>
        <label>{range.label}</label>
      </div>
      <RatioSlider
        label={range.label + " range"}
        value={[
          Math.max(range.low, filters[minimum] ?? range.low),
          Math.min(range.high, filters[maximum] ?? range.high),
        ]}
        min={range.low}
        max={range.high}
        step={range.step}
        formatValue={range.format}
        onChange={(v) => {
          if (Array.isArray(v))
            setFilters((f) => ({
              ...f,
              [minimum]: v[0] <= range.low ? undefined : v[0],
              [maximum]: v[1] >= range.high ? undefined : v[1],
            }));
        }}
      />
    </div>
  );
}

function Threshold({
  label,
  value,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value?: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="slider-field">
      <div>
        <label>{label}</label>
      </div>
      <RatioSlider
        label={label}
        value={value ?? 0}
        min={0}
        max={max}
        step={step}
        formatValue={format}
        onChange={(v) => onChange(Number(v) || undefined)}
      />
    </div>
  );
}

type FilterSectionId =
  | "competition"
  | "equipment"
  | "playstyle"
  | "performance"
  | "weapons"
  | "sample";

type FilterKey = keyof Filters;

const boundKeys = <K extends string>(keys: readonly K[]) =>
  keys.flatMap((k) => [`${k}_min` as const, `${k}_max` as const]);

const mechanicKeys = boundKeys(mechanics.map(([k]) => k));

const statKeys = boundKeys(statRanges.map((r) => r.key));

const filterSections: {
  id: FilterSectionId;
  label: string;
  icon: ReactNode;
  keys: FilterKey[];
}[] = [
  {
    id: "competition",
    label: "Competition",
    icon: <Trophy size={14} />,
    keys: [
      "agents",
      "agent_share_min",
      "teams",
      "tournaments",
      "tiers",
      "maps",
      "active_days",
    ],
  },
  {
    id: "equipment",
    label: "Equipment",
    icon: <Mouse size={14} />,
    keys: boundKeys(["edpi", "sensitivity", "dpi"] as const),
  },
  {
    id: "playstyle",
    label: "Playstyle",
    icon: <Focus size={14} />,
    keys: ["style", ...mechanicKeys],
  },
  {
    id: "performance",
    label: "Performance",
    icon: <Activity size={14} />,
    keys: ["performance_basis", "performance_min", ...statKeys],
  },
  {
    id: "weapons",
    label: "Weapons",
    icon: <WeaponIcon name="Operator" height={10} />,
    keys: ["op_share_min", "op_share_max"],
  },
  {
    id: "sample",
    label: "Sample quality",
    icon: <Layers3 size={14} />,
    keys: ["maps_min"],
  },
];

function activeCount(filters: Filters, keys: FilterKey[]) {
  return keys.reduce((count, k) => {
    const value = filters[k];

    return (
      count + (Array.isArray(value) ? value.length : value == null ? 0 : 1)
    );
  }, 0);
}

function clearKeys(setFilters: SetFilters, keys: FilterKey[]) {
  setFilters((current) => {
    const next = { ...current };

    for (const key of keys) delete next[key];

    return next;
  });
}

function FilterSection({
  id,
  filters,
  setFilters,
  description,
  children,
}: {
  id: FilterSectionId;
  filters: Filters;
  setFilters: SetFilters;
  description?: string;
  children: ReactNode;
}) {
  const section = filterSections.find((s) => s.id === id)!;
  const count = activeCount(filters, section.keys);

  return (
    <section
      className="filter-section"
      id={`filter-section-${id}`}
      data-section={id}
      aria-labelledby={`filter-heading-${id}`}
    >
      <header>
        <h3 id={`filter-heading-${id}`}>
          <span className="filter-section-icon">{section.icon}</span>
          {section.label}
        </h3>
        {count > 0 && (
          <button
            type="button"
            className="text-link"
            onClick={() => clearKeys(setFilters, section.keys)}
          >
            Clear {count}
          </button>
        )}
      </header>
      {description && <p className="field-hint">{description}</p>}
      <div className="filter-fields">{children}</div>
    </section>
  );
}

type SectionProps = {
  filters: Filters;
  meta: Meta | null;
  update: UpdateFilter;
  setFilters: SetFilters;
};

function CompetitionSection({
  filters,
  meta,
  update,
  setFilters,
}: SectionProps) {
  return (
    <FilterSection id="competition" filters={filters} setFilters={setFilters}>
      <label className="wide">
        Agents
        <MultiSelect
          label="All agents"
          values={filters.agents ?? []}
          options={meta?.agents || []}
          format={agentDisplayName}
          renderOption={(agent) => (
            <span className="agent-label">
              <AgentIcon name={agent} />
              <span>{agentDisplayName(agent)}</span>
            </span>
          )}
          onChange={(v) => updateList(setFilters, "agents", v)}
        />
      </label>
      {(filters.agents?.length ?? 0) > 0 && (
        <div className="wide">
          <Threshold
            label="Minimum share of maps on these agents"
            value={filters.agent_share_min}
            max={1}
            step={0.05}
            format={(v) => pct(v)}
            onChange={(v) => update("agent_share_min", v)}
          />
        </div>
      )}
      <label>
        Teams
        <MultiSelect
          label="All teams"
          values={filters.teams ?? []}
          options={meta?.teams || []}
          renderOption={(team) => <TeamLabel team={team} size={20} />}
          onChange={(v) => updateList(setFilters, "teams", v)}
        />
      </label>
      <label>
        Tournaments
        <MultiSelect
          label="All tournaments"
          values={filters.tournaments ?? []}
          options={meta?.tournaments || []}
          onChange={(v) => updateList(setFilters, "tournaments", v)}
        />
      </label>
      <label>
        Event tier
        <MultiSelect
          label="All tiers"
          values={filters.tiers ?? []}
          options={meta?.tiers || []}
          onChange={(v) => updateList(setFilters, "tiers", v)}
        />
      </label>
      <label>
        Maps
        <MultiSelect
          label="All maps"
          values={filters.maps ?? []}
          options={meta?.maps || []}
          renderOption={(map) => <MapLabel name={map} />}
          onChange={(v) => updateList(setFilters, "maps", v)}
        />
      </label>
      <label>
        Last competitive match
        <Choose
          label="Any time"
          value={filters.active_days?.toString()}
          options={activityWindows.map(([days]) => days)}
          renderOption={(days) =>
            activityWindows.find(([d]) => d === days)?.[1]
          }
          onChange={(v) => update("active_days", v ? Number(v) : undefined)}
        />
      </label>
    </FilterSection>
  );
}

function EquipmentSection({ filters, meta, setFilters }: SectionProps) {
  return (
    <FilterSection id="equipment" filters={filters} setFilters={setFilters}>
      {equipmentRanges(meta).map(({ label, key, max, step, precision }) => {
        const minimum = `${key}_min` as const;
        const maximum = `${key}_max` as const;

        return (
          <div className="slider-field setting-range-field" key={key}>
            <div>
              <label>{label}</label>
            </div>
            <RatioSlider
              label={label}
              value={[
                Number(filters[minimum] ?? 0),
                Number(filters[maximum] ?? max),
              ]}
              min={0}
              max={max}
              step={step}
              formatValue={(v) => num(v, Number.isInteger(v) ? 0 : precision)}
              onChange={(values) => {
                if (Array.isArray(values))
                  setFilters((current) => ({
                    ...current,
                    [minimum]: values[0] === 0 ? undefined : values[0],
                    [maximum]: values[1] === max ? undefined : values[1],
                  }));
              }}
            />
          </div>
        );
      })}
    </FilterSection>
  );
}

function PlaystyleSection({ filters, update, setFilters }: SectionProps) {
  return (
    <FilterSection id="playstyle" filters={filters} setFilters={setFilters}>
      <label className="wide">
        Mechanical style
        <Choose
          label="All styles"
          value={filters.style}
          options={styles}
          renderOption={(style) => <StyleLabel style={style} />}
          onChange={(v) => update("style", v)}
        />
      </label>
      {mechanics.map(([k, label]) => (
        <div className="slider-field" key={k}>
          <div>
            <label>{label}</label>
          </div>
          <RatioSlider
            label={label + " range"}
            value={[
              Number(filters[`${k}_min`] ?? 0),
              Number(filters[`${k}_max`] ?? 1),
            ]}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => {
              if (Array.isArray(v))
                setFilters((f) => ({
                  ...f,
                  [k + "_min"]: v[0] || undefined,
                  [k + "_max"]: v[1] === 1 ? undefined : v[1],
                }));
            }}
          />
        </div>
      ))}
    </FilterSection>
  );
}

function PerformanceSection({ filters, update, setFilters }: SectionProps) {
  return (
    <FilterSection id="performance" filters={filters} setFilters={setFilters}>
      <label>
        Score performance by
        <Choose
          label="Score performance by"
          all={false}
          value={filters.performance_basis ?? "composite"}
          options={performanceBases.map(([k]) => k)}
          renderOption={(k) => performanceBases.find(([b]) => b === k)?.[1]}
          onChange={(v) =>
            update(
              "performance_basis",
              performanceBases.find(([b]) => b === v && b !== "composite")?.[0],
            )
          }
        />
        <span className="field-note">
          {basisHint[filters.performance_basis ?? "composite"]}
        </span>
      </label>
      <div className="slider-field">
        <div>
          <label>Minimum performance percentile</label>
        </div>
        <RatioSlider
          label="Minimum performance score"
          value={filters.performance_min || 0}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => update("performance_min", Number(v) || undefined)}
        />
      </div>
      <h4 className="wide">Combat statistics</h4>
      {statRanges.map((range) => (
        <StatRange
          key={range.key}
          range={range}
          filters={filters}
          setFilters={setFilters}
        />
      ))}
    </FilterSection>
  );
}

function WeaponsSection({ filters, setFilters }: SectionProps) {
  return (
    <FilterSection
      id="weapons"
      filters={filters}
      setFilters={setFilters}
      description="Share of kills with the Operator. Use it to separate dedicated Operator players from rifle players in the same role. Other weapons are not tracked individually."
    >
      <div className="weapon-filter wide">
        <span className="weapon-filter-icons" aria-hidden="true">
          <WeaponIcon name="Operator" height={18} className="operator" />
        </span>
        <StatRange
          range={operatorRange}
          filters={filters}
          setFilters={setFilters}
        />
      </div>
    </FilterSection>
  );
}

function SampleSection({ filters, update, setFilters }: SectionProps) {
  return (
    <FilterSection id="sample" filters={filters} setFilters={setFilters}>
      <label>
        Minimum maps
        <input
          type="number"
          min={0}
          max={100000}
          value={filters.maps_min ?? ""}
          placeholder="No minimum"
          onChange={(e) =>
            update(
              "maps_min",
              e.target.value ? Number(e.target.value) : undefined,
            )
          }
        />
      </label>
    </FilterSection>
  );
}

function FilterNav({
  filters,
  active,
  onSelect,
}: {
  filters: Filters;
  active: FilterSectionId;
  onSelect: (id: FilterSectionId) => void;
}) {
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    nav.current
      ?.querySelector(".active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav className="filter-nav" aria-label="Filter sections" ref={nav}>
      {filterSections.map((s) => {
        const count = activeCount(filters, s.keys);

        return (
          <button
            key={s.id}
            type="button"
            className={active === s.id ? "active" : undefined}
            aria-current={active === s.id ? "true" : undefined}
            onClick={() => onSelect(s.id)}
          >
            <span className="filter-section-icon">{s.icon}</span>
            {s.label}
            {count > 0 && <span className="count-chip">{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function AdvancedFilters({
  advanced,
  setAdvanced,
  filters,
  meta,
  update,
  setFilters,
  pending,
  data,
  restoreDialogFocus,
}: {
  advanced: boolean;
  setAdvanced: (open: boolean) => void;
  filters: Filters;
  meta: Meta | null;
  update: UpdateFilter;
  setFilters: SetFilters;
  pending: boolean;
  data: Analysis | null;
  restoreDialogFocus: (event: Event) => void;
}) {
  const [active, setActive] = useState<FilterSectionId>("competition");
  const body = useRef<HTMLDivElement>(null);
  const lockedUntil = useRef(0);
  const props = { filters, meta, update, setFilters };

  function select(id: FilterSectionId) {
    setActive(id);
    // Keep the chosen section highlighted while smooth scrolling passes other sections.
    lockedUntil.current = Date.now() + 700;
    body.current
      ?.querySelector(`#filter-section-${id}`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function onScroll(element: HTMLDivElement) {
    if (Date.now() < lockedUntil.current) return;

    const top = element.getBoundingClientRect().top + 48;

    const sections = [
      ...element.querySelectorAll<HTMLElement>("[data-section]"),
    ];

    const current = sections.filter(
      (s) => s.getBoundingClientRect().top <= top,
    );

    const last =
      element.scrollTop + element.clientHeight >= element.scrollHeight - 4;

    const match = filterSections.find(
      (s) =>
        s.id ===
        (last ? sections.at(-1) : (current.at(-1) ?? sections[0]))?.dataset
          .section,
    );

    if (match) setActive(match.id);
  }

  return (
    <Dialog open={advanced} onOpenChange={setAdvanced}>
      <DialogContent
        size="xl"
        className="filters-dialog max-w-[1040px]"
        onCloseAutoFocus={restoreDialogFocus}
      >
        <DialogHeader className="dialog-header">
          <DialogTitle>Refine your cohort</DialogTitle>
          <DialogDescription>
            Filter players by competitive history, settings, and playstyle.
          </DialogDescription>
        </DialogHeader>
        <div className="filters-layout">
          <FilterNav filters={filters} active={active} onSelect={select} />
          <DialogBody
            ref={body}
            className="dialog-body filter-sections"
            onScroll={(event) => onScroll(event.currentTarget)}
          >
            <CompetitionSection {...props} />
            <EquipmentSection {...props} />
            <PlaystyleSection {...props} />
            <PerformanceSection {...props} />
            <WeaponsSection {...props} />
            <SampleSection {...props} />
          </DialogBody>
        </div>
        <div className="dialog-footer">
          <Button variant="ghost" onClick={() => setFilters({})}>
            <RotateCcw size={14} />
            Reset filters
          </Button>
          <span role="status" aria-live="polite">
            {pending
              ? "Calculating…"
              : `${data?.players.length || 0} matching players`}
          </span>
          <Button onClick={() => setAdvanced(false)}>
            View analysis
            <ArrowRight size={14} />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Overview({
  unit,
  setUnit,
  raw,
  setRaw,
  page,
  data,
  dpi,
  profile,
  setProfile,
  filters,
  update,
  setFilters,
  go,
  openPlayer,
  search,
}: {
  unit: string;
  setUnit: (unit: string) => void;
  raw: boolean;
  setRaw: (raw: boolean) => void;
  page: Page;
  data: Analysis;
  dpi: number;
  profile: Mechanical;
  setProfile: (profile: Mechanical) => void;
  filters: Filters;
  update: UpdateFilter;
  setFilters: SetFilters;
  go: (page: Page) => void;
  openPlayer: (player: Player, list?: Player[]) => void;
  search: RefObject<HTMLInputElement | null>;
}) {
  const summary = data.summary;

  return (
    <>
      {page === "profile" && (
        <ProfileEditor
          profile={profile}
          onChange={setProfile}
          roles={filters.roles ?? []}
          onRoles={(r) => updateList(setFilters, "roles", r)}
        />
      )}
      <SummaryMetrics data={data} dpi={dpi} />
      {summary && summary.effective_sample < 10 && (
        <div className="regularization-note" role="status">
          <Info size={15} />
          Small effective sample. Treat this as an exploratory starting point;
          uncertainty is unavailable below five effective players.
        </div>
      )}
      <div className="distribution-grid">
        <section className="panel distribution-panel">
          <SectionTitle
            title="Where the pros land"
            description="Weighted sensitivity distribution"
          >
            <div className="segmented small">
              <button
                className={unit === "sensitivity" ? "selected" : ""}
                onClick={() => setUnit("sensitivity")}
              >
                Sensitivity
              </button>
              <button
                className={unit === "edpi" ? "selected" : ""}
                onClick={() => setUnit("edpi")}
              >
                eDPI
              </button>
            </div>
          </SectionTitle>
          <Tabs defaultValue="density" className="chart-tabs">
            <div className="chart-toolbar">
              <TabsList>
                <TabItem value="density" label="Density" />
                <TabItem value="histogram" label="Histogram" />
              </TabsList>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={raw}
                  onChange={(e) => setRaw(e.target.checked)}
                />
                Show raw subgroup
              </label>
            </div>
            <TabPanel value="density">
              <Distribution data={data} dpi={dpi} unit={unit} raw={raw} />
            </TabPanel>
            <TabPanel value="histogram">
              <Distribution data={data} dpi={dpi} unit={unit} histogram />
            </TabPanel>
          </Tabs>
          {summary && summary.secondary_peaks.length > 0 && (
            <p className="secondary-peaks">
              Secondary support:{" "}
              {summary.secondary_peaks.map((p) => num(p / dpi, 3)).join(", ")} @{" "}
              {dpi} DPI
            </p>
          )}
          <div className="chart-axis-label">
            {unit === "edpi"
              ? "EFFECTIVE DPI"
              : "IN-GAME SENSITIVITY @ " + num(dpi) + " DPI"}
          </div>
          <div className="chart-footer">
            <span>
              <i className="legend-square" />
              Weighted density
            </span>
            <span>
              <i className="legend-dash" />
              Recommended peak
            </span>
          </div>
        </section>
      </div>
      {data.cohort && <CohortCombat profile={data.cohort} />}
      {page === "overview" && (
        <>
          <SectionTitle
            title="A different role. A different baseline."
            description="Explore how each role approaches sensitivity."
          >
            <button className="text-link" onClick={() => go("roles")}>
              Compare roles
              <ArrowRight size={14} />
            </button>
          </SectionTitle>
          <div className="role-cards">
            {data.roles.map((r, i) => {
              return (
                <button
                  className={
                    "role-card " +
                    (filters.roles?.includes(r.name) ? "role-selected" : "")
                  }
                  key={r.name}
                  aria-pressed={filters.roles?.includes(r.name) ?? false}
                  onClick={() =>
                    updateList(
                      setFilters,
                      "roles",
                      filters.roles?.includes(r.name)
                        ? filters.roles.filter((x) => x !== r.name)
                        : roles.filter(
                            (x) => x === r.name || filters.roles?.includes(x),
                          ),
                    )
                  }
                >
                  <div className="role-card-top">
                    <span style={{ color: colors.get(r.name) }}>
                      <RoleIcon role={r.name} size={16} />
                      {r.name}
                    </span>
                    <ArrowUpRight size={13} />
                  </div>
                  <MiniDensity group={r} index={i} />
                  <div className="role-card-bottom">
                    <strong>
                      {r.peak === null ? "—" : num(r.peak / dpi, 3)}
                    </strong>
                    <span>{r.count} players</span>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
      <PlayerTable
        players={data.players}
        onPlayer={openPlayer}
        compact
        searchRef={search}
        searchValue={filters.search || ""}
        onSearch={(v) => update("search", v)}
        onExpand={() => go("players")}
      />
    </>
  );
}

function ScatterExplorer({
  players,
  dpi,
  onPlayer,
}: {
  players: Player[];
  dpi: number;
  onPlayer: (p: Player) => void;
}) {
  const [axisKey, setAxisKey] = useState("performance");
  const axis = scatterAxes.find((a) => a.key === axisKey) ?? scatterAxes[0];

  return (
    <>
      <div className="scatter-control">
        <Choose
          label="Y axis"
          value={axis.key}
          options={scatterAxes.map((a) => a.key)}
          renderOption={(key) => scatterAxes.find((a) => a.key === key)?.label}
          onChange={setAxisKey}
          all={false}
        />
        <span>× sensitivity at {dpi} DPI</span>
      </div>
      <Scatter players={players} axis={axis} dpi={dpi} onPlayer={onPlayer} />
    </>
  );
}

function PlayerTable({
  players,
  onPlayer,
  compact = false,
  searchRef,
  searchValue,
  onSearch,
  onExpand,
}: {
  players: Player[];
  onPlayer: (p: Player, list?: Player[]) => void;
  compact?: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchValue: string;
  onSearch: (v: string) => void;
  onExpand?: () => void;
}) {
  const [sort, setSort] = useState<PlayerSortKey>("contribution");
  const [direction, setDirection] = useState(-1);
  const [view, setView] = useState<TableView>("settings");
  const batchSize = 30;
  const [visibleCount, setVisibleCount] = useState(batchSize);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () =>
      [...players].sort((a, b) => {
        return playerComparators[sort](a, b) * direction;
      }),
    [players, sort, direction],
  );

  useEffect(() => {
    setVisibleCount(batchSize);

    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [sorted]);
  const shown = sorted.slice(0, visibleCount);
  const hasMore = shown.length < sorted.length;
  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMore) return;
    let active = true;

    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount(Math.min(visibleCount + batchSize, sorted.length));
        }
      },
      { root: scrollRef.current, rootMargin: "0px 0px 240px 0px" },
    );

    observer.observe(sentinel);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, [sorted, hasMore, visibleCount]);

  const columns = tableColumns(compact ? "compact" : view);

  return (
    <section className="panel player-table-panel">
      <SectionTitle
        title={
          compact
            ? "The players behind the signal"
            : "Professional player database"
        }
        description={`${players.length} players in this cohort`}
      >
        <div className="table-actions">
          <div className="search-field">
            <Search size={14} />
            <input
              ref={searchRef}
              aria-label="Search players"
              placeholder="Search players…"
              value={searchValue}
              onChange={(e) => onSearch(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          {compact ? (
            <button className="text-link" onClick={onExpand}>
              All columns
              <ArrowUpRight size={14} />
            </button>
          ) : (
            <div
              className="segmented small"
              role="group"
              aria-label="Table columns"
            >
              {tableViews.map(([id, label]) => (
                <button
                  key={id}
                  className={view === id ? "selected" : ""}
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </SectionTitle>
      <div
        className="table-scroll"
        ref={scrollRef}
        onScroll={(event) => {
          const element = event.currentTarget;

          if (
            hasMore &&
            element.scrollTop + element.clientHeight >=
              element.scrollHeight - 240
          ) {
            setVisibleCount(Math.min(visibleCount + batchSize, sorted.length));
          }
        }}
        tabIndex={0}
        role="region"
        aria-label="Player table"
      >
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(({ key: k, label, icon }) => (
                <TableHead
                  key={k}
                  aria-sort={
                    sort === k
                      ? direction === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setSort(k);
                      setDirection(sort === k ? -direction : -1);
                    }}
                  >
                    {icon}
                    {label}
                    {sort === k && (
                      <ArrowDown
                        size={11}
                        style={{
                          transform:
                            direction === 1 ? "rotate(180deg)" : undefined,
                        }}
                      />
                    )}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((p, i) => (
              <TableRow
                key={p.id}
                index={i}
                className="clickable-row"
                onClick={(event) => {
                  // The name button stays the keyboard entry point; the row adds a larger pointer target.
                  if (!(event.target instanceof Element)) return;

                  if (event.target.closest("button")) return;
                  event.currentTarget
                    .querySelector<HTMLElement>(".player-name")
                    ?.focus();
                  onPlayer(p, sorted);
                }}
              >
                <TableCell>
                  <button
                    className="player-name"
                    onClick={() => onPlayer(p, sorted)}
                  >
                    <PlayerPortrait id={p.id} name={p.name} />
                    <span>
                      {p.name}
                      <small className="player-agents">
                        {p.agents.slice(0, 2).map((agent) => (
                          <span
                            className="agent-label"
                            key={agent.name}
                            role="img"
                            aria-label={agentDisplayName(agent.name)}
                            title={agentDisplayName(agent.name)}
                          >
                            <AgentIcon name={agent.name} size={18} />
                          </span>
                        ))}
                      </small>
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <span className="team-cell">
                    <TeamLabel team={p.team} />
                  </span>
                </TableCell>
                <TableCell>
                  <RoleBadge role={p.role} />
                </TableCell>
                {columns.slice(3).map((c) => (
                  <TableCell key={c.key} className={c.className ?? "mono"}>
                    {c.render(p)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {hasMore && (
          <div
            ref={sentinelRef}
            className="table-sentinel"
            aria-hidden="true"
          />
        )}
      </div>
      {!shown.length && (
        <div className="empty-state">
          <Search size={24} />
          <h3>No players in this cohort</h3>
          <p>
            Clear your search or widen the filters to discover more players.
          </p>
        </div>
      )}
      <div className="table-footer">
        <span role="status" aria-live="polite" aria-atomic="true">
          {shown.length} of {players.length} players
        </span>
        <span>
          Click a player to explore
          <ArrowUpRight size={11} />
        </span>
      </div>
    </section>
  );
}

function ProfileEditor({
  profile,
  onChange,
  roles: selectedRoles,
  onRoles,
}: {
  profile: Mechanical;
  onChange: (m: Mechanical) => void;
  roles: string[];
  onRoles: (r: string[]) => void;
}) {
  const presets = [
    {
      name: "Anchor Sentinel",
      agents: [],
      role: "Sentinel",
      v: {
        operator: 0.1,
        movement: 0.1,
        entry: 0.2,
        anchor: 0.9,
        utility: 0.5,
      },
    },
    {
      name: "Chamber Operator",
      agents: ["chamber"],
      role: "Sentinel",
      v: {
        operator: 0.85,
        movement: 0.15,
        entry: 0.5,
        anchor: 0.5,
        utility: 0.2,
      },
    },
    {
      name: "Raze / Neon entry",
      agents: ["raze", "neon"],
      role: "Duelist",
      v: {
        operator: 0.05,
        movement: 0.95,
        entry: 0.9,
        anchor: 0.05,
        utility: 0.25,
      },
    },
    {
      name: "Jett Operator",
      agents: ["jett"],
      role: "Duelist",
      v: {
        operator: 0.8,
        movement: 0.8,
        entry: 0.85,
        anchor: 0.05,
        utility: 0.1,
      },
    },
  ];

  return (
    <section className="panel profile-editor">
      <SectionTitle
        title="Build your mechanical profile"
        description="Continuous scores match you with similar professionals. Recommendations update as you adjust."
      />
      <div className="profile-presets">
        {presets.map((p) => (
          <Button
            key={p.name}
            variant="tertiary"
            onClick={() => {
              onRoles([p.role]);
              onChange(p.v);
            }}
          >
            {p.agents.length ? (
              <span className="agent-icon-group">
                {p.agents.map((agent) => (
                  <AgentIcon key={agent} name={agent} />
                ))}
              </span>
            ) : (
              <RoleIcon role={p.role} />
            )}
            {p.name}
          </Button>
        ))}
      </div>
      <div className="profile-layout">
        <div className="profile-sliders">
          <MultiSelect
            label="All roles"
            values={selectedRoles}
            options={roles}
            renderOption={(role) => <RoleBadge role={role} />}
            onChange={onRoles}
          />
          {mechanics.map(([k, l]) => (
            <div className="slider-field" key={k}>
              <div>
                <label>{l}</label>
              </div>
              <RatioSlider
                label={l}
                value={profile[k]}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => onChange({ ...profile, [k]: Number(v) })}
              />
            </div>
          ))}
        </div>
        <div className="profile-preview">
          <MechanicalRadar profile={profile} />
          <Badge tone="green">
            <Activity size={11} />
            LIVE PROFILE MATCH
          </Badge>
        </div>
      </div>
    </section>
  );
}

function equipmentRanges(meta: Meta | null) {
  return [
    {
      label: "eDPI",
      key: "edpi" as const,
      max: meta?.setting_ranges?.edpi ?? 10000,
      step: 0.1,
      precision: 1,
    },
    {
      label: "Native sensitivity",
      key: "sensitivity" as const,
      max: meta?.setting_ranges?.sensitivity ?? 10,
      step: 0.001,
      precision: 3,
    },
    {
      label: "Native DPI",
      key: "dpi" as const,
      max: meta?.setting_ranges?.dpi ?? 100000,
      step: 1,
      precision: 0,
    },
  ];
}

const tableStats = [
  "rating",
  "kd",
  "kda",
  "adr",
  "kast",
  "hs",
  "fk_per_round",
  "op_kill_share",
] as const satisfies readonly StatKey[];

const tableStatLabels: Record<(typeof tableStats)[number], string> = {
  rating: "Rating",
  kd: "K/D",
  kda: "KDA",
  adr: "ADR",
  kast: "KAST",
  hs: "HS%",
  fk_per_round: "FK / rd",
  op_kill_share: "Op kills",
};

function compareStat(key: StatKey) {
  return (a: Player, b: Player) =>
    (a.stats[key] ?? -Infinity) - (b.stats[key] ?? -Infinity);
}

const playerComparators = {
  name: (a: Player, b: Player) => a.name.localeCompare(b.name),
  team: (a: Player, b: Player) => a.team.localeCompare(b.team),
  role: (a: Player, b: Player) => a.role.localeCompare(b.role),
  dpi: (a: Player, b: Player) => a.setting.dpi - b.setting.dpi,
  sensitivity: (a: Player, b: Player) =>
    a.setting.sensitivity - b.setting.sensitivity,
  edpi: (a: Player, b: Player) => a.edpi - b.edpi,
  normalized_800: (a: Player, b: Player) => a.normalized_800 - b.normalized_800,
  performance: (a: Player, b: Player) => a.performance - b.performance,
  maps: (a: Player, b: Player) => a.maps - b.maps,
  contribution: (a: Player, b: Player) => a.contribution - b.contribution,
  achievement: (a: Player, b: Player) =>
    (a.achievement ?? -1) - (b.achievement ?? -1),
  operator: (a: Player, b: Player) =>
    a.mechanical.operator - b.mechanical.operator,
  movement: (a: Player, b: Player) =>
    a.mechanical.movement - b.mechanical.movement,
  entry: (a: Player, b: Player) => a.mechanical.entry - b.mechanical.entry,
  anchor: (a: Player, b: Player) => a.mechanical.anchor - b.mechanical.anchor,
  utility: (a: Player, b: Player) =>
    a.mechanical.utility - b.mechanical.utility,
  rating: compareStat("rating"),
  kd: compareStat("kd"),
  kda: compareStat("kda"),
  adr: compareStat("adr"),
  kast: compareStat("kast"),
  hs: compareStat("hs"),
  fk_per_round: compareStat("fk_per_round"),
  op_kill_share: compareStat("op_kill_share"),
};

type PlayerSortKey = keyof typeof playerComparators;

type TableView = "settings" | "combat" | "mechanics";

const tableViews: [TableView, string][] = [
  ["settings", "Settings"],
  ["combat", "Combat"],
  ["mechanics", "Mechanics"],
];

type Column = {
  key: PlayerSortKey;
  label: string;
  icon?: ReactNode;
  className?: string;
  render: (p: Player) => ReactNode;
};

const performanceColumn: Column = {
  key: "performance",
  label: "Performance",
  className: "",
  render: (p) => (
    <span className="performance-cell">
      <i style={{ width: p.performance * 36 }} />
      {num(p.performance * 100, 1)}
    </span>
  ),
};

const settingColumns: Column[] = [
  {
    key: "dpi",
    label: "DPI",
    className: "mono muted",
    render: (p) => num(p.setting.dpi),
  },
  {
    key: "sensitivity",
    label: "Native sens",
    render: (p) => num(p.setting.sensitivity, 3),
  },
  { key: "edpi", label: "eDPI", render: (p) => num(p.edpi, 1) },
  {
    key: "normalized_800",
    label: "@ 800 DPI",
    className: "mono accent",
    render: (p) => num(p.normalized_800, 3),
  },
];

const trailingColumns: Column[] = [
  {
    key: "maps",
    label: "Maps",
    className: "mono muted",
    render: (p) => num(p.maps),
  },
  {
    key: "contribution",
    label: "Weight",
    render: (p) => `${num(p.contribution * 100, 2)}%`,
  },
];

const statColumns: Column[] = tableStats.map((key) => ({
  key,
  label: tableStatLabels[key],
  icon:
    key === "op_kill_share" ? (
      <WeaponIcon name="Operator" height={8} className="column-weapon" />
    ) : undefined,
  render: (p: Player) => formatStat(key, p.stats[key]),
}));

function tableColumns(view: TableView | "compact"): Column[] {
  const identity: Column[] = [
    { key: "name", label: "Player", render: () => null },
    { key: "team", label: "Team", render: () => null },
    { key: "role", label: "Role", render: () => null },
  ];

  const middle: Record<TableView | "compact", Column[]> = {
    compact: [...settingColumns, performanceColumn],
    settings: [
      ...settingColumns,
      performanceColumn,
      {
        key: "achievement",
        label: "Achievement",
        render: (p) =>
          p.achievement === null ? "—" : num(p.achievement * 100, 1),
      },
    ],
    combat: [
      { key: "edpi", label: "eDPI", render: (p) => num(p.edpi, 1) },
      performanceColumn,
      ...statColumns,
    ],
    mechanics: [
      { key: "edpi", label: "eDPI", render: (p) => num(p.edpi, 1) },
      ...mechanics.map(([k, l]): Column => ({
        key: k,
        label: l,
        className: "mono muted",
        render: (p) => `${num(p.mechanical[k] * 100)}%`,
      })),
    ],
  };

  return [...identity, ...middle[view], ...trailingColumns];
}
