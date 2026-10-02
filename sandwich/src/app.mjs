import * as THREE from 'three';
import { INGREDIENTS, CATALOG, CATEGORIES } from './catalog.mjs';
import { SandwichPhysics } from './physics.mjs';
import { SauceStroke } from './dispensing.mjs';
import { TapPlacement } from './tap-placement.mjs';
import { ServingAssembly, ringBell } from './serving.mjs';
import { mountServiceBell } from './bell.mjs';
import { mountKnifeTool } from './knife.mjs';
import { createBottle, animateBottle, updateBottleStream } from './bottles.mjs';
import {
  createIngredient,
  animateIngredient,
  disposeIngredient,
} from './ingredients.mjs';

const $ = (selector) => document.querySelector(selector);
const stage = $('#scene');
const exportError = $('#export-error');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const touchLayout = matchMedia('(hover: none) and (pointer: coarse)');
const nameInput = $('#sandwich-name');
const defaultSandwichName = nameInput.defaultValue;
const nameMeasure = document.createElement('canvas').getContext('2d');
let nameBeforeEdit = nameInput.value;
const sandwichName = () => nameInput.value.trim().replace(/\s+/g, ' ') || defaultSandwichName;

function updateSandwichName() {
  const text = nameInput.value || defaultSandwichName;
  $('#name-width').textContent = text;
  document.title = sandwichName();
  const font = getComputedStyle($('h1'));
  nameMeasure.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
  const available = Math.min(680, innerWidth - 84);
  const scale = Math.min(1, available / Math.max(1, nameMeasure.measureText(text).width));
  $('.name-field').style.fontSize = `${parseFloat(font.fontSize) * scale}px`;
}
nameInput.addEventListener('focus', () => { nameBeforeEdit = nameInput.value; });
nameInput.addEventListener('input', updateSandwichName);
nameInput.addEventListener('blur', () => {
  nameInput.value = sandwichName();
  updateSandwichName();
});
nameInput.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') nameInput.value = nameBeforeEdit;
    nameInput.blur();
  }
});
addEventListener('resize', updateSandwichName);
updateSandwichName();
document.fonts.ready.then(updateSandwichName);

try {
  start();
} catch (error) {
  console.error('The sandwich playground could not start.', error);
  $('#error').hidden = false;
  $('#error').textContent =
    'This playground needs WebGL. Try a browser with hardware acceleration enabled.';
}

