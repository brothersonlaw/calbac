/*
 * app.js — UI wiring & state for CalBAC
 * ----------------------------------------------------------------------------
 * Reads inputs, normalizes clock times (handling evening→after-midnight
 * sessions), runs the Science engine, and paints the chart + result cards.
 * All state lives in the DOM + a small `drinks` array; everything recomputes on
 * any change. No framework, no build step.
 * ----------------------------------------------------------------------------
 */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 3) => (n == null || isNaN(n) ? '—' : Number(n).toFixed(d));

  // ---------------------------------------------------------------- Tabs ----
  function activateTab(name) {
    const btn = document.querySelector(`.tab[data-tab="${name}"]`);
    if (!btn) return;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + name).classList.add('active');
  }
  document.getElementById('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    activateTab(btn.dataset.tab);
    history.replaceState(null, '', '#' + btn.dataset.tab);
  });
  window.addEventListener('hashchange', () => activateTab(location.hash.slice(1)));
  if (location.hash) activateTab(location.hash.slice(1));

  // --------------------------------------------------------------- Theme ----
  const themeBtn = $('themeToggle');
  const savedTheme = localStorage.getItem('calbac-theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);
  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    localStorage.setItem('calbac-theme', cur);
  });

  // ---------------------------------------------------------- Time helpers --
  // Parse "HH:MM" -> minutes of day, or null.
  function parseHHMM(v) {
    if (!v) return null;
    const [h, m] = v.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }
  // Treat 00:00–05:59 as "after midnight" (late-night session) so an evening
  // that crosses midnight sorts correctly.
  const adjMin = (m) => (m < 360 ? m + 1440 : m);

  // ------------------------------------------------------------- Drinks -----
  let drinks = []; // { id, timeStr, volumeOz, abvPct, name }
  let nextId = 1;

  // Populate the searchable datalist from the drink DB.
  (function fillDrinkList() {
    const dl = $('drinkList');
    DRINKS.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.name;
      opt.dataset.abv = d.abv;
      opt.dataset.oz = d.oz;
      dl.appendChild(opt);
    });
  })();

  // When a known drink is picked, prefill oz + ABV.
  $('drinkSearch').addEventListener('input', () => {
    const val = $('drinkSearch').value;
    const hit = DRINKS.find(d => d.name === val);
    if (hit) {
      $('drinkOz').value = hit.oz;
      $('drinkAbv').value = hit.abv;
    }
  });

  $('addDrink').addEventListener('click', () => {
    const timeStr = $('drinkTime').value || $('drivingTime').value || '21:00';
    const volumeOz = parseFloat($('drinkOz').value) || 0;
    const abvPct = parseFloat($('drinkAbv').value) || 0;
    const name = $('drinkSearch').value || `${volumeOz} oz @ ${abvPct}%`;
    if (volumeOz <= 0 || abvPct <= 0) return;
    drinks.push({ id: nextId++, timeStr, volumeOz, abvPct, name });
    drinks.sort((a, b) => adjMin(parseHHMM(a.timeStr)) - adjMin(parseHHMM(b.timeStr)));
    $('drinkSearch').value = '';
    renderDrinks();
    recompute();
  });

  function renderDrinks() {
    const ul = $('drinkListUI');
    ul.innerHTML = '';
    let totalG = 0;
    drinks.forEach(d => {
      totalG += Science.alcoholGrams(d.volumeOz, d.abvPct);
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="d-time">${d.timeStr}</span>
        <span class="d-name">${d.name}</span>
        <span class="d-spec">${d.volumeOz}oz · ${d.abvPct}%</span>
        <button class="d-del" data-id="${d.id}" title="Remove">✕</button>`;
      ul.appendChild(li);
    });
    ul.querySelectorAll('.d-del').forEach(b =>
      b.addEventListener('click', () => {
        drinks = drinks.filter(x => x.id !== Number(b.dataset.id));
        renderDrinks();
        recompute();
      }));
    const sd = Science.standardDrinks(totalG);
    $('drinkTotal').textContent = drinks.length
      ? `${drinks.length} drink(s) · ${totalG.toFixed(1)} g ethanol · ${sd.toFixed(1)} standard drinks`
      : 'No drinks added yet.';
  }

  // --------------------------------------------------- r-mode UI toggle -----
  $('rMode').addEventListener('change', () => {
    $('rFixedWrap').style.display = $('rMode').value === 'fixed' ? '' : 'none';
    recompute();
  });

  // ------------------------------------------------ Gather scenario ---------
  function gatherScenario() {
    const drivingStr = $('drivingTime').value;
    const testStr = $('testTime').value;

    // Anchor = earliest of (drinks, driving) as adjusted minutes.
    const times = [];
    drinks.forEach(d => times.push(adjMin(parseHHMM(d.timeStr))));
    if (drivingStr) times.push(adjMin(parseHHMM(drivingStr)));
    if (!times.length) times.push(21 * 60); // default 9pm anchor
    const anchorMin = Math.min(...times);
    const toHr = (str) => {
      const m = parseHHMM(str);
      if (m == null) return null;
      return (adjMin(m) - anchorMin) / 60;
    };

    const s = {
      sex: $('sex').value,
      age: parseFloat($('age').value) || 40,
      weight: parseFloat($('weight').value) || 180,
      weightUnit: $('weightUnit').value,
      height: parseFloat($('height').value) || 70,
      heightUnit: $('heightUnit').value,
      rMode: $('rMode').value,
      rFixed: parseFloat($('rFixed').value) || null,
      absorption: $('absorption').value,
      betaLow: parseFloat($('betaLow').value) || 0.010,
      betaMid: parseFloat($('betaMid').value) || 0.015,
      betaHigh: parseFloat($('betaHigh').value) || 0.020,
      drinks: drinks.map(d => ({ timeHr: toHr(d.timeStr), volumeOz: d.volumeOz, abvPct: d.abvPct }))
                    .filter(d => d.timeHr != null),
      drivingHr: drivingStr ? toHr(drivingStr) : null,
      testHr: testStr ? toHr(testStr) : null,
      anchorMin,
    };

    // Axis window.
    const evTimes = [0, s.drivingHr, s.testHr, ...s.drinks.map(d => d.timeHr)]
      .filter(v => v != null);
    s.axisStartHr = Math.min(-0.25, ...evTimes);
    s.axisEndHr = Math.max(...evTimes, (s.drivingHr || 0), (s.testHr || 0)) + 1.5;
    if (s.axisEndHr - s.axisStartHr < 3) s.axisEndHr = s.axisStartHr + 3;
    return s;
  }

  // ------------------------------------------------- Main recompute ---------
  function recompute() {
    const s = gatherScenario();

    // r hint
    const weightKg = s.weightUnit === 'kg' ? s.weight : Science.lbToKg(s.weight);
    const heightCm = s.heightUnit === 'cm' ? s.height : Science.inToCm(s.height);
    const rAuto = Science.widmarkR({ sex: s.sex, weightKg, heightCm, age: s.age });
    const tbw = Science.watsonTBW({ sex: s.sex, weightKg, heightCm, age: s.age });
    $('rHint').textContent = `Watson TBW ≈ ${tbw.toFixed(1)} L → auto r ≈ ${rAuto.toFixed(3)}`;

    const result = Science.runScenario(s);

    // Build chart model.
    const base = new Date(2020, 0, 1, 0, 0, 0);
    const t0Date = new Date(base.getTime() + s.anchorMin * 60000);
    const events = s.drinks.map((d, i) => ({
      t: d.timeHr, cls: 'drink', label: '🍺', sub: null,
    }));
    BACChart.render($('bacChart'), {
      low: result.low, mid: result.mid, high: result.high,
      thresholds: Science.CA_THRESHOLDS,
      events, t0Date,
      axisStartHr: s.axisStartHr, axisEndHr: s.axisEndHr,
      drivingHr: s.drivingHr, testHr: s.testHr,
    });

    renderResults(s, result);
  }

  // ------------------------------------------------- Result cards -----------
  function bandClass(bac) {
    if (bac >= 0.08) return 'over';
    if (bac >= 0.05) return 'warn';
    return 'under';
  }

  function renderResults(s, r) {
    const grid = $('resultGrid');
    const ro = r.readouts;
    const cards = [];
    const t0Date = new Date(new Date(2020, 0, 1).getTime() + s.anchorMin * 60000);

    cards.push(card('Distribution ratio r',
      `${fmt(ro.r.low, 3)}–${fmt(ro.r.high, 3)}`,
      `mid ${fmt(ro.r.mid, 3)} · ${s.rMode === 'fixed' ? 'fixed' : 'Watson auto'}`));

    cards.push(card('Alcohol consumed',
      `${ro.totalGrams.toFixed(1)} g`,
      `${ro.standardDrinks.toFixed(1)} standard drinks`));

    cards.push(card('Peak BAC (mid)',
      fmt(ro.peak.mid.bac, 3),
      `at ${BACChart.fmtClock(ro.peak.mid.t, t0Date)}`));

    if (ro.atDriving) {
      const b = ro.atDriving;
      cards.push(card('BAC at driving',
        `${fmt(b.low, 3)}–${fmt(b.high, 3)}`,
        `mid ${fmt(b.mid, 3)}`, bandClass(b.mid)));
    }
    if (ro.atTest) {
      const b = ro.atTest;
      const actual = parseFloat($('testResult').value);
      let sub = `mid ${fmt(b.mid, 3)}`;
      if (!isNaN(actual)) sub += ` · reported ${fmt(actual, 3)}`;
      cards.push(card('Modeled BAC at test', `${fmt(b.low, 3)}–${fmt(b.high, 3)}`, sub));
    }

    grid.innerHTML = cards.join('');

    // Verdict / interpretation.
    renderVerdict(s, r);
  }

  function card(title, big, sub, extraClass = '') {
    return `<div class="result ${extraClass}">
      <div class="r-title">${title}</div>
      <div class="r-big">${big}</div>
      <div class="r-sub">${sub}</div>
    </div>`;
  }

  function renderVerdict(s, r) {
    const v = $('verdictCard');
    const ro = r.readouts;
    if (!ro.atDriving) { v.style.display = 'none'; return; }
    v.style.display = '';
    const limit = 0.08;
    const b = ro.atDriving;
    const lines = [];

    if (b.low < limit && b.high >= limit) {
      lines.push(`<p class="v-flag straddle">⚖️ <strong>Straddles the limit.</strong> Under the modeled assumptions,
        BAC at driving ranges <strong>${fmt(b.low,3)}–${fmt(b.high,3)}</strong> — i.e., a defensible scenario
        exists where the driver was <strong>below 0.08</strong> at the wheel.</p>`);
    } else if (b.high < limit) {
      lines.push(`<p class="v-flag under">✅ Under these assumptions the driving BAC stays <strong>below 0.08</strong>
        across the whole range (${fmt(b.low,3)}–${fmt(b.high,3)}).</p>`);
    } else {
      lines.push(`<p class="v-flag over">⚠️ Under these assumptions the driving BAC is <strong>at or above 0.08</strong>
        across the range (${fmt(b.low,3)}–${fmt(b.high,3)}). Try lower-absorption / rising-BAC assumptions to test the defense.</p>`);
    }

    if (ro.risingAtDriving || ro.peakAfterDriving) {
      lines.push(`<p class="v-note">📈 <strong>Rising-BAC indicator:</strong> the modeled curve peaks
        <em>after</em> the time of driving, so the test likely captured a higher BAC than existed at the wheel.
        This is the classic rising-BAC defense — retrograde extrapolation would <em>overstate</em> the driving BAC.</p>`);
    }

    // Test corroboration.
    const actual = parseFloat($('testResult').value);
    if (!isNaN(actual) && ro.atTest) {
      if (actual > ro.atTest.high + 0.005) {
        lines.push(`<p class="v-note">🔎 The reported test (${fmt(actual,3)}) is <strong>higher</strong> than this
          drinking account predicts (max ${fmt(ro.atTest.high,3)}). Either more/stronger drinks than stated, or the
          instrument/ratio is in play — see the Breath Test tab.</p>`);
      } else if (actual < ro.atTest.low - 0.005) {
        lines.push(`<p class="v-note">🔎 The reported test (${fmt(actual,3)}) is <strong>lower</strong> than predicted
          (min ${fmt(ro.atTest.low,3)}) — consistent with slower absorption or over-stated drinking.</p>`);
      } else {
        lines.push(`<p class="v-note">🔎 The reported test (${fmt(actual,3)}) is <strong>consistent</strong> with the
          modeled range at test time (${fmt(ro.atTest.low,3)}–${fmt(ro.atTest.high,3)}).</p>`);
      }
    }

    v.innerHTML = `<h2>Interpretation</h2>${lines.join('')}
      <p class="v-disclaim">Every figure above is contingent on the assumptions you entered. Change absorption,
      β, or r to test how fragile the opposing expert's opinion is.</p>`;
  }

  // ------------------------------------------- Retrograde tab ---------------
  function computeRetro() {
    const out = Science.retrograde({
      testBac: parseFloat($('rTest').value) || 0,
      hoursBack: parseFloat($('rHours').value) || 0,
      betaLow: parseFloat($('rBetaLow').value) || 0.010,
      betaMid: parseFloat($('rBetaMid').value) || 0.015,
      betaHigh: parseFloat($('rBetaHigh').value) || 0.020,
    });
    const cls = (x) => (x >= 0.08 ? 'over' : x >= 0.05 ? 'warn' : 'under');
    $('retroResult').innerHTML = `
      <div class="retro-grid">
        <div class="result ${cls(out.low)}"><div class="r-title">Conservative (slow β)</div><div class="r-big">${fmt(out.low,3)}</div><div class="r-sub">lowest driving BAC</div></div>
        <div class="result ${cls(out.mid)}"><div class="r-title">Mid estimate</div><div class="r-big">${fmt(out.mid,3)}</div><div class="r-sub">average β</div></div>
        <div class="result ${cls(out.high)}"><div class="r-title">Aggressive (fast β)</div><div class="r-big">${fmt(out.high,3)}</div><div class="r-sub">highest driving BAC</div></div>
      </div>
      <p class="retro-note">Back-extrapolated ${out.hoursBack} hr assuming post-absorptive elimination only.
      Range at driving: <strong>${fmt(out.low,3)}–${fmt(out.high,3)}</strong>.</p>`;
  }

  // ------------------------------------------- Breath tab -------------------
  function computeBreath() {
    const ratio = parseInt($('bRatio').value, 10);
    $('bRatioVal').textContent = ratio + ':1';
    const biases = Array.from(document.querySelectorAll('.biases input:checked')).map(c => c.value);
    const out = Science.partitionAnalysis({
      reportedBrAC: parseFloat($('bReported').value) || 0,
      personRatio: ratio,
      biases,
    });
    const delta = out.deltaFromReported;
    const dir = delta < 0 ? 'lower' : 'higher';
    const cls = out.trueBac >= 0.08 ? 'over' : out.trueBac >= 0.05 ? 'warn' : 'under';
    const appliedList = out.applied.length
      ? `<ul class="bullets">${out.applied.map(a => `<li>${a.label} (×${a.factor})</li>`).join('')}</ul>`
      : '<p class="muted">No breathing/temperature factors applied.</p>';
    $('breathResult').innerHTML = `
      <div class="result ${cls} big-result">
        <div class="r-title">Estimated true BAC</div>
        <div class="r-big">${fmt(out.trueBac,3)}</div>
        <div class="r-sub">${fmt(Math.abs(delta),3)} ${dir} than the reported ${fmt(out.reportedBrAC,3)}</div>
      </div>
      <p class="breath-note">At a true ratio of <strong>${ratio}:1</strong>, the breath instrument's 2100:1 assumption
      ${ratio < 2100 ? 'over-states' : ratio > 2100 ? 'under-states' : 'matches'} the blood alcohol.
      ${out.trueBac < 0.08 && out.reportedBrAC >= 0.08 ? '<strong>This scenario drops the true BAC below 0.08.</strong>' : ''}</p>
      <div class="applied-box"><strong>Factors applied:</strong>${appliedList}</div>`;
  }

  // ------------------------------------------- Science prose ----------------
  $('scienceProse').innerHTML = `
    <h2>How CalBAC models BAC</h2>
    <p>CalBAC combines the <strong>Widmark equation</strong> with the <strong>Watson total-body-water model</strong>,
    a first-order absorption phase, and constant zero-order elimination — the same forensic backbone used in
    litigation-support BAC tools.</p>

    <h3>Widmark equation</h3>
    <p class="eq">BAC = A / (r · W) × 100 − β · t</p>
    <ul class="bullets">
      <li><strong>A</strong> — grams of pure ethanol: volume(oz) × 29.5735 × ABV × 0.789.</li>
      <li><strong>r</strong> — distribution ratio. Auto-derived from Watson TBW, or fixed. Male mean ≈ 0.68 (0.50–0.90); female mean ≈ 0.55 (0.45–0.63).</li>
      <li><strong>W</strong> — body weight.</li>
      <li><strong>β</strong> — elimination rate. Dubowski: mean ≈ 0.015–0.018, population range ≈ 0.006–0.040 g/dL/hr.</li>
      <li><strong>t</strong> — hours since drinking began.</li>
    </ul>

    <h3>Watson total body water</h3>
    <p class="eq">Male TBW = 2.447 − 0.09516·age + 0.1074·height + 0.3362·weight<br>
       Female TBW = −2.097 + 0.1069·height + 0.2466·weight</p>
    <p>r is then TBW ÷ body weight ÷ 0.806 (the water fraction of blood).</p>

    <h3>Absorption &amp; the rising-BAC defense</h3>
    <p>Alcohol is absorbed over time, so BAC keeps climbing after the last drink. Time-to-peak averages ~57 min (men)
    and ~42 min (women) but varies enormously with stomach contents. CalBAC models each drink with a gastric lag plus
    first-order absorption, so the curve can still be <em>rising</em> at the time of driving — meaning a later test
    overstates the driving BAC.</p>

    <h3>Retrograde extrapolation</h3>
    <p>BAC<sub>driving</sub> = BAC<sub>test</sub> + β · (hours between). Valid <em>only</em> if the subject was
    post-absorptive the whole time. Without a known drinking pattern, that assumption is untestable — the standard
    line of attack on any retrograde opinion.</p>

    <h3>Breath testing &amp; the 2100:1 assumption</h3>
    <p>Breath machines convert breath to blood using a fixed 2100:1 ratio, but real ratios run ~1100:1–4200:1.
    Breathing pattern and breath temperature bias readings further: hyperventilation ≈ −11%, breath-holding ≈ +12%,
    prolonged exhalation ≈ +16%, elevated breath temperature ≈ +6.5%/°C.</p>

    <h3>California thresholds</h3>
    <ul class="bullets">
      <li>0.08% — per se limit, Veh. Code § 23152(b)</li>
      <li>0.05% — statutory impairment presumption</li>
      <li>0.04% — commercial drivers (§ 23152(d))</li>
      <li>0.01% — under 21 / on DUI probation (§ 23136, § 23140)</li>
    </ul>

    <h3>Sources</h3>
    <ul class="bullets small">
      <li>Dubowski, <em>Absorption, Distribution and Elimination of Alcohol</em>.</li>
      <li>Hlastala et al., <em>The Alcohol Breath Test — A Review</em>; <em>Lung Volume Breath-Test Bias</em>.</li>
      <li>Kapsack, <em>Ethically Getting a Rise Out of Your Jurors</em> (rising-BAC trial approach).</li>
      <li>Watson, Watson &amp; Batt total-body-water equations.</li>
    </ul>

    <p class="v-disclaim">CalBAC is an educational and case-preparation aid. It does not determine guilt, impairment,
    or the legal sufficiency of evidence, and it is not a substitute for a qualified forensic toxicologist.</p>`;

  // ------------------------------------------- Wire live recompute ----------
  ['sex','age','weight','weightUnit','height','heightUnit','rMode','rFixed',
   'absorption','betaLow','betaMid','betaHigh','drivingTime','testTime',
   'testType','testResult'].forEach(id => {
    const e = $(id);
    if (e) e.addEventListener('input', recompute);
  });
  ['rTest','rHours','rBetaLow','rBetaMid','rBetaHigh'].forEach(id =>
    $(id).addEventListener('input', computeRetro));
  ['bReported','bRatio'].forEach(id => $(id).addEventListener('input', computeBreath));
  document.querySelectorAll('.biases input').forEach(c => c.addEventListener('change', computeBreath));

  // ------------------------------------------- Seed demo scenario -----------
  function seedDemo() {
    $('drivingTime').value = '23:45';
    $('testTime').value = '01:15';
    $('testResult').value = '0.10';
    drinks = [
      { id: nextId++, timeStr: '21:00', volumeOz: 12,  abvPct: 5,   name: 'Domestic lager (Budweiser)' },
      { id: nextId++, timeStr: '21:45', volumeOz: 12,  abvPct: 6.8, name: 'Craft IPA' },
      { id: nextId++, timeStr: '22:30', volumeOz: 1.5, abvPct: 40,  name: 'Tequila (shot)' },
      { id: nextId++, timeStr: '23:00', volumeOz: 12,  abvPct: 6.8, name: 'Craft IPA' },
      { id: nextId++, timeStr: '23:30', volumeOz: 1.5, abvPct: 40,  name: 'Tequila (shot)' },
    ];
    renderDrinks();
    recompute();
    computeRetro();
    computeBreath();
  }
  seedDemo();
})();
