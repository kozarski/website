/**
 * Bent Pixel Lab - Main Application Logic
 * 
 * This file contains the core functionality for the image manipulation application,
 * including effect processing, UI interactions, and audio visualization.
 * 
 * Key components:
 * - Image upload and processing
 * - Effect application (Classic and Grid effects)
 * - Theme management
 * - Audio generation from image data
 * - Preset management
 */

const GRID_SIZE = 3;

document.addEventListener('DOMContentLoaded', () => {
    // Theme switching functionality
    const themeToggle = document.getElementById('themeToggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        #themeToggle {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 60px;
            height: 32px;
            background: var(--surface-color);
            border: 2px solid var(--pixel-border);
            cursor: pointer;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            font-size: 16px;
            font-family: monospace;
            transition: all 0.3s ease;
            overflow: hidden;
            position: relative;
        }
        
        #themeToggle .icon {
            position: absolute;
            width: 100%;
            text-align: center;
            transition: transform 0.3s ease;
            color: var(--text-color);
        }
        
        #themeToggle .sun {
            transform: translateX(${prefersDarkScheme.matches ? '60px' : '0'});
        }
        
        #themeToggle .moon {
            transform: translateX(${prefersDarkScheme.matches ? '0' : '-60px'});
        }
        
        #themeToggle:hover {
            transform: scale(1.05);
            box-shadow: 4px 4px 0 var(--pixel-border);
        }
        
        .dark-theme #themeToggle {
            background: var(--surface-color);
            border-color: var(--pixel-border);
        }
    `;
    document.head.appendChild(style);
    
    // Create theme toggle button content
    themeToggle.innerHTML = `
        <span class="icon sun">*</span>
        <span class="icon moon">○</span>
    `;
    
    // Set initial theme based on system preference
    if (prefersDarkScheme.matches) {
        document.body.classList.add('dark-theme');
    }
    
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        const isDark = document.body.classList.contains('dark-theme');
        
        // Animate the icons
        const sun = themeToggle.querySelector('.sun');
        const moon = themeToggle.querySelector('.moon');
        
        sun.style.transform = `translateX(${isDark ? '60px' : '0'})`;
        moon.style.transform = `translateX(${isDark ? '0' : '-60px'})`;
    });
    
    // Listen for system theme changes
    prefersDarkScheme.addEventListener('change', (e) => {
        const isDark = e.matches;
        document.body.classList.toggle('dark-theme', isDark);
        
        const sun = themeToggle.querySelector('.sun');
        const moon = themeToggle.querySelector('.moon');
        
        sun.style.transform = `translateX(${isDark ? '60px' : '0'})`;
        moon.style.transform = `translateX(${isDark ? '0' : '-60px'})`;
    });

    const uploadSection = document.getElementById('uploadSection');
    const photoInput = document.getElementById('photoInput');
    const editor = document.getElementById('editor');
    const previewArea = document.getElementById('previewArea');
    const canvas = document.getElementById('photoCanvas');
    const ctx = canvas.getContext('2d');
    const drawingOverlay = document.getElementById('drawingOverlay');
    const overlayCtx = drawingOverlay.getContext('2d');
    
    let currentImage = null;
    let originalWidth = 0;
    let originalHeight = 0;
    let originalScale = 0;

    // Debug helper
    const debug = document.getElementById('debug');
    /**
     * Logs a message to the debug console if debug mode is enabled
     * @param {string} msg - The message to log
     */
    function log(msg) {
        console.log(msg);
        if (debug) {
            debug.textContent = msg;
            debug.style.display = 'block';
            setTimeout(() => debug.style.display = 'none', 3000);
        }
    }

    // Verify all required elements exist
    const requiredElements = {
        uploadSection,
        photoInput,
        editor,
        previewArea,
        canvas,
        drawingOverlay
    };

    for (const [name, element] of Object.entries(requiredElements)) {
        if (!element) {
            console.error(`Required element not found: ${name}`);
            return;
        }
    }

    log('All elements initialized successfully');

    const sliders = {
        bitShift: document.getElementById('bitShift'),
        dataOffset: document.getElementById('dataOffset'),
        rgbSplit: document.getElementById('rgbSplit'),
        scanlines: document.getElementById('scanlines'),
        pathSort: document.getElementById('pathSort'),
        seedGrowth: document.getElementById('seedGrowth'),
        pixelSort: document.getElementById('pixelSort')
    };

    // Add slider reset functionality
    document.querySelectorAll('.slider-reset').forEach(button => {
        const targetId = button.dataset.target;
        if (!targetId) return;
        
        button.addEventListener('click', () => {
            const slider = document.getElementById(targetId);
            const numberInput = slider?.nextElementSibling;
            if (slider && numberInput) {
                slider.value = 0;
                numberInput.value = 0;
                redrawWithEffects();
            }
        });
    });

    // Add null check for sliders
    Object.entries(sliders).forEach(([key, slider]) => {
        if (!slider) {
            console.error(`Slider not found: ${key}`);
            return;
        }
        const numberInput = slider.nextElementSibling;
        if (!numberInput) {
            console.error(`Number input not found for: ${key}`);
            return;
        }
        
        slider.addEventListener('input', (e) => {
            numberInput.value = e.target.value;
            redrawWithEffects();
        });

        numberInput.addEventListener('input', (e) => {
            slider.value = e.target.value;
            redrawWithEffects();
        });
    });

    document.getElementById('randomize').addEventListener('click', () => {
        Object.values(sliders).forEach(slider => {
            const randomValue = Math.floor(Math.random() * slider.max);
            slider.value = randomValue;
            slider.nextElementSibling.value = randomValue; // Update number input
        });
        redrawWithEffects();
    });

    // File Upload Handlers
    uploadSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadSection.classList.add('drag-over');
    });

    uploadSection.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadSection.classList.remove('drag-over');
    });

    uploadSection.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadSection.classList.remove('drag-over');
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImage(file);
        } else {
            log('Please drop an image file');
        }
    });

    // Simplified file input handler
    photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
            handleImage(file);
        }
    });

    // Add initialization function
    /**
     * Initializes the canvas and sets up the initial drawing context
     * @returns {void}
     */
    function initializeCanvas() {
        canvas.width = previewArea.clientWidth || 800;
        canvas.height = 400;
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Initialize canvas on load
    initializeCanvas();

    // Add high-res processing canvas
    const processingCanvas = document.createElement('canvas');
    const processingCtx = processingCanvas.getContext('2d');

    /**
     * Handles the processing of an uploaded image file
     * @param {File} file - The image file to process
     * @returns {Promise<void>}
     */
    function handleImage(file) {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            log('Invalid file type');
            return;
        }

        log('Processing image...');

        uploadSection.classList.add('hidden');
        editor.classList.add('visible');

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            
            img.onload = function() {
                currentImage = img;
                log('Image loaded, updating canvas...');

                // Store original dimensions
                originalWidth = img.width;
                originalHeight = img.height;

                // Calculate maximum dimensions for preview
                const maxPreviewWidth = previewArea.clientWidth - 40; // Account for padding
                const maxPreviewHeight = window.innerHeight * 0.7; // Limit height to 70% of viewport

                // Calculate scale while maintaining aspect ratio
                const scaleWidth = maxPreviewWidth / originalWidth;
                const scaleHeight = maxPreviewHeight / originalHeight;
                const previewScale = Math.min(scaleWidth, scaleHeight);

                // Set preview canvas dimensions
                canvas.width = Math.floor(originalWidth * previewScale);
                canvas.height = Math.floor(originalHeight * previewScale);
                drawingOverlay.width = canvas.width;
                drawingOverlay.height = canvas.height;

                // Set up processing canvas at original resolution
                processingCanvas.width = originalWidth;
                processingCanvas.height = originalHeight;

                // Draw preview
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Clear overlay
                overlayCtx.clearRect(0, 0, drawingOverlay.width, drawingOverlay.height);
                
                // Reset all sliders
                Object.values(sliders).forEach(slider => {
                    slider.value = 0;
                    slider.nextElementSibling.value = 0;
                });

                log('Canvas updated');
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    }

    // Add window resize handler to maintain proper scaling
    window.addEventListener('resize', () => {
        if (currentImage) {
            const maxPreviewWidth = previewArea.clientWidth - 40;
            const maxPreviewHeight = window.innerHeight * 0.7;
            
            const scaleWidth = maxPreviewWidth / originalWidth;
            const scaleHeight = maxPreviewHeight / originalHeight;
            const previewScale = Math.min(scaleWidth, scaleHeight);

            canvas.width = Math.floor(originalWidth * previewScale);
            canvas.height = Math.floor(originalHeight * previewScale);
            drawingOverlay.width = canvas.width;
            drawingOverlay.height = canvas.height;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
            
            overlayCtx.clearRect(0, 0, drawingOverlay.width, drawingOverlay.height);
            redrawWithEffects();
        }
    });

    // Modify redrawWithEffects to work with preview resolution
    function redrawWithEffects() {
        if (!currentImage) return;

        // Clear and draw original image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);

        // Get preview resolution data
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Apply effects at preview resolution
        applySliderEffects(imageData);
        applyGridEffects(imageData);
        
        // Update preview canvas
        ctx.putImageData(imageData, 0, 0);
    }

    // Modify save functionality to process at full resolution
    document.getElementById('save').addEventListener('click', () => {
        if (!currentImage || !processingCanvas) return;
        
        try {
            // Draw original image at full resolution
            processingCanvas.width = originalWidth;
            processingCanvas.height = originalHeight;
            processingCtx.drawImage(currentImage, 0, 0, originalWidth, originalHeight);
            
            // Get full resolution data
            const fullResData = processingCtx.getImageData(0, 0, originalWidth, originalHeight);
            
            // Apply effects at full resolution
            applySliderEffects(fullResData);
            applyGridEffects(fullResData);
            
            // Update processing canvas with full resolution result
            processingCtx.putImageData(fullResData, 0, 0);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const link = document.createElement('a');
            
            // Determine best format based on image type and effects
            const hasTransparency = checkForTransparency(processingCanvas);
            const format = hasTransparency ? 'image/png' : 'image/jpeg';
            const quality = format === 'image/jpeg' ? 0.95 : undefined;
            
            link.download = `bent-pixel-${timestamp}${format === 'image/jpeg' ? '.jpg' : '.png'}`;
            link.href = processingCanvas.toDataURL(format, quality);
            link.click();
        } catch (error) {
            console.error('Error saving image:', error);
            alert('There was an error saving your image. Please try again.');
        }
    });

    // Helper function to check for transparency
    /**
     * Checks if the canvas contains any transparent pixels
     * @param {HTMLCanvasElement} canvas - The canvas to check
     * @returns {boolean} True if the canvas contains transparent pixels
     */
    function checkForTransparency(canvas) {
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] < 255) return true;
        }
        return false;
    }

    /**
     * Applies all slider-based effects to the image data
     * @param {ImageData} imageData - The image data to process
     * @returns {ImageData} The processed image data
     */
    function applySliderEffects(imageData) {
        if (!currentImage) return;
        
        const data = imageData.data;
        const originalData = new Uint8ClampedArray(data);
        const width = imageData.width;
        const height = imageData.height;

        // Bit shifting effect
        const bitShiftAmount = parseInt(sliders.bitShift.value);
        if (bitShiftAmount > 0) {
            for (let i = 0; i < data.length; i += 4) {
                data[i] = data[i] << (bitShiftAmount % 8);
                data[i + 1] = data[i + 1] << ((bitShiftAmount + 2) % 8);
                data[i + 2] = data[i + 2] << ((bitShiftAmount + 4) % 8);
            }
        }

        // Data offset effect
        const offsetAmount = parseInt(sliders.dataOffset.value) * 100;
        if (offsetAmount > 0) {
            const chunk = data.slice(0, offsetAmount);
            data.copyWithin(0, offsetAmount);
            data.set(chunk, data.length - offsetAmount);
        }

        // RGB split effect
        const rgbAmount = parseInt(sliders.rgbSplit.value);
        if (rgbAmount > 0) {
            const verticalOffset = rgbAmount * width * 4;
            for (let i = 0; i < data.length; i += 4) {
                data[i] = originalData[Math.max(0, i - verticalOffset)];
                data[i + 1] = originalData[i + 1];
                data[i + 2] = originalData[Math.min(data.length - 1, i + verticalOffset)];
            }
        }

        // Scanline effect
        const scanlineIntensity = parseInt(sliders.scanlines.value);
        if (scanlineIntensity > 0) {
            const intensity = scanlineIntensity / 100;
            for (let y = 0; y < height; y++) {
                const scanlineMod = (y % 4 < 2) ? 1 : 0.7;
                const rowOffset = y * width * 4;
                for (let x = 0; x < width; x++) {
                    const i = rowOffset + x * 4;
                    for (let c = 0; c < 3; c++) {
                        data[i + c] = originalData[i + c] * scanlineMod;
                    }
                }
            }
        }

        // Path Sort effect (optimized)
        const pathSortIntensity = parseInt(sliders.pathSort.value);
        if (pathSortIntensity > 0) {
            const intensity = pathSortIntensity / 100;
            const blockSize = 32; // Process in blocks for better performance
            
            for (let blockY = 0; blockY < height; blockY += blockSize) {
                for (let blockX = 0; blockX < width; blockX += blockSize) {
                    const blockWidth = Math.min(blockSize, width - blockX);
                    const blockHeight = Math.min(blockSize, height - blockY);
                    
                    // Process block
                    for (let y = blockY; y < blockY + blockHeight; y++) {
                        const row = new Float64Array(blockWidth);
                        const rowOffset = y * width * 4;
                        
                        // Calculate brightness for sorting
                        for (let x = 0; x < blockWidth; x++) {
                            const i = rowOffset + (blockX + x) * 4;
                            row[x] = (data[i] + data[i + 1] + data[i + 2]) / 3;
                        }
                        
                        // Sort row segment
                        const indices = Array.from({length: blockWidth}, (_, i) => i);
                        indices.sort((a, b) => row[a] - row[b]);
                        
                        // Apply sorted values
                        const tempRow = new Uint8ClampedArray(blockWidth * 4);
                        for (let x = 0; x < blockWidth; x++) {
                            const srcIdx = rowOffset + (blockX + indices[x]) * 4;
                            const destIdx = x * 4;
                            for (let c = 0; c < 4; c++) {
                                tempRow[destIdx + c] = data[srcIdx + c];
                            }
                        }
                        
                        // Copy back to main data
                        for (let x = 0; x < blockWidth; x++) {
                            const destIdx = rowOffset + (blockX + x) * 4;
                            const srcIdx = x * 4;
                            for (let c = 0; c < 4; c++) {
                                data[destIdx + c] = tempRow[srcIdx + c];
                            }
                        }
                    }
                }
            }
        }

        // Seed Growth effect (optimized)
        const seedGrowthAmount = parseInt(sliders.seedGrowth.value);
        if (seedGrowthAmount > 0) {
            const growthRadius = Math.floor(seedGrowthAmount / 10) + 1;
            const threshold = 200;
            
            // Find seed points (optimized)
            const seeds = [];
            for (let y = 0; y < height; y += 4) {
                const rowOffset = y * width * 4;
                for (let x = 0; x < width; x += 4) {
                    const i = rowOffset + x * 4;
                    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
                    if (brightness > threshold) {
                        seeds.push({x, y});
                    }
                }
            }
            
            // Process seeds in batches
            const batchSize = 100;
            for (let i = 0; i < seeds.length; i += batchSize) {
                const batch = seeds.slice(i, i + batchSize);
                batch.forEach(seed => {
                    const seedIdx = (seed.y * width + seed.x) * 4;
                    for (let dy = -growthRadius; dy <= growthRadius; dy++) {
                        const y = seed.y + dy;
                        if (y < 0 || y >= height) continue;
                        
                        for (let dx = -growthRadius; dx <= growthRadius; dx++) {
                            const x = seed.x + dx;
                            if (x < 0 || x >= width) continue;
                            
                            const distance = Math.sqrt(dx * dx + dy * dy);
                            if (distance <= growthRadius) {
                                const idx = (y * width + x) * 4;
                                const influence = 1 - (distance / growthRadius);
                                
                                for (let c = 0; c < 3; c++) {
                                    data[idx + c] = Math.min(255,
                                        data[idx + c] * (1 - influence) +
                                        originalData[seedIdx + c] * influence
                                    );
                                }
                            }
                        }
                    }
                });
            }
        }

        // Pixel Sort effect (optimized)
        const sortThreshold = parseInt(sliders.pixelSort.value);
        if (sortThreshold > 0) {
            const rowSize = width * 4;
            for (let y = 0; y < height; y++) {
                const rowOffset = y * rowSize;
                const row = new Float64Array(width);
                
                // Calculate brightness values
                for (let x = 0; x < width; x++) {
                    const i = rowOffset + x * 4;
                    row[x] = (data[i] + data[i + 1] + data[i + 2]) / 3;
                }
                
                // Find sortable segments
                let start = 0;
                for (let x = 0; x < width; x++) {
                    if (row[x] >= sortThreshold || x === width - 1) {
                        if (x > start) {
                            // Sort segment
                            const indices = Array.from({length: x - start}, (_, i) => start + i);
                            indices.sort((a, b) => row[a] - row[b]);
                            
                            // Apply sorted values
                            const tempSegment = new Uint8ClampedArray((x - start) * 4);
                            for (let i = 0; i < indices.length; i++) {
                                const srcIdx = rowOffset + indices[i] * 4;
                                const destIdx = i * 4;
                                for (let c = 0; c < 4; c++) {
                                    tempSegment[destIdx + c] = data[srcIdx + c];
                                }
                            }
                            
                            // Copy back to main data
                            for (let i = 0; i < x - start; i++) {
                                const destIdx = rowOffset + (start + i) * 4;
                                const srcIdx = i * 4;
                                for (let c = 0; c < 4; c++) {
                                    data[destIdx + c] = tempSegment[srcIdx + c];
                                }
                            }
                        }
                        start = x + 1;
                    }
                }
            }
        }
    }

    // Replace single gridState with effect-specific states
    const effectStates = {
        pixelflow: new Array(GRID_SIZE * GRID_SIZE).fill(false),
        vortex: new Array(GRID_SIZE * GRID_SIZE).fill(false),
        shatter: new Array(GRID_SIZE * GRID_SIZE).fill(false),
        ripple: new Array(GRID_SIZE * GRID_SIZE).fill(false),
        neon: new Array(GRID_SIZE * GRID_SIZE).fill(false),
        prism: new Array(GRID_SIZE * GRID_SIZE).fill(false)
    };

    // Initialize grid element
    const grid = document.getElementById('glitchGrid');

    if (!grid) {
        console.error('Grid element not found!');
    } else {
        // Create grid cells
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.index = i;
            
            cell.addEventListener('click', () => {
                const currentEffect = document.getElementById('gridEffectType').value;
                effectStates[currentEffect][i] = !effectStates[currentEffect][i];
                cell.classList.toggle('active');
                redrawWithEffects();
            });
            
            // Add drag selection
            cell.addEventListener('mouseenter', (e) => {
                if (e.buttons === 1) { // Left mouse button
                    const currentEffect = document.getElementById('gridEffectType').value;
                    cell.classList.add('active');
                    effectStates[currentEffect][i] = true;
                    redrawWithEffects();
                }
            });
            
            grid.appendChild(cell);
        }
    }

    // Add grid effect type change handler
    document.getElementById('gridEffectType').addEventListener('change', (e) => {
        // Update grid UI to show current effect's state
        const currentEffect = e.target.value;
        document.querySelectorAll('.grid-cell').forEach((cell, i) => {
            if (effectStates[currentEffect][i]) {
                cell.classList.add('active');
            } else {
                cell.classList.remove('active');
            }
        });
    });

    // Grid control buttons
    document.getElementById('clearGrid').addEventListener('click', () => {
        const currentEffect = document.getElementById('gridEffectType').value;
        effectStates[currentEffect].fill(false);
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('active');
        });
        redrawWithEffects();
    });

    document.getElementById('randomGrid').addEventListener('click', () => {
        const currentEffect = document.getElementById('gridEffectType').value;
        effectStates[currentEffect].forEach((_, i) => {
            effectStates[currentEffect][i] = Math.random() > 0.7;
            const cell = grid.children[i];
            if (effectStates[currentEffect][i]) {
                cell.classList.add('active');
            } else {
                cell.classList.remove('active');
            }
        });
        redrawWithEffects();
    });

    // Modify reset button handler
    document.getElementById('reset').addEventListener('click', () => {
        if (!currentImage) return;
        
        // Reset all sliders and number inputs to 0
        Object.values(sliders).forEach(slider => {
            slider.value = 0;
            slider.nextElementSibling.value = 0;
        });

        // Reset all effect states
        Object.keys(effectStates).forEach(effect => {
            effectStates[effect].fill(false);
        });
        
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('active');
        });
        
        redrawWithEffects();
    });

    // Add new button handler
    document.getElementById('new').addEventListener('click', () => {
        // Reset all sliders and effects
        Object.values(sliders).forEach(slider => {
            slider.value = 0;
            slider.nextElementSibling.value = 0;
        });

        // Reset all effect states
        Object.keys(effectStates).forEach(effect => {
            effectStates[effect].fill(false);
        });
        
        // Clear grid cells
        document.querySelectorAll('.grid-cell').forEach(cell => {
            cell.classList.remove('active');
        });

        // Clear image and reset UI
        currentImage = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        overlayCtx.clearRect(0, 0, drawingOverlay.width, drawingOverlay.height);
        
        // Reset file input
        photoInput.value = '';
        
        // Hide editor and show upload section
        editor.classList.remove('visible');
        uploadSection.classList.remove('hidden');
    });

    // Modify applyGridEffects to apply all active effects
    function applyGridEffects(data) {
        if (!currentImage) return;
        
        const cellWidth = data.width / GRID_SIZE;
        const cellHeight = data.height / GRID_SIZE;
        
        // Apply each effect type
        Object.entries(effectStates).forEach(([effectType, state]) => {
            state.forEach((active, i) => {
                if (!active) return;
                
                const gridX = (i % GRID_SIZE) * cellWidth;
                const gridY = Math.floor(i / GRID_SIZE) * cellHeight;
                const centerX = gridX + cellWidth / 2;
                const centerY = gridY + cellHeight / 2;

                switch(effectType) {
                    case 'pixelflow':
                        applyPixelFlowEffect(data, gridX, gridY, cellWidth, cellHeight, centerX, centerY);
                        break;
                    case 'vortex':
                        applyVortexEffect(data, gridX, gridY, cellWidth, cellHeight, centerX, centerY);
                        break;
                    case 'shatter':
                        applyShatterEffect(data, gridX, gridY, cellWidth, cellHeight, centerX, centerY);
                        break;
                    case 'ripple':
                        applyRippleEffect(data, gridX, gridY, cellWidth, cellHeight, centerX, centerY);
                        break;
                    case 'neon':
                        applyNeonEffect(data, gridX, gridY, cellWidth, cellHeight, centerX, centerY);
                        break;
                    case 'prism':
                        applyPrismEffect(data, gridX, gridY, cellWidth, cellHeight, centerX, centerY);
                        break;
                }
            });
        });
    }

    function applyPixelFlowEffect(data, startX, startY, width, height, centerX, centerY) {
        const tempData = new Uint8ClampedArray(data.data.slice(0));
        const flowStrength = 2.5;
        const timeOffset = Date.now() / 1000;
        
        // Only process pixels within the grid cell
        for (let y = Math.floor(startY); y < Math.floor(startY + height); y++) {
            for (let x = Math.floor(startX); x < Math.floor(startX + width); x++) {
                if (x < 0 || x >= data.width || y < 0 || y >= data.height) continue;
                
                const dx = x - centerX;
                const dy = y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                
                // Create flowing effect based on distance and time
                const flow = Math.sin(distance / 10 - timeOffset) * flowStrength;
                const newX = Math.floor(x + Math.cos(angle) * flow);
                const newY = Math.floor(y + Math.sin(angle) * flow);
                
                // Ensure we stay within the grid cell bounds
                if (newX >= startX && newX < startX + width && newY >= startY && newY < startY + height) {
                    const targetIdx = (y * data.width + x) * 4;
                    const sourceIdx = (newY * data.width + newX) * 4;
                    
                    // Only copy if within canvas bounds
                    if (sourceIdx >= 0 && sourceIdx < data.data.length - 4) {
                        data.data[targetIdx] = tempData[sourceIdx];
                        data.data[targetIdx + 1] = tempData[sourceIdx + 1];
                        data.data[targetIdx + 2] = tempData[sourceIdx + 2];
                    }
                }
            }
        }
    }

    function applyVortexEffect(data, startX, startY, width, height, centerX, centerY) {
        const tempData = new Uint8ClampedArray(data.data.slice(0));
        const maxRadius = Math.sqrt(width * width + height * height) / 2;
        const twistFactor = 5.0;
        
        // Only process pixels within the grid cell
        for (let y = Math.floor(startY); y < Math.floor(startY + height); y++) {
            for (let x = Math.floor(startX); x < Math.floor(startX + width); x++) {
                if (x < 0 || x >= data.width || y < 0 || y >= data.height) continue;
                
                const dx = x - centerX;
                const dy = y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                
                // Create spiral warping effect
                const twist = (maxRadius - distance) / maxRadius * twistFactor;
                const newAngle = angle + twist;
                const newX = Math.floor(centerX + Math.cos(newAngle) * distance);
                const newY = Math.floor(centerY + Math.sin(newAngle) * distance);
                
                // Ensure we stay within the grid cell bounds
                if (newX >= startX && newX < startX + width && newY >= startY && newY < startY + height) {
                    const targetIdx = (y * data.width + x) * 4;
                    const sourceIdx = (newY * data.width + newX) * 4;
                    
                    // Only copy if within canvas bounds
                    if (sourceIdx >= 0 && sourceIdx < data.data.length - 4) {
                        data.data[targetIdx] = tempData[sourceIdx];
                        data.data[targetIdx + 1] = tempData[sourceIdx + 1];
                        data.data[targetIdx + 2] = tempData[sourceIdx + 2];
                    }
                }
            }
        }
    }

    function applyShatterEffect(data, startX, startY, width, height, centerX, centerY) {
        const tempData = new Uint8ClampedArray(data.data.slice(0));
        // Make shards much larger for dramatic impact
        const shardSize = Math.min(width, height) / 6;
        const timeOffset = Date.now() / 1000;
        
        // Create a fracture pattern
        const fractures = [];
        const numFractures = 5;
        for (let i = 0; i < numFractures; i++) {
            const angle = (Math.PI * 2 * i / numFractures) + (timeOffset * 0.2);
            fractures.push({
                angle: angle,
                strength: Math.sin(timeOffset + i) * 0.5 + 1.5
            });
        }
        
        // Only process pixels within the grid cell
        for (let y = Math.floor(startY); y < Math.floor(startY + height); y += shardSize) {
            for (let x = Math.floor(startX); x < Math.floor(startX + width); x += shardSize) {
                if (x < 0 || x >= data.width || y < 0 || y >= data.height) continue;
                
                const dx = (x - centerX) / width;
                const dy = (y - centerY) / height;
                const baseAngle = Math.atan2(dy, dx);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Calculate fracture influence
                let maxDisplacement = 0;
                let dominantAngle = baseAngle;
                
                fractures.forEach(fracture => {
                    const angleDiff = Math.abs(((baseAngle - fracture.angle + Math.PI) % (Math.PI * 2)) - Math.PI);
                    const fracturePower = (1 - (angleDiff / Math.PI)) * fracture.strength;
                    if (fracturePower > maxDisplacement) {
                        maxDisplacement = fracturePower;
                        dominantAngle = fracture.angle;
                    }
                });
                
                // Create dramatic displacement
                const baseDisplacement = 100 * distance * maxDisplacement;
                const chaos = Math.sin(x * 0.05 + y * 0.05 + timeOffset) * 0.5 + 0.5;
                const displacement = baseDisplacement * (1 + chaos);
                
                // Add glitch-like offset
                const glitchOffset = Math.floor(Math.sin(timeOffset * 2 + distance * 5) * shardSize * 0.5);
                const offsetX = Math.cos(dominantAngle) * displacement + glitchOffset;
                const offsetY = Math.sin(dominantAngle) * displacement;
                
                // Apply to entire shard with data bending characteristics
                for (let sy = 0; sy < shardSize && y + sy < startY + height; sy++) {
                    for (let sx = 0; sx < shardSize && x + sx < startX + width; sx++) {
                        // Add shard distortion
                        const shardProgress = (sx + sy) / (shardSize * 2);
                        const bendFactor = Math.sin(shardProgress * Math.PI + timeOffset) * 15;
                        
                        const sourceX = Math.floor(x + sx + offsetX + bendFactor);
                        const sourceY = Math.floor(y + sy + offsetY);
                        
                        if (sourceX >= startX && sourceX < startX + width && 
                            sourceY >= startY && sourceY < startY + height) {
                            const targetIdx = ((y + sy) * data.width + (x + sx)) * 4;
                            const sourceIdx = (sourceY * data.width + sourceX) * 4;
                            
                            if (sourceIdx >= 0 && sourceIdx < data.data.length - 4 && 
                                targetIdx >= 0 && targetIdx < data.data.length - 4) {
                                // Add dramatic edge effects
                                const edgeFactor = Math.max(
                                    Math.abs(sx - shardSize/2) / (shardSize/2),
                                    Math.abs(sy - shardSize/2) / (shardSize/2)
                                );
                                
                                // Create data-bending color effects at edges
                                const intensity = 1 + edgeFactor * 0.8;
                                const channelShift = Math.floor(edgeFactor * 10) % 3;
                                
                                // Apply color channel shifting at edges
                                data.data[targetIdx] = Math.min(255, tempData[sourceIdx + channelShift] * intensity);
                                data.data[targetIdx + 1] = Math.min(255, tempData[sourceIdx + ((channelShift + 1) % 3)] * intensity);
                                data.data[targetIdx + 2] = Math.min(255, tempData[sourceIdx + ((channelShift + 2) % 3)] * intensity);
                            }
                        }
                    }
                }
            }
        }
    }

    function applyRippleEffect(data, startX, startY, width, height, centerX, centerY) {
        const tempData = new Uint8ClampedArray(data.data.slice(0));
        const frequency = 0.1;
        const amplitude = 10;
        const timeOffset = Date.now() / 1000;
        
        // Only process pixels within the grid cell
        for (let y = Math.floor(startY); y < Math.floor(startY + height); y++) {
            for (let x = Math.floor(startX); x < Math.floor(startX + width); x++) {
                if (x < 0 || x >= data.width || y < 0 || y >= data.height) continue;
                
                const dx = x - centerX;
                const dy = y - centerY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Create ripple displacement
                const ripple = Math.sin(distance * frequency - timeOffset) * amplitude;
                const angle = Math.atan2(dy, dx);
                const newX = Math.floor(x + Math.cos(angle) * ripple);
                const newY = Math.floor(y + Math.sin(angle) * ripple);
                
                // Ensure we stay within the grid cell bounds
                if (newX >= startX && newX < startX + width && newY >= startY && newY < startY + height) {
                    const targetIdx = (y * data.width + x) * 4;
                    const sourceIdx = (newY * data.width + newX) * 4;
                    
                    // Only copy if within canvas bounds
                    if (sourceIdx >= 0 && sourceIdx < data.data.length - 4) {
                        data.data[targetIdx] = tempData[sourceIdx];
                        data.data[targetIdx + 1] = tempData[sourceIdx + 1];
                        data.data[targetIdx + 2] = tempData[sourceIdx + 2];
                    }
                }
            }
        }
    }

    function applyNeonEffect(data, startX, startY, width, height, centerX, centerY) {
        const tempData = new Uint8ClampedArray(data.data.slice(0));
        const timeOffset = Date.now() / 1000;
        
        // Create a lookup table for the pulse wave to improve performance
        const pulseIntensity = Math.sin(timeOffset * 3) * 0.3 + 1.2; // Oscillates between 0.9 and 1.5
        const lookupTable = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            // Create a curve that enhances mid-to-high values more dramatically
            const normalized = i / 255;
            const curved = Math.pow(normalized, 0.8); // Adjust gamma for more intense mids
            lookupTable[i] = Math.min(255, i + (curved * 80 * pulseIntensity));
        }
        
        // Process the image in blocks for better performance
        const blockSize = 4; // Process 4x4 pixel blocks at a time
        for (let y = Math.floor(startY); y < Math.floor(startY + height); y += blockSize) {
            for (let x = Math.floor(startX); x < Math.floor(startX + width); x += blockSize) {
                if (x < 0 || x >= data.width || y < 0 || y >= data.height) continue;
                
                // Calculate distance from center for radial effect
                const dx = (x - centerX) / width;
                const dy = (y - centerY) / height;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const distanceFactor = Math.max(0, 1 - distance * 2);
                
                // Process each block
                for (let by = 0; by < blockSize && y + by < startY + height; by++) {
                    for (let bx = 0; bx < blockSize && x + bx < startX + width; bx++) {
                        const px = x + bx;
                        const py = y + by;
                        const i = (py * data.width + px) * 4;
                        
                        if (i >= 0 && i < data.data.length - 4) {
                            // Get original color values
                            const r = tempData[i];
                            const g = tempData[i + 1];
                            const b = tempData[i + 2];
                            
                            // Calculate luminance
                            const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
                            
                            // Create "bloom" effect based on luminance
                            const bloomStr = Math.pow(luminance, 2) * distanceFactor;
                            
                            // Calculate color channel bleeding
                            const timePhase = timeOffset * 4;
                            const rPhase = Math.sin(timePhase) * 0.5 + 0.5;
                            const gPhase = Math.sin(timePhase + 2.094) * 0.5 + 0.5;
                            const bPhase = Math.sin(timePhase + 4.189) * 0.5 + 0.5;
                            
                            // Apply neon effect with color bleeding
                            const neonR = lookupTable[r] + (bloomStr * 50 * rPhase);
                            const neonG = lookupTable[g] + (bloomStr * 50 * gPhase);
                            const neonB = lookupTable[b] + (bloomStr * 50 * bPhase);
                            
                            // Add edge enhancement
                            const edgeIntensity = Math.max(
                                Math.abs(neonR - lookupTable[tempData[i - 4]]) / 255,
                                Math.abs(neonG - lookupTable[tempData[i - 3]]) / 255,
                                Math.abs(neonB - lookupTable[tempData[i - 2]]) / 255
                            ) * pulseIntensity;
                            
                            // Combine all effects
                            data.data[i] = Math.min(255, neonR + edgeIntensity * 50);
                            data.data[i + 1] = Math.min(255, neonG + edgeIntensity * 50);
                            data.data[i + 2] = Math.min(255, neonB + edgeIntensity * 50);
                        }
                    }
                }
            }
        }
    }

    function applyPrismEffect(data, startX, startY, width, height, centerX, centerY) {
        const tempData = new Uint8ClampedArray(data.data.slice(0));
        const prismStrength = 15;
        
        // Only process pixels within the grid cell
        for (let y = Math.floor(startY); y < Math.floor(startY + height); y++) {
            for (let x = Math.floor(startX); x < Math.floor(startX + width); x++) {
                if (x < 0 || x >= data.width || y < 0 || y >= data.height) continue;
                
                const dx = (x - centerX) / width;
                const dy = (y - centerY) / height;
                const angle = Math.atan2(dy, dx);
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Scale offsets based on distance from center
                const distanceScale = 1 - (distance / Math.sqrt(width * width + height * height));
                const scaledStrength = prismStrength * distanceScale;
                
                // Create chromatic aberration based on angle
                const redOffset = scaledStrength * Math.cos(angle + Math.PI / 3);
                const greenOffset = scaledStrength * Math.cos(angle);
                const blueOffset = scaledStrength * Math.cos(angle - Math.PI / 3);
                
                const targetIdx = (y * data.width + x) * 4;
                
                // Sample each color channel from different positions
                const redX = Math.floor(x + redOffset);
                const redY = Math.floor(y + redOffset);
                const greenX = Math.floor(x + greenOffset);
                const greenY = Math.floor(y + greenOffset);
                const blueX = Math.floor(x + blueOffset);
                const blueY = Math.floor(y + blueOffset);
                
                // Ensure all sampled positions are within the grid cell bounds
                if (redX >= startX && redX < startX + width && redY >= startY && redY < startY + height &&
                    greenX >= startX && greenX < startX + width && greenY >= startY && greenY < startY + height &&
                    blueX >= startX && blueX < startX + width && blueY >= startY && blueY < startY + height) {
                    
                    const redIdx = (redY * data.width + redX) * 4;
                    const greenIdx = (greenY * data.width + greenX) * 4;
                    const blueIdx = (blueY * data.width + blueX) * 4;
                    
                    // Only copy if all indices are within canvas bounds
                    if (redIdx >= 0 && redIdx < data.data.length - 4 &&
                        greenIdx >= 0 && greenIdx < data.data.length - 4 &&
                        blueIdx >= 0 && blueIdx < data.data.length - 4) {
                        data.data[targetIdx] = tempData[redIdx];
                        data.data[targetIdx + 1] = tempData[greenIdx + 1];
                        data.data[targetIdx + 2] = tempData[blueIdx + 2];
                    }
                }
            }
        }
    }

    // Add preset functionality
    const presets = {
        glitch: {
            bitShift: 50,
            dataOffset: 30,
            rgbSplit: 20,
            pixelSort: 128
        },
        wave: {
            bitShift: 0,
            dataOffset: 70,
            rgbSplit: 30,
            pixelSort: 200
        },
        dissolve: {
            bitShift: 20,
            dataOffset: 50,
            rgbSplit: 10,
            pixelSort: 50
        },
        chaos: {
            bitShift: 80,
            dataOffset: 90,
            rgbSplit: 40,
            pixelSort: 255
        },
        analog_corrupt: {
            bitShift: 15,
            dataOffset: 65,
            rgbSplit: 25,
            scanlines: 70,
            pixelSort: 150
        },
        organic: {
            bitShift: 10,
            dataOffset: 20,
            rgbSplit: 15,
            scanlines: 30,
            pathSort: 75,
            seedGrowth: 60,
            pixelSort: 100
        },

        audacity_pitch: {
            bitShift: 30,
            dataOffset: 80,
            rgbSplit: 40,
            scanlines: 0,
            pathSort: 0,
            seedGrowth: 0,
            pixelSort: 200
        },
        bass_boost: {
            bitShift: 60,
            dataOffset: 40,
            rgbSplit: 15,
            scanlines: 40,
            pathSort: 90,
            seedGrowth: 0,
            pixelSort: 180
        },
        echo_bend: {
            bitShift: 25,
            dataOffset: 100,
            rgbSplit: 35,
            scanlines: 20,
            pathSort: 40,
            seedGrowth: 30,
            pixelSort: 160
        },
        equalizer: {
            bitShift: 45,
            dataOffset: 55,
            rgbSplit: 25,
            scanlines: 60,
            pathSort: 60,
            seedGrowth: 40,
            pixelSort: 140
        },
        phaser_corrupt: {
            bitShift: 35,
            dataOffset: 75,
            rgbSplit: 45,
            scanlines: 50,
            pathSort: 80,
            seedGrowth: 20,
            pixelSort: 220
        },
        hex_edit: {
            bitShift: 70,
            dataOffset: 95,
            rgbSplit: 50,
            scanlines: 10,
            pathSort: 100,
            seedGrowth: 50,
            pixelSort: 255
        }
    };

    // Initialize all preset buttons (both default and custom)
    /**
     * Initializes the preset buttons and their event handlers
     * @returns {void}
     */
    function initializePresetButtons() {
        document.querySelectorAll('.preset-btn').forEach(btn => {
            const presetName = btn.dataset.preset;
            if (presetName && presets[presetName]) {
                btn.addEventListener('click', () => {
                    const preset = presets[presetName];
                    Object.entries(preset).forEach(([key, value]) => {
                        if (sliders[key]) {
                            sliders[key].value = value;
                            sliders[key].nextElementSibling.value = value;
                        }
                    });
                    redrawWithEffects();
                });
            }
        });
    }

    // Call initialization after DOM content is loaded
    initializePresetButtons();

    // Track custom presets separately
    const customPresets = new Set();

    // Function to create a new preset button
    /**
     * Creates a new preset button with the specified configuration
     * @param {string} presetName - The name of the preset
     * @param {Object} preset - The preset configuration object
     * @param {boolean} [isCustom=false] - Whether this is a custom user preset
     * @returns {HTMLElement} The created preset button element
     */
    function createPresetButton(presetName, preset, isCustom = false) {
        const btn = document.createElement('button');
        btn.className = `preset-btn${isCustom ? ' custom-preset' : ''}`;
        btn.dataset.preset = presetName;
        
        if (isCustom) {
            // Add to custom presets tracking
            customPresets.add(presetName);
            
            // Create a container for the preset name
            const nameSpan = document.createElement('span');
            nameSpan.textContent = presetName;
            btn.appendChild(nameSpan);
            
            // Create delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-preset';
            deleteBtn.innerHTML = '×';
            deleteBtn.title = 'Delete preset';
            deleteBtn.setAttribute('type', 'button');
            
            // Add delete functionality
            deleteBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (confirm(`Delete preset "${presetName}"?`)) {
                    delete presets[presetName];
                    customPresets.delete(presetName);
                    btn.remove();
                    
                    // Hide user presets section if no custom presets remain
                    const userPresetsSection = document.querySelector('.user-presets');
                    if (customPresets.size === 0) {
                        userPresetsSection.classList.remove('visible');
                    }
                }
            });
            
            btn.appendChild(deleteBtn);
        } else {
            btn.textContent = presetName;
        }
        
        // Add click handler for applying preset
        btn.addEventListener('click', () => {
            Object.entries(preset).forEach(([key, value]) => {
                if (sliders[key]) {
                    sliders[key].value = value;
                    sliders[key].nextElementSibling.value = value;
                }
            });
            redrawWithEffects();
        });
        
        return btn;
    }

    // Add save preset functionality
    document.getElementById('savePreset').addEventListener('click', () => {
        const presetName = prompt('Enter a name for your preset:');
        if (presetName) {
            const newPreset = {};
            Object.entries(sliders).forEach(([key, slider]) => {
                newPreset[key] = parseInt(slider.value);
            });
            presets[presetName] = newPreset;
            
            // Create and add new preset button
            const btn = createPresetButton(presetName, newPreset, true);
            
            // Show user presets section and add button
            const userPresetsSection = document.querySelector('.user-presets');
            const userPresetButtons = document.querySelector('.user-preset-buttons');
            userPresetsSection.classList.add('visible');
            userPresetButtons.appendChild(btn);
        }
    });

    // Audio Context and buffers
    let audioContext;
    let audioBuffer;
    let audioSource;
    let isPlaying = false;
    let startTime = 0;
    let progressInterval;
    let gainNode;

    // Initialize Audio Context
    /**
     * Initializes the Web Audio API context
     * @returns {void}
     */
    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            gainNode = audioContext.createGain();
            gainNode.connect(audioContext.destination);
        }
    }

    /**
     * Converts image data to audio data for sonification
     * @param {ImageData} imageData - The image data to convert
     * @returns {Float32Array} The generated audio data
     */
    function imageDataToAudio(imageData) {
        const sampleRate = 44100;
        // Make duration based on image complexity
        const duration = Math.min(15, Math.max(5, 
            Math.sqrt((imageData.width * imageData.height) / 10000)));
        const numSamples = Math.floor(sampleRate * duration);
        
        // Create stereo buffer
        const audioBuffer = audioContext.createBuffer(2, numSamples, sampleRate);
        const leftChannel = audioBuffer.getChannelData(0);
        const rightChannel = audioBuffer.getChannelData(1);
        
        // Calculate pixels per sample for better data distribution
        const pixelsPerSample = Math.max(1, Math.floor((imageData.width * imageData.height) / numSamples));
        
        // Create frequency mapping
        const baseFreq = 110; // A2 note
        const maxFreq = 1760; // A6 note
        
        for (let i = 0; i < numSamples; i++) {
            let leftSample = 0;
            let rightSample = 0;
            
            // Average multiple pixels for each audio sample
            for (let j = 0; j < pixelsPerSample; j++) {
                const pixelIndex = ((i * pixelsPerSample + j) % (imageData.width * imageData.height)) * 4;
                
                if (pixelIndex < imageData.data.length - 4) {
                    // Get RGB values
                    const r = imageData.data[pixelIndex] / 255;
                    const g = imageData.data[pixelIndex + 1] / 255;
                    const b = imageData.data[pixelIndex + 2] / 255;
                    
                    // Create frequency from color data
                    const brightness = (r + g + b) / 3;
                    const freq = baseFreq + (maxFreq - baseFreq) * brightness;
                    const t = i / sampleRate;
                    
                    // Generate complex waveform
                    const wave = 
                        Math.sin(2 * Math.PI * freq * t) * r +
                        Math.sin(3 * Math.PI * freq * t) * g * 0.5 +
                        Math.sin(4 * Math.PI * freq * t) * b * 0.25;
                    
                    // Create stereo effect based on horizontal position
                    const xPos = (pixelIndex / 4) % imageData.width;
                    const pan = (xPos / imageData.width) * 2 - 1;
                    leftSample += wave * (1 - Math.max(0, pan)) / pixelsPerSample;
                    rightSample += wave * (1 + Math.min(0, pan)) / pixelsPerSample;
                }
            }
            
            // Apply soft clipping and normalization
            leftChannel[i] = Math.tanh(leftSample);
            rightChannel[i] = Math.tanh(rightSample);
        }
        
        return audioBuffer;
    }

    // Update progress bar
    /**
     * Updates the audio progress bar and time display
     * @returns {void}
     */
    function updateProgress() {
        if (!isPlaying || !audioBuffer) return;
        
        const progressBar = document.getElementById('audioProgress');
        const timeDisplay = document.getElementById('timeDisplay');
        const currentTime = audioContext.currentTime - startTime;
        const duration = audioBuffer.duration;
        
        if (currentTime >= duration) {
            stopAudio();
            return;
        }
        
        const progress = (currentTime / duration) * 100;
        progressBar.value = progress;
        
        // Update time display
        const currentMinutes = Math.floor(currentTime / 60);
        const currentSeconds = Math.floor(currentTime % 60);
        const totalMinutes = Math.floor(duration / 60);
        const totalSeconds = Math.floor(duration % 60);
        
        timeDisplay.textContent = `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')} / ${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;
    }

    // Play/Pause audio
    /**
     * Toggles audio playback state
     * @returns {void}
     */
    function toggleAudio() {
        if (!audioContext) initAudioContext();
        
        if (!audioBuffer) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            audioBuffer = imageDataToAudio(imageData);
        }

        if (!isPlaying) {
            audioSource = audioContext.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.connect(gainNode);
            audioSource.start(0);
            startTime = audioContext.currentTime;
            isPlaying = true;
            document.getElementById('playButton').textContent = '‖';
            progressInterval = setInterval(updateProgress, 50);
        } else {
            stopAudio();
        }
    }

    // Stop audio playback
    /**
     * Stops audio playback and resets the player state
     * @returns {void}
     */
    function stopAudio() {
        if (audioSource) {
            audioSource.stop();
            audioSource = null;
        }
        isPlaying = false;
        document.getElementById('playButton').textContent = '►';
        clearInterval(progressInterval);
    }

    // Update audio from current image data
    /**
     * Updates the audio buffer with new image data
     * @returns {void}
     */
    function updateAudioBuffer() {
        if (currentImage) {
            stopAudio();
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            try {
                audioBuffer = imageDataToAudio(imageData);
                const duration = audioBuffer.duration;
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60);
                document.getElementById('audioProgress').value = 0;
                document.getElementById('timeDisplay').textContent = 
                    `0:00 / ${minutes}:${seconds.toString().padStart(2, '0')}`;
            } catch (error) {
                console.error('Error creating audio:', error);
                // Show error in UI
                document.getElementById('timeDisplay').textContent = 'Error creating audio';
            }
        }
    }

    // Update volume
    /**
     * Updates the audio volume
     * @param {number} value - The new volume value (0-1)
     * @returns {void}
     */
    function updateVolume(value) {
        if (gainNode) {
            gainNode.gain.value = value;
        }
    }

    // Create audio player UI
    /**
     * Creates and initializes the audio player interface
     * @returns {void}
     */
    function createAudioPlayer() {
        // Create header section
        const header = document.createElement('div');
        header.className = 'effects-header';
        const title = document.createElement('h3');
        title.textContent = 'Listen';
        
        // Create tooltip container
        const titleContainer = document.createElement('span');
        titleContainer.style.position = 'relative';
        titleContainer.appendChild(title);
        
        const titleTooltip = document.createElement('span');
        titleTooltip.className = 'tooltip-text';
        titleTooltip.style.width = '350px';  // Wider tooltip for longer explanation
        titleTooltip.textContent = `This audio player interprets your glitch art as sound, creating a unique audio experience from your visual effects. The process works by:

1. Converting the image's pixel data into an audio buffer
2. Each RGB value becomes a sample in the audio stream
3. Color brightness influences frequency (brighter = higher pitch)
4. Image width affects stereo positioning
5. Effects like bit-shift and data offset create unique audio artifacts

This technique, known as "databending," treats image data as raw audio samples, similar to how vintage artists would modify images by editing them in audio editors. The result is a synchronized audio-visual experience where your glitch effects create corresponding sound patterns.`;
        
        titleContainer.appendChild(titleTooltip);
        header.appendChild(titleContainer);
        
        // Add tooltip positioning for the title
        titleContainer.addEventListener('mouseenter', (e) => {
            const rect = title.getBoundingClientRect();
            titleTooltip.style.left = rect.left + 'px';
            titleTooltip.style.top = (rect.bottom + 5) + 'px';
            
            // Ensure tooltip stays within viewport
            const tooltipRect = titleTooltip.getBoundingClientRect();
            if (tooltipRect.right > window.innerWidth) {
                titleTooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
            }
            if (tooltipRect.bottom > window.innerHeight) {
                titleTooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
            }
        });
        
        const audioPlayer = document.createElement('div');
        audioPlayer.className = 'audio-player';
        
        // Create audio controls
        const controls = document.createElement('div');
        controls.className = 'audio-controls';
        controls.innerHTML = `
            <button id="playButton" class="action-btn">►</button>
            <span>
                <button id="updateAudio" class="action-btn">⟲</button>
                <span class="tooltip-text">Reload sample - Updates the audio with any changes made to the image</span>
            </span>
            <div class="progress-container">
                <progress id="audioProgress" value="0" max="100"></progress>
                <span id="timeDisplay">0:00 / 0:00</span>
            </div>
            <div class="volume-container">
                <span>၊၊||၊</span>
                <input type="range" id="volumeControl" min="0" max="1" step="0.1" value="0.2">
            </div>
        `;
        
        // Append controls to audio player
        audioPlayer.appendChild(controls);
        
        // Insert at the bottom of the editor
        const editor = document.getElementById('editor');
        editor.appendChild(header);
        editor.appendChild(audioPlayer);
        
        // Add event listeners and tooltip functionality
        const updateAudioBtn = document.getElementById('updateAudio');
        const updateAudioContainer = updateAudioBtn.parentElement;
        const reloadTooltip = updateAudioContainer.querySelector('.tooltip-text');
        
        updateAudioContainer.addEventListener('mouseenter', (e) => {
            const rect = updateAudioBtn.getBoundingClientRect();
            reloadTooltip.style.left = rect.left + 'px';
            reloadTooltip.style.top = (rect.bottom + 5) + 'px';
            
            // Ensure tooltip stays within viewport
            const tooltipRect = reloadTooltip.getBoundingClientRect();
            if (tooltipRect.right > window.innerWidth) {
                reloadTooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
            }
            if (tooltipRect.bottom > window.innerHeight) {
                reloadTooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
            }
        });
        
        document.getElementById('playButton').addEventListener('click', async () => {
            try {
                // Initialize audio context on first click
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    gainNode = audioContext.createGain();
                    gainNode.connect(audioContext.destination);
                }
                
                // Resume audio context if it's suspended
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                
                toggleAudio();
            } catch (error) {
                console.error('Audio playback error:', error);
                document.getElementById('timeDisplay').textContent = 'Audio error';
            }
        });
        
        document.getElementById('updateAudio').addEventListener('click', updateAudioBuffer);
        
        document.getElementById('volumeControl').addEventListener('input', (e) => {
            updateVolume(parseFloat(e.target.value));
        });
        
        document.getElementById('audioProgress').addEventListener('click', (e) => {
            if (!audioBuffer) return;
            
            const progressBar = e.target;
            const rect = progressBar.getBoundingClientRect();
            const clickPosition = (e.clientX - rect.left) / rect.width;
            const seekTime = clickPosition * audioBuffer.duration;
            
            stopAudio();
            audioSource = audioContext.createBufferSource();
            audioSource.buffer = audioBuffer;
            audioSource.connect(gainNode);
            audioSource.start(0, seekTime);
            startTime = audioContext.currentTime - seekTime;
            isPlaying = true;
            document.getElementById('playButton').textContent = '‖';
            progressInterval = setInterval(updateProgress, 50);
        });
    }

    // Call createAudioPlayer after canvas initialization
    createAudioPlayer();

    // Update audio buffer when effects are applied
    const originalRedrawWithEffects = redrawWithEffects;
    redrawWithEffects = function() {
        originalRedrawWithEffects();
        if (audioBuffer) {
            updateAudioBuffer();
        }
    };
});
