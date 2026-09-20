import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AgentIcon, agentDisplayName } from "./agent-icon";
import { PlayerPortrait, RoleIcon, TeamLabel } from "./identity-media";
import { type Player, type Mechanical, colors, mechanics, num } from "../types";

export function PlayerPointPreview({
  id,
  player,
  anchor,
  axis,
  dpi,
}: {
  id: string;
  player: Player;
  anchor: SVGCircleElement;
  axis: "performance" | keyof Mechanical;
  dpi: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  const axisLabel =
    axis === "performance"
      ? "Performance"
      : mechanics.find(([key]) => key === axis)?.[1];

  const axisValue =
    axis === "performance" ? player.performance : player.mechanical[axis];

  useLayoutEffect(() => {
    const preview = ref.current;

    if (!preview) return;

    const place = () => {
      const point = anchor.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight;

      if (
        !anchor.isConnected ||
        point.bottom < 0 ||
        point.top > viewportHeight ||
        point.right < 0 ||
        point.left > viewportWidth
      ) {
        setPosition(null);

        return;
      }

      const padding = 12;
      const width = preview.offsetWidth;
      const height = preview.offsetHeight;
      const above = point.top - height - padding;

      const next = {
        left: Math.max(
          padding,
          Math.min(
            point.left + point.width / 2 - width / 2,
            viewportWidth - width - padding,
          ),
        ),
        top: Math.max(
          padding,
          Math.min(
            above >= padding ? above : point.bottom + padding,
            viewportHeight - height - padding,
          ),
        ),
      };

      setPosition((previous) =>
        previous?.left === next.left && previous.top === next.top
          ? previous
          : next,
      );
    };

    place();
    const observer = new ResizeObserver(place);
    observer.observe(preview);

    if (anchor.ownerSVGElement) observer.observe(anchor.ownerSVGElement);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, player, axis, dpi]);

  return createPortal(
    <div
      ref={ref}
      id={id}
      role="tooltip"
      className="player-point-preview"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <div className="point-preview-heading">
        <PlayerPortrait id={player.id} name={player.name} size={40} />
        <div>
          <strong>{player.name}</strong>
          <TeamLabel team={player.team} size={18} />
        </div>
      </div>
      <div className="point-preview-role">
        <span className="role-badge" style={{ color: colors.get(player.role) }}>
          <RoleIcon role={player.role} />
          {player.role}
        </span>
        <span className="agent-icon-group">
          {player.agents.slice(0, 2).map((agent) => (
            <span
              key={agent.name}
              role="img"
              aria-label={agentDisplayName(agent.name)}
            >
              <AgentIcon name={agent.name} size={20} />
            </span>
          ))}
        </span>
      </div>
      <dl className="point-preview-values">
        <div>
          <dt>Sensitivity @ {num(dpi)} DPI</dt>
          <dd>{num(player.edpi / dpi, 3)}</dd>
        </div>
        <div>
          <dt>{axisLabel}</dt>
          <dd>
            {num(axisValue * 100, 1)}
            <span>%</span>
          </dd>
        </div>
      </dl>
      <div className="point-preview-context">
        <span>{num(player.maps)} maps</span>
        <span>{num(player.contribution * 100, 1)}% influence</span>
      </div>
      <div className="point-preview-hint">
        Click or press Enter to explore player
      </div>
    </div>,
    document.body,
  );
}
