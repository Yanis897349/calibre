"""Vendor weapon silhouettes and map artwork from valorant-api.com.

Weapon kill-feed icons are white silhouettes, so the UI tints them with CSS masks.
Map list banners are re-encoded as small JPEGs with macOS `sips`.
"""
import json, pathlib, subprocess, urllib.request

root = pathlib.Path(__file__).resolve().parents[1]
public = root / "frontend/public"
lib = root / "frontend/src/lib"


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return r.read()


def slug(name):
    return "".join(c for c in name.lower() if c.isalnum())


categories = {
    "Sniper": "Snipers",
    "Rifle": "Rifles",
    "Heavy": "Machine guns",
    "SMG": "SMGs",
    "Shotgun": "Shotguns",
    "Sidearm": "Sidearms",
}

weapons = {}
(public / "weapons").mkdir(parents=True, exist_ok=True)
for w in json.loads(get("https://valorant-api.com/v1/weapons"))["data"]:
    category = w["category"].split("::")[-1]
    if category not in categories or not w.get("killStreamIcon"):
        continue
    key = slug(w["displayName"])
    (public / "weapons" / f"{key}.png").write_bytes(get(w["killStreamIcon"]))
    weapons[key] = {
        "name": w["displayName"],
        "category": categories[category],
        "cost": (w.get("shopData") or {}).get("cost", 0),
        "icon": f"/weapons/{key}.png",
    }

maps = {}
(public / "maps").mkdir(parents=True, exist_ok=True)
for m in json.loads(get("https://valorant-api.com/v1/maps"))["data"]:
    if not m.get("tacticalDescription") or not m.get("listViewIcon"):
        continue
    key = slug(m["displayName"])
    source = public / "maps" / f"{key}.png"
    target = public / "maps" / f"{key}.jpg"
    source.write_bytes(get(m["listViewIcon"]))
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "72",
         "--resampleWidth", "480", str(source), "--out", str(target)],
        check=True, capture_output=True,
    )
    source.unlink()
    maps[key] = {
        "name": m["displayName"],
        "sites": m["tacticalDescription"],
        "image": f"/maps/{key}.jpg",
    }

(lib / "weapon-icons.json").write_text(json.dumps(dict(sorted(weapons.items())), indent=2) + "\n")
(lib / "map-images.json").write_text(json.dumps(dict(sorted(maps.items())), indent=2) + "\n")
print(f"{len(weapons)} weapons, {len(maps)} maps")
