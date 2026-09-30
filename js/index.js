const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const hover = matchMedia('(min-width: 701px) and (hover: hover) and (pointer: fine)');
const projects = document.querySelector('.projects');
const grid = document.querySelector('.hello-grid');

if (grid) {
  document.fonts.ready.then(() => {
    let drawn = false;

    new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const lines = document.createDocumentFragment();

      function addLine(x1, y1, x2, y2, index, side) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('d', `M${x1} ${y1}L${x2} ${y2}`);
        line.setAttribute('pathLength', '1');
        line.style.setProperty('--duration', `${3600 + (index * 173 + side * 317) % 1600}ms`);
        lines.append(line);
      }

      for (let y = 22.5, index = 0; y < height; y += 44, index++) {
        addLine(0, y, width / 2, y, index, 0);
        addLine(width, y, width / 2, y, index, 1);
      }

      for (let x = 22.5, index = 0; x < width; x += 44, index++) {
        addLine(x, 0, x, height / 2, index, 2);
        addLine(x, height, x, height / 2, index, 3);
      }

      grid.classList.toggle('is-static', drawn);
      grid.replaceChildren(lines);
      drawn = true;
    }).observe(grid);
  });
}

if (projects) {
  const rows = [...projects.querySelectorAll('.project')];
  const timers = new Map();

  function setOpen(row, open) {
    clearTimeout(timers.get(row));
    row.classList.toggle('is-open', open);
    const reveal = row.querySelector('.project-reveal');
    // Keep collapsed descriptions out of the tab order.
    reveal.inert = !open;
    reveal.setAttribute('aria-hidden', String(!open));
    row.querySelector('.details').setAttribute('aria-expanded', String(open));
  }

  function openRow(row) {
    rows.forEach(item => setOpen(item, item === row));
  }

  function closeLater(row) {
    clearTimeout(timers.get(row));
    timers.set(row, setTimeout(() => {
      if (!row.contains(document.activeElement)) setOpen(row, false);
    }, reduceMotion.matches ? 0 : 180));
  }

  rows.forEach(row => {
    const link = row.querySelector('.project-link');
    const details = row.querySelector('.details');
    const reveal = row.querySelector('.project-reveal');
    setOpen(row, false);

    row.addEventListener('pointerenter', event => {
      if (hover.matches && event.pointerType !== 'touch') openRow(row);
    });
    row.addEventListener('pointerleave', () => {
      if (hover.matches) closeLater(row);
    });
    link.addEventListener('focus', () => openRow(row));
    row.addEventListener('focusout', event => {
      if (!row.contains(event.relatedTarget)) closeLater(row);
    });
    details.addEventListener('click', () => {
      const open = !row.classList.contains('is-open');
      rows.forEach(item => setOpen(item, item === row && open));
    });
    row.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (reveal.contains(document.activeElement)) link.focus();
      setOpen(row, false);
    });
  });

  projects.classList.add('projects-ready');
}

const preview = document.querySelector('.gif-preview');
const contact = document.querySelector('.contact-link');
const pencil = document.querySelector('.pencil-scene');

