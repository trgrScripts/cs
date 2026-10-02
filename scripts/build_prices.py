#!/usr/bin/env python3
"""Build js/prices.js: current USD market prices for every item the app can drop.

Usage:
    python3 scripts/build_prices.py [--no-steam]

Sources are merged; each one only fills names the earlier ones lack:
  1. Skinport's public item API (median of recent sales, else suggested price).
     Also the only source of Doppler / Gamma Doppler phase prices.
  2. market.csgo.com's public USD price list.
  3. Steam Community Market listings (slow and rate limited, so time-boxed).

Runs daily from .github/workflows/prices.yml, which commits the result.
"""
import gzip
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DATA = os.path.join(ROOT, "js", "data.js")
OUT = os.path.join(ROOT, "js", "prices.js")

SKINPORT = "https://api.skinport.com/v1/items?app_id=730&currency=USD&tradable=0"
CSGOMARKET = "https://market.csgo.com/api/v2/prices/USD.json"
STEAM_SEARCH = "https://steamcommunity.com/market/search/render/?appid=730&norender=1&count=100&sort_column=name&sort_dir=asc&start={}"
STEAM_BUDGET_S = 15 * 60

WEARS = ["Factory New", "Minimal Wear", "Field-Tested", "Well-Worn", "Battle-Scarred"]
WEAR_RE = re.compile(r" \((%s)\)$" % "|".join(re.escape(w) for w in WEARS))


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "keyless-price-builder", "Accept-Encoding": "gzip", **(headers or {})})
    with urllib.request.urlopen(req, timeout=180) as r:
        raw = r.read()
        enc = r.headers.get("Content-Encoding", "")
        info = f"HTTP {r.status} {r.headers.get('Content-Type')} {enc} {len(raw)} bytes"
    if enc == "gzip" or raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    elif enc == "br":
        import brotli  # pip install brotli
        raw = brotli.decompress(raw)
    try:
        return json.loads(raw)
    except ValueError:
        raise ValueError(f"not JSON ({info}): {raw[:200]!r}")


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if f > 0 else None


def base_name(name):
    n = WEAR_RE.sub("", name)
    n = n.replace("★ StatTrak™ ", "★ ").replace("StatTrak™ ", "").replace("Souvenir ", "")
    return n


def wanted_names():
    text = open(DATA, encoding="utf-8").read()
    data = json.loads(text.split("window.CS_DATA=", 1)[1].rstrip().rstrip(";"))
    bases = set()
    for it in data["items"]:
        bases.add(it[10] or it[0])
    crates = {c["m"] for c in data["crates"]}
    return bases, crates


def from_skinport(bases, crates):
    items = fetch(SKINPORT, {"Accept-Encoding": "br"})
    sample = [it for it in items if it.get("market_hash_name") == "★ Karambit | Doppler (Factory New)"]
    print("skinport doppler sample:", json.dumps(sample)[:1500], file=sys.stderr)
    prices, phases = {}, {}
    for it in items:
        name = it.get("market_hash_name", "")
        if name not in crates and base_name(name) not in bases:
            continue
        # Prefer the median of recent sales; fall back to the cheapest listing.
        p = num(it.get("median_price")) or num(it.get("suggested_price")) or num(it.get("min_price"))
        if not p:
            continue
        phase = it.get("version") or it.get("phase")
        if phase:
            phases[f"{name}|{phase}"] = round(p, 2)
        prices[name] = round(min(p, prices.get(name, p)), 2)
    return prices, phases, "Skinport"


def from_csgomarket(bases, crates):
    data = fetch(CSGOMARKET)
    prices = {}
    for it in data.get("items", []):
        name = it.get("market_hash_name", "")
        if name not in crates and base_name(name) not in bases:
            continue
        p = num(it.get("price"))
        if p:
            prices[name] = round(p, 2)
    return prices, {}, "market.csgo.com"


def from_steam(bases, crates):
    import time
    prices, start, total, t0, wait = {}, 0, None, time.time(), 2.5
    while total is None or start < total:
        if time.time() - t0 > STEAM_BUDGET_S:
            print(f"steam: time budget used at {start}/{total}", file=sys.stderr)
            break
        try:
            page = fetch(STEAM_SEARCH.format(start))
        except Exception as e:  # 429s and timeouts: back off and retry
            wait = min(wait * 2, 60)
            print(f"steam: {e!r} at {start}, waiting {wait}s", file=sys.stderr)
            time.sleep(wait)
            continue
        wait = 2.5
        total = page.get("total_count", 0)
        for it in page.get("results", []):
            name = it.get("hash_name", "")
            if name not in crates and base_name(name) not in bases:
                continue
            p = num(it.get("sell_price"))
            if p:
                prices[name] = round(p / 100, 2)
        start += 100
        time.sleep(wait)
    return prices, {}, "Steam"


def main():
    bases, crates = wanted_names()
    sources = [from_skinport, from_csgomarket] + ([] if "--no-steam" in sys.argv else [from_steam])
    prices, phases, used = {}, {}, []
    for source in sources:
        try:
            got, ph, label = source(bases, crates)
        except Exception as e:  # network, format or decode errors: try the next source
            print(f"{source.__name__} failed: {e!r}", file=sys.stderr)
            continue
        added = 0
        for name, p in got.items():
            if name not in prices:
                prices[name] = p
                added += 1
        for k, v in ph.items():
            phases.setdefault(k, v)
        print(f"{label}: {len(got)} prices, {added} new", file=sys.stderr)
        if added:
            used.append(label)
    if not prices:
        sys.exit("No price source worked; js/prices.js left unchanged.")
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": ", ".join(used),
        "p": dict(sorted(prices.items())),
        "ph": dict(sorted(phases.items())),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Generated by scripts/build_prices.py. Do not edit by hand. */\n")
        f.write("window.CS_PRICES=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"wrote {OUT}: {len(prices)} prices, {len(phases)} Doppler phase prices from {payload['source']}", file=sys.stderr)


if __name__ == "__main__":
    main()
