/* The CS2 "Unlock Container" screen: contents, the spinning reel and the reveal. */
(function () {
  const CS = window.CS;
  const store = CS.store;
  const GOLD = CS.GOLD;
  const { esc, $, $$, pct, money, priceTag, year, imgTag, goldEmblem, toast, itemCard, floatBlock, factsHTML, rarityLabel, reduceMotion, hasOverlay } = CS.ui;

  const keyIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="7.5" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 12h10M18.5 12v3.5M21.5 12v2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

  let scene = null; // { crate, el, phase, drops, skip }

  function tile(it, o = {}) {
    const gold = it.tier === GOLD && o.mask !== false;
    const color = gold ? CS.tierColor(GOLD) : CS.tierColor(it.tier);
    return `<div class="ctile ${gold ? "ctile-gold" : ""} ${o.cls || ""}" style="--c:${color}" ${o.attrs || ""}>
      ${gold ? goldEmblem() : imgTag(it, 256, "", o.eager !== false)}
    </div>`;
  }

  function tooltipFor(it, p, crate) {
    const souv = crate.cat === "souvenir" && (it.kind === "weapon" || it.kind === "knife");
    const r = CS.priceRange(it, souv);
    const priceTxt = r ? (r[0] === r[1] ? money(r[0]) : `${money(r[0])} – ${money(r[1])}`) : "no price";
    return `${it.name}\n${CS.tierName(it.tier, it.kind)} · ${pct(p)} · ${priceTxt}`;
  }

  function render(crate) {
    document.body.classList.add("scene-open");
    const s = store.state.settings;
    const cat = CS.catById[crate.cat];
    const sorted = [...crate.contains].sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name));
    const perItem = new Map(crate.tiers.map((t) => [t.tier, t.p / t.items.length]));
    const goldTier = crate.tiers.find((t) => t.tier === GOLD);
    const casePrice = CS.cratePrice(crate);
    const verb = crate.needsKey ? "Unlock Container" : crate.cat === "souvenir" ? "Open Package" : "Open Capsule";
    const keyName = crate.name.replace(/ (Weapon )?Case$/, "") + " Case Key";

    // A fresh host each time drops listeners from the previous container.
    const old = document.getElementById("scene");
    const host = old.cloneNode(false);
    old.replaceWith(host);
    host.innerHTML = `
      <section class="scene" data-phase="idle" aria-label="${esc(verb)}: ${esc(crate.name)}">
        <div class="scene-bg" aria-hidden="true"></div>
        <header class="scene-top">
          <a class="scene-back" href="#/" aria-label="Back to containers">‹ ${esc(cat.short)}</a>
          <div class="scene-title">
            <h1>${esc(verb)}</h1>
            <p>${crate.needsKey ? "Unlock" : "Open"} <b>${esc(crate.name)}</b></p>
          </div>
          <a class="scene-x" href="#/" aria-label="Close">×</a>
        </header>

        <div class="scene-mid" id="scene-mid">
          <div class="scene-case">${crate.img ? `<img src="${esc(crate.img)}" alt="${esc(crate.name)}">` : ""}</div>
        </div>

        <div class="scene-contents" id="scene-contents">
          <div class="scene-contents-head">
            <span>Contains one of the following:</span>
            <button type="button" class="linkish" id="odds-btn" aria-expanded="false">Item info &amp; odds</button>
          </div>
          <div class="odds-panel" id="odds-panel" hidden>
            ${crate.tiers.map((t) => `<span><i style="background:${CS.tierColor(t.tier)}"></i>${esc(CS.tierName(t.tier, t.items[0].kind))} <b class="mono">${pct(t.p)}</b></span>`).join("")}
            ${crate.cat === "case" && crate.contains.some((i) => i.stattrakable) ? `<span><i style="background:var(--st)"></i>StatTrak™ <b class="mono">10%</b></span>` : ""}
          </div>
          <div class="ctiles" id="tiles">
            ${sorted.map((it) => tile(it, { eager: false, attrs: `title="${esc(tooltipFor(it, perItem.get(it.tier), crate))}"` })).join("")}
            ${goldTier ? tile(crate.rare[0], { attrs: `role="button" tabindex="0" id="gold-tile" title="${esc(`★ Rare Special Item\n${crate.rareGroups.length} knife/glove finishes · ${pct(goldTier.p)} total\nClick to see them all`)}"` }) : ""}
          </div>
          <div class="rare-list" id="rare-list" hidden>
            <div class="ctiles">${crate.rare.map((it) => tile(it, { mask: false, eager: false, attrs: `title="${esc(tooltipFor(it, goldTier.p / crate.rareGroups.length, crate) + (it.phase ? "\n" + it.phase : ""))}"` })).join("")}</div>
          </div>
        </div>

        <footer class="scene-bar">
          <div class="keyinfo">
            ${crate.needsKey ? `<span class="keyicon">${keyIcon}</span><div><b>Use ${esc(keyName)}</b><small>${casePrice != null ? `Case ${money(casePrice)} + key ${money(CS.KEY_PRICE)} on the market. Free here.` : "Free here."}</small></div>`
              : `<div><b>${esc(crate.name)}</b><small>${casePrice != null ? `${money(casePrice)} on the market. Free here.` : "No key needed."}</small></div>`}
          </div>
          <div class="bar-controls">
            <div class="seg" role="group" aria-label="How many to open">
              ${[1, 2, 3, 5, 10].map((n) => `<button type="button" data-n="${n}" aria-pressed="${s.count === n}">×${n}</button>`).join("")}
            </div>
            <label class="toggle"><input type="checkbox" id="quick" ${s.quick ? "checked" : ""}> Quick</label>
            <a class="linkish" href="#/simulator/${encodeURIComponent(crate.id)}">Simulate thousands</a>
          </div>
          <div class="bar-actions" id="bar-actions"></div>
        </footer>
      </section>`;

    scene = { crate, el: $(".scene", host), phase: "idle", drops: [], verb };
    preload(crate);
    renderActions();

    $$(".seg [data-n]", host).forEach((b) => b.addEventListener("click", () => {
      store.setSetting("count", +b.dataset.n);
      $$(".seg [data-n]", host).forEach((x) => x.setAttribute("aria-pressed", x === b));
      renderActions();
    }));
    $("#quick", host).addEventListener("change", (e) => store.setSetting("quick", e.target.checked));
    $("#odds-btn", host).addEventListener("click", (e) => {
      const panel = $("#odds-panel", host);
      panel.hidden = !panel.hidden;
      e.target.setAttribute("aria-expanded", String(!panel.hidden));
    });
    const gt = $("#gold-tile", host);
    if (gt) {
      const toggle = () => { const l = $("#rare-list", host); l.hidden = !l.hidden; if (!l.hidden) l.scrollIntoView({ block: "nearest" }); };
      gt.addEventListener("click", toggle);
      gt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    }
    host.addEventListener("click", onAction);
  }

  // Warm the browser cache with every image the reel can show, so tiles that
  // fly past at full speed already have their picture.
  const preloaded = new Set();
  function preload(crate) {
    for (const it of crate.contains) {
      const url = CS.thumb(it, 256);
      if (!url || preloaded.has(url)) continue;
      preloaded.add(url);
      const img = new Image();
      img.decoding = "async";
      img.onerror = () => { if (img.src !== it.img) img.src = it.img; };
      img.src = url;
    }
  }

  function renderActions() {
    if (!scene) return;
    const n = store.state.settings.count;
    const box = $("#bar-actions");
    if (scene.phase === "idle") {
      box.innerHTML = `<button class="btn btn-go btn-big" type="button" data-act="open" data-autofocus>${esc(scene.verb)}${n > 1 ? ` ×${n}` : ""}</button>`;
    } else if (scene.phase === "spinning") {
      box.innerHTML = `<button class="btn btn-ghost" type="button" data-act="skip">Skip</button><button class="btn btn-go btn-big" type="button" disabled>${scene.crate.needsKey ? "Unlocking…" : "Opening…"}</button>`;
    } else {
      box.innerHTML = `<a class="btn btn-ghost" href="#/inventory">Inventory</a><button class="btn" type="button" data-act="close">Close</button><button class="btn btn-go btn-big" type="button" data-act="open" data-autofocus>${scene.crate.needsKey ? "Unlock another" : "Open another"}${n > 1 ? ` ×${n}` : ""}</button>`;
    }
    const af = $("[data-autofocus]", box);
    if (af) af.focus({ preventScroll: true });
  }

  function setPhase(p) {
    scene.phase = p;
    scene.el.dataset.phase = p;
    renderActions();
  }

  function onAction(e) {
    const b = e.target.closest("[data-act]");
    if (!b || !scene) return;
    const act = b.dataset.act;
    if (act === "open") open();
    if (act === "skip" && scene.skip) scene.skip();
    if (act === "close") idle();
    if (act === "inspect") CS.ui.inspect(b.dataset.uid);
  }

  function idle() {
    const c = scene.crate;
    $("#scene-mid").innerHTML = `<div class="scene-case">${c.img ? `<img src="${esc(c.img)}" alt="${esc(c.name)}">` : ""}</div>`;
    setPhase("idle");
  }

  async function open() {
    if (!scene || scene.phase === "spinning") return;
    const crate = scene.crate;
    const n = store.state.settings.count;
    const drops = Array.from({ length: n }, () => CS.openCrate(crate));
    // Granted up front, like the game: a reload mid-spin loses nothing.
    store.recordDrops(drops, crate);
    scene.drops = drops;
    if (!store.state.settings.quick) {
      setPhase("spinning");
      await spin(crate, drops);
      if (!scene || scene.crate !== crate) return;
    }
    reveal(drops);
  }

  // ---------- reel ----------
  const STRIP = 64;
  const WIN = 56;
  function spin(crate, drops) {
    return new Promise((resolve) => {
      const mid = $("#scene-mid");
      const size = drops.length > 5 ? "tiny" : drops.length > 2 ? "small" : drops.length > 1 ? "medium" : "";
      const strips = drops.map((d) => {
        const cells = [];
        for (let i = 0; i < STRIP; i++) cells.push(i === WIN ? CS.byKey.get(d.k) : CS.rollItem(crate));
        return cells;
      });
      mid.innerHTML = `<div class="reels ${size}">${strips.map((cells) =>
        `<div class="reel"><div class="reel-track">${cells.map((it, i) => tile(it, { attrs: i === WIN ? 'data-win="1"' : "" })).join("")}</div></div>`
      ).join("")}</div>
      <div class="scene-case small">${crate.img ? `<img src="${esc(crate.img)}" alt="">` : ""}</div>`;

      const reels = $$(".reel", mid).map((reel, i) => ({
        reel,
        track: $(".reel-track", reel),
        win: $("[data-win]", reel),
        frac: 0.1 + CS.random() * 0.8, // where inside the winning tile the line stops
        dur: (reduceMotion ? 900 : 6200) + i * (reduceMotion ? 0 : 280),
        lastIdx: -1,
      }));
      let start = null;
      let skipped = false;
      scene.skip = () => { skipped = true; };

      function frame(now) {
        if (!scene || !document.body.contains(mid)) return resolve();
        if (start == null) start = now;
        let done = 0;
        reels.forEach((r, i) => {
          // Measured every frame from the winning tile itself, so the line always ends on it,
          // even if the window is resized mid-spin.
          const tileW = r.win.offsetWidth;
          const target = r.win.offsetLeft + tileW * r.frac - r.reel.clientWidth / 2;
          const t = skipped ? 1 : Math.min(1, (now - start) / r.dur);
          const e = 1 - Math.pow(1 - t, 4.2);
          const x = e * target;
          r.track.style.transform = `translate3d(${-x}px,0,0)`;
          const step = r.track.children[1].offsetLeft - r.track.children[0].offsetLeft;
          const idx = Math.floor((x + r.reel.clientWidth / 2) / step);
          if (i === 0 && idx !== r.lastIdx && !skipped && t < 1) CS.sound.tick();
          r.lastIdx = idx;
          if (t >= 1) done++;
        });
        if (done < reels.length) return requestAnimationFrame(frame);
        scene.skip = null;
        reels.forEach((r) => r.win.classList.add("win"));
        setTimeout(resolve, skipped ? 120 : 750);
      }
      requestAnimationFrame(frame);
    });
  }

  // ---------- reveal ----------
  function reveal(drops) {
    const best = drops.reduce((a, d) => (CS.byKey.get(d.k).tier > CS.byKey.get(a.k).tier ? d : a), drops[0]);
    const bestIt = CS.byKey.get(best.k);
    CS.sound.reveal(bestIt.tier);
    const mid = $("#scene-mid");
    if (drops.length === 1) {
      const inv = drops[0];
      const it = bestIt;
      const color = CS.tierColor(it.tier);
      const w = CS.wearOf(inv.f);
      const p = priceTag(inv);
      const pat = CS.patternOf(inv);
      mid.innerHTML = `${pat ? `<div class="pattern-banner pat-${pat.style}" role="status">${esc(pat.label)}! <span>Pattern ${inv.s} · ×${pat.mult} value</span></div>` : ""}<div class="result" style="--c:${color}">
        <div class="result-art">${it.tier >= 4 ? `<div class="rays" aria-hidden="true"></div>` : ""}<div class="result-glow" aria-hidden="true"></div>${imgTag(it, 512, "", true)}</div>
        <div class="result-info">
          <div class="rarity" style="color:${color}">${rarityLabel(it)}</div>
          <h2 style="color:${color}">${esc(CS.fullName({ ...inv, f: null }))}</h2>
          <div class="result-sub">${[w ? w.name : "", it.phase, p ? `<b class="mono">${p}</b>` : ""].filter(Boolean).join(" · ")}</div>
          ${floatBlock(inv, it)}
          ${factsHTML(inv, it)}
        </div>
      </div>`;
    } else {
      const total = drops.reduce((a, d) => a + (CS.price(d) || 0), 0);
      mid.innerHTML = `<div class="result-multi">
        <div class="result-multi-head"><h2>${drops.length} items received</h2><span>Worth <b class="mono">${money(total)}</b></span></div>
        <div class="item-grid">${drops.map((d, i) => itemCard(CS.byKey.get(d.k), d, { button: true, attrs: `data-act="inspect" data-uid="${d.u}"`, style: `animation-delay:${i * 50}ms` })).join("")}</div>
      </div>`;
    }
    scene.el.classList.toggle("gold-hit", bestIt.tier === GOLD || drops.some((d) => CS.patternOf(d)));
    setPhase("reveal");
  }

  function close() {
    document.body.classList.remove("scene-open");
    if (scene && scene.skip) scene.skip();
    scene = null;
    const host = document.getElementById("scene");
    host.innerHTML = "";
    host.replaceWith(host.cloneNode(false)); // drop listeners
  }

  document.addEventListener("keydown", (e) => {
    if (!scene || hasOverlay()) return;
    if (e.key === "Escape") {
      if (scene.phase === "reveal") idle();
      else if (scene.phase === "idle") location.hash = "#/";
    }
  });

  CS.scene = { render, close, get active() { return !!scene; } };
})();
