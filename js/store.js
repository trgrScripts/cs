/* Inventory, stats and settings, saved in this browser's localStorage. */
(function () {
  const CS = window.CS;
  const KEY = "keyless.v1";
  const HISTORY_MAX = 60;

  function blank() {
    return {
      inv: [],
      history: [], // most recent drop uids/snapshots, newest first
      stats: { opened: {}, tiers: {}, keys: 0, tradeups: 0, golds: 0, bestFloat: null },
      settings: { sound: true, quick: false, count: 1 },
    };
  }

  let state = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state = { ...blank(), ...s, stats: { ...blank().stats, ...s.stats }, settings: { ...blank().settings, ...s.settings } };
    }
  } catch (e) {
    console.warn("Could not read saved inventory", e);
  }

  let saveTimer = null;
  let saveError = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        saveError = null;
      } catch (e) {
        saveError = e;
        console.warn("Could not save inventory", e);
      }
    }, 150);
  }
  window.addEventListener("beforeunload", () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
    }
  });

  const listeners = new Set();
  function emit() {
    listeners.forEach((fn) => fn());
  }

  function snapshot(inv) {
    return { u: inv.u, k: inv.k, f: inv.f, st: inv.st, sv: inv.sv, c: inv.c, t: inv.t, o: inv.o };
  }

  function recordDrops(drops, crate) {
    const st = state.stats;
    for (const d of drops) {
      const it = CS.byKey.get(d.k);
      st.tiers[it.tier] = (st.tiers[it.tier] || 0) + 1;
      if (it.tier === CS.GOLD) st.golds++;
      if (d.f != null && (st.bestFloat == null || d.f < st.bestFloat.f)) st.bestFloat = snapshot(d);
      state.inv.push(d);
      state.history.unshift(snapshot(d));
    }
    if (crate) {
      st.opened[crate.cat] = (st.opened[crate.cat] || 0) + drops.length;
      if (crate.needsKey) st.keys += drops.length;
    }
    state.history.length = Math.min(state.history.length, HISTORY_MAX);
    save();
    emit();
  }

  function remove(uids) {
    const set = new Set(uids);
    state.inv = state.inv.filter((x) => !set.has(x.u));
    save();
    emit();
  }

  function toggleFav(uid) {
    const it = state.inv.find((x) => x.u === uid);
    if (it) it.fav = it.fav ? 0 : 1;
    save();
    emit();
  }

  function tradeUp(inputs, out) {
    remove(inputs.map((x) => x.u));
    state.stats.tradeups++;
    recordDrops([out], null);
  }

  function setSetting(k, v) {
    state.settings[k] = v;
    save();
    emit();
  }

  function reset() {
    const settings = state.settings;
    state = blank();
    state.settings = settings;
    save();
    emit();
  }

  function exportJSON() {
    return JSON.stringify({ app: "keyless", v: 1, ...state });
  }
  function importJSON(text) {
    const s = JSON.parse(text);
    if (!s || !Array.isArray(s.inv)) throw new Error("This file is not a Keyless inventory backup.");
    const known = s.inv.filter((x) => CS.byKey.has(x.k));
    state = { ...blank(), ...s, inv: known, stats: { ...blank().stats, ...s.stats }, settings: state.settings };
    save();
    emit();
    return { kept: known.length, dropped: s.inv.length - known.length };
  }

  CS.store = {
    get state() { return state; },
    get saveError() { return saveError; },
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    recordDrops, remove, toggleFav, tradeUp, setSetting, reset, exportJSON, importJSON,
  };
})();
