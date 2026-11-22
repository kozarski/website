import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { SandwichPhysics } from '../src/physics.mjs';
import { animateIngredient } from '../src/ingredients.mjs';
import { CATALOG } from '../src/catalog.mjs';

const key = (a, b) => [a.id, b.id].sort((a, b) => a - b).join(':');

test('vertical collision pruning retains every overlapping pair, including the rotated floor', () => {
  const p = new SandwichPhysics();
  for (const [i, id] of ['focaccia', 'provolone', 'lettuce', 'onion', 'jalapeno', 'falafel', 'mayo', 'brie'].entries())
    p.add(id, (i % 3 - 1) * 0.9, (i % 2 - 0.5) * 0.3, 0.2 + i * 0.18);
  const reference = new CANNON.NaiveBroadphase();
  reference.useBoundingBoxes = true;
  for (let frame = 0; frame < 180; frame++) {
    p.step(1 / 120);
    if (frame % 30) continue;
    const a = [], b = [], expectedA = [], expectedB = [];
    p.world.broadphase.collisionPairs(p.world, a, b);
    reference.collisionPairs(p.world, expectedA, expectedB);
    const expected = expectedA.flatMap((body, i) =>
      body.sheetOwner && body.sheetOwner === expectedB[i].sheetOwner ? [] : [key(body, expectedB[i])]);
    assert.deepEqual(a.map((body, i) => key(body, b[i])).sort(), expected.sort());
  }
  const floor = p.world.bodies[0];
  assert.equal(floor.aabb.upperBound.y, 0);
  assert.equal(floor.aabb.upperBound.z, Number.MAX_VALUE);
});

test('sleeping joints leave the solver and re-enter when either endpoint wakes', () => {
  const p = new SandwichPhysics(), item = p.add('provolone');
  const equation = item.constraints[0].equations[0], solver = p.world.solver;
  equation.bi.sleep(); equation.bj.sleep();
  solver.addEquation(equation);
  assert.equal(solver.equations.length, 0);
  equation.bi.wakeUp(); solver.addEquation(equation);
  assert.equal(solver.equations[0], equation);
});

test('an idle sandwich stays unchanged, finishes impact timers, and wakes for a new drop', () => {
  const p = new SandwichPhysics(), item = p.add('provolone');
  for (let f = 0; f < 720; f++) p.step(1 / 120);
  item.parts.forEach(({body}) => body.sleep());
  p.updateFrames();
  const positions = item.parts.map(({body}) => body.position.clone());
  const step = p.world.stepnumber, age = item.age;
  for (let f = 0; f < 120; f++) p.step(1 / 60);
  assert.equal(p.world.stepnumber, step);
  assert.ok(item.age > age + 1.9);
  item.parts.forEach(({body}, i) => assert.ok(body.position.almostEquals(positions[i], 1e-12)));
  let woken = false;
  item.parts.forEach(({body}) => body.addEventListener('wakeup', () => { woken = true; }));
  const bun = p.add('bun', 0, 0, 1.5);
  for (let f = 0; f < 180; f++) p.step(1 / 120);
  assert.ok(woken);
  assert.ok(bun.landed);
  assert.ok(bun.minY > -0.015);
  p.removeLast();
  assert.ok(item.parts.every(({body}) => body.sleepState !== CANNON.Body.SLEEPING));
});

test('held sheet caching preserves its pose and invalidates for motion preferences or a drop', () => {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), new THREE.MeshBasicMaterial());
  mesh.geometry.rotateX(-Math.PI / 2);
  group.add(mesh);
  group.userData.surface = {mesh, base:mesh.geometry.attributes.position.array.slice(), logical:[-1,-1,1,-1,-1,1,1,1]};
  const item = {spec:CATALOG.provolone};
  animateIngredient(group,item,1/60,0,true,false);
  const version=mesh.geometry.attributes.position.version;
  const pose=mesh.geometry.attributes.position.array.slice();
  animateIngredient(group,item,1/60,1,true,false);
  assert.equal(mesh.geometry.attributes.position.version,version);
  assert.deepEqual(mesh.geometry.attributes.position.array,pose);
  animateIngredient(group,item,1/60,1,true,true);
  assert.ok(mesh.geometry.attributes.position.version>version);
  const p = new SandwichPhysics(), dropped=p.add('provolone');
  animateIngredient(group,dropped,1/60,2,false,false);
  assert.ok(mesh.geometry.attributes.position.getY(0)>2);
});

