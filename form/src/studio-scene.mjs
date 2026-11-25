import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { SculptMesh } from './sculpt-mesh.mjs';

export const MATERIALS = {
  clay: {
    id: 'clay',
    label: 'Clay',
    theme: 'light',
    roomWeights: new THREE.Vector3(1, 0, 0),
    bg: new THREE.Color('#eee9df'),
    keyColor: new THREE.Color('#fffaf2'),
    keyIntensity: 2.55,
    keyPos: new THREE.Vector3(-1.5, 5.9, 3.3),
    fillColor: new THREE.Color('#efe4d4'),
    fillIntensity: 0.30,
    rimColor: new THREE.Color('#fffaf2'),
    rimIntensity: 0.45,
    ambientIntensity: 0.20,
    shadowOpacity: 0.38,
    shadowColor: new THREE.Color('#665441'),
    shadowRadius: 1.72,
    causticOpacity: 0.0,
    reticleColor: new THREE.Color('#241d17'),
  },
  chrome: {
    id: 'chrome',
    label: 'Chrome',
    theme: 'light',
    roomWeights: new THREE.Vector3(0, 1, 0),
    bg: new THREE.Color('#9ea4ac'),
    keyColor: new THREE.Color('#ffffff'),
    keyIntensity: 0.90,
    keyPos: new THREE.Vector3(0.8, 6.2, 2.4),
    fillColor: new THREE.Color('#cdd4de'),
    fillIntensity: 0.28,
    rimColor: new THREE.Color('#eef4ff'),
    rimIntensity: 0.55,
    ambientIntensity: 0.14,
    shadowOpacity: 0.44,
    shadowColor: new THREE.Color('#1c2026'),
    shadowRadius: 1.68,
    causticOpacity: 0.0,
    reticleColor: new THREE.Color('#14171c'),
  },
  glass: {
    id: 'glass',
    label: 'Glass',
    theme: 'dark',
    roomWeights: new THREE.Vector3(0, 0, 1),
    bg: new THREE.Color('#040608'),
    keyColor: new THREE.Color('#edf4ff'),
    keyIntensity: 1.12,
    keyPos: new THREE.Vector3(-0.8, 6.4, 2.2),
    fillColor: new THREE.Color('#243042'),
    fillIntensity: 0.08,
    rimColor: new THREE.Color('#e8f2ff'),
    rimIntensity: 1.80,
    ambientIntensity: 0.03,
    shadowOpacity: 0.24,
    shadowColor: new THREE.Color('#010203'),
    shadowRadius: 1.56,
    causticOpacity: 0.36,
    reticleColor: new THREE.Color('#eef4ff'),
  },
};

