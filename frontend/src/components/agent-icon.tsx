import { useState } from "react";
import icons from "../lib/agent-icons.json";

const agents: Record<string, { name: string; icon: string }> = icons;

const agentKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export function agentDisplayName(name: string) {
  return (
    agents[agentKey(name)]?.name || name.charAt(0).toUpperCase() + name.slice(1)
  );
}

export function AgentIcon({
  name,
  size = 20,
}: {
  name: string;
  size?: number;
}) {
  const source = agents[agentKey(name)]?.icon;
  const [failedSource, setFailedSource] = useState<string>();

  return (
    <span
      className="agent-icon"
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
        <span>{name.trim().charAt(0).toUpperCase() || "?"}</span>
      )}
    </span>
  );
}
