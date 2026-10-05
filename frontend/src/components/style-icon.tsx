import { Anchor, Shuffle, Sparkles, Swords, Wind } from "lucide-react";
import { WeaponIcon } from "./game-media";

const weaponStyles = {
  "Operator-heavy": "Operator",
  "Rifle-entry": "Vandal",
};

const iconStyles = {
  "Movement-heavy": Wind,
  "Anchor-lurk": Anchor,
  "Aggressive-hybrid": Swords,
  "Utility-heavy": Sparkles,
  Flexible: Shuffle,
};

export function StyleIcon({
  style,
  size = 14,
}: {
  style: string;
  size?: number;
}) {
  const weapon = Object.entries(weaponStyles).find(([s]) => s === style)?.[1];
  const Icon = Object.entries(iconStyles).find(([s]) => s === style)?.[1];

  return (
    <span
      className="style-icon"
      style={{ width: size * 2.2, height: size }}
      aria-hidden="true"
    >
      {weapon ? (
        <WeaponIcon name={weapon} height={size * 0.8} />
      ) : (
        Icon && <Icon size={size} />
      )}
    </span>
  );
}

export function StyleLabel({ style }: { style: string }) {
  return (
    <span className="style-label">
      <StyleIcon style={style} />
      {style}
    </span>
  );
}
