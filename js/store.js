/* Inventory, stats and settings, saved in this browser (IndexedDB, with a localStorage fallback). */
(function () {
  const CS = window.CS;
  const KEY = "keyless.v1";
  const HISTORY_MAX = 60;
  const INV_MAX = 250000; // keeps memory and save times reasonable

  function blank() {
    return {
      inv: [],
      history: [], // most recent drops, newest first
      stats: { opened: {}, tiers: {}, keys: 0, tradeups: 0, golds: 0, bestFloat: null, simulated: 0 },
      settings: { sound: true, quick: false, count: 1 },
    };
  }
  function merge(s) {
    return { ...blank(), ...s, stats: { ...blank().stats, ...s.stats }, settings: { ...blank().settings, ...s.settings } };
  }

  let state = blank();
  let saveError = null;

  // ---------- IndexedDB ----------
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open("keyless", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("kv");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }
  async function idbGet(k) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const r = d.transaction("kv").objectStore("kv").get(k);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idbSet(k, v) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("kv", "readwrite");
      tx.objectStore("kv").put(v, k);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  let useIDB = true;
  const ready = (async () => {
    try {
      const saved = await idbGet(KEY);
      if (saved) {
        state = merge(saved);
      } else {
        // First run after the move from localStorage: migrate.
        const raw = localStorage.getItem(KEY);
        if (raw) {
          state = merge(JSON.parse(raw));
          await idbSet(KEY, state);
          localStorage.removeItem(KEY);
        }
      }
    } catch (e) {
      useIDB = false;
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) state = merge(JSON.parse(raw));
      } catch (e2) {
        saveError = e2;
      }
    }
  })();

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 300);
  }
  async function flush() {
    saveTimer = null;
    try {
      if (useIDB) await idbSet(KEY, state);
      else localStorage.setItem(KEY, JSON.stringify(state));
      saveError = null;
    } catch (e) {
      saveError = e;
      console.warn("Could not save inventory", e);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer) {
      clearTimeout(saveTimer);
      flush();
    }
  });

  const listeners = new Set();
  function emit() {
    listeners.forEach((fn) => fn());
  }

  function snapshot(inv) {
    return { u: inv.u, k: inv.k, f: inv.f, st: inv.st, sv: inv.sv, c: inv.c, t: inv.t, o: inv.o };
  }

  // Adds drops to the inventory. Returns how many didn't fit under INV_MAX.
  function recordDrops(drops, crate, { countOpened = true } = {}) {
    const st = state.stats;
    let overflow = 0;
    for (const d of drops) {
      const it = CS.byKey.get(d.k);
      if (countOpened) {
        st.tiers[it.tier] = (st.tiers[it.tier] || 0) + 1;
        if (it.tier === CS.GOLD) st.golds++;
      }
      if (d.f != null && (st.bestFloat == null || d.f < st.bestFloat.f)) st.bestFloat = snapshot(d);
      if (state.inv.length < INV_MAX) state.inv.push(d);
      else overflow++;
    }
    for (const d of drops.slice(-HISTORY_MAX)) state.history.unshift(snapshot(d));
    if (crate && countOpened) {
      st.opened[crate.cat] = (st.opened[crate.cat] || 0) + drops.length;
      if (crate.needsKey) st.keys += drops.length;
    }
    state.history.length = Math.min(state.history.length, HISTORY_MAX);
    save();
    emit();
    return overflow;
  }

  // Folds a bulk simulation into the stats (and keeps whatever drops it returned).
  function recordSimulation(crate, result) {
    const st = state.stats;
    st.opened[crate.cat] = (st.opened[crate.cat] || 0) + result.opened;
    if (crate.needsKey) st.keys += result.opened;
    st.simulated += result.opened;
    for (const [t, n] of Object.entries(result.tiers)) {
      st.tiers[t] = (st.tiers[t] || 0) + n;
      if (+t === CS.GOLD) st.golds += n;
    }
    return result.kept.length ? recordDrops(result.kept, crate, { countOpened: false }) : (save(), emit(), 0);
  }

  function remove(uids) {
    const set = new Set(uids);
    state.inv = state.inv.filter((x) => !set.has(x.u));
    save();
    emit();
  }

  function wipeInventory({ keepFavourites = false } = {}) {
    state.inv = keepFavourites ? state.inv.filter((x) => x.fav) : [];
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
    state = { ...merge(s), inv: known, settings: state.settings };
    save();
    emit();
    return { kept: known.length, dropped: s.inv.length - known.length };
  }

  CS.store = {
    ready,
    INV_MAX,
    get state() { return state; },
    get saveError() { return saveError; },
    on: (fn) => listeners.add(fn),
    off: (fn) => listeners.delete(fn),
    recordDrops, recordSimulation, remove, wipeInventory, toggleFav, tradeUp, setSetting, reset, exportJSON, importJSON,
  };
})();
