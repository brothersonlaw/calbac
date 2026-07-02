/*
 * science.js — Forensic BAC modeling engine for CalBAC
 * ----------------------------------------------------------------------------
 * Pure, dependency-free functions. All math is transparent and documented so it
 * can be defended (or attacked) in court. Nothing here is a "black box."
 *
 * Primary models:
 *   - Widmark equation .......... BAC = A / (r * W) * 100 - beta * t
 *   - Watson TBW estimate of r .. gender/age/height/weight based body water
 *   - First-order absorption .... rising limb + gastric lag ("rising BAC")
 *   - Zero-order elimination .... constant beta decline (Dubowski)
 *   - Retrograde extrapolation .. back-calculate BAC to time of driving
 *   - Partition / blood:breath .. breath-test bias analysis
 *
 * Key literature values baked into the defaults (see /data + README citations):
 *   Elimination beta (g/dL/hr): Dubowski reports means ~0.015-0.018, whole
 *     population range roughly 0.006-0.040. We default the defense envelope to
 *     0.010 (slow) / 0.015 (mid) / 0.020 (fast).
 *   Widmark r: male mean ~0.68 (0.50-0.90), female mean ~0.55 (0.45-0.63).
 *   Time to peak after last drink: mean 57 min (men) / 42 min (women), highly
 *     variable — modeled via absorption rate ka + gastric lag.
 *   Blood:breath ratio: instruments assume 2100:1; real range ~1100:1-4200:1.
 * ----------------------------------------------------------------------------
 */

