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
