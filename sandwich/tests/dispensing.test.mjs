import test from 'node:test';
import assert from 'node:assert/strict';
import { INGREDIENTS } from '../src/catalog.mjs';
import { SandwichPhysics } from '../src/physics.mjs';
import { SauceStroke } from '../src/dispensing.mjs';

const advance = (physics, seconds) => {
  for (let i = 0; i < seconds * 120; i++) physics.step(1 / 120);
};
const path = (t) => ({
  x: -0.65 + t * 0.43,
  y: 0.84,
  z: Math.sin(t * Math.PI * 1.5) * 0.48,
});

for (const spec of INGREDIENTS.filter((s) => s.dispenser)) {
  test(`${spec.name} dispenses along a path, stops on release, and settles on bread`, () => {
    const physics = new SandwichPhysics();
    physics.add('focaccia');
    advance(physics, 3);
    const stroke = new SauceStroke(physics, spec.id, path(0));
    for (let i = 1; i <= 360; i++) {
      stroke.step(1 / 120, path(i / 120));
      physics.step(1 / 120);
    }
    stroke.stop();
    const bodies = stroke.portions.flatMap((item) =>
      item.parts.map((p) => p.body),
    );
    assert.ok(bodies.length >= 1 + spec.dispenser.rate * 3);
    stroke.step(1, path(3));
    assert.equal(
      stroke.portions.flatMap((item) => item.parts).length,
      bodies.length,
      'release must stop emission',
    );
    advance(physics, 5);
    assert.ok(
      bodies.every((b) => Number.isFinite(b.position.y) && b.position.y > 0.46),
      'the drizzle must stay on the bread',
    );
    assert.ok(
      bodies.every((b) => b.velocity.length() < 0.2),
      'sauce must settle',
    );
    assert.ok(
      Math.max(...bodies.map((b) => b.position.x)) -
        Math.min(...bodies.map((b) => b.position.x)) >
        0.9,
      'drizzle must follow the hand, rather than gather into one blob',
    );
    assert.ok(stroke.portions.every((item) => item.parts.length <= 48));
    for (const portion of stroke.portions.slice().reverse())
      assert.equal(physics.removeLast().uid, portion.uid);
    assert.equal(
      physics.items.length,
      1,
      'one squeeze can be undone without removing bread',
    );
    assert.equal(physics.world.bodies.length, 2);
    assert.equal(physics.world.contactmaterials.length, 0);
  });
}

test('flow rate is independent of display frame rate and long frames cannot cause a flood', () => {
  const count = (fps) => {
    const p = new SandwichPhysics();
    const stroke = new SauceStroke(p, 'mayo', path(0));
    for (let i = 1; i <= fps * 2; i++) {
      stroke.step(1 / fps, path(0));
      p.step(1 / fps);
    }
    return stroke.portions.reduce((sum, item) => sum + item.parts.length, 0);
  };
  assert.equal(count(30), count(120));
  const p = new SandwichPhysics();
  const s = new SauceStroke(p, 'mayo', path(0));
  s.step(30, path(0));
  assert.ok(s.portions[0].parts.length <= 3);
});

test('a quick squeeze is visible, remains finite, and reset removes every particle', () => {
  const p = new SandwichPhysics();
  const s = new SauceStroke(p, 'mustard', { x: 0, y: 0.4, z: 0 });
  s.stop();
  advance(p, 5);
  assert.equal(s.portions[0].parts.length, 1);
  assert.ok(Number.isFinite(s.portions[0].body.position.y));
  assert.ok(s.portions[0].minY > -0.015);
  p.reset();
  assert.equal(p.world.bodies.length, 1);
  assert.equal(p.world.contactmaterials.length, 0);
});

test('a quick sweep fills the path instead of leaving separate dots', () => {
  const p = new SandwichPhysics();
  p.add('focaccia');
  advance(p, 3);
  const s = new SauceStroke(p, 'mayo', { x: -0.75, y: 0.82, z: 0 });
  for (let i = 1; i <= 30; i++) {
    s.step(1 / 120, { x: -0.75 + i * 0.05, y: 0.82, z: 0 });
    p.step(1 / 120);
  }
  s.stop();
  advance(p, 5);
  const positions = s.portions
    .flatMap((item) => item.parts.map(({ body }) => body.position.x))
    .sort((a, b) => a - b);
  assert.ok(positions.length > 12);
  assert.ok(positions.at(-1) - positions[0] > 1.2);
  for (let i = 1; i < positions.length; i++)
    assert.ok(
      positions[i] - positions[i - 1] < 0.15,
      'the physical trail should remain connected',
    );
});

test('mayo follows a cheese-covered chicken shoulder and stays above the bread', () => {
  const p = new SandwichPhysics();
  for (const id of ['focaccia', 'chicken', 'provolone']) {
    p.add(id);
    advance(p, 4);
  }
  const point = (t) => {
    const x = -0.65 + t * 0.65;
    return { x, y: p.supportHeight(x, 0) + 0.33, z: 0 };
  };
  const s = new SauceStroke(p, 'mayo', point(0));
  for (let i = 1; i <= 240; i++) {
    s.step(1 / 120, point(i / 120));
    p.step(1 / 120);
  }
  s.stop();
  advance(p, 5);
  const parts = s.portions.flatMap((item) => item.parts);
  assert.ok(parts.every(({ body }) => body.position.y > 0.46));
  const heights = parts.map(({ body }) => body.position.y);
  assert.ok(
    Math.max(...heights) - Math.min(...heights) > 0.08,
    'the sauce should follow the uneven filling',
  );
});

test('a held bottle lifts above a growing dollop without chasing airborne sauce', () => {
  const p = new SandwichPhysics();
  p.add('focaccia');
  advance(p, 3);
  const s = new SauceStroke(p, 'mayo', { x: 0, y: 0.81, z: 0 });
  assert.equal(
    p.sauceSurfaceHeight(0, 0),
    0,
    'airborne portions must not push up the bottle',
  );
  for (let i = 1; i <= 600; i++) {
    s.step(1 / 120, {
      x: 0,
      y: Math.max(0.48, p.sauceSurfaceHeight(0, 0)) + 0.33,
      z: 0,
    });
    p.step(1 / 120);
  }
  s.stop();
  advance(p, 5);
  const parts = s.portions.flatMap((item) => item.parts);
  assert.ok(p.sauceSurfaceHeight(0, 0) > 0.6);
  assert.ok(
    parts.every(
      ({ body }) => body.position.y > 0.46 && body.velocity.length() < 0.25,
    ),
  );
});

test('release finishes the final hand movement once, without continuing to emit', () => {
  const p = new SandwichPhysics();
  const s = new SauceStroke(p, 'mayo', { x: 0, y: 1, z: 0 });
  s.stop({ x: 0.6, y: 1, z: 0 });
  const parts = s.portions.flatMap((item) => item.parts);
  assert.ok(Math.abs(parts.at(-1).body.position.x - 0.6) < 0.001);
  s.stop({ x: 1.2, y: 1, z: 0 });
  s.step(0.05, { x: 1.2, y: 1, z: 0 });
  assert.equal(s.portions.flatMap((item) => item.parts).length, parts.length);
});
