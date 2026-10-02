import { CATALOG } from './catalog.mjs';

// Group each press into one undo action; split long strokes into local fluid grids.
export class SauceStroke {
  constructor(physics, id, position, onPortion = () => {}) {
    if (!CATALOG[id]?.dispenser)
      throw new Error('Select a sauce bottle first.');
    this.physics = physics;
    this.id = id;
    this.portions = [];
    this.onPortion = onPortion;
    this.active = true;
    this.elapsed = 0;
    this.previous = { ...position };
    this.emit(position);
  }

  emit(position) {
    const previous = this.lastEmission ?? position;
    const distance = Math.hypot(
      position.x - previous.x,
      position.y - previous.y,
      position.z - previous.z,
    );
    // Resample fast pointer movement at roughly one particle diameter.
    const steps = Math.min(
      64,
      Math.max(
        1,
        Math.ceil(distance / (CATALOG[this.id].dispenser.radius * 2.05)),
      ),
    );
    for (let i = 1; i <= steps; i++)
      this.emitPortion({
        x: previous.x + ((position.x - previous.x) * i) / steps,
        y: previous.y + ((position.y - previous.y) * i) / steps,
        z: previous.z + ((position.z - previous.z) * i) / steps,
      });
    this.lastEmission = { ...position };
  }

  emitPortion(position) {
    let item = this.portions.at(-1);
    if (
      !item ||
      item.parts.length >= 32 ||
      Math.hypot(
        position.x - this.origin.x,
        position.z - this.origin.z,
        position.y - this.origin.y,
      ) > 0.85
    ) {
      const previous = item;
      item = this.physics.add(this.id, position.x, position.z, position.y, {
        stream: true,
      });
      // Shared render samples blend the join, without duplicating physics bodies.
      item.seam = previous?.parts.slice(-2) ?? [];
      this.origin = { ...position };
      this.portions.push(item);
      this.onPortion(item);
    }
    this.physics.emitSauce(item, position);
  }

  step(dt, position) {
    if (!this.active) return;
    const interval = 1 / CATALOG[this.id].dispenser.rate;
    const duration = Math.min(Math.max(dt, 0), 0.05);
    const before = this.elapsed;
    this.elapsed += duration;
    let offset = interval - before;
    while (this.elapsed + 1e-9 >= interval) {
      const t = Math.min(1, offset / Math.max(duration, 1e-9));
      this.emit({
        x: this.previous.x + (position.x - this.previous.x) * t,
        y: this.previous.y + (position.y - this.previous.y) * t,
        z: this.previous.z + (position.z - this.previous.z) * t,
      });
      this.elapsed -= interval;
      offset += interval;
    }
    this.previous = { ...position };
  }

  stop(position = null) {
    if (
      this.active &&
      position &&
      Math.hypot(
        position.x - this.lastEmission.x,
        position.y - this.lastEmission.y,
        position.z - this.lastEmission.z,
      ) >
        CATALOG[this.id].dispenser.radius * 0.5
    )
      this.emit(position);
    this.active = false;
  }
}