const Science = (() => {
  'use strict';

  // ---- Physical constants -------------------------------------------------
  const ETHANOL_DENSITY = 0.789;   // g/mL
  const OZ_TO_ML = 29.5735;        // fluid ounces -> milliliters
  const BLOOD_WATER_FRACTION = 0.806; // fraction of blood that is water

  // ---- Unit helpers -------------------------------------------------------
  const lbToKg = (lb) => lb * 0.45359237;
  const inToCm = (inches) => inches * 2.54;

  /**
   * Grams of pure ethanol in a single drink.
   * @param {number} volumeOz  serving volume in fluid ounces
   * @param {number} abvPct    alcohol by volume, as a percent (e.g. 5 for 5%)
   */
  function alcoholGrams(volumeOz, abvPct) {
    return volumeOz * OZ_TO_ML * (abvPct / 100) * ETHANOL_DENSITY;
  }

  // "Standard drink" in the US = 14 g of pure alcohol.
  const STANDARD_DRINK_G = 14;
  const standardDrinks = (grams) => grams / STANDARD_DRINK_G;

  /**
   * Total Body Water (liters) via the Watson equations.
   * Falls back gracefully if height/age are missing by using population means.
   */
  function watsonTBW({ sex, weightKg, heightCm, age }) {
    // Reasonable fallbacks so the tool still works with minimal input.
    const h = heightCm || (sex === 'female' ? 162 : 178);
    const a = age || 40;
    if (sex === 'female') {
      return -2.097 + 0.1069 * h + 0.2466 * weightKg;
    }
    return 2.447 - 0.09516 * a + 0.1074 * h + 0.3362 * weightKg;
  }

  /**
   * Widmark distribution ratio r (dimensionless).
   * Derived from Watson TBW: r = (TBW / bodyWeight) / bloodWaterFraction.
   * This ties the classic Widmark r to modern body-water science, exactly as
   * DUI-Pro-style tools do (Widmark + Watson).
   */
  function widmarkR({ sex, weightKg, heightCm, age }) {
    const tbw = watsonTBW({ sex, weightKg, heightCm, age });
    const r = (tbw / weightKg) / BLOOD_WATER_FRACTION;
    // Clamp to physiologically sane bounds.
    return Math.min(0.95, Math.max(0.40, r));
  }

  // Population reference ranges for r (used for best/worst envelopes & cross).
  const R_RANGE = {
    male:   { mean: 0.68, low: 0.55, high: 0.83 },
    female: { mean: 0.55, low: 0.45, high: 0.68 },
  };

  // Absorption presets: gastric lag (hr) + first-order absorption rate ka (1/hr).
  // Empty stomach absorbs fast (short time-to-peak); a full meal delays and
  // slows absorption, widening the "still absorbing while driving" window.
  const ABSORPTION_PRESETS = {
    empty:  { label: 'Empty stomach (fast)',   lagHr: 0.0,  ka: 6.0 },
    light:  { label: 'Light food',             lagHr: 0.17, ka: 3.5 },
    full:   { label: 'Full meal (slow)',       lagHr: 0.5,  ka: 1.8 },
  };

  /**
   * Fraction of a drink's alcohol absorbed into blood by time `t` (hours)
   * measured from when that drink was consumed. First-order kinetics after an
   * initial gastric lag. Returns 0..1.
   */
  function fractionAbsorbed(t, lagHr, ka) {
    const dt = t - lagHr;
    if (dt <= 0) return 0;
    return 1 - Math.exp(-ka * dt);
  }

  /**
   * Build a BAC-over-time curve for a set of drinks under one set of
   * assumptions.
   *
   * @param {Object} p
   * @param {Array}  p.drinks   [{ timeHr, grams }]  timeHr in hours from t0
   * @param {number} p.r        Widmark distribution ratio
   * @param {number} p.weightKg body weight in kg
   * @param {number} p.beta     elimination rate g/dL/hr
   * @param {number} p.lagHr    gastric lag
   * @param {number} p.ka       absorption rate constant
   * @param {number} p.startHr  earliest time on the axis (hr)
   * @param {number} p.endHr    latest time on the axis (hr)
   * @param {number} p.stepMin  sample interval in minutes
   * @returns {Array} [{ t, bac }]
   */
  function bacCurve(p) {
    const { drinks, r, weightKg, beta, lagHr, ka } = p;
    const stepHr = (p.stepMin || 3) / 60;
    const out = [];
    const firstDrink = drinks.length ? Math.min(...drinks.map(d => d.timeHr)) : 0;

    for (let t = p.startHr; t <= p.endHr + 1e-9; t += stepHr) {
      // Absorbed alcohol pool at time t (grams).
      let absorbedG = 0;
      for (const d of drinks) {
        const elapsed = t - d.timeHr;
        if (elapsed <= 0) continue;
        absorbedG += d.grams * fractionAbsorbed(elapsed, lagHr, ka);
      }
      // Convert absorbed pool to BAC via Widmark (grams / (r * grams) * 100).
      const grossBac = (absorbedG / (r * weightKg * 1000)) * 100;
      // Zero-order elimination begins once alcohol is present (after first drink).
      const elimHours = Math.max(0, t - firstDrink);
      const bac = Math.max(0, grossBac - beta * elimHours);
      out.push({ t, bac });
    }
    return out;
  }

  /** Linear interpolation of a curve at an arbitrary time. */
  function bacAt(curve, t) {
    if (!curve.length) return 0;
    if (t <= curve[0].t) return curve[0].bac;
    if (t >= curve[curve.length - 1].t) return curve[curve.length - 1].bac;
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].t >= t) {
        const a = curve[i - 1], b = curve[i];
        const f = (t - a.t) / (b.t - a.t);
        return a.bac + f * (b.bac - a.bac);
      }
    }
    return curve[curve.length - 1].bac;
  }

  /** Peak of a curve -> { t, bac }. */
  function peakOf(curve) {
    return curve.reduce((m, pt) => (pt.bac > m.bac ? pt : m), { t: 0, bac: -1 });
  }

  /**
   * Full scenario: computes low / mid / high BAC curves (the defense envelope)
   * plus derived readouts at the driving and test times.
   *
   * @param {Object} s scenario inputs (see app.js for shape)
   * @returns {Object} { mid, low, high, axis, readouts }
   */
  function runScenario(s) {
    const weightKg = s.weightUnit === 'kg' ? s.weight : lbToKg(s.weight);
    const heightCm = s.heightUnit === 'cm' ? s.height : inToCm(s.height);

    // Distribution ratio: either user-fixed or Watson-derived, with a
    // population low/high band for the envelope.
    let rMid, rLow, rHigh;
    if (s.rMode === 'fixed' && s.rFixed) {
      rMid = s.rFixed;
      rLow = s.rFixed;
      rHigh = s.rFixed;
    } else {
      rMid = widmarkR({ sex: s.sex, weightKg, heightCm, age: s.age });
      const band = R_RANGE[s.sex] || R_RANGE.male;
      // Lower r -> higher BAC (worst case for defendant); higher r -> lower BAC.
      rLow = Math.min(rMid, band.low);
      rHigh = Math.max(rMid, band.high);
    }

    const absorb = ABSORPTION_PRESETS[s.absorption] || ABSORPTION_PRESETS.light;

    // Normalize drink times to hours-from-t0 (t0 = first drink or driving-24h).
    const drinks = s.drinks.map(d => ({
      timeHr: d.timeHr,
      grams: alcoholGrams(d.volumeOz, d.abvPct),
    }));

    const axisStart = s.axisStartHr;
    const axisEnd = s.axisEndHr;

    const common = { drinks, weightKg, lagHr: absorb.lagHr, ka: absorb.ka,
                     startHr: axisStart, endHr: axisEnd, stepMin: 2 };

    // Envelope: worst case (high BAC) = low r + slow elimination;
    //           best case (low BAC)  = high r + fast elimination.
    const high = bacCurve({ ...common, r: rLow,  beta: s.betaLow  });
    const mid  = bacCurve({ ...common, r: rMid,  beta: s.betaMid  });
    const low  = bacCurve({ ...common, r: rHigh, beta: s.betaHigh });

    const readouts = {
      r: { low: rLow, mid: rMid, high: rHigh },
      totalGrams: drinks.reduce((a, d) => a + d.grams, 0),
      standardDrinks: standardDrinks(drinks.reduce((a, d) => a + d.grams, 0)),
      atDriving: s.drivingHr != null ? {
        low: bacAt(low, s.drivingHr),
        mid: bacAt(mid, s.drivingHr),
        high: bacAt(high, s.drivingHr),
      } : null,
      atTest: s.testHr != null ? {
        low: bacAt(low, s.testHr),
        mid: bacAt(mid, s.testHr),
        high: bacAt(high, s.testHr),
      } : null,
      peak: {
        low: peakOf(low), mid: peakOf(mid), high: peakOf(high),
      },
    };

    // Rising-BAC flag: at the driving time, is the mid curve still climbing?
    if (s.drivingHr != null) {
      const before = bacAt(mid, s.drivingHr - 0.05);
      const after = bacAt(mid, s.drivingHr + 0.05);
      readouts.risingAtDriving = after > before + 1e-4;
      readouts.peakAfterDriving = readouts.peak.mid.t > s.drivingHr + 0.02;
    }

    return { low, mid, high, readouts, meta: { rMid, rLow, rHigh, absorb } };
  }

  /**
   * Retrograde extrapolation. Given a measured BAC/BrAC at test time, estimate
   * BAC at an earlier driving time, assuming post-absorptive (elimination-only)
   * conditions. Returns a range across beta values.
   *
   * BAC_driving = BAC_test + beta * (t_test - t_driving)
   */
  function retrograde({ testBac, hoursBack, betaLow, betaMid, betaHigh }) {
    const calc = (beta) => testBac + beta * hoursBack;
    return {
      low: calc(betaLow),
      mid: calc(betaMid),
      high: calc(betaHigh),
      hoursBack,
    };
  }

  /**
   * Blood:breath / partition-ratio analysis for breath tests.
   *
   * A breath instrument assumes 2100:1. If a person's true ratio is lower, the
   * instrument OVER-reports; if higher, it UNDER-reports.
   *   trueBAC = reportedBrAC * (personRatio / 2100)
   *
   * Breathing/temperature biases (from the breath-test literature) are applied
   * as multiplicative adjustments to the reported reading before conversion.
   */
  const BREATH_BIASES = {
    hyperventilation20s: { label: 'Hyperventilated ~20s before test', factor: 0.89 }, // -11%
    holdBreath15s:       { label: 'Held breath ~15s before test',      factor: 1.12 }, // +12%
    prolongedExhalation: { label: 'Prolonged/forced exhalation',        factor: 1.16 }, // +16%
    elevatedBreathTemp:  { label: 'Elevated breath temp (+1°C)',        factor: 1.065 }, // ~+6.5%/°C
  };

  function partitionAnalysis({ reportedBrAC, personRatio, biases = [] }) {
    let adjusted = reportedBrAC;
    const applied = [];
    for (const key of biases) {
      const b = BREATH_BIASES[key];
      if (b) { adjusted *= b.factor; applied.push(b); }
    }
    const trueBac = adjusted * (personRatio / 2100);
    return {
      reportedBrAC,
      adjustedReading: adjusted,
      personRatio,
      trueBac,
      deltaFromReported: trueBac - reportedBrAC,
      applied,
    };
  }

  // California legal thresholds (per the Vehicle Code) used for the chart lines.
  const CA_THRESHOLDS = [
    { bac: 0.08, label: '0.08% — per se limit (VC 23152(b))', className: 'limit' },
    { bac: 0.05, label: '0.05% — impairment presumption', className: 'presumption' },
    { bac: 0.04, label: '0.04% — commercial driver limit', className: 'commercial' },
    { bac: 0.01, label: '0.01% — under-21 / DUI probation', className: 'zero' },
  ];

  return {
    ETHANOL_DENSITY, OZ_TO_ML, STANDARD_DRINK_G,
    lbToKg, inToCm,
    alcoholGrams, standardDrinks,
    watsonTBW, widmarkR, R_RANGE, ABSORPTION_PRESETS, BREATH_BIASES,
    fractionAbsorbed, bacCurve, bacAt, peakOf,
    runScenario, retrograde, partitionAnalysis,
    CA_THRESHOLDS,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Science;