test('ingredient-level skin pruning matches exhaustive contact checks with lifted layers', async () => {
  const {contactHeight,liftSheetContact}=await import('../src/collision-surfaces.mjs');
  const p=new SandwichPhysics();
  const supports=['focaccia','provolone','onion','jalapeno','falafel'].map((id,i)=>p.add(id,i*.7-1.4,0,.25+i*.35));
  for(const [i,item]of supports.entries()){item.landed=true;item.surfaceLift=i*.013;}
  p.updateFrames();
  const cover={supportItems:supports,surfaceLift:0};
  for(let i=0;i<160;i++){
    const center=new CANNON.Vec3(Math.sin(i*1.7)*2, .2+(i%17)*.09,Math.cos(i*2.3));
    let expected=center.y;
    for(const support of supports)for(const {body}of support.parts){
      const top=contactHeight(body,center.x,center.z,center.y-support.surfaceLift,.053);
      if(Number.isFinite(top))expected=Math.max(expected,top+support.surfaceLift+.035+.012);
    }
    liftSheetContact(cover,center,.035);
    assert.ok(Math.abs(center.y-expected)<1e-12);
  }
});

const advance = (p, seconds) => {
  for (let f = 0; f < Math.round(seconds * 120); f++) p.step(1 / 120);
};
const asleep = (item) => item.body.sleepState === CANNON.Body.SLEEPING;

test('two breads and a dozen rapid slices of prosciutto come to rest in the order they fell', () => {
  const p = new SandwichPhysics();
  for (const id of ['sourdough', 'sourdough']) { p.add(id); advance(p, 1.2); }
  const slices = Array.from({length: 12}, () => { const slice = p.add('prosciutto'); advance(p, 0.25); return slice; });
  advance(p, 5);
  assert.ok(p.items.every(asleep), 'a finished stack must stop being simulated');
  const step = p.world.stepnumber;
  advance(p, 1);
  assert.equal(p.world.stepnumber, step);
  slices.forEach((slice, i) => assert.ok(slice.body.position.y > (slices[i - 1] ?? p.items[1]).body.position.y + 0.04, `slice ${i} sank`));
  assert.ok(slices.at(-1).maxY < 2.9 && slices.every(({body}) => Math.hypot(body.position.x, body.position.z) < 0.25), 'the stack must stay a stack');
});

test('a resting portion ignores a tremble, holds a lighter drop and gives way to a heavier one', () => {
  const p = new SandwichPhysics(), bread = p.add('focaccia');
  advance(p, 2);
  assert.ok(asleep(bread), 'bread alone settles within two seconds');
  const cheese = p.add('provolone');
  advance(p, 2.5);
  assert.ok(asleep(cheese) && asleep(bread));
  let woken = 0;
  for (const {body} of cheese.parts) body.addEventListener('wakeup', () => woken++);
  bread.body.addEventListener('wakeup', () => woken += 100);
  // Cannon's own rule would wake the cheese for any neighbour moving this fast.
  const leaf = p.add('lettuce', 0, 0, cheese.maxY + 0.3);
  advance(p, 0.5);
  assert.ok(woken > 0 && woken < 100, 'a leaf stirs the cheese it lands on, but not the bread beneath');
  advance(p, 3);
  assert.ok(p.items.every(asleep));
  const before = cheese.body.position.y;
  const bun = p.add('top');
  advance(p, 1);
  assert.ok(!asleep(cheese) || cheese.body.position.y < before, 'a bun must press on the filling');
  advance(p, 3);
  assert.ok(p.items.every(asleep));
  assert.ok(bun.minY > leaf.body.position.y - 0.05 && leaf.body.position.y > cheese.body.position.y && cheese.minY > bread.body.position.y);
});

test('a slice dropped on a sleeping slice lands on it instead of being driven through', () => {
  for (const id of ['prosciutto', 'provolone', 'lettuce', 'tomato']) {
    const p = new SandwichPhysics();
    p.add('sourdough');
    advance(p, 2);
    const lower = p.add(id);
    advance(p, 3);
    assert.ok(asleep(lower), `${id} should be resting`);
    const upper = p.add(id);
    advance(p, 4);
    assert.ok(asleep(upper) && asleep(lower));
    upper.parts.forEach(({body}, i) => assert.ok(body.position.y > lower.parts[i].body.position.y, `${id} tile ${i} changed places`));
  }
});

test('undo wakes only what the removed portion touched', () => {
  const p = new SandwichPhysics();
  const left = p.add('bun', -2.6), right = p.add('bun', 2.6);
  advance(p, 2);
  const cheese = p.add('provolone', 2.6), top = p.add('top', 2.6, 0, 4.5);
  advance(p, 4);
  assert.ok(p.items.every(asleep));
  assert.equal(p.removeLast(), top);
  assert.ok(!asleep(cheese) && asleep(left), 'the far bun was never touched');
  advance(p, 3);
  assert.ok(p.items.every(asleep) && cheese.minY > right.body.position.y);
});

test('sauce under a slice settles, and both stop being simulated', () => {
  const p = new SandwichPhysics();
  p.add('focaccia');
  advance(p, 2);
  const mayo = p.add('mayo');
  advance(p, 1.5);
  const cheese = p.add('provolone');
  advance(p, 9);
  assert.ok(p.items.every(asleep), 'sauce and its lid must not keep each other awake');
  assert.ok(cheese.body.position.y > mayo.body.position.y);
});