if (contact && pencil) {
  const travel = pencil.querySelector('.pencil-travel');
  const faces = [...pencil.querySelectorAll('.pencil-faces path')];
  const lettering = pencil.querySelector('.pencil-lettering');
  let pencilFrame;

  function rollBarrel(angle) {
    faces.forEach((face, index) => {
      const normal = angle + index * Math.PI / 3;
      const visible = Math.cos(normal) > 0;
      face.style.display = visible ? '' : 'none';
      if (!visible) return;

      const y1 = 28 + Math.sin(normal - Math.PI / 6) * 16;
      const y2 = 28 + Math.sin(normal + Math.PI / 6) * 16;
      const light = Math.sin(normal);
      const amount = Math.min(1, Math.abs(light) / Math.sin(Math.PI / 3));
      const base = [245, 190, 50];
      const shade = light < 0 ? [255, 231, 149] : [188, 125, 21];
      const color = base.map((value, channel) => Math.round(value + (shade[channel] - value) * amount));

      face.setAttribute('d', `M98 ${y1}H650V${y2}H98Z`);
      face.setAttribute('fill', `rgb(${color.join(' ')})`);
    });

    const scale = Math.cos(angle);
    lettering.style.display = scale > 0 ? '' : 'none';
    lettering.setAttribute('transform', `matrix(1 0 0 ${scale} 0 ${28 + Math.sin(angle) * 13.86 - 28 * scale})`);
  }

  function settlePencil() {
    cancelAnimationFrame(pencilFrame);
    travel.style.transform = '';
    rollBarrel(0);
    travel.disabled = false;
  }

  function hidePencil() {
    settlePencil();
    pencil.hidden = true;
    travel.disabled = true;
    travel.setAttribute('aria-pressed', 'false');
  }

  function showPencil() {
    if (!hover.matches || !pencil.hidden) return;
    pencil.hidden = false;
    settlePencil();
    if (reduceMotion.matches) return;
    travel.disabled = true;

    const bounds = pencil.querySelector('.pencil').getBoundingClientRect();
    const startY = Math.max(40, innerHeight - bounds.top + 20);
    const bend = Math.min(90, startY * .2);
    const radius = pencil.clientWidth * 16 / 760;
    const rollTime = Math.max(7800, startY * 18);
    const settleTime = 900;
    const started = performance.now();

    function animate(now) {
      const elapsed = now - started;
      const progress = Math.min(1, elapsed / rollTime);
      const finish = Math.min(1, Math.max(0, (elapsed - rollTime) / settleTime));
      const remaining = (1 - progress) ** 2;
      const x = bend * remaining ** 2;
      const y = startY * remaining + Math.sin(finish * Math.PI * 2) * (1 - finish) ** 2 * 2;
      const tilt = -6 - 10 * remaining;

      // Keep the barrel's rotation tied to its travel across the page.
      travel.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${tilt}deg)`;
      rollBarrel(y / radius);
      if (elapsed < rollTime + settleTime) pencilFrame = requestAnimationFrame(animate);
      else settlePencil();
    }

    animate(started);
  }

  contact.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'touch') showPencil();
  });
  contact.addEventListener('focus', () => {
    if (contact.matches(':focus-visible')) showPencil();
  });
  travel.addEventListener('click', () => {
    const lifted = travel.getAttribute('aria-pressed') === 'true';
    travel.setAttribute('aria-pressed', String(!lifted));
  });
  travel.addEventListener('keydown', event => {
    if (event.key === 'Escape') travel.setAttribute('aria-pressed', 'false');
  });
  window.addEventListener('pagehide', hidePencil);
  hover.addEventListener('change', () => {
    if (!hover.matches) hidePencil();
  });
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches) settlePencil();
  });
}

if (preview) {
  const image = preview.querySelector('img');
  const triggers = document.querySelectorAll('[data-gif]');

  function hidePreview() {
    preview.hidden = true;
    image.removeAttribute('src');
  }

  function showPreview(trigger) {
    if (reduceMotion.matches) return;
    image.src = trigger.dataset.gif;
    preview.hidden = false;
  }

  triggers.forEach(trigger => {
    trigger.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') showPreview(trigger);
    });
    trigger.addEventListener('pointerleave', hidePreview);
    trigger.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse') showPreview(trigger);
    });
    trigger.addEventListener('pointerup', event => {
      if (event.pointerType !== 'mouse') hidePreview();
    });
    trigger.addEventListener('pointercancel', hidePreview);
    trigger.addEventListener('focus', () => {
      if (trigger.matches(':focus-visible')) showPreview(trigger);
    });
    trigger.addEventListener('blur', hidePreview);
    trigger.addEventListener('click', hidePreview);
    trigger.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      if (preview.hidden) showPreview(trigger);
      else hidePreview();
    });
  });

  image.addEventListener('error', hidePreview);
  reduceMotion.addEventListener('change', hidePreview);
  window.addEventListener('blur', hidePreview);
  window.addEventListener('pagehide', hidePreview);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hidePreview();
  });
}
