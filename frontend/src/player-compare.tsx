import { useMemo, useState } from "react";
import { ArrowLeftRight, Search, X } from "lucide-react";
import { AgentIcon, agentDisplayName } from "./components/agent-icon";
import { WeaponIcon } from "./components/game-media";
import { PlayerPortrait, TeamLabel } from "./components/identity-media";
import { RoleBadge } from "./components/badges";
import { ComparisonRadar } from "./charts";
import { type Player, num, pct } from "./types";

type Row = {
  label: string;
  value: (p: Player, dpi: number) => number | null;
  format: (v: number | null) => string;
  /** Rows without a direction describe preference, not quality. */
  better?: "higher" | "lower";
  weapon?: boolean;
};

const rows: Row[] = [
  {
    label: "Sensitivity",
    value: (p, dpi) => p.edpi / dpi,
    format: (v) => num(v, 3),
  },
  { label: "eDPI", value: (p) => p.edpi, format: (v) => num(v, 1) },
  {
    label: "Performance",
    value: (p) => p.performance,
    format: (v) => (v == null ? "—" : `P${num(v * 100)}`),
    better: "higher",
  },
  {
    label: "Rating",
    value: (p) => p.stats.rating ?? p.rating,
    format: (v) => num(v, 2),
    better: "higher",
  },
  {
    label: "K/D",
    value: (p) => p.stats.kd,
    format: (v) => num(v, 2),
    better: "higher",
  },
  {
    label: "KDA",
    value: (p) => p.stats.kda,
    format: (v) => num(v, 2),
    better: "higher",
  },
  {
    label: "ADR",
    value: (p) => p.stats.adr,
    format: (v) => num(v, 1),
    better: "higher",
  },
  {
    label: "KAST",
    value: (p) => p.stats.kast,
    format: (v) => pct(v, 1),
    better: "higher",
  },
  {
    label: "Headshot %",
    value: (p) => p.stats.hs,
    format: (v) => pct(v, 1),
    better: "higher",
  },
  {
    label: "First kills / round",
    value: (p) => p.stats.fk_per_round,
    format: (v) => num(v, 3),
    better: "higher",
  },
  {
    label: "First deaths / round",
    value: (p) => p.stats.fd_per_round,
    format: (v) => num(v, 3),
    better: "lower",
  },
  {
    label: "Operator kills",
    value: (p) => p.stats.op_kill_share,
    format: (v) => pct(v, 1),
    weapon: true,
  },
  { label: "Maps", value: (p) => p.maps, format: (v) => num(v) },
];

function leader(row: Row, a: number | null, b: number | null) {
  if (!row.better || a == null || b == null || a === b) return 0;

  return a > b === (row.better === "higher") ? -1 : 1;
}

function CompareRow({
  row,
  first,
  second,
  dpi,
}: {
  row: Row;
  first: Player;
  second: Player;
  dpi: number;
}) {
  const a = row.value(first, dpi);
  const b = row.value(second, dpi);
  const total = (a ?? 0) + (b ?? 0);
  const share = total > 0 ? (a ?? 0) / total : 0.5;
  const lead = leader(row, a, b);

  return (
    <div className="compare-row">
      <strong className={lead === -1 ? "lead" : undefined}>
        {row.format(a)}
      </strong>
      <div className="compare-metric">
        <span>
          {row.weapon && (
            <WeaponIcon name="Operator" height={8} className="column-weapon" />
          )}
          {row.label}
        </span>
        <div className="compare-bar" aria-hidden="true">
          <i className="first" style={{ width: `${share * 100}%` }} />
          <i className="second" style={{ width: `${(1 - share) * 100}%` }} />
        </div>
      </div>
      <strong className={lead === 1 ? "lead" : undefined}>
        {row.format(b)}
      </strong>
    </div>
  );
}

