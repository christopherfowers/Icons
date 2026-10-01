/**
 * The Tsaraforge `forge` theme: borderless, heavily distressed.
 *
 * Not the clean set with a dusting of cracks. This rebuilds every contour the
 * way the traced logo actually looks:
 *
 *   - NO corner brackets. The mark has no frame, so neither does the theme.
 *   - Edges are resampled fine and chipped: every point displaced along its
 *     normal by seeded noise, with occasional deeper bites, so nothing reads
 *     as a machined straight line.
 *   - Silhouettes are fractured by many crack slivers, cut as reverse-wound
 *     contours inside the same path so nonzero winding makes them holes.
 *   - Strokes are broken into worn segments and wobble off true.
 *
 * Every crack is validated with a nonzero point-in-path test against the
 * CHIPPED geometry: a sliver hanging off an edge stops being a hole and
 * becomes a floating speck that adds area instead of removing it.
 *
 * Seeded off the icon name, so the build stays byte-reproducible.
 */
import fs from 'node:fs';
import path from 'node:path';
import paper from 'paper-jsdom';
import { paperScope } from './lib/outline.js';

const ROOT = process.argv[2] ?? '.';
const AMP = Number(process.argv[3] ?? 0.16);      // edge chip amplitude
const SPACING = Number(process.argv[4] ?? 0.55);  // resample step
if (!ROOT) throw new Error('usage: node distress2.mjs <repo-root> [amp] [spacing]');

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
}
const num = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Turn path data into polylines via paper.
 *
 * The hand-rolled M/L/H/V/Z parser this replaces uppercased the command and so
 * read RELATIVE commands as absolute — `v15.2` became "go to y=15.2" instead of
 * "move down 15.2". Once the core sources were rewritten through paper's
 * pathData (which emits compact relative syntax) every such icon was silently
 * truncated. Curves are flattened so the chip pass still sees even spacing.
 */
function parseSubpaths(d) {
  const scope = paperScope(24);
  const cp = new paper.CompoundPath(d);
  const children = cp.children.length ? cp.children : [cp];
  const subs = [];
  for (const child of children) {
    if (!child.segments || child.segments.length < 2) continue;
    const copy = child.clone({ insert: false });
    copy.flatten(0.12);
    const pts = copy.segments.map((sg) => [sg.point.x, sg.point.y]);
    if (pts.length < 2) continue;
    pts.closed = child.closed;
    subs.push(pts);
  }
  scope.project.clear();
  return subs;
}

const emit = (pts, closed) =>
  'M' + pts.map((p, i) => (i ? 'L' : '') + num(p[0]) + ' ' + num(p[1])).join('') + (closed ? 'Z' : '');
const signedArea = (p) => {
  let a = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][0] * p[i][1] - p[i][0] * p[j][1];
  return a / 2;
};
function insideNonzero(subs, x, y) {
  let w = 0;
  for (const r of subs) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = r[j], [x2, y2] = r[i];
    if ((y1 > y) !== (y2 > y)) { const xx = x1 + (y - y1) / (y2 - y1) * (x2 - x1); if (xx > x) w += (y2 > y1) ? 1 : -1; }
  }
  return w !== 0;
}

/** Walk the polyline at a fixed step so chipping lands evenly. */
function resample(pts, closed, step) {
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = out[out.length - 1].slice ? src[i - 1] : src[i - 1];
    const b = src[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    let t = (step - carry) / L;
    while (t <= 1) {
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      t += step / L;
    }
    carry = (1 - (t - step / L)) * L;
    out.push(b);
  }
  if (closed && out.length > 1) out.pop();
  return out;
}

/** Displace every point along its local normal — the ragged-edge pass. */
function chip(pts, closed, rand, amp) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
    const nx = -ty, ny = tx;
    let d = (rand() - 0.5) * 2 * amp;
    if (rand() > 0.9) d -= amp * (1.6 + rand() * 1.8);   // occasional deeper bite
    // Leave room for the stroke: deriving the filled variant outlines this
    // stroke, adding half its width beyond the chip, which would otherwise
    // breach the 1px solid padding.
    out.push([clamp(p[0] + nx * d, 2.0, 22.0), clamp(p[1] + ny * d, 2.0, 22.0)]);
  }
  return out;
}

/** Mean thickness of a contour, 2*area/perimeter. Chipping deeper than a
 *  fraction of this eats the feature instead of weathering it. */
function thickness(pts) {
  let per = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    per += Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  }
  return per ? Math.abs(signedArea(pts)) * 2 / per : 0;
}

