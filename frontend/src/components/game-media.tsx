import { useState, type CSSProperties } from "react";
import weaponIcons from "../lib/weapon-icons.json";
import mapImages from "../lib/map-images.json";

type Weapon = { name: string; category: string; cost: number; icon: string };

const weapons: Record<string, Weapon> = weaponIcons;

const maps: Record<string, { name: string; sites: string; image: string }> =
  mapImages;

const key = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export const weapon = (name: string) => weapons[key(name)];

/** Kill-feed silhouette tinted with the current text colour. */
export function WeaponIcon({
  name,
  height = 16,
  className,
  label = false,
}: {
  name: string;
  height?: number;
  className?: string;
  label?: boolean;
}) {
  const source = weapon(name)?.icon;

  if (!source) return null;

  const style: CSSProperties = {
    height,
    width: height * 4,
    maskImage: `url(${source})`,
    WebkitMaskImage: `url(${source})`,
  };

  return (
    <span
      className={"weapon-icon " + (className ?? "")}
      style={style}
      {...(label
        ? { role: "img", "aria-label": weapon(name)?.name }
        : { "aria-hidden": true })}
    />
  );
}

export const mapInfo = (name: string) => maps[key(name)];

export function MapThumb({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const source = mapInfo(name)?.image;
  const [failedSource, setFailedSource] = useState<string>();

  return (
    <span className={"map-thumb " + (className ?? "")} aria-hidden="true">
      {source && source !== failedSource && (
        <img
          src={source}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailedSource(source)}
        />
      )}
    </span>
  );
}

export function MapLabel({ name }: { name: string }) {
  return (
    <span className="map-label">
      <MapThumb name={name} />
      {name}
    </span>
  );
}
