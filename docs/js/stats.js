/* ==========================================================================
 * stats.js — a tiny, dependency-free stats engine for the Crime Lab.
 *
 * "Why not just import a library?" Because then you'd never read this file,
 * and this file has jokes in it. Also: no build step, works offline,
 * and every formula here is the same one statsmodels uses under the hood.
 *
 * Exposes `Stats` on window (browser) or module.exports (Node, for tests).
 * ========================================================================== */
(function (root) {
  "use strict";

  /* ---------- Seeded randomness (so "random" is reproducible) ---------- */

  // mulberry32: 32-bit seeded PRNG. Tiny, fast, good enough for teaching.
  function rng(seed) {
    let a = seed >>> 0;
    const uniform = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let spare = null;
    // Box–Muller: turns two boring uniforms into one glamorous bell curve.
    const normal = (mu = 0, sd = 1) => {
      if (spare !== null) {
        const s = spare;
        spare = null;
        return mu + sd * s;
      }
      let u = 0;
      while (u === 0) u = uniform();
      const v = uniform();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return mu + sd * r * Math.cos(2 * Math.PI * v);
    };
    // Fisher–Yates: the only shuffle a reviewer will accept.
    const shuffle = (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(uniform() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    return { uniform, normal, shuffle };
  }

  /* ---------- Special functions (the scary-looking bit) ---------- */

  // log Γ(x) via the Lanczos approximation (g = 7, n = 9).
  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  function lgamma(x) {
    if (x < 0.5) {
      return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    }
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  // Continued fraction for the incomplete beta (Numerical Recipes, Lentz).
  function betacf(x, a, b) {
    const MAXIT = 500, EPS = 3e-15, FPMIN = 1e-300;
    const qab = a + b, qap = a + 1, qam = a - 1;
    let c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  // Regularized incomplete beta I_x(a, b). Parent of both t and F tails.
  function ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) return (bt * betacf(x, a, b)) / a;
    return 1 - (bt * betacf(1 - x, b, a)) / b;
  }

  /** Two-sided p-value for a t statistic with `df` degrees of freedom. */
  function tPValue(t, df) {
    if (!isFinite(t)) return 0;
    if (df <= 0) return NaN;
    return ibeta(df / (df + t * t), df / 2, 0.5);
  }

  /** Upper-tail p-value for an F statistic with (d1, d2) degrees of freedom. */
  function fPValue(F, d1, d2) {
    if (!(F > 0)) return 1;
    if (!isFinite(F)) return 0;
    if (d2 <= 0) return NaN;
    return ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2);
  }

  /* ---------- Descriptives ---------- */

  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const mean = (xs) => sum(xs) / xs.length;
  function variance(xs) {
    const m = mean(xs);
    return sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1);
  }

  /** Classic pooled-variance two-sample t-test (what Excel does at 2 a.m.). */
  function tTest(a, b) {
    const df = a.length + b.length - 2;
    const sp2 = ((a.length - 1) * variance(a) + (b.length - 1) * variance(b)) / df;
    const diff = mean(b) - mean(a);
    const se = Math.sqrt(sp2 * (1 / a.length + 1 / b.length));
    const t = diff / se;
    return { diff, se, t, df, p: tPValue(t, df) };
  }

  /** One-sample t-test against 0 (used for paired / blocked differences). */
  function tTest1(d) {
    const df = d.length - 1;
    const m = mean(d);
    const se = Math.sqrt(variance(d) / d.length);
    const t = m / se;
    return { diff: m, se, t, df, p: tPValue(t, df) };
  }

  /* ---------- Ordinary least squares ---------- */

  // Gauss–Jordan inverse of a small symmetric matrix. Returns null if singular.
  function invert(M) {
    const n = M.length;
    const A = M.map((row, i) => [...row, ...row.map((_, j) => (i === j ? 1 : 0))]);
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
      }
      if (Math.abs(A[piv][col]) < 1e-12) return null;
      [A[col], A[piv]] = [A[piv], A[col]];
      const p = A[col][col];
      for (let j = 0; j < 2 * n; j++) A[col][j] /= p;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = A[r][col];
        if (f === 0) continue;
        for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[col][j];
      }
    }
    return A.map((row) => row.slice(n));
  }

  /**
   * Fit y = Xβ + ε. `X` is an array of rows (include your own intercept column).
   * Returns β, standard errors, t, two-sided p, residual sum of squares and df.
   */
  function ols(X, y) {
    const n = X.length, k = X[0].length;
    const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
    const Xty = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const row = X[i];
      for (let a = 0; a < k; a++) {
        Xty[a] += row[a] * y[i];
        for (let b = a; b < k; b++) XtX[a][b] += row[a] * row[b];
      }
    }
    for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
    const inv = invert(XtX);
    if (!inv) throw new Error("Design matrix is singular — two columns are secretly twins.");
    const beta = inv.map((row) => sum(row.map((v, j) => v * Xty[j])));
    let rss = 0;
    for (let i = 0; i < n; i++) {
      const fit = sum(X[i].map((v, j) => v * beta[j]));
      rss += (y[i] - fit) ** 2;
    }
    const df = n - k;
    const s2 = rss / df;
    const se = inv.map((row, j) => Math.sqrt(s2 * row[j]));
    const t = beta.map((b, j) => b / se[j]);
    const p = t.map((tt) => tPValue(tt, df));
    return { beta, se, t, p, rss, df, k, n };
  }

  /** F-test comparing a reduced model nested inside a full one. */
  function nestedF(full, reduced) {
    const d1 = full.k - reduced.k;
    const F = (reduced.rss - full.rss) / d1 / (full.rss / full.df);
    return { F, d1, d2: full.df, p: fPValue(F, d1, full.df) };
  }

  /** Treatment-coded dummy columns: one 0/1 column per non-reference level. */
  function dummies(labels, levels) {
    return levels.slice(1).map((lv) => labels.map((x) => (x === lv ? 1 : 0)));
  }

  /** Build row-major design matrix from an intercept plus a list of columns. */
  function design(n, columns) {
    return Array.from({ length: n }, (_, i) => [1, ...columns.map((c) => c[i])]);
  }

  /* ---------- Cosmetics for scientists ---------- */

  function stars(p) {
    if (!(p >= 0)) return "¯\\_(ツ)_/¯";
    if (p < 0.001) return "***";
    if (p < 0.01) return "**";
    if (p < 0.05) return "*";
    return "n.s.";
  }

  function formatP(p) {
    if (!(p >= 0)) return "NaN";
    if (p < 1e-4) return p.toExponential(2);
    return p.toFixed(4);
  }

  const api = {
    rng, lgamma, ibeta, tPValue, fPValue,
    sum, mean, variance, tTest, tTest1,
    invert, ols, nestedF, dummies, design,
    stars, formatP,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Stats = api;
})(typeof window !== "undefined" ? window : globalThis);
