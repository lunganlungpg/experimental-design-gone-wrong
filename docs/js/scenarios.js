/* ==========================================================================
 * scenarios.js — the case files for "Peer Review Panic".
 *
 * Each generator invents one fake-but-plausible study from a seed, runs the
 * analysis the authors ran (usually wrong), and also runs the honest one.
 * Every number is simulated and computed live; nothing is canned.
 *
 * Works in the browser (window.Scenarios) and in Node (for tests).
 * ========================================================================== */
(function (root) {
  "use strict";
  const S = typeof module !== "undefined" && module.exports ? require("./stats.js") : root.Stats;

  /* The answer options, in the order they appear as buttons (keys 1–7). */
  const TYPES = [
    { id: "confound", label: "Confounded layout", icon: "🌞" },
    { id: "pseudo", label: "Pseudoreplication", icon: "🍃" },
    { id: "splitplot", label: "Wrong error term (split-plot)", icon: "💧" },
    { id: "forking", label: "Fishing through many tests", icon: "🎰" },
    { id: "peeking", label: "Peeking until p < 0.05", icon: "👀" },
    { id: "rtm", label: "No control group (regression to the mean)", icon: "📉" },
    { id: "legit", label: "Legit. Publish it!", icon: "✅" },
  ];

  /* ---------------- Flavour text ---------------- */
  const AUTHORS = [
    "Dr. Bea Value", "Prof. Al Pha", "Dr. Ty Ptest", "Dr. Cy Nificance", "Prof. Reg Ression",
    "Dr. Kay Squared", "Dr. Sam Plelsize", "Prof. Ann Ova", "Dr. Stan Darderror", "Dr. Paige Hacker",
    "Prof. Moe Delfit", "Dr. Barb Plot", "Dr. Kai Square", "Prof. Norma Distribution", "Dr. Hugo First",
  ];
  const PRODUCTS = [
    "GroBoost™ Ultra", "KelpCoin", "Mycorrhiza Max", "QuantumCompost", "Basil Whisperer 3000",
    "PhotonFoam", "NanoKelp Pro", "Rootz Extreme", "BioGlitter", "Chlorophyll Plus+", "WormJuice Gold",
  ];
  const CROPS = ["basil", "tomatoes", "lettuce", "wheat", "chillies", "strawberries", "kale", "rice"];
  const WARM = ["sunny south window", "brand-new grow lights", "radiator", "heat mat"];
  const COLD = ["drafty door", "air-con vent", "reagent fridge", "broken skylight"];
  const TRAITS = [
    "plant height", "leaf count", "root mass", "chlorophyll", "stem girth", "flower count",
    "fruit weight", "leaf area", "shoot mass", "germination time", "leaf colour score",
    "aroma intensity", "Brix", "node count", "petiole length", "seed weight", "wilting score",
    "insect visits", "photogenicity", "vibes (5-point scale)",
  ];
  const PRESS = [
    "Journal of Surprising Results", "Proceedings of Things That Worked Once",
    "Annals of p = 0.049", "Nature-ish", "The Lancet (Garden Edition)", "Science(ish)",
  ];

  /* ---------------- Small helpers ---------------- */
  const pick = (r, arr) => arr[Math.floor(r.uniform() * arr.length)];
  const draw = (r, n, mu, sd) => Array.from({ length: n }, () => r.normal(mu, sd));
  const sem = (xs) => Math.sqrt(S.variance(xs) / xs.length);
  const pct = (a, b) => Math.round((100 * (b - a)) / Math.abs(a));
  const tStr = (t, df, p) => `t(${df}) = ${Math.abs(t).toFixed(2)}, p = ${S.formatP(p)} ${S.stars(p)}`;
  const fStr = (F, d1, d2, p) => `F(${d1}, ${d2}) = ${F.toFixed(2)}, p = ${S.formatP(p)} ${S.stars(p)}`;

  /** Retry with sub-seeds until a predicate holds. This is how the authors work too. */
  function attempt(seed, make, ok, max = 400) {
    let last;
    for (let i = 0; i < max; i++) {
      last = make(S.rng((seed * 7919 + i * 104729) >>> 0));
      if (ok(last)) return last;
    }
    return last;
  }

  function base(r) {
    return {
      author: pick(r, AUTHORS),
      product: pick(r, PRODUCTS),
      crop: pick(r, CROPS),
      journal: pick(r, PRESS),
    };
  }

  /* Figure descriptions, drawn later by the game as SVG. */
  const bars = (labels, groups) => ({
    kind: "bars",
    bars: groups.map((g, i) => ({ label: labels[i], mean: S.mean(g), se: sem(g) })),
  });

  /* ---------------- Generators ---------------- */

  function confound(seed) {
    return attempt(seed, (r) => {
      const b = base(r), n = 12, warm = pick(r, WARM), cold = pick(r, COLD);
      const pos = Array.from({ length: 2 * n }, (_, i) => i + 1);
      const treated = pos.map((p) => (p <= n ? 1 : 0));
      const y = pos.map((p) => 40 - 0.6 * p + r.normal(0, 2.5));
      const T = y.filter((_, i) => treated[i]), C = y.filter((_, i) => !treated[i]);
      const naive = S.tTest(C, T);
      const honest = S.ols(S.design(2 * n, [treated, pos]), y);
      return {
        type: "confound", ...b,
        headline: `${b.product} grows ${b.crop} ${pct(S.mean(C), S.mean(T))}% bigger!`,
        methods: `${n} pots got ${b.product}, ${n} got tap water. To save walking, all the ${b.product} pots went on the bench by the <b>${warm}</b>; the controls went at the far end, next to the <b>${cold}</b>. Fresh weight was recorded after 4 weeks.`,
        stats: tStr(naive.t, naive.df, naive.p),
        figure: bars(["Control", b.product], [C, T]),
        unit: "g",
        naiveP: naive.p,
        honestP: honest.p[1],
        honestLabel: "ANCOVA adjusting for bench position",
        truth: `The ${b.product} pots also got the ${warm}. Treatment and position are welded together, so the t-test hands the sun's credit to the product.`,
      };
    }, (s) => s.naiveP < 0.01 && s.honestP > 0.05);
  }

  function pseudo(seed) {
    return attempt(seed, (r) => {
      const b = base(r), k = 2 + Math.floor(r.uniform() * 2), L = 20 + 5 * Math.floor(r.uniform() * 5);
      const plants = (shift) => Array.from({ length: k }, () => {
        const pe = r.normal(0, 3);
        return draw(r, L, 25 + shift + pe, 1.5);
      });
      const C = plants(0), T = plants(0);
      const naive = S.tTest(C.flat(), T.flat());
      const honest = S.tTest(C.map(S.mean), T.map(S.mean));
      return {
        type: "pseudo", ...b,
        headline: `${b.product} enlarges ${b.crop} leaves by ${Math.abs(pct(S.mean(C.flat()), S.mean(T.flat())))}%!`,
        methods: `${2 * k} plants were randomly assigned to ${b.product} or control (${k} each). We then measured <b>${L} leaves per plant</b>, giving a robust <b>n = ${k * L} per group</b>.`,
        stats: tStr(naive.t, naive.df, naive.p),
        figure: bars(["Control", b.product], [C.flat(), T.flat()]),
        unit: "cm²",
        naiveP: naive.p,
        honestP: honest.p,
        honestLabel: `t-test on plant means (n = ${k} plants per group)`,
        truth: `Leaves on one plant share its genes, roots and windowsill. The plant got the treatment, so there are only ${k} replicates per group, not ${k * L}.`,
      };
    }, (s) => s.naiveP < 0.01 && s.honestP > 0.05);
  }

  function splitplot(seed) {
    return attempt(seed, (r) => {
      const b = base(r), B = 4 + Math.floor(r.uniform() * 3), CV = 4;
      const rows = [];
      const diffs = [];
      for (let k = 0; k < B; k++) {
        const blk = r.normal(0, 0.25), m = {};
        for (const irr of ["Rainfed", "Irrigated"]) {
          const wp = r.normal(0, 0.9);
          const ys = Array.from({ length: CV }, (_, c) => 4.8 + blk + wp + 0.12 * c + r.normal(0, 0.22));
          ys.forEach((y, c) => rows.push({ irr, c, y }));
          m[irr] = S.mean(ys);
        }
        diffs.push(m.Irrigated - m.Rainfed);
      }
      // Naive: two-way ANOVA (irrigation × cultivar) with the subplot residual.
      const grand = S.mean(rows.map((u) => u.y));
      const irrMean = (i) => S.mean(rows.filter((u) => u.irr === i).map((u) => u.y));
      const ssIrr = (rows.length / 2) * ["Rainfed", "Irrigated"].reduce((a, i) => a + (irrMean(i) - grand) ** 2, 0);
      let ssW = 0;
      for (const irr of ["Rainfed", "Irrigated"]) for (let c = 0; c < CV; c++) {
        const ys = rows.filter((u) => u.irr === irr && u.c === c).map((u) => u.y);
        const m = S.mean(ys);
        ssW += S.sum(ys.map((y) => (y - m) ** 2));
      }
      const dfW = rows.length - 2 * CV;
      const F = ssIrr / (ssW / dfW);
      const honest = S.tTest1(diffs);
      const Rn = rows.filter((u) => u.irr === "Rainfed").map((u) => u.y);
      const Ir = rows.filter((u) => u.irr === "Irrigated").map((u) => u.y);
      return {
        type: "splitplot", ...b,
        headline: `Drip irrigation lifts the yield of ${b.crop} by ${Math.abs(pct(S.mean(Rn), S.mean(Ir)))}%!`,
        methods: `In each of ${B} field blocks, one long strip was irrigated and one left rainfed (strips randomized). Each strip was split into ${CV} cultivar subplots. We ran a two-way ANOVA (irrigation × cultivar) on all <b>${rows.length} subplot yields</b>.`,
        stats: fStr(F, 1, dfW, S.fPValue(F, 1, dfW)),
        figure: bars(["Rainfed", "Irrigated"], [Rn, Ir]),
        unit: "t/ha",
        naiveP: S.fPValue(F, 1, dfW),
        honestP: honest.p,
        honestLabel: `irrigation vs whole-plot error (df = ${B - 1})`,
        truth: `Irrigation was randomized to ${2 * B} strips, not ${rows.length} subplots. Testing it against subplot noise (df = ${dfW}) instead of strip-to-strip noise (df = ${B - 1}) is split-plot amnesia.`,
      };
    }, (s) => s.naiveP < 0.01 && s.honestP > 0.05);
  }

  function forking(seed) {
    return attempt(seed, (r) => {
      const b = base(r), n = 10;
      const tests = TRAITS.map((trait) => {
        const C = draw(r, n, 50, 10), T = draw(r, n, 50, 10);
        return { trait, C, T, ...S.tTest(C, T) };
      });
      const best = tests.reduce((a, t) => (t.p < a.p ? t : a));
      return {
        type: "forking", ...b,
        headline: `${b.product} significantly improves ${b.crop} ${best.trait}!`,
        methods: `To be thorough, we measured <b>${TRAITS.length} traits</b> on ${n} plants per group (height, root mass, chlorophyll, aroma, “vibes”…). ${b.product} significantly changed <b>${best.trait}</b>. The other traits were not the focus of this paper.`,
        stats: tStr(best.t, best.df, best.p),
        figure: bars(["Control", b.product], [best.C, best.T]),
        unit: "",
        naiveP: best.p,
        honestP: Math.min(1, best.p * TRAITS.length),
        honestLabel: `Bonferroni correction for ${TRAITS.length} tests`,
        truth: `Test ${TRAITS.length} things on pure noise and about 64% of the time at least one comes up p < 0.05. Reporting only the winner is the garden of forking paths.`,
      };
    }, (s) => s.naiveP < 0.05 && s.honestP > 0.05);
  }

  function peeking(seed) {
    return attempt(seed, (r) => {
      const b = base(r), MAX = 40;
      const C = draw(r, 4, 30, 6), T = draw(r, 4, 30, 6);
      const trace = [];
      let stopAt = null;
      while (C.length < MAX) {
        C.push(r.normal(30, 6)); T.push(r.normal(30, 6));
        const p = S.tTest(C, T).p;
        trace.push({ n: C.length, p });
        if (stopAt === null && p < 0.05) stopAt = C.length;
      }
      const n = stopAt || MAX;
      const Cs = C.slice(0, n), Ts = T.slice(0, n);
      const naive = S.tTest(Cs, Ts);
      const full = S.tTest(C, T);
      return {
        type: "peeking", ...b,
        headline: `${b.product} raises the yield of ${b.crop}. Confirmed!`,
        methods: `We added one pair of plants per week and <b>checked the p-value each time</b>. Data collection stopped once the effect reached significance, at <b>n = ${n} per group</b>. Very efficient.`,
        stats: tStr(naive.t, naive.df, naive.p),
        figure: { kind: "trace", trace: trace.filter((t) => t.n <= Math.min(MAX, n + 6)), stopAt: n },
        unit: "",
        naiveP: naive.p,
        honestP: full.p,
        honestLabel: `same experiment with n = ${MAX} fixed in advance`,
        truth: `Every peek is another lottery ticket. Stopping the moment p dips under 0.05 pushes the false-positive rate far above 5%. Fix n in advance.`,
        stopAt: n,
      };
    }, (s) => s.stopAt < 34 && s.naiveP < 0.05 && s.honestP > 0.05);
  }

  function rtm(seed) {
    return attempt(seed, (r) => {
      const b = base(r), POOL = 60, K = 10;
      const pool = () => Array.from({ length: POOL }, () => {
        const q = r.normal(50, 6);
        return { q, m1: q + r.normal(0, 6) };
      }).sort((a, c) => a.m1 - c.m1).slice(0, K).map((p) => ({ ...p, m2: p.q + r.normal(0, 6) }));
      const treated = pool(), control = pool();
      const change = (g) => g.map((p) => p.m2 - p.m1);
      const naive = S.tTest1(change(treated));
      const honest = S.tTest(change(control), change(treated));
      const before = treated.map((p) => p.m1), after = treated.map((p) => p.m2);
      return {
        type: "rtm", ...b,
        headline: `${b.product} rescues sick ${b.crop}: health score up ${pct(S.mean(before), S.mean(after))}%!`,
        methods: `From a tray of ${POOL} seedlings we picked the <b>${K} sickest-looking</b>, gave them ${b.product}, and re-scored them two weeks later. Paired t-test, before vs after.`,
        stats: tStr(naive.t, naive.df, naive.p),
        figure: bars(["Before", "After"], [before, after]),
        unit: "pts",
        naiveP: naive.p,
        honestP: honest.p,
        honestLabel: `vs ${K} equally sick untreated seedlings`,
        truth: `Pick the worst-scoring plants and they'll look better next time anyway: part of their bad score was bad luck. Without an untreated comparison group, the product gets credit for regression to the mean.`,
      };
    }, (s) => s.naiveP < 0.01 && s.honestP > 0.05);
  }

  function legit(seed) {
    const real = seed % 2 === 0;
    return attempt(seed, (r) => {
      const b = base(r), n = 16;
      const C = draw(r, n, 40, 5), T = draw(r, n, real ? 47 : 40, 5);
      const t = S.tTest(C, T);
      return {
        type: "legit", ...b,
        headline: real
          ? `${b.product} increases the yield of ${b.crop} by ${pct(S.mean(C), S.mean(T))}%`
          : `${b.product} does nothing for ${b.crop}. We checked properly.`,
        methods: `${2 * n} pots, ${n} per group. Bench positions were assigned by a <b>random number generator</b>, the person weighing was <b>blinded</b>, and the outcome, analysis and n were <b>pre-registered</b>. One outcome, one test, analysed per pot.`,
        stats: tStr(t.t, t.df, t.p),
        figure: bars(["Control", b.product], [C, T]),
        unit: "g",
        naiveP: t.p,
        honestP: t.p,
        honestLabel: "the same pre-registered test",
        truth: real
          ? "Randomized, blinded, pre-registered, one outcome, right unit. Sometimes a result is just… real."
          : "Randomized, blinded, pre-registered, and they published a null result. That's not a crime; that's heroism.",
      };
    }, (s) => (real ? s.naiveP < 0.01 : s.naiveP > 0.2));
  }

  const GENERATORS = { confound, pseudo, splitplot, forking, peeking, rtm, legit };

  /** Make one case file of a given type from a seed. */
  function make(type, seed) {
    return GENERATORS[type](seed >>> 0);
  }

  /**
   * A deck of types for one player: every crime appears, plus extra legit
   * studies, shuffled. Long games repeat the deck.
   */
  function deck(rounds, seed) {
    const r = S.rng(seed >>> 0);
    const out = [];
    while (out.length < rounds) {
      out.push(...r.shuffle(["confound", "pseudo", "splitplot", "forking", "peeking", "rtm", "legit", "legit"]));
    }
    return out.slice(0, rounds);
  }

  const api = { TYPES, make, deck, GENERATORS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Scenarios = api;
})(typeof window !== "undefined" ? window : globalThis);
