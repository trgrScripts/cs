#!/usr/bin/env python3
"""Build js/prices.js: current USD market prices for every item the app can drop.

Usage:
    python3 scripts/build_prices.py

Sources, tried in order until one works:
  1. csgotrader.app's aggregated price feed (CSFloat, Buff163, Skinport, Steam ...).
     For each item the first market in PROVIDERS with a usable price wins.
  2. Skinport's public item API.

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

CSGOTRADER = "https://prices.csgotrader.app/latest/prices_v6.json"
SKINPORT = "https://api.skinport.com/v1/items?app_id=730&currency=USD&tradable=0"

# Market preference. CSFloat first, as it tracks real trade prices closely.
PROVIDERS = ["csfloat", "buff163", "skinport", "steam", "csmoney", "csgotm", "bitskins", "lootfarm"]
# Keys that hold a price inside a provider's entry, in preference order.
PRICE_KEYS = ["price", "starting_at", "last_24h", "last_7d", "last_30d", "last_90d",
              "suggested_price", "min_price", "median_price", "lowest_price", "instant_sale_price"]

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


def extract(v):
    """Pull one USD price out of a provider entry of unknown shape."""
    if isinstance(v, (int, float, str)):
        return num(v)
    if isinstance(v, dict):
        for k in PRICE_KEYS:
            if k in v:
                p = extract(v[k])
                if p:
                    return p
    return None


def find_doppler(v):
    if isinstance(v, dict):
        if isinstance(v.get("doppler"), dict):
            return v["doppler"]
        for k in PRICE_KEYS:
            d = find_doppler(v.get(k))
            if d:
                return d
    return None


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


def from_csgotrader(bases, crates):
    feed = fetch(CSGOTRADER)
    print(f"csgotrader: {len(feed)} entries", file=sys.stderr)
    sample = feed.get("AK-47 | Redline (Field-Tested)") or next(iter(feed.values()))
    print("sample entry:", json.dumps(sample)[:1500], file=sys.stderr)
    prices, phases, used = {}, {}, {}
    for name, entry in feed.items():
        if not isinstance(entry, dict):
            continue
        if name not in crates and base_name(name) not in bases:
            continue
        for prov in PROVIDERS:
            p = extract(entry.get(prov))
            if p:
                prices[name] = round(p, 2)
                used[prov] = used.get(prov, 0) + 1
                d = find_doppler(entry.get(prov))
                if d:
                    for ph, pv in d.items():
                        pv = extract(pv)
                        if pv:
                            phases[f"{name}|{ph}"] = round(pv, 2)
                break
    print("prices per market:", used, file=sys.stderr)
    top = max(used, key=used.get) if used else "csgotrader"
    return prices, phases, f"{top} (via csgotrader.app)"


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


def main():
    bases, crates = wanted_names()
    result = None
    for source in (from_csgotrader, from_skinport):
        try:
            result = source(bases, crates)
            if len(result[0]) > 1000:
                break
            print(f"{source.__name__}: only {len(result[0])} prices, trying next source", file=sys.stderr)
        except Exception as e:  # network, format or decode errors: fall through
            print(f"{source.__name__} failed: {e!r}", file=sys.stderr)
    if not result or not result[0]:
        sys.exit("No price source worked; js/prices.js left unchanged.")
    prices, phases, source = result
    payload = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": source,
        "p": dict(sorted(prices.items())),
        "ph": dict(sorted(phases.items())),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Generated by scripts/build_prices.py. Do not edit by hand. */\n")
        f.write("window.CS_PRICES=")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print(f"wrote {OUT}: {len(prices)} prices, {len(phases)} Doppler phase prices from {source}", file=sys.stderr)


if __name__ == "__main__":
    main()
