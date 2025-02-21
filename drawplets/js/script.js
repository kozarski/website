// Canvas setup and initialization
const drawingCanvas = document.getElementById('drawingCanvas');
const drawCtx = drawingCanvas.getContext('2d');
const rainCanvas = document.getElementById('rainCanvas');
const rainCtx = rainCanvas.getContext('2d');
const videoTab = document.getElementById('videoTab');
const videoContainer = document.getElementById('videoContainer');

// Add accumulation canvas
const accumulationCanvas = document.createElement('canvas');
const accCtx = accumulationCanvas.getContext('2d', { alpha: true });
document.body.appendChild(accumulationCanvas);

// Global state
let videoVisible = false;
let drawing = false;
let lastX = 0;
let lastY = 0;
let raindrops = [];
let lastFrameTime = 0;
let accumulation = new Float32Array(window.innerWidth);

// Animation and timing constants
const FRAME_RATE = 1000 / 60;  // Target 60 FPS

// Rain customization
const RAIN_CONFIG = {
    dropCount: 100,      // Number of raindrops
    minSpeed: 6,         // Minimum falling speed
    maxSpeed: 12,        // Maximum falling speed
    minLength: 15,       // Minimum raindrop length
    maxLength: 40,       // Maximum raindrop length
    opacity: 0.94        // Raindrop opacity
};

// Add rain levels configuration after RAIN_CONFIG
const RAIN_LEVELS = {
    1: {
        emoji: '🌦️',    // Light rain
        dropCount: 50,
        minSpeed: 4,
        maxSpeed: 8,
        minLength: 10,
        maxLength: 25,
        opacity: 0.7
    },
    2: {
        emoji: '🌧️',    // Medium rain
        dropCount: 100,
        minSpeed: 6,
        maxSpeed: 12,
        minLength: 15,
        maxLength: 40,
        opacity: 0.94
    },
    3: {
        emoji: '⛈️',    // Heavy rain
        dropCount: 150,
        minSpeed: 8,
        maxSpeed: 14,
        minLength: 20,
        maxLength: 50,
        opacity: 0.98
    }
};

let currentRainLevel = 1; // Start with light rain

// Water effect customization
const WATER_CONFIG = {
    accumRate: 4.0,      // How quickly water accumulates
    spreadRadius: 15,    // How far ripples spread
    impactForce: 0.4,    // How much impact raindrops have
    waveSpeed: 2500,     // Wave animation speed (higher == slower)
    primaryWave: 10,     // Main wave height
    secondaryWave: 5,    // Secondary wave height
    tertiaryWave: 2      // Small ripple height
};

// Grid customization
const GRID_CONFIG = {
    color: 'rgba(173, 216, 230, 0.5)',
    lineWidth: 0.5,
    spacing: 20
};

// Initialize canvases with proper dimensions
function initializeCanvases() {
    drawingCanvas.width = window.innerWidth;
    drawingCanvas.height = window.innerHeight;
    rainCanvas.width = window.innerWidth;
    rainCanvas.height = window.innerHeight;
    accumulationCanvas.width = window.innerWidth;
    accumulationCanvas.height = window.innerHeight;
    accumulationCanvas.style.position = 'absolute';
    accumulationCanvas.style.top = '0';
    accumulationCanvas.style.left = '0';
    accumulationCanvas.style.zIndex = '1';
    accumulationCanvas.style.pointerEvents = 'none';
}

// Drawing configuration
const DRAW_CONFIG = {
    baseWidth: 2,        // Base line width
    randomWidth: 0.5,    // Random width variation
    opacity: {
        min: 0.1,        // Minimum stroke opacity
        max: 0.3         // Maximum stroke opacity
    },
    textureOffset: 0.5   // How much the line wobbles
};

function setup() {
    initializeCanvases();
    drawGrid();
    createRain();
    setupEventListeners();
    requestAnimationFrame(animate);
}

function drawGrid() {
    drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawCtx.strokeStyle = GRID_CONFIG.color;
    drawCtx.lineWidth = GRID_CONFIG.lineWidth;

    for (let x = 0; x < drawingCanvas.width; x += GRID_CONFIG.spacing) {
        drawCtx.beginPath();
        drawCtx.moveTo(x, 0);
        drawCtx.lineTo(x, drawingCanvas.height);
        drawCtx.stroke();
    }

    for (let y = 0; y < drawingCanvas.height; y += GRID_CONFIG.spacing) {
        drawCtx.beginPath();
        drawCtx.moveTo(0, y);
        drawCtx.lineTo(drawingCanvas.width, y);
        drawCtx.stroke();
    }
}

