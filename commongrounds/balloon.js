'use strict';

// A little thank-you. Geometry, lighting and string are drawn locally in WebGL.
(() => {
  const link = document.querySelector('#creator-link');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  if (!link) return;
  let renderer, flight = 0, frame = 0, started = 0, originX = 0, originY = 0;
  const clamp = n => Math.max(0, Math.min(1, n));
  const ease = n => n * n * (3 - 2 * n);
  const stringDuration = .65;
  const balloonDelay = stringDuration + .08;

  function createRenderer() {
    const canvas = document.createElement('canvas');
    canvas.className = 'heart-balloon';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', {
      alpha: true, antialias: true, depth: true, stencil: false,
      premultipliedAlpha: true, powerPreference: 'low-power'
    });
    if (!gl) {
      console.warn('Heart balloon: WebGL is unavailable in this browser.');
      return null;
    }
    const vertex = `
      precision mediump float;
      attribute vec3 position;
      attribute vec3 normal;
      uniform vec2 turn;
      uniform vec2 inflate;
      uniform float kind;
      varying vec3 surfaceNormal;
      varying vec3 surfacePosition;
      mat3 spinY(float a) {
        return mat3(cos(a),0.,-sin(a), 0.,1.,0., sin(a),0.,cos(a));
      }
      mat3 spinZ(float a) {
        return mat3(cos(a),sin(a),0., -sin(a),cos(a),0., 0.,0.,1.);
      }
      void main() {
        vec3 p = position;
        vec3 n = normal;
        if (kind > .5) {
          p.y += 1.12;
          p *= vec3(inflate.x, inflate.y, inflate.x);
          p = spinZ(turn.y) * spinY(turn.x) * p;
          p.y -= 1.12;
          n = spinZ(turn.y) * spinY(turn.x) * (n / vec3(inflate.x, inflate.y, inflate.x));
        }
        surfaceNormal = n;
        surfacePosition = p;
        gl_Position = vec4(p.x * .4375, .425 + p.y * .35, -p.z * .2, 1.);
      }`;
    const fragment = `
      precision mediump float;
      uniform float kind;
      uniform float opacity;
      varying vec3 surfaceNormal;
      varying vec3 surfacePosition;
      void main() {
        vec3 colour;
        if (kind < .5) {
          colour = vec3(.74, .66, .65);
        } else {
          vec3 n = normalize(surfaceNormal);
          vec3 view = normalize(vec3(0., .12, 6.) - surfacePosition);
          vec3 key = normalize(vec3(-.6, .9, 1.4));
          vec3 fill = normalize(vec3(.9, .2, .7));
          float diffuse = max(dot(n, key), 0.);
          float rim = pow(1. - max(dot(n, view), 0.), 3.);
          float sheen = pow(max(dot(n, normalize(key + view)), 0.), 180.);
          vec3 reflection = reflect(-view, n);
          // Wide studio panels reflected in red foil, with a clear glossy coat.
          float topPanel = exp(-pow(abs((reflection.x + .3) / .4), 4.)
                               -pow(abs((reflection.y - .65) / .22), 4.));
          float rightPanel = exp(-pow(abs((reflection.x - .8) / .1), 4.)
                                 -pow(abs((reflection.y - .16) / .48), 4.));
          float leftPanel = exp(-pow(abs((reflection.x + .83) / .075), 4.)
                                -pow(abs((reflection.y - .12) / .42), 4.));
          float lowerPanel = exp(-pow(abs((reflection.y + .68) / .36), 4.));
          float darkBand = exp(-pow(abs((reflection.y + .05) / .23), 4.));
          vec3 foil = vec3(.92, .003, .012);
          colour = foil * (.48 + .45 * diffuse + .18 * max(dot(n, fill), 0.));
          colour *= 1. - .38 * darkBand;
          colour += foil * lowerPanel * .25;
          colour += vec3(1., .96, .97) * (topPanel * 1.15 + rightPanel * .95 + leftPanel * .8 + sheen * .65);
          colour += vec3(1., .34, .38) * rim * .25;
          // The very fine sealed edge catches a little light, like a foil balloon.
          float edge = pow(1. - abs(n.z), 16.);
          colour += vec3(.45, .08, .09) * edge;
          colour = pow(colour, vec3(.4545));
        }
        gl_FragColor = vec4(colour * opacity, opacity);
      }`;
    const shaders = [vertex, fragment].map((source, i) => {
      const shader = gl.createShader(i ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    });
    const program = gl.createProgram();
    shaders.forEach(shader => gl.attachShader(program, shader));
    gl.linkProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Heart balloon:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }
    gl.useProgram(program);
    const uniforms = Object.fromEntries(['turn', 'inflate', 'kind', 'opacity'].map(name =>
      [name, gl.getUniformLocation(program, name)]));
    const positions = gl.getAttribLocation(program, 'position');
    const normals = gl.getAttribLocation(program, 'normal');
    gl.enableVertexAttribArray(positions);
    gl.enableVertexAttribArray(normals);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // A closed, inflated heart, rather than a flat heart with a gradient.
    const point = (a, t) => {
      const r = Math.sin(a);
      return [r * Math.sin(t) ** 3,
        r * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16,
        .52 * Math.cos(a)];
    };
    const mesh = [], indices = [];
    const rings = 48, slices = 112;
    for (let i = 0; i <= rings; i++) {
      for (let j = 0; j <= slices; j++) {
        const a = Math.PI * i / rings, t = Math.PI * 2 * j / slices;
        const p = point(a, t);
        const b = Math.max(.001, Math.min(Math.PI - .001, a));
        const ap = point(b + .0005, t), am = point(b - .0005, t);
        const tp = point(b, t + .0005), tm = point(b, t - .0005);
        const da = ap.map((v, k) => v - am[k]), dt = tp.map((v, k) => v - tm[k]);
        const n = [dt[1]*da[2]-dt[2]*da[1], dt[2]*da[0]-dt[0]*da[2], dt[0]*da[1]-dt[1]*da[0]];
        const length = Math.hypot(...n) || 1;
        mesh.push(...p, ...n.map(v => v / length));
        if (i < rings && j < slices) {
          const k = i * (slices + 1) + j;
          indices.push(k, k+1, k+slices+1, k+1, k+slices+2, k+slices+1);
        }
      }
    }
    // The tied neck emerges from the tip of the heart.
    const knotStart = mesh.length / 6;
    for (let j = 0; j <= 24; j++) {
      const t = j / 24 * Math.PI * 2, x = Math.cos(t), z = Math.sin(t);
      mesh.push(.018*x, -1.05, .018*z, x, 0, z,
        .06*x, -1.18 + .009*Math.cos(3*t), .035*z, x, -.3, z);
      if (j < 24) {
        const k = knotStart + j * 2;
        indices.push(k,k+1,k+2,k+1,k+3,k+2);
      }
    }
    const body = gl.createBuffer(), elements = gl.createBuffer(), thread = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, body);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    const string = new Float32Array(65 * 2 * 6);
    gl.bindBuffer(gl.ARRAY_BUFFER, thread);
    gl.bufferData(gl.ARRAY_BUFFER, string.byteLength, gl.DYNAMIC_DRAW);

    function attributes(buffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(positions, 3, gl.FLOAT, false, 24, 0);
      gl.vertexAttribPointer(normals, 3, gl.FLOAT, false, 24, 12);
    }
    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(320 * dpr);
      canvas.height = Math.round(400 * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    document.body.append(canvas);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      stop();
      renderer = null;
      canvas.remove();
    });
    return {
      canvas, resize,
      draw(t, amount, released, reveal) {
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (t >= 0) {
          gl.uniform1f(uniforms.opacity, ease(clamp(t / .18)));
          gl.uniform2f(uniforms.turn, -.2 + .22 * Math.sin(t * 1.3), .035 * Math.sin(t * 1.9));
          gl.uniform2f(uniforms.inflate, amount, amount * (1 + .025 * Math.sin(t * 4) * (1-released)));
          gl.uniform1f(uniforms.kind, 1);
          attributes(body);
          gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        }
        if (reveal <= 0) return;
        for (let i = 0; i <= 64; i++) {
          // Grow from the name to the knot, keeping the lower end anchored.
          const s = 1 - reveal + i / 64 * reveal;
          const x = .11 * Math.sin(s * 5.5 - t * 2) * s * released + .09 * Math.sin(s * 3.1) * (1-released);
          const y = -1.17 - s * 1.48;
          for (let side = 0; side < 2; side++) {
            string.set([x + (side ? .006 : -.006), y, -.02, 0,0,1], (i * 2 + side) * 6);
          }
        }
        attributes(thread);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, string);
        gl.uniform1f(uniforms.opacity, 1);
        gl.uniform1f(uniforms.kind, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 130);
      }
    };
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    flight = 0;
    if (renderer) renderer.canvas.hidden = true;
  }
  function animate(now) {
    const elapsed = (now - started) / 1000;
    const t = elapsed - balloonDelay;
    const release = Math.max(0, t - 1.45);
    const lift = release * 64 + release * release * 20;
    const sway = Math.sin(release * 1.5) * Math.min(26, release * 13);
    if (originY - lift + 90 < -400) { stop(); return; }
    renderer.canvas.style.transform = `translate3d(${originX+sway}px,${originY-lift}px,0)`;
    renderer.draw(t, .045 + .955 * ease(clamp(t / 1.15)), ease(clamp(release)), ease(clamp(elapsed / stringDuration)));
    frame = requestAnimationFrame(animate);
  }
  function launch() {
    if (flight || motion.matches || document.hidden) return;
    if (!renderer) renderer = createRenderer();
    if (!renderer) return;
    const rect = link.getBoundingClientRect();
    // Leave room around the heart when the credit wraps on small screens.
    originX = Math.max(-40, Math.min(innerWidth - 280, rect.left + rect.width * .52 - 160));
    originY = rect.top + rect.height * .5 - 300;
    renderer.resize();
    renderer.canvas.hidden = false;
    flight = 1;
    started = performance.now();
    frame = requestAnimationFrame(animate);
  }
  link.addEventListener('pointerenter', event => {
    if (event.pointerType === 'mouse' && matchMedia('(hover: hover)').matches) launch();
  });
  link.addEventListener('focus', () => {
    if (link.matches(':focus-visible')) {
      link.scrollIntoView({block: 'nearest', behavior: 'instant'});
      launch();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  motion.addEventListener('change', () => { if (motion.matches) stop(); });
  window.addEventListener('resize', stop);
  window.addEventListener('pagehide', stop);
})();