function crack(cx, cy, len, wid, ang, clockwise) {
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const px = -uy, py = ux, h = len / 2, w = wid / 2;
  let q = [
    [cx - ux * h - px * w, cy - uy * h - py * w], [cx + ux * h - px * w, cy + uy * h - py * w],
    [cx + ux * h + px * w, cy + uy * h + py * w], [cx - ux * h + px * w, cy - uy * h + py * w],
  ];
  if ((signedArea(q) > 0) !== clockwise) q = q.reverse();
  return q;
}

function distressFilled(src, name) {
  const rand = rng(name);
  // Borderless: drop the two bracket paths entirely.
  const all = [...src.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  const body = all.slice(0, Math.max(1, all.length - 2));

  return body.map((d) => {
    const subs = parseSubpaths(d).map((s) => {
      const r = resample(s, true, SPACING);
      // Scale the chip to the feature: a 1.2-wide bar cannot survive the same
      // bite as a 6-wide plate, which is what turned dense marks to mush.
      const amp = clamp(0.2 * thickness(r), 0.045, AMP);
      return Object.assign(chip(r, true, rand, amp), { closed: true });
    });
    if (!subs.length) return d;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of subs) for (const [x, y] of s) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const w = x1 - x0, h = y1 - y0;
    const cw = signedArea(subs[0]) > 0;
    let out = subs.map((s) => emit(s, true)).join('');

    const th = thickness(subs[0]);
    if (w >= 2 && h >= 2 && th >= 1.15 && Math.abs(signedArea(subs[0])) >= 7) {
      const cols = Math.max(4, Math.round(w / 1.5)), rows = Math.max(4, Math.round(h / 1.5));
      const cells = [];
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([c, r]);
      for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]];
      }
      const want = Math.min(22, Math.max(6, Math.round(w * h / 8)));
      let placed = 0;
      for (const [c, r] of cells) {
        if (placed >= want) break;
        const cx = x0 + (c + 0.5) * (w / cols), cy = y0 + (r + 0.5) * (h / rows);
        if (!insideNonzero(subs, cx, cy)) continue;
        const ang = rand() * Math.PI;
        const wid = Math.min(0.22 + rand() * 0.2, th * 0.28);
        let q = null;
        for (let len = 1.2 + rand() * 2.6; len >= 0.5; len -= 0.18) {
          const cand = crack(cx, cy, len, wid, ang, !cw);
          if (cand.every(([px, py]) => insideNonzero(subs, px, py))) { q = cand; break; }
        }
        if (!q) continue;
        out += emit(q, true); placed++;
      }
    }
    return out;
  });
}

function distressOutline(src, name) {
  const rand = rng(name);
  const all = [...src.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
  const body = all.slice(0, Math.max(1, all.length - 2));   // borderless

  return body.map((d) => {
    const pieces = [];
    for (const sub of parseSubpaths(d)) {
      const closed = !!sub.closed;
      const r = resample(sub, closed, SPACING);
      const wob = chip(r, closed, rand, Math.min(AMP * 0.7, 0.22));
      const pts = closed ? [...wob, wob[0]] : wob;
      let run = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        run.push(pts[i]);
        // Break the line often enough that it reads as worn stencil.
        if (run.length > 3 && rand() > 0.87) {
          pieces.push(run);
          const skip = 1 + Math.floor(rand() * 2);
          i += skip;
          if (i < pts.length) run = [pts[i]]; else { run = []; break; }
        }
      }
      if (run.length > 1) pieces.push(run);
    }
    return pieces.filter((p) => p.length > 1).map((p) => emit(p, false)).join('');
  });
}

const HEAD = {
  'forge-outline': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter">',
  'forge-filled': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" stroke="none">',
};

let n = 0;
for (const [from, to, fn] of [
  ['outline', 'forge-outline', distressOutline],
  ['filled', 'forge-filled', distressFilled],
]) {
  const base = path.join(ROOT, 'svg', from);
  for (const group of fs.readdirSync(base).sort()) {
    const dir = path.join(base, group);
    if (!fs.statSync(dir).isDirectory()) continue;
    const outDir = path.join(ROOT, 'svg', to, group);
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()) {
      const ds = fn(fs.readFileSync(path.join(dir, file), 'utf8'), `${to}/${file.slice(0, -4)}`);
      fs.writeFileSync(path.join(outDir, file),
        `${HEAD[to]}\n${ds.map((d) => `  <path d="${d}"/>`).join('\n')}\n</svg>\n`, 'utf8');
      n++;
    }
  }
}
console.log(`wrote ${n} forge icons (borderless, amp=${AMP}, spacing=${SPACING})`);
