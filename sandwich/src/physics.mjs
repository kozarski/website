import * as CANNON from 'cannon-es';
import { Vector3 } from 'three';
import { CATALOG } from './catalog.mjs';
import { createBatteredGeometry } from './battered.mjs';
import { collisionEnvelope, liftSheetContact } from './collision-surfaces.mjs';
import {
  sheetPoint,
  fluidPoints,
  clusterParts,
  avocadoPoint,
  avocadoSlices,
} from './shapes.mjs';

const STEP = 1 / 120;
const normal = new CANNON.Vec3(),
  local = new CANNON.Vec3(),
  point = new CANNON.Vec3();
const delta = new CANNON.Vec3(),
  force = new CANNON.Vec3();

class FoodBroadphase extends CANNON.SAPBroadphase {
  constructor(world) {
    super(world);
    this.axisIndex = 1;
    this.useBoundingBoxes = true;
  }

  collisionPairs(world, a, b) {
    if (this.dirty) {
      this.sortList();
      this.dirty = false;
    }
    const bodies = this.axisList;
    for (let i = 0; i < bodies.length; i++) {
      const first = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const second = bodies[j];
        // Bodies are sorted by vertical bounds; later pairs cannot overlap.
        if (second.aabb.lowerBound.y > first.aabb.upperBound.y) break;
        if (first.sheetOwner && first.sheetOwner === second.sheetOwner) continue;
        if (!this.needBroadphaseCollision(first, second)) continue;
        this.intersectionTest(first, second, a, b);
      }
    }
  }
}

class FoodSolver extends CANNON.GSSolver {
  addEquation(equation) {
    // Skip sleeping joints until either body wakes.
    if (equation.bi.sleepState === CANNON.Body.SLEEPING &&
        equation.bj.sleepState === CANNON.Body.SLEEPING) return;
    super.addEquation(equation);
  }
}

const friedEnvelopes = new Map();
// Include crust flakes in the collision hull.
function roundedShape(spec) {
  if (!friedEnvelopes.has(spec.id)) {
    const geometry = createBatteredGeometry(spec);
    const p = geometry.attributes.position;
    const points = Array.from({ length: p.count }, (_, i) => new Vector3().fromBufferAttribute(p, i));
    friedEnvelopes.set(spec.id, collisionEnvelope(points));
    geometry.dispose();
  }
  return new CANNON.ConvexPolyhedron(friedEnvelopes.get(spec.id));
}

