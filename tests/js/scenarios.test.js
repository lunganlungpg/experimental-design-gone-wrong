/*
 * Checks for the "Peer Review Panic" case generator (docs/js/scenarios.js).
 *
 *   node tests/js/scenarios.test.js
 *
 * Every blunder case must look convincing (authors' p < 0.05) while the honest
 * re-analysis says otherwise (p > 0.05). Legit cases must be internally honest.
 */
"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const SC = require(path.join(__dirname, "..", "..", "docs", "js", "scenarios.js"));

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`✅ ${name}`);
}

const BLUNDERS = ["confound", "pseudo", "splitplot", "forking", "peeking", "rtm"];
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37);

check("answer options cover every generator, legit last", () => {
  const ids = SC.TYPES.map((t) => t.id);
  assert.deepEqual([...ids].sort(), Object.keys(SC.GENERATORS).sort());
  assert.equal(ids[ids.length - 1], "legit");
});

for (const type of BLUNDERS) {
  check(`${type}: fake p < 0.05, honest p > 0.05 on 40 seeds`, () => {
    for (const seed of SEEDS) {
      const c = SC.make(type, seed);
      assert.equal(c.type, type);
      assert.ok(c.naiveP < 0.05, `${type} seed ${seed}: naive p ${c.naiveP}`);
      assert.ok(c.honestP > 0.05, `${type} seed ${seed}: honest p ${c.honestP}`);
      for (const k of ["headline", "methods", "stats", "truth", "author", "journal", "honestLabel"]) {
        assert.ok(typeof c[k] === "string" && c[k].length > 0, `${type} missing ${k}`);
      }
    }
  });
}

check("legit: same test both ways; real effects significant, nulls not", () => {
  for (const seed of SEEDS) {
    const c = SC.make("legit", seed);
    assert.equal(c.naiveP, c.honestP);
    if (seed % 2 === 0) assert.ok(c.naiveP < 0.01);
    else assert.ok(c.naiveP > 0.2);
  }
});

check("cases are reproducible from their seed", () => {
  for (const type of Object.keys(SC.GENERATORS)) {
    assert.deepEqual(SC.make(type, 42), SC.make(type, 42));
  }
});

check("a 10-round deck includes every crime and some legit studies", () => {
  const d = SC.deck(10, 7);
  assert.equal(d.length, 10);
  for (const t of BLUNDERS) assert.ok(d.slice(0, 8).includes(t), `deck missing ${t}`);
  assert.ok(d.includes("legit"));
});

console.log(`\n🕵️ ${passed} checks passed. Every case file is guilty exactly as charged.`);
