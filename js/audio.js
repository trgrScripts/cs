/* Synthesised UI sounds (no audio files): reel ticks and reveal stings. */
(function () {
  const CS = window.CS;
  let ctx = null;

  function ac() {
    if (!CS.store.state.settings.sound) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function blip(freq, dur, type, gain, when) {
    const a = ac();
    if (!a) return;
    const t = a.currentTime + (when || 0);
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  let lastTick = 0;
  function tick() {
    const now = performance.now();
    if (now - lastTick < 28) return; // keep fast spins from turning into a buzz
    lastTick = now;
    blip(1700 + Math.random() * 300, 0.035, "square", 0.035);
    blip(420, 0.03, "triangle", 0.05);
  }

  // Rising arpeggio; longer and brighter for higher grades.
  function reveal(tier) {
    const scale = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568, 2093];
    const n = Math.max(2, Math.min(7, tier + 1));
    for (let i = 0; i < n; i++) blip(scale[i], 0.35 + i * 0.03, "triangle", 0.07, i * 0.07);
    if (tier >= 6) {
      for (let i = 0; i < 10; i++) blip(2000 + Math.random() * 2400, 0.12, "sine", 0.03, 0.45 + i * 0.06);
    }
  }

  function click() {
    blip(900, 0.04, "sine", 0.04);
  }

  CS.sound = { tick, reveal, click };
})();
