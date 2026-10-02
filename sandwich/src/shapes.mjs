// Shared rest shapes keep the rendered food and its articulated collision surface aligned.
export function sheetPoint(spec, u, v) {
  let x = u * spec.radius,
    z = v * spec.depth;
  if (spec.shape === 'round') {
    x *= Math.sqrt(1 - (v * v) / 2);
    z *= Math.sqrt(1 - (u * u) / 2);
  }
  const r = Math.hypot(u, v) / Math.SQRT2,
    a = Math.atan2(z, x);
  let y = 0;
  if (spec.id === 'lettuce') {
    const lobe = 1 + 0.06 * Math.sin(a * 9) * r * r;
    x *= lobe;
    z *= lobe;
    y = 0.1 * r * r * Math.sin(a * 9) + 0.035 * Math.sin(x * 4 + z * 3);
  } else if (spec.id === 'prosciutto')
    y = 0.09 * Math.sin(x * 5 + z * 2) + 0.05 * Math.sin(z * 7);
  else if (spec.id === 'roast-beef') {
    const fringe =
      1 +
      Math.pow(r, 4) * (0.055 * Math.sin(a * 31) + 0.028 * Math.sin(a * 53));
    x *= fringe;
    z *= fringe;
    y = 0.085 * Math.sin(x * 5 - z * 3) + 0.009 * Math.sin(x * 62 + z * 8);
  } else if (spec.id === 'bacon')
    y = 0.07 * Math.sin(z * 9) + 0.018 * Math.cos(x * 12);
  else if (spec.id === 'pepper') y = 0.055 * Math.sin(z * 4);
  else if (spec.id === 'aubergine') y = 0.03 * Math.sin(z * 3);
  return [x, y, z];
}

// Shared smooth silhouettes for render meshes and convex collision hulls.
export function batteredPoint(spec, x, y, z) {
  if (spec.id === 'cod')
    return [
      (x * (0.98 - z * 0.23) + 0.085 * (1 - z * z)) * spec.radius,
      y * spec.height * 0.5 * (1 - z * 0.18),
      Math.sign(z) * Math.pow(Math.abs(z), 0.88) * spec.depth,
    ];
  return [
    (x * (0.94 + z * 0.29) + 0.15 * z + 0.09 * (1 - z * z)) * spec.radius,
    y * spec.height * 0.5 * (1 + z * 0.2 - x * 0.08),
    z * spec.depth,
  ];
}

export function avocadoPoint(angle, band) {
  return [
    Math.cos(angle) * (0.72 + 0.1 * band),
    0,
    Math.sin(angle) * (0.27 + 0.34 * band) - 0.23,
  ];
}

export function avocadoSlices() {
  return Array.from({ length: 5 }, (_, i) => ({
    position: [(i - 2) * 0.025, (i - 2) * 0.035, (i - 2) * 0.25],
    angle: (i - 2) * 0.075,
  }));
}

export function fluidPoints(spec) {
  if (spec.ribbon) {
    const path = [],
      distances = [0];
    for (let i = 0; i <= 240; i++) {
      const t = i / 240,
        p = [
          Math.sin(t * Math.PI * 3) * 0.46,
          0.015 * Math.sin(t * Math.PI),
          (t - 0.5) * 1.22,
        ];
      if (i)
        distances.push(
          distances[i - 1] +
            Math.hypot(
              p[0] - path[i - 1][0],
              p[1] - path[i - 1][1],
              p[2] - path[i - 1][2],
            ),
        );
      path.push(p);
    }
    let segment = 1;
    return Array.from({ length: spec.particleCount }, (_, i) => {
      const distance = (i / (spec.particleCount - 1)) * distances.at(-1);
      while (segment < 240 && distances[segment] < distance) segment++;
      const t =
        (distance - distances[segment - 1]) /
        (distances[segment] - distances[segment - 1]);
      return path[segment].map(
        (v, k) => path[segment - 1][k] + (v - path[segment - 1][k]) * t,
      );
    });
  }
  // Space initial particles to prevent overlap forces at spawn.
  const points = [],
    spacing = spec.particleRadius * 2.05;
  for (let q = -3; q <= 3; q++)
    for (let r = -3; r <= 3; r++) {
      if (Math.abs(q + r) > 3) continue;
      const x = spacing * (q + r / 2),
        z = ((spacing * Math.sqrt(3)) / 2) * r;
      const edge = Math.hypot(x, z) / (spacing * 3);
      const angle = Math.atan2(z, x);
      const irregular =
        1 + 0.065 * Math.sin(angle * 3) + 0.04 * Math.cos(angle * 5);
      points.push([
        x * 1.12 * irregular,
        (spec.id === 'hummus' ? 0.15 : 0.065) * Math.max(0, 1 - edge * edge),
        z * 0.93 * irregular,
      ]);
    }
  return points
    .sort((a, b) => Math.hypot(a[0], a[2]) - Math.hypot(b[0], b[2]))
    .slice(0, spec.particleCount);
}

export function clusterParts(spec) {
  if (spec.id === 'falafel')
    return [
      { position: [-0.37, 0, -0.14], radius: 0.32 },
      { position: [0.32, 0.035, -0.15], radius: 0.34 },
      { position: [0.02, 0.015, 0.38], radius: 0.3 },
    ];
  if (spec.id === 'onion')
    return [
      { position: [-0.27, 0, 0], radius: 0.44 },
      { position: [0.29, 0.08, 0.14], radius: 0.36 },
      { position: [0.02, 0.15, -0.23], radius: 0.32 },
    ];
  return [
    { position: [-0.26, 0, -0.13], radius: 0.29 },
    { position: [0.27, 0.04, -0.12], radius: 0.3 },
    { position: [0.03, 0.075, 0.3], radius: 0.27 },
  ];
}
