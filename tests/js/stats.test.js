/*
 * Sanity checks for the Crime Lab's browser stats engine (docs/js/stats.js).
 * Reference values come from scipy.stats / statsmodels.
 *
 *   node tests/js/stats.test.js
 *
 * No test framework needed. If it prints a pile of ✅ you may go home early.
 */
"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const S = require(path.join(__dirname, "..", "..", "docs", "js", "stats.js"));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}
const close = (a, b, rel = 1e-9) =>
  assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)) || Math.abs(a / b - 1) < rel,
    `expected ${b}, got ${a}`);

check("t-distribution tails match scipy", () => {
  close(S.tPValue(2.024, 38), 0.050042419702140586);
  close(S.tPValue(0.5, 4), 0.6433299631818633);
  close(S.tPValue(10, 98), 1.210253752662219e-16);
  close(S.tPValue(3.3, 2), 0.08084769380366799);
  close(S.tPValue(-3.3, 2), 0.08084769380366799);
});

check("F-distribution tails match scipy", () => {
  close(S.fPValue(4.1, 1, 40), 0.04959413647263533);
  close(S.fPValue(12.5, 3, 21), 6.605685441720166e-5);
  close(S.fPValue(0.7, 1, 4), 0.4498551702745391);
  close(S.fPValue(55, 3, 18), 2.8992703491732534e-9);
});

check("OLS ANCOVA matches statsmodels on Module 01 data", () => {
  // biomass_g from src.simulate_blunders.simulate_lazy_randomization()
  const y = [55.53, 54.42, 50.49, 52.45, 51.58, 51.31, 52.59, 50.23, 50.95, 48.69,
    48.76, 49.17, 42.77, 45.4, 44.43, 43.41, 43.88, 48.29, 41.13, 45.71, 37.74, 40.96,
    41.81, 42.44, 42.24, 41.92, 38.17, 37.31, 40.45, 36.96, 33.38, 33.23, 33.28, 36.69,
    35.15, 36.13, 32.45, 33.54, 34.3, 31.13];
  const pos = y.map((_, i) => i + 1);
  const treated = pos.map((p) => (p <= 20 ? 1 : 0));
  const fit = S.ols(S.design(40, [treated, pos]), y);
  close(fit.beta[1], 0.4809887218045281, 1e-8);
  close(fit.beta[2], -0.5557255639097717, 1e-8);
  close(fit.p[1], 0.7161457518006094, 1e-7);
  close(fit.rss, 159.09627483082713, 1e-8);
  assert.equal(fit.df, 37);

  const naive = S.ols(S.design(40, [treated]), y);
  assert.ok(naive.p[1] < 1e-10, "naive model should be wildly 'significant'");
});

check("nested F equals squared t for a single coefficient", () => {
  const r = S.rng(7);
  const x = Array.from({ length: 30 }, () => r.normal());
  const y = x.map((v) => 0.3 * v + r.normal());
  const full = S.ols(S.design(30, [x]), y);
  const reduced = S.ols(S.design(30, []), y);
  const f = S.nestedF(full, reduced);
  close(f.F, full.t[1] ** 2, 1e-9);
  close(f.p, full.p[1], 1e-9);
});

check("seeded RNG is reproducible and roughly standard normal", () => {
  const a = S.rng(42), b = S.rng(42);
  const xs = Array.from({ length: 20000 }, () => a.normal());
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, () => b.normal()));
  assert.ok(Math.abs(S.mean(xs)) < 0.03);
  assert.ok(Math.abs(S.variance(xs) - 1) < 0.05);
});

check("under the null, p < 0.05 about 5% of the time", () => {
  const r = S.rng(2026);
  let hits = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) {
    const a = Array.from({ length: 10 }, () => r.normal());
    const b = Array.from({ length: 10 }, () => r.normal());
    if (S.tTest(a, b).p < 0.05) hits++;
  }
  const rate = hits / N;
  assert.ok(rate > 0.035 && rate < 0.065, `false-positive rate ${rate}`);
});

console.log(`\n🧪 ${passed} checks passed. The p-values are honest. The scientists, less so.`);
