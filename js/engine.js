/* Game rules: drop odds, float + pattern rolls, StatTrak, Doppler phases, trade-ups. */
(function () {
  const D = window.CS_DATA;
  const CS = (window.CS = window.CS || {});

  // ---------- randomness ----------
  const buf = new Uint32Array(1);
  function random() {
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  function randInt(n) {
    return Math.floor(random() * n);
  }
  function weighted(entries) {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const e of entries) total += e[1];
    let r = random() * total;
    for (const e of entries) {
      r -= e[1];
      if (r < 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }

  // ---------- rarity tiers ----------
  const TIERS = [
    { name: "Consumer Grade", color: "#b0c3d9" },
    { name: "Industrial Grade", color: "#5e98d9" },
    { name: "Mil-Spec Grade", color: "#4b69ff" },
    { name: "Restricted", color: "#8847ff" },
    { name: "Classified", color: "#d32ce6" },
    { name: "Covert", color: "#eb4b4b" },
    { name: "Rare Special Item", color: "#e4ae39" },
    { name: "Contraband", color: "#e4ae39" },
  ];
  const STICKER_TIER_NAMES = { 2: "High Grade", 3: "Remarkable", 4: "Exotic", 5: "Extraordinary" };
  const GOLD = 6;

  // ---------- items ----------
  const IMG = D.img;
  const items = D.items.map((a, idx) => ({
    idx,
    name: a[0],
    rarity: D.rarityNames[a[1]],
    tier: a[2],
    img: a[3] ? IMG[+a[3][0]] + a[3].slice(1) : "",
    steamImg: a[3] ? a[3][0] === "0" : false,
    min: a[4],
    max: a[5],
    stattrakable: !!(a[6] & 1),
    painted: !!(a[6] & 2),
    kind: a[7],
    phase: a[8],
    key: a[9],
  }));
  const byKey = new Map(items.map((it) => [it.key, it]));
  for (const it of items) {
    const bar = it.name.indexOf(" | ");
    it.base = bar > -1 ? it.name.slice(0, bar) : it.kind === "sticker" ? "Sticker" : it.kind === "patch" ? "Patch" : "";
    it.finish = bar > -1 ? it.name.slice(bar + 3) : it.name;
  }

  const CATEGORIES = [
    { id: "case", label: "Weapon Cases", short: "Cases", key: true },
    { id: "sticker", label: "Sticker Capsules", short: "Stickers" },
    { id: "autograph", label: "Autograph Capsules", short: "Autographs" },
    { id: "souvenir", label: "Souvenir Packages", short: "Souvenirs" },
    { id: "patch", label: "Patches & Pins", short: "Patches & Pins" },
    { id: "music", label: "Music Kit Boxes", short: "Music Kits" },
  ];
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  const crates = D.crates.map((c) => ({
    id: c.id,
    name: c.n,
    cat: c.t,
    date: c.d,
    img: c.i ? IMG[+c.i[0]] + c.i.slice(1) : "",
    contains: c.c.map((i) => items[i]),
    rare: c.r.map((i) => items[i]),
    needsKey: c.t === "case",
  }));
  const crateById = new Map(crates.map((c) => [c.id, c]));

  // Group the rare pool by finish so each Doppler counts once, then roll its phase.
  for (const c of crates) {
    const groups = new Map();
    for (const it of c.rare) {
      if (!groups.has(it.name)) groups.set(it.name, []);
      groups.get(it.name).push(it);
    }
    c.rareGroups = [...groups.values()];
    c.tiers = buildOdds(c);
  }

  // Published CS2 case odds are ~79.92 / 15.98 / 3.20 / 0.64 / 0.26 %.
  // Each grade is 1/5 as likely as the one below it; gold takes a fixed 0.26 %.
  // The same ratio is used for capsules and souvenir packages.
  function buildOdds(c) {
    const byTier = new Map();
    for (const it of c.contains) {
      if (!byTier.has(it.tier)) byTier.set(it.tier, []);
      byTier.get(it.tier).push(it);
    }
    const tiers = [...byTier.keys()].sort((a, b) => a - b);
    const weights = tiers.map((t) => Math.pow(5, 5 - Math.min(t, 5)));
    const sum = weights.reduce((a, b) => a + b, 0);
    const goldP = c.rare.length ? 0.0026 : 0;
    const out = tiers.map((t, i) => ({ tier: t, p: (weights[i] / sum) * (1 - goldP), items: byTier.get(t) }));
    if (goldP) out.push({ tier: GOLD, p: goldP, items: c.rare });
    return out.sort((a, b) => b.tier - a.tier);
  }

  const PHASE_WEIGHTS = {
    "Phase 1": 24, "Phase 2": 24, "Phase 3": 24, "Phase 4": 24,
    Ruby: 1.4, Sapphire: 1.4, "Black Pearl": 1.2, Emerald: 2.6,
  };

  function rollItem(crate) {
    const tier = weighted(crate.tiers.map((t) => [t, t.p]));
    if (tier.tier === GOLD) return rollRare(crate.rareGroups);
    return tier.items[randInt(tier.items.length)];
  }
  function rollRare(groups) {
    const g = groups[randInt(groups.length)];
    if (g.length === 1) return g[0];
    return weighted(g.map((it) => [it, PHASE_WEIGHTS[it.phase] || 10]));
  }

  // ---------- wear ----------
  const WEARS = [
    { name: "Factory New", short: "FN", lo: 0, hi: 0.07 },
    { name: "Minimal Wear", short: "MW", lo: 0.07, hi: 0.15 },
    { name: "Field-Tested", short: "FT", lo: 0.15, hi: 0.38 },
    { name: "Well-Worn", short: "WW", lo: 0.38, hi: 0.45 },
    { name: "Battle-Scarred", short: "BS", lo: 0.45, hi: 1 },
  ];
  // Community-measured float distribution: a wear bracket is picked with these
  // weights, a value is drawn uniformly inside it, then squeezed into the skin's range.
  const BRACKET_WEIGHTS = [0.03, 0.24, 0.33, 0.24, 0.16];

  function wearOf(f) {
    if (f == null) return null;
    for (const w of WEARS) if (f < w.hi) return w;
    return WEARS[4];
  }
  function rollFloat(it) {
    if (!it.painted) return null;
    const b = weighted(WEARS.map((w, i) => [w, BRACKET_WEIGHTS[i]]));
    const raw = b.lo + random() * (b.hi - b.lo);
    return Math.fround(it.min + raw * (it.max - it.min));
  }
  // Wears a skin can actually exist in, given its float cap.
  function possibleWears(it) {
    if (!it.painted) return [];
    return WEARS.filter((w) => w.hi > it.min && w.lo < it.max);
  }

  let uidCounter = 0;
  function uid() {
    return Date.now().toString(36) + (uidCounter++ % 1296).toString(36).padStart(2, "0") + randInt(1296).toString(36);
  }

  function makeDrop(item, crate, opts = {}) {
    const isWeaponish = item.kind === "weapon" || item.kind === "knife";
    const st = opts.st != null ? opts.st
      : crate && crate.cat === "case" && item.stattrakable && random() < 0.1;
    return {
      u: uid(),
      k: item.key,
      f: opts.f !== undefined ? opts.f : rollFloat(item),
      s: item.painted ? randInt(1000) : null,
      st: st ? 1 : 0,
      sv: crate && crate.cat === "souvenir" && isWeaponish ? 1 : 0,
      c: crate ? crate.id : opts.c || null,
      t: Date.now(),
      o: opts.origin || "case",
    };
  }

  function openCrate(crate) {
    return makeDrop(rollItem(crate), crate);
  }

  // ---------- presentation helpers ----------
  function tierColor(t) {
    return TIERS[t] ? TIERS[t].color : TIERS[2].color;
  }
  function tierName(t, kind) {
    if (t === GOLD) return "Rare Special Item";
    if (kind && kind !== "weapon" && kind !== "knife" && kind !== "gloves" && STICKER_TIER_NAMES[t]) return STICKER_TIER_NAMES[t];
    return TIERS[t] ? TIERS[t].name : "";
  }
  function fullName(inv) {
    const it = byKey.get(inv.k);
    if (!it) return "Unknown item";
    let n = it.name;
    if (inv.sv) n = "Souvenir " + n;
    if (inv.st && !n.includes("StatTrak")) n = n.startsWith("★ ") ? "★ StatTrak™ " + n.slice(2) : "StatTrak™ " + n;
    const w = wearOf(inv.f);
    if (w) n += " (" + w.name + ")";
    return n;
  }
  function floatText(f) {
    // CS2 stores wear as a 32-bit float and shows its full decimal expansion.
    return f == null ? "" : String(f);
  }
  function thumb(it, size) {
    if (!it || !it.img) return "";
    return it.steamImg ? it.img + "/" + size + "fx" + size + "f" : it.img;
  }

  // ---------- trade-up contracts ----------
  // 10 items of one grade -> 1 item of the next grade from the inputs' collections.
  // 5 Coverts -> 1 knife or pair of gloves from the inputs' cases (CS2, Oct 2025).
  function tradeUpSize(tier) {
    return tier === 5 ? 5 : 10;
  }
  function nextPool(crate, tier) {
    if (!crate) return [];
    if (tier === 5) return crate.rareGroups;
    return crate.contains.filter((it) => it.tier === tier + 1).map((it) => [it]);
  }
  function tradeUpEligible(inv) {
    const it = byKey.get(inv.k);
    if (!it || inv.sv || it.kind !== "weapon" || it.tier > 5 || !it.painted) return false;
    return nextPool(crateById.get(inv.c), it.tier).length > 0;
  }
  // Returns [{group: [items], p, item (representative), fl (output float)}]
  function tradeUpOutcomes(inputs) {
    if (!inputs.length) return [];
    const its = inputs.map((inv) => byKey.get(inv.k));
    const tier = its[0].tier;
    // CS2 averages each input's float normalised to its own range.
    const avgNorm = inputs.reduce((a, inv, i) => {
      const it = its[i];
      return a + (it.max > it.min ? (inv.f - it.min) / (it.max - it.min) : 0);
    }, 0) / inputs.length;
    const acc = new Map();
    inputs.forEach((inv) => {
      const pool = nextPool(crateById.get(inv.c), tier);
      pool.forEach((group) => {
        const key = group[0].name;
        const e = acc.get(key) || { group, p: 0 };
        e.p += 1 / inputs.length / pool.length;
        acc.set(key, e);
      });
    });
    return [...acc.values()]
      .map((e) => {
        const it = e.group[0];
        const fl = it.painted ? Math.fround(it.min + avgNorm * (it.max - it.min)) : null;
        return { ...e, item: it, fl };
      })
      .sort((a, b) => b.p - a.p);
  }
  function signTradeUp(inputs) {
    const outs = tradeUpOutcomes(inputs);
    const pick = weighted(outs.map((o) => [o, o.p]));
    const it = pick.group.length > 1 ? rollRare([pick.group]) : pick.item;
    const fl = it.painted ? Math.fround(it.min + ((pick.fl - pick.item.min) / ((pick.item.max - pick.item.min) || 1)) * (it.max - it.min)) : null;
    const st = inputs[0].st && it.stattrakable ? 1 : 0;
    // The output is credited to the case of an input that could have produced it.
    const src = inputs.find((inv) => nextPool(crateById.get(inv.c), byKey.get(inv.k).tier).some((g) => g[0].name === it.name));
    return makeDrop(it, null, { f: fl, st, c: src ? src.c : inputs[0].c, origin: "tradeup" });
  }

  Object.assign(CS, {
    random, randInt, weighted,
    TIERS, GOLD, WEARS, CATEGORIES, catById,
    items, byKey, crates, crateById,
    rollItem, openCrate, makeDrop, wearOf, rollFloat, possibleWears,
    tierColor, tierName, fullName, floatText, thumb,
    tradeUpSize, tradeUpEligible, tradeUpOutcomes, signTradeUp,
    KEY_PRICE: 2.49,
  });
})();