function buildStudioEnvironments(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);

  // 1. Clay: Warm alabaster north-light studio with soft floor bounce and quiet shadow falloff
  const clayScene = new THREE.Scene();
  clayScene.background = new THREE.Color('#dcd3c5');
  clayScene.add(new THREE.Mesh(
    new THREE.BoxGeometry(22, 14, 22),
    new THREE.MeshBasicMaterial({ color: '#e5ddd0', side: THREE.BackSide })
  ));
  const clayFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshBasicMaterial({ color: '#efe7da' })
  );
  clayFloor.rotation.x = -Math.PI / 2;
  clayFloor.position.y = -6.9;
  clayScene.add(clayFloor);

  const clayKey = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 10),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 2.42, 2.28) })
  );
  clayKey.rotation.x = Math.PI / 2;
  clayKey.position.set(-2.2, 6.85, 2.4);
  clayScene.add(clayKey);

  const negMat = new THREE.MeshBasicMaterial({ color: '#46382b' });
  const negR = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), negMat);
  negR.rotation.y = -Math.PI / 2;
  negR.position.set(10.8, -1.5, 0.2);
  clayScene.add(negR);

  const negB = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ color: '#584839' }));
  negB.position.set(0, -1.6, -10.8);
  clayScene.add(negB);

  const clayEnv = pmrem.fromScene(clayScene, 0.04).texture;

  // 2. Chrome: Smooth procedural HDR architectural studio dome (zero hard CG boxes,
  // silky metallic horizon gradient + crisp 2x2 overhead skylight + left architectural softbox)
  const chromeScene = new THREE.Scene();
  const chromeDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        // Smooth studio concrete cyclorama: luminous floor -> rich metallic dark horizon -> cool concrete ceiling
        float horizonDark = exp(-pow((d.y - 0.04) * 5.6, 2.0));
        float floorBounce = smoothstep(0.02, -0.35, d.y);
        float upperWall = smoothstep(-0.02, 0.55, d.y);

        vec3 col = mix(vec3(0.42, 0.45, 0.49), vec3(0.26, 0.29, 0.34), upperWall * 0.65);
        // Subtle architectural gallery shading around azimuth (gentle darker alcove behind camera +Z)
        float backAlcove = smoothstep(0.2, 0.95, d.z) * exp(-pow((d.y - 0.02) * 4.2, 2.0));
        col = mix(col, vec3(0.06, 0.075, 0.095), horizonDark * 0.72 + backAlcove * 0.35);
        // Bright clean poured-concrete studio floor bounce
        col = mix(col, vec3(0.86, 0.89, 0.92), floorBounce * 0.92);

        // Crisp 2x2 architectural overhead skylight (centered slightly forward +Z so it sits at sphere crown)
        vec2 skyUV = vec2(d.x, d.z - 0.38) / max(0.22, d.y);
        float inSky = step(0.35, d.y)
          * smoothstep(0.68, 0.63, abs(skyUV.x))
          * smoothstep(0.52, 0.47, abs(skyUV.y));
        float mullionX = smoothstep(0.025, 0.045, abs(skyUV.x));
        float mullionY = smoothstep(0.025, 0.045, abs(skyUV.y));
        float skylight = inSky * mullionX * mullionY;
        col += vec3(8.8, 9.1, 9.5) * skylight;

        // Soft vertical gallery window highlight on left flank (-X, +Z)
        float leftWin = smoothstep(0.55, 0.82, -d.x)
          * smoothstep(-0.12, 0.08, d.y)
          * smoothstep(0.62, 0.38, d.y)
          * smoothstep(-0.1, 0.35, d.z);
        col += vec3(3.6, 3.8, 4.1) * leftWin;

        // Delicate warm-silver fill strip on far right (+X) for edge definition
        float rightRim = smoothstep(0.62, 0.88, d.x)
          * smoothstep(-0.1, 0.15, d.y)
          * smoothstep(0.58, 0.32, d.y);
        col += vec3(1.9, 2.0, 2.15) * rightRim;

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  chromeScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 48, 32), chromeDomeMat));
  const chromeEnv = pmrem.fromScene(chromeScene, 0).texture;
  chromeDomeMat.dispose();

  // 3. Glass: Obsidian optical darkroom with luminous overhead dome & soft silver flanks
  const glassScene = new THREE.Scene();
  glassScene.background = new THREE.Color('#0c1016');
  glassScene.add(new THREE.Mesh(
    new THREE.BoxGeometry(24, 16, 24),
    new THREE.MeshBasicMaterial({ color: '#1b212a', side: THREE.BackSide })
  ));

  const glassDome = new THREE.Mesh(
    new THREE.CircleGeometry(6.8, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 4.5, 4.9) })
  );
  glassDome.rotation.x = Math.PI / 2;
  glassDome.position.set(-0.6, 7.8, -0.4);
  glassScene.add(glassDome);

  const glassHot = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(11.0, 11.6, 12.6) })
  );
  glassHot.rotation.x = Math.PI / 2;
  glassHot.position.set(-1.4, 7.72, 0.8);
  glassScene.add(glassHot);

  const flankMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.6, 2.9) });
  const flankL = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 11.0), flankMat);
  flankL.rotation.y = Math.PI / 2;
  flankL.position.set(-11.8, 0.8, -2.5);
  glassScene.add(flankL);

  const flankR = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 11.0), flankMat);
  flankR.rotation.y = -Math.PI / 2;
  flankR.position.set(11.8, 0.8, -2.5);
  glassScene.add(flankR);

  const darkBack = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 12),
    new THREE.MeshBasicMaterial({ color: '#05070a' })
  );
  darkBack.position.set(0, -0.4, -11.82);
  glassScene.add(darkBack);

  const glassFloor = new THREE.Mesh(
    new THREE.CircleGeometry(8.0, 48),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.35, 1.50) })
  );
  glassFloor.rotation.x = -Math.PI / 2;
  glassFloor.position.y = -7.8;
  glassScene.add(glassFloor);

  const glassEnv = pmrem.fromScene(glassScene, 0.014).texture;

  pmrem.dispose();
  return { clay: clayEnv, chrome: chromeEnv, glass: glassEnv };
}

