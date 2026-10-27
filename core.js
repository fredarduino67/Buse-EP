/* Buse EP — lecture du code des buses Europlacer
   Code : petit point = départ. 7 emplacements tous les 45° (sens horaire, vu comme sur les fiches).
   Emplacements 1..6 = 1,2,4,8,16,32. Emplacement 7 = point de contrôle (nombre total de gros points toujours pair). */
(function (root) {
  'use strict';

  function codeFromSlots(slots) { // slots: tableau de 7 booléens (emplacements 1..7)
    let n = 0, cnt = 0;
    for (let k = 0; k < 6; k++) if (slots[k]) { n += 1 << k; cnt++; }
    if (slots[6]) cnt++;
    return { numero: n, controleOK: cnt % 2 === 0 && n > 0 };
  }
  function slotsFromCode(n) {
    const s = [];
    let cnt = 0;
    for (let k = 0; k < 6; k++) { s.push(!!(n & (1 << k))); if (n & (1 << k)) cnt++; }
    s.push(cnt % 2 === 1);
    return s;
  }

  function otsu(g) {
    const h = new Array(256).fill(0);
    for (let i = 0; i < g.length; i++) h[g[i]]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * h[i];
    let sB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += h[t]; if (!wB) continue;
      const wF = g.length - wB; if (!wF) break;
      sB += t * h[t];
      const mB = sB / wB, mF = (sum - sB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; th = t; }
    }
    return th;
  }

  function blur(g, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let acc = 0, c = 0;
      for (let x = -r; x < w + r; x++) {
        if (x + r < w && x + r >= 0) { acc += g[y * w + x + r]; c++; }
        if (x - r - 1 >= 0) { acc -= g[y * w + x - r - 1]; c--; }
        if (x >= 0 && x < w) tmp[y * w + x] = acc / c;
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0, c = 0;
      for (let y = -r; y < h + r; y++) {
        if (y + r < h && y + r >= 0) { acc += tmp[(y + r) * w + x]; c++; }
        if (y - r - 1 >= 0) { acc -= tmp[(y - r - 1) * w + x]; c--; }
        if (y >= 0 && y < h) out[y * w + x] = acc / c;
      }
    }
    return out;
  }

  function morph(m, w, h, r, erode) { // érosion / dilatation carrée séparable
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; const p = xx < 0 || xx >= w ? (erode ? 0 : 0) : m[y * w + xx]; if (erode ? !p : p) { v = erode ? 0 : 1; break; } }
      t[y * w + x] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = erode ? 1 : 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; const p = yy < 0 || yy >= h ? 0 : t[yy * w + x]; if (erode ? !p : p) { v = erode ? 0 : 1; break; } }
      o[y * w + x] = v;
    }
    return o;
  }
  function components(mask, w, h) {
    const lab = new Int32Array(w * h), comps = [], stack = [];
    let id = 0;
    for (let i = 0; i < w * h; i++) {
      if (!mask[i] || lab[i]) continue;
      id++;
      let a = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, border = false;
      stack.push(i); lab[i] = id;
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p - x) / w;
        a++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
        if (x > 0 && mask[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack.push(p - 1); }
        if (x < w - 1 && mask[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack.push(p + 1); }
        if (y > 0 && mask[p - w] && !lab[p - w]) { lab[p - w] = id; stack.push(p - w); }
        if (y < h - 1 && mask[p + w] && !lab[p + w]) { lab[p + w] = id; stack.push(p + w); }
      }
      const cx = sx / a, cy = sy / a;
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      comps.push({
        a, cx, cy, bw, bh, border,
        vxx: sxx / a - cx * cx, vyy: syy / a - cy * cy, vxy: sxy / a - cx * cy,
        fill: a / (Math.PI * bw * bh / 4)
      });
    }
    return comps;
  }

  // Ellipse (via moments ou conique) -> transformation vers un cercle
  function normFromMoments(vxx, vyy, vxy) {
    // matrice de covariance C ; on veut M = C^-1/2 (à un facteur près)
    const tr = vxx + vyy, det = vxx * vyy - vxy * vxy;
    const s = Math.sqrt(Math.max(det, 1e-9)), t = Math.sqrt(tr + 2 * s);
    // sqrt(C) = (C + s I)/t ; inverse :
    const a = (vxx + s) / t, b = vxy / t, d = (vyy + s) / t;
    const dt = a * d - b * b;
    return [d / dt, -b / dt, -b / dt, a / dt];
  }
  function fitConic(pts) { // ajustement ellipse sur points (>=5) : a x2 + b xy + c y2 + d x + e y = 1
    const n = pts.length; if (n < 5) return null;
    let mx = 0, my = 0; for (const [x, y] of pts) { mx += x / n; my += y / n; }
    let sc = 0; for (const [x, y] of pts) sc += Math.hypot(x - mx, y - my) / n;
    if (!(sc > 0)) return null;
    const A = [], B = [];
    for (const [px, py] of pts) { const x = (px - mx) / sc, y = (py - my) / sc; A.push([x * x, x * y, y * y, x, y]); B.push(1); }
    // moindres carrés : (AtA) p = At B
    const M = Array.from({ length: 5 }, () => new Array(6).fill(0));
    for (let i = 0; i < n; i++) for (let r = 0; r < 5; r++) { for (let c = 0; c < 5; c++) M[r][c] += A[i][r] * A[i][c]; M[r][5] += A[i][r] * B[i]; }
    for (let c = 0; c < 5; c++) {
      let piv = c; for (let r = c + 1; r < 5; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = 0; r < 5; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k < 6; k++) M[r][k] -= f * M[c][k]; }
    }
    const [a, b, c, d, e] = M.map((row, i) => row[5] / row[i]);
    if (4 * a * c - b * b <= 0) return null;
    const den = 4 * a * c - b * b;
    const x0 = (b * e - 2 * c * d) / den, y0 = (b * d - 2 * a * e) / den;
    // forme quadratique Q = [[a, b/2],[b/2, c]] ; normalisation = Q^1/2
    const s = Math.sqrt(a * c - b * b / 4), t = Math.sqrt(a + c + 2 * s);
    return { x0: mx + x0 * sc, y0: my + y0 * sc, m: [(a + s) / t, (b / 2) / t, (b / 2) / t, (c + s) / t] };
  }

  /* Analyse une image en niveaux de gris (zone recadrée autour de la face de la buse).
     Retourne { ok, numero, slots, points, message, score } */
  function analyse(gray, w, h, opts) {
    opts = opts || {};
    const g = blur(gray, w, h, Math.max(1, Math.round(w / 200)));
    const t1 = otsu(g);
    const lowPx = []; for (let i = 0; i < g.length; i++) if (g[i] < t1) lowPx.push(g[i]);
    const t2 = lowPx.length > 100 ? otsu(Uint8Array.from(lowPx)) : t1;
    let best = null;
    for (const th of [t1, Math.round((t1 + t2) / 2), t2]) {
      const r = analyseTh(g, w, h, th, !!opts.mirror);
      if (!best || (r.score || -1e9) > (best.score || -1e9)) best = r;
      if (r.ok) break;
    }
    return best;
  }
  function analyseTh(g, w, h, th, mirror) {
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = g[i] < th ? 1 : 0;
    const rr = Math.max(1, Math.round(w / 130));
    const er = morph(mask, w, h, rr, true); mask.set(morph(er, w, h, rr, false));
    const minA = w * h * 0.0006;
    let comps = components(mask, w, h).filter(c => !c.border && c.a > minA && c.fill > 0.55 && c.bw < w * 0.45 && c.bh < h * 0.45 &&
      Math.max(c.bw, c.bh) / Math.min(c.bw, c.bh) < 2.6);
    if (comps.length < 2) return { ok: false, message: 'Points non trouvés' };
    const mid = [w / 2, h / 2];
    // candidats « trou central » : composantes sombres (pièce réelle) ou claires (fiche à l'écran)
    const sub = []; for (let i = 0; i < w * h; i++) if (!mask[i]) sub.push(g[i]);
    const tb = otsu(Uint8Array.from(sub));
    const bm = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) bm[i] = g[i] > tb ? 1 : 0;
    const holes = comps.concat(components(bm, w, h).filter(c => !c.border && c.a > minA && c.fill > 0.6 && c.a < w * h * 0.25 &&
      Math.max(c.bw, c.bh) / Math.min(c.bw, c.bh) < 2.6)).filter(c => c.a > minA * 4);
    let best = null;
    for (const H of holes) {
      const M = normFromMoments(H.vxx, H.vyy, H.vxy); // unité ~ rayon du trou / 2
      const rs = [];
      for (const c of comps) {
        if (c === H) continue;
        const x = c.cx - H.cx, y = c.cy - H.cy;
        const u = M[0] * x + M[1] * y, v = M[2] * x + M[3] * y;
        rs.push({ c, r: Math.hypot(u, v) / 2 });
      }
      for (const ref of rs) {
        const rho = ref.r;
        if (rho < 1.4 || rho > 3.8) continue;
        const grp = rs.filter(o => Math.abs(o.r - rho) < 0.18 * rho && o.c.a * 1.8 < H.a);
        if (grp.length < 2) continue;
        const ar = grp.map(o => o.c.a).sort((a, b) => a - b);
        const medG = ar[Math.floor(ar.length / 2)];
        if (ar[0] > 0.6 * medG || (ar.length > 2 && ar[1] < 0.6 * medG)) continue; // exactement un petit repère
        const sc = grp.length - Math.abs(Math.hypot(H.cx - mid[0], H.cy - mid[1])) / w;
        if (!best || sc > best.sc) best = { sc, H, M, grp };
      }
    }
    if (!best || best.grp.length < 2) return { ok: false, message: 'Points non trouvés' };
    const hole = best.H;
    // regroupement autour du rayon médian
    let dots = best.grp.map(o => o.c);
    const maxA = Math.max(...dots.map(d => d.a));
    dots = dots.filter(d => d.a > maxA * 0.12);
    if (dots.length > 8) dots = dots.sort((a, b) => b.a - a.a).slice(0, 8);
    dots.sort((a, b) => a.a - b.a);
    const small = dots[0], bigs = dots.slice(1);
    if (!bigs.length) return { ok: false, message: 'Pas de gros point' };
    const medBig = bigs.map(d => d.a).sort((a, b) => a - b)[Math.floor(bigs.length / 2)];
    if (small.a > medBig * 0.7) return { ok: false, message: 'Petit repère non trouvé' };

    // normalisation perspective
    let M = best.M, O = [hole.cx, hole.cy];
    const conic = dots.length >= 5 ? fitConic(dots.map(d => [d.cx, d.cy])) : null;
    if (conic) { M = conic.m; O = [conic.x0, conic.y0]; }
    const ang = d => {
      const x = d.cx - O[0], y = d.cy - O[1];
      const u = M[0] * x + M[1] * y, v = M[2] * x + M[3] * y;
      return Math.atan2(u, -v) * 180 / Math.PI; // 0 = haut, sens horaire
    };
    const a0 = ang(small);
    const slots = new Array(7).fill(false);
    let err = 0, conflict = false;
    const pts = [{ x: small.cx, y: small.cy, r: Math.sqrt(small.a / Math.PI), k: 0 }];
    for (const d of bigs) {
      let rel = ((ang(d) - a0) % 360 + 360) % 360;
      if (mirror) rel = (360 - rel) % 360;
      const k = Math.round(rel / 45);
      err = Math.max(err, Math.abs(rel - k * 45));
      if (k < 1 || k > 7) { conflict = true; continue; }
      if (slots[k - 1]) conflict = true;
      slots[k - 1] = true;
      pts.push({ x: d.cx, y: d.cy, r: Math.sqrt(d.a / Math.PI), k });
    }
    const res = codeFromSlots(slots);
    const ok = res.controleOK && !conflict && err < 20;
    return {
      ok, numero: res.numero, slots, points: pts, err: Math.round(err),
      center: O, message: ok ? '' : (conflict ? 'Points mal placés' : err >= 20 ? 'Angle incertain' : 'Point de contrôle incorrect'),
      score: (ok ? 100 : 0) - err + Math.min(dots.length, 7)
    };
  }

  const api = { analyse, codeFromSlots, slotsFromCode };
  if (typeof module !== 'undefined') module.exports = api; else root.BuseCore = api;
})(this);
