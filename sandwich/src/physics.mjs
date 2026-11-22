import * as CANNON from 'cannon-es';
import { Vector3 } from 'three';
import { CATALOG } from './catalog.mjs';
import { createBatteredGeometry } from './battered.mjs';
import {
  collisionEnvelope,
  liftSheetContact,
  liftSheetContacts,
} from './collision-surfaces.mjs';
import { project } from './projection.mjs';
import {
  sheetPoint,
  fluidPoints,
  clusterParts,
  avocadoPoint,
  avocadoSlices,
} from './shapes.mjs';

CANNON.ConvexPolyhedron.project = project;

const STEP = 1 / 120;
// Cannon abandons its catch-up loop after one step's worth of real time, so a
// busy stack that needs 9 ms per step plays at a fraction of its real speed.
// Hold real time for as long as that still leaves a usable frame rate.
const STEP_BUDGET = 30;
// A resting stack is never perfectly still: its joints and contacts leave every
// part trembling by a fraction of a pixel, faster than Cannon's sleep limits
// allow, so a stack of slices used to be simulated forever. Rest is judged by
// where the parts are instead. A portion none of whose parts has strayed this
// far for this long sleeps as one piece. See updateSleep.
const REST_DISTANCE = 0.03,
  REST_TIME = 0.5;
// A part wedged against a sleeping neighbour can be shaken further than that
// for as long as it stays awake. Whatever has still gone nowhere after a few
// seconds is put to rest as well.
const IDLE_DISTANCE = 0.1,
  IDLE_TIME = 4;
// A portion is travelling while it keeps straying this quickly, and its blow
// wakes this many times its own weight in resting food.
const TRAVEL_TIME = 0.1,
  BLOW = 4;
const { SLEEPING } = CANNON.Body;
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

// Values kept per equation: the four Jacobian vectors, each body's inverse
// inertia applied to its rotational one, both inverse masses, then B, 1 / C,
// eps, the force limits and the accumulated lambda.
const ROW = 26;

class FoodSolver extends CANNON.GSSolver {
  rows = new Float64Array(0);
  slots = new Int32Array(0);
  corrections = new Float64Array(0);

  addEquation(equation) {
    // Skip sleeping joints until either body wakes.
    if (equation.bi.sleepState === CANNON.Body.SLEEPING &&
        equation.bj.sleepState === CANNON.Body.SLEEPING) return;
    super.addEquation(equation);
  }