const GLSL_NOISE_HELPERS = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise3(p);
    p = p * 2.04 + vec3(13.7, -9.2, 5.4);
    a *= 0.5;
  }
  return v;
}

// Fine sharp mineral grog speckles for authentic raw ceramic stoneware
float grogSpeckle(vec3 p, float scale, float threshold) {
  vec3 g = floor(p * scale);
  vec3 f = fract(p * scale) - 0.5;
  float h = hash31(g);
  if (h < threshold) return 0.0;
  vec3 jitter = vec3(hash31(g + 1.3), hash31(g + 2.7), hash31(g + 4.1)) - 0.5;
  float d = length(f - jitter * 0.50);
  float rad = mix(0.10, 0.23, fract(h * 19.7));
  return smoothstep(rad, rad * 0.24, d);
}

// Silky-fine ceramic skin relief (smooth hand-burnished stoneware, crisp creases when sculpted)
float clayReliefHeight(vec3 p, float sculptMask) {
  float broad = fbm3(p * 2.4);
  float silky = fbm3(p * 7.2 + vec3(broad * 0.6));
  float fineTooth = noise3(p * 62.0) * 0.16;
  // Subtle organic clay lip folds that awaken wherever sculpted
  float fold = 1.0 - abs(noise3(p * 5.2 + vec3(broad * 1.1)) * 2.0 - 1.0);
  float crease = smoothstep(0.86, 0.99, fold) * (0.08 + sculptMask * 0.55);
  float pits = grogSpeckle(p, 30.0, 0.89) * 0.35;
  return broad * 0.45 + silky * 0.24 - crease * 0.32 + fineTooth - pits * 0.18;
}
`;

// Quiet hairline geodesic ring projected directly onto the sculpture surface
const GLSL_GEODESIC_RING = /* glsl */ `
if (uBrushVisible > 0.01) {
  float dMain = distance(vLocalPos, uBrushLocalPos);
  float dMir = uSymmetry > 0.5 ? distance(vLocalPos, vec3(-uBrushLocalPos.x, uBrushLocalPos.y, uBrushLocalPos.z)) : 99.0;
  float d = min(dMain, dMir);
  float fw = max(fwidth(d), 0.0020);

  float outerLine = 1.0 - smoothstep(fw * 0.55, fw * 1.65, abs(d - uBrushRadius));
  float innerR = uBrushRadius * mix(0.42, 0.09, uBrushPinch);
  float innerLine = 1.0 - smoothstep(fw * 0.45, fw * 1.45, abs(d - innerR));
  float fill = smoothstep(uBrushRadius, 0.0, d) * (uBrushActive > 0.5 ? 0.045 : 0.014);

  vec3 ringCol = uBrushColor;
  float alphaOuter = outerLine * mix(0.42, 0.78, uBrushActive) * uBrushVisible;
  float alphaInner = innerLine * mix(0.18, 0.62, max(uBrushPinch, uBrushActive)) * uBrushVisible;
  float ringAlpha = clamp(alphaOuter + alphaInner + fill * uBrushVisible, 0.0, 0.85);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, ringCol, ringAlpha);
}
`;

// Seamless architectural studio stage sized for ultrawide displays even at max zoom-out
function buildArchitecturalRoom(roomUniforms) {
  const geo = new THREE.PlaneGeometry(34, 22, 48, 48);
  const pos = geo.attributes.position;
  const floorY = -1.28;
  const backZ = -4.5;

  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / 17;
    const v = pos.getY(i) / 11;

    let y, z;
    if (v <= -0.05) {
      const t = (v + 1) / 0.95;
      y = floorY;
      z = 12.0 - t * (12.0 - (backZ + 2.6));
    } else if (v <= 0.35) {
      const t = (v + 0.05) / 0.40;
      const a = t * (Math.PI * 0.5);
      const r = 2.6;
      y = floorY + r * (1 - Math.cos(a));
      z = (backZ + r) - r * Math.sin(a);
    } else {
      const t = (v - 0.35) / 0.65;
      y = floorY + 2.6 + t * 14.0;
      z = backZ;
    }

    const sideCurve = Math.pow(Math.max(0, Math.abs(u) - 0.50) / 0.50, 2.0);
    const x = u * 18.0;
    z += sideCurve * 5.0 * Math.max(0, (v + 0.5) / 1.5);

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uRoomWeights: roomUniforms.uRoomWeights,
    },
    vertexShader: /* glsl */ `
      varying vec3 vRoomWorld;
      void main() {
        vRoomWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vRoomWorld;
      uniform vec3 uRoomWeights;
      ${GLSL_NOISE_HELPERS}

      float ignDither(vec2 p) {
        return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
      }

      void main() {
        vec3 rw = uRoomWeights;
        float floorMask = smoothstep(-0.66, -1.26, vRoomWorld.y);
        float wallMask = 1.0 - floorMask;
        float radial = length(vec2(vRoomWorld.x * 0.125, (vRoomWorld.y - 0.15) * 0.20));
        float floorRadial = length(vRoomWorld.xz * vec2(0.18, 0.22));

        // 1. Warm Editorial Alabaster Studio (creamy ivory #f3eee4 softly vignetting to #e2dace)
        float fineTooth = (noise3(vRoomWorld * 16.0) - 0.5) * 0.005;
        vec3 clayBase = mix(vec3(0.90, 0.865, 0.805), vec3(0.73, 0.69, 0.63), smoothstep(0.0, 1.55, radial) * 0.62);
        clayBase += floorMask * vec3(0.045, 0.042, 0.036) * smoothstep(2.0, 0.0, floorRadial) + fineTooth;

        // 2. Refined Architectural Concrete Gallery (silky smooth poured concrete, subtle alcove depth)
        float cMacro = fbm3(vRoomWorld * 0.44);
        float cMid = fbm3(vRoomWorld * 1.6 + vec3(3.4, -1.8, 2.2));
        float cFine = noise3(vRoomWorld * 12.0);
        float coveAO = smoothstep(0.95, 0.15, abs(vRoomWorld.y + 0.55)) * 0.05;
        float sideWallShade = smoothstep(2.0, 7.2, abs(vRoomWorld.x)) * wallMask * 0.13;
        float topShade = smoothstep(0.8, 4.2, vRoomWorld.y) * 0.12;
        float floorLift = floorMask * smoothstep(3.0, 0.0, floorRadial) * 0.16;
        float concLum = 0.39 + floorMask * 0.15 + floorLift - coveAO - sideWallShade - topShade;
        concLum += (cMacro - 0.5) * 0.10 + (cMid - 0.5) * 0.038 + (cFine - 0.5) * 0.012;
        concLum = clamp(concLum, 0.14, 0.74);
        vec3 chromeBase = vec3(concLum * 0.97, concLum * 0.99, concLum * 1.02);

        // 3. Matte Obsidian Optical Darkroom + Honed Dark Slate Floor
        float sMacro = fbm3(vRoomWorld * 0.85);
        float sMid = fbm3(vRoomWorld * 3.0 + vec3(-2.1, 4.3, 1.2));
        float seam = exp(-pow((vRoomWorld.y + 1.16) * 14.0, 2.0)) * 0.007;
        float slateSpot = floorMask * smoothstep(3.6, 0.0, length(vRoomWorld.xz * vec2(0.58, 0.72)));
        vec3 darkWall = vec3(0.006, 0.008, 0.011) + (sMacro - 0.5) * 0.003;
        vec3 darkSlate =
          vec3(0.016, 0.019, 0.024) +
          slateSpot * vec3(0.044, 0.052, 0.064) +
          (sMacro - 0.5) * 0.014 +
          (sMid - 0.5) * 0.006;
        vec3 glassBase = mix(darkWall, darkSlate, floorMask) - seam;

        vec3 linearCol = clayBase * rw.x + chromeBase * rw.y + glassBase * rw.z;
        gl_FragColor = vec4(max(linearCol, vec3(0.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (ignDither(gl_FragCoord.xy) - 0.5) / 255.0;
      }
    `,
  });

  return new THREE.Mesh(geo, mat);
}

// Pure Gaussian floating contact shadow (static, soft, delicate)
function buildSoftContactShadow() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color('#665441') },
      uOpacity: { value: 0.38 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r2 = dot(p, p);
        float core = exp(-r2 * 6.4);
        float penumbra = exp(-r2 * 2.4) * 0.24;
        float edgeFade = smoothstep(1.0, 0.60, sqrt(r2));
        float alpha = clamp((core + penumbra) * edgeFade * uOpacity, 0.0, 0.80);
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -1.275, 0.0);
  return mesh;
}

function buildCausticFloor() {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uRot: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uOpacity;
      uniform vec2 uRot;

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float mask = pow(smoothstep(0.92, 0.14, r), 1.75);

        float ang = atan(p.y, p.x);
        vec2 q = p * 2.6 + uRot * 0.62;
        float w1 = sin(q.x * 2.6 + sin(q.y * 2.4 + uTime * 0.22));
        float w2 = cos(q.y * 2.8 - cos(q.x * 2.2 - uTime * 0.18));
        float w3 = sin((q.x - q.y) * 2.3 + cos(ang * 3.0 + uRot.x * 1.2));

        float ring = abs(r - (0.36 + 0.10 * sin(ang * 4.0 + uRot.x * 1.8) + 0.04 * w3));
        float primaryArc = pow(clamp(1.0 - ring * 7.8, 0.0, 1.0), 3.8) * 0.85;
        float filA = pow(clamp(1.0 - abs(w1 * 0.52 + w2 * 0.48), 0.0, 1.0), 14.0) * 0.90;
        float filB = pow(clamp(1.0 - abs(w2 * w3), 0.0, 1.0), 16.0) * 0.62;
        float centerGlow = smoothstep(0.55, 0.0, r) * 0.07;

        vec3 col =
          vec3(0.92, 0.95, 1.0) * (primaryArc + filA) +
          vec3(1.0, 0.90, 0.74) * filB +
          vec3(0.60, 0.72, 0.90) * centerGlow;

        gl_FragColor = vec4(col * mask * uOpacity, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 3.9), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -1.271, 0.06);
  return mesh;
}

export class StudioScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;

    this.scene = new THREE.Scene();
    this.scene.background = MATERIALS.clay.bg.clone();

    // Start at full gallery zoom-out (camDist = 12.2) with calm architectural proportion
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
    this.camDist = 12.2;
    this.targetCamDist = 12.2;
    this.camera.position.set(0, 0.42, this.camDist);
    this.camera.lookAt(0, 0.06, 0);

    this.roomUniforms = {
      uRoomWeights: { value: new THREE.Vector3(1, 0, 0) },
    };
    this.brushUniforms = {
      uBrushLocalPos: { value: new THREE.Vector3(0, 0, 1) },
      uBrushRadius: { value: 0.42 },
      uBrushVisible: { value: 0.0 },
      uBrushActive: { value: 0.0 },
      uBrushPinch: { value: 0.0 },
      uBrushMode: { value: 0 },
      uSymmetry: { value: 0.0 },
      uBrushColor: { value: new THREE.Color('#241d17') },
    };

    this.envs = buildStudioEnvironments(this.renderer);
    this.scene.environment = this.envs.clay;

    this._initLights();
    this._initRoom();
    this._initMaterials();
    this._initSculpture();

    this.raycaster = new THREE.Raycaster();
    this.materialId = 'clay';
    this.targetMat = MATERIALS.clay;

    this.velX = 0;
    this.velY = 0;
    this.isInteracting = false;
    this.time = 0;

    this.resize();
  }

  _initLights() {
    this.ambient = new THREE.HemisphereLight('#fffdf8', '#96826d', 0.20);
    this.scene.add(this.ambient);

    this.keyLight = new THREE.DirectionalLight('#fffaf2', 2.55);
    this.keyLight.position.copy(MATERIALS.clay.keyPos);
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight('#efe4d4', 0.30);
    this.fillLight.position.set(4.6, -1.2, 2.4);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight('#fffaf2', 0.45);
    this.rimLight.position.set(2.2, 3.6, -5.4);
    this.scene.add(this.rimLight);

    this.rimLightB = new THREE.DirectionalLight('#e6f2ff', 0.0);
    this.rimLightB.position.set(-3.4, 2.2, -4.8);
    this.scene.add(this.rimLightB);
  }

  _initRoom() {
    this.roomMesh = buildArchitecturalRoom(this.roomUniforms);
    this.scene.add(this.roomMesh);

    this.contactShadow = buildSoftContactShadow();
    this.scene.add(this.contactShadow);

    this.causticFloor = buildCausticFloor();
    this.scene.add(this.causticFloor);
  }

  _attachSculptShader(mat, kind) {
    const bu = this.brushUniforms;
    mat.customProgramCacheKey = () => `form-${kind}-v4`;

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, bu);

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 sculptData;
          varying vec3 vSculptData;
          varying vec3 vLocalPos;
          varying mat3 vLocalToView;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vSculptData = sculptData;
          vLocalPos = position;
          vLocalToView = normalMatrix;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          varying vec3 vSculptData;
          varying vec3 vLocalPos;
          varying mat3 vLocalToView;
          uniform vec3 uBrushLocalPos;
          uniform float uBrushRadius;
          uniform float uBrushVisible;
          uniform float uBrushActive;
          uniform float uBrushPinch;
          uniform int uBrushMode;
          uniform float uSymmetry;
          uniform vec3 uBrushColor;
          ${GLSL_NOISE_HELPERS}`
        );

      if (kind === 'clay') {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
            // Silky-matte raw stoneware ceramic (warm terracotta-buff + razor-fine iron-oxide grog flecks)
            vec3 sp = vLocalPos;
            float nMacro = fbm3(sp * 2.2);
            float nMid = fbm3(sp * 7.8 + vec3(3.1, -2.4, 1.8));
            float nTooth = noise3(sp * 58.0);

            // Sharp sub-millimeter ceramic grog pinpoints visible even at gallery zoom-out
            float fleckMed = grogSpeckle(sp, 26.0, 0.865);
            float fleckFine = grogSpeckle(sp + vec3(4.7), 54.0, 0.855);
            float fleckDark = max(fleckMed, fleckFine * 0.82);
            float fleckLight = grogSpeckle(sp + vec3(7.1), 46.0, 0.94);

            vec3 umberClay = vec3(0.210, 0.146, 0.095);
            vec3 midClay   = vec3(0.340, 0.248, 0.168);
            vec3 buffClay  = vec3(0.465, 0.368, 0.272);

            vec3 col = mix(umberClay, midClay, smoothstep(0.24, 0.76, nMacro));
            col = mix(col, buffClay, smoothstep(0.52, 0.88, nMid) * 0.34);
            col += (nTooth - 0.5) * 0.016;

            // Fine mineral grog pinpoints
            col = mix(col, vec3(0.032, 0.020, 0.013), fleckDark * 0.88);
            col = mix(col, vec3(0.68, 0.60, 0.50), fleckLight * 0.35);

            // Authentic cavity & crease shading inside sculpted hollows and clay folds
            float cavAO = clamp(vSculptData.x, 0.48, 1.08);
            vec3 cavTint = mix(vec3(0.72, 0.62, 0.52), vec3(1.0), smoothstep(0.56, 0.98, cavAO));
            col *= cavAO * cavTint;

            diffuseColor.rgb = col;`
          )
          .replace(
            '#include <normal_fragment_maps>',
            `#include <normal_fragment_maps>
            // Silky-smooth fine ceramic skin untouched; deeper organic creases awaken where sculpted
            float eps = 0.0055;
            float sMask = vSculptData.z;
            float h0 = clayReliefHeight(vLocalPos, sMask);
            vec3 gradLocal = vec3(
              clayReliefHeight(vLocalPos + vec3(eps, 0.0, 0.0), sMask) - h0,
              clayReliefHeight(vLocalPos + vec3(0.0, eps, 0.0), sMask) - h0,
              clayReliefHeight(vLocalPos + vec3(0.0, 0.0, eps), sMask) - h0
            ) / eps;
            vec3 gradView = vLocalToView * gradLocal;
            vec3 tangentGrad = gradView - normal * dot(gradView, normal);
            float bumpPower = 0.0044 + sMask * 0.011;
            normal = normalize(normal - clamp(tangentGrad * bumpPower, vec3(-0.24), vec3(0.24)));`
          )
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            float rGrain = noise3(vLocalPos * 52.0);
            roughnessFactor = clamp(0.90 + (rGrain - 0.5) * 0.08 - vSculptData.z * 0.04, 0.80, 0.97);`
          );
      } else if (kind === 'chrome') {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            roughnessFactor = clamp(0.013 + (1.0 - clamp(vSculptData.x, 0.72, 1.0)) * 0.032, 0.010, 0.052);`
          );
      } else if (kind === 'glass') {
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
            float carved = smoothstep(0.02, 0.16, vSculptData.z);
            float satinGrain = (noise3(vLocalPos * 72.0) - 0.5) * 0.012;
            roughnessFactor = clamp(mix(0.14 + satinGrain, 0.014, carved), 0.01, 0.18);`
          )
          .replace(
            '#include <dithering_fragment>',
            `vec3 viewDir = normalize(vViewPosition);
            vec3 nView = normalize(vNormal);
            float ndotv = clamp(abs(dot(nView, viewDir)), 0.0, 1.0);
            float fresnel = pow(1.0 - ndotv, 2.6);
            float topCrown = smoothstep(-0.1, 0.9, nView.y) * 0.22;
            float carvedPolish = smoothstep(0.02, 0.16, vSculptData.z);
            vec3 crystalRim = vec3(0.76, 0.82, 0.90) * (fresnel * 0.50 + topCrown * (1.0 - carvedPolish * 0.65));
            gl_FragColor.rgb += crystalRim;
            #include <dithering_fragment>`
          );
      }

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        ${GLSL_GEODESIC_RING}`
      );
    };
  }

  _initMaterials() {
    const clayMat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.91,
      metalness: 0.0,
      sheen: 0.14,
      sheenRoughness: 0.92,
      sheenColor: new THREE.Color('#e6d7c4'),
      envMapIntensity: 0.44,
    });
    this._attachSculptShader(clayMat, 'clay');

    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 1.0,
      roughness: 0.013,
      clearcoat: 0.35,
      clearcoatRoughness: 0.012,
      envMapIntensity: 1.32,
    });
    this._attachSculptShader(chromeMat, 'chrome');

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: '#f2f6fb',
      metalness: 0.0,
      roughness: 0.14,
      transmission: 1.0,
      ior: 1.52,
      thickness: 2.8,
      dispersion: 1.0,
      attenuationColor: new THREE.Color('#d2e2f4'),
      attenuationDistance: 5.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      specularIntensity: 1.0,
      envMapIntensity: 1.52,
    });
    this._attachSculptShader(glassMat, 'glass');

    this.meshMaterials = {
      clay: clayMat,
      chrome: chromeMat,
      glass: glassMat,
    };
  }

  _initSculpture() {
    this.sculpt = new SculptMesh(60, 1.02);
    this.pivot = new THREE.Group();
    // Static, solid floating elevation right in the center (zero up-and-down pulsing)
    this.pivot.position.set(0, 0.22, 0);
    this.mesh = new THREE.Mesh(this.sculpt.geometry, this.meshMaterials.clay);
    this.pivot.add(this.mesh);
    this.scene.add(this.pivot);
  }

  setMaterial(id) {
    if (!MATERIALS[id]) return;
    this.materialId = id;
    this.targetMat = MATERIALS[id];
    this.mesh.material = this.meshMaterials[id];
    this.scene.environment = this.envs[id];
    this.brushUniforms.uBrushColor.value.copy(this.targetMat.reticleColor);
  }

  setSymmetry(enabled) {
    this.brushUniforms.uSymmetry.value = enabled ? 1.0 : 0.0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(240, Math.round(rect.height));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  hitTest(nx, ny) {
    const ndc = new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.mesh, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const localPoint = this.mesh.worldToLocal(hit.point.clone());
    const worldNormal = hit.face
      ? hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize()
      : hit.point.clone().normalize();
    const localNormal = hit.face ? hit.face.normal.clone().normalize() : localPoint.clone().normalize();
    return {
      worldPoint: hit.point,
      localPoint,
      worldNormal,
      localNormal,
    };
  }

  projectToDragPlane(nx, ny, anchorWorld) {
    const ndc = new THREE.Vector2(nx * 2 - 1, -(ny * 2 - 1));
    this.raycaster.setFromCamera(ndc, this.camera);
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, anchorWorld);
    const out = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, out)) return null;
    return out;
  }

  getCameraForward() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return dir;
  }

  worldDeltaToLocalDelta(worldDelta) {
    const invQuat = this.pivot.quaternion.clone().invert();
    return worldDelta.clone().applyQuaternion(invQuat);
  }

  updateReticle(hit, brushRadius = 0.42, pinchProgress = 0, active = false, tool = 'sculpt') {
    const u = this.brushUniforms;
    if (!hit) {
      u.uBrushVisible.value = 0.0;
      return;
    }
    u.uBrushLocalPos.value.copy(hit.localPoint);
    u.uBrushRadius.value = brushRadius;
    u.uBrushVisible.value = 1.0;
    u.uBrushActive.value = active ? 1.0 : 0.0;
    u.uBrushPinch.value = Math.max(0, Math.min(1, pinchProgress));
    u.uBrushMode.value = tool === 'pull' ? 1 : tool === 'smooth' ? 2 : tool === 'push' ? 3 : 0;
  }

  rotateBy(dxRad, dyRad) {
    const qY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dxRad);
    const qX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dyRad);
    this.pivot.quaternion.premultiply(qY).premultiply(qX).normalize();
  }

  addOrbitImpulse(vx, vy) {
    this.velX = vx;
    this.velY = vy;
  }

  zoomBy(delta) {
    this.targetCamDist = Math.max(4.0, Math.min(12.2, this.targetCamDist + delta));
  }

  exportGLB() {
    const exporter = new GLTFExporter();
    const exportGeo = this.sculpt.geometry.clone();
    exportGeo.deleteAttribute('sculptData');
    const exportMat = new THREE.MeshStandardMaterial({
      color: this.materialId === 'clay' ? '#a6886a' : this.materialId === 'chrome' ? '#e8edf2' : '#d8e4f0',
      metalness: this.materialId === 'chrome' ? 1.0 : 0.0,
      roughness: this.materialId === 'clay' ? 0.91 : 0.04,
    });
    const exportMesh = new THREE.Mesh(exportGeo, exportMat);
    exportMesh.name = `form-${this.materialId}`;
    exporter.parse(
      exportMesh,
      (buffer) => {
        const blob = new Blob([buffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `form-${this.materialId}.glb`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      () => {},
      { binary: true }
    );
  }

  render(dt) {
    this.time += dt;
    this.sculpt.stepAnimation(dt);

    const lerpK = Math.min(1, dt * 5.2);
    const t = this.targetMat;
    this.roomUniforms.uRoomWeights.value.lerp(t.roomWeights, lerpK);
    this.scene.background.lerp(t.bg, lerpK);

    this.keyLight.color.lerp(t.keyColor, lerpK);
    this.keyLight.intensity += (t.keyIntensity - this.keyLight.intensity) * lerpK;
    this.keyLight.position.lerp(t.keyPos, lerpK);

    this.fillLight.color.lerp(t.fillColor, lerpK);
    this.fillLight.intensity += (t.fillIntensity - this.fillLight.intensity) * lerpK;

    this.rimLight.color.lerp(t.rimColor, lerpK);
    this.rimLight.intensity += (t.rimIntensity - this.rimLight.intensity) * lerpK;

    const rimBTarget = this.materialId === 'glass' ? 1.55 : 0.0;
    this.rimLightB.intensity += (rimBTarget - this.rimLightB.intensity) * lerpK;

    this.ambient.intensity += (t.ambientIntensity - this.ambient.intensity) * lerpK;

    this.contactShadow.material.uniforms.uColor.value.lerp(t.shadowColor, lerpK);
    this.contactShadow.material.uniforms.uOpacity.value +=
      (t.shadowOpacity - this.contactShadow.material.uniforms.uOpacity.value) * lerpK;
    this.causticFloor.material.uniforms.uOpacity.value +=
      (t.causticOpacity - this.causticFloor.material.uniforms.uOpacity.value) * lerpK;

    this.camDist += (this.targetCamDist - this.camDist) * Math.min(1, dt * 8.0);
    this.camera.position.set(0, 0.42, this.camDist);
    this.camera.lookAt(0, 0.06, 0);

    if (Math.abs(this.velX) > 0.0001 || Math.abs(this.velY) > 0.0001) {
      this.rotateBy(this.velX * dt * 60, this.velY * dt * 60);
      const damp = Math.pow(0.91, dt * 60);
      this.velX *= damp;
      this.velY *= damp;
    }

    // Solid static floating sphere & shadow (zero vertical pulsing)
    this.pivot.position.y = 0.22;
    this.contactShadow.scale.setScalar(t.shadowRadius / 1.75);

    const euler = new THREE.Euler().setFromQuaternion(this.pivot.quaternion);
    this.causticFloor.material.uniforms.uTime.value = this.time;
    this.causticFloor.material.uniforms.uRot.value.set(euler.y, euler.x);

    this.renderer.render(this.scene, this.camera);
  }
}
