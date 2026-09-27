/**
 * Stroke -> filled outline conversion.
 *
 * Fonts cannot render strokes, only filled contours, so every source icon has
 * to be converted from "2px round stroke along a centerline" into the filled
 * region that stroke covers.
 *
 * The approach:
 *   1. Import the SVG with paper.js, which normalises `circle`/`rect`/`line`/
 *      `polyline`/`polygon`/`path` (and arcs and shorthand commands) into plain
 *      cubic bezier paths.
 *   2. Split every curve until its control polygon turns by less than
 *      MAX_TURN_DEGREES, so a Tiller-Hanson parallel-curve approximation is
 *      accurate to well under a hundredth of a unit on a 24-unit grid.
 *   3. For each piece emit a "ribbon": the curve offset by +r, a butt end, the
 *      curve offset by -r reversed, and another butt end.
 *   4. Emit a circle of radius r at every node, which produces exactly the
 *      round linecaps and round linejoins the spec mandates.
 *   5. Union the whole pile with paper.js boolean ops, which yields one clean,
 *      non-self-overlapping contour set (with real holes where the stroke
 *      encloses empty space, e.g. the ring of a `circle`).
 *
 * Steps 3-5 are what make round joins exact rather than approximated: the
 * union of stadium-shaped ribbons and node circles *is* the round-joined
 * stroke, so no join geometry has to be special-cased.
 */
import paper from 'paper-jsdom';

const MAX_TURN_DEGREES = 20;
const MAX_SPLIT_DEPTH = 6;
const EPS = 1e-9;
/** Segments shorter than this contribute nothing beyond their node circles. */
const MIN_SEGMENT_LENGTH = 1e-4;

/*
 * Boolean operations are numerically fragile where two operands merely *touch*
 * (a shared edge, or a circle inscribed exactly between two parallel sides).
 * Those exact tangencies are unavoidable here: consecutive ribbons share their
 * butt ends, and a node circle has exactly the ribbon's half-width. So every
 * operand is inflated by a hair, which turns every tangency into a clean
 * transversal crossing. The slop is ~0.01% of the icon's width - far below one
 * device pixel at any realistic render size, and at the ends it is swallowed by
 * the node circle anyway.
 */
/** Extra length added to each end of a ribbon, in viewBox units. */
const RIBBON_OVERLAP = 0.01;
/** Extra radius given to each node circle, in viewBox units. */
const NODE_CIRCLE_SLOP = 0.002;

let scopeReady = false;

/** Initialise (once) and clear the shared paper.js project. */
export function paperScope(viewBox = 24) {
  if (!scopeReady) {
    paper.setup(new paper.Size(viewBox, viewBox));
    scopeReady = true;
  }
  paper.project.clear();
  return paper;
}

const mid = (a, b) => a.add(b).divide(2);

/** Left-hand unit normal of the a->b direction, or null for a degenerate pair. */
function unitNormal(a, b) {
  const d = b.subtract(a);
  const len = d.length;
  if (len < EPS) return null;
  return new paper.Point(-d.y / len, d.x / len);
}

/** Total turning of the control polygon, in degrees. */
function controlPolygonTurn([p0, p1, p2, p3]) {
  const dirs = [];
  for (const [a, b] of [[p0, p1], [p1, p2], [p2, p3]]) {
    const d = b.subtract(a);
    if (d.length > EPS) dirs.push(d);
  }
  let total = 0;
  for (let i = 1; i < dirs.length; i++) total += Math.abs(dirs[i - 1].getDirectedAngle(dirs[i]));
  return total;
}

/** de Casteljau split at t = 0.5. */
function splitCubic([p0, p1, p2, p3]) {
  const p01 = mid(p0, p1), p12 = mid(p1, p2), p23 = mid(p2, p3);
  const p012 = mid(p01, p12), p123 = mid(p12, p23);
  const apex = mid(p012, p123);
  return [[p0, p01, p012, apex], [apex, p123, p23, p3]];
}

function flattenToGentleCubics(cubic, depth = 0, out = []) {
  if (depth >= MAX_SPLIT_DEPTH || controlPolygonTurn(cubic) <= MAX_TURN_DEGREES) {
    out.push(cubic);
    return out;
  }
  const [a, b] = splitCubic(cubic);
  flattenToGentleCubics(a, depth + 1, out);
  flattenToGentleCubics(b, depth + 1, out);
  return out;
}

/** Intersection of the infinite lines a1->a2 and b1->b2, or null if parallel. */
function lineIntersection(a1, a2, b1, b2) {
  const da = a2.subtract(a1);
  const db = b2.subtract(b1);
  const denom = da.cross(db);
  if (Math.abs(denom) < 1e-12) return null;
  const t = b1.subtract(a1).cross(db) / denom;
  return a1.add(da.multiply(t));
}

/**
 * Tiller-Hanson parallel curve: offset each leg of the control polygon by
 * `dist` along its left normal and re-intersect. Accurate for gently turning
 * curves, which is exactly what flattenToGentleCubics guarantees.
 */