function createRain() {
    raindrops = [];
    for (let i = 0; i < RAIN_CONFIG.dropCount; i++) {
        raindrops.push({
            x: Math.random() * rainCanvas.width,
            y: Math.random() * -200,
            speed: Math.random() * (RAIN_CONFIG.maxSpeed - RAIN_CONFIG.minSpeed) + RAIN_CONFIG.minSpeed,
            length: Math.random() * (RAIN_CONFIG.maxLength - RAIN_CONFIG.minLength) + RAIN_CONFIG.minLength,
            width: Math.random() * 1.2 + 0.3
        });
    }
}

function updateRain() {
    rainCtx.clearRect(0, 0, rainCanvas.width, rainCanvas.height);
    rainCtx.strokeStyle = `rgba(90, 174, 210, ${RAIN_CONFIG.opacity})`;

    raindrops.forEach(drop => {
        rainCtx.lineWidth = drop.width;
        rainCtx.beginPath();
        rainCtx.moveTo(drop.x, drop.y);
        rainCtx.lineTo(drop.x, drop.y + drop.length);
        rainCtx.stroke();

        drop.y += drop.speed;

        const columnIndex = Math.floor(drop.x);
        const waterLevel = window.innerHeight - accumulation[columnIndex];

        if (drop.y > waterLevel) {
            const spreadCurve = (x) => Math.cos((x * Math.PI) / WATER_CONFIG.spreadRadius) * 0.5 + 0.5;

            for (let i = -WATER_CONFIG.spreadRadius; i <= WATER_CONFIG.spreadRadius; i++) {
                const idx = columnIndex + i;
                if (idx >= 0 && idx < accumulation.length) {
                    const spreadFactor = spreadCurve(i);
                    accumulation[idx] += WATER_CONFIG.accumRate * spreadFactor * WATER_CONFIG.impactForce;
                }
            }

            drop.y = Math.random() * -200;
            drop.x = Math.random() * rainCanvas.width;
        }
    });

    accCtx.clearRect(0, 0, accumulationCanvas.width, accumulationCanvas.height);

    const gradient = accCtx.createLinearGradient(0, 0, 0, window.innerHeight);
    gradient.addColorStop(0, 'rgba(135, 206, 235, 0.95)');
    gradient.addColorStop(0.3, 'rgba(65, 105, 225, 0.85)');
    gradient.addColorStop(1, 'rgba(25, 25, 112, 0.95)');

    accCtx.fillStyle = gradient;
    accCtx.beginPath();
    accCtx.moveTo(0, window.innerHeight);

    const waveTime = Date.now() / WATER_CONFIG.waveSpeed;
    const primaryWaveHeight = WATER_CONFIG.primaryWave;
    const secondaryWaveHeight = WATER_CONFIG.secondaryWave;
    const tertiaryWaveHeight = WATER_CONFIG.tertiaryWave;

    let points = [];

    for (let x = 0; x < accumulation.length; x++) {
        const baseHeight = window.innerHeight - accumulation[x];
        const waveOffset =
            Math.sin(waveTime + x * 0.002) * primaryWaveHeight +
            Math.sin(waveTime * 1.5 + x * 0.005) * secondaryWaveHeight +
            Math.sin(waveTime * 3 + x * 0.01) * tertiaryWaveHeight;

        points.push({
            x: x,
            y: Math.min(baseHeight + waveOffset, window.innerHeight)
        });
    }

    accCtx.moveTo(0, window.innerHeight);
    accCtx.lineTo(0, points[0].y);

    for (let i = 0; i < points.length - 3; i += 3) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        const xc_next = (points[i + 1].x + points[i + 2].x) / 2;
        const yc_next = (points[i + 1].y + points[i + 2].y) / 2;

        accCtx.bezierCurveTo(
            xc, yc,
            xc_next, yc_next,
            points[i + 2].x, points[i + 2].y
        );
    }

    accCtx.lineTo(window.innerWidth, window.innerHeight);
    accCtx.closePath();
    accCtx.fill();

    accCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    accCtx.lineWidth = 1.5;

    for (let x = 0; x < accumulation.length; x += 60) {
        const baseHeight = window.innerHeight - accumulation[x];
        const highlightOffset = Math.sin(waveTime * 1.5 + x * 0.004) * primaryWaveHeight;
        if (x === 0) {
            accCtx.moveTo(x, baseHeight + highlightOffset);
        } else {
            accCtx.lineTo(x, baseHeight + highlightOffset);
        }
    }
    accCtx.stroke();
}

