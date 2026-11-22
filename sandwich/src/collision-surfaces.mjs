import * as CANNON from 'cannon-es';
import { IcosahedronGeometry, Vector3 } from 'three';

const directions = [
  new Vector3(1, 0, 0), new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0), new Vector3(0, -1, 0),
  new Vector3(0, 0, 1), new Vector3(0, 0, -1),
];
const sphere = new IcosahedronGeometry(1, 1);
for (let i = 0; i < sphere.attributes.position.count; i++) {
  const p = new Vector3().fromBufferAttribute(sphere.attributes.position, i).normalize();
  if (!directions.some((n) => n.distanceToSquared(p) < 1e-10)) directions.push(p);
}
sphere.dispose();

// Intersect supporting planes to enclose the mesh with fewer faces.
export function collisionEnvelope(points, padding = 0.008) {
  let size = 1;
  for (const p of points) size = Math.max(size, Math.abs(p.x) + 1, Math.abs(p.y) + 1, Math.abs(p.z) + 1);
  const v = (x, y, z) => new Vector3(x * size, y * size, z * size);
  let polygons = [
    [v(-1,-1,-1),v(-1,-1,1),v(-1,1,1),v(-1,1,-1)],
    [v(1,-1,-1),v(1,1,-1),v(1,1,1),v(1,-1,1)],
    [v(-1,-1,-1),v(1,-1,-1),v(1,-1,1),v(-1,-1,1)],
    [v(-1,1,-1),v(-1,1,1),v(1,1,1),v(1,1,-1)],
    [v(-1,-1,-1),v(-1,1,-1),v(1,1,-1),v(1,-1,-1)],
    [v(-1,-1,1),v(1,-1,1),v(1,1,1),v(-1,1,1)],
  ];
  for (const n of directions) {
    let limit = -Infinity;
    for (const p of points) limit = Math.max(limit, n.dot(p) + padding);
    const next = [], cap = [];
    for (const polygon of polygons) {
      const clipped = [];
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length];
        const da = n.dot(a) - limit, db = n.dot(b) - limit;
        if (da <= 0) clipped.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const p = a.clone().lerp(b, da / (da - db));
          clipped.push(p);
          if (!cap.some((q) => q.distanceToSquared(p) < 1e-14)) cap.push(p);
        }
      }
      if (clipped.length >= 3) next.push(clipped);
    }
    if (cap.length >= 3) {
      const center = cap.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(cap.length);
      const u = cap[0].clone().sub(center).normalize();
      const w = new Vector3().crossVectors(n, u);
      cap.sort((a,b) => Math.atan2(w.dot(a.clone().sub(center)), u.dot(a.clone().sub(center))) -
        Math.atan2(w.dot(b.clone().sub(center)), u.dot(b.clone().sub(center))));
      next.push(cap);
    }
    polygons = next;
  }
  const key = (p) => p.toArray().map((x) => Math.round(x * 1e7)).join(',');
  const unique = new Map();
  for (const p of polygons.flat()) unique.set(key(p), p);
  const vertices = [...unique.values()];
  const indices = new Map(vertices.map((p, i) => [key(p), i]));
  return {
    vertices: vertices.map((p) => new CANNON.Vec3(p.x, p.y, p.z)),
    faces: polygons.map((polygon) => [...new Set(polygon.map((p) => indices.get(key(p))))]).filter((face) => face.length >= 3),
  };
}

const origin = new CANNON.Vec3(), direction = new CANNON.Vec3();
const o = new CANNON.Vec3(), d = new CANNON.Vec3(), inverse = new CANNON.Quaternion();
const worldPoint = new CANNON.Vec3();

// Test compound shapes individually so ring holes remain open.
export function contactHeight(body, x, z, y, clearance = 0) {
  if (body.aabbNeedsUpdate) body.updateAABB();
  const { lowerBound: lo, upperBound: hi } = body.aabb;
  if (x < lo.x || x > hi.x || z < lo.z || z > hi.z || y > hi.y + clearance || y < lo.y - clearance) return -Infinity;
  worldPoint.set(x, 0, z);
  body.pointToLocalFrame(worldPoint, origin);
  body.vectorToLocalFrame(CANNON.Vec3.UNIT_Y, direction);
  let height = -Infinity;
  for (let i = 0; i < body.shapes.length; i++) {
    const shape = body.shapes[i];
    origin.vsub(body.shapeOffsets[i], o);
    body.shapeOrientations[i].conjugate(inverse);
    inverse.vmult(o, o);
    inverse.vmult(direction, d);
    let low = -Infinity, high = Infinity;
    if (shape.type === CANNON.Shape.types.SPHERE) {
      const b = o.dot(d), c = o.lengthSquared() - shape.radius ** 2;
      const discriminant = b * b - c;
      if (discriminant < 0) continue;
      low = -b - Math.sqrt(discriminant);
      high = -b + Math.sqrt(discriminant);
    } else {
      const convex = shape.convexPolyhedronRepresentation || shape;
      if (!convex.faces) continue;
      for (let f = 0; f < convex.faces.length; f++) {
        const n = convex.faceNormals[f];
        const distance = n.dot(convex.vertices[convex.faces[f][0]]) - n.dot(o);
        const slope = n.dot(d);
        if (Math.abs(slope) < 1e-9) {
          if (distance < 0) { high = -Infinity; break; }
        } else if (slope > 0) high = Math.min(high, distance / slope);
        else low = Math.max(low, distance / slope);
      }
    }
    if (high >= low && y >= low - clearance && y <= high + clearance) height = Math.max(height, high);
  }
  return height;
}