function offsetCubic([p0, p1, p2, p3], dist) {
  const chord = unitNormal(p0, p3);
  const n01 = unitNormal(p0, p1) || unitNormal(p0, p2) || chord;
  const n23 = unitNormal(p2, p3) || unitNormal(p1, p3) || chord;
  if (!n01 || !n23) return null;
  const n12 = unitNormal(p1, p2) || n01;

  const shift = (pt, n) => pt.add(n.multiply(dist));
  const a1 = shift(p0, n01), a2 = shift(p1, n01);
  const b1 = shift(p1, n12), b2 = shift(p2, n12);
  const c1 = shift(p2, n23), c2 = shift(p3, n23);

  const q0 = a1;
  const q3 = c2;
  const q1 = lineIntersection(a1, a2, b1, b2) || a2;
  const q2 = lineIntersection(b1, b2, c1, c2) || c1;
  return [q0, q1, q2, q3];
}

/** Unit tangent at the start (`atEnd` false) or end of a cubic. */
function unitTangent([p0, p1, p2, p3], atEnd) {
  const candidates = atEnd ? [[p2, p3], [p1, p3], [p0, p3]] : [[p0, p1], [p0, p2], [p0, p3]];
  for (const [a, b] of candidates) {
    const d = b.subtract(a);
    if (d.length > EPS) return d.normalize();
  }
  return null;
}

/** Closed shape covering everything within `radius` of one gentle cubic. */
function ribbon(cubic, radius) {
  const left = offsetCubic(cubic, radius);
  const right = offsetCubic(cubic, -radius);
  if (!left || !right) return null;

  // Push the butt ends slightly past the real endpoints so neighbouring
  // ribbons overlap instead of sharing an edge exactly.
  const tStart = unitTangent(cubic, false);
  const tEnd = unitTangent(cubic, true);
  if (tStart) {
    const back = tStart.multiply(-RIBBON_OVERLAP);
    left[0] = left[0].add(back);
    right[0] = right[0].add(back);
  }
  if (tEnd) {
    const fwd = tEnd.multiply(RIBBON_OVERLAP);
    left[3] = left[3].add(fwd);
    right[3] = right[3].add(fwd);
  }

  const path = new paper.Path({ insert: false });
  path.moveTo(left[0]);
  path.cubicCurveTo(left[1], left[2], left[3]);
  path.lineTo(right[3]);
  path.cubicCurveTo(right[2], right[1], right[0]);
  path.closePath();
  // paper.js boolean ops interpret winding direction, so every operand must be
  // oriented the same way or a union can subtract instead of add.
  path.clockwise = true;
  return path;
}

class UnionFailure extends Error {}

/**
 * Pairwise-tree union of every operand.
 *
 * A union can only ever grow the covered area, so after each step the result
 * must be at least as large as both operands. paper.js can silently return a
 * *smaller* shape when it trips over degenerate geometry, and a dropped operand
 * means a visibly broken glyph, so the invariant is checked rather than trusted.
 */
function uniteAll(shapes) {
  let level = shapes.filter(Boolean);
  if (level.length === 0) return null;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 >= level.length) {
        next.push(level[i]);
        continue;
      }
      const a = level[i];
      const b = level[i + 1];
      const united = a.unite(b, { insert: false });
      const floor = Math.max(Math.abs(a.area), Math.abs(b.area));
      if (!united || Math.abs(united.area) < floor - 1e-6) {
        throw new UnionFailure(
          `boolean union lost area (${Math.abs(united ? united.area : 0).toFixed(4)} < ${floor.toFixed(4)})`,
        );
      }
      next.push(united);
    }
    level = next;
  }
  return level[0];
}

/**
 * Fallback when the boolean union misbehaves: emit every operand as its own
 * contour. All operands are wound clockwise, so under the nonzero fill rule
 * (the default in SVG and the only rule TrueType has) the overlapping contours
 * still render as their union. The glyph is heavier, never wrong.
 */
function overlappingContours(shapes, precision) {
  return shapes.filter(Boolean).map((s) => s.getPathData(null, precision)).join('');
}

/** Cubic control points of a paper.js Curve. */
const curvePoints = (curve) => [
  curve.point1,
  curve.point1.add(curve.handle1),
  curve.point2.add(curve.handle2),
  curve.point2,
];

/** Every filled shape that makes up the stroke of a single paper.js Path. */
function strokeShapes(path, radius) {
  const shapes = [];
  for (const curve of path.curves) {
    if (curve.length < MIN_SEGMENT_LENGTH) continue;
    for (const cubic of flattenToGentleCubics(curvePoints(curve))) {
      shapes.push(ribbon(cubic, radius));
    }
  }
  // Round joins at every node, and round caps at the two ends of an open path.
  for (const segment of path.segments) {
    const dot = new paper.Path.Circle({ center: segment.point, radius: radius + NODE_CIRCLE_SLOP, insert: false });
    dot.clockwise = true;
    shapes.push(dot);
  }
  return shapes;
}

