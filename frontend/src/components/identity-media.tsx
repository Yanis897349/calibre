import { useState, type ReactNode } from "react";
import { GitBranch, Users } from "lucide-react";
import { DitherAvatar } from "./dither-kit/avatar";
import images from "../lib/identity-images.json";
import roleIcons from "../lib/role-icons.json";

const players: Record<string, string> = images.players;

const teams: Record<string, string> = images.teams;

const lightTeamIcons = new Set(images.lightTeamIcons);

const roles: Record<string, { icon: string }> = roleIcons;

const flexSegments = [
  { role: "Duelist", clip: "polygon(0 0, 47% 0, 47% 47%, 0 47%)" },
  { role: "Initiator", clip: "polygon(53% 0, 100% 0, 100% 47%, 53% 47%)" },
  {
    role: "Controller",
    clip: "polygon(53% 53%, 100% 53%, 100% 100%, 53% 100%)",
  },
  { role: "Sentinel", clip: "polygon(0 53%, 47% 53%, 47% 100%, 0 100%)" },
];

function IdentityImage({
  source,
  size,
  className,
  fallback,
}: {
  source?: string;
  size: number;
  className: string;
  fallback: ReactNode;
}) {
  const [failedSource, setFailedSource] = useState<string>();

  return (
    <span
      className={`identity-image ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {source && source !== failedSource ? (
        <img
          src={source}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSource(source)}
        />
      ) : (
        fallback
      )}
    </span>
  );
}

export function PlayerPortrait({
  id,
  name,
  size = 36,
}: {
  id: string;
  name: string;
  size?: number;
}) {
  return (
    <IdentityImage
      source={players[id]}
      size={size}
      className="player-portrait"
      fallback={<DitherAvatar name={name} size={size - 6} animate={false} />}
    />
  );
}

export function TeamIcon({ team, size = 24 }: { team: string; size?: number }) {
  const initials = team
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  const unaffiliated = ["Free Agent", "Retired", "Content Creator"].includes(
    team,
  );

  return (
    <IdentityImage
      source={teams[team]}
      size={size}
      className={`team-icon${lightTeamIcons.has(teams[team]) ? " team-icon-light" : ""}`}
      fallback={
        unaffiliated ? (
          <Users size={size * 0.6} />
        ) : (
          <span>{initials || "?"}</span>
        )
      }
    />
  );
}

export function TeamLabel({
  team,
  size = 24,
}: {
  team: string;
  size?: number;
}) {
  return (
    <span className="team-label">
      <TeamIcon team={team} size={size} />
      <span>{team}</span>
    </span>
  );
}

export function RoleIcon({ role, size = 16 }: { role: string; size?: number }) {
  if (role === "Flex") {
    return (
      <span
        className="role-icon-composite"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {flexSegments.map((segment) => (
          <span
            key={segment.role}
            style={{
              maskImage: `url(${roles[segment.role].icon})`,
              WebkitMaskImage: `url(${roles[segment.role].icon})`,
              clipPath: segment.clip,
            }}
          />
        ))}
      </span>
    );
  }

  const source = roles[role]?.icon;

  return source ? (
    <span
      className="role-icon"
      style={{
        width: size,
        height: size,
        maskImage: `url(${source})`,
        WebkitMaskImage: `url(${source})`,
      }}
      aria-hidden="true"
    />
  ) : (
    <GitBranch size={size} className="role-icon-fallback" aria-hidden="true" />
  );
}
