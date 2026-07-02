/*
 * chart.js — Dependency-free SVG renderer for the BAC timeline
 * ----------------------------------------------------------------------------
 * Draws: shaded best/worst envelope, mid curve, California threshold lines,
 * vertical event markers (drinks, driving, test), axes, gridlines, and an
 * interactive crosshair readout. No external libraries — everything is inline
 * SVG so the app works fully offline and prints cleanly for exhibits.
 * ----------------------------------------------------------------------------
 */

const BACChart = (() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  // Format an hours-from-t0 value as a clock label using the scenario's t0 date.
  function fmtClock(hr, t0Date) {
    const d = new Date(t0Date.getTime() + hr * 3600 * 1000);
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }

  /**
   * @param {SVGElement} svg  target <svg> element (will be cleared)
   * @param {Object} model    { low, mid, high } curves + config
   */
  function render(svg, model) {
    const {
      low, mid, high, thresholds, events, t0Date,
      axisStartHr, axisEndHr, drivingHr, testHr,
    } = model;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = svg.viewBox.baseVal.width || 900;
    const H = svg.viewBox.baseVal.height || 460;
    const pad = { l: 52, r: 18, t: 20, b: 46 };
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;

    // Y-axis max: a little headroom above the highest point or 0.10.
    const peak = Math.max(
      0.1,
      ...high.map(p => p.bac),
      ...(thresholds ? thresholds.map(t => t.bac) : [])
    );
    const yMax = Math.ceil(peak * 1.15 * 100) / 100;

    const xOf = (t) => pad.l + ((t - axisStartHr) / (axisEndHr - axisStartHr)) * plotW;
    const yOf = (bac) => pad.t + plotH - (bac / yMax) * plotH;

    // ---- Gridlines + Y labels ----
    const yStep = yMax <= 0.12 ? 0.02 : 0.04;
    for (let b = 0; b <= yMax + 1e-9; b += yStep) {
      const y = yOf(b);
      svg.appendChild(el('line', {
        x1: pad.l, y1: y, x2: W - pad.r, y2: y,
        class: 'grid-line',
      }));
      const lbl = el('text', { x: pad.l - 8, y: y + 4, class: 'axis-label y' });
      lbl.textContent = b.toFixed(2);
      svg.appendChild(lbl);
    }

    // ---- X labels (every ~1 hr, but keep it readable) ----
    const span = axisEndHr - axisStartHr;
    const xStep = span > 8 ? 2 : 1;
    for (let t = Math.ceil(axisStartHr); t <= axisEndHr; t += xStep) {
      const x = xOf(t);
      svg.appendChild(el('line', {
        x1: x, y1: pad.t, x2: x, y2: pad.t + plotH, class: 'grid-line faint',
      }));
      const lbl = el('text', { x, y: H - pad.b + 18, class: 'axis-label x' });
      lbl.textContent = fmtClock(t, t0Date);
      svg.appendChild(lbl);
    }

    // ---- Threshold lines (0.08 etc.) ----
    (thresholds || []).forEach(th => {
      if (th.bac > yMax) return;
      const y = yOf(th.bac);
      svg.appendChild(el('line', {
        x1: pad.l, y1: y, x2: W - pad.r, y2: y,
        class: `threshold ${th.className}`,
      }));
      const lbl = el('text', { x: W - pad.r - 4, y: y - 5, class: `threshold-label ${th.className}` });
      lbl.textContent = th.label.split(' — ')[0];
      lbl.setAttribute('text-anchor', 'end');
      svg.appendChild(lbl);
    });

    // ---- Envelope (area between low and high) ----
    const areaPts = [
      ...high.map(p => `${xOf(p.t)},${yOf(p.bac)}`),
      ...low.slice().reverse().map(p => `${xOf(p.t)},${yOf(p.bac)}`),
    ].join(' ');
    svg.appendChild(el('polygon', { points: areaPts, class: 'bac-envelope' }));

    // ---- Curves ----
    const linePts = (curve) => curve.map(p => `${xOf(p.t)},${yOf(p.bac)}`).join(' ');
    svg.appendChild(el('polyline', { points: linePts(high), class: 'bac-line edge' }));
    svg.appendChild(el('polyline', { points: linePts(low), class: 'bac-line edge' }));
    svg.appendChild(el('polyline', { points: linePts(mid), class: 'bac-line mid' }));

    // ---- Event markers ----
    const marker = (t, cls, label, sub) => {
      if (t == null || t < axisStartHr || t > axisEndHr) return;
      const x = xOf(t);
      svg.appendChild(el('line', {
        x1: x, y1: pad.t, x2: x, y2: pad.t + plotH, class: `event-line ${cls}`,
      }));
      const tag = el('g', { class: `event-tag ${cls}` });
      const txt = el('text', { x: x, y: pad.t + 12, class: 'event-text' });
      txt.textContent = label;
      txt.setAttribute('text-anchor', 'middle');
      tag.appendChild(txt);
      if (sub) {
        const s = el('text', { x: x, y: pad.t + 26, class: 'event-sub' });
        s.textContent = sub;
        s.setAttribute('text-anchor', 'middle');
        tag.appendChild(s);
      }
      svg.appendChild(tag);
    };

    (events || []).forEach(ev => marker(ev.t, ev.cls, ev.label, ev.sub));
    marker(drivingHr, 'driving', '🚗 Driving', fmtClock(drivingHr, t0Date));
    marker(testHr, 'test', '🧪 Test', fmtClock(testHr, t0Date));

    // ---- Point readouts at driving & test ----
    const dot = (t, curve, cls) => {
      if (t == null) return;
      const bac = Science.bacAt(curve, t);
      const c = el('circle', { cx: xOf(t), cy: yOf(bac), r: 4.5, class: `bac-dot ${cls}` });
      svg.appendChild(c);
    };
    dot(drivingHr, mid, 'driving');
    dot(testHr, mid, 'test');

    // ---- Interactive crosshair ----
    const overlay = el('rect', {
      x: pad.l, y: pad.t, width: plotW, height: plotH,
      fill: 'transparent', style: 'cursor: crosshair',
    });
    const cross = el('line', { class: 'crosshair', x1: 0, y1: pad.t, x2: 0, y2: pad.t + plotH, style: 'display:none' });
    const readBox = el('g', { class: 'read-box', style: 'display:none' });
    const readBg = el('rect', { rx: 5, width: 132, height: 46, class: 'read-bg' });
    const readT = el('text', { class: 'read-t', x: 8, y: 17 });
    const readB = el('text', { class: 'read-b', x: 8, y: 34 });
    readBox.appendChild(readBg); readBox.appendChild(readT); readBox.appendChild(readB);
    svg.appendChild(cross); svg.appendChild(overlay); svg.appendChild(readBox);

    overlay.addEventListener('mousemove', (e) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = W / rect.width;
      const px = (e.clientX - rect.left) * scaleX;
      const t = axisStartHr + ((px - pad.l) / plotW) * (axisEndHr - axisStartHr);
      const bMid = Science.bacAt(mid, t);
      const bLow = Science.bacAt(low, t);
      const bHigh = Science.bacAt(high, t);
      cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      cross.style.display = '';
      readBox.style.display = '';
      let bx = px + 10; if (bx + 132 > W - pad.r) bx = px - 142;
      readBox.setAttribute('transform', `translate(${bx}, ${pad.t + 6})`);
      readT.textContent = fmtClock(t, t0Date);
      readB.textContent = `${bLow.toFixed(3)}–${bHigh.toFixed(3)} (mid ${bMid.toFixed(3)})`;
    });
    overlay.addEventListener('mouseleave', () => {
      cross.style.display = 'none';
      readBox.style.display = 'none';
    });

    // ---- Axis titles ----
    const yTitle = el('text', { class: 'axis-title', x: 14, y: pad.t + plotH / 2 });
    yTitle.textContent = 'BAC (g/dL)';
    yTitle.setAttribute('transform', `rotate(-90, 14, ${pad.t + plotH / 2})`);
    yTitle.setAttribute('text-anchor', 'middle');
    svg.appendChild(yTitle);
  }

  return { render, fmtClock };
})();
