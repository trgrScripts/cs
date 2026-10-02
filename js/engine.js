/* Game rules: drop odds, float + pattern rolls, StatTrak, Doppler phases, trade-ups. */
(function () {
  const D = window.CS_DATA;
  const CS = (window.CS = window.CS || {});

  // ---------- randomness ----------
  // sfc32, seeded from the browser's crypto RNG: fast enough for millions of rolls.
  const seed = new Uint32Array(4);
  crypto.getRandomValues(seed);
  let a = seed[0], b = seed[1], c = seed[2], d = seed[3];
  function random() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  for (let i = 0; i < 16; i++) random();
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
  const KEY_PRICE = 2.49; // Steam price of a case key, USD

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
    market: a[10] || a[0],
  }));
  const byKey = new Map(items.map((it) => [it.key, it]));
  for (const it of items) {
    const bar = it.name.indexOf(" | ");
    it.base = bar > -1 ? it.name.slice(0, bar) : it.kind === "sticker" ? "Sticker" : it.kind === "patch" ? "Patch" : "";
    it.finish = bar > -1 ? it.name.slice(bar + 3) : it.name;
  }

  // ---------- rare patterns ----------
  // name -> Map(seed -> tier), from js/patterns.js
  const patternIndex = new Map();
  for (const rule of window.CS_PATTERNS || []) {
    for (const n of rule.names) {
      const m = patternIndex.get(n) || new Map();
      for (const t of rule.tiers) for (const seed of t.seeds) m.set(seed, t);
      patternIndex.set(n, m);
    }
  }
  for (const it of items) {
    const m = patternIndex.get(it.market.replace("StatTrak™ ", ""));
    if (m) it.patterns = m;
  }
  function patternOf(inv) {
    const it = byKey.get(inv.k);
    return it && it.patterns && inv.s != null ? it.patterns.get(inv.s) || null : null;
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
    market: c.m || c.n,
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
      s: opts.s != null ? opts.s : item.painted ? randInt(1000) : null,
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
    if (f == null) return "";
    // Avoid exponent notation for tiny floats (e.g. 5.2e-7).
    return f < 1e-4 ? f.toFixed(20).replace(/0+$/, "") : String(f);
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

  // ---------- prices ----------
  const PR = window.CS_PRICES || { p: {}, ph: {} };
  const P = PR.p || {};
  const PH = PR.ph || {};
  const hasPrices = Object.keys(P).length > 0;

  function marketName(it, wear, st, sv) {
    let n = it.market;
    if (st && !/StatTrak/.test(n)) n = n.startsWith("★ ") ? "★ StatTrak™ " + n.slice(2) : "StatTrak™ " + n;
    if (sv) n = "Souvenir " + n;
    if (wear) n += " (" + wear.name + ")";
    return n;
  }
  // Exact market price, or null.
  function lookup(it, wear, st, sv) {
    const n = marketName(it, wear, st, sv);
    if (it.phase && PH[n + "|" + it.phase] != null) return PH[n + "|" + it.phase];
    return P[n] != null ? P[n] : null;
  }
  // Price of one copy of an item. `wear` may be a wear object or null.
  // When the market has no sales for this exact variant, it is estimated from the
  // nearest wear, or from the plain version with a typical StatTrak™/Souvenir premium.
  const priceCache = new Map();
  function priceOf(it, wear, st, sv) {
    const key = it.idx * 64 + (wear ? WEARS.indexOf(wear) : 5) * 4 + (st ? 2 : 0) + (sv ? 1 : 0);
    if (priceCache.has(key)) return priceCache.get(key);
    let p = lookup(it, wear, st, sv);
    if (p == null) p = estimate(it, wear, st, sv);
    priceCache.set(key, p);
    return p;
  }
  function estimate(it, wear, st, sv) {
    if (wear) {
      const i = WEARS.indexOf(wear);
      let best = null, dist = 9;
      for (const w of possibleWears(it)) {
        const p = lookup(it, w, st, sv);
        const d = Math.abs(WEARS.indexOf(w) - i);
        if (p != null && d < dist) { best = p; dist = d; }
      }
      if (best != null) return best;
    }
    if (st) { const p = priceOf(it, wear, 0, sv); if (p != null) return Math.round(p * 200) / 100; }
    if (sv) { const p = priceOf(it, wear, st, 0); if (p != null) return Math.round(p * 150) / 100; }
    return null;
  }
  function isEstimate(inv) {
    const it = byKey.get(inv.k);
    return !!it && lookup(it, wearOf(inv.f), inv.st, inv.sv) == null && price(inv) != null;
  }
  function price(inv) {
    const it = byKey.get(inv.k);
    if (!it) return null;
    const p = priceOf(it, wearOf(inv.f), inv.st, inv.sv);
    const pat = patternOf(inv);
    return p != null && pat ? Math.round(p * pat.mult * 100) / 100 : p;
  }
  // Cheapest and dearest normal (non-StatTrak) copy across the wears a skin exists in.
  function priceRange(it, sv) {
    const wears = it.painted ? possibleWears(it) : [null];
    let lo = null, hi = null;
    for (const w of wears) {
      const p = lookup(it, w, false, sv);
      if (p == null) continue;
      lo = lo == null ? p : Math.min(lo, p);
      hi = hi == null ? p : Math.max(hi, p);
    }
    return lo == null ? null : [lo, hi];
  }
  function cratePrice(crate) {
    return P[crate.market] != null ? P[crate.market] : null;
  }
  // What one opening costs: the container plus a key for weapon cases.
  function openCost(crate) {
    return (cratePrice(crate) || 0) + (crate.needsKey ? KEY_PRICE : 0);
  }
  function money(n) {
    if (n == null) return "–";
    const abs = Math.abs(n);
    const s = abs >= 1e12 ? (abs / 1e12).toFixed(2) + "T" : abs >= 1e9 ? (abs / 1e9).toFixed(2) + "B" : abs >= 1e6 ? (abs / 1e6).toFixed(2) + "M"
      : abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? "-$" : "$") + s;
  }

  // ---------- bulk simulation ----------
  // Opens `n` containers in chunks without building inventory objects for every drop.
  // Counts are kept per item × wear × StatTrak so the total value can be priced exactly.
  // `keepTier`: drops at or above this tier are returned as real items (null keeps none).
  // Up to EXACT_MAX openings are rolled one by one; beyond that the totals are drawn
  // statistically (see simulateFast), which gives the same distribution in milliseconds.
  const EXACT_MAX = 10000000;
  function simulate(crate, n, opts = {}) {
    return n > EXACT_MAX ? simulateFast(crate, n, opts) : simulateExact(crate, n, opts);
  }

  function simulateExact(crate, n, { keepTier = null, keepMax = 100000, onProgress, shouldStop } = {}) {
    return new Promise((resolve) => {
      const counts = new Map(); // key -> count, key = itemIdx*16 + wear*2 + st
      const tiers = {};
      const kept = [];
      const specials = []; // rare pattern hits
      let done = 0, keptOverflow = 0, best = null, bestFloat = null;
      const souv = crate.cat === "souvenir";
      const CHUNK = 50000;
      function step() {
        const end = Math.min(n, done + CHUNK);
        for (; done < end; done++) {
          const it = rollItem(crate);
          const f = rollFloat(it);
          const st = crate.cat === "case" && it.stattrakable && random() < 0.1 ? 1 : 0;
          const w = f == null ? 5 : f < 0.07 ? 0 : f < 0.15 ? 1 : f < 0.38 ? 2 : f < 0.45 ? 3 : 4;
          let seed = null;
          if (it.patterns) {
            seed = randInt(1000);
            const pat = it.patterns.get(seed);
            if (pat) specials.push({ it, f, st, seed, pat, cnt: 1, wear: w === 5 ? null : WEARS[w] });
          }
          const key = it.idx * 16 + w * 2 + st;
          counts.set(key, (counts.get(key) || 0) + 1);
          tiers[it.tier] = (tiers[it.tier] || 0) + 1;
          if (f != null && (bestFloat == null || f < bestFloat.f)) bestFloat = { it, f, st };
          if (keepTier != null && it.tier >= keepTier) {
            if (kept.length < keepMax) kept.push(makeDrop(it, crate, { f, st, s: seed }));
            else keptOverflow++;
          }
        }
        if (onProgress) onProgress(done / n);
        if (done < n && !(shouldStop && shouldStop())) return setTimeout(step, 0);
        // Price everything once at the end.
        let value = 0, unpriced = 0;
        const rows = [];
        for (const [key, cnt] of counts) {
          const it = items[Math.floor(key / 16)];
          const w = (key % 16) >> 1;
          const st = key & 1;
          const p = priceOf(it, w === 5 ? null : WEARS[w], st, souv && (it.kind === "weapon" || it.kind === "knife"));
          if (p == null) unpriced += cnt;
          else value += p * cnt;
          rows.push({ it, wear: w === 5 ? null : WEARS[w], st, cnt, p });
        }
        // Rare patterns: add their premium on top of the normal price counted above.
        for (const sp of specials) {
          const base = priceOf(sp.it, sp.wear, sp.st, souv && (sp.it.kind === "weapon" || sp.it.kind === "knife"));
          sp.p = base != null ? Math.round(base * sp.pat.mult * 100) / 100 : null;
          if (base != null) value += base * (sp.pat.mult - 1) * sp.cnt;
        }
        specials.sort((x, y) => (y.p || 0) - (x.p || 0));
        rows.sort((x, y) => (y.p || 0) - (x.p || 0) || y.it.tier - x.it.tier);
        best = rows[0] || null;
        resolve({ opened: done, tiers, value, unpriced, rows, best, bestFloat, kept, keptOverflow, specials, cost: openCost(crate) * done });
      }
      setTimeout(step, 0);
    });
  }

  // ---------- statistical sampling for huge runs ----------
  function gaussian() {
    let u = 0;
    while (u === 0) u = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
  }
  // Number of successes in n trials with probability p.
  function binomial(n, p) {
    if (n <= 0 || p <= 0) return 0;
    if (p >= 1) return n;
    if (p > 0.5) return n - binomial(n, 1 - p);
    if (n < 1000) {
      let k = 0;
      for (let i = 0; i < n; i++) if (random() < p) k++;
      return k;
    }
    const mean = n * p;
    if (mean < 30) {
      // Exact inversion: walk the probability mass function.
      let pk = Math.exp(n * Math.log1p(-p));
      let cdf = pk, k = 0;
      const u = random();
      const r = p / (1 - p);
      while (u > cdf && k < n) {
        pk *= ((n - k) / (k + 1)) * r;
        k++;
        cdf += pk;
        if (pk < 1e-300) break;
      }
      return k;
    }
    // Large counts: the normal approximation is indistinguishable from exact here.
    const k = Math.round(mean + Math.sqrt(mean * (1 - p)) * gaussian());
    return Math.max(0, Math.min(n, k));
  }
  // Splits n into counts for each probability in `probs` (which sum to <= 1).
  function multinomial(n, probs) {
    const out = new Array(probs.length).fill(0);
    let left = n, mass = probs.reduce((a, b) => a + b, 0);
    for (let i = 0; i < probs.length && left > 0; i++) {
      if (probs[i] <= 0) continue;
      const c = i === probs.length - 1 || mass <= probs[i] ? left : binomial(left, Math.min(1, probs[i] / mass));
      out[i] = c;
      left -= c;
      mass -= probs[i];
    }
    return out;
  }
  // Chance of each exterior for one drop of `it`, from the same bracket model as rollFloat.
  const wearProbCache = new Map();
  function wearProbs(it) {
    if (wearProbCache.has(it.idx)) return wearProbCache.get(it.idx);
    const span = it.max - it.min;
    const out = WEARS.map((W) => {
      const a = (W.lo - it.min) / span, b = (W.hi - it.min) / span; // preimage in raw [0,1]
      let p = 0;
      WEARS.forEach((B, i) => {
        const lo = Math.max(a, B.lo), hi = Math.min(b, B.hi);
        if (hi > lo) p += BRACKET_WEIGHTS[i] * (hi - lo) / (B.hi - B.lo);
      });
      return p;
    });
    wearProbCache.set(it.idx, out);
    return out;
  }
  // Probability of every item in a container, Doppler phases included.
  function itemProbs(crate) {
    const list = [];
    for (const t of crate.tiers) {
      if (t.tier === GOLD) {
        for (const g of crate.rareGroups) {
          const w = g.map((it) => (g.length === 1 ? 1 : PHASE_WEIGHTS[it.phase] || 10));
          const sum = w.reduce((a, b) => a + b, 0);
          g.forEach((it, i) => list.push([it, (t.p / crate.rareGroups.length) * (w[i] / sum)]));
        }
      } else {
        for (const it of t.items) list.push([it, t.p / t.items.length]);
      }
    }
    return list;
  }

  function simulateFast(crate, n, { keepTier = null, keepMax = 100000, onProgress } = {}) {
    return new Promise((resolve) => setTimeout(() => {
      const souv = crate.cat === "souvenir";
      const probs = itemProbs(crate);
      const counts = multinomial(n, probs.map((x) => x[1]));
      const tiers = {};
      const rows = [];
      const specials = [];
      let value = 0, unpriced = 0, bestFloat = null;
      const kept = [];
      let keptOverflow = 0;
      const svOf = (it) => souv && (it.kind === "weapon" || it.kind === "knife");
      const addRow = (it, wear, st, cnt) => {
        if (!cnt) return;
        const p = priceOf(it, wear, st, svOf(it));
        if (p == null) unpriced += cnt;
        else value += p * cnt;
        rows.push({ it, wear, st, cnt, p });
      };
      probs.forEach(([it], i) => {
        const c = counts[i];
        if (!c) return;
        tiers[it.tier] = (tiers[it.tier] || 0) + c;
        const stN = crate.cat === "case" && it.stattrakable ? binomial(c, 0.1) : 0;
        for (const [st, m] of [[0, c - stN], [1, stN]]) {
          if (!m) continue;
          if (!it.painted) { addRow(it, null, st, m); continue; }
          const byWear = multinomial(m, wearProbs(it));
          byWear.forEach((k, w) => addRow(it, WEARS[w], st, k));
          // Rare patterns: each tier's seeds are a fixed share of the 1000 possible.
          if (it.patterns) {
            let left = m;
            const tiersSeen = new Set(it.patterns.values());
            for (const pat of tiersSeen) {
              const h = binomial(left, pat.seeds.length / 1000);
              left -= h;
              multinomial(h, wearProbs(it)).forEach((k, w) => {
                if (k) specials.push({ it, pat, st, cnt: k, seed: pat.seeds.length === 1 ? pat.seeds[0] : null, wear: WEARS[w], f: (WEARS[w].lo + WEARS[w].hi) / 2 });
              });
            }
          }
        }
        // Lowest float: the minimum of the draws that landed in the lowest raw bracket.
        if (it.painted) {
          const k = binomial(c, BRACKET_WEIGHTS[0]);
          if (k > 0) {
            const raw = WEARS[0].hi * -Math.expm1(Math.log1p(-random()) / k);
            const f = Math.fround(it.min + raw * (it.max - it.min));
            if (bestFloat == null || f < bestFloat.f) bestFloat = { it, f, st: crate.cat === "case" && it.stattrakable && random() < 0.1 ? 1 : 0 };
          }
        }
      });
      for (const sp of specials) {
        const base = priceOf(sp.it, sp.wear, sp.st, svOf(sp.it));
        sp.p = base != null ? Math.round(base * sp.pat.mult * 100) / 100 : null;
        if (base != null) value += base * (sp.pat.mult - 1) * sp.cnt;
      }
      specials.sort((x, y) => (y.p || 0) - (x.p || 0));
      // Real items for the inventory, rarest first, up to the room left.
      if (keepTier != null) {
        const eligible = probs.map(([it], i) => [it, counts[i]]).filter(([it, c]) => c && it.tier >= keepTier).sort((a, b) => b[0].tier - a[0].tier);
        let room = keepMax;
        for (const [it, c] of eligible) {
          const make = Math.min(c, room);
          for (let j = 0; j < make; j++) kept.push(makeDrop(it, crate));
          room -= make;
          keptOverflow += c - make;
        }
      }
      rows.sort((x, y) => (y.p || 0) - (x.p || 0) || y.it.tier - x.it.tier);
      if (onProgress) onProgress(1);
      resolve({ opened: n, tiers, value, unpriced, rows, best: rows[0] || null, bestFloat, kept, keptOverflow, specials, sampled: true, cost: openCost(crate) * n });
    }, 0));
  }

  Object.assign(CS, {
    EXACT_MAX, patternOf, prices: PR, hasPrices, marketName, priceOf, price, isEstimate, priceRange, cratePrice, openCost, money, simulate,
    random, randInt, weighted,
    TIERS, GOLD, WEARS, CATEGORIES, catById,
    items, byKey, crates, crateById,
    rollItem, openCrate, makeDrop, wearOf, rollFloat, possibleWears,
    tierColor, tierName, fullName, floatText, thumb,
    tradeUpSize, tradeUpEligible, tradeUpOutcomes, signTradeUp,
    KEY_PRICE,
  });
})();
