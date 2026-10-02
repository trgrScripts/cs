/* Shared UI helpers: escaping, item cards, overlays, item inspection. */
(function () {
  const CS = window.CS;
  const store = CS.store;
  const GOLD = CS.GOLD;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pct = (p) => {
    const v = p * 100;
    return (v >= 10 ? v.toFixed(1) : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : v.toPrecision(2)) + "%";
  };
  const money = CS.money;
  // Market price of an owned item; "~" marks an estimate.
  const priceTag = (inv) => {
    const p = CS.price(inv);
    return p == null ? "" : (CS.isEstimate(inv) || CS.patternOf(inv) ? "~" : "") + money(p);
  };
  const year = (d) => (d ? d.slice(0, 4) : "");
  const ago = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };
  const big = (n) => n.toLocaleString("en-US");
  // Short form for very large counts: 1.99B, 2.5T.
  const count = (n) => (n >= 1e12 ? (n / 1e12).toFixed(2) + "T" : n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : big(n));

  // Steam images: try the resized thumbnail first, then the original, then a placeholder.
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    if (img.dataset.full && img.src !== img.dataset.full) img.src = img.dataset.full;
    else img.classList.add("broken");
  }, true);

  function imgTag(it, size, cls, eager) {
    if (!it || !it.img) return "";
    return `<img ${cls ? `class="${cls}"` : ""} ${eager ? "" : 'loading="lazy"'} decoding="async" src="${esc(CS.thumb(it, size))}" data-full="${esc(it.img)}" alt="">`;
  }

  // The yellow "?" emblem CS2 shows in place of a knife or gloves.
  let emblemId = 0;
  function goldEmblem() {
    const id = "ge" + emblemId++;
    let leaves = "";
    // Leaves along both sides of a circle, open at the top (screen angles, y down).
    for (const side of [1, -1]) {
      for (let i = 0; i < 7; i++) {
        const deg = 100 + i * 21;
        const rad = deg * (Math.PI / 180);
        const x = 50 + side * 38 * Math.cos(rad);
        const y = 50 + 38 * Math.sin(rad);
        const rot = side * deg;
        leaves += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.2" ry="9" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;
      }
    }
    return `<svg class="gold-emblem" viewBox="0 0 100 100" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#fff2b8"/><stop offset=".55" stop-color="#f1c232"/><stop offset="1" stop-color="#a8740c"/></radialGradient></defs>
      <g fill="#c8961d" stroke="#7a5408" stroke-width=".8">${leaves}</g>
      <circle cx="50" cy="50" r="27" fill="url(#${id})" stroke="#7a5408" stroke-width="2"/>
      <text x="50" y="62" text-anchor="middle" font-family="Saira Condensed, Arial Narrow, sans-serif" font-weight="700" font-size="34" fill="#5a3d05">?</text>
    </svg>`;
  }

  function toast(msg) {
    $$(".toast").forEach((t) => t.remove());
    const t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  // ---------- item card ----------
  // it: catalogue item; inv: owned copy (optional).
  // opts: {button, mask (gold shows as emblem), pct, sub, attrs, cls, style}
  function itemCard(it, inv, o = {}) {
    const tag = o.button ? "button" : "div";
    const masked = o.mask && it.tier === GOLD;
    const color = CS.tierColor(it.tier);
    let tags = "";
    if (inv && inv.st) tags += `<span class="chip chip-st">StatTrak™</span>`;
    if (inv && inv.sv) tags += `<span class="chip chip-souv">Souvenir</span>`;
    const pat = inv && CS.patternOf(inv);
    if (pat) tags += `<span class="chip chip-pat chip-pat-${pat.style}">${esc(pat.short)}</span>`;
    const art = masked ? goldEmblem() : imgTag(it, 256);
    const base = masked ? "★ Rare Special Item" : esc(it.base) + (it.phase ? ` · ${esc(it.phase)}` : "");
    const fin = masked ? "Exceedingly Rare" : esc(it.finish);
    let sub = "";
    if (inv) {
      const w = CS.wearOf(inv.f);
      sub = `<div class="sub"><span>${w ? `${w.short} <span class="mono">${inv.f.toFixed(4)}</span>` : esc(CS.tierName(it.tier, it.kind))}</span><span class="price">${priceTag(inv)}</span></div>`;
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

  function wearBar(f, it, withRange) {
    if (f == null) return "";
    const range = withRange && it && it.painted ? `<span class="range" style="left:${it.min * 100}%;width:${(it.max - it.min) * 100}%"></span>` : "";
    return `<div class="wearbar">${"<i></i>".repeat(5)}${range}<b style="left:${f * 100}%"></b></div>`;
  }
  function floatBlock(inv, it) {
    if (inv.f == null) return "";
    return `<div class="floatbar">${wearBar(inv.f, it, true)}<div class="ticks"><span>0.00</span><span>0.07</span><span>0.15</span><span>0.38</span><span>0.45</span><span>1.00</span></div></div>`;
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
  const hasOverlay = () => overlayStack.length > 0;

  // choices: [{label, value, kind: "go"|"danger"|"ghost"}]; resolves with the value, or null.
  function choose(title, text, choices) {
    return new Promise((resolve) => {
      const ov = openOverlay(`<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" style="width:min(460px,100%)">
        <div class="confirm"><h2 id="cf-t">${esc(title)}</h2><p>${esc(text)}</p></div>
        <div class="modal-actions"><button class="btn btn-ghost" data-i="-1" data-autofocus>Cancel</button>
        ${choices.map((c, i) => `<button class="btn ${c.kind === "danger" ? "btn-danger" : c.kind === "ghost" ? "btn-ghost" : "btn-go"}" data-i="${i}">${esc(c.label)}</button>`).join("")}</div>
      </div>`);
      let done = false;
      ov._onClose = () => { if (!done) resolve(null); };
      $$("[data-i]", ov).forEach((b) => b.addEventListener("click", () => {
        done = true;
        closeOverlay(ov);
        const i = +b.dataset.i;
        resolve(i < 0 ? null : choices[i].value);
      }));
    });
  }
  const confirmBox = (title, text, okLabel, danger) =>
    choose(title, text, [{ label: okLabel, value: true, kind: danger ? "danger" : "go" }]).then((v) => v === true);

  // ---------- item details ----------
  function factsHTML(inv, it) {
    const w = CS.wearOf(inv.f);
    const crate = CS.crateById.get(inv.c);
    const facts = [];
    facts.push(["Market price", CS.price(inv) != null ? `<span class="mono">${priceTag(inv)}</span>${CS.isEstimate(inv) ? ` <span class="muted">est.</span>` : ""}` : `<span class="muted">No market data</span>`]);
    if (w) facts.push(["Exterior", w.name]);
    if (inv.f != null) facts.push(["Float", `<span class="mono">${CS.floatText(inv.f)}</span>`, "wide"]);
    const pat = CS.patternOf(inv);
    if (inv.s != null) facts.push(["Pattern", `<span class="mono">${inv.s}</span>${pat ? ` <span class="chip chip-pat chip-pat-${pat.style}">${esc(pat.label)}</span>` : ""}`, pat ? "wide" : ""]);
    if (pat) facts.push(["Pattern premium", `<span class="mono">×${pat.mult}</span> <span class="muted">est.</span>`]);
    if (it.phase) facts.push(["Phase", esc(it.phase)]);
    if (it.painted) facts.push(["Float cap", `<span class="mono">${it.min.toFixed(2)} – ${it.max.toFixed(2)}</span>`]);
    if (inv.st) facts.push(["StatTrak™", "0 confirmed kills"]);
    if (crate) facts.push([inv.o === "tradeup" ? "Trade-up from" : "Unboxed from", esc(crate.name)]);
    facts.push(["Received", new Date(inv.t).toLocaleString()]);
    return `<dl class="facts">${facts.map(([k, v, cls]) => `<div${cls ? ` class="${cls}"` : ""}><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
  }
  function rarityLabel(it) {
    return it.tier === GOLD
      ? `★ ${esc(it.rarity)} ${it.kind === "gloves" ? "Gloves" : "Knife"}`
      : esc(CS.tierName(it.tier, it.kind)) + (it.kind === "weapon" ? " " + esc(it.base) : "");
  }
  function detailHTML(inv, heading) {
    const it = CS.byKey.get(inv.k);
    const color = CS.tierColor(it.tier);
    return `
      <div class="reveal-art" style="--c:${color}">${it.tier >= 5 ? `<div class="rays" aria-hidden="true"></div>` : ""}${imgTag(it, 512, "", true)}</div>
      <div class="reveal-body">
        ${heading ? `<div class="eyebrow">${esc(heading)}</div>` : ""}
        <div class="rarity" style="color:${color}">${rarityLabel(it)}</div>
        <h2>${esc(CS.fullName(inv))}</h2>
        ${floatBlock(inv, it)}
        ${factsHTML(inv, it)}
      </div>`;
  }

  // Inspect an owned item. onTradeUp(inv) is called by the "Use in trade-up" button.
  function inspect(uid, onTradeUp) {
    const inv = store.state.inv.find((x) => x.u === uid);
    if (!inv) return;
    const eligible = onTradeUp && CS.tradeUpEligible(inv);
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
      if (act === "tu") { closeOverlay(ov); onTradeUp(inv); }
      if (act === "del") {
        if (await confirmBox("Delete this item?", CS.fullName(inv) + " will be removed from your inventory.", "Delete", true)) {
          store.remove([uid]);
          closeOverlay(ov);
          toast("Item deleted");
        }
      }
    });
  }

  // Modal reveal (used for trade-up results).
  function revealModal(inv, heading) {
    const it = CS.byKey.get(inv.k);
    CS.sound.reveal(it.tier);
    const ov = openOverlay(`<div class="modal" role="dialog" aria-modal="true" aria-label="You received ${esc(CS.fullName(inv))}">
        ${detailHTML(inv, heading)}
        <div class="modal-actions"><a class="btn btn-ghost" href="#/inventory" data-act="close">Inventory</a><span class="spacer"></span><button class="btn btn-go" data-act="close" data-autofocus>Done</button></div>
      </div>`, it.tier === GOLD ? "is-gold-reveal" : "");
    ov.addEventListener("click", (e) => {
      if (e.target.closest("[data-act]")) closeOverlay(ov);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayStack.length) {
      e.stopImmediatePropagation();
      closeOverlay();
    }
  }, true);

  CS.ui = {
    esc, $, $$, pct, money, priceTag, year, ago, big, count, reduceMotion,
    imgTag, goldEmblem, toast, itemCard, wearBar, floatBlock, factsHTML, rarityLabel,
    openOverlay, closeOverlay, hasOverlay, choose, confirmBox, detailHTML, inspect, revealModal,
  };
})();