/**
 * Convert a stroked source SVG into a single filled path.
 *
 * @param {string} svgText     source SVG markup
 * @param {object} options
 * @param {number} options.viewBox       viewBox size (square), default 24
 * @param {number} options.strokeWidth   fallback stroke width, default 2
 * @param {number} options.precision     decimals kept in the output, default 3
 * @returns {{ pathData: string, bounds: {x,y,width,height}, shapeCount: number,
 *             fallback: string|null }}
 */
export function outlineSvg(svgText, { viewBox = 24, strokeWidth = 2, precision = 3 } = {}) {
  const scope = paperScope(viewBox);
  const imported = scope.project.importSVG(svgText, { expandShapes: true, insert: true });
  if (!imported) throw new Error('paper.js could not import the SVG');

  const paths = imported.getItems({ recursive: true, class: paper.Path });
  const shapes = [];
  let strokedPaths = 0;

  for (const path of paths) {
    if (path.segments.length === 0) continue;
    const width = path.strokeWidth > 0 ? path.strokeWidth : strokeWidth;
    strokedPaths++;
    shapes.push(...strokeShapes(path, width / 2));
  }

  if (strokedPaths === 0) throw new Error('no drawable geometry found');

  let united = null;
  let fallback = null;
  try {
    united = uniteAll(shapes);
  } catch (error) {
    if (!(error instanceof UnionFailure)) throw error;
    fallback = error.message;
  }
  if (!united && !fallback) throw new Error('stroke outlining produced no geometry');

  // Either way the covered region is the same, so the bounds come from the
  // operands and double as a check that the union did not drop anything.
  let box = null;
  for (const shape of shapes) {
    if (!shape) continue;
    box = box ? box.unite(shape.bounds) : shape.bounds;
  }
  if (united && !box.expand(1e-6).contains(united.bounds)) {
    throw new Error('outline escaped the bounds of its own stroke geometry');
  }
  if (united && united.bounds.area < box.area - 1e-6) {
    fallback = fallback || 'boolean union lost geometry (bounds shrank)';
    united = null;
  }

  const result = {
    pathData: united ? united.getPathData(null, precision) : overlappingContours(shapes, precision),
    bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
    shapeCount: shapes.length,
    fallback,
  };
  scope.project.clear();
  return result;
}

/** Geometry (centerline, stroke excluded) bounds of a source SVG. */
export function geometryBounds(svgText, viewBox = 24) {
  const scope = paperScope(viewBox);
  const imported = scope.project.importSVG(svgText, { expandShapes: true, insert: true });
  if (!imported) throw new Error('paper.js could not import the SVG');
  const paths = imported.getItems({ recursive: true, class: paper.Path }).filter((p) => p.segments.length);
  if (!paths.length) {
    scope.project.clear();
    return null;
  }
  let box = null;
  for (const path of paths) {
    // `bounds` on a Path is the geometric bounding box; strokeBounds would add
    // the stroke width, which is not what the padding rule measures.
    box = box ? box.unite(path.bounds) : path.bounds;
  }
  const out = { x: box.x, y: box.y, width: box.width, height: box.height };
  scope.project.clear();
  return out;
}

/**
 * Prepare an already-filled ("solid" style) icon for the font.
 *
 * Nothing needs outlining here, but the source is still normalised:
 * overlapping pieces are unioned into one clean contour set, and winding is
 * fixed up so the result is correct under the nonzero fill rule - the only
 * rule TrueType has. Holes stay holes because a compound path's own child
 * winding is left alone.
 *
 * @returns {{ pathData: string, bounds: {x,y,width,height}, shapeCount: number,
 *             fallback: string|null }}
 */
export function flattenSolid(svgText, { viewBox = 24, precision = 3 } = {}) {
  const scope = paperScope(viewBox);
  const imported = scope.project.importSVG(svgText, { expandShapes: true, insert: true });
  if (!imported) throw new Error('paper.js could not import the SVG');

  const shapes = imported
    .getItems({ recursive: true, class: paper.PathItem })
    // A CompoundPath's children are its holes and islands; take the parent.
    .filter((item) => !(item.parent instanceof paper.CompoundPath))
    .filter((item) => (item instanceof paper.CompoundPath ? item.children.length : item.segments.length));

  if (shapes.length === 0) throw new Error('no drawable geometry found');

  for (const shape of shapes) {
    if (shape instanceof paper.CompoundPath) {
      // Outer contour clockwise, holes the other way.
      if (shape.area < 0) shape.reverse();
    } else {
      shape.closed = true;
      shape.clockwise = true;
    }
  }

  let united = null;
  let fallback = null;
  try {
    united = uniteAll(shapes);
  } catch (error) {
    if (!(error instanceof UnionFailure)) throw error;
    fallback = error.message;
  }

  let box = null;
  for (const shape of shapes) box = box ? box.unite(shape.bounds) : shape.bounds;

  const result = {
    pathData: united ? united.getPathData(null, precision) : overlappingContours(shapes, precision),
    bounds: { x: box.x, y: box.y, width: box.width, height: box.height },
    shapeCount: shapes.length,
    fallback,
  };
  scope.project.clear();
  return result;
}
