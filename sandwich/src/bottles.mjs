import * as THREE from 'three';
import { CATALOG } from './catalog.mjs';

const materials = new Map();
function material(color) {
  if (!materials.has(color))
    materials.set(color, new THREE.MeshToonMaterial({ color }));
  return materials.get(color);
}
function add(group, geometry, mat, y) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.y = y;
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// The origin is the opening: squeezing the body never moves the nozzle or stream.
export function createBottle(id) {
  const spec = CATALOG[id],
    d = spec.dispenser;
  const group = new THREE.Group();
  const size = d.size ?? 1;
  group.scale.setScalar(size);
  const width =
    d.shape === 'wide'
      ? 0.37
      : d.shape === 'slim'
        ? 0.255
        : d.shape === 'garnish'
          ? 0.3
          : 0.32;
  const shoulder = d.shape === 'garnish' ? 0.52 : 0.43;
  const body = new THREE.Group();
  body.position.y = shoulder;
  group.add(body);
  // Classic condiments share a tall tube, rounded shoulder and softly rolled heel.
  const profile = d.shape === 'classic'
    ? [
        [0.14, 0],
        [width * 0.53, 0.012],
        [width * 0.64, 0.035],
        [width * 0.78, 0.075],
        [width * 0.89, 0.125],
        [width * 0.97, 0.19],
        [width, 0.27],
        [width, 0.5],
        [width, 1.15],
        [width * 0.995, 1.27],
        [width * 0.97, 1.35],
        [width * 0.88, 1.4],
        [width * 0.75, 1.425],
        [width * 0.56, 1.435],
        [0, 1.435],
      ]
    : [
        [0.14, 0],
        [width * 0.78, 0.07],
        [width, 0.2],
        [width, 0.6],
        [width, 1.05],
        [width * 0.98, 1.17],
        [width * 0.78, 1.23],
        [0, 1.23],
      ];
  add(
    body,
    new THREE.LatheGeometry(
      profile.map((p) => new THREE.Vector2(...p)),
      40,
    ),
    material(d.color),
    0,
  );
  add(
    group,
    new THREE.CylinderGeometry(0.165, 0.15, 0.13, 32),
    material(d.cap),
    shoulder - 0.035,
  );
  for (let i = 0; i < 16; i++) {
    const rib = add(
      group,
      new THREE.BoxGeometry(0.016, 0.1, 0.022),
      material(d.cap),
      shoulder - 0.035,
    );
    const a = (i * Math.PI) / 8;
    rib.position.x = Math.sin(a) * 0.164;
    rib.position.z = Math.cos(a) * 0.164;
    rib.rotation.y = a;
  }
  const tipRadius = (d.radius / size) * 0.72;
  add(
    group,
    new THREE.CylinderGeometry(0.113, tipRadius, shoulder - 0.1, 28),
    material(d.cap),
    (shoulder - 0.1) / 2,
  );
  const hole = add(
    group,
    new THREE.CircleGeometry(tipRadius * 0.72, 20),
    material(spec.color),
    -0.002,
  );
  hole.rotation.x = Math.PI / 2;
  const jetKey = `jet-${id}`;
  if (!materials.has(jetKey))
    materials.set(
      jetKey,
      new THREE.MeshPhongMaterial({
        color: spec.color,
        shininess: id === 'chilli-crisp' ? 110 : id === 'hummus' ? 8 : 24,
        specular:
          id === 'chilli-crisp'
            ? '#ffdc91'
            : id === 'hummus'
              ? '#383128'
              : '#77716a',
        transparent: id === 'chilli-crisp',
        opacity: id === 'chilli-crisp' ? 0.68 : 1,
        depthWrite: id !== 'chilli-crisp',
      }),
    );
  const jet = new THREE.Mesh(new THREE.BufferGeometry(), materials.get(jetKey));
  jet.visible = false;
  jet.castShadow = true;
  group.add(jet);
  group.userData.bottle = { body, jet, squeeze: 0, spec };
  return group;
}

export function updateBottleStream(group, stroke) {
  const { jet, spec } = group.userData.bottle;
  jet.visible = !!stroke?.active;
  if (!jet.visible) return;
  group.updateMatrixWorld(true);
  const points = [new THREE.Vector3(0, -0.005, 0)];
  const recent = stroke.portions
    .slice(-2)
    .flatMap((item) => item.parts)
    .slice(-5)
    .reverse();
  for (const { body } of recent) {
    const point = group.worldToLocal(new THREE.Vector3().copy(body.position));
    if (point.distanceTo(points.at(-1)) < 0.012) continue;
    points.push(point);
    if (point.y < -0.42 / (spec.dispenser.size ?? 1)) break;
  }
  if (points.length === 1) points.push(new THREE.Vector3(0, -0.07, 0));
  jet.geometry.dispose();
  jet.geometry = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    16,
    (spec.dispenser.radius * 0.65) / (spec.dispenser.size ?? 1),
    8,
    false,
  );
}

export function animateBottle(group, held, dt, time, reduceMotion) {
  const state = group.userData.bottle;
  state.squeeze += ((held ? 1 : 0) - state.squeeze) * (1 - Math.exp(-dt * 16));
  const pulse = held && !reduceMotion ? Math.sin(time * 12) * 0.014 : 0;
  state.body.scale.set(
    1 - state.squeeze * 0.14 + pulse,
    1 + state.squeeze * 0.025,
    1 + state.squeeze * 0.07,
  );
}
