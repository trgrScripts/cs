/* Routing and app start-up. */
(function () {
  const CS = window.CS;
  const store = CS.store;
  const V = CS.views;
  const { $, $$, toast, big } = CS.ui;

  // ---------- top bar ----------
  const soundIcon = (on) => on
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none"/><path d="M17 9l5 6M22 9l-5 6"/></svg>`;
  const soundBtn = $("#sound-btn");
  soundBtn.addEventListener("click", () => store.setSetting("sound", !store.state.settings.sound));
  function renderTop() {
    const s = store.state;
    $("#inv-count").textContent = big(s.inv.length);
    soundBtn.innerHTML = soundIcon(s.settings.sound);
    soundBtn.setAttribute("aria-label", s.settings.sound ? "Mute sounds" : "Turn sounds on");
    soundBtn.title = s.settings.sound ? "Sound on" : "Sound off";
  }

  // ---------- router ----------
  function route() {
    const h = location.hash.replace(/^#\/?/, "");
    if (h.startsWith("case/")) return { name: "case", id: decodeURIComponent(h.slice(5)) };
    if (h.startsWith("simulator")) return { name: "simulator", id: decodeURIComponent(h.slice(10)) };
    if (h === "inventory" || h === "tradeup" || h === "stats") return { name: h };
    return { name: "cases" };
  }

  function render() {
    const r = route();
    $$(".nav a").forEach((a) => {
      const active = a.dataset.route === r.name || (r.name === "case" && a.dataset.route === "cases");
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    if (r.name === "case") {
      const crate = CS.crateById.get(r.id);
      if (crate) {
        CS.scene.render(crate);
        // Keep the page behind the scene populated.
        if (!$("#view").children.length) V.renderCases();
        return;
      }
      location.replace("#/");
      return;
    }
    if (CS.scene.active) CS.scene.close();
    if (r.name === "cases") V.renderCases();
    else if (r.name === "inventory") V.renderInventory();
    else if (r.name === "tradeup") V.renderTradeUp();
    else if (r.name === "simulator") V.renderSimulator(r.id);
    else if (r.name === "stats") V.renderStats();
  }

  window.addEventListener("hashchange", () => {
    render();
    window.scrollTo(0, 0);
  });

  store.on(renderTop);
  // Re-render data-driven pages when the inventory changes.
  store.on(() => {
    const r = route().name;
    if (r === "inventory" || r === "stats" || r === "tradeup") render();
  });

  store.ready.then(() => {
    renderTop();
    render();
    if (store.saveError) toast("Your browser is blocking storage, so drops won't be saved after you close this tab.");
    if (!CS.hasPrices) console.info("No prices loaded yet: run scripts/build_prices.py or the Update prices workflow.");
  });
})();
