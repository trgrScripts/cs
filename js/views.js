/* Page views: container browser, inventory, trade-ups, simulator and stats. */
(function () {
  const CS = window.CS;
  const store = CS.store;
  const GOLD = CS.GOLD;
  const ui = CS.ui;
  const { esc, $, $$, pct, money, year, ago, big, imgTag, toast, itemCard, wearBar, confirmBox, choose, reduceMotion } = ui;
  const view = document.getElementById("view");

  function useInTradeUp(inv) {
    const it = CS.byKey.get(inv.k);
    tu.tier = it.tier;
    tu.st = !!inv.st;
    tu.picks = [inv.u];
    location.hash = "#/tradeup";
  }
  const inspect = (uid) => ui.inspect(uid, useInTradeUp);

  // ---------- containers browser ----------
  const browse = { cat: "case", q: "", sort: "new", limit: 60 };
  try {
    const saved = JSON.parse(sessionStorage.getItem("keyless.browse") || "null");
    if (saved) Object.assign(browse, saved, { limit: 60 });
  } catch (e) { /* storage blocked */ }

  function filteredCrates() {
    const q = browse.q.trim().toLowerCase();
    const list = CS.crates.filter((c) => (q ? c.name.toLowerCase().includes(q) : c.cat === browse.cat));
    const price = (c) => CS.cratePrice(c) ?? Infinity;
    const by = {
      new: (a, b) => (b.date || "").localeCompare(a.date || ""),
      old: (a, b) => (a.date || "9").localeCompare(b.date || "9"),
      name: (a, b) => a.name.localeCompare(b.name),
      cheap: (a, b) => price(a) - price(b),
      dear: (a, b) => (CS.cratePrice(b) ?? -1) - (CS.cratePrice(a) ?? -1),
    }[browse.sort];
    list.sort(by);
    if (q) list.sort((a, b) => (a.cat === browse.cat ? 0 : 1) - (b.cat === browse.cat ? 0 : 1));
    return list;
  }

  function crateCard(c) {
    const top = c.rare.length ? GOLD : Math.max(...c.contains.map((i) => i.tier));
    const goldKind = c.rare.length ? (c.rare.some((r) => r.kind === "gloves") ? (c.rare.some((r) => r.kind === "knife") ? "Knives & Gloves" : "Gloves") : "Knives") : "";
    const p = CS.cratePrice(c);
    return `<a class="crate-card" href="#/case/${encodeURIComponent(c.id)}">
      <div class="art">${c.img ? `<img loading="lazy" decoding="async" src="${esc(c.img)}" data-full="${esc(c.img)}" alt="">` : ""}</div>
      <div class="name">${esc(c.name)}</div>
      <div class="meta"><span>${year(c.date)} · ${c.contains.length} items</span>${goldKind ? `<span class="chip chip-gold">★ ${goldKind}</span>` : ""}</div>
      <div class="meta"><span class="price">${p != null ? money(p) : "–"}${c.needsKey ? ` <span class="muted">+ key</span>` : ""}</span></div>
      <span class="stripe" style="background:${CS.tierColor(top)}"></span>
    </a>`;
  }

  function renderCases() {
    const counts = {};
    CS.crates.forEach((c) => (counts[c.cat] = (counts[c.cat] || 0) + 1));
    const hist = store.state.history.slice(0, 16).filter((h) => CS.byKey.has(h.k));
    view.innerHTML = `
      <div class="view-head">
        <div><div class="eyebrow">${CS.crates.length} containers · no keys required</div><h1>Pick a container</h1>
        <p>Every case, capsule and souvenir package with its real contents and market prices. Drops roll with the published case odds, then get a float, pattern and a 10% StatTrak™ chance.</p></div>
      </div>
      ${hist.length ? `<div class="section-head"><h2>Your latest drops</h2><a class="muted" href="#/stats">History</a></div>
        <div class="drop-strip">${hist.map((h) => itemCard(CS.byKey.get(h.k), h)).join("")}</div>` : ""}
      <div class="tabs" role="tablist" aria-label="Container type">
        ${CS.CATEGORIES.map((c) => `<button class="tab" role="tab" data-cat="${c.id}" aria-selected="${c.id === browse.cat}">${c.short}<span>${counts[c.id] || 0}</span></button>`).join("")}
      </div>
      <div class="toolbar">
        <label class="sr-only" for="crate-q">Search containers</label>
        <input class="field" type="search" id="crate-q" placeholder="Search all containers, e.g. Kilowatt, Katowice 2014, Dreams" value="${esc(browse.q)}" autocomplete="off">
        <label class="sr-only" for="crate-sort">Sort</label>
        <select class="field" id="crate-sort">
          <option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">A–Z</option>
          <option value="cheap">Cheapest</option><option value="dear">Most expensive</option>
        </select>
      </div>
      <div id="crate-results"></div>`;
    $("#crate-sort").value = browse.sort;
    const results = $("#crate-results");
    const draw = () => {
      try { sessionStorage.setItem("keyless.browse", JSON.stringify(browse)); } catch (e) { /* ignore */ }
      const list = filteredCrates();
      results.innerHTML = list.length
        ? `<div class="crate-grid">${list.slice(0, browse.limit).map(crateCard).join("")}</div>
           ${list.length > browse.limit ? `<div class="load-more"><button class="btn" id="more">Show ${Math.min(60, list.length - browse.limit)} more of ${list.length - browse.limit}</button></div>` : ""}`
        : `<div class="empty"><h3>No containers match “${esc(browse.q)}”</h3><p>Try a case name, a tournament or a year.</p></div>`;
      const more = $("#more");
      if (more) more.addEventListener("click", () => { browse.limit += 60; draw(); });
    };
    $$(".tab").forEach((t) => t.addEventListener("click", () => {
      browse.cat = t.dataset.cat;
      browse.limit = 60;
      $$(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
      draw();
    }));
    $("#crate-q").addEventListener("input", (e) => { browse.q = e.target.value; browse.limit = 60; draw(); });
    $("#crate-sort").addEventListener("change", (e) => { browse.sort = e.target.value; draw(); });
    draw();
  }

  // ---------- inventory ----------
  const invView = { q: "", kind: "all", tier: "all", sort: "new", limit: 120, select: false, selected: new Set() };
  const KIND_FILTERS = [
    ["all", "All items"], ["weapon", "Weapons"], ["knife", "Knives"], ["gloves", "Gloves"],
    ["sticker", "Stickers"], ["patch", "Patches"], ["pin", "Pins"], ["music", "Music kits"],
    ["st", "StatTrak™ only"], ["sv", "Souvenir only"], ["fav", "Favourites"],
  ];

  function invFiltered() {
    const q = invView.q.trim().toLowerCase();
    const list = store.state.inv.filter((inv) => {
      const it = CS.byKey.get(inv.k);
      if (!it) return false;
      if (invView.kind === "st" ? !inv.st : invView.kind === "sv" ? !inv.sv : invView.kind === "fav" ? !inv.fav : invView.kind !== "all" && it.kind !== invView.kind) return false;
      if (invView.tier !== "all" && it.tier !== +invView.tier) return false;
      if (q && !CS.fullName(inv).toLowerCase().includes(q)) return false;
      return true;
    });
    const tier = (x) => CS.byKey.get(x.k).tier;
    const fl = (x) => (x.f == null ? 2 : x.f);
    const pr = (x) => CS.price(x) ?? -1;
    const sorts = {
      new: (a, b) => b.t - a.t,
      old: (a, b) => a.t - b.t,
      price: (a, b) => pr(b) - pr(a),
      cheap: (a, b) => (CS.price(a) ?? 1e12) - (CS.price(b) ?? 1e12),
      rarity: (a, b) => tier(b) - tier(a) || b.st - a.st || fl(a) - fl(b),
      floatlo: (a, b) => fl(a) - fl(b),
      floathi: (a, b) => (b.f == null ? -1 : b.f) - (a.f == null ? -1 : a.f),
      name: (a, b) => CS.byKey.get(a.k).name.localeCompare(CS.byKey.get(b.k).name),
    };
    return list.sort(sorts[invView.sort]);
  }

  function inventoryValue() {
    let v = 0;
    for (const x of store.state.inv) v += CS.price(x) || 0;
    return v;
  }

  function renderInventory() {
    const s = store.state;
    const golds = s.inv.filter((x) => CS.byKey.get(x.k)?.tier === GOLD).length;
    const sts = s.inv.filter((x) => x.st).length;
    view.innerHTML = `
      <div class="view-head">
        <div><div class="eyebrow">Saved in this browser</div><h1>Inventory</h1>
          <div class="inv-summary"><span><b>${big(s.inv.length)}</b> items</span><span>Worth <b class="good">${money(inventoryValue())}</b></span><span><b style="color:var(--gold)">${big(golds)}</b> ★ rare specials</span><span><b style="color:#f09a62">${big(sts)}</b> StatTrak™</span></div>
        </div>
        ${s.inv.length ? `<button class="btn btn-danger" id="wipe" type="button">Wipe inventory</button>` : ""}
      </div>
      ${s.inv.length ? `
      <div class="toolbar">
        <label class="sr-only" for="inv-q">Search inventory</label>
        <input class="field" type="search" id="inv-q" placeholder="Search your items" value="${esc(invView.q)}" autocomplete="off">
        <label class="sr-only" for="inv-kind">Item type</label>
        <select class="field" id="inv-kind">${KIND_FILTERS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select>
        <label class="sr-only" for="inv-tier">Rarity</label>
        <select class="field" id="inv-tier"><option value="all">Any rarity</option>${[GOLD, 5, 4, 3, 2, 1, 0].map((t) => `<option value="${t}">${CS.TIERS[t].name}</option>`).join("")}</select>
        <label class="sr-only" for="inv-sort">Sort</label>
        <select class="field" id="inv-sort">
          <option value="new">Newest</option><option value="old">Oldest</option><option value="price">Highest price</option><option value="cheap">Lowest price</option>
          <option value="rarity">Rarity</option><option value="floatlo">Lowest float</option><option value="floathi">Highest float</option><option value="name">Name</option>
        </select>
        <button class="btn btn-ghost" id="sel-mode" type="button" aria-pressed="${invView.select}">${invView.select ? "Done selecting" : "Select"}</button>
      </div>
      <div class="bulkbar" id="bulkbar" ${invView.select ? "" : "hidden"}>
        <span id="sel-count">0 selected</span><span class="spacer"></span>
        <button class="btn btn-ghost" id="sel-all" type="button">Select all shown</button>
        <button class="btn btn-ghost" id="sel-none" type="button">Clear</button>
        <button class="btn btn-danger" id="sel-del" type="button">Delete selected</button>
      </div>
      <div id="inv-results"></div>` : `
      <div class="empty"><h3>Nothing here yet</h3><p>Open a case or capsule and your drops land here, with their float, pattern and price.</p><a class="btn btn-go" href="#/">Browse containers</a></div>`}`;
    if (!s.inv.length) return;
    $("#inv-kind").value = invView.kind;
    $("#inv-tier").value = invView.tier;
    $("#inv-sort").value = invView.sort;
    const results = $("#inv-results");
    let shown = [];
    const draw = () => {
      const list = invFiltered();
      shown = list.slice(0, invView.limit);
      results.innerHTML = list.length
        ? `<div class="item-grid">${shown.map((inv) => itemCard(CS.byKey.get(inv.k), inv, { button: true, cls: invView.selected.has(inv.u) ? "selected" : "", attrs: `data-uid="${inv.u}"` })).join("")}</div>
           ${list.length > invView.limit ? `<div class="load-more"><button class="btn" id="inv-more" type="button">Show more (${big(list.length - invView.limit)} left)</button></div>` : ""}`
        : `<div class="empty"><h3>No items match these filters</h3></div>`;
      $("#sel-count").textContent = invView.selected.size + " selected";
      const more = $("#inv-more");
      if (more) more.addEventListener("click", () => { invView.limit += 120; draw(); });
    };
    results.addEventListener("click", (e) => {
      const card = e.target.closest("[data-uid]");
      if (!card) return;
      const uid = card.dataset.uid;
      if (invView.select) {
        if (invView.selected.has(uid)) invView.selected.delete(uid);
        else invView.selected.add(uid);
        card.classList.toggle("selected");
        $("#sel-count").textContent = invView.selected.size + " selected";
      } else inspect(uid);
    });
    const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
    on("#wipe", "click", async () => {
      const favs = s.inv.filter((x) => x.fav).length;
      const choices = [{ label: "Wipe everything", value: "all", kind: "danger" }];
      if (favs) choices.unshift({ label: `Keep ${favs} favourite${favs > 1 ? "s" : ""}`, value: "fav", kind: "ghost" });
      const v = await choose("Wipe your inventory?", `All ${big(s.inv.length)} items will be deleted. Your stats stay. This can't be undone.`, choices);
      if (!v) return;
      store.wipeInventory({ keepFavourites: v === "fav" });
      invView.selected.clear();
      toast(v === "fav" ? "Inventory wiped, favourites kept" : "Inventory wiped");
    });
    on("#inv-q", "input", (e) => { invView.q = e.target.value; invView.limit = 120; draw(); });
    on("#inv-kind", "change", (e) => { invView.kind = e.target.value; invView.limit = 120; draw(); });
    on("#inv-tier", "change", (e) => { invView.tier = e.target.value; invView.limit = 120; draw(); });
    on("#inv-sort", "change", (e) => { invView.sort = e.target.value; draw(); });
    on("#sel-mode", "click", () => { invView.select = !invView.select; invView.selected.clear(); renderInventory(); });
    on("#sel-all", "click", () => { shown.forEach((x) => invView.selected.add(x.u)); draw(); });
    on("#sel-none", "click", () => { invView.selected.clear(); draw(); });
    on("#sel-del", "click", async () => {
      const ids = [...invView.selected];
      if (!ids.length) return toast("Select items first");
      const favs = ids.filter((u) => store.state.inv.find((x) => x.u === u)?.fav).length;
      if (await confirmBox(`Delete ${ids.length} item${ids.length > 1 ? "s" : ""}?`, favs ? `${favs} favourite${favs > 1 ? "s are" : " is"} included and will be deleted too.` : "This can't be undone.", "Delete", true)) {
        store.remove(ids);
        invView.selected.clear();
        toast(`Deleted ${ids.length} item${ids.length > 1 ? "s" : ""}`);
      }
    });
    draw();
  }

  // ---------- trade up ----------
  const tu = { tier: 2, st: false, picks: [] };
  function renderTradeUp() {
    const s = store.state;
    const all = s.inv.filter(CS.tradeUpEligible);
    const invByU = new Map(s.inv.map((x) => [x.u, x]));
    tu.picks = tu.picks.filter((u) => {
      const x = invByU.get(u);
      return x && CS.byKey.get(x.k).tier === tu.tier && !!x.st === tu.st;
    });
    const size = CS.tradeUpSize(tu.tier);
    tu.picks = tu.picks.slice(0, size);
    const picks = tu.picks.map((u) => invByU.get(u));
    const pickSet = new Set(tu.picks);
    const pool = all.filter((x) => CS.byKey.get(x.k).tier === tu.tier && !!x.st === tu.st && !pickSet.has(x.u)).sort((a, b) => a.f - b.f);
    const outcomes = CS.tradeUpOutcomes(picks);
    const counts = {};
    all.forEach((x) => { const k = CS.byKey.get(x.k).tier + (x.st ? "st" : ""); counts[k] = (counts[k] || 0) + 1; });
    const avg = picks.length ? picks.reduce((a, x) => a + x.f, 0) / picks.length : null;
    const cost = picks.reduce((a, x) => a + (CS.price(x) || 0), 0);
    const outPrice = (o) => CS.priceOf(o.item, CS.wearOf(o.fl), tu.st && o.item.stattrakable, false);
    const ev = picks.length === size ? outcomes.reduce((a, o) => a + o.p * (outPrice(o) || 0), 0) : null;
    const tierOpts = [0, 1, 2, 3, 4, 5].map((t) => `<option value="${t}">${CS.TIERS[t].name} → ${t === 5 ? "★ Knife / Gloves" : CS.TIERS[t + 1].name} (${counts[t + (tu.st ? "st" : "")] || 0})</option>`).join("");

    view.innerHTML = `
      <div class="view-head">
        <div><div class="eyebrow">Trade-up contract</div><h1>Trade up</h1>
        <p>Swap ${size} items of one grade for one item of the next grade, drawn from the same cases. Five Coverts trade up into a knife or gloves. The result's float follows the average of your inputs, scaled to the new skin's range.</p></div>
      </div>
      <div class="tu">
        <div>
          <section class="panel" aria-label="Contract">
            <div class="toolbar" style="margin:0">
              <label class="sr-only" for="tu-tier">Input grade</label>
              <select class="field" id="tu-tier" style="flex:1 1 240px">${tierOpts}</select>
              <label class="toggle"><input type="checkbox" id="tu-st" ${tu.st ? "checked" : ""}> StatTrak™</label>
            </div>
            <div class="slots" id="slots">
              ${Array.from({ length: size }, (_, i) => picks[i] ? itemCard(CS.byKey.get(picks[i].k), picks[i], { button: true, attrs: `data-rm="${picks[i].u}" title="Remove from contract"` }) : `<div class="slot">${i + 1}</div>`).join("")}
            </div>
            <div class="controls-row">
              <div class="tu-meta"><span><b>${picks.length}/${size}</b> items</span>${avg != null ? `<span>Avg float <b>${avg.toFixed(4)}</b></span>` : ""}${picks.length ? `<span>Inputs worth <b>${money(cost)}</b></span>` : ""}${ev != null ? `<span>Expected return <b class="${ev >= cost ? "good" : "bad"}">${money(ev)}</b></span>` : ""}</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn btn-ghost" id="tu-clear" type="button" ${picks.length ? "" : "disabled"}>Clear</button>
                <button class="btn" id="tu-fill" type="button" ${pool.length && picks.length < size ? "" : "disabled"}>Fill lowest floats</button>
                <button class="btn btn-go" id="tu-sign" type="button" ${picks.length === size ? "" : "disabled"}>Sign contract</button>
              </div>
            </div>
          </section>
          <section class="panel" aria-label="Your eligible items">
            <div class="section-head"><h2>Your ${esc(CS.TIERS[tu.tier].name)}${tu.st ? " StatTrak™" : ""} items</h2><span class="muted">${pool.length} available</span></div>
            ${pool.length ? `<div class="tu-pick"><div class="item-grid">${pool.slice(0, 300).map((x) => itemCard(CS.byKey.get(x.k), x, { button: true, attrs: `data-add="${x.u}"` })).join("")}</div></div>`
              : `<div class="empty"><h3>No eligible items</h3><p>Weapon skins from cases can be traded up. Souvenirs, stickers and items from collections without a higher grade can't.</p><a class="btn" href="#/">Open some cases</a></div>`}
          </section>
        </div>
        <section class="panel" aria-label="Possible outcomes">
          <div class="section-head"><h2>Possible outcomes</h2><span class="muted">${outcomes.length ? outcomes.length + " items" : ""}</span></div>
          ${outcomes.length ? `<ul class="outcomes">${outcomes.map((o) => {
            const w = CS.wearOf(o.fl);
            const p = outPrice(o);
            return `<li style="--c:${CS.tierColor(o.item.tier)}">${imgTag(o.item, 128)}
              <div style="min-width:0"><div class="n">${esc(o.group.length > 1 ? o.item.name + " (any phase)" : o.item.name)}</div><div class="w">${w ? `${w.name} · <span class="mono">${o.fl.toFixed(4)}</span>` : "No float"}${p != null ? ` · <span class="mono">${money(p)}</span>` : ""}</div></div>
              <span class="p">${pct(o.p)}</span></li>`;
          }).join("")}</ul>` : `<div class="empty"><p>Add items to the contract to see what it can produce, at which float and price.</p></div>`}
        </section>
      </div>`;

    $("#tu-tier").value = tu.tier;
    $("#tu-tier").addEventListener("change", (e) => { tu.tier = +e.target.value; tu.picks = []; renderTradeUp(); });
    $("#tu-st").addEventListener("change", (e) => { tu.st = e.target.checked; tu.picks = []; renderTradeUp(); });
    $("#tu-clear").addEventListener("click", () => { tu.picks = []; renderTradeUp(); });
    $("#tu-fill").addEventListener("click", () => {
      tu.picks.push(...pool.slice(0, size - tu.picks.length).map((x) => x.u));
      renderTradeUp();
    });
    $("#slots").addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (!rm) return;
      tu.picks = tu.picks.filter((u) => u !== rm.dataset.rm);
      renderTradeUp();
    });
    const pickGrid = $(".tu-pick");
    if (pickGrid) pickGrid.addEventListener("click", (e) => {
      const add = e.target.closest("[data-add]");
      if (!add) return;
      if (tu.picks.length >= size) return toast("The contract is full");
      tu.picks.push(add.dataset.add);
      renderTradeUp();
    });
    $("#tu-sign").addEventListener("click", async () => {
      const inputs = tu.picks.map((u) => invByU.get(u));
      const favs = inputs.filter((x) => x.fav).length;
      if (favs && !(await confirmBox("Trade up favourites?", `${favs} favourite item${favs > 1 ? "s" : ""} will be used up by this contract.`, "Sign contract"))) return;
      const out = CS.signTradeUp(inputs);
      $(".tu").classList.add("signing");
      CS.sound.click();
      setTimeout(() => {
        tu.picks = [];
        store.tradeUp(inputs, out);
        ui.revealModal(out, "Trade-up result");
      }, reduceMotion ? 50 : 750);
    });
  }

  // ---------- simulator ----------
  const sim = { crateId: null, n: 100000, keep: "gold", running: false, stop: false, result: null, resultCrate: null, ms: 0 };
  const KEEP = [
    ["none", "Nothing, just show the results", null],
    ["gold", "★ Rare specials only", GOLD],
    ["covert", "Covert and up", 5],
    ["classified", "Classified and up", 4],
    ["all", `Everything (up to ${big(store.INV_MAX)} items)`, 0],
  ];
  const PRESETS = [100, 1000, 10000, 100000, 1000000, 10000000];
  const short = (n) => (n >= 1e6 ? n / 1e6 + "M" : n >= 1e3 ? n / 1e3 + "K" : String(n));

  function renderSimulator(id) {
    if (id && CS.crateById.has(id)) sim.crateId = id;
    if (!sim.crateId) sim.crateId = CS.crates.filter((c) => c.cat === "case").sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0].id;
    const crate = CS.crateById.get(sim.crateId);
    const groups = CS.CATEGORIES.map((cat) => `<optgroup label="${esc(cat.label)}">${CS.crates.filter((c) => c.cat === cat.id).sort((a, b) => a.name.localeCompare(b.name)).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")}</optgroup>`).join("");
    const each = CS.openCost(crate);
    view.innerHTML = `
      <div class="view-head">
        <div><div class="eyebrow">Bulk simulator</div><h1>Simulate openings</h1>
        <p>Open up to 10 million containers in seconds and see what you'd really get back. Every drop rolls the same odds, floats and StatTrak™ as a normal unbox and is priced at market value.</p></div>
      </div>
      <section class="panel sim-form">
        <div class="sim-row">
          <label class="fieldset"><span class="eyebrow">Container</span>
            <select class="field" id="sim-crate">${groups}</select></label>
          <label class="fieldset"><span class="eyebrow">How many</span>
            <input class="field mono" id="sim-n" type="number" min="1" max="10000000" step="1" value="${sim.n}"></label>
          <label class="fieldset"><span class="eyebrow">Add to inventory</span>
            <select class="field" id="sim-keep">${KEEP.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}</select></label>
        </div>
        <div class="sim-row">
          <div class="seg" role="group" aria-label="Presets">${PRESETS.map((n) => `<button type="button" data-preset="${n}" aria-pressed="${sim.n === n}">${short(n)}</button>`).join("")}</div>
          <span class="muted sim-cost">Cost per open <b class="mono">${money(each)}</b>${crate.needsKey ? " incl. key" : ""} · total <b class="mono" id="sim-total">${money(each * sim.n)}</b></span>
          <span class="spacer"></span>
          <button class="btn btn-go btn-big" id="sim-run" type="button" ${sim.running ? "disabled" : ""}>Run simulation</button>
        </div>
        <div class="progress" id="sim-progress" ${sim.running ? "" : "hidden"}><span class="track"><i id="sim-bar"></i></span><span id="sim-pct" class="mono">0%</span><button class="btn btn-ghost" id="sim-stop" type="button">Stop</button></div>
      </section>
      <div id="sim-results">${sim.result ? resultsHTML(sim.result, sim.resultCrate) : ""}</div>`;
    $("#sim-crate").value = sim.crateId;
    $("#sim-keep").value = sim.keep;
    $("#sim-crate").addEventListener("change", (e) => { location.hash = "#/simulator/" + encodeURIComponent(e.target.value); });
    $("#sim-keep").addEventListener("change", (e) => { sim.keep = e.target.value; });
    const nInput = $("#sim-n");
    const syncN = () => {
      sim.n = Math.max(1, Math.min(10000000, Math.floor(+nInput.value || 1)));
      $("#sim-total").textContent = money(each * sim.n);
      $$("[data-preset]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.preset === sim.n));
    };
    nInput.addEventListener("input", syncN);
    $$("[data-preset]").forEach((b) => b.addEventListener("click", () => { nInput.value = b.dataset.preset; syncN(); }));
    $("#sim-stop").addEventListener("click", () => { sim.stop = true; });
    $("#sim-run").addEventListener("click", runSim);
    bindResults();
  }

  async function runSim() {
    if (sim.running) return;
    const crate = CS.crateById.get(sim.crateId);
    const keepTier = KEEP.find((k) => k[0] === sim.keep)[2];
    const room = store.INV_MAX - store.state.inv.length;
    sim.running = true;
    sim.stop = false;
    $("#sim-run").disabled = true;
    $("#sim-progress").hidden = false;
    const t0 = performance.now();
    const result = await CS.simulate(crate, sim.n, {
      keepTier,
      keepMax: Math.max(0, room),
      shouldStop: () => sim.stop,
      onProgress: (f) => {
        const bar = $("#sim-bar");
        if (bar) { bar.style.width = (f * 100).toFixed(1) + "%"; $("#sim-pct").textContent = (f * 100).toFixed(0) + "%"; }
      },
    });
    sim.ms = performance.now() - t0;
    sim.running = false;
    sim.result = result;
    sim.resultCrate = crate;
    const overflow = store.recordSimulation(crate, result) + result.keptOverflow;
    if (location.hash.startsWith("#/simulator")) renderSimulator();
    if (overflow) toast(`Inventory is full (${big(store.INV_MAX)} items): ${big(overflow)} drops weren't added`);
    else if (result.kept.length) toast(`Added ${big(result.kept.length)} items to your inventory`);
  }

  function resultsHTML(r, crate) {
    const net = r.value - r.cost;
    const roi = r.cost ? (r.value / r.cost) * 100 : null;
    const golds = r.tiers[GOLD] || 0;
    const expGold = crate.rare.length ? r.opened * 0.0026 : 0;
    const total = Object.values(r.tiers).reduce((a, b) => a + b, 0);
    const top = r.rows.filter((x) => x.p != null).slice(0, 12);
    const bf = r.bestFloat;
    return `
      <div class="section-head" style="margin-top:8px"><h2>${big(r.opened)} × ${esc(crate.name)}</h2><span class="muted">${(sim.ms / 1000).toFixed(1)}s</span></div>
      <div class="tiles">
        <div class="tile"><div class="eyebrow">Spent</div><div class="v">${money(r.cost)}</div><p>${money(CS.openCost(crate))} per open${crate.needsKey ? " incl. key" : ""}</p></div>
        <div class="tile"><div class="eyebrow">Unboxed value</div><div class="v">${money(r.value)}</div><p>${r.unpriced ? `${big(r.unpriced)} drops had no market price` : "At current market prices"}</p></div>
        <div class="tile"><div class="eyebrow">${net >= 0 ? "Profit" : "Loss"}</div><div class="v ${net >= 0 ? "good" : "bad"}">${money(net)}</div><p>${roi != null ? `${roi.toFixed(1)}% returned` : ""}</p></div>
        <div class="tile"><div class="eyebrow">★ Rare specials</div><div class="v" style="color:var(--gold)">${big(golds)}</div><p>${crate.rare.length ? `${expGold < 100 ? expGold.toFixed(1) : big(Math.round(expGold))} expected` : "This container has none"}</p></div>
      </div>
      <div class="two-col">
        <section class="panel">
          <div class="section-head"><h2>Best drops</h2><span class="muted">by price</span></div>
          ${top.length ? `<ul class="history">${top.map((x) => `<li style="--c:${CS.tierColor(x.it.tier)}">${imgTag(x.it, 128)}<span class="nm">${x.it.phase ? `<span class="muted">${esc(x.it.phase)}</span> ` : ""}${esc(CS.fullName({ k: x.it.key, st: x.st, sv: crate.cat === "souvenir" && (x.it.kind === "weapon" || x.it.kind === "knife") ? 1 : 0, f: x.wear ? (x.wear.lo + x.wear.hi) / 2 : null }))}${x.cnt > 1 ? ` <span class="muted">×${big(x.cnt)}</span>` : ""}</span><span class="when mono">${money(x.p)}</span></li>`).join("")}</ul>` : `<div class="empty"><p>No priced drops.</p></div>`}
        </section>
        <section class="panel">
          <div class="section-head"><h2>Drops by grade</h2><span class="muted">yours vs odds</span></div>
          <ul class="dist">${crate.tiers.map((t) => {
            const n = r.tiers[t.tier] || 0;
            return `<li><span style="color:${CS.tierColor(t.tier)}">${esc(CS.tierName(t.tier, t.items[0].kind))}</span><span class="bar"><i style="width:${Math.max((n / total) * 100, n ? 1 : 0)}%;background:${CS.tierColor(t.tier)}"></i></span><span class="mono">${big(n)}</span><span class="mono exp">${pct(n / total)} / ${pct(t.p)}</span></li>`;
          }).join("")}</ul>
          ${bf ? `<div class="section-head" style="margin-top:22px"><h2>Lowest float</h2></div><div class="mono best-float">${CS.floatText(bf.f)}</div><div class="muted">${esc(CS.fullName({ k: bf.it.key, st: bf.st, f: bf.f }))}</div>${wearBar(bf.f, bf.it)}` : ""}
          ${r.kept.length ? `<p class="muted" style="margin-bottom:0">${big(r.kept.length)} drops were added to your <a href="#/inventory">inventory</a>.</p>` : ""}
        </section>
      </div>`;
  }
  function bindResults() { /* results are static; links handle themselves */ }

  // ---------- stats ----------
  const CASE_ODDS = { 2: 0.7992, 3: 0.1598, 4: 0.032, 5: 0.0064, 6: 0.0026 };
  function renderStats() {
    const s = store.state;
    const st = s.stats;
    const opened = Object.values(st.opened).reduce((a, b) => a + b, 0);
    const totalTiers = Object.values(st.tiers).reduce((a, b) => a + b, 0);
    const golds = s.inv.filter((x) => CS.byKey.get(x.k)?.tier === GOLD).sort((a, b) => (CS.price(b) || 0) - (CS.price(a) || 0));
    const best = st.bestFloat && CS.byKey.has(st.bestFloat.k) ? st.bestFloat : null;
    const hist = s.history.filter((h) => CS.byKey.has(h.k));
    const casesOpened = st.opened.case || 0;
    view.innerHTML = `
      <div class="view-head"><div><div class="eyebrow">Your luck so far</div><h1>Stats</h1></div></div>
      <div class="tiles">
        <div class="tile"><div class="eyebrow">Containers opened</div><div class="v">${big(opened)}</div><p>${st.simulated ? `${big(st.simulated)} of them simulated` : CS.CATEGORIES.filter((c) => st.opened[c.id]).map((c) => `${big(st.opened[c.id])} ${c.short.toLowerCase()}`).join(" · ") || "None yet"}</p></div>
        <div class="tile"><div class="eyebrow">Inventory value</div><div class="v good">${money(s.inv.reduce((a, x) => a + (CS.price(x) || 0), 0))}</div><p>${big(s.inv.length)} items at market prices</p></div>
        <div class="tile"><div class="eyebrow">★ Rare specials</div><div class="v" style="color:var(--gold)">${big(st.golds)} <small>/ ${casesOpened * 0.0026 < 100 ? (casesOpened * 0.0026).toFixed(1) : big(Math.round(casesOpened * 0.0026))} expected</small></div><p>${casesOpened ? `About 1 in ${Math.round(1 / 0.0026)} weapon cases` : "Open weapon cases to roll for gold"}</p></div>
        <div class="tile"><div class="eyebrow">Trade-ups signed</div><div class="v">${big(st.tradeups)}</div><p>Prices: ${esc(CS.prices.source || "not loaded")}${CS.prices.updated ? `, ${esc(CS.prices.updated.slice(0, 10))}` : ""}</p></div>
      </div>
      <div class="two-col">
        <section class="panel">
          <div class="section-head"><h2>Drops by grade</h2><span class="muted">${big(totalTiers)} drops · case odds for reference</span></div>
          ${totalTiers ? `<ul class="dist">${[GOLD, 5, 4, 3, 2, 1, 0].filter((t) => st.tiers[t] || CASE_ODDS[t]).map((t) => {
            const n = st.tiers[t] || 0;
            const share = n / totalTiers;
            return `<li><span style="color:${CS.tierColor(t)}">${CS.TIERS[t].name}</span><span class="bar"><i style="width:${Math.max(share * 100, n ? 1 : 0)}%;background:${CS.tierColor(t)}"></i></span><span class="mono">${big(n)}</span><span class="mono exp">${CASE_ODDS[t] ? pct(CASE_ODDS[t]) : "–"}</span></li>`;
          }).join("")}</ul>` : `<div class="empty"><p>Your drop breakdown shows up after your first unbox.</p></div>`}
          ${best ? `<div class="section-head" style="margin-top:24px"><h2>Lowest float</h2></div>
            <div class="best-row">
              ${itemCard(CS.byKey.get(best.k), best)}
              <div style="min-width:0"><div class="mono best-float">${CS.floatText(best.f)}</div><div class="muted">${esc(CS.fullName(best))}</div>${wearBar(best.f, CS.byKey.get(best.k))}</div>
            </div>` : ""}
        </section>
        <section class="panel">
          <div class="section-head"><h2>Recent drops</h2><span class="muted">Last ${hist.length}</span></div>
          ${hist.length ? `<ul class="history">${hist.map((h) => {
            const it = CS.byKey.get(h.k);
            const p = CS.price(h);
            return `<li style="--c:${CS.tierColor(it.tier)}">${imgTag(it, 128)}<span class="nm">${esc(CS.fullName(h))}</span><span class="when">${p != null ? `<span class="mono">${money(p)}</span> · ` : ""}${ago(h.t)}</span></li>`;
          }).join("")}</ul>` : `<div class="empty"><p>No drops yet.</p></div>`}
        </section>
      </div>
      ${golds.length ? `<section class="panel" style="margin-top:20px"><div class="section-head"><h2 style="color:var(--gold)">★ Gold shelf</h2><span class="muted">${big(golds.length)} in inventory</span></div>
        <div class="item-grid">${golds.slice(0, 120).map((x) => itemCard(CS.byKey.get(x.k), x, { button: true, attrs: `data-uid="${x.u}"` })).join("")}</div></section>` : ""}
      <section class="panel" style="margin-top:20px">
        <div class="section-head"><h2>Your data</h2><span class="muted">Stored only in this browser</span></div>
        <p class="muted" style="margin-top:0">Download a backup to move your inventory to another browser or keep it safe if you clear site data.</p>
        <div class="data-actions">
          <button class="btn" id="exp" type="button">Download backup</button>
          <label class="btn" for="imp">Restore backup</label><input type="file" id="imp" accept="application/json,.json" class="sr-only">
          <button class="btn btn-danger" id="reset" type="button">Reset inventory and stats</button>
        </div>
      </section>`;

    view.querySelectorAll("[data-uid]").forEach((b) => b.addEventListener("click", () => inspect(b.dataset.uid)));
    $("#exp").addEventListener("click", () => {
      const blob = new Blob([store.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `keyless-inventory-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $("#imp").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!(await confirmBox("Restore this backup?", "It replaces your current inventory and stats.", "Restore"))) return;
      try {
        const r = store.importJSON(await file.text());
        toast(`Restored ${r.kept} items${r.dropped ? `, skipped ${r.dropped} unknown` : ""}`);
      } catch (err) {
        toast(err.message || "That file couldn't be read");
      }
    });
    $("#reset").addEventListener("click", async () => {
      if (await confirmBox("Reset everything?", "Your inventory, history and stats will be wiped. Download a backup first if you want to keep them.", "Reset", true)) {
        store.reset();
        toast("Inventory and stats reset");
      }
    });
  }

  CS.views = { renderCases, renderInventory, renderTradeUp, renderSimulator, renderStats, isSimRunning: () => sim.running };
})();
