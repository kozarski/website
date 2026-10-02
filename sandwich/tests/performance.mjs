import * as THREE from 'three';
import { CATALOG } from '../src/catalog.mjs';
import { SandwichPhysics } from '../src/physics.mjs';
import { createIngredient, animateIngredient } from '../src/ingredients.mjs';
import { ServingAssembly } from '../src/serving.mjs';
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setSize(720,480);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setClearColor('#fff');
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFShadowMap;
document.querySelector('#scene').append(renderer.domElement);
const scene=new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xfff9ed,0xa9a0af,1.1));
const light=new THREE.DirectionalLight(0xfff4e1,1.7);
light.position.set(-3,8,5); light.castShadow=true;
light.shadow.mapSize.set(2048,2048);
Object.assign(light.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:40});
light.shadow.normalBias=.025; light.shadow.bias=-.0005;
scene.add(light);
const camera=new THREE.OrthographicCamera(-6.8,6.8,4.53,-4.53,.1,150);
camera.position.set(4.5,8.1,10.5); camera.lookAt(0,1.8,0);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.15}));
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);
const p=new SandwichPhysics(), models=[];
const status=document.querySelector('#status'), results=document.querySelector('#results');
const frame=()=>new Promise(requestAnimationFrame);
const stats=values=>{const s=values.slice().sort((a,b)=>a-b);return{mean:+(s.reduce((a,b)=>a+b)/s.length).toFixed(3),p95:+s[Math.floor(s.length*.95)].toFixed(3)}};
async function measure(label, update, simulate = true) {
 const timings={physics:[],skin:[],render:[],frame:[]}; let prev=performance.now(), renderedFrames=0;
 for(let f=0;f<120;f++) {
  await frame(); const now=performance.now();
  if(f>15)timings.frame.push(now-prev); prev=now;
  let t=performance.now(); if(simulate)p.step(1/60); const physics=performance.now()-t;
  t=performance.now(); const changed=update(f/60); const skin=performance.now()-t;
  t=performance.now(); if(simulate || changed || f===0){renderer.render(scene,camera);renderedFrames++;} const render=performance.now()-t;
  if(f>15){timings.physics.push(physics);timings.skin.push(skin);timings.render.push(render);}
 }
 let vertices=0;scene.traverse(m=>{if(m.isMesh)vertices+=m.geometry.attributes.position.count});
 const report={label,renderedFrames,items:p.items.length,bodies:p.world.bodies.length,awake:p.world.bodies.filter(b=>b.mass&&b.sleepState!==2).length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,vertices,ms:Object.fromEntries(Object.entries(timings).map(([k,v])=>[k,stats(v)]))};
 results.textContent+=JSON.stringify(report,null,2)+'\n';
}
document.querySelector('#run').addEventListener('click',async(event)=>{
 event.target.disabled=true;results.textContent='';
 const recipe=['focaccia','mortadella','provolone','tomato','lettuce','prosciutto','mozzarella','lettuce'];
 for(let layer=0;layer<recipe.length;layer++) {
  status.textContent=`Building layer ${layer+1}/8`;
  for(let stack=0;stack<3;stack++) {
   const model=createIngredient(recipe[layer]);const item=p.add(recipe[layer],(stack-1)*3.3,0);p.fitCollision(item,model);scene.add(model);models.push({model,item});
  }
  for(let f=0;f<240;f++)p.step(1/120);
  for(const {model,item}of models)animateIngredient(model,item,1/60,0);
  renderer.render(scene,camera);await frame();
 }
 for(let f=0;f<720;f++)p.step(1/120);
 for(const {model,item}of models)animateIngredient(model,item,1/60,0);
 const ghost=createIngredient('provolone');ghost.position.set(0,5.2,0);scene.add(ghost);
 status.textContent='Measuring building with a selected ingredient';
 await measure('building-24-with-held-provolone',time=>{
  for(const {model,item}of models)if(item.body.sleepState!==2||item.age-item.lastImpact<2)animateIngredient(model,item,1/60,time);
  ghost.rotation.z=Math.sin(time*1.3)*.04;
  animateIngredient(ghost,{spec:CATALOG.provolone,landed:false},1/60,time,true);
 });
 ghost.removeFromParent();
 const served=new ServingAssembly(models.map(({model,item})=>({model,spec:item.spec})));
 models.forEach(({model})=>model.visible=false);scene.add(served.root);
 status.textContent='Measuring served sandwich at rest';
 await measure('served-24-at-rest',()=>served.step(1/60,camera.quaternion,false,false),false);
 status.textContent='Complete';
});
