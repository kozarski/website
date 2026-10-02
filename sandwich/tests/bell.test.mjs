import test from 'node:test';
import assert from 'node:assert/strict';
import { bellPose } from '../src/bell.mjs';

test('the service bell holds its pin down, vibrates on release and settles', () => {
  const resting = bellPose(Infinity);
  assert.deepEqual(resting, { pin: 0, tilt: 0, shift: 0 });
  const pressed = bellPose(2, true);
  assert.ok(pressed.pin < -0.1);
  assert.equal(pressed.tilt, 0, 'the held bell should not wobble continuously');
  const release = bellPose(0);
  assert.equal(release.pin, pressed.pin, 'release starts at the pressed position');
  const early = bellPose(0.08), late = bellPose(1);
  assert.ok(Math.abs(early.tilt) > 0.005);
  assert.ok(early.pin > pressed.pin);
  assert.ok(Math.abs(late.tilt) < 0.0001);
  assert.ok(Math.abs(late.pin) < 0.0001);
  const reduced = bellPose(0.08, false, true);
  assert.equal(reduced.tilt, 0);
  assert.equal(reduced.shift, 0);
});