export function liftSheetContact(item, center, thickness) {
  let top = center.y;
  for (const support of item.supportItems || []) {
    if (!support.landed) continue;
    const lift = support.surfaceLift || 0;
    const bounds = support.bounds;
    const clearance = thickness + 0.018;
    // Reject by ingredient bounds before testing individual tiles.
    if (bounds && (
      center.x < bounds.lowerBound.x || center.x > bounds.upperBound.x ||
      center.z < bounds.lowerBound.z || center.z > bounds.upperBound.z ||
      center.y - lift < bounds.lowerBound.y - clearance ||
      center.y - lift > bounds.upperBound.y + clearance
    )) continue;
    for (const { body } of support.parts) {
      const height = contactHeight(body, center.x, center.z, center.y - lift, clearance);
      if (Number.isFinite(height)) top = Math.max(top, height + lift + thickness + 0.012);
    }
  }
  const lift = top - center.y;
  item.surfaceLift = Math.max(item.surfaceLift || 0, lift);
  center.y = top;
}

const CELLS = 12;
const cellStart = new Int32Array(CELLS * CELLS + 1), cellFill = new Int32Array(CELLS * CELLS);
const nearby = [], lifts = [];
let cellBodies = new Int32Array(1024);

// liftSheetContact for every point of a skin at once. A slice lies over a few
// tiles of each layer beneath it, so the bodies are sorted into a grid first
// and each point is tested against its own cell only.
export function liftSheetContacts(item, points, count, thickness) {
  const clearance = thickness + 0.018;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count * 3; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const outside = ({ lowerBound: lo, upperBound: hi }, lift) =>
    maxX < lo.x || minX > hi.x || maxZ < lo.z || minZ > hi.z ||
    maxY - lift < lo.y - clearance || minY - lift > hi.y + clearance;
  const scaleX = CELLS / Math.max(maxX - minX, 1e-9), scaleZ = CELLS / Math.max(maxZ - minZ, 1e-9);
  const cell = (value, min, scale) => Math.max(0, Math.min(CELLS - 1, Math.floor((value - min) * scale)));
  nearby.length = lifts.length = 0;
  cellStart.fill(0);
  let entries = 0;
  for (const support of item.supportItems || []) {
    if (!support.landed) continue;
    const lift = support.surfaceLift || 0;
    if (support.bounds && outside(support.bounds, lift)) continue;
    for (const { body } of support.parts) {
      if (body.aabbNeedsUpdate) body.updateAABB();
      if (outside(body.aabb, lift)) continue;
      nearby.push(body);
      lifts.push(lift);
      const { lowerBound: lo, upperBound: hi } = body.aabb;
      for (let j = cell(lo.z, minZ, scaleZ); j <= cell(hi.z, minZ, scaleZ); j++)
        for (let i = cell(lo.x, minX, scaleX); i <= cell(hi.x, minX, scaleX); i++) {
          cellStart[j * CELLS + i + 1]++;
          entries++;
        }
    }
  }
  if (!nearby.length) return 0;
  for (let i = 0; i < CELLS * CELLS; i++) cellFill[i] = cellStart[i + 1] += cellStart[i];
  if (entries > cellBodies.length) cellBodies = new Int32Array(entries * 2);
  for (let n = 0; n < nearby.length; n++) {
    const { lowerBound: lo, upperBound: hi } = nearby[n].aabb;
    for (let j = cell(lo.z, minZ, scaleZ); j <= cell(hi.z, minZ, scaleZ); j++)
      for (let i = cell(lo.x, minX, scaleX); i <= cell(hi.x, minX, scaleX); i++)
        cellBodies[--cellFill[j * CELLS + i]] = n;
  }
  let highest = 0;
  for (let i = 0; i < count * 3; i += 3) {
    const x = points[i], y = points[i + 1], z = points[i + 2];
    const at = cell(z, minZ, scaleZ) * CELLS + cell(x, minX, scaleX);
    let top = y;
    for (let k = cellStart[at]; k < cellStart[at + 1]; k++) {
      const lift = lifts[cellBodies[k]];
      const height = contactHeight(nearby[cellBodies[k]], x, z, y - lift, clearance);
      if (Number.isFinite(height)) top = Math.max(top, height + lift + thickness + 0.012);
    }
    points[i + 1] = top;
    highest = Math.max(highest, top - y);
  }
  return highest;
}
