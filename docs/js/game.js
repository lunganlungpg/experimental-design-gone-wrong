/* ==========================================================================
 * game.js — "Peer Review Panic": spot the blunder before the clock runs out.
 *
 *   Solo (Career Mode): 10 studies, 3 credibility flasks, climb from
 *                       Unpaid Intern to Nobel-ish Laureate.
 *   Multiplayer (Lab Rivalry): 2–4 players pass one device around.
 *
 * Every study is generated live by scenarios.js from a seed, so no two games
 * are the same and every p-value is real (and usually lying).
 * ========================================================================== */
(function () {
  "use strict";
  const S = window.Stats, SC = window.Scenarios;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const lab = () => window.CrimeLab || { toast() {}, confetti() {}, unlock() {}, excuse: () => "“The dog ate our randomization.”" };
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* fine */ } },
  };

  /* ======================================================================
   * Tuning
   * ==================================================================== */
  const DIFFICULTY = {
    postdoc: { label: "Postdoc", seconds: 30, blurb: "30 s per study. Coffee included." },
    tenure: { label: "Tenure-track", seconds: 18, blurb: "18 s. The grant deadline is tomorrow." },
    reviewer2: { label: "Reviewer #2", seconds: 10, blurb: "10 s. No mercy, no reading the methods twice." },
  };
  const CAREER = [
    [0, "Unpaid Intern", "🧃"],
    [300, "Grad Student", "📚"],
    [700, "Postdoc", "☕"],
    [1200, "Assistant Professor", "🧑‍🏫"],
    [1800, "Tenured Professor", "🎓"],
    [2600, "Nobel-ish Laureate", "🏆"],
  ];
  const AVATARS = ["🧑‍🔬", "👩‍🌾", "🦉", "🐸", "🤖", "🦄", "🐙", "🧙"];
  const DEFAULT_NAMES = ["Dr. Alpha", "Dr. Beta", "Dr. Gamma", "Dr. Delta"];
  const careerFor = (score) => CAREER.filter(([min]) => score >= min).pop();
  const nextCareer = (score) => CAREER.find(([min]) => score < min);

  /* ======================================================================
   * Prof. Pipette, game host. Says things. Not all of them helpful.
   * ==================================================================== */
  const LINES = {
    start: [
      "Welcome, reviewers. Every study here claims a miracle. Some even have one.",
      "Remember: three stars is a claim, not a proof.",
      "Read the methods. The crime is always in the methods.",
    ],
    right: [
      "Correct! The authors would like to never speak to you again.",
      "Nailed it. Somewhere a press release just got cancelled.",
      "Yes! You may now raise one eyebrow at the authors.",
      "Correct. Reviewer #2 nods slowly and respectfully.",
      "Bingo. That p-value has been taken in for questioning.",
    ],
    rightLegit: [
      "Correct! Sometimes the science is just… fine. Weird, right?",
      "Yes! You let a good paper through. Rare. Beautiful.",
    ],
    publishedBlunder: [
      "You just published it. Retraction ETA: 6 months.",
      "Accepted! It's going viral. So is the retraction notice.",
      "Congratulations, your name is now in Retraction Watch.",
    ],
    rejectedLegit: [
      "You rejected a perfectly good study. Reviewer #2 is proud of you. Nobody else is.",
      "That one was legit! The authors are now crying into their pre-registration.",
    ],
    wrongCrime: [
      "Right to be suspicious, wrong crime. Partial outrage credit: zero.",
      "Something was wrong, just not that.",
    ],
    timeout: [
      "Time's up. The authors graduated while you were reading.",
      "Too slow! The journal accepted it without you.",
      "The clock ran out. Your review is now ‘lost in the system’.",
    ],
    streak: [
      "🔥 Streak! You're reviewing like it's your hobby. (Is it? It's fine.)",
      "🔥 On fire. Journals are starting to fear your inbox.",
      "🔥 Unstoppable. The editors are giving you their hardest papers now.",
    ],
    lifeline: [
      "📞 The statistician picked up! They crossed out four answers and hung up.",
      "📞 “It depends,” said the statistician, then helpfully crossed out four options.",
    ],
    sabbatical: [
      "📞 The statistician is on sabbatical. In Iceland. With no signal. Lifeline wasted.",
      "📞 The statistician only answers questions written in R. Lifeline wasted.",
      "📞 Voicemail: “If this is about p-values, please consult the literature.” Lifeline wasted.",
    ],
    idle: [
      "I'm a beaker. I contain multitudes. Mostly p-values.",
      "Fun fact: I was calibrated once. In 2009.",
      "Click me again and I'll tell Reviewer #2 where you live.",
      "My error bars are standard errors. Or SDs. Depends who's asking.",
      "I once saw a p = 0.051 rounded down. I still have nightmares.",
      "Randomize your pots. Hydrate. Pre-register. In that order.",
    ],
    lowLife: [
      "One credibility flask left. Tread carefully, your h-index is watching.",
    ],
  };
  const pickLine = (key) => LINES[key][Math.floor(Math.random() * LINES[key].length)];

  function hostSay(text) {
    const b = $("#hostBubble");
    if (!b) return;
    b.textContent = text;
    b.classList.remove("pop");
    void b.offsetWidth; // restart the animation
    b.classList.add("pop");
  }

  /* ======================================================================
   * Sound: tiny synth, no files. Off until the player touches something.
   * ==================================================================== */
  const sound = (() => {
    let ctx = null;
    let on = store.get("crimelab.sound", true);
    function tone(freq, dur, type = "sine", when = 0, vol = 0.08) {
      if (!on) return;
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        const t = ctx.currentTime + when;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + dur + 0.02);
      } catch { /* no audio: also fine */ }
    }
    return {
      get on() { return on; },
      toggle() { on = !on; store.set("crimelab.sound", on); return on; },
      right() { tone(660, 0.12, "triangle"); tone(880, 0.18, "triangle", 0.1); },
      wrong() { tone(330, 0.22, "sawtooth", 0, 0.05); tone(294, 0.22, "sawtooth", 0.2, 0.05); tone(247, 0.45, "sawtooth", 0.4, 0.05); },
      tick() { tone(1200, 0.04, "square", 0, 0.03); },
      fanfare() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, "triangle", i * 0.12)); },
      click() { tone(520, 0.05, "triangle", 0, 0.04); },
    };
  })();

  /* ======================================================================
   * Figures (SVG strings drawn from the scenario's figure spec)
   * ==================================================================== */
  function figureSVG(fig, stats) {
    if (fig.kind === "trace") return traceSVG(fig);
    const W = 320, H = 190, X0 = 46, Y0 = 18, PH = 130;
    const tops = fig.bars.map((b) => b.mean + 2 * b.se);
    const lows = fig.bars.map((b) => b.mean - 2 * b.se);
    const hi = Math.max(...tops), lo = Math.min(...lows);
    const pad = (hi - lo) * 0.35 || 1;
    const yMin = lo - pad, yMax = hi + pad * 0.6;
    const y = (v) => Y0 + PH - ((v - yMin) / (yMax - yMin)) * PH;
    const bw = 70, gap = (W - X0 - 2 * bw) / 3;
    const colors = ["var(--control)", "var(--treated)"];
    let s = `<svg viewBox="0 0 ${W} ${H}" class="fig" role="img" aria-label="Bar chart comparing ${esc(fig.bars[0].label)} and ${esc(fig.bars[1].label)}">`;
    // axis + ticks (note: axis does not start at zero — a classic move, on purpose)
    s += `<line x1="${X0}" x2="${X0}" y1="${Y0}" y2="${Y0 + PH}" class="ax"/>`;
    s += `<line x1="${X0}" x2="${W - 6}" y1="${Y0 + PH}" y2="${Y0 + PH}" class="ax"/>`;
    for (let i = 0; i <= 3; i++) {
      const v = yMin + ((yMax - yMin) * i) / 3;
      s += `<text x="${X0 - 6}" y="${y(v) + 4}" text-anchor="end" class="tk">${v.toFixed(1)}</text>`;
    }
    fig.bars.forEach((b, i) => {
      const x = X0 + gap + i * (bw + gap);
      s += `<rect x="${x}" y="${y(b.mean)}" width="${bw}" height="${Y0 + PH - y(b.mean)}" rx="4" style="fill:${colors[i]};stroke:var(--line);stroke-width:2"/>`;
      s += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${y(b.mean + 2 * b.se)}" y2="${y(b.mean - 2 * b.se)}" class="err"/>`;
      s += `<line x1="${x + bw / 2 - 8}" x2="${x + bw / 2 + 8}" y1="${y(b.mean + 2 * b.se)}" y2="${y(b.mean + 2 * b.se)}" class="err"/>`;
      s += `<text x="${x + bw / 2}" y="${Y0 + PH + 18}" text-anchor="middle" class="tl">${esc(b.label.length > 16 ? b.label.slice(0, 15) + "…" : b.label)}</text>`;
    });
    const st = S.stars(stats);
    if (st !== "n.s.") {
      const x1 = X0 + gap + bw / 2, x2 = X0 + gap * 2 + bw * 1.5, yy = y(hi) - 10;
      s += `<path d="M${x1} ${yy + 6} V${yy} H${x2} V${yy + 6}" class="err" fill="none"/>`;
      s += `<text x="${(x1 + x2) / 2}" y="${yy - 4}" text-anchor="middle" class="stars-svg">${st}</text>`;
    } else {
      s += `<text x="${W / 2 + 20}" y="${Y0 + 10}" text-anchor="middle" class="tk">n.s.</text>`;
    }
    s += `<text x="${W - 6}" y="${H - 2}" text-anchor="end" class="hand">*y-axis starts wherever looked best</text>`;
    return s + "</svg>";
  }

  function traceSVG(fig) {
    const W = 320, H = 190, X0 = 40, Y0 = 14, PH = 140, PW = W - X0 - 12;
    const ns = fig.trace.map((t) => t.n), nMin = Math.min(...ns), nMax = Math.max(...ns);
    const x = (n) => X0 + ((n - nMin) / Math.max(1, nMax - nMin)) * PW;
    const y = (p) => Y0 + PH - (clamp(-Math.log10(p), 0, 3) / 3) * PH;
    const pts = fig.trace.map((t) => `${x(t.n).toFixed(1)},${y(t.p).toFixed(1)}`).join(" ");
    let s = `<svg viewBox="0 0 ${W} ${H}" class="fig" role="img" aria-label="p-value after each new pair of plants, dipping below 0.05 where data collection stopped">`;
    s += `<line x1="${X0}" x2="${X0}" y1="${Y0}" y2="${Y0 + PH}" class="ax"/><line x1="${X0}" x2="${W - 8}" y1="${Y0 + PH}" y2="${Y0 + PH}" class="ax"/>`;
    [[1, "1"], [0.1, ".1"], [0.01, ".01"], [0.001, ".001"]].forEach(([p, lab]) => {
      s += `<text x="${X0 - 5}" y="${y(p) + 4}" text-anchor="end" class="tk">${lab}</text>`;
    });
    s += `<line x1="${X0}" x2="${W - 8}" y1="${y(0.05)}" y2="${y(0.05)}" style="stroke:var(--danger);stroke-width:2;stroke-dasharray:6 4"/>`;
    s += `<text x="${W - 10}" y="${y(0.05) - 5}" text-anchor="end" class="tk" style="fill:var(--danger)">p = .05</text>`;
    s += `<polyline points="${pts}" fill="none" style="stroke:var(--accent);stroke-width:3;stroke-linejoin:round"/>`;
    const stop = fig.trace.find((t) => t.n === fig.stopAt);
    if (stop) {
      s += `<circle cx="${x(stop.n)}" cy="${y(stop.p)}" r="7" style="fill:var(--gold);stroke:var(--line);stroke-width:2"/>`;
      s += `<text x="${clamp(x(stop.n), 70, W - 70)}" y="${y(stop.p) + 24}" text-anchor="middle" class="hand">“stop here!!”</text>`;
    }
    s += `<text x="${X0 + PW / 2}" y="${H - 2}" text-anchor="middle" class="tk">plants per group →</text>`;
    s += `<text x="${X0 + 4}" y="${Y0 + 10}" class="tk">p-value (log scale)</text>`;
    return s + "</svg>";
  }

  /* ======================================================================
   * Game state
   * ==================================================================== */
  let G = null;           // current game
  let timer = null;       // requestAnimationFrame handle
  let lastTick = -1;

  function newGame({ mode, players, rounds, difficulty }) {
    const seed = (Math.random() * 2 ** 31) | 0;
    G = {
      mode, rounds, difficulty, seed,
      seconds: DIFFICULTY[difficulty].seconds,
      players: players.map((p, i) => ({
        ...p, score: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0,
        lives: mode === "solo" ? 3 : Infinity, lifeline: true, out: false,
        deck: SC.deck(rounds, seed + i * 977),
      })),
      turn: 0,          // global turn counter
      round: 0,         // 0-based round index
      current: 0,       // player index
      caseFile: null,
      answered: false,
    };
  }

  const active = () => G.players[G.current];

  /* ======================================================================
   * Screens
   * ==================================================================== */
  const stage = () => $("#gameStage");

  function showLobby() {
    stopTimer();
    G = null;
    const best = store.get("crimelab.highscore", 0);
    const saved = store.get("crimelab.lobby", { mode: "solo", count: 2, names: DEFAULT_NAMES, rounds: 10, difficulty: "tenure" });
    stage().innerHTML = `
      <div class="lobby">
        <div class="mode-pick" role="radiogroup" aria-label="Game mode">
          <button type="button" class="mode-card ${saved.mode === "solo" ? "on" : ""}" data-mode="solo" role="radio" aria-checked="${saved.mode === "solo"}">
            <span class="mode-emoji">🧑‍🔬</span>
            <strong>Single player</strong>
            <span>Career Mode: 3 credibility flasks, climb from Unpaid Intern to Nobel-ish Laureate.</span>
            ${best ? `<em>Your best: ${best.toLocaleString()} pts</em>` : "<em>No high score yet. Suspiciously clean record.</em>"}
          </button>
          <button type="button" class="mode-card ${saved.mode === "multi" ? "on" : ""}" data-mode="multi" role="radio" aria-checked="${saved.mode === "multi"}">
            <span class="mode-emoji">👥</span>
            <strong>Multiplayer</strong>
            <span>Lab Rivalry: 2–4 players pass one device around. Loser reads an excuse aloud.</span>
            <em>Great for lab meetings. Terrible for lab friendships.</em>
          </button>
        </div>

        <div class="lobby-grid">
          <fieldset class="players" ${saved.mode === "solo" ? "hidden" : ""} id="playersBox">
            <legend>Who's reviewing?</legend>
            <div class="count-row" role="radiogroup" aria-label="Number of players">
              ${[2, 3, 4].map((n) => `<button type="button" class="chip ${saved.count === n ? "on" : ""}" data-count="${n}">${n} players</button>`).join("")}
            </div>
            <div id="nameRows"></div>
          </fieldset>

          <fieldset class="settings">
            <legend>Settings</legend>
            <label class="field">Studies per player
              <select id="gRounds">${[5, 8, 10].map((n) => `<option value="${n}" ${saved.rounds === n ? "selected" : ""}>${n}</option>`).join("")}</select>
            </label>
            <div class="diff-row" role="radiogroup" aria-label="Difficulty">
              ${Object.entries(DIFFICULTY).map(([k, d]) => `
                <button type="button" class="diff ${saved.difficulty === k ? "on" : ""}" data-diff="${k}">
                  <strong>${d.label}</strong><span>${d.blurb}</span>
                </button>`).join("")}
            </div>
          </fieldset>
        </div>

        <details class="howto">
          <summary>How to play (30-second read, unlike the methods sections)</summary>
          <ol>
            <li>You're Reviewer #2. Each round you get one study with a dramatic headline and a suspicious <i>p</i>-value.</li>
            <li>Read the methods, then pick the blunder, or <b>✅ Legit</b> if the study is actually fine (some are!).</li>
            <li>Fast answers earn up to +50 bonus. Correct streaks multiply your points (up to ×3).</li>
            <li>📞 Once per game you can phone a statistician. They usually help. Usually.</li>
            <li>Keyboard: <kbd>1</kbd>–<kbd>7</kbd> to answer, <kbd>L</kbd> for the lifeline, <kbd>Enter</kbd> to continue.</li>
          </ol>
        </details>

        <button type="button" class="btn btn-primary btn-big" id="gStart">🚀 Start reviewing</button>
      </div>`;

    let mode = saved.mode, count = saved.count, difficulty = saved.difficulty;
    const names = [...saved.names];
    const avatars = store.get("crimelab.avatars", [0, 1, 2, 3]);

    function renderNames() {
      $("#nameRows").innerHTML = Array.from({ length: count }, (_, i) => `
        <div class="name-row">
          <button type="button" class="avatar-btn" data-i="${i}" aria-label="Change avatar for player ${i + 1}" title="Change avatar">${AVATARS[avatars[i] % AVATARS.length]}</button>
          <label class="sr-only" for="pname${i}">Player ${i + 1} name</label>
          <input id="pname${i}" class="name-input" maxlength="18" value="${esc(names[i] || DEFAULT_NAMES[i])}" />
        </div>`).join("");
      $$(".avatar-btn", stage()).forEach((b) => b.addEventListener("click", () => {
        const i = +b.dataset.i;
        avatars[i] = (avatars[i] + 1) % AVATARS.length;
        b.textContent = AVATARS[avatars[i]];
        sound.click();
      }));
      $$(".name-input", stage()).forEach((inp, i) => inp.addEventListener("input", () => { names[i] = inp.value; }));
    }
    renderNames();

    $$(".mode-card", stage()).forEach((c) => c.addEventListener("click", () => {
      mode = c.dataset.mode;
      $$(".mode-card", stage()).forEach((x) => { x.classList.toggle("on", x === c); x.setAttribute("aria-checked", x === c); });
      $("#playersBox").hidden = mode === "solo";
      sound.click();
    }));
    $$("[data-count]", stage()).forEach((c) => c.addEventListener("click", () => {
      count = +c.dataset.count;
      $$("[data-count]", stage()).forEach((x) => x.classList.toggle("on", x === c));
      renderNames();
      sound.click();
    }));
    $$("[data-diff]", stage()).forEach((c) => c.addEventListener("click", () => {
      difficulty = c.dataset.diff;
      $$("[data-diff]", stage()).forEach((x) => x.classList.toggle("on", x === c));
      sound.click();
    }));
    $("#gStart").addEventListener("click", () => {
      const rounds = +$("#gRounds").value;
      store.set("crimelab.lobby", { mode, count, names, rounds, difficulty });
      store.set("crimelab.avatars", avatars);
      const players = mode === "solo"
        ? [{ name: "You", avatar: AVATARS[avatars[0] % AVATARS.length] }]
        : Array.from({ length: count }, (_, i) => ({
          name: (names[i] || DEFAULT_NAMES[i]).trim() || DEFAULT_NAMES[i],
          avatar: AVATARS[avatars[i] % AVATARS.length],
        }));
      newGame({ mode, players, rounds, difficulty });
      hostSay(pickLine("start"));
      if (mode === "multi") showHandoff(); else showCase();
    });
  }

  function trashTalk() {
    const ranked = [...G.players].sort((a, b) => b.score - a.score);
    const lead = ranked[0], last = ranked[ranked.length - 1];
    const me = active();
    if (G.turn === 0) return `${me.name} reviews first. No pressure, but everyone is watching.`;
    if (lead === me && lead.score > 0) return `${me.name} is leading and has already started drafting the Nobel speech.`;
    if (last === me && lead.score - me.score > 200) return `${me.name} is ${lead.score - me.score} points behind ${lead.name}. Statistically, a comeback is… possible.`;
    const lines = [
      `${lead.name} leads with ${lead.score} pts. Everyone else is “building character”.`,
      `${me.name}, your turn. ${lead.name} says you can't spot pseudoreplication. Prove them wrong.`,
      `Fun fact: ${last.name} once called n = 3 “a large sample”.`,
    ];
    return lines[G.turn % lines.length];
  }

  function showHandoff() {
    stopTimer();
    const p = active();
    stage().innerHTML = `
      <div class="handoff">
        <p class="kick">Round ${G.round + 1} of ${G.rounds}</p>
        <div class="big-avatar" aria-hidden="true">${p.avatar}</div>
        <h3>Pass the device to <span>${esc(p.name)}</span></h3>
        <p class="trash">${esc(trashTalk())}</p>
        ${scoreboardHTML()}
        <button type="button" class="btn btn-primary btn-big" id="gReady">I'm ${esc(p.name)}. Show me the study 👀</button>
        <p class="muted small">Everyone else: look away. Peeking is literally one of the crimes in this game.</p>
      </div>`;
    $("#gReady").addEventListener("click", showCase);
    $("#gReady").focus();
  }

  function scoreboardHTML() {
    if (G.mode !== "multi") return "";
    const ranked = [...G.players].sort((a, b) => b.score - a.score);
    return `<ol class="scoreboard">${ranked.map((p) => `
      <li class="${p === active() ? "me" : ""}"><span>${p.avatar} ${esc(p.name)}</span><b>${p.score.toLocaleString()}</b></li>`).join("")}</ol>`;
  }

  function hudHTML() {
    const p = active();
    const mult = multiplier(p.streak);
    const lives = G.mode === "solo" ? `<span class="lives" title="Credibility">${"🧪".repeat(p.lives)}${"<i>💀</i>".repeat(3 - p.lives)}</span>` : "";
    const nxt = nextCareer(p.score);
    return `<div class="hud">
      <span class="who">${p.avatar} ${esc(p.name)}</span>
      <span>Study <b>${G.round + 1}</b>/${G.rounds}</span>
      <span>Score <b class="score-num">${p.score.toLocaleString()}</b></span>
      <span>Streak <b>${p.streak}</b>${mult > 1 ? ` <em class="mult">×${mult}</em>` : ""}</span>
      ${lives}
      ${G.mode === "solo" ? `<span class="rank">${careerFor(p.score)[2]} ${careerFor(p.score)[1]}${nxt ? ` <small>(next: ${nxt[1]} at ${nxt[0]})</small>` : ""}</span>` : ""}
    </div>`;
  }

  const multiplier = (streak) => Math.min(3, 1 + 0.5 * Math.max(0, streak - 1));

  function showCase() {
    const p = active();
    const type = p.deck[G.round];
    G.caseFile = SC.make(type, G.seed + G.turn * 131 + G.current * 17);
    G.answered = false;
    const c = G.caseFile;
    stage().innerHTML = `
      ${hudHTML()}
      <div class="timer" aria-hidden="true"><i id="timerFill"></i></div>
      <article class="casefile">
        <header>
          <span class="journal">${esc(c.journal)}</span>
          <h3>“${esc(c.headline)}”</h3>
          <p class="byline">${esc(c.author)} et al. · Received yesterday, accepted this morning</p>
        </header>
        <div class="case-body">
          <div class="methods">
            <h4>Methods (the crime scene)</h4>
            <p>${c.methods}</p>
            <p class="stats-line"><span>Result</span> <code>${esc(c.stats)}</code></p>
          </div>
          <figure class="fig-wrap">${figureSVG(c.figure, c.naiveP)}</figure>
        </div>
      </article>
      <p class="prompt">You're Reviewer #2. <b>What's wrong with this study?</b></p>
      <div class="answers">
        ${SC.TYPES.map((t, i) => `<button type="button" class="answer ${t.id === "legit" ? "legit" : ""}" data-type="${t.id}">
          <kbd>${i + 1}</kbd><span class="ic">${t.icon}</span>${t.label}</button>`).join("")}
      </div>
      <div class="tools">
        <button type="button" class="btn btn-ghost" id="gLifeline" ${p.lifeline ? "" : "disabled"}>📞 Phone a statistician ${p.lifeline ? "(once per game)" : "(already used)"}</button>
        <button type="button" class="btn" id="gQuit">🏳️ Quit to lobby</button>
      </div>
      <div id="gReveal" aria-live="polite"></div>`;

    $$(".answer", stage()).forEach((b) => b.addEventListener("click", () => answer(b.dataset.type)));
    $("#gLifeline").addEventListener("click", lifeline);
    $("#gQuit").addEventListener("click", () => { hostSay("Quitting mid-review? Very Reviewer #3 of you."); showLobby(); });
    $("#gameStage").scrollIntoView({ block: "start", behavior: "smooth" });
    startTimer();
  }

  /* ---------------- Timer ---------------- */
  function startTimer() {
    stopTimer();
    const fill = $("#timerFill");
    const start = performance.now(), total = G.seconds * 1000;
    lastTick = -1;
    const step = (now) => {
      if (!G || G.answered) return;
      const left = clamp(1 - (now - start) / total, 0, 1);
      if (fill) {
        fill.style.width = (left * 100).toFixed(2) + "%";
        fill.classList.toggle("hurry", left < 0.25);
      }
      const secsLeft = Math.ceil((total - (now - start)) / 1000);
      if (secsLeft <= 3 && secsLeft > 0 && secsLeft !== lastTick) { lastTick = secsLeft; sound.tick(); }
      if (left <= 0) { answer(null); return; }
      G.timeLeft = left;
      timer = requestAnimationFrame(step);
    };
    G.timeLeft = 1;
    timer = requestAnimationFrame(step);
  }
  function stopTimer() { if (timer) cancelAnimationFrame(timer); timer = null; }

  /* ---------------- Lifeline ---------------- */
  function lifeline() {
    const p = active();
    if (!p.lifeline || G.answered) return;
    p.lifeline = false;
    const btn = $("#gLifeline");
    btn.disabled = true;
    btn.textContent = "📞 Statistician contacted";
    if (Math.random() < 0.25) {
      hostSay(pickLine("sabbatical"));
      sound.wrong();
      return;
    }
    const wrong = SC.TYPES.map((t) => t.id).filter((id) => id !== G.caseFile.type);
    const shuffled = S.rng((Math.random() * 1e9) | 0).shuffle(wrong).slice(0, 4);
    shuffled.forEach((id) => {
      const b = $(`.answer[data-type="${id}"]`);
      if (b) { b.disabled = true; b.classList.add("struck"); }
    });
    hostSay(pickLine("lifeline"));
    sound.click();
  }

  /* ---------------- Answering ---------------- */
  function answer(choice) {
    if (!G || G.answered) return;
    G.answered = true;
    stopTimer();
    const p = active(), c = G.caseFile;
    const correct = choice === c.type;
    p.answered++;
    let pts = 0, line;
    if (correct) {
      p.streak++;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      p.correct++;
      const speed = Math.round(50 * (G.timeLeft || 0));
      pts = Math.round((100 + speed) * multiplier(p.streak));
      p.score += pts;
      line = c.type === "legit" ? pickLine("rightLegit") : pickLine("right");
      if (p.streak >= 3 && p.streak % 3 === 0) line = pickLine("streak");
      sound.right();
      if (p.streak >= 3) lab().confetti(30);
    } else {
      p.streak = 0;
      if (choice === null) line = pickLine("timeout");
      else if (choice === "legit") line = pickLine("publishedBlunder");
      else if (c.type === "legit") line = pickLine("rejectedLegit");
      else line = pickLine("wrongCrime");
      if (G.mode === "solo") p.lives--;
      if (G.mode === "solo" && p.lives === 1) line += " " + pickLine("lowLife");
      sound.wrong();
    }
    hostSay(line);

    // Mark the buttons.
    $$(".answer", stage()).forEach((b) => {
      b.disabled = true;
      if (b.dataset.type === c.type) b.classList.add("right");
      else if (b.dataset.type === choice) b.classList.add("wrong");
    });
    $("#gLifeline").disabled = true;

    const t = SC.TYPES.find((x) => x.id === c.type);
    const gameOver = G.mode === "solo" && p.lives <= 0;
    const last = isLastTurn() || gameOver;
    $("#gReveal").innerHTML = `
      <div class="reveal ${correct ? "ok" : "bad"}">
        <div class="reveal-head">
          <strong>${correct ? "✅ Correct!" : choice === null ? "⏰ Out of time!" : "❌ Not quite."}</strong>
          ${correct ? `<span class="points">+${pts}</span>` : ""}
        </div>
        <p><b>The verdict: ${t.icon} ${t.label}.</b> ${esc(c.truth)}</p>
        <div class="pcompare">
          <div class="pc fake"><span>Authors' p</span><b>${S.formatP(c.naiveP)}</b><i>${S.stars(c.naiveP)}</i></div>
          <div class="pc arrow" aria-hidden="true">→</div>
          <div class="pc honest"><span>Honest p (${esc(c.honestLabel)})</span><b>${S.formatP(c.honestP)}</b><i>${S.stars(c.honestP)}</i></div>
        </div>
        ${gameOver ? `<p class="gameover">💀 Out of credibility. Your lab is now a cautionary tale in an intro stats lecture.</p>` : ""}
        <button type="button" class="btn btn-primary" id="gNext">${last ? "🏁 See the results" : G.mode === "multi" ? "Next reviewer →" : "Next study →"}</button>
      </div>`;
    if (correct) {
      const sn = $(".score-num", stage());
      if (sn) { sn.textContent = p.score.toLocaleString(); sn.classList.add("bump"); }
    }
    $("#gNext").addEventListener("click", advance);
    $("#gNext").focus({ preventScroll: true });
    $("#gReveal").scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function isLastTurn() {
    return G.round === G.rounds - 1 && G.current === G.players.length - 1;
  }

  function advance() {
    const p = active();
    if (G.mode === "solo" && p.lives <= 0) return showResults();
    if (isLastTurn()) return showResults();
    G.turn++;
    if (G.current < G.players.length - 1) G.current++;
    else { G.current = 0; G.round++; }
    if (G.mode === "multi") showHandoff(); else showCase();
  }

  /* ---------------- Results ---------------- */
  function showResults() {
    stopTimer();
    sound.fanfare();
    lab().confetti(120);
    if (G.mode === "solo") return soloResults();
    return multiResults();
  }

  function soloResults() {
    const p = G.players[0];
    const [, title, em] = careerFor(p.score);
    const best = store.get("crimelab.highscore", 0);
    const isBest = p.score > best;
    if (isBest) store.set("crimelab.highscore", p.score);
    if (p.score >= 1800) lab().unlock("tenure");
    if (p.correct === G.rounds && p.answered === G.rounds) lab().unlock("flawless");
    const share = `I reached ${title} ${em} with ${p.score.toLocaleString()} pts in Peer Review Panic (${p.correct}/${p.answered} blunders caught, ${DIFFICULTY[G.difficulty].label} mode). Can you spot the p-hack? ${location.href.split("#")[0]}#game`;
    stage().innerHTML = `
      <div class="g-results">
        <p class="kick">${p.lives <= 0 ? "Career over (for now)" : "Review season complete"}</p>
        <div class="big-avatar" aria-hidden="true">${em}</div>
        <h3>Career status: <span>${title}</span></h3>
        <dl class="final-stats">
          <div><dt>Score</dt><dd>${p.score.toLocaleString()}${isBest ? ' <em class="new-best">NEW BEST!</em>' : ""}</dd></div>
          <div><dt>Blunders caught</dt><dd>${p.correct}/${p.answered}</dd></div>
          <div><dt>Best streak</dt><dd>${p.bestStreak}</dd></div>
          <div><dt>Difficulty</dt><dd>${DIFFICULTY[G.difficulty].label}</dd></div>
        </dl>
        <p class="verdict-line">${soloVerdict(p)}</p>
        <div class="btn-row center">
          <button type="button" class="btn btn-primary" id="gAgain">🔁 Play again</button>
          <button type="button" class="btn" id="gShare">📋 Copy my score</button>
          <button type="button" class="btn" id="gLobby">🏠 Lobby</button>
        </div>
      </div>`;
    $("#gAgain").addEventListener("click", () => { newGame({ mode: "solo", players: [{ name: "You", avatar: p.avatar }], rounds: G.rounds, difficulty: G.difficulty }); showCase(); });
    $("#gLobby").addEventListener("click", showLobby);
    $("#gShare").addEventListener("click", () => copy(share));
    hostSay(isBest ? "A new personal best! I'd frame it, but frames are not in the grant budget." : "Not bad. Not Nature, but not bad.");
  }

  function soloVerdict(p) {
    const rate = p.answered ? p.correct / p.answered : 0;
    if (rate === 1) return "Flawless. Journals are drafting a restraining order to stop you reviewing.";
    if (rate >= 0.8) return "Excellent. You can smell a pseudoreplicate from three buildings away.";
    if (rate >= 0.5) return "Solid. Some p-values still fool you, but only the charming ones.";
    if (rate > 0) return "Rough review season. Scroll down to the crime scenes for some rehab.";
    return "Zero catches. Have you considered a career in press releases?";
  }

  function multiResults() {
    lab().unlock("rivalry");
    const ranked = [...G.players].sort((a, b) => b.score - a.score || b.correct - a.correct);
    const titles = ["🏆 Nobel-ish Laureate", "🥈 Tenured & Smug", "🥉 Perpetual Postdoc", "🧃 Unpaid Intern"];
    const loser = ranked[ranked.length - 1];
    const tie = ranked.length > 1 && ranked[0].score === ranked[1].score;
    stage().innerHTML = `
      <div class="g-results">
        <p class="kick">Lab Rivalry results</p>
        <h3>${tie ? "It's a <span>tie</span>! Peer review is subjective after all." : `<span>${esc(ranked[0].name)}</span> wins the grant!`}</h3>
        <ol class="podium">
          ${ranked.map((p, i) => `<li class="place-${i + 1}">
            <span class="pa">${p.avatar}</span>
            <span class="pn">${esc(p.name)}</span>
            <span class="pt">${titles[i]}</span>
            <b>${p.score.toLocaleString()}</b>
            <small>${p.correct}/${p.answered} caught · best streak ${p.bestStreak}</small>
          </li>`).join("")}
        </ol>
        <div class="penalty">
          <p>🙃 <b>${esc(loser.name)}</b> came last and must read this excuse aloud, with feeling:</p>
          <blockquote id="gExcuse">${esc(lab().excuse())}</blockquote>
          <button type="button" class="btn" id="gReroll">🎲 Different excuse (one reroll, we're not monsters)</button>
        </div>
        <div class="btn-row center">
          <button type="button" class="btn btn-primary" id="gRematch">🔁 Rematch</button>
          <button type="button" class="btn" id="gLobby">🏠 Lobby</button>
        </div>
      </div>`;
    $("#gReroll").addEventListener("click", (e) => { $("#gExcuse").textContent = lab().excuse(); e.currentTarget.disabled = true; });
    $("#gRematch").addEventListener("click", () => {
      newGame({ mode: "multi", players: G.players.map(({ name, avatar }) => ({ name, avatar })), rounds: G.rounds, difficulty: G.difficulty });
      showHandoff();
    });
    $("#gLobby").addEventListener("click", showLobby);
    hostSay(`${ranked[0].name} takes the grant. ${loser.name} takes the blame. Science!`);
  }

  function copy(text) {
    const done = () => lab().toast("📋 Copied! Paste it in the lab group chat and wait for the drama.");
    const fail = () => lab().toast("Couldn't reach the clipboard. Your score lives on in your heart.");
    try {
      if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fail); return; }
    } catch { /* fall through */ }
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch { fail(); } finally { ta.remove(); }
  }

  /* ---------------- Keyboard ---------------- */
  function onKey(e) {
    if (!G || e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    if (!stage().contains(document.activeElement) && document.activeElement !== document.body) return;
    if (!G.answered && /^[1-7]$/.test(e.key)) {
      const b = $$(".answer", stage())[+e.key - 1];
      if (b && !b.disabled) { e.preventDefault(); b.click(); }
    } else if (!G.answered && (e.key === "l" || e.key === "L")) {
      e.preventDefault(); lifeline();
    }
  }

  /* ---------------- Boot ---------------- */
  function init() {
    if (!stage()) return;
    const sBtn = $("#soundToggle");
    if (sBtn) {
      const sync = () => { sBtn.textContent = sound.on ? "🔊" : "🔇"; sBtn.setAttribute("aria-pressed", String(sound.on)); };
      sync();
      sBtn.addEventListener("click", () => { sound.toggle(); sync(); if (sound.on) sound.click(); lab().toast(sound.on ? "🔊 Sound on. Sad trombones enabled." : "🔇 Sound off. Suffer in silence."); });
    }
    $("#hostMascot")?.addEventListener("click", () => hostSay(pickLine("idle")));
    document.addEventListener("keydown", onKey);
    showLobby();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
