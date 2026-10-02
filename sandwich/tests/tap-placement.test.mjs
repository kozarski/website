import test from 'node:test';
import assert from 'node:assert/strict';
import { INGREDIENTS } from '../src/catalog.mjs';
import { SandwichPhysics } from '../src/physics.mjs';
import { TapPlacement } from '../src/tap-placement.mjs';

function setup() {
  const physics = new SandwichPhysics();
  const completed = [];
  const taps = new TapPlacement(physics, () => {}, (action) => completed.push(action.id));
  const advance = (seconds) => {
    for (let i = 0; i < seconds * 120; i++) {
      taps.step(1 / 120);
      physics.step(1 / 120);
    }
  };
  return { physics, taps, completed, advance };
}

test('rapid ingredient taps land in order without a second canvas interaction', () => {
  const { physics, taps, completed, advance } = setup();
  const actions = ['focaccia', 'tomato', 'provolone'].map((id) => taps.enqueue(id));
  advance(0.1);
  assert.equal(physics.items.length, 1, 'later portions wait for the bread');
  advance(5);
  assert.deepEqual(completed, ['focaccia', 'tomato', 'provolone']);
  assert.ok(actions.every((action) => action.uids.length === 1));
  assert.ok(physics.items.every((item) => item.landed && Number.isFinite(item.maxY)));
  assert.equal(taps.pending, false);
});

for (const spec of INGREDIENTS.filter((ingredient) => ingredient.dispenser)) {
  test(`one ${spec.name} tap places a finite drizzle on landed bread`, () => {
    const { physics, taps, completed, advance } = setup();
    taps.enqueue('focaccia');
    const action = taps.enqueue(spec.id);
    advance(0.1);
    assert.equal(action.uids.length, 0, 'sauce waits for the bread to land');
    advance(6);
    assert.deepEqual(completed, ['focaccia', spec.id]);
    const portions = physics.items.filter((item) => action.uids.includes(item.uid));
    const parts = portions.flatMap((item) => item.parts);
    assert.ok(parts.length >= 5 && parts.length <= 40, 'one bounded portion per tap');
    assert.ok(parts.every(({ body }) => Number.isFinite(body.position.y) && body.position.y > 0.46));
    assert.equal(taps.pending, false);
    const count = physics.world.bodies.length;
    advance(2);
    assert.equal(physics.world.bodies.length, count, 'the automatic squeeze stops');
  });
}

test('undo and reset cancel queued taps and a partly poured sauce', () => {
  const { physics, taps, completed, advance } = setup();
  taps.enqueue('focaccia');
  const queued = taps.enqueue('tomato');
  taps.remove(queued);
  advance(3);
  assert.deepEqual(completed, ['focaccia']);
  const sauce = taps.enqueue('mayo');
  advance(0.1);
  assert.ok(sauce.uids.length > 0);
  taps.remove(sauce);
  for (const uid of [...sauce.uids].reverse()) assert.equal(physics.removeLast().uid, uid);
  advance(2);
  assert.deepEqual(physics.items.map((item) => item.id), ['focaccia']);
  taps.enqueue('mustard');
  taps.enqueue('provolone');
  advance(0.1);
  taps.clear();
  physics.reset();
  advance(2);
  assert.equal(physics.world.bodies.length, 1);
  assert.equal(taps.pending, false);
});
