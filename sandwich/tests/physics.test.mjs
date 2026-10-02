import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { Quaternion } from 'three';
import { SandwichPhysics, sampleSheet } from '../src/physics.mjs';
import { INGREDIENTS } from '../src/catalog.mjs';
import { sheetPoint } from '../src/shapes.mjs';
import { createBatteredGeometry } from '../src/battered.mjs';

function advance(physics, seconds, fps = 120) {
  for (let i = 0; i < seconds * fps; i++) physics.step(1 / fps);
}

test('crispy bacon bridges a narrow filling without folding down around it', () => {
  const p = new SandwichPhysics();
  p.add('brie');
  advance(p, 4);
  const bacon = p.add('bacon', 0.3, 0);
  advance(p, 6);
  assert.ok(
    bacon.maxY - bacon.minY < 0.4,
    'crisp corrugations should stay shallow',
  );
  const bounds = bacon.body.aabb;
  assert.ok(
    bounds.upperBound.z - bounds.lowerBound.z > 2.3,
    'the long strip must not fold back on itself',
  );
  assert.ok(
    bacon.minY > 0.27,
    'ends should bridge the filling instead of draping to the ground',
  );
  assert.ok(bacon.body.velocity.length() < 0.05);
});

test('the landed cod has a long fillet silhouette, distinct from a broad chicken patty', () => {
  const ratio = (id) => {
    const p = new SandwichPhysics();
    const item = p.add(id);
    advance(p, 6);
    // The collision envelope encloses the flakes conservatively; measure the
    // actual visible silhouette, not the small safety margin around it.
    const geometry = createBatteredGeometry(item.spec);
    geometry.applyQuaternion(new Quaternion().copy(item.body.quaternion));
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const result = (max.z - min.z) / (max.x - min.x);
    geometry.dispose();
    return result;
  };
  assert.ok(ratio('cod') > 2, 'a fuller fillet must still read as long fish');
  assert.ok(ratio('chicken') < 1.15);
});

test('oversized fried proteins overhang focaccia and remain balanced after landing', () => {
  for (const id of ['chicken', 'cod']) {
    const p = new SandwichPhysics();
    const bread = p.add('focaccia');
    advance(p, 3);
    const protein = p.add(id);
    advance(p, 7);
    const axis = id === 'cod' ? 'z' : 'x';
    const width = (item) =>
      item.body.aabb.upperBound[axis] - item.body.aabb.lowerBound[axis];
    assert.ok(width(protein) > width(bread) * 1.05, `${id} should overhang`);
    assert.ok(protein.body.position.y > bread.maxY);
    assert.ok(protein.body.velocity.length() < 0.05);
    assert.ok(protein.body.angularVelocity.length() < 0.05);
  }
});

test('tamago stays a thick patty and the avocado fan settles as one arranged portion', () => {
  const p = new SandwichPhysics();
  const egg = p.add('tamago', -2),
    avocado = p.add('avocado', 2);
  advance(p, 6);
  assert.ok(egg.maxY - egg.minY > 0.48 && egg.maxY - egg.minY < 0.56);
  assert.ok(avocado.maxY - avocado.minY < 0.38);
  assert.ok(avocado.minY > -0.005);
  assert.ok(avocado.body.velocity.length() < 0.05);
});

for (const spec of INGREDIENTS) {
  test(`${spec.name} lands without falling through the floor or becoming unstable`, () => {
    const physics = new SandwichPhysics();
    const item = physics.add(spec.id, 0, 0, 3);
    advance(physics, 6);
    assert.ok(item.landed);
    assert.ok(item.minY > -0.015, `lowest collision point: ${item.minY}`);
    assert.ok(item.maxY < 0.9, `highest collision point: ${item.maxY}`);
    for (const { body } of item.parts) {
      assert.ok(
        [body.position.x, body.position.y, body.position.z].every(
          Number.isFinite,
        ),
      );
      assert.ok(body.velocity.length() < 0.25);
    }
  });
}

test('cheese drapes around a narrow support and its rendered skin follows the collision tiles', () => {
  const physics = new SandwichPhysics();
  physics.add('brie');
  advance(physics, 4);
  const cheese = physics.add('provolone', 0.4, 0);
  advance(physics, 6);
  const heights = cheese.parts.map(({ body }) => body.position.y);
  assert.ok(
    Math.max(...heights) - Math.min(...heights) > 0.14,
    'slice must retain a bend',
  );
  assert.ok(Math.max(...heights) > 0.3, 'centre must stay on the support');
  const vertex = new CANNON.Vec3();
  sampleSheet(cheese, 0, 0, sheetPoint(cheese.spec, 0, 0), vertex);
  assert.ok(Math.abs(vertex.y - cheese.parts[12].body.position.y) < 0.01);
  assert.ok(physics.supportHeight(0.4, 0) > 0.3);
});

test('a tomato stays thicker and bends less sharply than a thin cheese slice', () => {
  const bend = (id) => {
    const physics = new SandwichPhysics();
    physics.add('brie');
    advance(physics, 4);
    const item = physics.add(id, 0.65, 0);
    advance(physics, 5);
    const normals = item.parts.map(({ body }) =>
      body.quaternion.vmult(CANNON.Vec3.UNIT_Y),
    );
    return Math.min(...normals.map((normal) => normal.y));
  };
  assert.ok(
    bend('tomato') > bend('provolone'),
    'the cheese should curl further over an edge',
  );
});

