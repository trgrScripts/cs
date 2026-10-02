/* Views, routing and the unboxing animation. */
(function () {
  const CS = window.CS;
  const store = CS.store;
  const view = document.getElementById("view");
  const GOLD = CS.GOLD;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pct = (p) => {
    const v = p * 100;
    return (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toPrecision(2)) + "%";
  };
  const money = (n) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const year = (d) => (d ? d.slice(0, 4) : "");
  const ago = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };

  // Steam images: try the resized thumbnail first, then the original, then hide.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.full && img.src !== img.dataset.full) img.src = img.dataset.full;
    else img.classList.add("broken");
  }, true);

  function imgTag(it, size, cls) {
    if (!it || !it.img) return "";
    return `<img ${cls ? `class="${cls}"` : ""} loading="lazy" decoding="async" src="${esc(CS.thumb(it, size))}" data-full="${esc(it.img)}" alt="">`;
  }

  function toast(msg) {
    $$(".toast").forEach((t) => t.remove());
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---------- item card ----------
  // it: catalogue item; inv: owned copy (optional). opts: {button, mask, pct, attrs, cls}
  function itemCard(it, inv, o = {}) {
    const tag = o.button ? "button" : "div";
    const masked = o.mask && it.tier === GOLD;
    const color = CS.tierColor(it.tier);
    let tags = "";
    if (inv && inv.st) tags += `<span class="chip chip-st">StatTrak™</span>`;
    if (inv && inv.sv) tags += `<span class="chip chip-souv">Souvenir</span>`;
    const art = masked ? `<div class="gold-glyph" aria-hidden="true">★</div>` : imgTag(it, 256);
    const base = masked ? "★ Rare Special Item" : esc(it.base) + (it.phase ? ` · ${esc(it.phase)}` : "");
    const fin = masked ? "Exceedingly Rare" : esc(it.finish);
    let sub = "";
    if (inv && inv.f != null) {
      const w = CS.wearOf(inv.f);
      sub = `<div class="sub"><span>${w.name}</span><span class="mono">${inv.f.toFixed(4)}</span></div>`;
    } else if (o.pct != null) {
      sub = `<div class="sub"><span>${esc(CS.tierName(it.tier, it.kind))}</span><span class="pct">${pct(o.pct)}</span></div>`;
    } else if (o.sub) {
      sub = `<div class="sub">${o.sub}</div>`;
    }
    const label = inv ? CS.fullName(inv) : it.name;
    return `<${tag} class="item-card ${masked ? "is-gold" : ""} ${o.cls || ""}" style="--c:${color};${o.style || ""}" ${o.button ? `type="button" aria-label="${esc(label)}"` : ""} ${o.attrs || ""}>
      <div class="art">${tags ? `<div class="tags">${tags}</div>` : ""}${inv && inv.fav ? `<span class="fav" aria-label="Favourite">★</span>` : ""}${art}</div>
      <div class="base">${base}</div>
      <div class="fin">${fin}</div>
      ${sub}
    </${tag}>`;
  }

  function wearBar(f, it, big) {
    if (f == null) return "";
    const range = it && it.painted ? `<span class="range" style="left:${it.min * 100}%;width:${(it.max - it.min) * 100}%"></span>` : "";
    return `<div class="wearbar">${"<i></i>".repeat(5)}${big ? range : ""}<b style="left:${f * 100}%"></b></div>`;
  }

  // ---------- overlays ----------
  let overlayStack = [];
  function openOverlay(html, cls) {
    const ov = document.createElement("div");
    ov.className = "overlay " + (cls || "");
    ov.innerHTML = html;
    document.body.appendChild(ov);
    overlayStack.push(ov);
    ov.addEventListener("mousedown", (e) => {
      if (e.target === ov) closeOverlay(ov);
    });
    const focusable = ov.querySelector("[data-autofocus]") || ov.querySelector("button, a");
    if (focusable) focusable.focus({ preventScroll: true });
    return ov;
  }
  function closeOverlay(ov) {
    ov = ov || overlayStack[overlayStack.length - 1];
    if (!ov) return;
    overlayStack = overlayStack.filter((x) => x !== ov);
    ov.remove();
    if (ov._onClose) ov._onClose();
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayStack.length) closeOverlay();
  });

  function confirmBox(title, text, okLabel, danger) {
    return new Promise((resolve) => {
      const ov = openOverlay(`<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" style="width:min(440px,100%)">
        <div class="confirm"><h2 id="cf-t">${esc(title)}</h2><p>${esc(text)}</p></div>
        <div class="modal-actions"><button class="btn btn-ghost" data-v="0" data-autofocus>Cancel</button><button class="btn ${danger ? "btn-danger" : "btn-go"}" data-v="1">${esc(okLabel)}</button></div>
      </div>`);
      let done = false;
      ov._onClose = () => { if (!done) resolve(false); };
      $$("[data-v]", ov).forEach((b) => b.addEventListener("click", () => {
        done = true;
        closeOverlay(ov);
        resolve(b.dataset.v === "1");
      }));
    });
  }

  // Detail view for one owned item: used for reveals and inventory inspection.
  function detailHTML(inv, heading) {
    const it = CS.byKey.get(inv.k);
    const color = CS.tierColor(it.tier);
    const w = CS.wearOf(inv.f);
    const crate = CS.crateById.get(inv.c);
    const facts = [];
    if (w) facts.push(["Exterior", w.name]);
    if (inv.f != null) facts.push(["Float", `<span class="mono">${CS.floatText(inv.f)}</span>`, "wide"]);
    if (inv.s != null) facts.push(["Pattern", `<span class="mono">${inv.s}</span>`]);
    if (it.phase) facts.push(["Phase", esc(it.phase)]);
    if (it.painted) facts.push(["Float cap", `<span class="mono">${it.min.toFixed(2)} – ${it.max.toFixed(2)}</span>`]);
    if (inv.st) facts.push(["StatTrak™", "0 confirmed kills"]);
    if (crate) facts.push([inv.o === "tradeup" ? "Trade-up from" : "Unboxed from", esc(crate.name)]);
    facts.push(["Received", new Date(inv.t).toLocaleString()]);
    const rarityLabel = it.tier === GOLD
      ? `★ ${esc(it.rarity)} ${it.kind === "gloves" ? "Gloves" : "Knife"}`
      : esc(CS.tierName(it.tier, it.kind)) + (it.kind === "weapon" ? " " + esc(it.base) : "");
    return `
      <div class="reveal-art" style="--c:${color}">${it.tier >= 5 ? `<div class="rays" aria-hidden="true"></div>` : ""}${imgTag(it, 512)}</div>
      <div class="reveal-body">
        ${heading ? `<div class="eyebrow">${esc(heading)}</div>` : ""}
        <div class="rarity" style="color:${color}">${rarityLabel}</div>
        <h2>${esc(CS.fullName(inv))}</h2>
        ${inv.f != null ? `<div class="floatbar">${wearBar(inv.f, it, true)}<div class="ticks"><span>0.00</span><span>0.07</span><span>0.15</span><span>0.38</span><span>0.45</span><span>1.00</span></div></div>` : ""}
        <dl class="facts">${facts.map(([k, v, cls]) => `<div${cls ? ` class="${cls}"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
      </div>`;
  }

  function inspect(uid) {
    const inv = store.state.inv.find((x) => x.u === uid);
    if (!inv) return;
    const eligible = CS.tradeUpEligible(inv);
    const ov = openOverlay(`<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(CS.fullName(inv))}">
      ${detailHTML(inv)}
      <div class="modal-actions">
        <button class="btn btn-danger" data-act="del">Delete</button>
        <span class="spacer"></span>
        <button class="btn btn-ghost" data-act="fav">${inv.fav ? "Unfavourite" : "Favourite"}</button>
        ${eligible ? `<button class="btn" data-act="tu">Use in trade-up</button>` : ""}
        <button class="btn btn-go" data-act="close" data-autofocus>Done</button>
      </div></div>`);
    ov.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      if (act === "close") closeOverlay(ov);
      if (act === "fav") { store.toggleFav(uid); closeOverlay(ov); }
      if (act === "tu") {
        const it = CS.byKey.get(inv.k);
        tu.tier = it.tier;
        tu.st = !!inv.st;
        tu.picks = [uid];
        closeOverlay(ov);
        location.hash = "#/tradeup";
      }
      if (act === "del") {
        if (await confirmBox("Delete this item?", CS.fullName(inv) + " will be removed from your inventory.", "Delete", true)) {
          store.remove([uid]);
          closeOverlay(ov);
          toast("Item deleted");
        }
      }
    });
  }

  function showReveal(drops, crate, opts = {}) {
    const best = drops.reduce((a, d) => (CS.byKey.get(d.k).tier > CS.byKey.get(a.k).tier ? d : a), drops[0]);
    const bestTier = CS.byKey.get(best.k).tier;
    CS.sound.reveal(bestTier);
    const again = crate ? `<button class="btn btn-go" data-act="again" data-autofocus>${crate.needsKey ? "Unlock another" : "Open another"}</button>` : "";
    let html;
    if (drops.length === 1) {
      html = `<div class="modal" role="dialog" aria-modal="true" aria-label="You received ${esc(CS.fullName(best))}">
        ${detailHTML(best, opts.heading || "You received")}
        <div class="modal-actions"><a class="btn btn-ghost" href="#/inventory" data-act="inv">Inventory</a><span class="spacer"></span><button class="btn" data-act="close" ${again ? "" : "data-autofocus"}>Close</button>${again}</div>
      </div>`;
    } else {
      html = `<div class="modal wide" role="dialog" aria-modal="true" aria-label="You received ${drops.length} items">
        <div class="multi-head"><h2>${drops.length} items received</h2><span class="muted">Best: <span style="color:${CS.tierColor(bestTier)}">${esc(CS.fullName(best))}</span></span></div>
        <div class="multi-grid">${drops.map((d, i) => itemCard(CS.byKey.get(d.k), d, { button: true, attrs: `data-uid="${d.u}"`, style: `animation-delay:${i * 60}ms` })).join("")}</div>
        <div class="modal-actions"><a class="btn btn-ghost" href="#/inventory" data-act="inv">Inventory</a><span class="spacer"></span><button class="btn" data-act="close" ${again ? "" : "data-autofocus"}>Close</button>${again}</div>
      </div>`;
    }
    const ov = openOverlay(html, bestTier === GOLD ? "is-gold-reveal" : "");
    ov.addEventListener("click", (e) => {
      const card = e.target.closest("[data-uid]");
      if (card) return inspect(card.dataset.uid);
      const b = e.target.closest("[data-act]");
      if (!b) return;
      if (b.dataset.act === "inv") return closeOverlay(ov);
      closeOverlay(ov);
      if (b.dataset.act === "again") openCurrent(crate);
    });
  }

  // ---------- top bar ----------
  const soundIcon = (on) => on
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`;
  const soundBtn = $("#sound-btn");
  soundBtn.addEventListener("click", () => store.setSetting("sound", !store.state.settings.sound));
  function renderTop() {
    const s = store.state;
    $("#inv-count").textContent = s.inv.length.toLocaleString();
    $("#wallet b").textContent = money(s.stats.keys * CS.KEY_PRICE);
    soundBtn.innerHTML = soundIcon(s.settings.sound);
    soundBtn.setAttribute("aria-label", s.settings.sound ? "Mute sounds" : "Turn sounds on");
    soundBtn.title = s.settings.sound ? "Sound on" : "Sound off";
  }
  store.on(renderTop);

  // ---------- containers browser ----------
  const browse = { cat: "case", q: "", sort: "new", limit: 60 };
  try {
    const saved = JSON.parse(sessionStorage.getItem("keyless.browse") || "null");
    if (saved) Object.assign(browse, saved, { limit: 60 });
  } catch (e) { /* storage blocked */ }

  function filteredCrates() {
    const q = browse.q.trim().toLowerCase();
    let list = CS.crates.filter((c) => (q ? true : c.cat === browse.cat) && (!q || c.name.toLowerCase().includes(q)));
    if (q) list.sort((a, b) => (a.cat === browse.cat ? 0 : 1) - (b.cat === browse.cat ? 0 : 1));
    const by = {
      new: (a, b) => (b.date || "").localeCompare(a.date || ""),
      old: (a, b) => (a.date || "9").localeCompare(b.date || "9"),
      name: (a, b) => a.name.localeCompare(b.name),
    }[browse.sort];
    return list.sort(by);
  }

  function crateCard(c) {
    const top = c.rare.length ? GOLD : Math.max(...c.contains.map((i) => i.tier));
    const goldKind = c.rare.length ? (c.rare.some((r) => r.kind === "gloves") ? (c.rare.some((r) => r.kind === "knife") ? "Knives & Gloves" : "Gloves") : "Knives") : "";
    return `<a class="crate-card" href="#/case/${encodeURIComponent(c.id)}">
      <div class="art">${c.img ? `<img loading="lazy" decoding="async" src="${esc(c.img)}" data-full="${esc(c.img)}" alt="">` : ""}</div>
      <div class="name">${esc(c.name)}</div>
      <div class="meta"><span>${year(c.date)} · ${c.contains.length} items</span>${goldKind ? `<span class="chip chip-gold">★ ${goldKind}</span>` : ""}</div>
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
        <p>Every case, capsule and souvenir package with its real contents. Drops roll with the published case odds, then get a float, pattern and a 10% StatTrak™ chance.</p></div>
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

  // ---------- case page ----------
  let current = null; // crate shown on the case page
  let busy = false;
  let skipSpin = null;

  function renderCase(id) {
    const c = CS.crateById.get(id);
    if (!c) {
      view.innerHTML = `<div class="empty"><h3>That container doesn't exist</h3><a class="btn" href="#/">Back to containers</a></div>`;
      return;
    }
    current = c;
    const s = store.state.settings;
    const cat = CS.catById[c.cat];
    const sorted = [...c.contains].sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
    const tierP = new Map(c.tiers.map((t) => [t.tier, t.p / t.items.length]));
    const goldP = c.tiers.find((t) => t.tier === GOLD);
    const goldCount = c.rareGroups.length;
    const stattrak = c.cat === "case" && c.contains.some((i) => i.stattrakable);
    view.innerHTML = `
      <a class="back" href="#/">‹ All ${esc(cat.label.toLowerCase())}</a>
      <section class="stage" aria-label="Open ${esc(c.name)}">
        <div class="stage-art" id="stage-art">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : ""}</div>
        <div class="stage-side">
          <div class="title">
            <div class="eyebrow">${esc(cat.label.replace(/s$/, ""))}${c.date ? " · " + year(c.date) : ""}</div>
            <h1>${esc(c.name)}</h1>
            <p>${c.contains.length} items${goldCount ? ` + ${goldCount} rare special finishes` : ""}${stattrak ? " · 10% StatTrak™" : ""}${c.cat === "souvenir" ? " · drops are Souvenir" : ""}</p>
          </div>
          <ul class="odds" aria-label="Drop odds">
            ${c.tiers.map((t) => `<li><i style="background:${CS.tierColor(t.tier)}"></i><span>${esc(CS.tierName(t.tier, t.items[0].kind))}</span><span class="mono">${pct(t.p)}</span></li>`).join("")}
          </ul>
          <div class="controls">
            <div class="controls-row">
              <div class="seg" role="group" aria-label="How many to open">
                ${[1, 2, 3, 5, 10].map((n) => `<button type="button" data-n="${n}" aria-pressed="${s.count === n}">×${n}</button>`).join("")}
              </div>
              <label class="toggle"><input type="checkbox" id="quick" ${s.quick ? "checked" : ""}> Quick open</label>
            </div>
            <button class="btn btn-go btn-big" id="open-btn" type="button"></button>
            <div class="cost" id="cost"></div>
          </div>
        </div>
      </section>

      <div class="section-head"><h2>Contains</h2><span class="muted">Chance per item shown on each card</span></div>
      <div class="item-grid">
        ${goldCount ? itemCard(c.rare[0], null, { mask: true, button: true, pct: goldP.p, attrs: `id="gold-card" aria-expanded="false" aria-controls="rare-list"` }) : ""}
        ${sorted.map((it) => itemCard(it, null, { pct: tierP.get(it.tier) })).join("")}
      </div>
      ${goldCount ? `<div id="rare-list" class="rare-list" hidden>
        <div class="section-head" style="margin-top:22px"><h2 style="color:var(--gold)">★ Rare special items</h2><span class="muted">${goldCount} finishes, ${pct(goldP.p / goldCount)} each</span></div>
        <div class="item-grid">${c.rare.map((it) => itemCard(it, null, { sub: `<span>${it.phase ? esc(it.phase) : esc(CS.tierName(GOLD))}</span>` })).join("")}</div>
      </div>` : ""}`;

    const openBtn = $("#open-btn");
    const cost = $("#cost");
    const syncButton = () => {
      const n = store.state.settings.count;
      openBtn.innerHTML = `${c.needsKey ? "Unlock container" : c.cat === "souvenir" ? "Open package" : "Open capsule"}${n > 1 ? ` ×${n}` : ""}`;
      cost.innerHTML = c.needsKey
        ? `Uses ${n} key${n > 1 ? "s" : ""} · <s>${money(n * CS.KEY_PRICE)}</s> free here`
        : "No key needed";
      openBtn.disabled = busy;
    };
    syncButton();
    $$(".seg [data-n]").forEach((b) => b.addEventListener("click", () => {
      store.setSetting("count", +b.dataset.n);
      $$(".seg [data-n]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      syncButton();
    }));
    $("#quick").addEventListener("change", (e) => store.setSetting("quick", e.target.checked));
    openBtn.addEventListener("click", () => openCurrent(c));
    const gc = $("#gold-card");
    if (gc) gc.addEventListener("click", () => {
      const list = $("#rare-list");
      list.hidden = !list.hidden;
      gc.setAttribute("aria-expanded", String(!list.hidden));
      if (!list.hidden) list.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  }

  async function openCurrent(crate) {
    if (busy) return;
    if (location.hash !== "#/case/" + encodeURIComponent(crate.id)) {
      location.hash = "#/case/" + encodeURIComponent(crate.id);
      await new Promise((r) => setTimeout(r, 30));
    }
    busy = true;
    const btn = $("#open-btn");
    if (btn) btn.disabled = true;
    const n = store.state.settings.count;
    const drops = Array.from({ length: n }, () => CS.openCrate(crate));
    // Items are granted up front, like the real game, so a reload mid-spin loses nothing.
    store.recordDrops(drops, crate);
    const host = $("#stage-art");
    if (!store.state.settings.quick && host) await spin(host, crate, drops);
    busy = false;
    if (current === crate && $("#stage-art")) renderStageArt(crate);
    const b2 = $("#open-btn");
    if (b2) b2.disabled = false;
    showReveal(drops, crate);
  }

  function renderStageArt(c) {
    const host = $("#stage-art");
    if (host) host.innerHTML = c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : "";
  }

  // CS-style reel: a long strip of weighted random fillers with the real drop at WIN,
  // decelerating to a random point inside the winning card.
  const STRIP = 62;
  const WIN = 54;
  function spin(host, crate, drops) {
    return new Promise((resolve) => {
      const compact = drops.length > 5 ? "compact tiny" : drops.length > 2 ? "compact" : "";
      const strips = drops.map((d) => {
        const cells = [];
        for (let i = 0; i < STRIP; i++) cells.push(i === WIN ? CS.byKey.get(d.k) : CS.rollItem(crate));
        return cells;
      });
      host.innerHTML = `<div class="reels ${compact}">${strips.map((cells) =>
        `<div class="reel"><div class="reel-track">${cells.map((it, i) => itemCard(it, null, { mask: true, attrs: i === WIN ? 'data-win="1"' : "" })).join("")}</div></div>`
      ).join("")}</div><button class="btn btn-ghost skip" type="button">Skip</button>`;

      const reels = $$(".reel", host);
      const plan = reels.map((reel, i) => {
        const track = $(".reel-track", reel);
        const first = track.children[0].getBoundingClientRect();
        const second = track.children[1].getBoundingClientRect();
        const step = second.left - first.left;
        const width = reel.clientWidth;
        const land = WIN * step + first.width * (0.08 + CS.random() * 0.84);
        return {
          track,
          step,
          width,
          target: land - width / 2,
          dur: (reduceMotion ? 900 : 5600) + i * (reduceMotion ? 0 : 320),
          lastIdx: -1,
        };
      });
      let start = null;
      let skipped = false;
      skipSpin = () => { skipped = true; };
      $(".skip", host).addEventListener("click", () => skipSpin && skipSpin());

      function frame(now) {
        if (start == null) start = now;
        let done = 0;
        plan.forEach((p, i) => {
          const t = skipped ? 1 : Math.min(1, (now - start) / p.dur);
          const e = 1 - Math.pow(1 - t, 4.4);
          const x = e * p.target;
          p.track.style.transform = `translate3d(${-x}px,0,0)`;
          const idx = Math.floor((x + p.width / 2) / p.step);
          if (i === 0 && idx !== p.lastIdx && !skipped) CS.sound.tick();
          p.lastIdx = idx;
          if (t >= 1) done++;
        });
        if (done < plan.length) return requestAnimationFrame(frame);
        skipSpin = null;
        $$("[data-win]", host).forEach((c) => c.classList.add("win"));
        const sk = $(".skip", host);
        if (sk) sk.remove();
        setTimeout(resolve, skipped ? 150 : 650);
      }
      requestAnimationFrame(frame);
    });
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
    let list = store.state.inv.filter((inv) => {
      const it = CS.byKey.get(inv.k);
      if (!it) return false;
      if (invView.kind === "st" ? !inv.st : invView.kind === "sv" ? !inv.sv : invView.kind === "fav" ? !inv.fav : invView.kind !== "all" && it.kind !== invView.kind) return false;
      if (invView.tier !== "all" && it.tier !== +invView.tier) return false;
      if (q && !CS.fullName(inv).toLowerCase().includes(q)) return false;
      return true;
    });
    const tier = (x) => CS.byKey.get(x.k).tier;
    const fl = (x) => (x.f == null ? 2 : x.f);
    const sorts = {
      new: (a, b) => b.t - a.t,
      old: (a, b) => a.t - b.t,
      rarity: (a, b) => tier(b) - tier(a) || b.st - a.st || fl(a) - fl(b),
      floatlo: (a, b) => fl(a) - fl(b),
      floathi: (a, b) => (b.f == null ? -1 : b.f) - (a.f == null ? -1 : a.f),
      name: (a, b) => CS.byKey.get(a.k).name.localeCompare(CS.byKey.get(b.k).name),
    };
    return list.sort(sorts[invView.sort]);
  }

  function renderInventory() {
    const s = store.state;
    const golds = s.inv.filter((x) => CS.byKey.get(x.k)?.tier === GOLD).length;
    const sts = s.inv.filter((x) => x.st).length;
    view.innerHTML = `
      <div class="view-head">
        <div><div class="eyebrow">Saved in this browser</div><h1>Inventory</h1></div>
        <div class="inv-summary"><span><b>${s.inv.length.toLocaleString()}</b> items</span><span><b style="color:var(--gold)">${golds}</b> ★ rare specials</span><span><b style="color:#f09a62">${sts}</b> StatTrak™</span></div>
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
          <option value="new">Newest</option><option value="old">Oldest</option><option value="rarity">Rarity</option>
          <option value="floatlo">Lowest float</option><option value="floathi">Highest float</option><option value="name">Name</option>
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
      <div class="empty"><h3>Nothing here yet</h3><p>Open a case or capsule and your drops land here, with their float and pattern.</p><a class="btn btn-go" href="#/">Browse containers</a></div>`}`;
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
           ${list.length > invView.limit ? `<div class="load-more"><button class="btn" id="inv-more" type="button">Show more (${list.length - invView.limit} left)</button></div>` : ""}`
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
              <div class="tu-meta"><span><b>${picks.length}/${size}</b> items</span>${avg != null ? `<span>Avg float <b>${avg.toFixed(4)}</b></span>` : ""}</div>
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
            return `<li style="--c:${CS.tierColor(o.item.tier)}">${imgTag(o.item, 128)}
              <div style="min-width:0"><div class="n">${esc(o.group.length > 1 ? o.item.name + " (any phase)" : o.item.name)}</div><div class="w">${w ? `${w.name} · <span class="mono">${o.fl.toFixed(4)}</span>` : "No float"}</div></div>
              <span class="p">${pct(o.p)}</span></li>`;
          }).join("")}</ul>` : `<div class="empty"><p>Add items to the contract to see what it can produce and at which float.</p></div>`}
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
        store.tradeUp(inputs, out);
        tu.picks = [];
        renderTradeUp();
        showReveal([out], null, { heading: "Trade-up result" });
      }, reduceMotion ? 50 : 750);
    });
  }
  // ---------- stats ----------
  const CASE_ODDS = { 2: 0.7992, 3: 0.1598, 4: 0.032, 5: 0.0064, 6: 0.0026 };
  function renderStats() {
    const s = store.state;
    const st = s.stats;
    const opened = Object.values(st.opened).reduce((a, b) => a + b, 0);
    const totalTiers = Object.values(st.tiers).reduce((a, b) => a + b, 0);
    const golds = s.inv.filter((x) => CS.byKey.get(x.k)?.tier === GOLD).sort((a, b) => b.t - a.t);
    const best = st.bestFloat && CS.byKey.has(st.bestFloat.k) ? st.bestFloat : null;
    const hist = s.history.filter((h) => CS.byKey.has(h.k));
    const casesOpened = st.opened.case || 0;
    const expectedGolds = casesOpened * 0.0026;
    view.innerHTML = `
      <div class="view-head"><div><div class="eyebrow">Your luck so far</div><h1>Stats</h1></div></div>
      <div class="tiles">
        <div class="tile"><div class="eyebrow">Containers opened</div><div class="v">${opened.toLocaleString()}</div><p>${CS.CATEGORIES.filter((c) => st.opened[c.id]).map((c) => `${st.opened[c.id].toLocaleString()} ${c.short.toLowerCase()}`).join(" · ") || "None yet"}</p></div>
        <div class="tile"><div class="eyebrow">Kept in your wallet</div><div class="v" style="color:var(--go-hi)">${money(st.keys * CS.KEY_PRICE)}</div><p>${st.keys.toLocaleString()} keys at ${money(CS.KEY_PRICE)}, before case prices</p></div>
        <div class="tile"><div class="eyebrow">★ Rare specials</div><div class="v" style="color:var(--gold)">${st.golds} <small>/ ${expectedGolds.toFixed(2)} expected</small></div><p>${casesOpened ? `About 1 in ${Math.round(1 / 0.0026)} weapon cases` : "Open weapon cases to roll for gold"}</p></div>
        <div class="tile"><div class="eyebrow">Trade-ups signed</div><div class="v">${st.tradeups}</div><p>${s.inv.length.toLocaleString()} items in inventory</p></div>
      </div>
      <div class="two-col">
        <section class="panel">
          <div class="section-head"><h2>Drops by grade</h2><span class="muted">${totalTiers.toLocaleString()} drops · case odds for reference</span></div>
          ${totalTiers ? `<ul class="dist">${[GOLD, 5, 4, 3, 2, 1, 0].filter((t) => st.tiers[t] || CASE_ODDS[t]).map((t) => {
            const n = st.tiers[t] || 0;
            const share = n / totalTiers;
            return `<li><span style="color:${CS.tierColor(t)}">${CS.TIERS[t].name}</span><span class="bar"><i style="width:${Math.max(share * 100, n ? 1 : 0)}%;background:${CS.tierColor(t)}"></i></span><span class="mono">${n.toLocaleString()}</span><span class="mono exp">${CASE_ODDS[t] ? pct(CASE_ODDS[t]) : "–"}</span></li>`;
          }).join("")}</ul>` : `<div class="empty"><p>Your drop breakdown shows up after your first unbox.</p></div>`}
          ${best ? `<div class="section-head" style="margin-top:24px"><h2>Lowest float</h2></div>
            <div style="display:grid;grid-template-columns:minmax(0,180px) minmax(0,1fr);gap:16px;align-items:center">
              ${itemCard(CS.byKey.get(best.k), best)}
              <div style="min-width:0"><div class="mono best-float" style="font-size:18px">${CS.floatText(best.f)}</div><div class="muted" style="margin-top:4px">${esc(CS.fullName(best))}</div>${wearBar(best.f, CS.byKey.get(best.k))}</div>
            </div>` : ""}
        </section>
        <section class="panel">
          <div class="section-head"><h2>Recent drops</h2><span class="muted">Last ${hist.length}</span></div>
          ${hist.length ? `<ul class="history">${hist.map((h) => {
            const it = CS.byKey.get(h.k);
            return `<li style="--c:${CS.tierColor(it.tier)}">${imgTag(it, 128)}<span class="nm">${esc(CS.fullName(h))}</span><span class="when">${ago(h.t)}</span></li>`;
          }).join("")}</ul>` : `<div class="empty"><p>No drops yet.</p></div>`}
        </section>
      </div>
      ${golds.length ? `<section class="panel" style="margin-top:20px"><div class="section-head"><h2 style="color:var(--gold)">★ Gold shelf</h2><span class="muted">${golds.length} in inventory</span></div>
        <div class="item-grid">${golds.map((x) => itemCard(CS.byKey.get(x.k), x, { button: true, attrs: `data-uid="${x.u}"` })).join("")}</div></section>` : ""}
      <section class="panel" style="margin-top:20px">
        <div class="section-head"><h2>Your data</h2><span class="muted">Stored only in this browser</span></div>
        <p class="muted" style="margin-top:0">Download a backup to move your inventory to another browser or keep it safe if you clear site data.</p>
        <div class="data-actions">
          <button class="btn" id="exp" type="button">Download backup</button>
          <label class="btn" for="imp">Restore backup</label><input type="file" id="imp" accept="application/json,.json" class="sr-only">
          <button class="btn btn-danger" id="reset" type="button">Reset everything</button>
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

  // ---------- router ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    if (h.startsWith("case/")) return { name: "case", id: decodeURIComponent(h.slice(5)) };
    if (h === "inventory" || h === "tradeup" || h === "stats") return { name: h };
    return { name: "cases" };
  }
  function render() {
    const r = route();
    if (skipSpin && r.name !== "case") skipSpin();
    $$(".nav a").forEach((a) => {
      const active = a.dataset.route === r.name || (r.name === "case" && a.dataset.route === "cases");
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (r.name !== "case") current = null;
    if (r.name === "cases") renderCases();
    else if (r.name === "case") renderCase(r.id);
    else if (r.name === "inventory") renderInventory();
    else if (r.name === "tradeup") renderTradeUp();
    else if (r.name === "stats") renderStats();
  }
  let lastRoute = null;
  window.addEventListener("hashchange", () => {
    render();
    const key = location.hash;
    if (key !== lastRoute) window.scrollTo(0, 0);
    lastRoute = key;
  });
  // Re-render data-driven views when the inventory changes (not the case page: it owns its stage).
  store.on(() => {
    const r = route().name;
    if (r === "inventory" || r === "stats" || r === "tradeup") render();
  });

  renderTop();
  render();
  lastRoute = location.hash;
  if (store.saveError) toast("Your browser is blocking storage, so drops won't be saved after you close this tab.");
})();
