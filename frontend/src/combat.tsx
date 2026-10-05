import type { ReactNode } from "react";
import { Crosshair } from "lucide-react";
import { AgentIcon, agentDisplayName } from "./components/agent-icon";
import { MapLabel, WeaponIcon } from "./components/game-media";
import { RoleBadge } from "./components/badges";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "./components/ui/table";
import { type StatKey, formatStat, statByKey } from "./metrics";
import {
  type CohortProfile,
  type CombatStats,
  type Usage,
  num,
  pct,
} from "./types";

export const headline: StatKey[] = [
  "rating",
  "kd",
  "kda",
  "adr",
  "kast",
  "hs",
  "fk_per_round",
  "op_kill_share",
];

const roleColumns: StatKey[] = [
  "kd",
  "kda",
  "adr",
  "kast",
  "hs",
  "fk_per_round",
  "op_kill_share",
];

export const percentileTone = (p: number) =>
  p >= 0.75 ? "high" : p >= 0.4 ? "mid" : "low";

/** Signed difference against a baseline, in the stat's own display units. */
function Delta({ stat, value, baseline }: Required<TileValues>) {
  if (value == null || baseline == null || baseline === 0) return null;
  const ratio = value / baseline - 1;

  if (Math.abs(ratio) < 0.005)
    return <small className="stat-delta">≈ cohort</small>;
  const higherIsWorse = stat === "dpr" || stat === "fd_per_round";
  const better = ratio > 0 !== higherIsWorse;

  return (
    <small
      className={"stat-delta " + (better ? "better" : "worse")}
      title={`Cohort: ${formatStat(stat, baseline)}`}
    >
      {ratio > 0 ? "▲" : "▼"} {num(Math.abs(ratio) * 100, 0)}% vs cohort
    </small>
  );
}

type TileValues = {
  stat: StatKey;
  value: number | null;
  baseline?: number | null;
};

export function StatTile({
  stat,
  value,
  percentile,
  baseline,
}: TileValues & { percentile?: number }) {
  const definition = statByKey.get(stat);

  return (
    <div className="stat-tile" title={definition?.description}>
      <span>{definition?.label ?? stat}</span>
      <strong>{formatStat(stat, value)}</strong>
      {percentile != null && (
        <small
          className={"stat-percentile " + percentileTone(percentile)}
          aria-label={`${num(percentile * 100)}th percentile among professionals`}
        >
          <span className="percentile-track">
            <i style={{ width: `${percentile * 100}%` }} />
          </span>
          P{num(percentile * 100)}
        </small>
      )}
      {baseline !== undefined && (
        <Delta stat={stat} value={value} baseline={baseline} />
      )}
    </div>
  );
}

const otherWeapons = ["Vandal", "Phantom", "Sheriff"];

export function WeaponSplit({ stats: s }: { stats: CombatStats }) {
  if (s.op_kill_share == null)
    return (
      <p className="muted small-text">
        Weapon data is unavailable for this sample.
      </p>
    );

  const operator = s.op_kill_share;

  return (
    <div className="weapon-split">
      <div className="weapon-cards">
        <div className="weapon-card operator">
          <WeaponIcon name="Operator" height={20} />
          <span>Operator</span>
          <strong>{pct(operator, 1)}</strong>
          <small>{num(s.op_kills)} kills</small>
        </div>
        <div className="weapon-card other">
          <span className="weapon-stack">
            {otherWeapons.map((w) => (
              <WeaponIcon key={w} name={w} height={13} />
            ))}
          </span>
          <span>Rifles, sidearms & other</span>
          <strong>{pct(1 - operator, 1)}</strong>
          <small>{num(s.km_kills - s.op_kills)} kills</small>
        </div>
      </div>
      <div
        className="weapon-bar"
        role="img"
        aria-label={`Operator ${pct(operator, 1)} of kills, other weapons ${pct(1 - operator, 1)}`}
      >
        <i style={{ width: `${operator * 100}%` }} />
      </div>
      {s.op_death_share != null && (
        <p className="weapon-threat">
          <WeaponIcon name="Operator" height={11} />
          <span>
            <strong>{pct(s.op_death_share, 1)}</strong> of deaths come from an
            enemy Operator
          </span>
        </p>
      )}
      <p className="muted small-text">
        The source tracks Operator kills individually; every other weapon is
        reported together. Counts cover games with a published kill matrix.
      </p>
    </div>
  );
}

export function UsageBars<T extends Usage>({
  items,
  agent = false,
  limit = 6,
  detail,
}: {
  items: T[];
  agent?: boolean;
  limit?: number;
  detail?: (item: T) => ReactNode;
}) {
  return (
    <div className="usage-bars">
      {items.slice(0, limit).map((item) => (
        <div className="detail-bar usage-bar" key={item.name}>
          <span>
            {agent ? (
              <span className="agent-label">
                <AgentIcon name={item.name} size={18} />
                {agentDisplayName(item.name)}
              </span>
            ) : (
              <MapLabel name={item.name} />
            )}
          </span>
          <div>
            <i style={{ width: `${item.share * 100}%` }} />
          </div>
          <strong>{pct(item.share)}</strong>
          {detail && <small>{detail(item)}</small>}
        </div>
      ))}
    </div>
  );
}

export function CohortCombat({ profile }: { profile: CohortProfile }) {
  return (
    <section className="panel combat-panel">
      <div className="section-heading">
        <div>
          <h2>How this cohort plays</h2>
          <p>
            Pooled over {num(profile.maps)} maps from {profile.count} players.
            Every covered round counts once.
          </p>
        </div>
        <Crosshair size={16} className="muted" />
      </div>
      <div className="stat-grid">
        {headline.map((key) => (
          <StatTile key={key} stat={key} value={profile.stats[key]} />
        ))}
      </div>
      <div className="combat-columns">
        <div>
          <h3>Weapons</h3>
          <WeaponSplit stats={profile.stats} />
        </div>
        <div>
          <h3>Agent picks</h3>
          <UsageBars items={profile.agents} agent />
        </div>
        <div>
          <h3>Map pool</h3>
          <UsageBars items={profile.map_pool} />
        </div>
      </div>
    </section>
  );
}

export function RoleProfiles({ profiles }: { profiles: CohortProfile[] }) {
  return (
    <section className="panel role-profiles">
      <div className="section-heading">
        <div>
          <h2>Role combat profiles</h2>
          <p>
            Pooled statistics and weapon use for each role in the current
            cohort.
          </p>
        </div>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Role combat profiles"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Players</TableHead>
              {roleColumns.map((key) => (
                <TableHead key={key}>
                  {key === "op_kill_share" && (
                    <WeaponIcon
                      name="Operator"
                      height={8}
                      className="column-weapon"
                    />
                  )}
                  {statByKey.get(key)?.label}
                </TableHead>
              ))}
              <TableHead>Most picked agents</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((r, i) => (
              <TableRow key={r.name} index={i}>
                <TableCell>
                  <RoleBadge role={r.name} />
                </TableCell>
                <TableCell className="mono muted">{r.count}</TableCell>
                {roleColumns.map((key) => (
                  <TableCell key={key} className="mono">
                    {formatStat(key, r.stats[key])}
                  </TableCell>
                ))}
                <TableCell>
                  <span className="role-agents">
                    {r.agents.slice(0, 4).map((a) => (
                      <span
                        key={a.name}
                        title={`${agentDisplayName(a.name)} · ${pct(a.share, 1)} of maps`}
                      >
                        <AgentIcon name={a.name} size={20} />
                        <small>{pct(a.share)}</small>
                      </span>
                    ))}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
