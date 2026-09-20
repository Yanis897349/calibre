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
  ChevronRight,
  Focus,
  Info,
  Layers3,
  Menu,
  Mouse,
  Search,
  Settings2,
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
  type Player,
  type Mechanical,
  roles,
  styles,
  mechanics,
  colors,
  num,
  date,
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

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"badge " + tone}>{children}</span>;
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="role-badge" style={{ color: colors.get(role) }}>
      <RoleIcon role={role} />
      {role}
    </span>
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

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [filters, setFilters] = useState<Filters>({});
  const [dpi, setDpi] = useState(800);
  const [data, setData] = useState<Analysis | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const [retry, setRetry] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(defaultProfile);
  const [unit, setUnit] = useState("sensitivity");
  const [raw, setRaw] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const dialogOpener = useRef<HTMLElement | SVGElement | null>(null);

  function openPlayer(player: Player) {
    const activeElement = document.activeElement;
    dialogOpener.current =
      activeElement instanceof HTMLElement ||
      activeElement instanceof SVGElement
        ? activeElement
        : null;
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

  const summary = data?.summary;

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
            update={update}
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
                  go={go}
                  openPlayer={openPlayer}
                  search={search}
                />
              )}
              {["roles", "styles"].includes(page) && (
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
                      {(page === "roles" ? data.roles : data.styles).map(
                        (g, i) => (
                          <span key={g.name}>
                            {page === "roles" ? (
                              <RoleBadge role={g.name} />
                            ) : (
                              <>
                                <i
                                  style={{
                                    background: [
                                      "#c6f27b",
                                      "#a68bea",
                                      "#71bdd8",
                                      "#e5ab70",
                                      "#c9a7c4",
                                      "#ee8181",
                                      "#9da1a8",
                                    ][i],
                                  }}
                                />
                                {g.name}
                              </>
                            )}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="comparison-cards">
                    {(page === "roles" ? data.roles : data.styles).map(
                      (g, i) => (
                        <div className="panel compare-card" key={g.name}>
                          <SectionTitle
                            title={
                              page === "roles" ? (
                                <RoleBadge role={g.name} />
                              ) : (
                                g.name
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
                          <Button
                            variant="tertiary"
                            onClick={() => {
                              update(
                                page === "roles" ? "role" : "style",
                                g.name,
                              );
                              go("overview");
                            }}
                          >
                            Explore cohort
                            <ArrowUpRight size={14} />
                          </Button>
                        </div>
                      ),
                    )}
                  </div>
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
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          size="xl"
          className="player-dialog"
          onCloseAutoFocus={restoreDialogFocus}
        >
          {selected && (
            <PlayerDetail
              player={selected}
              recommendation={summary?.peak}
              dpi={dpi}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type UpdateFilter = <K extends keyof Filters>(
  key: K,
  value: Filters[K],
) => void;

type SetFilters = Dispatch<SetStateAction<Filters>>;

function CohortControls({
  filters,
  meta,
  dpi,
  setDpi,
  update,
  setFilters,
  onAdvanced,
}: {
  filters: Filters;
  meta: Meta | null;
  dpi: number;
  setDpi: (dpi: number) => void;
  update: UpdateFilter;
  setFilters: SetFilters;
  onAdvanced: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const [customDpi, setCustomDpi] = useState("800");
  const [custom, setCustom] = useState(false);

  const active = Object.entries(filters).filter(
    ([, v]) => v !== undefined && v !== "",
  );

  return (
    <>
      <section className="filter-bar" aria-label="Cohort filters">
        <div className="filter-main">
          <span className="filter-caption">
            <SlidersHorizontal size={14} />
            Cohort
          </span>
          <Choose
            label="All roles"
            value={filters.role}
            options={roles}
            renderOption={(role) => <RoleBadge role={role} />}
            onChange={(v) => update("role", v)}
          />
          <Choose
            label="All regions"
            value={filters.region}
            options={meta?.regions || []}
            onChange={(v) => update("region", v)}
          />
          <Choose
            label="All seasons"
            value={filters.year?.toString()}
            options={meta?.years || []}
            onChange={(v) => update("year", v ? Number(v) : undefined)}
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
            {[400, 800, 1600].map((d) => (
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
          {active.map(([k, v]) => (
            <button
              key={k}
              onClick={() => {
                // SAFETY: active contains only own entries from the typed Filters state.
                update(k as keyof Filters, undefined);
              }}
            >
              {k === "agent" && <AgentIcon name={String(v)} size={18} />}
              {k === "role" && <RoleIcon role={String(v)} />}
              {k === "team" && <TeamIcon team={String(v)} size={18} />}
              {k.charAt(0).toUpperCase() +
                k.slice(1).replaceAll("_", " ")}:{" "}
              {k === "agent" ? agentDisplayName(String(v)) : String(v)}
              <X size={11} />
            </button>
          ))}
          <button className="clear-filters" onClick={() => setFilters({})}>
            Clear all
          </button>
        </div>
      )}
    </>
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
  return (
    <Dialog open={advanced} onOpenChange={setAdvanced}>
      <DialogContent
        size="xl"
        className="filters-dialog"
        onCloseAutoFocus={restoreDialogFocus}
      >
        <DialogHeader className="dialog-header">
          <DialogTitle>Refine your cohort</DialogTitle>
          <DialogDescription>
            Filter players by competitive history, settings, and playstyle.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="dialog-body">
          <div className="advanced-grid">
            <div>
              <h3>Competition & equipment</h3>
              <label>
                Agent
                <Choose
                  label="All agents"
                  value={filters.agent}
                  options={meta?.agents || []}
                  renderOption={(agent) => (
                    <span className="agent-label">
                      <AgentIcon name={agent} />
                      <span>{agentDisplayName(agent)}</span>
                    </span>
                  )}
                  onChange={(v) => update("agent", v)}
                />
              </label>
              <label>
                Team
                <Choose
                  label="All teams"
                  value={filters.team}
                  options={meta?.teams || []}
                  renderOption={(team) => <TeamLabel team={team} size={20} />}
                  onChange={(v) => update("team", v)}
                />
              </label>
              <label>
                Tournament
                <Choose
                  label="All tournaments"
                  value={filters.tournament}
                  options={meta?.tournaments || []}
                  onChange={(v) => update("tournament", v)}
                />
              </label>
              <label>
                Event tier
                <Choose
                  label="All tiers"
                  value={filters.tier}
                  options={meta?.tiers || []}
                  onChange={(v) => update("tier", v)}
                />
              </label>
              <label>
                Mechanical style
                <Choose
                  label="All styles"
                  value={filters.style}
                  options={styles}
                  onChange={(v) => update("style", v)}
                />
              </label>
              {equipmentRanges(meta).map(
                ({ label, key, max, step, precision }) => {
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
                        formatValue={(v) =>
                          num(v, Number.isInteger(v) ? 0 : precision)
                        }
                        onChange={(values) => {
                          if (Array.isArray(values))
                            setFilters((current) => ({
                              ...current,
                              [minimum]:
                                values[0] === 0 ? undefined : values[0],
                              [maximum]:
                                values[1] === max ? undefined : values[1],
                            }));
                        }}
                      />
                    </div>
                  );
                },
              )}
            </div>
            <div>
              <h3>Mechanical profile</h3>
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
              <h3>Sample quality</h3>
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
              <div className="slider-field">
                <div>
                  <label>Minimum performance score</label>
                </div>
                <RatioSlider
                  label="Minimum performance score"
                  value={filters.performance_min || 0}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(v) =>
                    update("performance_min", Number(v) || undefined)
                  }
                />
              </div>
            </div>
          </div>
        </DialogBody>
        <div className="dialog-footer">
          <Button variant="ghost" onClick={() => setFilters({})}>
            <RotateCcw size={14} />
            Reset filters
          </Button>
          <span>
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
  go: (page: Page) => void;
  openPlayer: (player: Player) => void;
  search: RefObject<HTMLInputElement | null>;
}) {
  const summary = data.summary;

  return (
    <>
      {page === "profile" && (
        <ProfileEditor
          profile={profile}
          onChange={setProfile}
          role={filters.role}
          onRole={(r) => update("role", r)}
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
                    (filters.role === r.name ? "role-selected" : "")
                  }
                  key={r.name}
                  onClick={() =>
                    update("role", filters.role === r.name ? undefined : r.name)
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

const scatterAxes = [
  "performance",
  "operator",
  "movement",
  "entry",
  "anchor",
  "utility",
] as const;

function ScatterExplorer({
  players,
  dpi,
  onPlayer,
}: {
  players: Player[];
  dpi: number;
  onPlayer: (p: Player) => void;
}) {
  const [axis, setAxis] = useState<"performance" | keyof Mechanical>(
    "performance",
  );

  return (
    <>
      <div className="scatter-control">
        <Choose
          label="Y axis"
          value={axis}
          options={[...scatterAxes]}
          onChange={(value) => {
            const selectedAxis = scatterAxes.find((option) => option === value);

            if (selectedAxis) setAxis(selectedAxis);
          }}
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
  onPlayer: (p: Player) => void;
  compact?: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchValue: string;
  onSearch: (v: string) => void;
  onExpand?: () => void;
}) {
  const [sort, setSort] = useState<PlayerSortKey>("contribution");
  const [direction, setDirection] = useState(-1);
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

  const cols: [PlayerSortKey, string][] = [
    ["name", "Player"],
    ["team", "Team"],
    ["role", "Role"],
    ["dpi", "DPI"],
    ["sensitivity", "Native sens"],
    ["edpi", "eDPI"],
    ["normalized_800", "@ 800 DPI"],
    ["performance", "Performance"],
    ["maps", "Maps"],
    ["contribution", "Weight"],
  ];

  if (!compact)
    cols.splice(
      8,
      0,
      ["achievement", "Achievement"],
      ...mechanics.map(([k, l]): [PlayerSortKey, string] => [k, l]),
    );

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
          {compact && (
            <button className="text-link" onClick={onExpand}>
              All columns
              <ArrowUpRight size={14} />
            </button>
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
              {cols.map(([k, label]) => (
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
              <TableRow key={p.id} index={i}>
                <TableCell>
                  <button className="player-name" onClick={() => onPlayer(p)}>
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
                <TableCell className="mono muted">
                  {num(p.setting.dpi)}
                </TableCell>
                <TableCell className="mono">
                  {num(p.setting.sensitivity, 3)}
                </TableCell>
                <TableCell className="mono">{num(p.edpi, 1)}</TableCell>
                <TableCell className="mono accent">
                  {num(p.normalized_800, 3)}
                </TableCell>
                <TableCell>
                  <span className="performance-cell">
                    <i style={{ width: p.performance * 36 }} />
                    {num(p.performance * 100, 1)}
                  </span>
                </TableCell>
                {!compact && (
                  <>
                    <TableCell className="mono">
                      {p.achievement === null
                        ? "—"
                        : num(p.achievement * 100, 1)}
                    </TableCell>
                    {mechanics.map(([k]) => (
                      <TableCell key={k} className="mono muted">
                        {num(p.mechanical[k] * 100)}%
                      </TableCell>
                    ))}
                  </>
                )}
                <TableCell className="mono muted">{num(p.maps)}</TableCell>
                <TableCell className="mono">
                  {num(p.contribution * 100, 2)}%
                </TableCell>
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
  role,
  onRole,
}: {
  profile: Mechanical;
  onChange: (m: Mechanical) => void;
  role?: string;
  onRole: (r: string) => void;
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
              onRole(p.role);
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
          <Choose
            label="All roles"
            value={role}
            options={roles}
            renderOption={(role) => <RoleBadge role={role} />}
            onChange={onRole}
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

function PlayerDetail({
  player: p,
  recommendation,
  dpi,
}: {
  player: Player;
  recommendation?: number;
  dpi: number;
}) {
  const roleHistory = useMemo(() => {
    const groups: { role: string; years: number[] }[] = [];

    const entries = Object.entries(p.role_history).sort(
      ([a], [b]) => Number(b) - Number(a),
    );

    for (const [year, role] of entries) {
      const previous = groups.at(-1);
      const numericYear = Number(year);

      if (
        previous?.role === role &&
        previous.years.at(-1)! - numericYear === 1
      ) {
        previous.years.push(numericYear);
      } else {
        groups.push({ role, years: [numericYear] });
      }
    }

    return groups;
  }, [p.role_history]);

  const observations = useMemo(() => {
    const history = [...p.history].sort(
      (a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at),
    );

    // Keep same-day setting changes and reversions when collapsing duplicate readings.
    return history.filter((setting, index) => {
      const previous = history[index - 1];

      return (
        !previous ||
        date(setting.observed_at) !== date(previous.observed_at) ||
        setting.dpi !== previous.dpi ||
        setting.sensitivity !== previous.sensitivity
      );
    });
  }, [p.history]);

  return (
    <>
      <div className="dialog-header player-detail-heading">
        <PlayerPortrait id={p.id} name={p.name} size={56} />
        <div>
          <DialogTitle>{p.name}</DialogTitle>
          <DialogDescription className="player-detail-meta">
            <TeamLabel team={p.team} size={20} />
            <span>
              {p.region} · {num(p.maps)} maps
            </span>
          </DialogDescription>
        </div>
        <RoleBadge role={p.role} />
      </div>
      <DialogBody className="dialog-body">
        <div className="detail-metrics">
          <div>
            <span>eDPI</span>
            <strong>{num(p.edpi, 1)}</strong>
          </div>
          <div>
            <span>Sensitivity @ {dpi} DPI</span>
            <strong className="accent">{num(p.edpi / dpi, 3)}</strong>
          </div>
          <div>
            <span>Current cohort influence</span>
            <strong>{num(p.contribution * 100, 2)}%</strong>
          </div>
          <div>
            <span>Distance from peak</span>
            <strong>
              {recommendation
                ? `${p.edpi >= recommendation ? "+" : ""}${num((p.edpi / recommendation - 1) * 100, 1)}%`
                : "—"}
            </strong>
          </div>
        </div>
        <div className="detail-grid">
          <section>
            <h3>Mechanical fingerprint</h3>
            <MechanicalRadar profile={p.mechanical} />
            {mechanics.map(([k, l]) => (
              <div className="detail-bar" key={k}>
                <span>{l}</span>
                <div>
                  <i style={{ width: `${p.mechanical[k] * 100}%` }} />
                </div>
                <strong>{num(p.mechanical[k] * 100)}%</strong>
              </div>
            ))}
          </section>
          <section>
            <h3>Agent usage</h3>
            {p.agents.slice(0, 6).map((a) => (
              <div className="agent-row" key={a.name}>
                <AgentIcon name={a.name} size={32} />
                <span>{agentDisplayName(a.name)}</span>
                <span>{num(a.share * 100)}%</span>
                <small>{a.maps} maps</small>
              </div>
            ))}
            <h3>Performance & contribution</h3>
            <div className="insight-detail">
              <span>Rating / ACS</span>
              <strong>
                {num(p.rating, 2)} / {num(p.acs, 1)}
              </strong>
            </div>
            <div className="insight-detail">
              <span>Individual performance</span>
              <strong>{num(p.performance * 100, 1)} / 100</strong>
            </div>
            <div className="insight-detail">
              <span>Achievement score</span>
              <strong>
                {p.achievement == null ? "—" : num(p.achievement * 100, 1)}
              </strong>
            </div>
            <div className="insight-detail">
              <span>Reliability / raw weight</span>
              <strong>
                {num(p.reliability * 100)}% / {num(p.weight, 3)}
              </strong>
            </div>
            <div className="insight-detail">
              <span>Last competitive activity</span>
              <strong>{date(p.last_played)}</strong>
            </div>
          </section>
        </div>
        <h3>Role history</h3>
        <div
          className="role-history"
          role="list"
          aria-label="Roles, newest first"
        >
          {roleHistory.map(({ years, role }) => (
            <div className="role-history-period" key={years[0]} role="listitem">
              <div className="role-history-years">
                {years.map((year) => (
                  <span key={year}>{year}</span>
                ))}
              </div>
              <div className="role-history-detail">
                <RoleBadge role={role} />
                {years.length > 1 && <small>{years.length} seasons</small>}
              </div>
            </div>
          ))}
        </div>
        <h3>Sensitivity observations</h3>
        <div className="observations">
          {observations.map((s, i) => (
            <div key={i}>
              <span className="status-dot" />
              <span>{date(s.observed_at)}</span>
              <strong>
                {num(s.dpi)} DPI × {num(s.sensitivity, 3)}
              </strong>
              <span>{num(s.dpi * s.sensitivity, 1)} eDPI</span>
            </div>
          ))}
        </div>
        <h3>Tournament history</h3>
        {p.events.length ? (
          p.events.map((e, i) => (
            <div className="event-row" key={i}>
              <span>{e.tournament}</span>
              <Badge>#{e.placement}</Badge>
              <span>{e.year}</span>
            </div>
          ))
        ) : (
          <p className="muted">No tournament results available.</p>
        )}
      </DialogBody>
    </>
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
};

type PlayerSortKey = keyof typeof playerComparators;
