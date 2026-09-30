const canvas = document.getElementById('drawing');
const context = canvas.getContext('2d');
const colours = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'];
let drawingPointer = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  context.strokeRect(0, 0, canvas.width, canvas.height);
}

function drawPixels(x, y) {
  for (let dx = -20; dx < 20; dx++) {
    for (let dy = -20; dy < 20; dy++) {
      if (Math.random() > .5) {
        context.fillStyle = colours[Math.floor(Math.random() * colours.length)];
        context.fillRect(x + dx, y + dy, 4, 4);
      }
    }
  }
}

canvas.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  drawingPointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  drawPixels(event.clientX, event.clientY);
});

canvas.addEventListener('pointermove', event => {
  if (event.pointerId === drawingPointer) drawPixels(event.clientX, event.clientY);
});

function stopDrawing(event) {
  if (event.pointerId === drawingPointer) drawingPointer = null;
}

canvas.addEventListener('pointerup', stopDrawing);
canvas.addEventListener('pointercancel', stopDrawing);
canvas.addEventListener('lostpointercapture', stopDrawing);
window.addEventListener('blur', () => { drawingPointer = null; });
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
