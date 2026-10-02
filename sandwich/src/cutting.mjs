import * as THREE from 'three';

const EPSILON = 1e-6;

// Clip deformed meshes and cap the cut faces, preserving holes.
export function cutGeometry(geometry, planeX = 0) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const names = ['position', 'normal', 'uv', 'color'].filter(
    (name) => source.attributes[name],
  );
  const halves = [-1, 1].map(() => ({
    data: Object.fromEntries(names.map((name) => [name, []])),
    groups: [],
  }));
  const segments = [];
  const count = Math.min(
    source.attributes.position.count,
    source.drawRange.count,
  );
  const start = source.drawRange.start;
  const groups = source.groups.length
    ? source.groups
    : [{ start, count, materialIndex: 0 }];
  const vertex = (i) =>
    Object.fromEntries(
      names.map((name) => {
        const a = source.attributes[name];
        return [
          name,
          Array.from(
            { length: a.itemSize },
            (_, j) => a.array[i * a.itemSize + j],
          ),
        ];
      }),
    );
  const interpolate = (a, b, t) =>
    Object.fromEntries(
      names.map((name) => [
        name,
        a[name].map((n, j) => n + (b[name][j] - n) * t),
      ]),
    );
  for (const group of groups) {
    const starts = halves.map((half) => half.data.position.length / 3);
    for (
      let i = Math.max(start, group.start);
      i + 2 < Math.min(start + count, group.start + group.count);
      i += 3
    ) {
      const triangle = [vertex(i), vertex(i + 1), vertex(i + 2)];
      const crossings = [];
      for (let j = 0; j < 3; j++) {
        const a = triangle[j],
          b = triangle[(j + 1) % 3];
        const da = a.position[0] - planeX,
          db = b.position[0] - planeX;
        if (da < 0 !== db < 0) {
          const p = interpolate(a, b, da / (da - db)).position;
          p[0] = planeX;
          crossings.push(p);
        }
      }
      if (
        crossings.length === 2 &&
        new THREE.Vector3(...crossings[0]).distanceToSquared(
          new THREE.Vector3(...crossings[1]),
        ) >
          EPSILON ** 2
      )
        segments.push(crossings);
      for (let halfIndex = 0; halfIndex < 2; halfIndex++) {
        const sign = halfIndex ? 1 : -1;
        const polygon = [];
        for (let j = 0; j < 3; j++) {
          const a = triangle[j],
            b = triangle[(j + 1) % 3];
          const da = (a.position[0] - planeX) * sign,
            db = (b.position[0] - planeX) * sign;
          if (da >= 0) polygon.push(a);
          if (da < 0 !== db < 0)
            polygon.push(interpolate(a, b, da / (da - db)));
        }
        for (let j = 1; j + 1 < polygon.length; j++)
          for (const v of [polygon[0], polygon[j], polygon[j + 1]])
            for (const name of names)
              halves[halfIndex].data[name].push(...v[name]);
      }
    }
    halves.forEach((half, i) =>
      half.groups.push({
        start: starts[i],
        count: half.data.position.length / 3 - starts[i],
        materialIndex: group.materialIndex,
      }),
    );
  }
  if (source !== geometry) source.dispose();
  const caps = makeCaps(segments, planeX);
  return halves.map((half, i) => {
    const skin = new THREE.BufferGeometry();
    for (const name of names)
      skin.setAttribute(
        name,
        new THREE.Float32BufferAttribute(
          half.data[name],
          geometry.attributes[name].itemSize,
        ),
      );
    for (const group of half.groups)
      if (group.count)
        skin.addGroup(group.start, group.count, group.materialIndex);
    skin.computeBoundingSphere();
    return { skin, cap: caps[i] };
  });
}

function inside(point, loop) {
  let result = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const a = loop[i],
      b = loop[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      result = !result;
  }
  return result;
}

function makeCaps(segments, planeX) {
  const nodes = new Map(),
    edges = new Set();
  const key = (p) => `${Math.round(p[1] * 1e5)},${Math.round(p[2] * 1e5)}`;
  for (const [a, b] of segments) {
    const ka = key(a),
      kb = key(b);
    if (ka === kb) continue;
    const edge = [ka, kb].sort().join('|');
    if (edges.has(edge)) continue;
    edges.add(edge);
    if (!nodes.has(ka))
      nodes.set(ka, { p: new THREE.Vector2(a[1], a[2]), neighbors: [] });
    if (!nodes.has(kb))
      nodes.set(kb, { p: new THREE.Vector2(b[1], b[2]), neighbors: [] });
    nodes.get(ka).neighbors.push(kb);
    nodes.get(kb).neighbors.push(ka);
  }
  const visited = new Set(),
    loops = [];
  for (const [first, node] of nodes) {
    if (visited.has(first) || node.neighbors.length !== 2) continue;
    let current = first,
      previous = null;
    const loop = [];
    while (!visited.has(current)) {
      const entry = nodes.get(current);
      if (entry.neighbors.length !== 2) break;
      visited.add(current);
      loop.push(entry.p);
      const next = entry.neighbors.find((n) => n !== previous);
      previous = current;
      current = next;
    }
    if (current === first && loop.length >= 3) loops.push(loop);
  }
  loops.sort(
    (a, b) =>
      Math.abs(THREE.ShapeUtils.area(b)) - Math.abs(THREE.ShapeUtils.area(a)),
  );
  const parents = loops.map((loop, i) => {
    for (let j = i - 1; j >= 0; j--) if (inside(loop[0], loops[j])) return j;
    return -1;
  });
  const depth = (i) => (parents[i] < 0 ? 0 : depth(parents[i]) + 1);
  const vertices = [];
  loops.forEach((loop, i) => {
    if (depth(i) % 2) return;
    const holes = loops.filter((_, j) => parents[j] === i);
    // ShapeUtils may remove a duplicate endpoint, so flatten after triangulating.
    const triangles = THREE.ShapeUtils.triangulateShape(loop, holes);
    const points = [loop, ...holes].flat();
    for (const triangle of triangles) {
      const p = triangle.map((j) => points[j]);
      const cross =
        (p[1].x - p[0].x) * (p[2].y - p[0].y) -
        (p[1].y - p[0].y) * (p[2].x - p[0].x);
      if (cross < 0) p.reverse();
      for (const v of p) vertices.push(planeX, v.x, v.y);
    }
  });
  return [1, -1].map((normal) => {
    const p = [],
      n = [],
      uv = [];
    for (let i = 0; i < vertices.length; i += 9)
      for (const j of normal === 1 ? [0, 3, 6] : [6, 3, 0]) {
        p.push(...vertices.slice(i + j, i + j + 3));
        n.push(normal, 0, 0);
        uv.push(vertices[i + j + 1] * 0.45, vertices[i + j + 2] * 0.45);
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return geometry;
  });
}