function start() {
  const serviceBell = mountServiceBell($('#serve'), reducedMotion);
  const knifeTool = mountKnifeTool($('.resting-knife'));
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0xffffff, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 150);
  const ambient = new THREE.HemisphereLight(0xfff9ed, 0xa9a0af, 1.1);
  scene.add(ambient);
  const light = new THREE.DirectionalLight(0xfff4e1, 1.7);
  light.position.set(-3, 8, 5);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {
    left: -8,
    right: 8,
    top: 8,
    bottom: -8,
    near: 0.1,
    far: 40,
  });
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.025;
  light.shadow.radius = 3;
  scene.add(light);

  // Render palette thumbnails once from the ingredient meshes.
  const iconScene = new THREE.Scene();
  iconScene.add(new THREE.HemisphereLight(0xfff9ed, 0xb2a2b1, 1.1));
  const iconLight = new THREE.DirectionalLight(0xfff4e1, 1.7);
  iconLight.position.set(-3, 7, 5);
  iconScene.add(iconLight);
  const iconCamera = new THREE.OrthographicCamera(
    -1.55,
    1.55,
    1.13,
    -1.13,
    0.1,
    30,
  );
  iconCamera.position.set(3.5, 5.5, 7);
  iconCamera.lookAt(0, 0, 0);
  renderer.setSize(176, 128, false);
  const ingredientGroups = new Map();
  for (const [id, category] of Object.entries(CATEGORIES)) {
    const group = document.createElement('section');
    group.className = 'ingredient-group';
    group.setAttribute('aria-label', category.label);
    const list = document.createElement('div');
    list.className = 'ingredient-list';
    group.append(list);
    $(`#${category.side}-list`).append(group);
    ingredientGroups.set(id, list);
  }
  for (const spec of INGREDIENTS) {
    const model = spec.dispenser
      ? createBottle(spec.id)
      : createIngredient(spec.id);
    model.rotation.y = -0.18;
    if (spec.dispenser) {
      model.position.y = -0.68;
      model.rotation.y = 0.35;
    }
    iconScene.add(model);
    if (model.userData.surface)
      animateIngredient(model, { spec, landed: false }, 0, 0, true);
    iconCamera.zoom = spec.id === 'cod' ? 0.84 : spec.id === 'chicken' ? 0.9 : 1;
    iconCamera.updateProjectionMatrix();
    renderer.render(iconScene, iconCamera);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ingredient';
    button.dataset.ingredient = spec.id;
    button.setAttribute('aria-label', `${touchLayout.matches ? 'Add' : 'Pick up'} ${spec.name.toLowerCase()}`);
    button.setAttribute('aria-pressed', 'false');
    const img = document.createElement('img');
    img.src = renderer.domElement.toDataURL('image/png');
    img.alt = '';
    img.draggable = false;
    const label = document.createElement('span');
    label.textContent = spec.name;
    button.append(img, label);
    button.dataset.category = spec.category;
    ingredientGroups.get(spec.category).append(button);
    button.addEventListener('click', (event) => {
      if (event.pointerType === 'touch' || touchLayout.matches || tapPlacement.pending) {
        if (serving || servingPending >= 0) return;
        cancelSelection(false);
        history.push(tapPlacement.enqueue(spec.id));
        updateControls();
      } else {
        select(spec.id);
        if (event.detail === 0) stage.focus({ preventScroll: true });
      }
    });
    disposeIngredient(model);
  }
  renderer.shadowMap.enabled = true;
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(75,61,80,.6)');
  gradient.addColorStop(0.35, 'rgba(75,61,80,.36)');
  gradient.addColorStop(1, 'rgba(75,61,80,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  function makeShadow() {
    const m = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({
        map: shadowTexture,
        transparent: true,
        depthWrite: false,
        opacity: 0.3,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 1;
    scene.add(m);
    return m;
  }

  const models = new Map();
  const history = [];
  const physics = new SandwichPhysics(() => {
    dirty = true;
  });
  const tapPlacement = new TapPlacement(physics, addModel, () => {
    updateControls();
    dirty = true;
  });
  let selected = null,
    ghost = null,
    ghostShadow = null,
    aim = new THREE.Vector3(0, 3.2, 0);
  let dirty = true,
    width = innerWidth,
    height = innerHeight;
  let viewHeight = 9.3,
    targetViewHeight = 9.3,
    lookHeight = 1.8,
    targetLookHeight = 1.8;
  let lastTime = performance.now(),
    time = 0;
  let stroke = null,
    squeezePointer = null,
    squeezeKey = null;
  let sauceTargetY = 0;
  let serving = null,
    servingPending = -1,
    grab = null,
    exporting = false;
  const raycaster = new THREE.Raycaster(),
    ndc = new THREE.Vector2();
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const isSauce = () => !!CATALOG[selected]?.dispenser;
  const nozzleGap = () => 0.28 + CATALOG[selected].dispenser.radius;

  function layoutCamera(immediate = false) {
    const aspect = width / height;
    const base = Math.max(9.3, 7.0 / aspect);
    let top = 0;
    for (const item of physics.items)
      if (item.landed) top = Math.max(top, item.maxY);
    targetViewHeight = Math.max(base, top + 6.3);
    targetLookHeight = 1.8 + Math.max(0, top - 2.2) * 0.43;
    if (serving) {
      const diameter = serving.size.length() + (serving.cut ? 1.5 : 0);
      targetViewHeight = Math.max(
        5.8,
        diameter * 1.45,
        (diameter * 1.3) / aspect,
      );
      targetLookHeight = serving.root.position.y;
      // Keep the knife's screen-space home fixed until it returns to the toolbar.
      if (serving.knifeTime >= 0) {
        targetViewHeight = viewHeight;
        targetLookHeight = lookHeight;
      }
    }
    if (immediate) {
      viewHeight = targetViewHeight;
      lookHeight = targetLookHeight;
    }
    camera.left = (-viewHeight * aspect) / 2;
    camera.right = (viewHeight * aspect) / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.position.set(4.5, lookHeight + 6.3, 10.5);
    camera.lookAt(0, lookHeight, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function resize() {
    width = innerWidth;
    height = innerHeight;
    renderer.setSize(width, height);
    layoutCamera(true);
    dirty = true;
  }
  addEventListener('resize', resize);
  resize();

  function select(id) {
    if (serving || servingPending >= 0) return;
    cancelSelection(false);
    selected = id;
    ghost = isSauce() ? createBottle(id) : createIngredient(id);
    scene.add(ghost);
    ghostShadow = makeShadow();
    ghost.rotation.y = isSauce() ? 0.405 : -0.15;
    aim.set(
      0,
      physics.supportHeight(0, 0) + (isSauce() ? nozzleGap() : 3.1),
      0,
    );
    ghost.position.copy(aim);
    if (isSauce()) sauceTargetY = aim.y - nozzleGap();
    $(`[data-ingredient="${id}"]`).setAttribute('aria-pressed', 'true');
    stage.classList.add('holding');
    stage.setAttribute(
      'aria-label',
      isSauce()
        ? 'Squeeze the selected sauce. Hold Enter or Space, use arrow keys to move, and release to stop. Escape puts the bottle back.'
        : 'Drop the selected ingredient. Use arrow keys to aim, Enter or Space to drop, and Escape to put it back.',
    );
    updateControls();
    dirty = true;
  }

  function cancelSelection(update = true) {
    stopSqueeze();
    if (ghost) disposeIngredient(ghost);
    if (ghostShadow) {
      ghostShadow.material.dispose();
      ghostShadow.removeFromParent();
    }
    ghost = null;
    ghostShadow = null;
    selected = null;
    document
      .querySelectorAll('.ingredient[aria-pressed="true"]')
      .forEach((button) => button.setAttribute('aria-pressed', 'false'));
    stage.classList.remove('holding');
    stage.setAttribute(
      'aria-label',
      'Sandwich canvas. Select an ingredient from the sides to begin.',
    );
    if (update) updateControls();
    dirty = true;
  }

  function updateAim(clientX, clientY) {
    ndc.set((clientX / width) * 2 - 1, (-clientY / height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (isSauce()) {
      // Exclude airborne sauce from pointer targeting.
      const targets = physics.items
        .filter((item) => item.spec.mode !== 'fluid')
        .map((item) => models.get(item.uid).model);
      for (const model of targets) model.updateMatrixWorld(true);
      const surface = raycaster.intersectObjects(targets, true)[0]?.point;
      if (surface) hit.copy(surface);
      else raycaster.ray.intersectPlane(floorPlane, hit);
      sauceTargetY = Math.max(0, hit.y);
      aim.set(
        THREE.MathUtils.clamp(hit.x, -3, 3),
        Math.max(0, hit.y) + nozzleGap(),
        THREE.MathUtils.clamp(hit.z, -2, 2),
      );
    } else {
      // Limit pointer depth to keep drops within reach of the stack.
      const z = THREE.MathUtils.clamp(
        (clientY / height - 0.56) * 2.4,
        -0.7,
        0.7,
      );
      aimPlane.constant = -z;
      if (raycaster.ray.intersectPlane(aimPlane, hit)) {
        const x = THREE.MathUtils.clamp(hit.x, -2.65, 2.65);
        const support = physics.supportHeight(x, z);
        aim.set(x, THREE.MathUtils.clamp(hit.y, support + 1.1, support + 6), z);
      }
    }
    dirty = true;
  }

  stage.addEventListener('pointermove', (event) => {
    if (serving) {
      if (grab?.id === event.pointerId) {
        if (!event.buttons) {
          stopGrab();
          return;
        }
        const now = performance.now();
        serving.rotate(
          (event.clientX - grab.x) * 0.008,
          (event.clientY - grab.y) * 0.008,
          camera.quaternion,
          (now - grab.time) / 1000,
        );
        grab = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          time: now,
        };
        dirty = true;
      }
      return;
    }
    if (squeezePointer !== null && event.pointerId !== squeezePointer) return;
    if (
      stroke &&
      squeezePointer !== null &&
      (!event.buttons ||
        document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest('nav, footer') ||
        event.clientX < 0 ||
        event.clientY < 0 ||
        event.clientX >= width ||
        event.clientY >= height)
    )
      stopSqueeze();
    if (selected) updateAim(event.clientX, event.clientY);
  });
  stage.addEventListener('pointerleave', () => {
    if (squeezePointer !== null) stopSqueeze();
  });
  stage.addEventListener('click', (event) => {
    if (!selected || isSauce()) return;
    if (event.detail > 0) updateAim(event.clientX, event.clientY);
    drop();
  });
  stage.addEventListener('pointerdown', (event) => {
    if (serving?.knifeTime >= 0) return;
    if (serving && event.button === 0) {
      event.preventDefault();
      stage.focus({ preventScroll: true });
      serving.velocity.set(0, 0);
      grab = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
      };
      stage.setPointerCapture(event.pointerId);
      stage.classList.add('grabbing');
      return;
    }
    if (!isSauce() || event.button !== 0 || stroke) return;
    event.preventDefault();
    stage.focus({ preventScroll: true });
    updateAim(event.clientX, event.clientY);
    ghost.position.copy(aim);
    squeezePointer = event.pointerId;
    stage.setPointerCapture(event.pointerId);
    startSqueeze();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    stage.addEventListener(name, (event) => {
      if (grab?.id === event.pointerId) {
        stopGrab();
        return;
      }
      if (event.pointerId !== squeezePointer) return;
      if (name === 'pointerup' && stroke) {
        updateAim(event.clientX, event.clientY);
        ghost.position.copy(aim);
        stroke.stop(aim);
      }
      stopSqueeze();
    });
  addEventListener('blur', () => {
    stopSqueeze();
    stopGrab();
  });

  function stopGrab() {
    const pointer = grab?.id;
    grab = null;
    stage.classList.remove('grabbing');
    if (pointer !== undefined && stage.hasPointerCapture(pointer))
      stage.releasePointerCapture(pointer);
  }

  function addModel(item) {
    const model = createIngredient(item.id),
      shadow = makeShadow();
    physics.fitCollision(item, model);
    animateIngredient(model, item, 0, time);
    scene.add(model);
    models.set(item.uid, { model, shadow });
  }

  function startSqueeze() {
    if (!isSauce() || stroke) return;
    const action = { id: selected, uids: [] };
    history.push(action);
    stroke = new SauceStroke(physics, selected, ghost.position, (item) => {
      addModel(item);
      action.uids.push(item.uid);
    });
    updateControls();
    dirty = true;
  }

  function stopSqueeze() {
    if (stroke) {
      stroke.stop();
      stroke = null;
      dirty = true;
    }
    const pointer = squeezePointer;
    squeezePointer = squeezeKey = null;
    if (pointer !== null && stage.hasPointerCapture(pointer))
      stage.releasePointerCapture(pointer);
    if (ghost?.userData.bottle) updateBottleStream(ghost, null);
  }

  function drop() {
    if (!selected || isSauce()) return;
    const item = physics.add(selected, aim.x, aim.z, aim.y);
    addModel(item);
    history.push({ id: selected, uids: [item.uid] });
    // Keep the selection active for repeated drops.
    aim.y = Math.max(aim.y, physics.supportHeight(aim.x, aim.z) + 2.4);
    updateControls();
  }

  function updateControls() {
    const any = history.length > 0;
    const presented = !!serving || servingPending >= 0;
    $('#undo').disabled = !any;
    $('#reset').disabled = !any && !selected;
    $('#serve').disabled = servingPending >= 0;
    $('#serve').setAttribute(
      'aria-label',
      serving || !any ? 'Ring service bell' : 'Ring bell and serve sandwich',
    );
    $('#undo').hidden = $('#reset').hidden = presented;
    for (const id of ['keep-building', 'cut', 'save-image'])
      $(`#${id}`).hidden = !serving;
    document.body.classList.toggle('serving', presented);
    if (serving) {
      stage.setAttribute(
        'aria-label',
        'Rotate your sandwich. Drag to turn, use arrow keys to rotate, or Escape to keep building.',
      );
      $('#cut').setAttribute('aria-pressed', String(serving.cut));
      const slicing = serving.knifeTime >= 0;
      $('#cut').disabled = slicing;
      $('#cut').classList.toggle('slicing', slicing);
      $('#cut').setAttribute('aria-label', serving.cut ? 'Join sandwich halves' : 'Cut sandwich in half');
      $('#cut').title = serving.cut ? 'Join halves' : 'Cut in half';
    }
  }

  function undo() {
    if (serving || servingPending >= 0) leaveServing();
    stopSqueeze();
    const action = history.pop();
    if (!action) return;
    tapPlacement.remove(action);
    for (let i = action.uids.length - 1; i >= 0; i--) {
      const item = physics.removeLast();
      const { model, shadow } = models.get(item.uid);
      disposeIngredient(model);
      shadow.material.dispose();
      shadow.removeFromParent();
      models.delete(item.uid);
    }
    updateControls();
    dirty = true;
  }
  $('#undo').addEventListener('click', undo);
  $('#reset').addEventListener('click', () => {
    if (serving || servingPending >= 0) leaveServing();
    cancelSelection(false);
    tapPlacement.clear();
    physics.reset();
    history.length = 0;
    for (const { model, shadow } of models.values()) {
      disposeIngredient(model);
      shadow.material.dispose();
      shadow.removeFromParent();
    }
    models.clear();
    updateControls();
    dirty = true;
  });
  reducedMotion.addEventListener('change', () => {
    dirty = true;
  });

  addEventListener('keydown', (event) => {
    if (event.target === nameInput) return;
    if (event.key === 'Escape' && (serving || servingPending >= 0)) {
      leaveServing();
      $('#serve').focus();
      return;
    }
    if (event.key === 'Escape' && selected) {
      const previous = selected;
      cancelSelection();
      const button = $(`[data-ingredient="${previous}"]`);
      button.focus({ preventScroll: true });
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
    if (event.target !== stage) return;
    if (
      serving &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      serving.rotate(
        event.key === 'ArrowLeft'
          ? -0.13
          : event.key === 'ArrowRight'
            ? 0.13
            : 0,
        event.key === 'ArrowUp' ? -0.13 : event.key === 'ArrowDown' ? 0.13 : 0,
        camera.quaternion,
        0.12,
      );
      serving.velocity.set(0, 0);
      dirty = true;
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && selected) {
      event.preventDefault();
      if (isSauce()) {
        if (!event.repeat && !stroke) {
          squeezeKey = event.key;
          startSqueeze();
        }
      } else if (!event.repeat) drop();
    }
    if (
      selected &&
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    ) {
      event.preventDefault();
      if (event.key === 'ArrowLeft') aim.x -= 0.15;
      if (event.key === 'ArrowRight') aim.x += 0.15;
      if (event.key === 'ArrowUp') aim.z -= 0.15;
      if (event.key === 'ArrowDown') aim.z += 0.15;
      aim.x = THREE.MathUtils.clamp(aim.x, -2.65, 2.65);
      aim.z = THREE.MathUtils.clamp(aim.z, -1, 1);
      aim.y =
        physics.supportHeight(aim.x, aim.z) + (isSauce() ? nozzleGap() : 3.1);
      if (isSauce()) sauceTargetY = aim.y - nozzleGap();
      dirty = true;
    }
  });
  addEventListener('keyup', (event) => {
    if (event.key === squeezeKey) {
      event.preventDefault();
      stopSqueeze();
    }
  });
  stage.addEventListener('blur', () => {
    stopSqueeze();
    stopGrab();
  });

  $('#serve').addEventListener('click', () => {
    ringBell();
    serviceBell.ring();
    if (!physics.items.length && !tapPlacement.pending) return;
    if (serving) {
      serving.ring();
      return;
    }
    cancelSelection(false);
    servingPending = 0;
    updateControls();
  });

  function startServing() {
    servingPending = -1;
    const sources = physics.items.map((item) => {
      const { model, shadow } = models.get(item.uid);
      animateIngredient(model, item, 0, time, false, true);
      shadow.visible = false;
      return { model, spec: item.spec };
    });
    serving = new ServingAssembly(sources);
    for (const { model } of sources) model.visible = false;
    scene.add(serving.root);
    serving.ring();
    updateControls();
    stage.focus({ preventScroll: true });
    dirty = true;
  }

  function leaveServing() {
    stopGrab();
    serving?.dispose();
    serving = null;
    servingPending = -1;
    for (const { model, shadow } of models.values()) {
      model.visible = shadow.visible = true;
    }
    stage.setAttribute(
      'aria-label',
      'Sandwich canvas. Select an ingredient from the sides to begin.',
    );
    updateControls();
    dirty = true;
  }
  $('#keep-building').addEventListener('click', () => {
    leaveServing();
    $('#serve').focus();
  });
  $('#cut').addEventListener('click', () => {
    if (!serving) return;
    // Start the blade at the resting tool's screen location, then lift into the cut.
    const rect = $('.resting-knife').getBoundingClientRect();
    const origin = new THREE.Vector3(
      ((rect.left + rect.width / 2) / width) * 2 - 1,
      -((rect.top + rect.height / 2) / height) * 2 + 1,
      serving.root.position.clone().project(camera).z,
    ).unproject(camera);
    serving.root.updateMatrixWorld(true);
    serving.root.worldToLocal(origin);
    const restingQuaternion = serving.root.quaternion.clone().invert()
      .multiply(camera.quaternion).multiply(knifeTool.viewQuaternion);
    const restingScale = (rect.width / knifeTool.viewWidth) * (viewHeight / height);
    serving.velocity.set(0, 0);
    serving.toggleCut(reducedMotion.matches, origin, restingQuaternion, restingScale);
    updateControls();
    dirty = true;
  });
  $('#save-image').addEventListener('click', saveImage);

  async function saveImage() {
    await document.fonts.ready;
    if (!serving || exporting) return;
    exportError.textContent = '';
    exporting = true;
    $('#save-image').disabled = true;
    const name = sandwichName();
    const ratio = renderer.getPixelRatio();
    const clearColor = renderer.getClearColor(new THREE.Color()),
      clearAlpha = renderer.getClearAlpha();
    const knifeVisible = serving.knife.visible;
    let canvas;
    try {
      const exportCamera = camera.clone();
      const bounds = new THREE.Box3().setFromObject(
        serving.cut ? serving.halves[0] : serving.whole,
      );
      if (serving.cut)
        bounds.union(new THREE.Box3().setFromObject(serving.halves[1]));
      const center = bounds.getCenter(new THREE.Vector3());
      // Project the current pose onto the camera axes so the saved view fits any rotation.
      let radius = 0;
      const inverse = camera.quaternion.clone().invert();
      for (const x of [bounds.min.x, bounds.max.x])
        for (const y of [bounds.min.y, bounds.max.y])
          for (const z of [bounds.min.z, bounds.max.z]) {
            const corner = new THREE.Vector3(x, y, z)
              .sub(center)
              .applyQuaternion(inverse);
            radius = Math.max(radius, Math.abs(corner.x), Math.abs(corner.y));
          }
      const half = Math.max(1.6, radius * 1.25);
      exportCamera.left = exportCamera.bottom = -half;
      exportCamera.right = exportCamera.top = half;
      exportCamera.position
        .copy(center)
        .add(new THREE.Vector3(0, 0, 20).applyQuaternion(camera.quaternion));
      exportCamera.updateProjectionMatrix();
      exportCamera.updateMatrixWorld();
      serving.knife.visible = false;
      renderer.setPixelRatio(1);
      renderer.setSize(2048, 2048, false);
      renderer.setClearColor(0xffffff, 1);
      renderer.render(scene, exportCamera);
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = 2048;
      const context = canvas.getContext('2d');
      context.drawImage(renderer.domElement, 0, 0);
      context.fillStyle = '#6d7067';
      context.font = '400 25px "Comico", sans-serif';
      context.textAlign = 'center';
      const captionWidth = context.measureText(name).width;
      if (captionWidth > 1792)
        context.font = `400 ${25 * 1792 / captionWidth}px "Comico", sans-serif`;
      context.fillText(name, 1024, 1960);
    } catch (error) {
      console.error('Could not render sandwich image.', error);
      exportError.textContent = 'The image could not be saved. Please try again.';
    } finally {
      if (serving) serving.knife.visible = knifeVisible;
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height, false);
      renderer.setClearColor(clearColor, clearAlpha);
      renderer.render(scene, camera);
    }
    try {
      if (canvas) {
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('PNG encoding failed.');
        const url = URL.createObjectURL(blob);
        const download = document.createElement('a');
        download.href = url;
        const filename = name.normalize('NFKC').toLowerCase()
          .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
          .replace(/^-+|-+$/g, '') || 'sandwich';
        download.download = `${filename}.png`;
        document.body.append(download);
        try {
          download.click();
        } finally {
          download.remove();
          // Leave time for the browser to take ownership of the downloaded blob.
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
        serving?.velocity.set(0, 0);
      }
    } catch {
      exportError.textContent = 'The image could not be saved. Please try again.';
    } finally {
      exporting = false;
      $('#save-image').disabled = false;
    }
  }

  function positionShadow(shadow, position, spec) {
    const h = Math.max(0, position.y - spec.height / 2);
    shadow.position.set(position.x, 0.005, position.z);
    const spread = 1 + Math.min(h, 8) * 0.17;
    shadow.scale.set(spec.radius * 2.9 * spread, spec.depth * 2.9 * spread, 1);
    shadow.material.opacity = 0.62 / (1 + h * 0.55);
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const rawDt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (document.hidden) return;
    const dt = rawDt;
    time += dt;
    if (!serving) tapPlacement.step(dt);
    if (ghost && isSauce()) {
      aim.y =
        Math.max(sauceTargetY, physics.sauceSurfaceHeight(aim.x, aim.z)) +
        nozzleGap();
      ghost.position.lerp(
        aim,
        reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 28),
      );
      animateBottle(ghost, !!stroke, dt, time, reducedMotion.matches);
      if (stroke) stroke.step(dt, ghost.position);
    }
    if (!serving) physics.step(dt);
    if (servingPending >= 0) {
      servingPending = tapPlacement.pending ? 0 : servingPending + dt;
      const landed = physics.items.every(
        (item) => item.landed && item.body.velocity.length() < 0.2,
      );
      if (!tapPlacement.pending && ((landed && servingPending > 0.45) || servingPending > 4))
        startServing();
    }
    let servingChanged = false;
    if (serving) {
      const slicing = serving.knifeTime >= 0;
      servingChanged = serving.step(dt, camera.quaternion, !!grab, reducedMotion.matches);
      if (slicing && serving.knifeTime < 0) updateControls();
    }
    if (ghost && isSauce()) updateBottleStream(ghost, stroke);
    let active = servingChanged;
    for (const item of serving ? [] : physics.items) {
      const { model, shadow } = models.get(item.uid);
      if (item.body.sleepState !== 2 || item.age - item.lastImpact < 2) {
        animateIngredient(model, item, dt, time, false, reducedMotion.matches);
        positionShadow(shadow, item.body.position, item.spec);
        if (item.stream) shadow.material.opacity *= 0.18;
        active = true;
      }
    }
    layoutCamera();
    const movingCamera =
      Math.abs(viewHeight - targetViewHeight) > 0.005 ||
      Math.abs(lookHeight - targetLookHeight) > 0.005;
    const cameraEase = reducedMotion.matches ? 1 : 1 - Math.exp(-rawDt * 2.4);
    viewHeight += (targetViewHeight - viewHeight) * cameraEase;
    lookHeight += (targetLookHeight - lookHeight) * cameraEase;
    if (ghost) {
      if (!isSauce())
        ghost.position.lerp(
          aim,
          reducedMotion.matches ? 1 : 1 - Math.exp(-rawDt * 19),
        );
      if (!isSauce() && !reducedMotion.matches) {
        ghost.rotation.x = Math.sin(time * 1.7) * 0.035;
        ghost.rotation.z = Math.sin(time * 1.3) * 0.04;
        animateIngredient(
          ghost,
          { spec: CATALOG[selected], landed: false },
          dt,
          time,
          true,
        );
      }
      positionShadow(ghostShadow, ghost.position, CATALOG[selected]);
      active = true;
    }
    if (active || dirty || movingCamera) {
      renderer.render(scene, camera);
      dirty = false;
    }
  }
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    stopSqueeze();
    stopGrab();
    event.preventDefault();
    $('#error').hidden = false;
    $('#error').textContent =
      'The 3D view was interrupted. Reload the page to start fresh.';
    const reload = document.createElement('button');
    reload.textContent = 'Reload playground';
    reload.addEventListener('click', () => location.reload());
    $('#error').append(reload);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopSqueeze();
      stopGrab();
    }
    lastTime = performance.now();
    dirty = true;
  });
  updateControls();
  requestAnimationFrame(tick);
}
