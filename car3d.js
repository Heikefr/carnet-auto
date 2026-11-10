/* Voiture 3D originale (compacte sportive 5 portes) — modèle procédural + rendu WebGL2, sans dépendance */
(function (root) {
"use strict";

/* ---------- outils ---------- */
function pchip(keys) {
  const n = keys.length, xs = keys.map(k => k[0]), ys = keys.map(k => k[1]);
  const h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return x => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- gabarit ---------- */
const XR = -2.175, XF = 2.175;            // extrémités arrière / avant
const AXF = 1.28, AXR = -1.34, YW = 0.338; // essieux, hauteur de moyeu
const RA = 0.368;                          // rayon du passage de roue
const ZF0 = 1.70, ZR0 = -1.86, PF = 2.5, PR = 3.1;

const yS = pchip([[-2.175, 1.0], [-1.9, 1.025], [-1.3, 1.0], [-0.5, 0.95], [0.3, 0.915], [0.9, 0.89], [1.3, 0.855], [1.8, 0.785], [2.05, 0.72], [2.175, 0.68]]);
const yT = pchip([[-2.175, 1.0], [-2.08, 1.03], [-1.95, 1.065], [-1.50, 1.295], [-1.43, 1.313], [-0.9, 1.385], [-0.25, 1.412], [0.06, 1.375], [0.14, 1.345], [0.52, 1.16], [0.86, 0.975], [0.94, 0.948], [1.25, 0.925], [1.65, 0.87], [2.0, 0.775], [2.175, 0.70]]);
const dRE = pchip([[-2.175, 0.008], [-1.95, 0.03], [-1.45, 0.055], [0.0, 0.058], [0.5, 0.05], [0.92, 0.03], [1.9, 0.028], [2.175, 0.01]]);
const wSill = pchip([[-2.175, 0.865], [-1.32, 0.888], [-0.2, 0.872], [1.30, 0.888], [2.175, 0.86]]);
const wBelt = pchip([[-2.175, 0.80], [-1.3, 0.845], [0, 0.852], [1.3, 0.842], [2.175, 0.79]]);
const wRoof = pchip([[-2.175, 0.72], [-1.97, 0.67], [-1.46, 0.555], [-0.4, 0.585], [0.08, 0.59], [0.9, 0.74], [1.3, 0.70], [2.175, 0.60]]);
const yB = pchip([[-2.175, 0.34], [-1.95, 0.25], [-1.6, 0.175], [1.5, 0.16], [1.95, 0.175], [2.175, 0.24]]);

const K = 7, NSPAN = 9, J = NSPAN * K;   // points par demi-section = J+1

function stations() {
  const out = [], n = 46;
  for (let k = n; k >= 1; k--) { const th = (k / n) * Math.PI / 2 * 0.985; out.push({ x: ZR0 - (ZR0 - XR) * Math.pow(Math.sin(th), 2 / PR), tp: Math.pow(Math.cos(th), 2 / PR) }); }
  const nm = Math.round((ZF0 - ZR0) / 0.024);
  for (let k = 0; k <= nm; k++) out.push({ x: ZR0 + (ZF0 - ZR0) * k / nm, tp: 1 });
  for (let k = 1; k <= n; k++) { const th = (k / n) * Math.PI / 2 * 0.985; out.push({ x: ZF0 + (XF - ZF0) * Math.pow(Math.sin(th), 2 / PF), tp: Math.pow(Math.cos(th), 2 / PF) }); }
  const ex = (x0, x1, p) => [0.991, 0.996, 0.9992].map(f => { const th = f * Math.PI / 2; return { x: x0 + (x1 - x0) * Math.pow(Math.sin(th), 2 / p), tp: Math.pow(Math.cos(th), 2 / p) }; });
  out.unshift(...ex(ZR0, XR, PR).reverse()); out.push(...ex(ZF0, XF, PF));
  out.unshift({ x: XR, tp: 0 }); out.push({ x: XF, tp: 0 });
  return out;
}

function section(x, tp) {
  const wS = wSill(x) * tp, wB = wBelt(x) * tp, wR = wRoof(x) * tp;
  const yb = yB(x), ys = yS(x), yt = yT(x), yre = Math.max(yt - dRE(x), ys + 0.008);
  const C = [
    [0, yb], [0.55 * wS, yb], [wS - 0.05 * tp, yb + 0.012], [wS, yb + 0.095],
    [wS - 0.006 * tp, yb + 0.52 * (ys - yb)], [wB + 0.004 * tp, ys - 0.065], [wB - 0.03 * tp, ys],
    [wR, yre], [0.55 * wR, yt - 0.013], [0, yt]
  ];
  const kk = [1, 0.9, 0.75, 0.8, 1, 0.85, 0.7, 0.75, 1, 1];
  const dir = C.map((c, i) => {
    if (i === 0) return [1, 0]; if (i === C.length - 1) return [-1, 0];
    const a = C[i - 1], b = C[i + 1]; const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l];
  });
  const pts = [];
  for (let i = 0; i < NSPAN; i++) {
    const a = C[i], b = C[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m0 = [dir[i][0] * L * kk[i], dir[i][1] * L * kk[i]], m1 = [dir[i + 1][0] * L * kk[i + 1], dir[i + 1][1] * L * kk[i + 1]];
    for (let k = 0; k < K; k++) {
      const t = k / K, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      pts.push([h00 * a[0] + h10 * m0[0] + h01 * b[0] + h11 * m1[0], h00 * a[1] + h10 * m0[1] + h01 * b[1] + h11 * m1[1], i + t]);
    }
  }
  pts.push([0, yt, NSPAN]);
  return pts;
}

function sdRB(px, py, bx, by, r) { const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; }
function deform(x, y, z, s) {
  // galbe des ailes autour des roues
  if (s > 1.5 && s < 6.2) {
    for (const ax of [AXF, AXR]) {
      const r = Math.hypot(x - ax, y - YW);
      const b = 0.03 * Math.exp(-Math.pow((r - 0.41) / 0.085, 2)) * sstep(YW - 0.25, YW + 0.05, y);
      z += Math.sign(z) * b * sstep(0, 0.2, Math.abs(z));
    }
  }
  // flancs creusés entre les roues
  if (s > 2.9 && s < 5.2) { const w = sstep(AXR + 0.40, AXR + 0.72, x) * sstep(AXF - 0.40, AXF - 0.72, x); z -= Math.sign(z) * 0.016 * w * Math.exp(-Math.pow((y - 0.42) / 0.085, 2)); }
  // calandre et entrées d'air en retrait
  if (x > 1.7) { const az = Math.abs(z);
    const d1 = sdRB(z, y - 0.405, 0.50, 0.105, 0.05), d2 = sdRB(az - 0.70, y - 0.355, 0.085, 0.062, 0.03);
    x -= 0.045 * sstep(0.0, -0.05, d1) + 0.03 * sstep(0.0, -0.035, d2); }
  // inclinaison des faces avant et arrière
  const wf = sstep(1.5, 2.175, x), wr = sstep(-1.72, -2.175, x);
  x -= wf * (0.12 * sstep(0.56, 0.82, y) + 0.05 * sstep(0.42, 0.2, y));
  x += wr * (0.11 * sstep(0.78, 1.06, y) + 0.08 * sstep(0.5, 0.27, y));
  return [x, y, z];
}

/* ---------- construction du maillage ---------- */
function build() {
  const P = [], N = [], SM = [], I = [];
  const push = (p, n, s, m) => { P.push(p[0], p[1], p[2]); N.push(n[0], n[1], n[2]); SM.push(s, m); return P.length / 3 - 1; };

  // carrosserie
  const st = stations(), R = 2 * J, grid = [];
  for (const s of st) {
    const half = section(s.x, s.tp), ring = [];
    for (let j = 0; j <= J; j++) ring.push([...deform(s.x, half[j][1], half[j][0], half[j][2]), half[j][2]]);
    for (let j = J - 1; j >= 1; j--) ring.push([...deform(s.x, half[j][1], -half[j][0], half[j][2]), half[j][2]]);
    grid.push(ring);
  }
  const base = 0, ns = st.length;
  for (let i = 0; i < ns; i++) for (let j = 0; j < R; j++) {
    const a = grid[Math.max(0, i - 1)][j], b = grid[Math.min(ns - 1, i + 1)][j], c = grid[i][(j + R - 1) % R], d = grid[i][(j + 1) % R];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    let l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) { n = [i < ns / 2 ? -1 : 1, 0, 0]; l = 1; }
    push(grid[i][j], [n[0] / l, n[1] / l, n[2] / l], grid[i][j][3], 0);
  }
  for (let j = 0; j < R; j++) for (let k = 0; k < 3; k++) { for (const [dst, src] of [[k, 5], [ns - 1 - k, ns - 6]]) for (let q = 0; q < 3; q++) N[(dst * R + j) * 3 + q] = N[(src * R + j) * 3 + q]; }
  for (let i = 0; i < ns - 1; i++) for (let j = 0; j < R; j++) {
    const a = base + i * R + j, b = base + (i + 1) * R + j, c = base + (i + 1) * R + (j + 1) % R, d = base + i * R + (j + 1) % R;
    I.push(a, b, c, a, c, d);
  }

  // révolution autour de l'axe transversal
  function lathe(cx, cy, cz, side, prof, mat, seg, a0, a1) {
    seg = seg || 48; const b0 = P.length / 3; if (a0 == null) { a0 = 0; a1 = Math.PI * 2; }
    for (let k = 0; k < prof.length; k++) {
      const p = prof[k], pa = prof[Math.max(0, k - 1)], pb = prof[Math.min(prof.length - 1, k + 1)];
      let ta = pb[0] - pa[0], tr = pb[1] - pa[1]; const tl = Math.hypot(ta, tr) || 1; ta /= tl; tr /= tl;
      for (let q = 0; q <= seg; q++) {
        const th = a0 + q / seg * (a1 - a0), c = Math.cos(th), s = Math.sin(th);
        push([cx + p[1] * c, cy + p[1] * s, cz + side * p[0]], [ta * c, ta * s, -side * tr], -1, mat);
      }
    }
    for (let k = 0; k < prof.length - 1; k++) for (let q = 0; q < seg; q++) {
      const a = b0 + k * (seg + 1) + q, b = a + 1, c = a + seg + 1, d = c + 1; I.push(a, c, b, b, c, d);
    }
  }

  // boîte orientée (8 sommets, normales plates)
  function quad(a, b, c, d, mat) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(n[0], n[1], n[2]) || 1; n = [n[0] / l, n[1] / l, n[2] / l];
    const i0 = push(a, n, -1, mat), i1 = push(b, n, -1, mat), i2 = push(c, n, -1, mat), i3 = push(d, n, -1, mat); I.push(i0, i1, i2, i0, i2, i3);
  }
  function hexa(v, mat) { // v: 8 sommets [bas 0..3, haut 4..7]
    quad(v[0], v[1], v[2], v[3], mat); quad(v[4], v[5], v[6], v[7], mat);
    for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; quad(v[k], v[n], v[n + 4], v[k + 4], mat); }
  }

  // roues
  const tire = [], TW = 0.112, TR = 0.335;
  for (let k = 0; k <= 24; k++) { const t = k / 24 * Math.PI - Math.PI / 2; const a = Math.sin(t), c = Math.cos(t); tire.push([TW * Math.sign(a) * Math.pow(Math.abs(a), 0.55), 0.248 + (TR - 0.248) * Math.pow(c, 0.42)]); }
  for (const ax of [AXF, AXR]) for (const side of [1, -1]) {
    const zo = wSill(ax) - 0.018, cz = side * (zo - TW);
    lathe(ax, YW, cz, side, tire, 1, 56);
    lathe(ax, YW, cz, side, [[TW - 0.004, 0.25], [TW - 0.002, 0.24], [TW - 0.02, 0.232], [-0.09, 0.22]], 2, 56);   // rebord + fût de jante
    lathe(ax, YW, cz, side, [[-0.02, 0.0], [-0.02, 0.165], [0.0, 0.165], [0.0, 0.0]], 5, 40);                      // disque de frein
    lathe(ax, YW, cz, side, [[0.02, 0.085], [0.07, 0.078], [0.084, 0.06], [0.086, 0.034]], 2, 32);                   // moyeu
    lathe(ax, YW, cz, side, [[TW - 0.001, 0.252], [TW + 0.003, 0.246], [TW - 0.001, 0.238]], 8, 56);            // rebord poli
    for (let q = 0; q < 5; q++) for (const off of [-1, 1]) {                                                       // 5 branches en Y
      const t0 = q / 5 * Math.PI * 2 + Math.PI / 2, th = t0 + off * 0.2, th2 = t0 + off * 0.235;
      const mk = (r, th, hw, a0, a1) => { const c = Math.cos(th), s = Math.sin(th); const o = [ax + r * c, YW + r * s], t = [-s * hw, c * hw];
        return [[o[0] - t[0], o[1] - t[1], cz + side * a0], [o[0] + t[0], o[1] + t[1], cz + side * a0], [o[0] + t[0], o[1] + t[1], cz + side * a1], [o[0] - t[0], o[1] - t[1], cz + side * a1]]; };
      const A = mk(0.062, th, 0.013, 0.03, 0.074), B = mk(0.238, th2, 0.011, 0.07, 0.102);
      const v = [A[0], A[1], B[1], B[0], A[3], A[2], B[2], B[3]];
      quad(v[0], v[1], v[2], v[3], 2); quad(v[4], v[5], v[6], v[7], 8);
      for (let k = 0; k < 4; k++) { const n = (k + 1) % 4; quad(v[k], v[n], v[n + 4], v[k + 4], 2); }
    }
    lathe(ax, YW, cz, side, [[0.086, 0.0], [0.088, 0.03], [0.084, 0.034]], 8, 24);                                // cache-moyeu
    // étrier
    { const th = ax > 0 ? 0.5 : Math.PI - 0.5, c = Math.cos(th), s = Math.sin(th), r0 = 0.105, r1 = 0.18, hw = 0.055;
      const pt = (r, w, a) => [ax + r * c - s * w, YW + r * s + c * w, cz + side * a];
      hexa([pt(r0, -hw, -0.03), pt(r0, hw, -0.03), pt(r1, hw, -0.03), pt(r1, -hw, -0.03), pt(r0, -hw, 0.03), pt(r0, hw, 0.03), pt(r1, hw, 0.03), pt(r1, -hw, 0.03)], 7); }
    // doublure du passage de roue
    lathe(ax, YW, side * (zo - 0.35), side, [[0, 0], [0, RA + 0.01], [0.36, RA + 0.01]], 3, 48, -0.42, Math.PI + 0.42);
  }

  // rétroviseurs
  for (const side of [1, -1]) {
    const c = [0.70, 0.99, side * 0.905], r = [0.105, 0.058, 0.09], b0 = P.length / 3, U = 20, V = 12;
    for (let v = 0; v <= V; v++) for (let u = 0; u <= U; u++) {
      const ph = v / V * Math.PI, th = u / U * Math.PI * 2; const n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      const back = n[0] < 0, fx = back ? 0.22 : 1, out = side * n[2];
      push([c[0] + r[0] * n[0] * fx - 0.035 * n[1] + 0.03 * out, c[1] + r[1] * n[1] * (1 - 0.18 * Math.max(0, out)), c[2] + r[2] * n[2]], back ? [-1, 0.1 * n[1], 0.1 * n[2]] : n, -1, back && n[0] < -0.3 ? 6 : 4);
    }
    for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) { const a = b0 + v * (U + 1) + u, b = a + 1, d = a + U + 1, e = d + 1; I.push(a, d, b, b, d, e); }
    const z0 = side * 0.775, z1 = side * 0.845;  // pied
    hexa([[0.76, 0.93, z0], [0.64, 0.93, z0], [0.655, 0.945, z1], [0.745, 0.945, z1], [0.745, 0.962, z0], [0.655, 0.962, z0], [0.665, 0.968, z1], [0.735, 0.968, z1]], 6);
  }
  // antenne aileron
  { const x0 = -1.02, x1 = -1.26, yb0 = yT(x0) - 0.004, yb1 = yT(x1) - 0.004;
    const tri = (z) => [[x0, yb0, z * 0.6], [x1, yb1, z], [x1 + 0.02, yb1 + 0.052, z * 0.25], [x1 + 0.09, yb1 + 0.045, z * 0.2]];
    const L = tri(0.022), Rr = tri(-0.022);
    quad(L[0], L[3], L[2], L[1], 4); quad(Rr[0], Rr[1], Rr[2], Rr[3], 4); quad(L[1], L[2], Rr[2], Rr[1], 4); quad(L[2], L[3], Rr[3], Rr[2], 4); quad(L[3], L[0], Rr[0], Rr[3], 4); }

  // becquet de toit : prolonge la courbure du pavillon (normales lissées)
  function gridMesh(rows, mat, flip) {
    const b0 = P.length / 3, nr = rows.length, nc = rows[0].length;
    for (let r = 0; r < nr; r++) for (let k = 0; k < nc; k++) {
      const a = rows[Math.max(0, r - 1)][k], b = rows[Math.min(nr - 1, r + 1)][k], c = rows[r][Math.max(0, k - 1)], d = rows[r][Math.min(nc - 1, k + 1)];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = (Math.hypot(n[0], n[1], n[2]) || 1) * (flip ? -1 : 1);
      push(rows[r][k], [n[0] / l, n[1] / l, n[2] / l], -1, mat);
    }
    for (let r = 0; r < nr - 1; r++) for (let k = 0; k < nc - 1; k++) { const a = b0 + r * nc + k, b = a + 1, c = a + nc, d = c + 1; I.push(a, c, b, b, c, d); }
  }
  { const xa = AXR - 0.10, xb = AXR - 0.31, half = section(xa, 1).filter(q => q[2] >= 7.12), line = [];
    for (let k = 0; k < half.length; k++) line.push([half[k][0], half[k][1]]);
    for (let k = half.length - 2; k >= 0; k--) line.push([-half[k][0], half[k][1]]);
    const xsr = [xa + 0.05, xa - 0.05, xa - 0.13, xb], top = [], bot = [];
    for (const x of xsr) { const f = (xa + 0.05 - x) / (xa + 0.05 - xb); top.push(line.map(q => [x, q[1] + 0.006 - (xa - x) * 0.085 * (x < xa ? 1 : 0) - (x > xa ? (yT(xa) - yT(x)) : 0), q[0] * (1 + 0.035 * f)])); bot.push(line.map(q => [x, q[1] - 0.03 + 0.022 * f - (xa - x) * 0.085 * (x < xa ? 1 : 0) - (x > xa ? (yT(xa) - yT(x)) : 0), q[0] * (1 + 0.035 * f)])); }
    gridMesh(top, 4, false); gridMesh(bot, 6, true);
    const nl = line.length, tl = top[top.length - 1], bl = bot[bot.length - 1];
    for (let k = 0; k < nl - 1; k++) quad(tl[k], tl[k + 1], bl[k + 1], bl[k], 6);
    for (const k of [0, nl - 1]) for (let r = 0; r < xsr.length - 1; r++) quad(top[r][k], top[r + 1][k], bot[r + 1][k], bot[r][k], 6); }

  return { P: new Float32Array(P), N: new Float32Array(N), SM: new Float32Array(SM), I: new Uint32Array(I) };
}

