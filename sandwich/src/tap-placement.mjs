import { CATALOG } from './catalog.mjs';
import { SauceStroke } from './dispensing.mjs';

// Touch portions run in tap order, so a sauce waits for its bread to land.
export class TapPlacement {
  constructor(physics, onAdd, onComplete = () => {}) {
    this.physics = physics;
    this.onAdd = onAdd;
    this.onComplete = onComplete;
    this.queue = [];
    this.stroke = null;
    this.elapsed = 0;
  }

  get pending() { return this.queue.length > 0; }

  enqueue(id) {
    if (!CATALOG[id]) throw new Error(`Unknown ingredient: ${id}`);
    const action = { id, uids: [] };
    this.queue.push(action);
    return action;
  }

  remove(action) {
    const index = this.queue.indexOf(action);
    if (index === 0) {
      this.stroke?.stop();
      this.stroke = null;
      this.elapsed = 0;
    }
    if (index >= 0) this.queue.splice(index, 1);
  }

  clear() {
    this.stroke?.stop();
    this.stroke = null;
    this.elapsed = 0;
    this.queue.length = 0;
  }

  step(dt) {
    const action = this.queue[0];
    if (!action) return;
    if (!this.stroke && this.physics.items.some(
      (item) => item.spec.mode !== 'fluid' && !item.landed,
    )) return;
    const add = (item) => {
      action.uids.push(item.uid);
      this.onAdd(item);
    };
    if (!CATALOG[action.id].dispenser) {
      add(this.physics.add(action.id));
      this.finish(action);
      return;
    }
    const duration = 0.55;
    const position = (t) => {
      const x = (t - 0.5) * 0.64;
      const z = Math.sin(t * Math.PI * 2) * 0.12;
      const y = Math.max(
        this.physics.supportHeight(x, z), this.physics.sauceSurfaceHeight(x, z),
      ) + 0.28 + CATALOG[action.id].dispenser.radius;
      return { x, y, z };
    };
    if (!this.stroke) this.stroke = new SauceStroke(this.physics, action.id, position(0), add);
    const step = Math.min(Math.max(dt, 0), 0.05, duration - this.elapsed);
    this.elapsed += step;
    this.stroke.step(step, position(this.elapsed / duration));
    if (this.elapsed >= duration - 1e-9) {
      this.stroke.stop();
      this.stroke = null;
      this.elapsed = 0;
      this.finish(action);
    }
  }

  finish(action) {
    this.queue.shift();
    this.onComplete(action);
  }
}
