import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCopy } from "./hooks/use-copy";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Link2,
  Medal,
  TriangleAlert,
} from "lucide-react";
import {
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog";
import { Tabs, TabsList, TabItem, TabPanel } from "./components/ui/tabs";
import { AgentIcon, agentDisplayName } from "./components/agent-icon";
import { MapThumb, WeaponIcon, mapInfo } from "./components/game-media";
import { PlayerPortrait, TeamLabel } from "./components/identity-media";
import { Badge, RoleBadge } from "./components/badges";
import { MechanicalRadar } from "./charts";
import { CompareTab } from "./player-compare";
import {
  StatTile,
  UsageBars,
  WeaponSplit,
  headline,
  percentileTone,
} from "./combat";
import { type StatKey, formatStat, statByKey } from "./metrics";
import {
  type CombatStats,
  type MapUsage,
  type Player,
  type Setting,
  colors,
  date,
  mechanics,
  num,
  pct,
} from "./types";

type Tab = "overview" | "combat" | "pool" | "setup" | "career" | "compare";

const tabs: [Tab, string][] = [
  ["overview", "Overview"],
  ["combat", "Combat"],
  ["pool", "Agents & maps"],
  ["setup", "Setup"],
  ["career", "Career"],
  ["compare", "Compare"],
];

const profileMetrics: StatKey[] = [
  "rating",
  "adr",
  "kd",
  "kda",
  "kast",
  "hs",
  "acs",
];

const statGroups: { title: string; keys: StatKey[] }[] = [
  {
    title: "Per round",
    keys: ["kpr", "dpr", "apr", "multi_kill_rate", "acs"],
  },
  {
    title: "Clutch & objectives",
    keys: ["clutches_per_100", "plants_per_100"],
  },
];

const converterDpis = [400, 800, 1600, 3200];

function Total({ count, word }: { count: number; word: string }) {
  return (
    <span>
      <strong>{count}</strong>
      {count === 1 ? word : word + "s"}
    </span>
  );
}

export type CohortSummary = {
  peak: number;
  range: [number, number];
};

export function CopyButton({
  label,
  done,
  onCopy,
}: {
  label: string;
  done: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      className={"copy-button" + (done ? " done" : "")}
      aria-label={label}
      title={done ? "Copied" : label}
      onClick={onCopy}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      <span aria-live="polite">{done ? "Copied" : "Copy"}</span>
    </button>
  );
}

function Gauge({ value }: { value: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      className={"gauge " + percentileTone(value)}
      viewBox="0 0 36 36"
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r={radius} />
      <circle
        cx="18"
        cy="18"
        r={radius}
        strokeDasharray={`${value * circumference} ${circumference}`}
      />
    </svg>
  );
}

function HeroMetric({
  label,
  children,
  note,
  accent = false,
  aside,
}: {
  label: string;
  children: ReactNode;
  note?: ReactNode;
  accent?: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="hero-metric">
      <span>{label}</span>
      <div>
        <strong className={accent ? "accent" : undefined}>{children}</strong>
        {aside}
      </div>
      {note && <small>{note}</small>}
    </div>
  );
}

function PercentileRow({ player: p, stat }: { player: Player; stat: StatKey }) {
  const definition = statByKey.get(stat);
  const metric = definition?.percentile;
  const percentile = metric ? p.percentiles[metric] : undefined;

  return (
    <div className="percentile-row" title={definition?.description}>
      <span>{definition?.label}</span>
      <div className="percentile-bar">
        {percentile != null && (
          <i
            className={percentileTone(percentile)}
            style={{ width: `${percentile * 100}%` }}
          />
        )}
        <b aria-hidden="true" />
      </div>
      <strong>{formatStat(stat, p.stats[stat])}</strong>
      <small className={percentile == null ? "" : percentileTone(percentile)}>
        {percentile == null ? "—" : `P${num(percentile * 100)}`}
      </small>
    </div>
  );
}

function bestMap(pool: MapUsage[]) {
  const qualified = pool.filter((m) => m.maps >= 3 && m.kd != null);

  return [...(qualified.length ? qualified : pool)].sort(
    (a, b) => (b.kd ?? 0) - (a.kd ?? 0),
  )[0];
}

function Signature({ player: p }: { player: Player }) {
  const main = p.agents[0];
  const map = bestMap(p.map_pool);
  const topStyle = Object.entries(p.styles).sort(([, a], [, b]) => b - a)[0];

  return (
    <div className="signature-grid">
      {main && (
        <div className="signature-card">
          <AgentIcon name={main.name} size={44} />
          <div>
            <span>Main agent</span>
            <strong>{agentDisplayName(main.name)}</strong>
            <small>
              {pct(main.share)} of maps · {num(main.maps)} maps
            </small>
          </div>
        </div>
      )}
      {map && (
        <div className="signature-card map-signature">
          <MapThumb name={map.name} />
          <div>
            <span>Best map</span>
            <strong>{map.name}</strong>
            <small>
              {num(map.kd, 2)} K/D · {num(map.maps)} maps
            </small>
          </div>
        </div>
      )}
      <div className="signature-card weapon-signature">
        <span className="signature-weapon">
          <WeaponIcon name="Operator" height={18} />
        </span>
        <div>
          <span>Operator use</span>
          <strong>{pct(p.stats.op_kill_share, 1)}</strong>
          <small>of kills with the Operator</small>
        </div>
      </div>
      {topStyle && (
        <div className="signature-card">
          <span className="signature-score">
            <Gauge value={topStyle[1]} />
          </span>
          <div>
            <span>Closest style</span>
            <strong>{topStyle[0]}</strong>
            <small>{pct(topStyle[1])} style match</small>
          </div>
        </div>
      )}
    </div>
  );
}

function OverviewTab({ player: p }: { player: Player }) {
  return (
    <>
      <Signature player={p} />
      <div className="detail-columns">
        <section className="detail-card">
          <h3>Performance profile</h3>
          <p className="card-note">
            Percentile against every professional’s career. The tick marks the
            median.
          </p>
          {profileMetrics.map((stat) => (
            <PercentileRow key={stat} player={p} stat={stat} />
          ))}
          <h3>Most played agents</h3>
          <UsageBars
            items={p.agents}
            agent
            limit={5}
            detail={(a) => `${num(a.maps)} maps`}
          />
        </section>
        <section className="detail-card">
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
      </div>
    </>
  );
}

function OpeningDuels({ stats: s }: { stats: CombatStats }) {
  const first = s.fk_per_round ?? 0;
  const lost = s.fd_per_round ?? 0;
  const total = first + lost;

  return (
    <div className="duel">
      <div className="duel-bar" aria-hidden="true">
        <i style={{ width: total ? `${(first / total) * 100}%` : "50%" }} />
      </div>
      <div className="duel-legend">
        <span>
          <b className="won" /> First kills
          <strong>{formatStat("fk_per_round", s.fk_per_round)} / rd</strong>
        </span>
        <span>
          <b className="lost" /> First deaths
          <strong>{formatStat("fd_per_round", s.fd_per_round)} / rd</strong>
        </span>
      </div>
      <div className="insight-detail">
        <span>Opening success</span>
        <strong>{formatStat("opening_success", s.opening_success)}</strong>
      </div>
    </div>
  );
}

function CombatTab({
  player: p,
  baseline,
}: {
  player: Player;
  baseline?: CombatStats;
}) {
  return (
    <>
      <h3 className="first-heading">Combat statistics</h3>
      <p className="card-note combat-note">
        {num(p.stats.rounds)} rounds in the selected cohort. Percentiles compare
        this sample with every professional’s career after pulling small samples
        toward the league average
        {baseline ? "; arrows compare it with the cohort." : "."}
      </p>
      <div className="stat-grid">
        {headline.map((key) => {
          const metric = statByKey.get(key)?.percentile;

          return (
            <StatTile
              key={key}
              stat={key}
              value={p.stats[key]}
              percentile={metric ? p.percentiles[metric] : undefined}
              baseline={baseline ? baseline[key] : undefined}
            />
          );
        })}
      </div>
      <div className="detail-columns three">
        <section className="detail-card">
          <h3>Weapons</h3>
          <WeaponSplit stats={p.stats} />
        </section>
        <section className="detail-card">
          <h3>Opening duels</h3>
          <OpeningDuels stats={p.stats} />
        </section>
        <section className="detail-card">
          {statGroups.map((group) => (
            <div key={group.title} className="stat-group">
              <h3>{group.title}</h3>
              {group.keys.map((key) => (
                <div
                  className="insight-detail"
                  key={key}
                  title={statByKey.get(key)?.description}
                >
                  <span>{statByKey.get(key)?.label}</span>
                  <strong>{formatStat(key, p.stats[key])}</strong>
                </div>
              ))}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function PoolTab({ player: p }: { player: Player }) {
  const overall = p.stats.kd;

  return (
    <>
      <h3 className="first-heading">Agent pool</h3>
      <div className="agent-cards">
        {p.agents.map((a) => (
          <div className="agent-card" key={a.name}>
            <AgentIcon name={a.name} size={40} />
            <div>
              <strong>{agentDisplayName(a.name)}</strong>
              <small>{num(a.maps)} maps</small>
            </div>
            <span className="agent-card-share">{pct(a.share)}</span>
            <div className="agent-card-bar" aria-hidden="true">
              <i style={{ width: `${a.share * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <h3>Map pool</h3>
      <div className="map-cards">
        {p.map_pool.map((m) => {
          const delta = overall && m.kd != null ? m.kd / overall - 1 : null;

          return (
            <div className="map-card" key={m.name}>
              <MapThumb name={m.name} />
              <div className="map-card-body">
                <div>
                  <strong>{m.name}</strong>
                  <small>
                    {num(m.maps)} maps · {pct(m.share)}
                    {mapInfo(m.name) ? ` · ${mapInfo(m.name).sites}` : ""}
                  </small>
                </div>
                <div className="map-card-stats">
                  <span
                    className={
                      delta == null
                        ? ""
                        : delta >= 0.03
                          ? "better"
                          : delta <= -0.03
                            ? "worse"
                            : ""
                    }
                  >
                    {num(m.kd, 2)}
                    <small>K/D</small>
                  </span>
                  <span>
                    {num(m.rating, 2)}
                    <small>Rating</small>
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!p.map_pool.length && (
        <p className="muted">No map data in this cohort.</p>
      )}
    </>
  );
}

function CohortPosition({
  edpi,
  summary,
}: {
  edpi: number;
  summary: CohortSummary;
}) {
  const [low, high] = summary.range;
  const min = Math.min(low, edpi) * 0.85;
  const max = Math.max(high, edpi) * 1.1;
  const at = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const delta = edpi / summary.peak - 1;

  return (
    <div className="cohort-position">
      <div
        className="position-track"
        role="img"
        aria-label={`${num(edpi, 1)} eDPI; recommended range ${num(low)} to ${num(high)}, peak ${num(summary.peak, 1)}`}
      >
        <span
          className="position-range"
          style={{ left: at(low), width: `calc(${at(high)} - ${at(low)})` }}
        />
        <span className="position-peak" style={{ left: at(summary.peak) }} />
        <span className="position-player" style={{ left: at(edpi) }} />
      </div>
      <div className="position-legend">
        <span>
          <b className="range" /> Cohort range {num(low)}–{num(high)}
        </span>
        <span>
          <b className="peak" /> Peak {num(summary.peak, 1)}
        </span>
        <span>
          <b className="player" /> This player{" "}
          <strong>
            {delta >= 0 ? "+" : ""}
            {pct(delta, 1)}
          </strong>
        </span>
      </div>
    </div>
  );
}

function useObservations(history: Setting[]) {
  return useMemo(() => {
    const sorted = [...history].sort(
      (a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at),
    );

    // Keep same-day setting changes and reversions when collapsing duplicate readings.
    return sorted.filter((setting, index) => {
      const previous = sorted[index - 1];

      return (
        !previous ||
        date(setting.observed_at) !== date(previous.observed_at) ||
        setting.dpi !== previous.dpi ||
        setting.sensitivity !== previous.sensitivity
      );
    });
  }, [history]);
}

function SetupTab({
  player: p,
  dpi,
  summary,
}: {
  player: Player;
  dpi: number;
  summary?: CohortSummary;
}) {
  const observations = useObservations(p.history);
  const { copied, copy } = useCopy();
  const dpis = [...new Set([...converterDpis, dpi])].sort((a, b) => a - b);

  return (
    <>
      <div className="detail-columns">
        <section className="detail-card">
          <h3>Current setup</h3>
          <div className="setup-grid">
            <div>
              <span>Mouse DPI</span>
              <strong>{num(p.setting.dpi)}</strong>
            </div>
            <div>
              <span>In-game sensitivity</span>
              <strong>{num(p.setting.sensitivity, 3)}</strong>
            </div>
            <div>
              <span>eDPI</span>
              <strong>{num(p.edpi, 1)}</strong>
            </div>
            <div>
              <span>cm / 360°</span>
              <strong>{num((2.54 * 360) / (p.edpi * 0.07), 1)}</strong>
            </div>
          </div>
          {summary && (
            <>
              <h3>Against the cohort</h3>
              <CohortPosition edpi={p.edpi} summary={summary} />
            </>
          )}
        </section>
        <section className="detail-card">
          <h3>Use it at your DPI</h3>
          <p className="card-note">
            Same eDPI, converted to common mouse DPIs.
          </p>
          <div className="converter">
            {dpis.map((d) => {
              const value = num(p.edpi / d, 3);

              return (
                <div key={d} className={d === dpi ? "current" : undefined}>
                  <span>{num(d)} DPI</span>
                  <strong>{value}</strong>
                  <CopyButton
                    label={`Copy sensitivity for ${d} DPI`}
                    done={copied === String(d)}
                    onCopy={() => copy(String(d), value)}
                  />
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <h3>Sensitivity observations</h3>
      <div className="observations">
        {observations.map((s, i) => {
          const previous = observations[i - 1];
          const edpi = s.dpi * s.sensitivity;

          const change = previous
            ? edpi / (previous.dpi * previous.sensitivity) - 1
            : 0;

          return (
            <div key={i}>
              <span className="status-dot" />
              <span>{date(s.observed_at)}</span>
              <strong>
                {num(s.dpi)} DPI × {num(s.sensitivity, 3)}
              </strong>
              <span>
                {Math.abs(change) >= 0.005 && (
                  <small className="observation-change">
                    {change > 0 ? "+" : ""}
                    {pct(change, 1)}
                  </small>
                )}
                {num(edpi, 1)} eDPI
              </span>
            </div>
          );
        })}
      </div>
      <h3>Model weighting</h3>
      <div className="detail-columns">
        <div>
          <div className="insight-detail">
            <span>Setting reliability</span>
            <strong>{pct(p.reliability)}</strong>
          </div>
          <div className="insight-detail">
            <span>Raw weight</span>
            <strong>{num(p.weight, 3)}</strong>
          </div>
          <div className="insight-detail">
            <span>Achievement score</span>
            <strong>
              {p.achievement == null ? "—" : num(p.achievement * 100, 1)}
            </strong>
          </div>
        </div>
        <ul className="warning-list">
          {p.warnings.map((w) => (
            <li key={w}>
              <TriangleAlert size={12} />
              {w}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function useRoleHistory(history: Record<string, string>) {
  return useMemo(() => {
    const groups: { role: string; years: number[] }[] = [];

    const entries = Object.entries(history).sort(
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
  }, [history]);
}

const medal = (placement: number) =>
  placement === 1
    ? "gold"
    : placement === 2
      ? "silver"
      : placement <= 4
        ? "bronze"
        : "";

function CareerTab({ player: p }: { player: Player }) {
  const roleHistory = useRoleHistory(p.role_history);

  const events = useMemo(
    () => [...p.events].sort((a, b) => b.date.localeCompare(a.date)),
    [p.events],
  );

  const wins = events.filter((e) => e.placement === 1).length;
  const podiums = events.filter((e) => e.placement <= 3).length;

  return (
    <>
      <h3 className="first-heading">Role history</h3>
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
      <h3>Tournament history</h3>
      {events.length > 0 && (
        <div className="career-totals">
          <Total count={events.length} word="result" />
          <Total count={wins} word="title" />
          <Total count={podiums} word="podium" />
        </div>
      )}
      {events.length ? (
        events.map((e, i) => (
          <div className="event-row" key={i}>
            <span className={"placement " + medal(e.placement)}>
              {e.placement <= 4 ? <Medal size={13} /> : null}#{e.placement}
            </span>
            <span>
              {e.tournament}
              <small>{e.tier}</small>
            </span>
            <span>{e.year}</span>
          </div>
        ))
      ) : (
        <p className="muted">No tournament results available.</p>
      )}
    </>
  );
}

function PlayerNav({
  index,
  count,
  previous,
  next,
  onNavigate,
}: {
  index: number;
  count: number;
  previous?: Player;
  next?: Player;
  onNavigate: (player: Player) => void;
}) {
  const { copied, copy } = useCopy();

  return (
    <nav className="player-nav" aria-label="Browse players">
      <button
        type="button"
        className={copied ? "copied" : undefined}
        aria-label="Copy link to this player"
        title={copied ? "Link copied" : "Copy link to this player"}
        onClick={() => copy("link", location.href)}
      >
        {copied ? <Check size={14} /> : <Link2 size={14} />}
      </button>
      <span className="player-nav-divider" aria-hidden="true" />
      <button
        type="button"
        aria-label="Previous player"
        title={previous ? `Previous: ${previous.name} (←)` : undefined}
        disabled={!previous}
        onClick={() => previous && onNavigate(previous)}
      >
        <ChevronLeft size={15} />
      </button>
      <span>
        {index + 1} <small>of {count}</small>
      </span>
      <button
        type="button"
        aria-label="Next player"
        title={next ? `Next: ${next.name} (→)` : undefined}
        disabled={!next}
        onClick={() => next && onNavigate(next)}
      >
        <ChevronRight size={15} />
      </button>
    </nav>
  );
}

function useArrowNavigation(
  previous: Player | undefined,
  next: Player | undefined,
  onNavigate: (player: Player) => void,
) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
        return;
      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, [role="tab"], [role="slider"], [role="listbox"]',
        )
      )
        return;

      const destination =
        event.key === "ArrowLeft"
          ? previous
          : event.key === "ArrowRight"
            ? next
            : undefined;

      if (!destination) return;
      event.preventDefault();
      onNavigate(destination);
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [previous, next, onNavigate]);
}

function Hero({ player: p }: { player: Player }) {
  const color = colors.get(p.role) ?? "#c0e984";
  const main = p.agents[0]?.name;

  return (
    <div
      className="player-hero-backdrop"
      style={{
        backgroundImage: `radial-gradient(120% 140% at 0% 0%, ${color}24, transparent 55%)`,
      }}
      aria-hidden="true"
    >
      {main && (
        <span className="player-hero-art">
          <AgentIcon name={main} size={180} />
        </span>
      )}
    </div>
  );
}

export function PlayerDetail({
  player: p,
  players,
  cohort,
  onNavigate,
  summary,
  dpi,
  baseline,
  onFilter,
}: {
  player: Player;
  players: Player[];
  cohort: Player[];
  onNavigate: (player: Player) => void;
  summary?: CohortSummary;
  dpi: number;
  baseline?: CombatStats;
  onFilter: (key: "agents" | "teams", value: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [compareId, setCompareId] = useState<string>();
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const { copied, copy } = useCopy();
  const index = players.findIndex((x) => x.id === p.id);
  const previous = index > 0 ? players[index - 1] : undefined;

  const next =
    index >= 0 && index < players.length - 1 ? players[index + 1] : undefined;

  const sensitivity = num(p.edpi / dpi, 3);
  const distance = summary ? p.edpi / summary.peak - 1 : null;

  useArrowNavigation(previous, next, onNavigate);

  useEffect(() => {
    // Compact layouts scroll the whole dialog; wide layouts scroll only the tab body.
    root.current?.scrollTo({ top: 0 });
    body.current?.scrollTo({ top: 0 });
  }, [p.id]);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) =>
        setTab(tabs.find(([id]) => id === value)?.[0] ?? "overview")
      }
      className="player-detail"
      ref={root}
    >
      <div className="dialog-header player-hero">
        <Hero player={p} />
        <div className="player-hero-main">
          <PlayerPortrait id={p.id} name={p.name} size={72} />
          <div className="player-hero-identity">
            <div className="player-hero-title">
              <DialogTitle>{p.name}</DialogTitle>
              <RoleBadge role={p.role} />
              {p.stale && (
                <Badge tone="amber">
                  Setting last seen {date(p.setting.observed_at)}
                </Badge>
              )}
            </div>
            <DialogDescription className="player-detail-meta">
              <button
                type="button"
                className="hero-filter"
                title={`Show only ${p.team} players`}
                onClick={() => onFilter("teams", p.team)}
              >
                <TeamLabel team={p.team} size={20} />
              </button>
              <span>{p.region}</span>
              <span>{num(p.maps)} maps</span>
              <span>Last played {date(p.last_played)}</span>
            </DialogDescription>
            <div className="player-hero-agents">
              {p.agents.slice(0, 4).map((a) => (
                <button
                  type="button"
                  key={a.name}
                  className="agent-chip"
                  title={`${num(a.maps)} maps · show only ${agentDisplayName(a.name)} players`}
                  onClick={() => onFilter("agents", a.name)}
                >
                  <AgentIcon name={a.name} size={20} />
                  {agentDisplayName(a.name)}
                  <small>{pct(a.share)}</small>
                </button>
              ))}
            </div>
          </div>
          {index >= 0 && players.length > 1 && (
            <PlayerNav
              index={index}
              count={players.length}
              previous={previous}
              next={next}
              onNavigate={onNavigate}
            />
          )}
        </div>
        <div className="hero-metrics">
          <HeroMetric
            label={`Sensitivity @ ${num(dpi)} DPI`}
            accent
            aside={
              <CopyButton
                label="Copy sensitivity"
                done={copied === "hero"}
                onCopy={() => copy("hero", sensitivity)}
              />
            }
          >
            {sensitivity}
          </HeroMetric>
          <HeroMetric
            label="eDPI"
            note={
              distance == null
                ? undefined
                : `${distance >= 0 ? "+" : ""}${pct(distance, 1)} vs peak`
            }
          >
            {num(p.edpi, 1)}
          </HeroMetric>
          <HeroMetric
            label="Performance"
            aside={<Gauge value={p.performance} />}
            note={`${num(p.performance * 100, 1)} / 100`}
          >
            P{num(p.performance * 100)}
          </HeroMetric>
          <HeroMetric
            label="Rating · K/D"
            note={`${num(p.stats.rounds)} rounds`}
          >
            {num(p.stats.rating ?? p.rating, 2)} · {num(p.stats.kd, 2)}
          </HeroMetric>
          <HeroMetric label="Cohort influence" note="share of total weight">
            {pct(p.contribution, 2)}
          </HeroMetric>
        </div>
        <TabsList className="player-tabs">
          {tabs.map(([id, label]) => (
            <TabItem key={id} value={id} label={label} />
          ))}
        </TabsList>
      </div>
      <DialogBody ref={body} className="dialog-body player-detail-body">
        <TabPanel value="overview">
          <OverviewTab player={p} />
        </TabPanel>
        <TabPanel value="combat">
          <CombatTab player={p} baseline={baseline} />
        </TabPanel>
        <TabPanel value="pool">
          <PoolTab player={p} />
        </TabPanel>
        <TabPanel value="setup">
          <SetupTab player={p} dpi={dpi} summary={summary} />
        </TabPanel>
        <TabPanel value="career">
          <CareerTab player={p} />
        </TabPanel>
        <TabPanel value="compare">
          <CompareTab
            player={p}
            other={cohort.find((x) => x.id === compareId)}
            players={cohort}
            dpi={dpi}
            onPick={(other) => setCompareId(other?.id)}
          />
        </TabPanel>
      </DialogBody>
    </Tabs>
  );
}