/* ---------- shaders ---------- */
const VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aSM;
uniform mat4 uVP; uniform mat3 uRot;
out vec3 vObj; out vec3 vW; out vec3 vN; out float vS; out float vMat;
void main(){ vObj=aPos; vec3 w=uRot*aPos; vW=w; vN=uRot*aNrm; vS=aSM.x; vMat=aSM.y; gl_Position=uVP*vec4(w,1.0); }`;

const FS = `#version 300 es
precision highp float;
in vec3 vObj; in vec3 vW; in vec3 vN; in float vS; in float vMat;
uniform vec3 uCam; uniform vec3 uPaint; uniform float uDark;
out vec4 o;
const float AXF=${AXF.toFixed(3)}, AXR=${AXR.toFixed(3)}, YW=${YW.toFixed(3)}, RA=${RA.toFixed(3)};
float aa(float d){ return clamp(d/max(fwidth(d),1e-5)+0.5,0.0,1.0); }
float sdRB(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r; }

vec3 env(vec3 d, float r){
  float soft=mix(0.012,0.55,r);
  vec3 zen=vec3(0.02,0.022,0.027);
  vec3 hor=mix(vec3(0.13,0.135,0.15),vec3(0.07,0.075,0.085),uDark);
  vec3 flo=mix(vec3(0.075,0.077,0.085),vec3(0.012,0.012,0.014),uDark);
  vec3 c=mix(flo*mix(0.75,1.0,smoothstep(-0.9,0.0,d.y)), mix(hor,zen,smoothstep(0.0,0.85,d.y)), smoothstep(-soft*0.5-0.004,soft*0.5+0.004,d.y));
  c+=mix(vec3(0.20,0.21,0.23),vec3(0.22,0.235,0.26),uDark)*exp(-pow(d.y/(0.06+soft*0.6),2.0));
  c+=vec3(0.50,0.52,0.57)*smoothstep(0.21-soft*0.4,0.235+soft*0.4,d.y)*smoothstep(0.34+soft*0.4,0.30-soft*0.4,d.y);
  if(d.y>0.02){
    vec2 p=d.xz*(3.0/d.y); float e=soft*3.0+0.045; float key=mix(6.5,7.5,uDark);
    vec2 g=p*vec2(0.2,0.55); c+=key*0.13*exp(-dot(g,g));
    c+=key*smoothstep(5.2+e*2.0,5.2-e*2.0,abs(p.x))*smoothstep(0.16+e,0.16-e,abs(abs(p.y)-1.45));
    c+=key*0.45*smoothstep(6.5+e*2.0,6.5-e*2.0,abs(p.x))*smoothstep(0.3+e,0.3-e,abs(abs(p.y)-4.4));
  }
  return c;
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }

