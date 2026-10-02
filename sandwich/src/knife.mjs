import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createKnife() {
  const group = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-2.12, 0.04);
  shape.quadraticCurveTo(-2.12, 0.2, -1.87, 0.2);
  shape.lineTo(1.22, 0.2);
  shape.lineTo(1.22, -0.13);
  for (let i = 0; i < 21; i++) {
    const z = 1.22 - i * 0.153;
    shape.quadraticCurveTo(z - 0.077, -0.035, z - 0.153, -0.13);
  }
  shape.quadraticCurveTo(-2.12, -0.14, -2.12, 0.04);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035, bevelEnabled: true, bevelSize: 0.008,
    bevelThickness: 0.008, bevelSegments: 1, steps: 1, curveSegments: 5,
  });
  geometry.translate(0, 0, -0.0175);
  geometry.rotateY(-Math.PI / 2);
  const blade = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({
    color: '#c7d4df', side: THREE.DoubleSide,
  }));
  group.add(blade);
  const shine = new THREE.Mesh(
    new THREE.BoxGeometry(0.056, 0.045, 3.08),
    new THREE.MeshToonMaterial({ color: '#fff7e5' }),
  );
  shine.position.set(0, 0.16, -0.34);
  group.add(shine);
  const handle = new THREE.Mesh(
    new RoundedBoxGeometry(0.19, 0.25, 1.13, 3, 0.085),
    new THREE.MeshToonMaterial({ color: '#75472e' }),
  );
  handle.position.set(0, 0.03, 1.78);
  group.add(handle);
  const bolster = new THREE.Mesh(
    new RoundedBoxGeometry(0.20, 0.26, 0.13, 2, 0.02),
    new THREE.MeshToonMaterial({ color: '#aebdc5' }),
  );
  bolster.position.set(0, 0.03, 1.22);
  group.add(bolster);
  const rivetMaterial = new THREE.MeshToonMaterial({ color: '#dbc9a7' });
  for (const side of [-1, 1])
    for (const z of [1.5, 2.08]) {
      const rivet = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), rivetMaterial,
      );
      rivet.rotation.z = Math.PI / 2;
      rivet.position.set(side * 0.098, 0.03, z);
      group.add(rivet);
    }
  return group;
}

// The small resting tool uses the same model as the blade that cuts the food.
export function mountKnifeTool(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(200, 76, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff9ed, 0xaaa6bf, 1.25));
  const light = new THREE.DirectionalLight(0xfff4e1, 1.8);
  light.position.set(-3, 7, 5);
  scene.add(light);
  const knife = createKnife();
  knife.rotation.set(0, 1.22, -Math.PI / 2);
  scene.add(knife);
  const camera = new THREE.OrthographicCamera(-2.7, 2.7, 1.026, -1.026, 0.1, 20);
  camera.position.set(0, 5, 7);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  return {
    viewQuaternion: camera.quaternion.clone().invert().multiply(knife.quaternion),
    viewWidth: 5.4,
  };
}