function PlayerSide({
  player: p,
  tone,
  onClear,
}: {
  player: Player;
  tone: "first" | "second";
  onClear?: () => void;
}) {
  return (
    <div className={"compare-side " + tone}>
      <PlayerPortrait id={p.id} name={p.name} size={48} />
      <div>
        <strong>{p.name}</strong>
        <TeamLabel team={p.team} size={16} />
        <RoleBadge role={p.role} />
      </div>
      {onClear && (
        <button
          type="button"
          className="compare-clear"
          aria-label={`Stop comparing with ${p.name}`}
          onClick={onClear}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function Picker({
  player,
  players,
  onPick,
}: {
  player: Player;
  players: Player[];
  onPick: (player: Player) => void;
}) {
  const [query, setQuery] = useState("");

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const others = players.filter((p) => p.id !== player.id);

    if (q)
      return others
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.team.toLowerCase().includes(q),
        )
        .slice(0, 6);

    // Without a query, suggest players with the most similar eDPI.
    return [...others]
      .sort(
        (a, b) =>
          Math.abs(a.edpi - player.edpi) - Math.abs(b.edpi - player.edpi),
      )
      .slice(0, 6);
  }, [players, player, query]);

  return (
    <div className="compare-picker">
      <div className="search-field">
        <Search size={14} />
        <input
          aria-label="Search players to compare"
          placeholder="Search a player or team…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <span className="compare-picker-caption">
        {query ? "Matches" : "Closest eDPI in this cohort"}
      </span>
      <div className="compare-suggestions">
        {suggestions.map((p) => (
          <button
            key={p.id}
            type="button"
            className="compare-suggestion"
            onClick={() => onPick(p)}
          >
            <PlayerPortrait id={p.id} name={p.name} size={28} />
            <span>
              {p.name}
              <small>
                {p.team} · {num(p.edpi, 0)} eDPI
              </small>
            </span>
          </button>
        ))}
        {!suggestions.length && <p className="muted">No players match.</p>}
      </div>
    </div>
  );
}

const share = (v: number) => pct(v, v < 0.01 ? 1 : 0);

function SharedAgents({ first, second }: { first: Player; second: Player }) {
  const shared = first.agents
    .flatMap((a) => {
      const other = second.agents.find((b) => b.name === a.name);

      return other
        ? [{ name: a.name, first: a.share, second: other.share }]
        : [];
    })
    .slice(0, 6);

  if (!shared.length)
    return <p className="muted small-text">No agents in common.</p>;

  return (
    <div className="shared-agents">
      {shared.map((a) => (
        <div key={a.name}>
          <span className="first">{share(a.first)}</span>
          <span className="agent-label">
            <AgentIcon name={a.name} size={22} />
            {agentDisplayName(a.name)}
          </span>
          <span className="second">{share(a.second)}</span>
        </div>
      ))}
    </div>
  );
}

export function CompareTab({
  player,
  other,
  players,
  dpi,
  onPick,
}: {
  player: Player;
  other?: Player;
  players: Player[];
  dpi: number;
  onPick: (player: Player | undefined) => void;
}) {
  if (!other || other.id === player.id)
    return (
      <>
        <h3 className="first-heading">Compare {player.name} with…</h3>
        <Picker player={player} players={players} onPick={onPick} />
      </>
    );

  return (
    <>
      <div className="compare-header">
        <PlayerSide player={player} tone="first" />
        <ArrowLeftRight size={16} className="muted" />
        <PlayerSide
          player={other}
          tone="second"
          onClear={() => onPick(undefined)}
        />
      </div>
      <div className="compare-rows">
        {rows.map((row) => (
          <CompareRow
            key={row.label}
            row={row}
            first={player}
            second={other}
            dpi={dpi}
          />
        ))}
      </div>
      <div className="detail-columns">
        <section className="detail-card">
          <h3>Mechanical fingerprints</h3>
          <ComparisonRadar
            first={player.mechanical}
            second={other.mechanical}
            labels={[player.name, other.name]}
          />
          <div className="compare-legend">
            <span className="first">{player.name}</span>
            <span className="second">{other.name}</span>
          </div>
        </section>
        <section className="detail-card">
          <h3>Agents in common</h3>
          <SharedAgents first={player} second={other} />
        </section>
      </div>
    </>
  );
}