void main(){
  vec3 p=vObj; float s=vS; float az=abs(p.z);
  vec3 N=normalize(vN); vec3 V=normalize(uCam-vW);
  vec3 base=uPaint; float metal=0.55, rough=0.42, coat=1.0, coatF0=0.045; vec3 emit=vec3(0.0); float ao=1.0; vec3 tint=vec3(1.0);
  int mat=int(vMat+0.5);
  if(mat==0){
    if(!gl_FrontFacing){ o=vec4(0.004,0.004,0.005,1.0); return; }
    float rw=min(length(p.xy-vec2(AXF,YW)),length(p.xy-vec2(AXR,YW)));
    if(s>0.95&&s<6.3&&rw<RA) discard;
    float sv=s<5.0?(s-5.0)*0.25:(s-5.0)*0.065;         // hauteur métrique autour de la ligne d'épaule
    float black=0.0, glass=0.0;
    float below=step(2.9,s)*step(s,6.0);
    // bas de caisse, lèvre des passages de roue
    black=max(black,1.0-aa(s-2.9));
    black=max(black,(1.0-aa(rw-RA-0.014))*step(1.0,s)*step(s,6.3));
    // vitrages latéraux
    float gs=s-6.0;
    float sideG=aa(gs-0.085)*aa(0.9-gs)*aa(0.72-p.x)*aa(p.x-(-1.58+0.42*gs))*step(6.0,s)*step(s,7.0);
    float pil=max(1.0-aa(abs(p.x+0.165)-0.045),1.0-aa(abs(p.x+1.03)-0.022));
    // pare-brise, lunette, toit vitré
    float ws=aa(s-7.2)*aa(p.x-0.125)*aa(0.875-p.x-0.05*(9.0-s));
    float rw2=aa(s-7.26)*aa(-1.535-p.x)*aa(p.x+1.955);
    float wsI=aa(s-7.36)*aa(p.x-0.165)*aa(0.80-p.x-0.05*(9.0-s));
    float rwI=aa(s-7.42)*aa(-1.575-p.x)*aa(p.x+1.915);
    float frit=max(ws-wsI,rw2-rwI);
    float cowl=aa(s-7.05)*aa(p.x-0.845+0.05*(9.0-s))*aa(0.935-p.x-0.05*(9.0-s));
    float roofG=(1.0-aa(sdRB(vec2(p.x+0.50,p.z),vec2(0.47,0.44),0.06)))*step(7.3,s);
    glass=max(max(sideG*(1.0-pil),roofG),max(wsI,rwI)); black=max(black,max(sideG*pil,max(frit,cowl)));
    // calandre, entrées d'air, lame avant, diffuseur
    float fr=aa(p.x-1.80);
    float dg=sdRB(vec2(p.z,p.y-0.405),vec2(0.50,0.105),0.05);
    float gr=(1.0-aa(dg))*fr;
    float di=sdRB(vec2(az-0.70,p.y-0.355),vec2(0.085,0.062),0.03);
    float intake=(1.0-aa(di))*fr;
    float lip=(1.0-aa(p.y-0.235))*aa(p.x-1.5);
    float diff=(1.0-aa(sdRB(vec2(p.z,p.y-0.30),vec2(0.60,0.115),0.04)))*aa(-1.9-p.x);
    black=max(black,max(max(gr,intake),max(lip,diff)));
    // jeux d'ouvrants
    float cut=max(1.0-aa(abs(p.x-0.74)-0.0035),1.0-aa(abs(p.x+0.165)-0.0035));
    float rc=length(p.xy-vec2(AXR,YW));
    float rearCut=p.y>0.775?1.0-aa(abs(p.x+1.03)-0.0035):(1.0-aa(abs(rc-0.455)-0.0035))*step(AXR,p.x)*step(p.y,0.80);
    cut=max(cut,rearCut)*below;
    cut=max(cut,(1.0-aa(abs(s-7.0)-0.02))*aa(p.x-0.95)*aa(1.80-p.x));
    cut=max(cut,(1.0-aa(abs(p.x-1.80)-0.004))*step(7.0,s));
    cut=max(cut,(1.0-aa(abs(p.y-0.60)-0.003))*aa(-2.0-p.x)*(1.0-aa(az-0.70)));                 // seuil de hayon
    cut=max(cut,(1.0-aa(abs(az-0.70)-0.003))*aa(-1.97-p.x)*aa(p.y-0.60)*step(s,5.0));
    // poignées
    vec2 h1=vec2(p.x+0.045,p.y-0.855), h2=vec2(p.x+0.915,p.y-0.895);
    float hd=min(sdRB(h1,vec2(0.085,0.015),0.015),sdRB(h2,vec2(0.085,0.015),0.015));
    float hds=min(sdRB(h1+vec2(0.0,0.012),vec2(0.085,0.017),0.015),sdRB(h2+vec2(0.0,0.012),vec2(0.085,0.017),0.015));
    float handle=(1.0-aa(hd))*below, hshadow=(1.0-aa(hds))*aa(hd)*below;
    // optiques avant
    float hl=aa(p.x-1.56)*aa(az-0.34)*aa(sv-(-0.058+0.075*smoothstep(1.98,1.56,p.x)+0.05*smoothstep(0.52,0.34,az)))*aa(0.034-sv)*step(s,6.0);
    float drl=aa(sv-0.012)*aa(0.026-sv)*aa(p.x-1.60)*aa(az-0.39);
    float pj=0.0; for(int k=0;k<3;k++){ float c0=0.47+0.095*float(k); float d=sdRB(vec2(az-c0,sv+0.016),vec2(0.034,0.017),0.008); pj=max(pj,(1.0-aa(d))*aa(p.x-1.86)); }
    // feux arrière
    float tlb=mix(0.012,-0.045+0.065*smoothstep(-2.02,-1.74,p.x),aa(az-0.30));
    float tlt=mix(0.040,0.054,aa(az-0.30));
    float tl=aa(-1.72-p.x)*aa(sv-tlb)*aa(tlt-sv)*step(4.5,s)*step(s,6.0);
    float refl=(1.0-aa(sdRB(vec2(az-0.70,p.y-0.375),vec2(0.07,0.012),0.006)))*aa(-1.9-p.x);
    // plaques
    float plF=(1.0-aa(sdRB(vec2(p.z,p.y-0.405),vec2(0.26,0.055),0.012)))*aa(p.x-1.95);
    float plR=(1.0-aa(sdRB(vec2(p.z,p.y-0.74),vec2(0.26,0.055),0.012)))*aa(-2.0-p.x);

    if(glass>0.5){ base=vec3(0.004,0.006,0.009); metal=0.0; rough=0.08; coatF0=0.07; tint=vec3(0.62,0.72,0.82); }
    base=mix(base,vec3(0.012),black); rough=mix(rough,0.55,black); metal=mix(metal,0.0,black); coat=mix(coat,0.25,black);
    if(gr>0.5){ float sl=smoothstep(0.25,0.42,abs(fract(p.y*42.0)-0.5)); base=vec3(0.004)+0.035*sl; coat=0.15*sl; rough=0.5; base+=0.05*(1.0-aa(abs(dg+0.008)-0.004)); }
    if(intake>0.5){ base=vec3(0.004)+0.03*(1.0-aa(abs(fract(az*30.0)-0.5)-0.12)); coat=0.1; rough=0.6; }
    if(diff>0.5){ base=vec3(0.006)+0.02*(1.0-aa(abs(fract(p.z*7.0+0.5)-0.5)-0.06)); coat=0.1; rough=0.6; }
    base=mix(base,vec3(0.0),cut*0.92); coat*=1.0-cut*0.8;
    base=mix(base,vec3(0.0),hshadow*0.85); coat*=1.0-hshadow*0.7;
    N=normalize(N+vec3(0.0,0.35,0.0)*handle);
    if(hl>0.01){
      base=mix(base,vec3(0.016,0.018,0.022),hl); metal=mix(metal,0.0,hl); rough=mix(rough,0.08,hl); coatF0=mix(coatF0,0.09,hl);
      emit+=hl*(drl*vec3(1.2,1.25,1.35)*mix(1.0,1.7,uDark)+pj*vec3(0.55,0.6,0.7)*mix(0.5,0.9,uDark)); }
    if(tl>0.01){ base=mix(base,vec3(0.10,0.004,0.006),tl); metal=mix(metal,0.0,tl); rough=mix(rough,0.15,tl);
      float line=1.0-aa(abs(sv-mix(0.026,0.034,aa(az-0.30)))-0.006);
      emit+=tl*vec3(0.95,0.02,0.03)*mix(0.6,1.15,uDark)*(0.38+0.62*line); }
    base=mix(base,vec3(0.25,0.01,0.012),refl); rough=mix(rough,0.3,refl);
    float pl=max(plF,plR); base=mix(base,vec3(0.78,0.78,0.76),pl); metal=mix(metal,0.0,pl); rough=mix(rough,0.6,pl); coat=mix(coat,0.15,pl);
    ao=mix(0.45,1.0,smoothstep(0.10,0.40,p.y))*mix(0.55,1.0,smoothstep(RA,RA+0.07,rw+step(s,1.0)+step(6.3,s)));
  } else {
    if(dot(N,V)<0.0) N=-N;
    if(mat==1){ base=vec3(0.018); metal=0.0; rough=0.85; coat=0.0; }
    else if(mat==2){ base=vec3(0.035,0.036,0.04); metal=0.8; rough=0.4; coat=0.3; }
    else if(mat==3){ base=vec3(0.006); metal=0.0; rough=1.0; coat=0.0; ao=0.35; }
    else if(mat==5){ base=vec3(0.42,0.43,0.45); metal=1.0; rough=0.5; coat=0.0; ao=0.75; }
    else if(mat==6){ base=vec3(0.012); metal=0.0; rough=0.3; coat=0.6; }
    else if(mat==7){ base=vec3(0.07,0.07,0.075); metal=0.6; rough=0.5; coat=0.2; ao=0.8; }
    else if(mat==8){ base=vec3(0.62,0.63,0.66); metal=1.0; rough=0.22; coat=0.0; }
  }
  float nv=max(dot(N,V),0.0); vec3 R=reflect(-V,N);
  vec3 irr=mix(env(vec3(0.0,-1.0,0.0),1.0),env(vec3(0.0,0.6,0.0)+0.4*N,1.0),N.y*0.5+0.5)+vec3(mix(0.42,0.35,uDark))*max(N.y,0.0);
  vec3 F0=mix(vec3(0.04),base,metal);
  vec3 Fb=F0+(1.0-F0)*pow(1.0-nv,5.0);
  vec3 col=base*(1.0-metal)*irr*ao + env(R,rough)*Fb*ao;
  float Fc=coat*(coatF0+(1.0-coatF0)*pow(1.0-nv,5.0));
  float hz=smoothstep(-0.25,0.05,R.y+ (vW.y-0.2)*0.6);   // le sol proche masque les reflets bas
  col=col*(1.0-Fc)+env(R,0.0)*tint*Fc*mix(0.35,1.0,hz)*mix(ao,1.0,0.5);
  col+=emit;
  col=aces(col);
  o=vec4(pow(col,vec3(1.0/2.2)),1.0);
}`;

const VS2 = `#version 300 es
in vec2 aP; uniform mat4 uVP; uniform mat3 uRot; out vec2 vP;
void main(){ vP=aP; gl_Position=uVP*vec4(uRot*vec3(aP.x,0.0,aP.y),1.0); }`;
const FS2 = `#version 300 es
precision highp float; in vec2 vP; uniform float uDark; out vec4 o;
float sdRB(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r; }
void main(){
  float d=sdRB(vP,vec2(2.12,0.86),0.35);
  float a=mix(0.34,0.72,uDark)*smoothstep(0.55,-0.25,d)+mix(0.30,0.25,uDark)*smoothstep(0.12,-0.2,d);
  a=clamp(a,0.0,0.94); o=vec4(0.0,0.0,0.0,a);
}`;

/* ---------- maths ---------- */
function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; }
function lookAt(e, c) {
  let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
  let x = [z[2], 0, -z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);   // up=(0,1,0) × z
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
}
function mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }

/* ---------- visionneuse ---------- */
function create(canvas, opts) {
  opts = opts || {};
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: true, premultipliedAlpha: true });
  if (!gl) return null;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; };
  const pr = prog(VS, FS), pr2 = prog(VS2, FS2);
  const m = build();
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = (data, name, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); const l = gl.getAttribLocation(pr, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); };
  buf(m.P, "aPos", 3); buf(m.N, "aNrm", 3); buf(m.SM, "aSM", 2);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.I, gl.STATIC_DRAW);
  const vao2 = gl.createVertexArray(); gl.bindVertexArray(vao2);
  { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-4, -2.5, 4, -2.5, 4, 2.5, -4, -2.5, 4, 2.5, -4, 2.5]), gl.STATIC_DRAW); const l = gl.getAttribLocation(pr2, "aP"); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0); }
  const U = n => gl.getUniformLocation(pr, n), U2 = n => gl.getUniformLocation(pr2, n);

  const st = { yaw: opts.yaw != null ? opts.yaw : 0.62, pitch: opts.pitch != null ? opts.pitch : 0.2, dark: !!opts.dark, paint: opts.paint || [0.012, 0.013, 0.016], auto: opts.auto !== false, vel: 0, drag: null, idle: 0, raf: 0, last: 0, running: true };
  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    const asp = w / h, fov = 0.34, need = 2.42 / (Math.tan(fov / 2) * Math.min(asp, 2.2)), dist = Math.max(need, 1.05 / Math.tan(fov / 2));
    const cp = Math.cos(st.pitch), eye = [0, 0.62 + dist * Math.sin(st.pitch), dist * cp];
    const vp = mul(persp(fov, asp, 1, 60), lookAt(eye, [0, 0.60, 0]));
    const c = Math.cos(st.yaw), s = Math.sin(st.yaw), rot = [c, 0, -s, 0, 1, 0, s, 0, c];
    gl.useProgram(pr); gl.bindVertexArray(vao);
    gl.uniformMatrix4fv(U("uVP"), false, vp); gl.uniformMatrix3fv(U("uRot"), false, rot); gl.uniform3fv(U("uCam"), eye); gl.uniform3fv(U("uPaint"), st.paint); gl.uniform1f(U("uDark"), st.dark ? 1 : 0);
    gl.disable(gl.BLEND); gl.drawElements(gl.TRIANGLES, m.I.length, gl.UNSIGNED_INT, 0);
    gl.useProgram(pr2); gl.bindVertexArray(vao2); gl.uniformMatrix4fv(U2("uVP"), false, vp); gl.uniformMatrix3fv(U2("uRot"), false, rot); gl.uniform1f(U2("uDark"), st.dark ? 1 : 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.depthMask(true);
  }
  const reduced = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  function frame(t) {
    st.raf = 0; if (!st.running) return; const dt = Math.min(50, t - (st.last || t)); st.last = t; let more = false;
    if (!st.drag) { if (Math.abs(st.vel) > 0.0004) { st.yaw += st.vel; st.vel *= 0.94; more = true; } else if (st.auto && t > st.idle && !reduced.matches) { st.yaw += dt * 0.00022; more = true; } }
    draw(); if (more || st.drag) req();
  }
  function req() { if (!st.raf && st.running) st.raf = requestAnimationFrame(frame); }
  canvas.addEventListener("webglcontextlost", e => e.preventDefault());
  canvas.addEventListener("pointerdown", e => { st.drag = { x: e.clientX, y: e.clientY, yaw: st.yaw, lock: null, lt: performance.now() }; st.vel = 0; });
  window.addEventListener("pointermove", e => { const d = st.drag; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.lock === null && Math.hypot(dx, dy) > 6) { d.lock = Math.abs(dx) > Math.abs(dy) ? "x" : "y"; if (d.lock === "x" && canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId); }
    if (d.lock !== "x") return; const ny = d.yaw + dx * 0.01, now = performance.now(); st.vel = (ny - st.yaw) / Math.max(8, now - d.lt) * 16; d.lt = now; st.yaw = ny; req(); });
  const end = () => { if (!st.drag) return; st.drag = null; st.idle = performance.now() + 2500; req(); };
  window.addEventListener("pointerup", end); window.addEventListener("pointercancel", end);
  draw(); req();
  return { draw, set(o) { Object.assign(st, o); draw(); req(); }, stop() { st.running = false; if (st.raf) cancelAnimationFrame(st.raf); st.raf = 0; }, start() { if (!st.running) { st.running = true; st.last = 0; } draw(); req(); }, tris: m.I.length / 3 };
}
root.Car3D = { create };
})(window);