function animate(timestamp) {
    if (timestamp - lastFrameTime > FRAME_RATE) {
        updateRain();
        lastFrameTime = timestamp;
    }
    requestAnimationFrame(animate);
}

// Event listeners
function setupEventListeners() {
    drawingCanvas.addEventListener('mousedown', (e) => {
        drawing = true;
        lastX = e.clientX;
        lastY = e.clientY;
        drawCtx.beginPath();
        drawCtx.moveTo(lastX, lastY);
    });

    drawingCanvas.addEventListener('mousemove', (e) => {
        if (!drawing) return;

        const randomWidth = DRAW_CONFIG.baseWidth + (Math.random() * DRAW_CONFIG.randomWidth);

        drawCtx.lineWidth = randomWidth;
        drawCtx.lineCap = 'round';
        drawCtx.lineJoin = 'round';

        drawCtx.strokeStyle = `rgba(0, 0, 0, ${Math.random() * (DRAW_CONFIG.opacity.max - DRAW_CONFIG.opacity.min) + DRAW_CONFIG.opacity.min})`;

        drawCtx.lineTo(e.clientX, e.clientY);
        drawCtx.stroke();

        const randomOffset = DRAW_CONFIG.textureOffset;
        drawCtx.beginPath();
        drawCtx.moveTo(
            lastX + (Math.random() * randomOffset - randomOffset / 2),
            lastY + (Math.random() * randomOffset - randomOffset / 2)
        );

        [lastX, lastY] = [e.clientX, e.clientY];
    });

    drawingCanvas.addEventListener('mouseup', () => drawing = false);
    drawingCanvas.addEventListener('mouseout', () => drawing = false);

    document.getElementById('resetBtn').addEventListener('click', resetCanvas);

    window.addEventListener('resize', () => {
        const drawingData = drawCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);

        drawingCanvas.width = window.innerWidth;
        drawingCanvas.height = window.innerHeight;
        rainCanvas.width = window.innerWidth;
        rainCanvas.height = window.innerHeight;
        accumulationCanvas.width = window.innerWidth;
        accumulationCanvas.height = window.innerHeight;

        drawGrid();
        drawCtx.putImageData(drawingData, 0, 0);

        accumulation = new Float32Array(window.innerWidth);
    });

    videoTab.addEventListener('click', () => {
        videoVisible = !videoVisible;
        if (videoVisible) {
            videoContainer.classList.remove('hidden');
            videoContainer.classList.add('visible');
        } else {
            videoContainer.classList.remove('visible');
            videoContainer.classList.add('hidden');
        }
    });

    // Add rain control button listener
    document.getElementById('rainControlBtn').addEventListener('click', () => {
        currentRainLevel = (currentRainLevel % 3) + 1; // Cycle through 1-3 
        updateRainConfig(currentRainLevel);
    });
}

function resetCanvas() {
    drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawGrid();
    accumulation = new Float32Array(window.innerWidth);
}

// Add this function after the other configuration functions
function updateRainConfig(level) {
    const config = RAIN_LEVELS[level];
    RAIN_CONFIG.dropCount = config.dropCount;
    RAIN_CONFIG.minSpeed = config.minSpeed;
    RAIN_CONFIG.maxSpeed = config.maxSpeed;
    RAIN_CONFIG.minLength = config.minLength;
    RAIN_CONFIG.maxLength = config.maxLength;
    RAIN_CONFIG.opacity = config.opacity;
    
    // Update button emoji
    const rainControlBtn = document.getElementById('rainControlBtn');
    rainControlBtn.querySelector('.tab-icon').textContent = config.emoji;
    
    // Recreate rain with new settings
    createRain();
}

setup();