/* ==========================================================================
 * app.js — the Crime Lab's interactive bits.
 *
 * Each "case" follows the same recipe:
 *   simulate(state)  -> fake-but-plausible data with a KNOWN true effect
 *   analyze(data)    -> the naive test (the crime) + the proper test (the fix)
 *   draw(data)       -> an SVG crime scene
 *   universes()      -> repeat 500x to show how often each test cries "wolf"
 *
 * Read top to bottom; it's a story with a beginning (helpers), a middle
 * (four crimes), and an end (slot machine, quiz, excuses, badges).
 * ========================================================================== */
(function () {
  "use strict";
  const S = window.Stats;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVGNS = "http://www.w3.org/2000/svg";
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const newSeed = () => (Math.random() * 2 ** 31) | 0;
  const UNIVERSES = 500;

  /* ======================================================================
   * Tiny helpers
   * ==================================================================== */

  /** el("circle", {cx: 3, style: "fill:red"}, [children]) — SVG element factory. */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    for (const c of children) if (c) node.appendChild(c);
    return node;
  }
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
  const pick = (arr, i) => arr[Math.abs(i | 0) % arr.length];
  const mix = (a, b, pctA) => `color-mix(in srgb, var(${a}) ${clamp(pctA, 0, 100).toFixed(0)}%, var(${b}))`;
  const fmt = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
      catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: fine */ } },
  };

  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function confetti(n = 60) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const colors = ["var(--gold)", "var(--treated)", "var(--control)", "var(--accent)", "var(--safe)", "var(--danger)"];
    for (let i = 0; i < n; i++) {
      const c = document.createElement("i");
      c.className = "confetti";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 1.6 + Math.random() * 1.8 + "s";
      c.style.animationDelay = Math.random() * 0.4 + "s";
      c.style.borderRadius = i % 3 ? "2px" : "50%";
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4200);
    }
  }

  /* ======================================================================
   * Achievements: worth exactly as much as an impact factor
   * ==================================================================== */
  const BADGES = [
    ["randomizer", "🎲", "Actually Randomized"],
    ["multiverse", "🌌", "Multiverse Tourist"],
    ["fisher", "😈", "Seed Fisher"],
    ["perpendicular", "↕️", "Blocked Correctly"],
    ["morePlants", "🌿", "Bought More Plants"],
    ["errorA", "🧹", "Error(a) Whisperer"],
    ["gambler", "🎰", "Forking-Paths Gambler"],
    ["pooper", "🧊", "Party Pooper"],
    ["scholar", "🎓", "Reviewer #2's Nightmare"],
    ["excuses", "🙃", "Excuse Collector"],
    ["tenure", "🎓", "Got Tenure"],
    ["flawless", "💎", "Flawless Reviewer"],
    ["rivalry", "🤝", "Lab Rivalry Survivor"],
  ];
  const earned = new Set(store.get("crimelab.badges", []));

  function renderBadges() {
    const ul = $("#badges");
    ul.innerHTML = BADGES.map(([id, em, name]) =>
      `<li class="${earned.has(id) ? "on" : ""}" title="${earned.has(id) ? "Unlocked!" : "Locked: keep playing"}">
         <span class="em" aria-hidden="true">${em}</span>${name}</li>`).join("");
  }
  function unlock(id) {
    if (earned.has(id)) return;
    earned.add(id);
    store.set("crimelab.badges", [...earned]);
    renderBadges();
    const [, em, name] = BADGES.find((b) => b[0] === id);
    if (earned.size === BADGES.length) {
      toast("🏆 ALL BADGES! You are now legally a statistician (not legally binding).");
      confetti(140);
    } else {
      toast(`${em} Badge unlocked: ${name}`);
      confetti(40);
    }
  }

  /* ======================================================================
   * Shared result widgets
   * ==================================================================== */
  const QUIPS = {
    naiveSig: [
      "Call Nature. Call your mum. Call it a breakthrough.",
      "Stars! The grant renewal writes itself.",
      "Book the TED talk. Buy the turtleneck.",
      "Somewhere, Reviewer #2 just sharpened a pencil.",
      "Press release drafted. Truth not consulted.",
    ],
    naiveNs: [
      "Even the naive test isn't buying it this time.",
      "No stars. The universe declined to lie today.",
    ],
    honestNull: [
      "Nothing to see here. Which is exactly the truth.",
      "Boring. Correct. Boringly correct.",
      "The honest model shrugs, and it is right to.",
      "Sorry, the miracle was the sunlight all along.",
    ],
    honestFalsePos: ["A 1-in-20 fluke at the honest 5% rate. That's literally what α means."],
    honestHit: ["Real effect, honestly detected. Frame this one. 🖼️"],
    honestMiss: ["Missed a real effect: honest but underpowered. More units, please."],
  };

  /** Log-scale "p-o-meter": the further right, the louder the false confidence. */
  function pBar(p) {
    const W = 300, x = (q) => (W * clamp(-Math.log10(q), 0, 10)) / 10;
    const filled = x(Math.max(p, 1e-300));
    const ticks = [[1, "1"], [0.05, ".05"], [0.001, ".001"], [1e-6, "1e-6"], [1e-10, "≤1e-10"]];
    return `<svg viewBox="0 0 ${W} 30" aria-hidden="true" preserveAspectRatio="none">
      <rect x="0" y="2" width="${W}" height="11" rx="5.5" style="fill:var(--bg);stroke:var(--line);stroke-width:1.5"/>
      <rect x="0" y="2" width="${filled.toFixed(1)}" height="11" rx="5.5" style="fill:${p < 0.05 ? "var(--danger)" : "var(--safe)"}"/>
      <line x1="${x(0.05)}" x2="${x(0.05)}" y1="0" y2="15" style="stroke:var(--ink);stroke-width:2"/>
      ${ticks.map(([q, lab]) => `<text x="${clamp(x(q), 6, W - 22)}" y="27" text-anchor="middle" style="font:9px var(--font-mono);fill:var(--ink-soft)">${lab}</text>`).join("")}
    </svg>`;
  }

  /**
   * One result card.
   * kind: "fake" for the naive analysis, "honest" for the proper one.
   */
  function verdict({ kind, label, spec, est, unit, p, trueEffect, seed }) {
    let pool;
    if (kind === "fake") pool = p < 0.05 ? QUIPS.naiveSig : QUIPS.naiveNs;
    else if (trueEffect === 0) pool = p < 0.05 ? QUIPS.honestFalsePos : QUIPS.honestNull;
    else pool = p < 0.05 ? QUIPS.honestHit : QUIPS.honestMiss;
    const st = S.stars(p);
    return `<div class="verdict ${kind}">
      <span class="stamp">${kind === "fake" ? "NAIVE" : "HONEST"}</span>
      <span class="label">${label}</span>
      <span class="stars ${st === "n.s." ? "ns" : ""}">${st}</span>
      <span class="pval">p = ${S.formatP(p)}</span>
      <span class="spec">${spec}${est !== undefined ? ` · estimate ${fmt(est)} ${unit}` : ""}</span>
      <div class="pbar">${pBar(p)}</div>
      <span class="quip">${pick(pool, seed)}</span>
    </div>`;
  }

  /** Monte-Carlo summary: % of universes that shouted "significant!". */
  function mcPanel(rows, trueEffect, extraNote = "") {
    const head = trueEffect === 0
      ? `🌌 ${UNIVERSES} parallel universes, true effect = 0. Honest tests should say “significant” ~5% of the time (black line).`
      : `🌌 ${UNIVERSES} parallel universes, true effect ≠ 0. Now “significant” = power: higher is better, if the test is honest.`;
    return `<h4>${head}</h4>
      ${rows.map(([label, rate, kind]) => `
        <div class="mc-row">
          <span>${label}</span>
          <span class="track"><span class="fill ${kind}" style="width:0%" data-w="${(rate * 100).toFixed(1)}%"></span><i class="five"></i></span>
          <b>${(rate * 100).toFixed(0)}%</b>
        </div>`).join("")}
      ${extraNote ? `<p class="note">${extraNote}</p>` : ""}`;
  }
  function animateBars(container) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $$(".fill", container).forEach((f) => { f.style.width = f.dataset.w; });
    }));
  }

  /** Run a Monte-Carlo loop without freezing the button mid-click. */
  function runUniverses(button, mcEl, compute) {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "⏳ Opening portals…";
    setTimeout(() => {
      try {
        mcEl.innerHTML = compute();
        animateBars(mcEl);
        unlock("multiverse");
      } finally {
        button.disabled = false;
        button.textContent = old;
      }
    }, 30);
  }

  /** Keep re-rolling seeds until `predicate(seed)` is true. The dark arts. */
  function fishForSeed(start, predicate, maxTries = 5000) {
    for (let i = 0; i < maxTries; i++) if (predicate(start + i)) return { seed: start + i, tries: i + 1 };
    return null;
  }

  /* ======================================================================
   * CASE 01 — The Lazy Randomization
   * ==================================================================== */
  const case1 = (() => {
    const N = 40;
    const state = { mode: "lazy", g: 0.55, e: 0, seed: 42 };

    function simulate({ mode, g, e, seed }) {
      const r = S.rng(seed);
      const pos = Array.from({ length: N }, (_, i) => i + 1);
      let treated;
      if (mode === "lazy") treated = pos.map((p) => (p <= N / 2 ? 1 : 0));
      else {
        const chosen = new Set(r.shuffle(pos).slice(0, N / 2));
        treated = pos.map((p) => (chosen.has(p) ? 1 : 0));
      }
      const y = pos.map((p, i) => 54 - g * p + e * treated[i] + r.normal(0, 2.8));
      return { pos, treated, y };
    }

    function analyze({ pos, treated, y }) {
      const naive = S.ols(S.design(N, [treated]), y);
      const proper = S.ols(S.design(N, [treated, pos]), y);
      return {
        naive: { est: naive.beta[1], p: naive.p[1], df: naive.df },
        proper: { est: proper.beta[1], p: proper.p[1], df: proper.df },
      };
    }

    function draw(d) {
      const svg = $("#bench");
      clear(svg);
      svg.appendChild(el("defs", {}, [
        el("linearGradient", { id: "benchLight", x1: "0", x2: "1" }, [
          el("stop", { offset: "0", style: "stop-color:var(--gold);stop-opacity:.45" }),
          el("stop", { offset: "1", style: "stop-color:var(--water);stop-opacity:.35" }),
        ]),
      ]));
      svg.appendChild(el("rect", { x: 0, y: 0, width: 800, height: 300, rx: 10, fill: "url(#benchLight)" }));

      // the sun (source of all "treatment effects")
      const rays = el("g", { class: "sun-rays" });
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        rays.appendChild(el("line", {
          x1: 46 + 28 * Math.cos(a), y1: 44 + 28 * Math.sin(a), x2: 46 + 38 * Math.cos(a), y2: 44 + 38 * Math.sin(a),
          style: "stroke:var(--gold);stroke-width:4;stroke-linecap:round",
        }));
      }
      svg.appendChild(rays);
      svg.appendChild(el("circle", { cx: 46, cy: 44, r: 20, style: "fill:var(--gold);stroke:var(--line);stroke-width:3" }));
      svg.appendChild(el("text", { x: 92, y: 34, class: "svg-label", text: "SUNNY GLASS DOOR" }));
      svg.appendChild(el("text", { x: 92, y: 52, class: "svg-label-soft", text: "warm · bright · suspiciously helpful" }));

      // the vent
      svg.appendChild(el("rect", { x: 712, y: 16, width: 74, height: 40, rx: 6, style: "fill:var(--paper);stroke:var(--line);stroke-width:3" }));
      for (let i = 0; i < 4; i++) svg.appendChild(el("line", { x1: 720, x2: 778, y1: 24 + i * 8, y2: 24 + i * 8, style: "stroke:var(--line);stroke-width:2" }));
      svg.appendChild(el("text", { x: 702, y: 34, "text-anchor": "end", class: "svg-label", text: "HVAC VENT ❄" }));
      svg.appendChild(el("text", { x: 702, y: 52, "text-anchor": "end", class: "svg-label-soft", text: "chilly · drafty · bad vibes" }));

      // group means as dashed lines
      const heights = d.y.map((v) => clamp((v - 18) * 4.2, 12, 185));
      const meanH = (flag) => S.mean(heights.filter((_, i) => d.treated[i] === flag));
      [[1, "--treated", "BioBoost‑X mean"], [0, "--control", "Control mean"]].forEach(([flag, color, lab], k) => {
        const yy = 240 - meanH(flag);
        svg.appendChild(el("line", { x1: 14, x2: 786, y1: yy, y2: yy, style: `stroke:var(${color});stroke-width:2.5;stroke-dasharray:7 5` }));
        svg.appendChild(el("text", { x: k ? 786 : 14, y: yy - 5, "text-anchor": k ? "end" : "start", class: "svg-label", style: `fill:var(${color});paint-order:stroke;stroke:var(--paper);stroke-width:4px`, text: lab }));
      });

      // pots + plants
      const plants = el("g");
      d.pos.forEach((p, i) => {
        const cx = 20 + i * 19 + 9.5, h = heights[i], top = 240 - h;
        const color = d.treated[i] ? "var(--treated)" : "var(--control)";
        const g = el("g", { class: "grow", style: `animation-delay:${i * 12}ms` }, [
          el("line", { x1: cx, x2: cx, y1: 240, y2: top, style: "stroke:var(--leaf);stroke-width:2.5" }),
          el("ellipse", { cx: cx - 5, cy: top + h * 0.45, rx: 5, ry: 2.6, transform: `rotate(-30 ${cx - 5} ${top + h * 0.45})`, style: "fill:var(--leaf)" }),
          el("ellipse", { cx: cx + 5, cy: top + h * 0.25, rx: 5, ry: 2.6, transform: `rotate(30 ${cx + 5} ${top + h * 0.25})`, style: "fill:var(--leaf)" }),
          el("circle", { cx, cy: top, r: clamp(3 + h / 28, 3, 9), style: "fill:var(--leaf);stroke:var(--line);stroke-width:1" }),
        ]);
        g.appendChild(el("title", { text: `Pot ${p}: ${d.treated[i] ? "BioBoost‑X" : "Control"}, ${d.y[i].toFixed(1)} g` }));
        plants.appendChild(g);
        plants.appendChild(el("path", {
          d: `M${cx - 8} 240 L${cx + 8} 240 L${cx + 6} 262 L${cx - 6} 262 Z`,
          style: `fill:${color};stroke:var(--line);stroke-width:1.5`,
        }));
      });
      svg.appendChild(plants);
      svg.appendChild(el("rect", { x: 8, y: 262, width: 784, height: 10, rx: 3, style: "fill:var(--ink)" }));
      [1, 10, 20, 30, 40].forEach((p) => svg.appendChild(el("text", { x: 20 + (p - 1) * 19 + 9.5, y: 290, "text-anchor": "middle", class: "svg-label-soft", text: `#${p}` })));
    }

    function render() {
      const d = simulate(state), a = analyze(d);
      draw(d);
      $("#c1results").innerHTML =
        verdict({ kind: "fake", label: "Naive t-test: treatment only", spec: `biomass ~ treatment · df = ${a.naive.df}`, est: a.naive.est, unit: "g", p: a.naive.p, trueEffect: state.e, seed: state.seed }) +
        verdict({ kind: "honest", label: "ANCOVA: treatment + bench position", spec: `biomass ~ treatment + bench_pos · df = ${a.proper.df}`, est: a.proper.est, unit: "g", p: a.proper.p, trueEffect: state.e, seed: state.seed + 1 });
    }

    function universes() {
      const rates = { lazyN: 0, lazyP: 0, randN: 0, randP: 0 };
      for (let u = 0; u < UNIVERSES; u++) {
        const seed = 10_000 + u;
        const L = analyze(simulate({ ...state, mode: "lazy", seed }));
        const R = analyze(simulate({ ...state, mode: "random", seed }));
        rates.lazyN += L.naive.p < 0.05; rates.lazyP += L.proper.p < 0.05;
        rates.randN += R.naive.p < 0.05; rates.randP += R.proper.p < 0.05;
      }
      const f = (k) => rates[k] / UNIVERSES;
      return mcPanel([
        ["😴 Lazy · t-test", f("lazyN"), "fake"],
        ["😴 Lazy · ANCOVA", f("lazyP"), "honest"],
        ["🎲 Random · t-test", f("randN"), "honest"],
        ["🎲 Random · ANCOVA", f("randP"), "honest"],
      ], state.e, "Randomizing alone already makes the t-test honest; adding bench position as a covariate also buys back power. The lazy layout + ANCOVA survives, but leans on a straight-line gradient — randomization is the real seatbelt.");
    }

    function init() {
      const sec = $("#case-01");
      $$('input[name="c1mode"]', sec).forEach((r) => r.addEventListener("change", () => {
        state.mode = r.value;
        if (r.value === "random") unlock("randomizer");
        render();
      }));
      const g = $("#c1g"), e = $("#c1e");
      g.addEventListener("input", () => { state.g = +g.value; $("#c1gOut").textContent = state.g.toFixed(2); render(); });
      e.addEventListener("input", () => { state.e = +e.value; $("#c1eOut").textContent = state.e.toFixed(1); render(); });
      $('[data-action="reroll"]', sec).addEventListener("click", () => { state.seed = newSeed(); render(); });
      $('[data-action="universes"]', sec).addEventListener("click", (ev) => runUniverses(ev.currentTarget, $("#c1mc"), universes));
      render();
    }
    return { init };
  })();

  /* ======================================================================
   * CASE 02 — Blocking the Wrong Way
   * ==================================================================== */
  const case2 = (() => {
    const T = ["Control", "Biochar", "Compost", "NanoKelp"];
    const LETTER = { Control: "C", Biochar: "B", Compost: "K", NanoKelp: "N" };
    const COLOR = { Control: "var(--control)", Biochar: "#a77b52", Compost: "var(--accent)", NanoKelp: "var(--treated)" };
    const ROWS = 8, COLS = 4, N = ROWS * COLS;
    const state = { mode: "rows", g: 0.65, e: 0, seed: 11, fished: 0 };

    function simulate({ mode, g, e, seed }) {
      const r = S.rng(seed);
      const grid = Array.from({ length: ROWS }, () => new Array(COLS));
      if (mode === "rows") {
        for (let i = 0; i < ROWS; i++) r.shuffle(T).forEach((t, j) => { grid[i][j] = t; });
      } else {
        for (let j = 0; j < COLS; j++) r.shuffle([...T, ...T]).forEach((t, i) => { grid[i][j] = t; });
      }
      const rowNoise = Array.from({ length: ROWS }, () => r.normal(0, 0.08));
      const plots = [];
      for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
          const trt = grid[i][j];
          const y = 6.2 - g * j + rowNoise[i] + (trt === "NanoKelp" ? e : 0) + r.normal(0, 0.3);
          plots.push({ row: i, col: j, trt, y });
        }
      }
      return plots;
    }

    // Fit `y ~ treatment + <blocking terms>` and F-test the treatment.
    function fTest(plots, blockTerms) {
      const y = plots.map((p) => p.y);
      const trt = S.dummies(plots.map((p) => p.trt), T);
      const blocks = blockTerms.flatMap((key) =>
        S.dummies(plots.map((p) => p[key]), [...new Set(plots.map((p) => p[key]))].sort((a, b) => a - b)));
      const full = S.ols(S.design(N, [...trt, ...blocks]), y);
      const reduced = S.ols(S.design(N, blocks), y);
      const f = S.nestedF(full, reduced);
      const nkIdx = T.indexOf("NanoKelp");
      return { p: f.p, df: full.df, mse: full.rss / full.df, est: full.beta[nkIdx] };
    }

    function analyze(plots, mode) {
      if (mode === "rows") return { wrong: fTest(plots, ["row"]), rescue: fTest(plots, ["row", "col"]) };
      return { right: fTest(plots, ["col"]) };
    }

    function draw(plots, mode) {
      const svg = $("#field");
      clear(svg);
      const X0 = 70, Y0 = 44, CW = 165, RH = 38;
      svg.appendChild(el("text", { x: X0, y: 26, class: "svg-label", text: "💧 WEST · irrigation canal" }));
      svg.appendChild(el("text", { x: X0 + CW * COLS, y: 26, "text-anchor": "end", class: "svg-label", text: "EAST · dry gravel 🏜️" }));

      plots.forEach((p) => {
        const x = X0 + p.col * CW, y = Y0 + p.row * RH;
        const wet = 100 - (p.col * 100) / (COLS - 1);
        const g = el("g", {}, [
          el("rect", { x, y, width: CW, height: RH, style: `fill:${mix("--wet-soil", "--dry-soil", wet)};stroke:var(--line);stroke-width:1.5` }),
          el("circle", { cx: x + 24, cy: y + RH / 2, r: 13, style: `fill:${COLOR[p.trt]};stroke:var(--line);stroke-width:2` }),
          el("text", { x: x + 24, y: y + RH / 2 + 5, "text-anchor": "middle", class: "plot-letter", style: "fill:#fff", text: LETTER[p.trt] }),
          el("rect", { x: x + 46, y: y + 13, width: clamp(p.y, 0, 8) * 13, height: 12, rx: 3, style: "fill:var(--paper);stroke:var(--line);stroke-width:1.2;opacity:.9" }),
          el("text", { x: x + CW - 8, y: y + RH / 2 + 5, "text-anchor": "end", class: "svg-label", style: "fill:#fff;paint-order:stroke;stroke:#1d1b27;stroke-width:3px", text: p.y.toFixed(2) }),
        ]);
        g.appendChild(el("title", { text: `Row ${p.row + 1}, column ${p.col + 1}: ${p.trt}, ${p.y.toFixed(2)} t/ha` }));
        svg.appendChild(g);
      });

      for (let i = 0; i < ROWS; i++) svg.appendChild(el("text", { x: X0 - 10, y: Y0 + i * RH + RH / 2 + 5, "text-anchor": "end", class: "svg-label-soft", text: `R${i + 1}` }));
      for (let j = 0; j < COLS; j++) svg.appendChild(el("text", { x: X0 + j * CW + CW / 2, y: Y0 + ROWS * RH + 20, "text-anchor": "middle", class: "svg-label-soft", text: `column ${j + 1}` }));

      // block outlines
      const dash = "fill:none;stroke:var(--gold);stroke-width:4;stroke-dasharray:10 6;";
      if (mode === "rows") {
        for (let i = 0; i < ROWS; i++) svg.appendChild(el("rect", { x: X0 + 3, y: Y0 + i * RH + 3, width: CW * COLS - 6, height: RH - 6, rx: 8, style: dash }));
      } else {
        for (let j = 0; j < COLS; j++) svg.appendChild(el("rect", { x: X0 + j * CW + 4, y: Y0 + 3, width: CW - 8, height: RH * ROWS - 6, rx: 10, style: dash }));
      }
      svg.appendChild(el("text", { x: 400, y: 392, "text-anchor": "middle", class: "svg-hand",
        text: mode === "rows" ? "each dashed block spans wet → dry. useless!" : "each dashed block = one moisture zone. chef's kiss." }));
    }

    function render() {
      const plots = simulate(state), a = analyze(plots, state.mode);
      draw(plots, state.mode);
      let html;
      if (state.mode === "rows") {
        html =
          verdict({ kind: "fake", label: "“RCBD” with row blocks", spec: `yield ~ treatment + row · df = ${a.wrong.df} · MSE = ${a.wrong.mse.toFixed(3)}`, est: a.wrong.est, unit: "t/ha (NanoKelp)", p: a.wrong.p, trueEffect: state.e, seed: state.seed }) +
          verdict({ kind: "honest", label: "Rescue: row + column blocks", spec: `yield ~ treatment + row + column · df = ${a.rescue.df} · MSE = ${a.rescue.mse.toFixed(3)}`, est: a.rescue.est, unit: "t/ha", p: a.rescue.p, trueEffect: state.e, seed: state.seed + 1 });
      } else {
        html = verdict({ kind: "honest", label: "RCBD with column blocks", spec: `yield ~ treatment + column · df = ${a.right.df} · MSE = ${a.right.mse.toFixed(3)}`, est: a.right.est, unit: "t/ha (NanoKelp)", p: a.right.p, trueEffect: state.e, seed: state.seed });
        html += `<p class="stat-chip">Look at that <code>MSE</code>: the moisture cliff now lives in the blocks, not in your error term.</p>`;
      }
      if (state.fished) html += `<p class="stat-chip">👀 Confession: this field was found by fishing through <b>${state.fished}</b> seeds for p &lt; 0.01. The original notebook's <code>seed=11</code>? Same trick.</p>`;
      $("#c2results").innerHTML = html;
    }

    function fish() {
      if (state.mode !== "rows") {
        state.mode = "rows";
        $('input[name="c2mode"][value="rows"]').checked = true;
      }
      const res = fishForSeed(newSeed(), (seed) => analyze(simulate({ ...state, seed }), "rows").wrong.p < 0.01);
      if (!res) { toast("5000 tries and nothing. Even the dark arts have limits."); return; }
      state.seed = res.seed;
      state.fished = res.tries;
      unlock("fisher");
      toast(`😈 Found a “significant” field after ${res.tries} re-rolls. That's not science, that's a slot machine.`);
      render();
    }

    function universes() {
      let wrong = 0, rescue = 0, right = 0;
      for (let u = 0; u < UNIVERSES; u++) {
        const seed = 20_000 + u;
        const a = analyze(simulate({ ...state, mode: "rows", seed }), "rows");
        const b = analyze(simulate({ ...state, mode: "cols", seed }), "cols");
        wrong += a.wrong.p < 0.05; rescue += a.rescue.p < 0.05; right += b.right.p < 0.05;
      }
      return mcPanel([
        ["↔️ Row blocks", wrong / UNIVERSES, state.e === 0 ? "honest" : "fake"],
        ["↔️ + column fix", rescue / UNIVERSES, "honest"],
        ["↕️ Column blocks", right / UNIVERSES, "honest"],
      ], state.e, state.e === 0
        ? "Plot twist: with true randomization inside rows, the wrong blocks are <em>valid</em> (~5%). Their crime is wasted power and fragility: one fished seed and you've got a headline. Slide the NanoKelp effect up and rerun to see the power gap."
        : "Same field, same plots, same money. The row blocks leave the moisture cliff in the error term, so they miss real effects far more often.");
    }

    function init() {
      const sec = $("#case-02");
      $$('input[name="c2mode"]', sec).forEach((r) => r.addEventListener("change", () => {
        state.mode = r.value; state.fished = 0;
        if (r.value === "cols") unlock("perpendicular");
        render();
      }));
      const g = $("#c2g"), e = $("#c2e");
      g.addEventListener("input", () => { state.g = +g.value; state.fished = 0; $("#c2gOut").textContent = state.g.toFixed(2); render(); });
      e.addEventListener("input", () => { state.e = +e.value; state.fished = 0; $("#c2eOut").textContent = state.e.toFixed(2); render(); });
      $('[data-action="reroll"]', sec).addEventListener("click", () => { state.seed = newSeed(); state.fished = 0; render(); });
      $('[data-action="rig"]', sec).addEventListener("click", fish);
      $('[data-action="universes"]', sec).addEventListener("click", (ev) => runUniverses(ev.currentTarget, $("#c2mc"), universes));

      // Open on a fished field, exactly like the original notebook did.
      const res = fishForSeed(1, (seed) => analyze(simulate({ ...state, seed }), "rows").wrong.p < 0.01);
      if (res) { state.seed = res.seed; state.fished = res.tries; }
      render();
    }
    return { init };
  })();

  /* ======================================================================
   * CASE 03 — The Pseudoreplication Delusion
   * ==================================================================== */
  const case3 = (() => {
    const LEAF_SD = 1.5;
    const state = { k: 2, L: 25, s: 3, seed: 2 };

    function simulate({ k, L, s, seed }) {
      const r = S.rng(seed);
      const plants = [];
      for (const trt of ["Control", "Fertilized"]) {
        for (let j = 0; j < k; j++) {
          const plantEffect = r.normal(0, s);
          const leaves = Array.from({ length: L }, () => 25 + plantEffect + r.normal(0, LEAF_SD));
          plants.push({ trt, id: `${trt[0]}${j + 1}`, leaves, mean: S.mean(leaves) });
        }
      }
      return plants;
    }

    function analyze(plants) {
      const leavesOf = (t) => plants.filter((p) => p.trt === t).flatMap((p) => p.leaves);
      const meansOf = (t) => plants.filter((p) => p.trt === t).map((p) => p.mean);
      const naive = S.tTest(leavesOf("Control"), leavesOf("Fertilized"));
      const proper = S.tTest(meansOf("Control"), meansOf("Fertilized"));
      return { naive, proper };
    }

    function draw(plants, L) {
      const svg = $("#plants");
      clear(svg);
      const n = plants.length, w = 800 / n, MAXL = 24, shown = Math.min(L, MAXL);
      const base = clamp(w * 0.2, 7, 22);
      svg.appendChild(el("line", { x1: 400, x2: 400, y1: 8, y2: 312, style: "stroke:var(--ink-soft);stroke-width:2;stroke-dasharray:6 6" }));
      svg.appendChild(el("text", { x: 200, y: 22, "text-anchor": "middle", class: "svg-label", style: "fill:var(--control)", text: "CONTROL" }));
      svg.appendChild(el("text", { x: 600, y: 22, "text-anchor": "middle", class: "svg-label", style: "fill:var(--treated)", text: "FERTILIZED" }));

      plants.forEach((pl, j) => {
        const cx = w * (j + 0.5), color = pl.trt === "Control" ? "var(--control)" : "var(--treated)";
        const g = el("g", { class: "grow", style: `animation-delay:${j * 40}ms` });
        g.appendChild(el("line", { x1: cx, x2: cx, y1: 268, y2: 52, style: "stroke:var(--leaf);stroke-width:3" }));
        for (let i = 0; i < shown; i++) {
          const area = pl.leaves[i];
          const side = i % 2 ? 1 : -1;
          const yy = 262 - (i * 200) / Math.max(shown, 1);
          const sc = Math.sqrt(clamp(area, 2, 60) / 25);
          const rx = base * sc, ry = base * 0.45 * sc;
          const lx = cx + side * rx * 0.9;
          g.appendChild(el("ellipse", {
            cx: lx, cy: yy, rx, ry, transform: `rotate(${side * -25} ${lx} ${yy})`,
            style: "fill:var(--leaf);stroke:var(--line);stroke-width:1;opacity:.92",
          }));
        }
        if (L > MAXL) g.appendChild(el("text", { x: cx, y: 46, "text-anchor": "middle", class: "svg-label-soft", text: `+${L - MAXL}` }));
        g.appendChild(el("title", { text: `Plant ${pl.id}: ${L} leaves, mean ${pl.mean.toFixed(1)} cm²` }));
        svg.appendChild(g);
        const pw = clamp(w * 0.42, 18, 56);
        svg.appendChild(el("path", { d: `M${cx - pw / 2} 268 L${cx + pw / 2} 268 L${cx + pw * 0.38} 300 L${cx - pw * 0.38} 300 Z`, style: `fill:${color};stroke:var(--line);stroke-width:2` }));
        svg.appendChild(el("text", { x: cx, y: 316, "text-anchor": "middle", class: "svg-label-soft", text: n <= 8 ? `${pl.id} · x̄ ${pl.mean.toFixed(1)}` : pl.id }));
      });
    }

    function render() {
      const plants = simulate(state), a = analyze(plants);
      draw(plants, state.L);
      const n = 2 * state.k * state.L;
      const icc = state.s ** 2 / (state.s ** 2 + LEAF_SD ** 2);
      const nEff = n / (1 + (state.L - 1) * icc);
      $("#c3icc").innerHTML = `You think <b>n = ${n}</b>. ICC = ${icc.toFixed(2)}, so effective n ≈ <b>${nEff.toFixed(1)}</b>. Leaves are gossiping siblings, not strangers.`;
      $("#c3results").innerHTML =
        verdict({ kind: "fake", label: `Leaf-level t-test (n = ${n} “replicates”)`, spec: `leaf_area ~ treatment · df = ${a.naive.df}`, est: a.naive.diff, unit: "cm²", p: a.naive.p, trueEffect: 0, seed: state.seed }) +
        verdict({ kind: "honest", label: `Plant-mean t-test (n = ${2 * state.k} plants)`, spec: `mean per plant ~ treatment · df = ${a.proper.df}`, est: a.proper.diff, unit: "cm²", p: a.proper.p, trueEffect: 0, seed: state.seed + 1 });
    }

    function universes() {
      let naive = 0, proper = 0;
      for (let u = 0; u < UNIVERSES; u++) {
        const a = analyze(simulate({ ...state, seed: 30_000 + u }));
        naive += a.naive.p < 0.05; proper += a.proper.p < 0.05;
      }
      return mcPanel([
        ["🍃 Per leaf", naive / UNIVERSES, "fake"],
        ["🪴 Per plant", proper / UNIVERSES, "honest"],
      ], 0, "Crank “leaves per plant” to 50 and rerun: the naive rate gets worse, not better. Crank “real plants” instead: that's how you actually gain power.");
    }

    function init() {
      const sec = $("#case-03");
      const bind = (id, key, out, d) => {
        const inp = $(id);
        inp.addEventListener("input", () => {
          state[key] = +inp.value;
          $(out).textContent = d ? state[key].toFixed(d) : state[key];
          if (key === "k" && state.k >= 6) unlock("morePlants");
          render();
        });
      };
      bind("#c3k", "k", "#c3kOut", 0);
      bind("#c3l", "L", "#c3lOut", 0);
      bind("#c3s", "s", "#c3sOut", 1);
      $('[data-action="reroll"]', sec).addEventListener("click", () => { state.seed = newSeed(); render(); });
      $('[data-action="universes"]', sec).addEventListener("click", (ev) => runUniverses(ev.currentTarget, $("#c3mc"), universes));
      render();
    }
    return { init };
  })();

  /* ======================================================================
   * CASE 04 — Split-Plot Amnesia
   * ==================================================================== */
  const case4 = (() => {
    const B = 5, CV = 5, SUB_SD = 0.22, IRR = ["Rainfed", "Irrigated"];
    const state = { sa: 0.9, e: 0, seed: 123 };

    function simulate({ sa, e, seed }) {
      const r = S.rng(seed);
      const blocks = [];
      for (let b = 0; b < B; b++) {
        const blockEff = r.normal(0, 0.25);
        const order = r.shuffle(IRR);
        const strips = order.map((irr) => {
          const wpEff = r.normal(0, sa);
          const cvOrder = r.shuffle([0, 1, 2, 3, 4]);
          const subs = cvOrder.map((cv) => ({
            cv, y: 4.8 + blockEff + (irr === "Irrigated" ? e : 0) + wpEff + 0.12 * cv + r.normal(0, SUB_SD),
          }));
          return { irr, subs };
        });
        blocks.push(strips);
      }
      return blocks;
    }

    function analyze(blocks) {
      // Naive: flat two-way ANOVA (irrigation × cultivar), subplot residual, df = 40.
      const all = blocks.flatMap((strips) => strips.flatMap((s) => s.subs.map((u) => ({ irr: s.irr, cv: u.cv, y: u.y }))));
      const grand = S.mean(all.map((u) => u.y));
      const irrMean = (irr) => S.mean(all.filter((u) => u.irr === irr).map((u) => u.y));
      const ssIrr = (all.length / 2) * IRR.reduce((acc, irr) => acc + (irrMean(irr) - grand) ** 2, 0);
      let ssWithin = 0;
      for (const irr of IRR) {
        for (let cv = 0; cv < CV; cv++) {
          const ys = all.filter((u) => u.irr === irr && u.cv === cv).map((u) => u.y);
          const m = S.mean(ys);
          ssWithin += S.sum(ys.map((y) => (y - m) ** 2));
        }
      }
      const dfW = all.length - IRR.length * CV;
      const F = ssIrr / (ssWithin / dfW);
      const naive = { est: irrMean("Irrigated") - irrMean("Rainfed"), p: S.fPValue(F, 1, dfW), df: dfW };

      // Proper: compare whole-plot means within blocks — Error(a), df = 4.
      const diffs = blocks.map((strips) => {
        const m = (irr) => S.mean(strips.find((s) => s.irr === irr).subs.map((u) => u.y));
        return m("Irrigated") - m("Rainfed");
      });
      const t = S.tTest1(diffs);
      return { naive, proper: { est: t.diff, p: t.p, df: t.df } };
    }

    function draw(blocks) {
      const svg = $("#strips");
      clear(svg);
      const ys = blocks.flatMap((st) => st.flatMap((s) => s.subs.map((u) => u.y)));
      const lo = Math.min(...ys), hi = Math.max(...ys);
      blocks.forEach((strips, b) => {
        const x0 = 10 + b * 158;
        svg.appendChild(el("text", { x: x0 + 75, y: 18, "text-anchor": "middle", class: "svg-label", text: `Block ${b + 1}` }));
        strips.forEach((s, k) => {
          const x = x0 + k * 76 + 2, wet = s.irr === "Irrigated";
          svg.appendChild(el("rect", { x, y: 28, width: 70, height: 26, rx: 6, style: `fill:var(${wet ? "--water" : "--dry"});stroke:var(--line);stroke-width:2` }));
          svg.appendChild(el("text", { x: x + 35, y: 46, "text-anchor": "middle", class: "svg-label", style: "fill:#1d1b27", text: wet ? "💧 IRR" : "☀️ RAIN" }));
          s.subs.forEach((u, i) => {
            const pct = hi > lo ? ((u.y - lo) / (hi - lo)) * 85 + 10 : 50;
            const y = 60 + i * 52;
            const g = el("g", {}, [
              el("rect", { x, y, width: 70, height: 48, style: `fill:${mix("--leaf", "--paper", pct)};stroke:var(--line);stroke-width:1.2` }),
              el("text", { x: x + 35, y: y + 20, "text-anchor": "middle", class: "svg-label", style: "font-size:11px;fill:#fff;paint-order:stroke;stroke:#1d1b27;stroke-width:3px", text: `V${u.cv + 1}` }),
              el("text", { x: x + 35, y: y + 37, "text-anchor": "middle", class: "svg-label", style: "font-size:12px;fill:#fff;paint-order:stroke;stroke:#1d1b27;stroke-width:3px", text: u.y.toFixed(2) }),
            ]);
            g.appendChild(el("title", { text: `Block ${b + 1}, ${s.irr} strip, cultivar V${u.cv + 1}: ${u.y.toFixed(2)} t/ha` }));
            svg.appendChild(g);
          });
          svg.appendChild(el("rect", { x: x - 1, y: 27, width: 72, height: 294, rx: 6, style: `fill:none;stroke:var(${wet ? "--water" : "--dry"});stroke-width:4` }));
        });
      });
      svg.appendChild(el("text", { x: 400, y: 338, "text-anchor": "middle", class: "svg-hand", text: "10 strips got the hose. not 50. TEN." }));
    }

    function render() {
      const blocks = simulate(state), a = analyze(blocks);
      draw(blocks);
      $("#c4results").innerHTML =
        verdict({ kind: "fake", label: "Flat ANOVA (pretend 50 independent plots)", spec: `yield ~ irrigation × cultivar · Error(b) df = ${a.naive.df}`, est: a.naive.est, unit: "t/ha", p: a.naive.p, trueEffect: state.e, seed: state.seed }) +
        verdict({ kind: "honest", label: "Split-plot: irrigation vs whole-plot error", spec: `strip means ~ irrigation + block · Error(a) df = ${a.proper.df}`, est: a.proper.est, unit: "t/ha", p: a.proper.p, trueEffect: state.e, seed: state.seed + 1 });
    }

    function universes() {
      let naive = 0, proper = 0;
      for (let u = 0; u < UNIVERSES; u++) {
        const a = analyze(simulate({ ...state, seed: 40_000 + u }));
        naive += a.naive.p < 0.05; proper += a.proper.p < 0.05;
      }
      return mcPanel([
        ["🧮 Flat ANOVA", naive / UNIVERSES, state.e === 0 ? "fake" : "honest"],
        ["🌾 Split-plot", proper / UNIVERSES, "honest"],
      ], state.e, "Set σₐ to 0 and both rows converge — the flat ANOVA is only wrong because strips differ from each other. Which, in a real field, they always do.");
    }

    function init() {
      const sec = $("#case-04");
      const a = $("#c4a"), e = $("#c4e");
      a.addEventListener("input", () => {
        state.sa = +a.value; $("#c4aOut").textContent = state.sa.toFixed(2);
        if (state.sa === 0) unlock("errorA");
        render();
      });
      e.addEventListener("input", () => { state.e = +e.value; $("#c4eOut").textContent = state.e.toFixed(2); render(); });
      $('[data-action="reroll"]', sec).addEventListener("click", () => { state.seed = newSeed(); render(); });
      $('[data-action="universes"]', sec).addEventListener("click", (ev) => runUniverses(ev.currentTarget, $("#c4mc"), universes));
      // Open on a season where the blunder shows (it does ~40% of the time; 🌌 proves it).
      const res = fishForSeed(123, (seed) => {
        const a = analyze(simulate({ ...state, seed }));
        return a.naive.p < 0.01 && a.proper.p > 0.05;
      });
      if (res) state.seed = res.seed;
      render();
    }
    return { init };
  })();

  /* ======================================================================
   * BONUS — The Garden of Forking Paths Slot Machine
   * ==================================================================== */
  const slots = (() => {
    const FACTORS = [
      ["Watering with Mozart", "MOZART MAKES TOMATOES 40% MORE CULTURED"],
      ["Pot colour: mauve", "MAUVE POTS: THE SECRET WEAPON OF BIG AGRICULTURE?"],
      ["Intern's star sign", "LEO INTERNS GROW BIGGER BASIL, STUDY FINDS"],
      ["Full-moon planting", "LUNAR GARDENING VINDICATED BY SCIENCE"],
      ["Talking kindly to seeds", "COMPLIMENTS BOOST CROP YIELD, PEER-REVIEWED-ISH"],
      ["Lab coat: freshly ironed", "WRINKLE-FREE SCIENTISTS GET BETTER DATA"],
      ["Tuesday sowing", "NEVER SOW ON A MONDAY, WARN RESEARCHERS"],
      ["Fertilizer brand logo is blue", "BLUE LOGOS LINKED TO LUSHER LAWNS"],
      ["Greenhouse wifi: 5 GHz", "5G MAKES CARROTS CRUNCHIER, CLAIMS PREPRINT"],
      ["PI's coffee: oat milk", "OAT MILK LATTES TRANSFORM LAB OUTCOMES"],
      ["Soil stirred clockwise", "CLOCKWISE STIRRING: AGRONOMY'S NEXT FRONTIER"],
      ["Seeds sorted alphabetically", "ALPHABETICAL SEEDS SPROUT FASTER, OBVIOUSLY"],
      ["Pots facing north", "NORTH-FACING POTS HAVE 'BETTER ENERGY', DATA SHOW"],
      ["Postdoc's playlist: lo-fi", "LO-FI BEATS TO PHOTOSYNTHESIZE TO"],
      ["Harvested before lunch", "HUNGRY SCIENTISTS HARVEST HEAVIER PLANTS"],
      ["Labels in Comic Sans", "COMIC SANS: SERIOUSLY GOOD FOR SEEDLINGS"],
      ["Grant deadline week", "DEADLINE PANIC FERTILIZES CROPS, STUDY SUGGESTS"],
      ["Rain on the weekend", "WEEKEND RAIN SECRETLY RUNS THE ECONOMY"],
      ["Office plant named 'Kevin'", "PLANTS WITH NAMES OUTGROW THE NAMELESS"],
      ["Data entered left-handed", "SOUTHPAW DATA ENTRY: THE MISSING VARIABLE"],
    ];
    let spins = 0, spinsWithHit = 0, busy = false, seedBase = newSeed();

    function render(results, alpha) {
      $("#slotGrid").innerHTML = FACTORS.map(([name], i) => {
        const p = results ? results[i] : null;
        const hit = p !== null && p < alpha;
        return `<div class="slot ${hit ? "hit" : ""}"><span>${name}</span><span class="p">${p === null ? "p = ?.???" : `p = ${S.formatP(p)} ${hit ? "★" : ""}`}</span></div>`;
      }).join("");
    }

    function spin() {
      if (busy) return;
      busy = true;
      const lever = $("#lever");
      lever.disabled = true;
      const bonf = $("#bonferroni").checked;
      const alpha = bonf ? 0.05 / FACTORS.length : 0.05;
      const r = S.rng(seedBase + spins * 7919);
      const results = FACTORS.map(() => {
        const a = Array.from({ length: 12 }, () => r.normal());
        const b = Array.from({ length: 12 }, () => r.normal());
        return S.tTest(a, b).p;
      });
      $$(".slot").forEach((s) => s.classList.add("spinning"));
      let ticks = 0;
      const flicker = setInterval(() => {
        $$(".slot .p").forEach((p) => { p.textContent = `p = ${Math.random().toFixed(4)}`; });
        if (++ticks > 9) {
          clearInterval(flicker);
          render(results, alpha);
          spins++;
          const hits = results.map((p, i) => [p, i]).filter(([p]) => p < alpha).sort((x, y) => x[0] - y[0]);
          if (hits.length) spinsWithHit++;
          const hl = $("#headline");
          if (hits.length) {
            const [p, i] = hits[0];
            hl.innerHTML = `<span class="paper">THE DAILY PREPRINT</span><p>${FACTORS[i][1]}</p><small>(p = ${S.formatP(p)}; ${hits.length} of 20 tests “worked”; the other ${20 - hits.length} quietly moved to the file drawer)</small>`;
          } else {
            hl.innerHTML = `<span class="paper">THE DAILY PREPRINT</span><p>NOTHING HAPPENED. EDITORS: “NOT NEWSWORTHY.”</p><small>${bonf ? "Bonferroni strikes again. Honest, and unpublishable." : "Spin again. Statistically, you'll get one soon."}</small>`;
          }
          $("#spins").textContent = spins;
          $("#discoveries").textContent = `${spinsWithHit} (${((100 * spinsWithHit) / spins).toFixed(0)}%)`;
          if (spins >= 5) unlock("gambler");
          if (bonf) unlock("pooper");
          busy = false;
          lever.disabled = false;
        }
      }, 70);
    }

    function init() {
      render(null, 0.05);
      $("#lever").addEventListener("click", spin);
      $("#bonferroni").addEventListener("change", () => {
        spins = 0; spinsWithHit = 0;
        $("#spins").textContent = "0";
        $("#discoveries").textContent = "—";
        toast($("#bonferroni").checked ? "🧊 α is now 0.0025. The fun police have arrived." : "🎉 α back to 0.05. Let the false discoveries flow.");
      });
    }
    return { init };
  })();

  /* ======================================================================
   * QUIZ — Spot the Blunder
   * ==================================================================== */
  const quiz = (() => {
    const QS = [
      {
        q: "Dana puts the 12 fertilized pots on the left bench (near the window) and the 12 controls on the right “to keep things tidy.” What's the blunder?",
        opts: ["Too few pots", "Treatment is confounded with position/light", "She should've used a Welch t-test", "Benches should be alphabetized"],
        a: 1,
        yes: "Exactly. Tidy for Dana, messy for causality. Randomize pot positions.",
        no: "Nope. The window is doing the fertilizing. Treatment and light are welded together.",
      },
      {
        q: "Raj measures 30 leaves from each of 3 plants per treatment and reports n = 90 per group. What should n be?",
        opts: ["90", "30", "3", "√90 ≈ 9.5"],
        a: 2,
        yes: "Yes! The plant is the experimental unit. Leaves are subsamples.",
        no: "Leaves aren't independent; the plant got the treatment. n = 3 per group.",
      },
      {
        q: "A field slopes from wet (south) to dry (north). Which way should blocks run?",
        opts: ["North–south, along the slope", "East–west, across the slope", "Diagonally, for flair", "Blocks are a myth"],
        a: 1,
        yes: "Correct. Each block should sit in one moisture band, so blocks soak up the gradient.",
        no: "Blocks along the slope each contain the whole gradient and absorb nothing. Run them across it.",
      },
      {
        q: "Tillage is applied to 8 big strips; 4 seed rates are sown in subplots within each strip. What's the error term for testing tillage?",
        opts: ["Subplot residual (lots of df!)", "Whole-plot (strip) error", "The standard error of the mean of my hopes", "Whatever gives p < 0.05"],
        a: 1,
        yes: "Right. Tillage was randomized to strips, so strips are its replicates: Error(a).",
        no: "Tillage only has 8 experimental units. Testing it against subplot error is split-plot amnesia.",
      },
      {
        q: "Sam tests 20 soil additives on noise-level data at α = 0.05 and finds one “significant.” What's the most likely explanation?",
        opts: ["A breakthrough!", "Chance: ~64% of such studies find at least one", "The other 19 were sabotaged", "Mercury was in retrograde"],
        a: 1,
        yes: "Bingo. 1 − 0.95²⁰ ≈ 64%. Correct for multiple comparisons, or pre-register.",
        no: "With 20 tests, a false positive is the expected outcome, not a discovery. Go spin the slot machine above.",
      },
      {
        q: "Your effect isn't significant. Your PI suggests “just run a few more reps until it is.” What is this?",
        opts: ["Optional stopping, inflates false positives", "Good practice, more data is always better", "Bayesian statistics", "Grit"],
        a: 0,
        yes: "Yes. Peeking and stopping when p < 0.05 breaks the guarantee. Fix n in advance (or use sequential methods properly).",
        no: "More data is great when n is fixed in advance. Stopping as soon as p dips below 0.05 is optional stopping, a classic p-hack.",
      },
    ];
    let i = 0, score = 0, results = [];

    function progress() {
      return `<div class="quiz-progress" aria-hidden="true">${QS.map((_, k) =>
        `<i class="${k < results.length ? (results[k] ? "done-good" : "done-bad") : k === i ? "now" : ""}"></i>`).join("")}</div>`;
    }

    function show() {
      const card = $("#quizCard");
      if (i >= QS.length) {
        const ranks = [
          [6, "🏆", "Reviewer #2 fears you. Statisticians nod at you in hallways."],
          [5, "🎓", "Nearly flawless. You may now judge others' bar charts."],
          [3, "🧪", "Respectable. Some p-values still fool you after midnight."],
          [0, "🐣", "Everyone starts somewhere. Scroll up and commit more crimes; it's educational."],
        ];
        const [, em, msg] = ranks.find(([min]) => score >= min);
        card.innerHTML = `${progress()}<div class="quiz-final"><p class="big">${em} ${score}/${QS.length}</p><p>${msg}</p>
          <button class="btn btn-primary" id="quizAgain" type="button">↻ Retake (results may vary, unlike your p-values)</button></div>`;
        $("#quizAgain").addEventListener("click", () => { i = 0; score = 0; results = []; show(); });
        if (score >= 5) unlock("scholar");
        return;
      }
      const Q = QS[i];
      card.innerHTML = `${progress()}<p class="muted small">Question ${i + 1} of ${QS.length}</p>
        <p class="quiz-q">${Q.q}</p>
        <div class="quiz-opts">${Q.opts.map((o, k) => `<button class="btn" data-k="${k}" type="button">${String.fromCharCode(65 + k)}. ${o}</button>`).join("")}</div>
        <p class="quiz-feedback" id="quizFb"></p>`;
      $$(".quiz-opts button", card).forEach((b) => b.addEventListener("click", () => {
        const k = +b.dataset.k, ok = k === Q.a;
        $$(".quiz-opts button", card).forEach((x) => { x.disabled = true; });
        b.classList.add(ok ? "right" : "wrong");
        if (!ok) $(`.quiz-opts button[data-k="${Q.a}"]`, card).classList.add("right");
        if (ok) score++;
        results.push(ok);
        $("#quizFb").textContent = (ok ? "✅ " : "❌ ") + (ok ? Q.yes : Q.no);
        const next = document.createElement("button");
        next.className = "btn btn-primary";
        next.type = "button";
        next.textContent = i + 1 < QS.length ? "Next crime →" : "See my verdict →";
        next.addEventListener("click", () => { i++; show(); });
        card.appendChild(next);
        next.focus();
      }));
    }
    return { init: show };
  })();

  /* ======================================================================
   * CHEAT SHEET — copy-paste redemption
   * ==================================================================== */
  const cheats = (() => {
    const SNIPPETS = [
      ["01 · Randomize, then adjust", `import numpy as np
import statsmodels.formula.api as smf

rng = np.random.default_rng(2024)
# Randomize BEFORE anyone touches a spray bottle
df["treatment"] = rng.permutation(["Control"] * 20 + ["BioBoost-X"] * 20)

# Adjust for the known gradient (ANCOVA)
fit = smf.ols("biomass_g ~ C(treatment) + bench_pos", data=df).fit()
print(fit.summary().tables[1])`],
      ["02 · Block across the gradient", `import statsmodels.formula.api as smf
from statsmodels.stats.anova import anova_lm

# Blocks should be homogeneous inside: one moisture band each
fit = smf.ols("yield_t_ha ~ C(treatment) + C(col_pos)", data=df).fit()
print(anova_lm(fit, typ=2))

# Already blocked by rows? Rescue with both directions
rescue = smf.ols("yield_t_ha ~ C(treatment) + C(row_block) + C(col_pos)", data=df).fit()`],
      ["03 · Respect the experimental unit", `import statsmodels.formula.api as smf

# Option A: average to the unit that got the treatment
plant_means = df.groupby(["plant_id", "treatment"], as_index=False)["leaf_area_cm2"].mean()
smf.ols("leaf_area_cm2 ~ C(treatment)", data=plant_means).fit()

# Option B: mixed model, random intercept per plant
mixed = smf.mixedlm("leaf_area_cm2 ~ C(treatment)", df, groups=df["plant_id"]).fit()
print(mixed.summary())`],
      ["04 · Split-plot, two error strata", `import statsmodels.formula.api as smf

# Whole plot (strip) gets a random intercept => irrigation tested vs Error(a)
fit = smf.mixedlm(
    "yield_t_ha ~ C(irrigation) * C(cultivar) + C(block)",
    df,
    groups=df["whole_plot_id"],
).fit(reml=True)
print(fit.summary())`],
      ["Bonus · Survive 20 hypotheses", `from statsmodels.stats.multitest import multipletests

pvals = [...]  # the 20 tests you swore you'd never run
reject, p_adj, _, _ = multipletests(pvals, alpha=0.05, method="holm")

# Even better: pre-register ONE primary hypothesis
# and call everything else "exploratory" (and mean it)`],
    ];

    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // A ten-line syntax highlighter. Don't tell the VS Code team.
    const highlight = (code) => esc(code).replace(
      /(#.*$)|("[^"\n]*"|'[^'\n]*')|\b(import|from|as|def|return|for|in|if|else|True|False|None)\b|\b([A-Za-z_]\w*)(?=\()/gm,
      (m, c, s, k, f) => c ? `<span class="tok-c">${c}</span>` : s ? `<span class="tok-s">${s}</span>` : k ? `<span class="tok-k">${k}</span>` : `<span class="tok-f">${f}</span>`
    );

    function copy(text) {
      if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
      return Promise.resolve();
    }

    function init() {
      const grid = $("#cheatGrid");
      grid.innerHTML = SNIPPETS.map(([title, code], k) => `
        <article class="panel cheat">
          <header><h3>${title}</h3><button class="btn copy" data-k="${k}" type="button">📋 Copy</button></header>
          <pre><code>${highlight(code)}</code></pre>
        </article>`).join("");
      $$(".copy", grid).forEach((b) => b.addEventListener("click", () => {
        copy(SNIPPETS[+b.dataset.k][1]).then(() => {
          b.textContent = "✅ Copied";
          toast("Copied. Go forth and analyse responsibly.");
          setTimeout(() => { b.textContent = "📋 Copy"; }, 1600);
        }).catch(() => toast("Clipboard said no. Select the code and copy by hand, like our ancestors."));
      }));
    }
    return { init };
  })();

  /* ======================================================================
   * EXCUSE-O-MATIC
   * ==================================================================== */
  const EXCUSE_A = ["We respectfully note that", "With all due respect,", "As is well established in the field,", "In our defence,", "Following long-standing lab tradition,"];
  const EXCUSE_B = ["the leaves were extremely independent-minded", "the sunny door was part of the treatment", "the split-plot was split emotionally, not physically", "randomization was performed in spirit", "the blocks were blocked in a vibes-based manner", "n = 100 felt more honest than n = 4", "p = 0.051 is basically 0.05 if you squint", "we only peeked at the p-value a normal amount", "the other 19 outcomes were measured recreationally"];
  const EXCUSE_C = ["and is beyond the scope of this study.", "and will be addressed in future work (never).", "which our software did not warn us about.", "as our reviewer on the previous journal agreed.", "and the effect size is, frankly, vibrant."];
  function makeExcuse() {
    const pickR = (arr) => arr[Math.floor(Math.random() * arr.length)];
    return `“${pickR(EXCUSE_A)} ${pickR(EXCUSE_B)}, ${pickR(EXCUSE_C)}”`;
  }

  const excuses = (() => {
    let n = 0;
    function init() {
      $("#excuseBtn").addEventListener("click", () => {
        $("#excuse").textContent = makeExcuse();
        if (++n >= 5) unlock("excuses");
      });
    }
    return { init };
  })();

  /* ======================================================================
   * Theme toggle + boot
   * ==================================================================== */
  function initTheme() {
    const btn = $("#themeToggle");
    const saved = store.get("crimelab.theme", null);
    if (saved) document.documentElement.dataset.theme = saved;
    const isDark = () => (document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches);
    const sync = () => { btn.textContent = isDark() ? "☀️" : "🌙"; };
    btn.addEventListener("click", () => {
      const next = isDark() ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      store.set("crimelab.theme", next);
      sync();
      toast(next === "dark" ? "🌙 Lab lights off. The p-values glow in the dark." : "☀️ Lights on. Careful: the sunny door is back.");
    });
    sync();
  }

  // Shared helpers for game.js (defined now, so they exist before boot runs).
  window.CrimeLab = { toast, confetti, unlock, excuse: makeExcuse };

  function boot() {
    initTheme();
    renderBadges();
    [case1, case2, case3, case4, slots, quiz, cheats, excuses].forEach((m) => {
      try { m.init(); } catch (err) { console.error(err); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
