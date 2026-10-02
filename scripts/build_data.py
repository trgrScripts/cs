#!/usr/bin/env python3
"""Build js/data.js from the open ByMykel CSGO-API dataset.

Usage:
    python3 scripts/build_data.py            # download fresh data
    python3 scripts/build_data.py ./cache    # use crates.json / skins.json from ./cache if present

The output is a single script that sets `window.CS_DATA`, so the app works
when index.html is opened straight from disk (no server, no fetch).
"""
import json
import os
import re
import sys
import urllib.request
from datetime import date

API = "https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "js", "data.js")

IMG_PREFIXES = [
    "https://community.akamai.steamstatic.com/economy/image/",
    "https://cdn.steamstatic.com/apps/730/",
    "https://raw.githubusercontent.com/ByMykel/counter-strike-image-tracker/",
]

# Container type -> app category
CATEGORY = {
    "Case": "case",
    "Sticker Capsule": "sticker",
    "Autograph Capsule": "autograph",
    "Patch Capsule": "patch",
    "Pins": "patch",
    "Souvenir": "souvenir",
    "Souvenir Highlight": "souvenir",
    "Music Kit Box": "music",
}
EXTRA_CASES = {"Sealed Genesis Terminal", "Sealed Dead Hand Terminal"}

# rarity id (minus the _weapon/_character suffix) -> tier
TIER = {
    "rarity_common": 0,
    "rarity_uncommon": 1,
    "rarity_rare": 2,
    "rarity_mythical": 3,
    "rarity_legendary": 4,
    "rarity_ancient": 5,
    "rarity_contraband": 7,
}
GOLD = 6


def load(name, cache):
    if cache:
        path = os.path.join(cache, name)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return json.load(f)
    print(f"downloading {name} ...", file=sys.stderr)
    with urllib.request.urlopen(API + name, timeout=120) as r:
        data = r.read()
    if cache:
        os.makedirs(cache, exist_ok=True)
        with open(os.path.join(cache, name), "wb") as f:
            f.write(data)
    return json.loads(data)


def enc_img(url):
    if not url:
        return ""
    for i, p in enumerate(IMG_PREFIXES):
        if url.startswith(p):
            return f"{i}{url[len(p):]}"
    return "9" + url


def norm_date(d, name):
    if d:
        m = re.match(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", d)
        if m:
            return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"(20\d\d)", name)
    return f"{m.group(1)}-01-01" if m else None


def tier_of(rarity):
    rid = re.sub(r"_(weapon|character)$", "", rarity["id"])
    return TIER.get(rid, 2)


def kind_of(entry_id, name, skin):
    if entry_id.startswith("sticker-"):
        return "sticker"
    if entry_id.startswith("patch-"):
        return "patch"
    if entry_id.startswith("collectible-"):
        return "pin"
    if entry_id.startswith("music_kit-"):
        return "music"
    if entry_id.startswith("graffiti-"):
        return "graffiti"
    if skin and skin.get("category", {}).get("id") == "sfui_invpanel_filter_gloves":
        return "gloves"
    if name.startswith("★"):
        return "knife"
    return "weapon"


def market_name(e, kind, sticker):
    name = e["name"]
    if kind == "sticker":
        if sticker and sticker.get("market_hash_name"):
            return sticker["market_hash_name"]
        return name if name.startswith("Sticker | ") else "Sticker | " + name
    if kind == "patch":
        return name if name.startswith("Patch | ") else "Patch | " + name
    return name


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else None
    crates = load("crates.json", cache)
    skins = {s["id"]: s for s in load("skins.json", cache)}
    stickers = {s["id"]: s for s in load("stickers.json", cache)}

    items, index = [], {}
    rarity_names = []

    def rname(n):
        if n not in rarity_names:
            rarity_names.append(n)
        return rarity_names.index(n)

    def add_item(e, gold):
        key = e["id"] + ("|" + e["phase"] if e.get("phase") else "")
        if key in index:
            if gold:
                items[index[key]][2] = GOLD
            return index[key]
        skin = skins.get(e["id"])
        kind = kind_of(e["id"], e["name"], skin)
        tier = GOLD if gold else tier_of(e["rarity"])
        mn = mx = None
        flags = 0
        if skin:
            if skin.get("paint_index") and skin.get("min_float") is not None:
                mn, mx = skin["min_float"], skin["max_float"]
                flags |= 2  # painted: has a float + pattern
            if skin.get("stattrak"):
                flags |= 1  # can roll StatTrak
        mh = market_name(e, kind, stickers.get(e["id"]))
        # [name, rarityNameIdx, tier, img, minFloat, maxFloat, flags, kind, phase, key, marketName]
        # `key` is stable across rebuilds; saved inventories reference items by it.
        # `marketName` is the Steam market name without wear/StatTrak (empty when equal to name).
        items.append([
            e["name"], rname(e["rarity"]["name"]), tier, enc_img(e.get("image")),
            mn, mx, flags, kind, e.get("phase") or "", key, "" if mh == e["name"] else mh,
        ])
        index[key] = len(items) - 1
        return index[key]

    out, seen = [], set()
    for c in crates:
        cat = CATEGORY.get(c.get("type"))
        if c["name"] in EXTRA_CASES:
            cat = "case"
        if not cat or not c.get("contains"):
            continue
        sig = (c["name"], tuple(i["id"] for i in c["contains"]))
        if sig in seen:
            continue
        seen.add(sig)
        out.append({
            "id": c["id"],
            "n": c["name"],
            "m": c.get("market_hash_name") or c["name"],
            "t": cat,
            "d": norm_date(c.get("first_sale_date"), c["name"]),
            "i": enc_img(c.get("image")),
            "c": [add_item(i, False) for i in c["contains"]],
            "r": [add_item(i, True) for i in c.get("contains_rare") or []],
        })

    payload = {
        "built": date.today().isoformat(),
        "source": "https://github.com/ByMykel/CSGO-API",
        "img": IMG_PREFIXES,
        "rarityNames": rarity_names,
        "items": items,
        "crates": out,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Generated by scripts/build_data.py. Do not edit by hand. */\n")
        f.write("window.CS_DATA=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    counts = {}
    for c in out:
        counts[c["t"]] = counts.get(c["t"], 0) + 1
    print(f"wrote {OUT}: {len(out)} containers {counts}, {len(items)} items", file=sys.stderr)


if __name__ == "__main__":
    main()