  // Cannon's own Gauss-Seidel loop, with the equations copied into flat arrays
  // first. It visits the same equations in the same order with the same
  // arithmetic, so the outcome is identical; it only stops every iteration
  // from chasing a dozen objects per equation. With a few thousand joints and
  // contacts in a stack of slices, that loop is most of a physics step.
  solve(dt, world) {
    const { equations } = this,
      { bodies } = world,
      count = equations.length;
    if (!count) return 0;
    if (this.rows.length < count * ROW) {
      this.rows = new Float64Array(count * ROW * 2);
      this.slots = new Int32Array(count * 4);
    }
    if (this.corrections.length < bodies.length * 6)
      this.corrections = new Float64Array(bodies.length * 12);
    const { rows, slots, corrections } = this;
    for (const body of bodies) body.updateSolveMassProperties();
    for (let i = 0, o = 0; i < count; i++, o += ROW) {
      const equation = equations[i],
        { bi, bj } = equation;
      rows[o + 20] = equation.computeB(dt);
      rows[o + 21] = 1 / equation.computeC();
      rows[o + 22] = equation.eps;
      rows[o + 23] = equation.minForce;
      rows[o + 24] = equation.maxForce;
      rows[o + 25] = 0;
      const { spatial: sa, rotational: ra } = equation.jacobianElementA,
        { spatial: sb, rotational: rb } = equation.jacobianElementB;
      rows[o] = sa.x;
      rows[o + 1] = sa.y;
      rows[o + 2] = sa.z;
      rows[o + 3] = ra.x;
      rows[o + 4] = ra.y;
      rows[o + 5] = ra.z;
      rows[o + 6] = sb.x;
      rows[o + 7] = sb.y;
      rows[o + 8] = sb.z;
      rows[o + 9] = rb.x;
      rows[o + 10] = rb.y;
      rows[o + 11] = rb.z;
      let e = bi.invInertiaWorldSolve.elements;
      rows[o + 12] = e[0] * ra.x + e[1] * ra.y + e[2] * ra.z;
      rows[o + 13] = e[3] * ra.x + e[4] * ra.y + e[5] * ra.z;
      rows[o + 14] = e[6] * ra.x + e[7] * ra.y + e[8] * ra.z;
      e = bj.invInertiaWorldSolve.elements;
      rows[o + 15] = e[0] * rb.x + e[1] * rb.y + e[2] * rb.z;
      rows[o + 16] = e[3] * rb.x + e[4] * rb.y + e[5] * rb.z;
      rows[o + 17] = e[6] * rb.x + e[7] * rb.y + e[8] * rb.z;
      rows[o + 18] = bi.invMassSolve;
      rows[o + 19] = bj.invMassSolve;
      slots[i * 2] = bi.index * 6;
      slots[i * 2 + 1] = bj.index * 6;
    }
    const v = corrections.fill(0, 0, bodies.length * 6);
    const tolerance = this.tolerance * this.tolerance;
    let iteration = 0;
    for (; iteration !== this.iterations; iteration++) {
      let total = 0;
      for (let i = 0, o = 0; i < count; i++, o += ROW) {
        const a = slots[i * 2],
          b = slots[i * 2 + 1],
          lambda = rows[o + 25];
        const speed =
          v[a] * rows[o] + v[a + 1] * rows[o + 1] + v[a + 2] * rows[o + 2] +
          (v[a + 3] * rows[o + 3] + v[a + 4] * rows[o + 4] + v[a + 5] * rows[o + 5]) +
          (v[b] * rows[o + 6] + v[b + 1] * rows[o + 7] + v[b + 2] * rows[o + 8] +
            (v[b + 3] * rows[o + 9] + v[b + 4] * rows[o + 10] + v[b + 5] * rows[o + 11]));
        let change = rows[o + 21] * (rows[o + 20] - speed - rows[o + 22] * lambda);
        if (lambda + change < rows[o + 23]) change = rows[o + 23] - lambda;
        else if (lambda + change > rows[o + 24]) change = rows[o + 24] - lambda;
        rows[o + 25] = lambda + change;
        total += change > 0 ? change : -change;
        const pushA = rows[o + 18] * change,
          pushB = rows[o + 19] * change;
        v[a] += pushA * rows[o];
        v[a + 1] += pushA * rows[o + 1];
        v[a + 2] += pushA * rows[o + 2];
        v[b] += pushB * rows[o + 6];
        v[b + 1] += pushB * rows[o + 7];
        v[b + 2] += pushB * rows[o + 8];
        v[a + 3] += change * rows[o + 12];
        v[a + 4] += change * rows[o + 13];
        v[a + 5] += change * rows[o + 14];
        v[b + 3] += change * rows[o + 15];
        v[b + 4] += change * rows[o + 16];
        v[b + 5] += change * rows[o + 17];
      }
      if (total * total < tolerance) break;
    }
    for (let i = 0, o = 0; i < bodies.length; i++, o += 6) {
      const { velocity, angularVelocity, linearFactor, angularFactor } = bodies[i];
      velocity.x += linearFactor.x * v[o];
      velocity.y += linearFactor.y * v[o + 1];
      velocity.z += linearFactor.z * v[o + 2];
      angularVelocity.x += angularFactor.x * v[o + 3];
      angularVelocity.y += angularFactor.y * v[o + 4];
      angularVelocity.z += angularFactor.z * v[o + 5];
    }
    for (let i = 0; i < count; i++)
      equations[i].multiplier = rows[i * ROW + 25] * (1 / dt);
    return iteration;
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

// Each part remembers where it was when its portion last strayed (home, turn)
// and last drifted (anchor).
function strayed({ body, home, turn }) {
  if (body.position.distanceSquared(home) > REST_DISTANCE ** 2) return true;
  const q = body.quaternion;
  const aligned = Math.abs(q.x * turn.x + q.y * turn.y + q.z * turn.z + q.w * turn.w);
  // A small turn of angle a leaves the quaternions 1 - a * a / 8 aligned;
  // compare the distance swept by the rim instead of the angle itself.
  return 8 * (1 - aligned) * body.boundingRadius ** 2 > REST_DISTANCE ** 2;
}

function rehome({ body, home, turn }) {
  home.copy(body.position);
  turn.copy(body.quaternion);
}

function drifted({ body, anchor }) {
  return body.position.distanceSquared(anchor) > IDLE_DISTANCE ** 2;
}

function reanchor({ body, anchor }) {
  anchor.copy(body.position);
}

function touching(a, b, margin = 0.05) {
  return ['x', 'y', 'z'].every(
    (axis) =>
      a.lowerBound[axis] - margin < b.upperBound[axis] &&
      b.lowerBound[axis] - margin < a.upperBound[axis],
  );
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
    this.world.addEventListener('postStep', () => {
      this.updateSleep();
      this.updateFrames();
    });
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
      rest: 0,
      quiet: 0,
      idle: 0,
      blow: 0,
      struck: 0,
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
        // Rest is decided for a whole portion at a time. See updateSleep.
        allowSleep: false,
        ...extra,
      });
      body.quaternion.copy(orientation);
      body.foodOwner = item.uid;
      body.item = item;
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
      item.parts.push({
        body,
        rest: new CANNON.Vec3(...rest),
        home: position.clone(),
        turn: orientation.clone(),
        anchor: position.clone(),
      });
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
    item.still = false;
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
      allowSleep: false,
    });
    body.foodOwner = item.uid;
    body.item = item;
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
    item.parts.push({
      body,
      rest: new CANNON.Vec3(),
      home: body.position.clone(),
      turn: body.quaternion.clone(),
      anchor: body.position.clone(),
    });
    this.wake(item);
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

  // After every step: portions that have stopped moving fall asleep whole, and
  // sleeping ones wake when something heavy enough arrives.
  updateSleep() {
    for (const { bi, bj } of this.world.contacts) {
      const a = bi.item,
        b = bj.item;
      if (!a || !b || a === b) continue;
      this.disturb(a, bi, b, bj);
      this.disturb(b, bj, a, bi);
    }
    for (const item of this.items) {
      const { parts } = item;
      if (item.still) {
        // A resting portion gives way to a blow of at least its own weight,
        // and passes on what is left of it.
        if (item.struck >= item.spec.mass || item.afloat) {
          this.wake(item);
          item.blow = Math.max(0, item.struck - item.spec.mass);
        }
      } else {
        if (parts.some(strayed)) {
          if (item.rest < TRAVEL_TIME) item.blow = item.spec.mass * BLOW;
          item.rest = 0;
          parts.forEach(rehome);
        } else if ((item.rest += STEP) >= TRAVEL_TIME) item.blow = 0;
        // Sauce on a slope never quite stops oozing, so once it is slow it
        // counts as settled too.
        const oozing =
          item.spec.mode === 'fluid' &&
          item.age > 2 &&
          parts.every(({ body }) => body.velocity.length() < 0.16);
        item.quiet = oozing ? item.quiet + STEP : 0;
        if (parts.some(drifted)) {
          item.idle = 0;
          parts.forEach(reanchor);
        } else item.idle += STEP;
        if (
          item.landed &&
          !item.afloat &&
          (item.rest >= REST_TIME || item.quiet > 1.25 || item.idle >= IDLE_TIME)
        )
          for (const { body } of parts) body.sleep();
      }
      item.struck = 0;
      item.afloat = false;
    }
  }

  // What a portion feels from something it touches, as of the last step.
  // Acting on it only now lets a blow land on a fixed support: a body woken
  // mid-step has no contacts with the sleeping bodies under it, and would be
  // driven straight through them.
  disturb(item, body, other, otherBody) {
    const sauce = item.spec.mode === 'fluid',
      onSauce = other.spec.mode === 'fluid' && !sauce;
    // A traveller's blow carries on through the stack until it has met
    // several times its own weight in food. A drizzle only stirs other sauce.
    if (other.blow > item.struck && (sauce || other.spec.mode !== 'fluid'))
      item.struck = other.blow;
    // Sauce cannot settle while squeezed under a fixed lid.
    if (onSauce && !other.still && body.position.y > otherBody.position.y)
      item.afloat = true;
  }

  wake(item) {
    item.rest = item.idle = 0;
    item.still = false;
    item.body.wakeUp();
    item.body.sleepState = CANNON.Body.AWAKE;
    item.parts.forEach(rehome);
    item.parts.forEach(reanchor);
  }

  updateFrames() {
    for (const item of this.items) {
      const { parts } = item;
      if (!parts.length) {
        item.minY = item.maxY = item.body.position.y;
        continue;
      }
      const awake = parts.some(({ body }) => body.sleepState !== SLEEPING);
      // Nothing has changed since this portion fell asleep.
      if (!awake && item.still) continue;
      item.still = !awake;
      if (parts.length === 1 && !item.stream) {
        if (item.body.aabbNeedsUpdate) item.body.updateAABB();
        item.bounds.copy(item.body.aabb);
        item.minY = item.body.aabb.lowerBound.y;
        item.maxY = item.body.aabb.upperBound.y;
        continue;
      }
      const frame = item.body;
      item.minY = Infinity;
      item.maxY = -Infinity;
      item.bounds.lowerBound.set(Infinity, Infinity, Infinity);
      item.bounds.upperBound.set(-Infinity, -Infinity, -Infinity);
      frame.position.setZero();
      frame.velocity.setZero();
      for (const { body } of parts) {
        frame.position.vadd(body.position, frame.position);
        frame.velocity.vadd(body.velocity, frame.velocity);
        if (body.aabbNeedsUpdate) body.updateAABB();
        item.bounds.extend(body.aabb);
        item.minY = Math.min(item.minY, body.aabb.lowerBound.y);
        item.maxY = Math.max(item.maxY, body.aabb.upperBound.y);
      }
      frame.position.scale(1 / parts.length, frame.position);
      frame.velocity.scale(1 / parts.length, frame.velocity);
      frame.sleepState = awake ? 0 : SLEEPING;
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
      // Finish impact animations without solving an entirely stationary world.
      for (const item of this.items) {
        item.age += elapsed;
        item.impact *= Math.exp(-elapsed * 5);
      }
      this.world.time += elapsed;
      this.world.accumulator = 0;
      return;
    }
    const world = this.world,
      started = performance.now();
    world.accumulator += elapsed;
    while (world.accumulator >= STEP) {
      world.step(STEP);
      world.accumulator -= STEP;
      if (performance.now() - started > STEP_BUDGET) {
        // Too slow to keep up: drop the backlog instead of spiralling.
        world.accumulator %= STEP;
        break;
      }
    }
  }
  removeLast() {
    const item = this.items.pop();
    if (!item) return null;
    if (item.contactMaterial)
      this.world.removeContactMaterial(item.contactMaterial);
    for (const c of item.constraints) this.world.removeConstraint(c);
    for (const { body } of item.parts) this.world.removeBody(body);
    // Only what the portion touched can have been leaning on it.
    for (const remaining of this.items)
      if (remaining.parts.length && touching(item.bounds, remaining.bounds))
        this.wake(remaining);
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

// sampleSheet for a whole mesh. Everything that depends only on the rest shape
// is worked out once: the top and bottom skins share each mid-surface sample,
// and each sample keeps its four tiles, their weights and its offsets to them.
export function bindSheet(item, base, logical) {
  const { nx, nz } = item.grid;
  const vertices = logical.length / 2;
  const sample = new Uint32Array(vertices),
    offset = new Float64Array(vertices);
  const samples = new Map(),
    tile = [],
    weight = [],
    reach = [];
  for (let i = 0; i < vertices; i++) {
    const u = logical[i * 2],
      v = logical[i * 2 + 1];
    offset[i] = base[i * 3 + 1] - sheetPoint(item.spec, u, v)[1];
    const key = `${u},${v}`;
    if (!samples.has(key)) {
      samples.set(key, samples.size);
      const gx = Math.max(0, Math.min(nx - 1, (u + 1) * 0.5 * nx - 0.5));
      const gz = Math.max(0, Math.min(nz - 1, (v + 1) * 0.5 * nz - 0.5));
      const ix = Math.min(nx - 2, Math.floor(gx)),
        iz = Math.min(nz - 2, Math.floor(gz));
      const tx = gx - ix,
        tz = gz - iz;
      for (const [dx, dz, w] of [
        [0, 0, (1 - tx) * (1 - tz)],
        [1, 0, tx * (1 - tz)],
        [0, 1, (1 - tx) * tz],
        [1, 1, tx * tz],
      ]) {
        const index = (iz + dz) * nx + ix + dx,
          part = item.parts[index];
        tile.push(index);
        weight.push(w);
        reach.push(base[i * 3] - part.rest.x, base[i * 3 + 2] - part.rest.z);
      }
    }
    sample[i] = samples.get(key);
  }
  return {
    item,
    sample,
    offset,
    tile: Uint16Array.from(tile),
    weight: Float64Array.from(weight),
    reach: Float64Array.from(reach),
    frames: new Float64Array(item.parts.length * 12),
    points: new Float64Array(samples.size * 3),
    normals: new Float64Array(samples.size * 3),
  };
}

const axes = [CANNON.Vec3.UNIT_X, CANNON.Vec3.UNIT_Y, CANNON.Vec3.UNIT_Z];
export function skinSheet(skin, positions) {
  const { item, sample, offset, tile, weight, reach, frames, points, normals } = skin;
  for (let k = 0; k < item.parts.length; k++) {
    const { position, quaternion } = item.parts[k].body;
    for (let a = 0; a < 3; a++) {
      quaternion.vmult(axes[a], tileNormal);
      frames[k * 12 + a * 3] = tileNormal.x;
      frames[k * 12 + a * 3 + 1] = tileNormal.y;
      frames[k * 12 + a * 3 + 2] = tileNormal.z;
    }
    frames[k * 12 + 9] = position.x;
    frames[k * 12 + 10] = position.y;
    frames[k * 12 + 11] = position.z;
  }
  for (let s = 0; s < points.length; s += 3) {
    let x = 0,
      y = 0,
      z = 0,
      nx = 0,
      ny = 0,
      nz = 0;
    for (let c = (s / 3) * 4; c < (s / 3) * 4 + 4; c++) {
      const f = tile[c] * 12,
        w = weight[c],
        ox = reach[c * 2],
        oz = reach[c * 2 + 1];
      x += (frames[f] * ox + frames[f + 6] * oz + frames[f + 9]) * w;
      y += (frames[f + 1] * ox + frames[f + 7] * oz + frames[f + 10]) * w;
      z += (frames[f + 2] * ox + frames[f + 8] * oz + frames[f + 11]) * w;
      nx += frames[f + 3] * w;
      ny += frames[f + 4] * w;
      nz += frames[f + 5] * w;
    }
    points[s] = x;
    points[s + 1] = y;
    points[s + 2] = z;
    normals[s] = nx;
    normals[s + 1] = ny;
    normals[s + 2] = nz;
  }
  item.surfaceLift = Math.max(
    item.surfaceLift || 0,
    liftSheetContacts(item, points, points.length / 3, item.spec.height / 2),
  );
  for (let i = 0; i < sample.length; i++) {
    const s = sample[i] * 3,
      o = offset[i];
    positions[i * 3] = points[s] + normals[s] * o;
    positions[i * 3 + 1] = points[s + 1] + normals[s + 1] * o;
    positions[i * 3 + 2] = points[s + 2] + normals[s + 2] * o;
  }
}