export class SandwichPhysics {
  constructor(onImpact = () => {}) {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
      allowSleep: true,
    });
    this.world.broadphase = new FoodBroadphase(this.world);
    this.world.solver = new FoodSolver();
    this.world.solver.iterations = 18;
    Object.assign(this.world.defaultContactMaterial, {
      friction: 0.65,
      restitution: 0.01,
      contactEquationStiffness: 1e7,
      contactEquationRelaxation: 5,
    });
    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: new CANNON.Material({ friction: 1, restitution: 1 }),
    });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    ground.aabbNeedsUpdate = true;
    this.world.addBody(ground);
    this.items = [];
    this.sequence = 0;
    this.onImpact = onImpact;
    this.world.addEventListener('preStep', () => this.beforeStep());
    this.world.addEventListener('postStep', () => this.updateFrames());
  }

  add(id, x = 0, z = 0, y = null, options = {}) {
    let spec = CATALOG[id];
    if (!spec) throw new Error(`Unknown ingredient: ${id}`);
    if (options.stream) {
      if (spec.mode !== 'fluid')
        throw new Error('Only sauces can be squeezed.');
      spec = { ...spec, particleRadius: spec.dispenser.radius };
    }
    let spawnY = y ?? this.supportHeight(x, z) + 3.1;
    for (const other of (options.stream ? [] : [...this.items]).sort(
      (a, b) => a.body.position.y - b.body.position.y,
    )) {
      if (
        Math.abs(other.body.position.x - x) > other.spec.radius + spec.radius ||
        Math.abs(other.body.position.z - z) > other.spec.depth + spec.depth
      )
        continue;
      const gap = (other.spec.height + spec.height) / 2 + 0.08;
      if (Math.abs(spawnY - other.body.position.y) < gap)
        spawnY = other.body.position.y + gap;
    }
    const item = {
      uid: ++this.sequence,
      id,
      spec,
      parts: [],
      constraints: [],
      age: 0,
      lastImpact: -10,
      impact: 0,
      landed: false,
      quiet: 0,
      stream: !!options.stream,
      supportItems: this.items.slice(),
      bounds: new CANNON.AABB(),
    };
    const material = new CANNON.Material({
      friction: spec.friction,
      restitution: spec.bounce,
    });
    item.material = material;
    const orientation = new CANNON.Quaternion();
    orientation.setFromEuler(0, Math.sin(item.uid * 2.4) * 0.15, 0);
    const addPart = (shape, rest, mass, extra = {}) => {
      const position = orientation.vmult(new CANNON.Vec3(...rest));
      position.vadd(new CANNON.Vec3(x, spawnY, z), position);
      const body = new CANNON.Body({
        mass,
        shape,
        material,
        position,
        linearDamping: 0.26,
        angularDamping: 0.55,
        sleepSpeedLimit: 0.09,
        sleepTimeLimit: 1.1,
        ...extra,
      });
      body.quaternion.copy(orientation);
      body.foodOwner = item.uid;
      body.addEventListener('collide', (event) => {
        if (event.body.foodOwner === item.uid) return;
        item.landed = true;
        const strength = Math.abs(event.contact.getImpactVelocityAlongNormal());
        if (strength < 0.3 || item.age - item.lastImpact < 0.13) return;
        item.lastImpact = item.age;
        item.impact = Math.min(6, strength);
        this.onImpact(item, strength);
      });
      this.world.addBody(body);
      item.parts.push({ body, rest: new CANNON.Vec3(...rest) });
      return body;
    };
    if (spec.mode === 'fluid') {
      item.contactMaterial = new CANNON.ContactMaterial(material, material, {
        friction: 0.05,
        restitution: 0,
        contactEquationStiffness: 3000,
        contactEquationRelaxation: 6,
      });
      this.world.addContactMaterial(item.contactMaterial);
    }
    if (spec.mode === 'sheet') {
      const [nx, nz] = spec.grid;
      item.grid = { nx, nz };
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++) {
          const rest = sheetPoint(
            spec,
            ((i + 0.5) / nx) * 2 - 1,
            ((j + 0.5) / nz) * 2 - 1,
          );
          const shape = new CANNON.Box(
            new CANNON.Vec3(
              (spec.radius / nx) * 0.98,
              spec.height / 2,
              (spec.depth / nz) * 0.98,
            ),
          );
          const body = addPart(shape, rest, spec.mass / (nx * nz), {
            linearDamping: spec.lift ? 0.58 : 0.27,
            angularDamping: spec.lift ? 0.58 : 0.7,
          });
          body.sheetOwner = item.uid;
        }
      for (let j = 0; j < nz; j++)
        for (let i = 0; i < nx; i++)
          for (const [di, dj] of [
            [1, 0],
            [0, 1],
          ]) {
            if (i + di >= nx || j + dj >= nz) continue;
            const a = item.parts[j * nx + i],
              b = item.parts[(j + dj) * nx + i + di];
            b.rest.vsub(a.rest, delta);
            delta.scale(0.5, delta);
            const joint = new CANNON.ConeTwistConstraint(a.body, b.body, {
              pivotA: delta.clone(),
              pivotB: delta.negate(),
              axisA: new CANNON.Vec3(0, 1, 0),
              axisB: new CANNON.Vec3(0, 1, 0),
              angle: spec.bend,
              twistAngle: 0.16,
              maxForce: spec.mass * 45,
              // FoodBroadphase already excludes every pair within this sheet.
              // Avoid Cannon scanning all contact pairs again for every joint.
              collideConnected: true,
            });
            this.world.addConstraint(joint);
            item.constraints.push(joint);
          }
    } else if (spec.mode === 'fluid') {
      for (const rest of options.stream ? [] : fluidPoints(spec))
        addPart(
          new CANNON.Sphere(spec.particleRadius),
          rest,
          spec.mass / spec.particleCount,
          {
            linearDamping: 0.35 + spec.viscosity * 0.6,
            angularDamping: 0.95,
            angularFactor: new CANNON.Vec3(0, 0, 0),
            sleepSpeedLimit: 0.055,
          },
        );
    } else if (spec.mode === 'cluster') {
      for (const part of clusterParts(spec)) {
        if (spec.shape === 'ring') {
          const body = addPart(undefined, part.position, spec.mass / 3);
          for (let i = 0; i < 12; i++) {
            const a = (i * Math.PI) / 6,
              r = part.radius * 0.78;
            body.addShape(
              new CANNON.Sphere(spec.id === 'onion' ? 0.045 : 0.064),
              new CANNON.Vec3(Math.cos(a) * r, 0, Math.sin(a) * r),
            );
          }
          if (spec.id === 'jalapeno') {
            body.addShape(new CANNON.Sphere(0.059));
            for (let i = 0; i < 3; i++) {
              const a = (i * Math.PI * 2) / 3;
              const rotation = new CANNON.Quaternion();
              rotation.setFromEuler(0, -a, 0);
              body.addShape(
                new CANNON.Box(
                  new CANNON.Vec3(part.radius * 0.35, 0.035, 0.016),
                ),
                new CANNON.Vec3(
                  Math.cos(a) * part.radius * 0.34,
                  0,
                  Math.sin(a) * part.radius * 0.34,
                ),
                rotation,
              );
            }
          }
        } else
          addPart(new CANNON.Sphere(part.radius), part.position, spec.mass / 3);
      }
    } else if (id === 'bacon' || id === 'avocado') {
      const body = addPart(undefined, [0, 0, 0], spec.mass);
      if (id === 'bacon') {
        for (let i = 0; i < 11; i++) {
          const v = ((i + 0.5) / 11) * 2 - 1;
          const [x, y, z] = sheetPoint(spec, 0, v);
          const rotation = new CANNON.Quaternion();
          rotation.setFromEuler(-Math.atan(0.63 * Math.cos(z * 9)), 0, 0);
          body.addShape(
            new CANNON.Box(
              new CANNON.Vec3(
                spec.radius,
                spec.height / 2,
                (spec.depth / 11) * 1.05,
              ),
            ),
            new CANNON.Vec3(x, y, z),
            rotation,
          );
        }
      } else {
        for (const slice of avocadoSlices())
          for (let i = 0; i < 9; i++) {
            const a = ((i + 0.5) / 9) * Math.PI;
            const [x, , z] = avocadoPoint(a, 0.5);
            const c = Math.cos(slice.angle),
              s = Math.sin(slice.angle);
            const rotation = new CANNON.Quaternion();
            rotation.setFromEuler(
              0,
              slice.angle - Math.atan2(0.44 * Math.cos(a), -0.77 * Math.sin(a)),
              0,
            );
            body.addShape(
              new CANNON.Box(
                new CANNON.Vec3(0.125, 0.06, 0.04 + Math.sin(a) * 0.13),
              ),
              new CANNON.Vec3(
                x * c + z * s + slice.position[0],
                slice.position[1],
                z * c - x * s + slice.position[2],
              ),
              rotation,
            );
          }
      }
    } else {
      let shape;
      if (['chicken', 'cod'].includes(id)) shape = roundedShape(spec);
      else if (spec.shape === 'box')
        shape = new CANNON.Box(
          new CANNON.Vec3(spec.radius, spec.height / 2, spec.depth),
        );
      else {
        shape = new CANNON.Cylinder(spec.radius, spec.radius, spec.height, 20);
        for (const v of shape.vertices) v.z *= spec.depth / spec.radius;
        shape.computeNormals();
        shape.computeEdges();
        shape.updateBoundingSphereRadius();
      }
      const body = addPart(shape, [0, 0, 0], spec.mass);
      body.quaternion.setFromEuler(
        Math.sin(item.uid * 7.3) * 0.035,
        Math.sin(item.uid * 2.4) * 0.15,
        Math.cos(item.uid * 3.1) * 0.025,
      );
    }
    item.body =
      item.parts.length === 1 && !item.stream
        ? item.parts[0].body
        : {
            position: new CANNON.Vec3(x, spawnY, z),
            quaternion: new CANNON.Quaternion(),
            velocity: new CANNON.Vec3(),
            sleepState: 0,
            wakeUp: () => item.parts.forEach((part) => part.body.wakeUp()),
          };
    this.items.push(item);
    this.updateFrames();
    return item;
  }

  fitCollision(item, model) {
    // Preserve articulated sheets, sauce particles, and the open gaps in rings
    // and avocado fans. Closed rigid foods can use an envelope of their artwork.
    if (item.spec.mode !== 'solid' || ['bacon', 'avocado', 'chicken', 'cod'].includes(item.id)) return;
    model.updateMatrixWorld(true);
    const points = [];
    model.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) points.push(new Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
    });
    if (!points.length) return;
    const body = item.body;
    for (const shape of [...body.shapes]) body.removeShape(shape);
    body.addShape(new CANNON.ConvexPolyhedron(collisionEnvelope(points)));
    body.updateMassProperties();
    body.aabbNeedsUpdate = true;
    this.updateFrames();
  }

  emitSauce(item, position) {
    if (!item.stream || !this.items.includes(item))
      throw new Error('A live squeeze portion is required.');
    const spec = item.spec;
    const body = new CANNON.Body({
      mass:
        (spec.mass / spec.particleCount) *
        (spec.particleRadius / CATALOG[item.id].particleRadius) ** 3,
      shape: new CANNON.Sphere(spec.particleRadius),
      material: item.material,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      // Space emissions to avoid overlapping particles.
      velocity: new CANNON.Vec3(
        0,
        -spec.particleRadius * 2.2 * spec.dispenser.rate,
        0,
      ),
      linearDamping: 0.35 + spec.viscosity * 0.6,
      angularDamping: 0.95,
      angularFactor: new CANNON.Vec3(0, 0, 0),
      sleepSpeedLimit: 0.055,
      sleepTimeLimit: 1.1,
    });
    body.foodOwner = item.uid;
    body.isSauce = true;
    body.sauceStableTime = 0;
    body.addEventListener('collide', (event) => {
      if (!event.body.isSauce || event.body.sauceContact)
        body.sauceContact = true;
      if (event.body.foodOwner === item.uid) return;
      item.landed = true;
      item.lastImpact = item.age;
      this.onImpact(item, 0.2);
    });
    this.world.addBody(body);
    item.parts.push({ body, rest: new CANNON.Vec3() });
    item.quiet = 0;
    item.body.sleepState = 0;
    this.updateFrames();
    return body;
  }

  beforeStep() {
    for (const item of this.items) {
      item.age += STEP;
      item.impact *= Math.exp(-STEP * 5);
      if (item.body.sleepState === 2) continue;
      if (item.stream)
        for (const { body } of item.parts) {
          // Dampen sauce velocity on contact.
          if (body.sauceContact)
            body.velocity.scale(
              Math.exp(-STEP * 24 * item.spec.viscosity),
              body.velocity,
            );
          body.sauceStableTime =
            body.sauceContact && body.velocity.length() < 0.15
              ? body.sauceStableTime + STEP
              : 0;
        }
      if (item.spec.lift && !item.landed)
        for (let i = 0; i < item.parts.length; i++) {
          const b = item.parts[i].body;
          b.force.y += b.mass * item.spec.lift;
          b.force.x += b.mass * Math.sin(item.age * 3 + i * 0.6) * 0.22;
          b.torque.z += b.mass * Math.sin(item.age * 4 + i * 0.7) * 0.006;
        }
      if (item.spec.mode === 'fluid') this.cohereFluid(item);
    }
  }

  cohereFluid(item) {
    const { parts, spec } = item,
      rest = spec.particleRadius * 1.85,
      range = rest * 2.4;
    const portionScale = item.stream
      ? (spec.particleRadius / CATALOG[item.id].particleRadius) ** 3
      : 1;
    for (let i = 0; i < parts.length; i++)
      for (let j = i + 1; j < parts.length; j++) {
        const a = parts[i].body,
          b = parts[j].body;
        b.position.vsub(a.position, delta);
        const distance = delta.length();
        if (distance < 1e-5 || distance > range) continue;
        const attraction = Math.min(
          0.065,
          Math.max(-0.02, (distance - rest) * spec.cohesion * 0.034),
        );
        delta.scale((attraction * portionScale) / distance, force);
        a.force.vadd(force, a.force);
        b.force.vsub(force, b.force);
        // Viscosity dissipates relative motion without tethering a droplet to its spawn point.
        b.velocity.vsub(a.velocity, force);
        force.scale(spec.viscosity * 0.009 * portionScale, force);
        a.force.vadd(force, a.force);
        b.force.vsub(force, b.force);
      }
  }

  updateFrames() {
    for (const item of this.items) {
      if (!item.parts.length) {
        item.minY = item.maxY = item.body.position.y;
        continue;
      }
      item.minY = Infinity;
      item.maxY = -Infinity;
      if (item.parts.length === 1 && !item.stream) {
        if (item.body.aabbNeedsUpdate) item.body.updateAABB();
        item.bounds.copy(item.body.aabb);
        item.minY = item.body.aabb.lowerBound.y;
        item.maxY = item.body.aabb.upperBound.y;
        continue;
      }
      const frame = item.body;
      item.bounds.lowerBound.set(Infinity, Infinity, Infinity);
      item.bounds.upperBound.set(-Infinity, -Infinity, -Infinity);
      frame.position.setZero();
      frame.velocity.setZero();
      let asleep = true;
      for (const { body } of item.parts) {
        frame.position.vadd(body.position, frame.position);
        frame.velocity.vadd(body.velocity, frame.velocity);
        if (body.aabbNeedsUpdate) body.updateAABB();
        item.bounds.extend(body.aabb);
        item.minY = Math.min(item.minY, body.aabb.lowerBound.y);
        item.maxY = Math.max(item.maxY, body.aabb.upperBound.y);
        if (body.sleepState !== 2) asleep = false;
      }
      frame.position.scale(1 / item.parts.length, frame.position);
      frame.velocity.scale(1 / item.parts.length, frame.velocity);
      frame.sleepState = asleep ? 2 : 0;
      // Constraint and viscosity forces can leave tiny residual motion forever.
      // Sleep a settled group together; new collisions still wake its parts.
      const speedLimit = item.spec.mode === 'fluid' ? 0.16 : 0.04;
      const settled =
        item.landed &&
        item.age > 2 &&
        item.parts.every(
          ({ body }) =>
            body.velocity.length() < speedLimit &&
            (item.spec.mode === 'fluid' || body.angularVelocity.length() < 0.7),
        );
      item.quiet = settled ? item.quiet + STEP : 0;
      if (item.quiet > 1.25 && !asleep) {
        for (const { body } of item.parts) body.sleep();
        frame.sleepState = 2;
      }
    }
  }

  sauceSurfaceHeight(x, z) {
    let height = 0;
    for (const item of this.items) {
      if (!item.stream) continue;
      const r = item.spec.particleRadius;
      for (const { body } of item.parts) {
        if (body.sauceStableTime < 0.25) continue;
        if (
          (x - body.position.x) ** 2 + (z - body.position.z) ** 2 <
          (r * 1.8) ** 2
        )
          height = Math.max(height, body.position.y + r);
      }
    }
    return height;
  }

  supportHeight(x, z, ignore = null) {
    let result = 0;
    for (const item of this.items) {
      if (item === ignore || !item.landed) continue;
      for (const { body } of item.parts) {
        if (item.stream && body.sauceStableTime < 0.25) continue;
        // Ray against the actual top of each collision tile, including its current bend.
        if (item.spec.mode === 'sheet') {
          body.quaternion.vmult(CANNON.Vec3.UNIT_Y, normal);
          if (normal.y < 0.2) continue;
          const top =
            body.position.y +
            (item.spec.height / 2 -
              normal.x * (x - body.position.x) -
              normal.z * (z - body.position.z)) /
              normal.y;
          point.set(x, top, z);
          body.pointToLocalFrame(point, local);
          const half = body.shapes[0].halfExtents;
          if (
            Math.abs(local.x) <= half.x + 0.012 &&
            Math.abs(local.z) <= half.z + 0.012
          )
            result = Math.max(result, top);
        } else if (item.spec.mode === 'fluid' || item.spec.mode === 'cluster') {
          const r =
            item.spec.mode === 'fluid'
              ? item.spec.particleRadius
              : body.boundingRadius;
          const d = (x - body.position.x) ** 2 + (z - body.position.z) ** 2;
          if (d <= r * r)
            result = Math.max(result, body.position.y + Math.sqrt(r * r - d));
        } else if (
          Math.abs(body.position.x - x) < item.spec.radius &&
          Math.abs(body.position.z - z) < item.spec.depth
        )
          result = Math.max(result, body.position.y + item.spec.height / 2);
      }
    }
    return result;
  }

  step(dt) {
    const elapsed = Math.min(Math.max(dt, 0), 0.05);
    if (!this.world.bodies.some((body) => body.mass > 0 && body.sleepState !== CANNON.Body.SLEEPING)) {
      // Cannon can put the last tile to sleep after its postStep callback.
      if (this.items.some((item) => item.body.sleepState !== CANNON.Body.SLEEPING)) this.updateFrames();
      // Finish impact animations without solving an entirely stationary world.
      for (const item of this.items) {
        item.age += elapsed;
        item.impact *= Math.exp(-elapsed * 5);
      }
      this.world.time += elapsed;
      this.world.accumulator = 0;
      return;
    }
    this.world.step(STEP, elapsed, 8);
  }
  removeLast() {
    const item = this.items.pop();
    if (!item) return null;
    if (item.contactMaterial)
      this.world.removeContactMaterial(item.contactMaterial);
    for (const c of item.constraints) this.world.removeConstraint(c);
    for (const { body } of item.parts) this.world.removeBody(body);
    for (const remaining of this.items) remaining.body.wakeUp();
    return item;
  }
  reset() {
    while (this.items.length) this.removeLast();
    this.world.accumulator = 0;
    this.sequence = 0;
  }
}