test('lettuce catches air, with consistent descent at 30 and 120 display frames per second', () => {
  const fast = new SandwichPhysics(),
    slow = new SandwichPhysics();
  const leaf = fast.add('lettuce', 3, 0, 4),
    bun = fast.add('bun', -3, 0, 4);
  const otherLeaf = slow.add('lettuce', 3, 0, 4);
  advance(fast, 1);
  advance(slow, 1, 30);
  assert.ok(leaf.body.position.y > bun.body.position.y + 1);
  assert.ok(Math.abs(leaf.body.position.y - otherLeaf.body.position.y) < 0.02);
});

test('mayo spreads on landing; hummus retains a thicker mound', () => {
  const land = (id) => {
    const physics = new SandwichPhysics(),
      item = physics.add(id);
    advance(physics, 7);
    return item;
  };
  const mayo = land('mayo'),
    hummus = land('hummus');
  const xs = mayo.parts.map(({ body }) => body.position.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.6);
  assert.ok(hummus.maxY > mayo.maxY * 1.2);
  assert.equal(mayo.body.sleepState, 2);
});

test('repeated flexible drops remain independent and undo removes all their bodies and joints', () => {
  const physics = new SandwichPhysics();
  physics.add('focaccia');
  advance(physics, 4);
  const first = physics.add('provolone');
  advance(physics, 4);
  const second = physics.add('provolone');
  advance(physics, 4);
  assert.notEqual(first.uid, second.uid);
  assert.ok(second.body.position.y > first.body.position.y + 0.035);
  const removed = physics.removeLast();
  assert.ok(
    removed.parts.every(({ body }) => !physics.world.bodies.includes(body)),
  );
  assert.ok(
    removed.constraints.every(
      (joint) => !physics.world.constraints.includes(joint),
    ),
  );
  assert.ok(first.parts.every(({ body }) => body.sleepState !== 2));
  physics.reset();
  assert.equal(physics.world.bodies.length, 1);
  assert.equal(physics.world.constraints.length, 0);
  assert.equal(physics.items.length, 0);
  assert.equal(physics.removeLast(), null);
  assert.equal(physics.add('bun').uid, 1);
});

test('rapid drops start separately and a long suspended frame stays bounded', () => {
  const physics = new SandwichPhysics();
  const a = physics.add('bun', 0, 0, 3),
    b = physics.add('bun', 0, 0, 3),
    c = physics.add('bun', 0, 0, 3);
  assert.ok(b.body.position.y - a.body.position.y > a.spec.height);
  assert.ok(c.body.position.y - b.body.position.y > b.spec.height);
  physics.step(30);
  assert.ok(a.body.position.y > 2);
  advance(physics, 10);
  assert.ok(
    c.body.position.y > b.body.position.y &&
      b.body.position.y > a.body.position.y,
  );
});

test('a bread, chicken, cheese and tomato stack keeps its layers in contact', () => {
  const physics = new SandwichPhysics();
  for (const id of ['focaccia', 'chicken', 'provolone', 'tomato']) {
    physics.add(id);
    advance(physics, 4);
  }
  const [bread, chicken, cheese, tomato] = physics.items;
  assert.ok(chicken.body.position.y > bread.maxY);
  assert.ok(cheese.maxY > chicken.maxY);
  assert.ok(tomato.body.position.y > cheese.body.position.y);
  for (const item of physics.items)
    assert.ok(item.parts.every(({ body }) => body.velocity.length() < 0.15));
});

for (const spec of INGREDIENTS.filter((spec) => spec.mode === 'fluid')) {
  test(`${spec.name} stays on the bread as a connected portion`, () => {
    const physics = new SandwichPhysics();
    const bread = physics.add('focaccia');
    advance(physics, 3);
    const item = physics.add(spec.id);
    advance(physics, 5);
    assert.ok(
      item.parts.every(({ body }) => body.position.y > bread.maxY),
      'no sauce beads should scatter off the bread',
    );
    const visited = new Set([0]),
      queue = [0];
    // Nearby particles must form one continuous spread, rather than detached beads.
    while (queue.length) {
      const from = item.parts[queue.pop()].body.position;
      item.parts.forEach(({ body }, index) => {
        if (
          !visited.has(index) &&
          from.distanceTo(body.position) < spec.particleRadius * 3.2
        ) {
          visited.add(index);
          queue.push(index);
        }
      });
    }
    assert.equal(visited.size, item.parts.length);
    physics.removeLast();
    assert.equal(
      physics.world.contactmaterials.length,
      0,
      'undo removes sauce contact settings',
    );
  });
}

test('the thin leaf skin stays above its flat support instead of showing holes through the bread', () => {
  const physics = new SandwichPhysics();
  physics.add('focaccia');
  advance(physics, 3);
  const leaf = physics.add('lettuce');
  advance(physics, 5);
  const point = new CANNON.Vec3();
  for (let j = 3; j <= 15; j++)
    for (let i = 3; i <= 15; i++) {
      const u = (i / 18) * 2 - 1,
        v = (j / 18) * 2 - 1;
      const rest = sheetPoint(leaf.spec, u, v);
      rest[1] += leaf.spec.height / 2;
      sampleSheet(leaf, u, v, rest, point);
      assert.ok(point.y > 0.48, `leaf skin intersects bread at ${point.y}`);
    }
});
