'use strict';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let motionPaused = reducedMotion.matches;
const videos = [...document.querySelectorAll('video')];
const castVideo = document.querySelector('#cast-video');
const portrait = document.querySelector('.cast-portrait');
const regularsSection = document.querySelector('#regulars');
const visibleVideos = new Set();
let customer = 15;
const castRevision = 'e3b3ae4574b7';
function castAsset(index, extension) {
  return `assets/regulars/${String(index + 1).padStart(2, '0')}.${extension}?v=${castRevision}`;
}
function playVisible(video) {
  if (motionPaused || document.hidden || !visibleVideos.has(video) ||
      (video === castVideo && regularsSection.classList.contains('is-closed'))) {
    video.autoplay = false;
    video.pause();
    return;
  }
  if (video === castVideo && !video.getAttribute('src')) {
    video.src = castAsset(customer, 'mp4');
  }
  video.autoplay = true;
  video.play().catch(() => {});
}
function updateMotion() {
  videos.forEach(playVisible);
}
// Only decode the films currently in view. Reduced motion starts on still art.
videos.forEach(video => { video.autoplay = false; video.pause(); });
const videoObserver = new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (entry.isIntersecting) visibleVideos.add(entry.target);
    else visibleVideos.delete(entry.target);
    playVisible(entry.target);
  }
}, { threshold: 0.15 });
videos.forEach(video => videoObserver.observe(video));
reducedMotion.addEventListener('change', event => { motionPaused = event.matches; updateMotion(); });
document.addEventListener('visibilitychange', updateMotion);
castVideo.addEventListener('loadeddata', () => portrait.classList.add('is-playing'));
castVideo.addEventListener('error', () => portrait.classList.remove('is-playing'));
const baristaVideo = document.querySelector('#barista-video');
const baristaPortrait = document.querySelector('.barista-portrait');
baristaVideo.addEventListener('loadeddata', () => baristaPortrait.classList.add('is-playing'));
baristaVideo.addEventListener('error', () => baristaPortrait.classList.remove('is-playing'));
updateMotion();
// Four-point projection onto the LCD in Panic's original 1600 × 1600 photograph.
// The photograph stays intact; only the live HTML video is transformed.
const screen = document.querySelector('.device-screen');
const device = document.querySelector('.device');
function fitScreen() {
  const k = device.clientWidth / 1600;
  const q = [[168,230],[952,249],[951,830],[169,790]].map(p => p.map(v => v*k));
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = q;
  const dx1=x1-x2,dx2=x3-x2,dx3=x0-x1+x2-x3;
  const dy1=y1-y2,dy2=y3-y2,dy3=y0-y1+y2-y3;
  const det=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/det,h=(dx1*dy3-dx3*dy1)/det;
  const a=x1-x0+g*x1,b=x3-x0+h*x3,d=y1-y0+g*y1,e=y3-y0+h*y3;
  const w=device.clientWidth;
  screen.style.transform=`matrix3d(${a/w},${d/w},0,${g/w},${b/w},${e/w},0,${h/w},0,0,1,0,${x0},${y0},0,1)`;
}
new ResizeObserver(fitScreen).observe(device); fitScreen();

const regulars = [
  "Max",
  "Richard",
  "Vanessa",
  "Elliot",
  "Jess",
  "Roxy",
  "Sarah",
  "Gus",
  "Ben",
  "Veronica",
  "Oliver",
  "Sebastian",
  "Dorothy",
  "Jake",
  "Chloe",
  "Lucy",
  "Adam",
  "Tyler",
  "Marge",
  "Sonny"
];

const picker = document.querySelector('#cast-picker');
let lastPointerX = -1, lastPointerY = -1;
let hoverBlockedUntil = 0;
const buttons = regulars.map((person, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `Meet ${person}`);
  button.setAttribute('aria-pressed', String(index === customer));
  const img = document.createElement('img');
  img.src = castAsset(index, 'svg');
  img.alt = ''; img.loading = 'lazy'; img.width = 208; img.height = 224;
  const label = document.createElement('span'); label.textContent = person;
  button.append(img, label);
  // Mouse preview does not steal focus or move the page. Touch keeps tap-to-select.
  button.addEventListener('pointermove', event => {
    const moved = event.clientX !== lastPointerX || event.clientY !== lastPointerY;
    lastPointerX = event.clientX; lastPointerY = event.clientY;
    if (moved && event.pointerType === 'mouse' && event.buttons === 0 &&
        performance.now() > hoverBlockedUntil && matchMedia('(hover: hover)').matches) showCustomer(index);
  });
  button.addEventListener('focus', () => showCustomer(index));
  button.addEventListener('click', () => {
    // Scrolling a selection into view must not hover-select a different face.
    hoverBlockedUntil = performance.now() + 750;
    showCustomer(index);
    const stage = document.querySelector('.cast-stage');
    const rect = stage.getBoundingClientRect();
    if (rect.top < 20 || rect.bottom > innerHeight - 20) {
      stage.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
  });
  picker.append(button);
  return button;
});
function showCustomer(index) {
  if (customer === index) return;
  customer = index;
  const person = regulars[index];
  document.querySelector('#cast-name').textContent = person;
  const img = document.querySelector('#cast-image');
  img.src = castAsset(index, 'svg');
  img.alt = `${person}, one of the twenty illustrated regulars`;
  castVideo.pause(); castVideo.autoplay = false;
  portrait.classList.remove('is-playing');
  castVideo.removeAttribute('src'); castVideo.load();
  buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
  playVisible(castVideo);
}

// The string and board swing together around the fixed pin, once on arrival.
const cafeSign = document.querySelector('.cafe-sign');
const signObserver = new IntersectionObserver(entries => {
  if (!entries.some(entry => entry.isIntersecting)) return;
  cafeSign.classList.add('has-arrived');
  signObserver.disconnect();
}, { threshold: 0.6 });
signObserver.observe(cafeSign);

// Closing the café folds away the regulars; Colby stays behind the counter.
const signToggle = document.querySelector('#regulars-toggle');
const regularsContent = document.querySelector('#regulars-content');
signToggle.addEventListener('click', () => {
  const closed = regularsSection.classList.toggle('is-closed');
  signToggle.setAttribute('aria-expanded', String(!closed));
  signToggle.setAttribute('aria-label', closed ? 'Show the regulars' : 'Hide the regulars');
  regularsContent.inert = closed;
  regularsContent.setAttribute('aria-hidden', String(closed));
  updateMotion();
});