// Interpolate each vertex from neighbouring tile positions and rotations.
const skinned = new CANNON.Vec3(),
  offset = new CANNON.Vec3(),
  skinNormal = new CANNON.Vec3(),
  tileNormal = new CANNON.Vec3();
export function sampleSheet(item, u, v, rest, out) {
  const { nx, nz } = item.grid;
  const gx = Math.max(0, Math.min(nx - 1, (u + 1) * 0.5 * nx - 0.5));
  const gz = Math.max(0, Math.min(nz - 1, (v + 1) * 0.5 * nz - 0.5));
  const ix = Math.min(nx - 2, Math.floor(gx)),
    iz = Math.min(nz - 2, Math.floor(gz));
  const tx = gx - ix,
    tz = gz - iz;
  const skinOffset = rest[1] - sheetPoint(item.spec, u, v)[1];
  out.set(0, 0, 0);
  skinNormal.setZero();
  for (const [dx, dz, w] of [
    [0, 0, (1 - tx) * (1 - tz)],
    [1, 0, tx * (1 - tz)],
    [0, 1, (1 - tx) * tz],
    [1, 1, tx * tz],
  ]) {
    const part = item.parts[(iz + dz) * nx + ix + dx];
    offset.set(rest[0] - part.rest.x, 0, rest[2] - part.rest.z);
    part.body.quaternion.vmult(offset, skinned);
    skinned.vadd(part.body.position, skinned);
    out.x += skinned.x * w;
    out.y += skinned.y * w;
    out.z += skinned.z * w;
    part.body.quaternion.vmult(CANNON.Vec3.UNIT_Y, tileNormal);
    skinNormal.x += tileNormal.x * w;
    skinNormal.y += tileNormal.y * w;
    skinNormal.z += tileNormal.z * w;
  }
  // Interpolating between safe physical tiles can cut a chord through their
  // support. Correct the shared mid-surface, keeping both skins equally thick.
  liftSheetContact(item, out, item.spec.height / 2);
  out.x += skinNormal.x * skinOffset;
  out.y += skinNormal.y * skinOffset;
  out.z += skinNormal.z * skinOffset;
  return out;
}
