const canvas = document.getElementById('drawing');
const context = canvas.getContext('2d');
const colours = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
const brushRadius = 30;
let drawingPointer = null;
let previousX = 0;
let previousY = 0;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context.strokeRect(0, 0, canvas.width, canvas.height);
}

function drawPixels(x, y) {
  context.save();
  context.beginPath();
  context.arc(x, y, brushRadius, 0, Math.PI * 2);
  context.clip();

  for (let dx = -brushRadius; dx < brushRadius; dx++) {
    for (let dy = -brushRadius; dy < brushRadius; dy++) {
      if (Math.random() > .5) {
        context.fillStyle = colours[Math.floor(Math.random() * colours.length)];
        context.fillRect(x + dx, y + dy, 4, 4);
      }
    }
  }
  context.restore();
}

canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  drawingPointer = event.pointerId;
  previousX = event.clientX;
  previousY = event.clientY;
  canvas.setPointerCapture(event.pointerId);
  drawPixels(previousX, previousY);
});

function drawTo(event) {
  if (event.pointerId !== drawingPointer) return;
  const dx = event.clientX - previousX;
  const dy = event.clientY - previousY;
  const steps = Math.ceil(Math.hypot(dx, dy) / (brushRadius / 2));

  // Fix for continuous strokes when drawing quickly.
  for (let step = 1; step <= steps; step++) {
    drawPixels(previousX + dx * step / steps, previousY + dy * step / steps);
  }
  previousX = event.clientX;
  previousY = event.clientY;
}

canvas.addEventListener('pointermove', drawTo);

function stopDrawing(event) {
  if (event.pointerId === drawingPointer) drawingPointer = null;
}

canvas.addEventListener('pointerup', event => {
  drawTo(event);
  stopDrawing(event);
});
canvas.addEventListener('pointercancel', stopDrawing);
canvas.addEventListener('lostpointercapture', stopDrawing);
window.addEventListener('blur', () => { drawingPointer = null; });
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