test('the flattened solver and box projection reproduce Cannon exactly', async () => {
  const {cannonProject, project} = await import('../src/projection.mjs');
  const worlds = [new SandwichPhysics(), new SandwichPhysics()];
  worlds[1].world.solver.solve = CANNON.GSSolver.prototype.solve;
  try {
    for (const id of ['focaccia', 'chicken', 'provolone', 'mayo', 'lettuce', 'onion', 'bacon', 'prosciutto', 'top']) {
      for (const p of worlds) p.add(id, 0.1);
      for (let f = 0; f < 70; f++) worlds.forEach((p, stock) => {
        CANNON.ConvexPolyhedron.project = stock ? cannonProject : project;
        p.step(1 / 120);
      });
      worlds[0].world.bodies.forEach((body, i) => {
        const other = worlds[1].world.bodies[i];
        for (const key of ['position', 'quaternion', 'velocity', 'angularVelocity'])
          assert.deepEqual(body[key].toArray(), other[key].toArray(), `${id}: body ${i} ${key}`);
      });
    }
    assert.ok(worlds[0].world.contacts.length > 100);
    assert.deepEqual(worlds[0].world.contacts.map((c) => c.multiplier), worlds[1].world.contacts.map((c) => c.multiplier));
  } finally {
    CANNON.ConvexPolyhedron.project = project;
  }
});

test('a whole skin and its normals match the per-vertex reference', async () => {
  const {sampleSheet} = await import('../src/physics.mjs');
  const {sheetPoint} = await import('../src/shapes.mjs');
  const p = new SandwichPhysics();
  for (const id of ['focaccia', 'brie', 'provolone', 'onion', 'lettuce', 'prosciutto']) { p.add(id, 0.2); advance(p, 1); }
  for (const item of p.items.filter((item) => item.grid)) {
    // Both faces of a slice, as the mesh is built, plus a few loose strands.
    const n = 12, base = [], logical = [], indices = [];
    for (const side of [1, -1]) for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const u = i / n * 2 - 1, v = j / n * 2 - 1, [x, y, z] = sheetPoint(item.spec, u, v);
      base.push(x, y + side * item.spec.height / 2, z);
      logical.push(u, v);
      const k = base.length / 3 - 1;
      if (i < n && j < n) indices.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2);
    }
    for (const [u, v] of [[0.31, -0.42], [-0.77, 0.13], [0.05, 0.91]]) {
      base.push(...sheetPoint(item.spec, u, v).map((value, axis) => value + (axis === 1 ? item.spec.height / 2 + 0.004 : 0)));
      logical.push(u, v);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const group = new THREE.Group(), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    group.add(mesh);
    group.userData.surface = {mesh, base: new Float32Array(base), logical};
    animateIngredient(group, item, 1 / 60, 0);
    const skinned = geometry.attributes.position.array.slice(), lift = item.surfaceLift;
    const normals = geometry.attributes.normal.array.slice();
    item.surfaceLift = 0;
    const out = new CANNON.Vec3();
    for (let i = 0; i < logical.length / 2; i++) {
      sampleSheet(item, logical[i * 2], logical[i * 2 + 1], [...group.userData.surface.base.subarray(i * 3, i * 3 + 3)], out);
      assert.deepEqual([...skinned.subarray(i * 3, i * 3 + 3)], [out.x, out.y, out.z].map(Math.fround), `${item.id} vertex ${i}`);
    }
    assert.equal(item.surfaceLift, lift);
    geometry.computeVertexNormals();
    assert.deepEqual(normals, geometry.attributes.normal.array);
  }
  assert.ok(p.items.some((item) => item.surfaceLift > 0), 'the comparison must include lifted contacts');
});

test('a slow step costs frame rate before it costs simulation speed', () => {
  const p = new SandwichPhysics();
  p.add('provolone', 0, 0, 3);
  const now = performance.now;
  let clock = 0, stepMs = 9;
  // Each world step appears to take stepMs: more than Cannon's own allowance of one step.
  const internalStep = p.world.internalStep.bind(p.world);
  p.world.internalStep = (dt) => { internalStep(dt); clock += stepMs; };
  performance.now = () => clock;
  try {
    let step = p.world.stepnumber;
    p.step(1 / 30);
    assert.equal(p.world.stepnumber - step, 4, 'a 30 fps frame still advances a thirtieth of a second');
    stepMs = 20;
    step = p.world.stepnumber;
    p.step(0.05);
    assert.equal(p.world.stepnumber - step, 2, 'a hopeless frame gives up early');
    step = p.world.stepnumber;
    stepMs = 1;
    p.step(1 / 60);
    assert.equal(p.world.stepnumber - step, 2, 'and does not carry its backlog forward');
  } finally {
    performance.now = now;
  }
});
