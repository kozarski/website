import * as THREE from 'three';

export function createServiceBell() {
  const root = new THREE.Group();
  const dome = new THREE.Group();
  const plunger = new THREE.Group();
  const gradient = new THREE.DataTexture(
    new Uint8Array([100, 150, 200, 237, 255]), 5, 1, THREE.RedFormat,
  );
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  const metal = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradient });
  const charcoal = new THREE.MeshToonMaterial({ color: '#34373f', gradientMap: gradient });
  const edge = new THREE.MeshToonMaterial({ color: '#616774', gradientMap: gradient });

  function turned(parent, profile, surface, y = 0) {
    const geometry = new THREE.LatheGeometry(
      profile.map(([radius, height]) => new THREE.Vector2(radius, height)), 64,
    );
    if (surface === metal) {
      const p = geometry.attributes.position;
      const colors = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const angle = Math.atan2(p.getX(i), p.getZ(i));
        // Broad painted reflections, with a warm light side and cool steel shade.
        const band = Math.sin(angle * 2.2 + 0.65);
        const base = new THREE.Color(
          band > 0.63 ? '#fff8e4' : band > 0.1 ? '#d8e0e3' : band > -0.68 ? '#aab7c6' : '#758393',
        );
        if (p.getY(i) > 0.86) base.lerp(new THREE.Color('#fff6dc'), 0.2);
        base.toArray(colors, i * 3);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.y = y;
    parent.add(mesh);
    return mesh;
  }

  turned(root, [[0,0.02],[0.98,0.02],[1.09,0.065],[1.13,0.13],[1.12,0.20],[1.06,0.28],[0.96,0.31],[0,0.31]], charcoal);
  turned(root, [[1.105,0.11],[1.133,0.135],[1.125,0.17]], edge);
  turned(root, [[0,0.015],[0.96,0.015],[1.01,0.045],[0.99,0.075],[0,0.075]], charcoal);
  dome.position.y = 0.32;
  root.add(dome);
  turned(dome, [[0,0],[0.92,0],[1.00,0.04],[1.015,0.095],[0.98,0.15],[0.925,0.165]], metal);
  const profile = [[0,0.055],[0.92,0.055]];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI / 2;
    profile.push([Math.cos(a) * 0.925, 0.145 + Math.sin(a) * 0.81]);
  }
  profile.push([0,0.955]);
  turned(dome, profile, metal);
  turned(dome, [[0,0.935],[0.11,0.935],[0.14,0.96],[0.14,1.0],[0.10,1.035],[0,1.035]], metal);
  dome.add(plunger);
  turned(plunger, [[0,0.975],[0.054,0.975],[0.054,1.245],[0,1.245]], metal);
  turned(plunger, [[0,1.205],[0.18,1.205],[0.225,1.23],[0.23,1.27],[0.19,1.30],[0,1.30]], metal);

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const ctx = shadowCanvas.getContext('2d');
  const shadowGradient = ctx.createRadialGradient(64,64,6,64,64,63);
  shadowGradient.addColorStop(0,'rgba(49,43,49,.3)');
  shadowGradient.addColorStop(0.6,'rgba(49,43,49,.12)');
  shadowGradient.addColorStop(1,'rgba(49,43,49,0)');
  ctx.fillStyle = shadowGradient;
  ctx.fillRect(0,0,128,128);
  const shadowTexture = new THREE.CanvasTexture(shadowCanvas);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.3,2.8),
    new THREE.MeshBasicMaterial({map:shadowTexture, transparent:true, depthWrite:false}),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0;
  root.add(shadow);
  return { root, dome, plunger };
}

export function bellPose(seconds, held = false, reducedMotion = false) {
  if (!held && !Number.isFinite(seconds)) return { pin:0, tilt:0, shift:0 };
  const press = held ? 1 : Math.exp(-Math.max(0, seconds) * 15);
  const vibration = held || reducedMotion ? 0 :
    Math.sin(seconds * 92) * Math.exp(-seconds * 8);
  return { pin: -0.12 * press, tilt: vibration * 0.024, shift: vibration * 0.012 };
}

export function mountServiceBell(button, reducedMotion) {
  const canvas = button.querySelector('canvas');
  const chimes = [...button.querySelectorAll('.bell-chime path')];
  const chime = () => {
    chimes.forEach((dash, i) => {
      dash.getAnimations().forEach((animation) => animation.cancel());
      const offset = i - 3;
      const drift = reducedMotion.matches ? 'none' :
        `translate(${offset * 9}px, ${-62 + Math.abs(offset) * 8}px)`;
      dash.animate([
        { opacity: 0, transform: 'none' },
        { opacity: 0.9, offset: 0.16 },
        { opacity: 0, transform: drift },
      ], {
        duration: reducedMotion.matches ? 240 : 760,
        delay: reducedMotion.matches ? 0 : Math.abs(offset) * 22,
        easing: 'cubic-bezier(.16,.65,.35,1)',
      });
    });
  };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(180,152,false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff9ed,0xaaa6bf,1.35));
  const light = new THREE.DirectionalLight(0xfff4e1,1.9);
  light.position.set(-3,7,5);
  scene.add(light);
  const camera = new THREE.OrthographicCamera(-1.45,1.45,1.225,-1.225,0.1,20);
  camera.position.set(3.8,3.1,7);
  camera.lookAt(0,0.75,0);
  const model = createServiceBell();
  scene.add(model.root);
  let held = false, frame = 0, releasedAt = -Infinity;
  const draw = (now) => {
    const t = (now - releasedAt) / 1000;
    const pose = bellPose(t,held,reducedMotion.matches);
    model.plunger.position.y = pose.pin;
    model.dome.rotation.z = pose.tilt;
    model.dome.rotation.x = pose.tilt * 0.4;
    model.dome.position.x = pose.shift;
    renderer.render(scene,camera);
    frame = !held && t < 1 ? requestAnimationFrame(draw) : 0;
  };
  const redraw = () => {
    cancelAnimationFrame(frame);
    draw(performance.now());
  };
  const release = () => {
    if (!held) return;
    held = false;
    releasedAt = performance.now();
    redraw();
  };
  button.addEventListener('pointerdown',(event) => {
    if (button.disabled || event.button !== 0) return;
    held = true;
    redraw();
  });
  for (const event of ['pointerup','pointercancel','pointerleave','blur'])
    button.addEventListener(event,release);
  button.addEventListener('keydown',(event) => {
    if (button.disabled || event.repeat || !['Enter',' '].includes(event.key)) return;
    held = true;
    redraw();
  });
  button.addEventListener('keyup',release);
  redraw();
  return {
    ring() {
      chime();
      held = false;
      releasedAt = performance.now();
      redraw();
    },
  };
}
