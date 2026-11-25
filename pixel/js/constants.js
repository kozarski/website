/* ============================================================
   CONSTANTS & DEFINITIONS
   ============================================================ */
export const GRID_SIZE = 3;
export const STORAGE_PRESETS_KEY = 'bpl_winamp_user_presets_v1';
export const STORAGE_SKIN_KEY = 'bpl5_skin';
export const VALID_SKINS = ['silver', 'carbon', 'olive', 'amber', 'green'];
export const HEX_ROWS_PER_PAGE = 128;
export const MAX_HISTORY = 25;
export const SNAP_DIST = 16;

export function getHexCols() {
  return window.innerWidth <= 520 ? 4 : 8;
}

export function getHexPageSize() {
  return getHexCols() * HEX_ROWS_PER_PAGE;
}

export const SKIN_SPECTRUM = {
  silver: {
    dot: 'rgba(130, 188, 255, 0.14)',
    wave: '#9ED2FF',
    waveAxis: 'rgba(204, 232, 255, 0.32)',
    mirrorHi: '#FFFFFF',
    mirrorLo: '#85C3FF',
    mirrorAxis: 'rgba(220, 240, 255, 0.72)',
    barHi: '#FFFFFF',
    barMid: '#CFE8FF',
    barLo: '#7DBBFF',
    peak: '#FFFFFF',
    baseLine: 'rgba(174, 214, 255, 0.45)'
  },
  carbon: {
    dot: 'rgba(122, 184, 255, 0.15)',
    wave: '#8EC9FF',
    waveAxis: 'rgba(184, 222, 255, 0.30)',
    mirrorHi: '#F5FAFF',
    mirrorLo: '#6EB5FF',
    mirrorAxis: 'rgba(205, 234, 255, 0.70)',
    barHi: '#FFFFFF',
    barMid: '#BAE0FF',
    barLo: '#5EA8FF',
    peak: '#FFFFFF',
    baseLine: 'rgba(148, 202, 255, 0.42)'
  },
  olive: {
    dot: 'rgba(212, 255, 102, 0.15)',
    wave: '#D4FF66',
    waveAxis: 'rgba(220, 255, 150, 0.30)',
    mirrorHi: '#F4FFD6',
    mirrorLo: '#C5F556',
    mirrorAxis: 'rgba(232, 255, 176, 0.72)',
    barHi: '#F7FFE0',
    barMid: '#D4FF66',
    barLo: '#86CC2B',
    peak: '#FFFFF0',
    baseLine: 'rgba(206, 250, 114, 0.45)'
  },
  amber: {
    dot: 'rgba(255, 179, 71, 0.16)',
    wave: '#FFB854',
    waveAxis: 'rgba(255, 210, 138, 0.32)',
    mirrorHi: '#FFF2D6',
    mirrorLo: '#FFB347',
    mirrorAxis: 'rgba(255, 224, 166, 0.72)',
    barHi: '#FFF5DC',
    barMid: '#FFC566',
    barLo: '#E8851A',
    peak: '#FFF8E8',
    baseLine: 'rgba(255, 190, 96, 0.46)'
  },
  green: {
    dot: 'rgba(68, 255, 119, 0.16)',
    wave: '#54FF86',
    waveAxis: 'rgba(156, 255, 186, 0.30)',
    mirrorHi: '#EBFFF0',
    mirrorLo: '#44FF77',
    mirrorAxis: 'rgba(196, 255, 214, 0.72)',
    barHi: '#EEFFF2',
    barMid: '#6BFF95',
    barLo: '#19C94F',
    peak: '#F4FFF7',
    baseLine: 'rgba(116, 255, 158, 0.45)'
  }
};

// JPEG segment codes for live ELI5 byte-level notes
export const SEG_SOI = 1;
export const SEG_APP = 2;
export const SEG_DQT = 3;
export const SEG_SOF = 4;
export const SEG_DHT = 5;
export const SEG_SOS = 6;
export const SEG_SCAN = 7;
export const SEG_EOI = 8;
export const SEG_OTHER = 9;

export const SPECIMENS = [
  { id: 0, label: '01 Dessau', short: 'Dessau' },
  { id: 1, label: '02 Alpine Ridge', short: 'Alpine Ridge' },
  { id: 2, label: '03 Chroma Prism', short: 'Chroma Prism' }
];

export const CELL_COORDS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3'];

export const CLASSIC_EFFECTS = [
  { key: 'bitShift',   label: 'Bit Shift',  min: 0, max: 100 },
  { key: 'dataOffset', label: 'Offset',     min: 0, max: 100 },
  { key: 'rgbSplit',   label: 'RGB',        min: 0, max: 50  },
  { key: 'scanlines',  label: 'Scanlines',  min: 0, max: 100 },
  { key: 'pathSort',   label: 'Path Sort',  min: 0, max: 100 },
  { key: 'seedGrowth', label: 'Seed',       min: 0, max: 100 },
  { key: 'pixelSort',  label: 'Pixel Sort', min: 0, max: 255 }
];

export const DEFAULT_PRESETS = {
  glitch:         { label: 'Glitch',         values: { bitShift: 50, dataOffset: 30, rgbSplit: 20, pixelSort: 128 } },
  wave:           { label: 'Wave',           values: { bitShift: 0,  dataOffset: 70, rgbSplit: 30, pixelSort: 200 } },
  dissolve:       { label: 'Dissolve',       values: { bitShift: 20, dataOffset: 50, rgbSplit: 10, pixelSort: 50 } },
  chaos:          { label: 'Chaos',          values: { bitShift: 80, dataOffset: 90, rgbSplit: 40, pixelSort: 255 } },
  analog_corrupt: { label: 'Analog Corrupt', values: { bitShift: 15, dataOffset: 65, rgbSplit: 25, scanlines: 70, pixelSort: 150 } },
  organic:        { label: 'Organic',        values: { bitShift: 10, dataOffset: 20, rgbSplit: 15, scanlines: 30, pathSort: 75, seedGrowth: 60, pixelSort: 100 } },
  audacity_pitch: { label: 'Audacity Pitch', values: { bitShift: 30, dataOffset: 80, rgbSplit: 40, scanlines: 0,  pathSort: 0,  seedGrowth: 0,  pixelSort: 200 } },
  bass_boost:     { label: 'Bass Boost',     values: { bitShift: 60, dataOffset: 40, rgbSplit: 15, scanlines: 40, pathSort: 90, seedGrowth: 0,  pixelSort: 180 } },
  echo_bend:      { label: 'Echo Bend',      values: { bitShift: 25, dataOffset: 100, rgbSplit: 35, scanlines: 20, pathSort: 40, seedGrowth: 30, pixelSort: 160 } },
  equalizer:      { label: 'Equalizer',      values: { bitShift: 45, dataOffset: 55, rgbSplit: 25, scanlines: 60, pathSort: 60, seedGrowth: 40, pixelSort: 140 } },
  phaser_corrupt: { label: 'Phaser Corrupt', values: { bitShift: 35, dataOffset: 75, rgbSplit: 45, scanlines: 50, pathSort: 80, seedGrowth: 20, pixelSort: 220 } },
  hex_edit:       { label: 'Hex Edit',       values: { bitShift: 70, dataOffset: 95, rgbSplit: 50, scanlines: 10, pathSort: 100, seedGrowth: 50, pixelSort: 255 } }
};

export const GRID_EFFECTS = [
  { key: 'pixelflow', name: 'Pixel Flow' },
  { key: 'vortex',    name: 'Vortex' },
  { key: 'shatter',   name: 'Shatter' },
  { key: 'ripple',    name: 'Ripple' },
  { key: 'neon',      name: 'Neon Pulse' },
  { key: 'prism',     name: 'Prism Split' }
];

export const LEARNING_NOTES = {
  'mode:bend': { title: '7-Band Pixel Equalizer', origin: 'Databending Studio', amber: false, text: 'Drag any vertical silver fader up to bend raw pixel values. Hover any slider, grid pad, or hex byte to see how it works behind the scenes.' },
  'mode:grid': { title: '3x3 Spatial Grid', origin: 'Modular Video Synths', amber: false, text: 'Click or drag straight across the canvas to bend individual 3x3 regions, echoing patchable 1970s analog video mixers.' },
  'mode:hex':  { title: 'JPEG Hex Editor', origin: 'Binary File Surgery', amber: false, text: 'Every JPEG is a stream of bytes from 00 to FF. Hover any byte to cast the scanline probe and see its exact role inside the file.' },
  'mode:gif':  { title: 'Animated GIF89a', origin: 'CompuServe, 1987', amber: false, text: 'Records your active bends into a looping GIF89a file using a 256-color Median Cut palette and classic LZW compression.' },

  // 7 Classic Effects
  'classic:bitShift':   { title: 'Bit Shift', origin: 'Binary Bit-Wrapping', amber: false, text: 'Rotates the 0s and 1s inside each RGB color byte sideways, causing hues to jump and wrap like misread video RAM.' },
  'classic:dataOffset': { title: 'Offset', origin: 'Frame-Buffer Shift', amber: false, text: 'Slides raw pixel memory forward so scan rows shear out of sync, mimicking broken frame buffers and VHS tracking slip.' },
  'classic:rgbSplit':   { title: 'RGB Split', origin: 'Nam June Paik, 1965', amber: false, text: 'Separates red, green, and blue channels apart, recalling misaligned CRT electron beams from TV Magnet.' },
  'classic:scanlines':  { title: 'Scanlines', origin: 'Fenton & Zaritsky, 1978', amber: false, text: 'Darkens alternating horizontal lines with gentle signal drift, recreating how vintage CRT monitors painted row by row.' },
  'classic:pathSort':   { title: 'Path Sort', origin: 'Local Contour Spans', amber: false, text: 'Sorts pixels by brightness inside sliding horizontal tiles, turning sharp geometric edges into brushed woven bands.' },
  'classic:seedGrowth': { title: 'Seed Growth', origin: 'Highlight Blooming', amber: false, text: 'Finds bright highlight pixels as seeds and lets their color bleed outward across neighbors like overexposed phosphor.' },
  'classic:pixelSort':  { title: 'Pixel Sort', origin: 'Kim Asendorf, 2012', amber: false, text: 'Scans each row for runs below your brightness threshold and lines pixels up dark-to-light for painterly streaks.' },

  // 6 Grid Effects
  'grid:pixelflow': { title: 'Pixel Flow', origin: 'Vector Displacement', amber: false, text: 'Pushes pixels outward in smooth sine-wave currents inside each painted zone, like liquid drifting across glass.' },
  'grid:vortex':    { title: 'Vortex', origin: 'Polar Coordinates', amber: false, text: 'Twists pixels around the zone center using polar angle math, pulling straight geometry into a tight spiral.' },
  'grid:shatter':   { title: 'Shatter', origin: 'Fragment Offset', amber: false, text: 'Splits each active tile into jagged shards and shifts color channels along the edges like fractured prism glass.' },
  'grid:ripple':    { title: 'Ripple', origin: 'Radial Interference', amber: false, text: 'Radiates concentric sine waves outward from the tile center, curving straight lines like ripples across water.' },
  'grid:neon':      { title: 'Neon Pulse', origin: 'Luminance Bloom', amber: false, text: 'Boosts mid-tones and edges with a glowing gamma curve, mimicking overdriven cathode-ray phosphor tubes.' },
  'grid:prism':     { title: 'Prism Split', origin: 'Spectral Dispersion', amber: false, text: 'Samples red, green, and blue at three opposing radial angles around the zone center for optical glass fringes.' },

  // 12 Presets
  'preset:glitch':         { title: 'Glitch', origin: 'Classic Databend', amber: false, text: 'Combines bit-wrapping, memory shift, RGB channel separation, and pixel sorting for a classic digital glitch stack.' },
  'preset:wave':           { title: 'Wave', origin: 'Signal Drift', amber: false, text: 'Heavy frame offset and high-threshold sorting turn rigid shapes into sweeping horizontal wave bands.' },
  'preset:dissolve':       { title: 'Dissolve', origin: 'Bit Erosion', amber: false, text: 'Gentle bit shifting with low-threshold sorting breaks crisp edges into drifting eroded ribbons.' },
  'preset:chaos':          { title: 'Chaos', origin: 'Buffer Overload', amber: true, text: 'Drives bit-wrapping, offset, RGB split, and full-range sorting near maximum to overwhelm the original frame.' },
  'preset:analog_corrupt': { title: 'Analog Corrupt', origin: 'VHS & CRT Tape', amber: false, text: 'Layers dense CRT scanlines over row shear and RGB split, evoking worn magnetic tape on an old monitor.' },
  'preset:organic':        { title: 'Organic', origin: 'Contour + Bloom', amber: false, text: 'Blends local Path Sort tiles with Seed Growth bloom so digital glitches feel soft and painterly.' },
  'preset:audacity_pitch': { title: 'Audacity Pitch', origin: 'Audio Databending', amber: false, text: 'Early artists opened raw images as sound in Audacity and shifted pitch; stretching sound waves stretches rows too.' },
  'preset:bass_boost':     { title: 'Bass Boost', origin: 'Audio Databending', amber: false, text: 'Mimics running an audio Bass Boost filter on raw image data, inflating low-frequency color bands into heavy smears.' },
  'preset:echo_bend':      { title: 'Echo Bend', origin: 'Audio Databending', amber: false, text: 'Recalls applying an Audacity Echo filter to image bytes, repeating displaced ghost copies across the frame.' },
  'preset:equalizer':      { title: 'Equalizer', origin: 'Audio Databending', amber: false, text: 'Inspired by sculpting audio EQ bands directly on image files, lifting mid-tone ripples and raster lines.' },
  'preset:phaser_corrupt': { title: 'Phaser Corrupt', origin: 'Audio Databending', amber: false, text: 'Echoes running a stereo Phaser effect on raw pixels, sweeping phase shifts across channels and bright runs.' },
  'preset:hex_edit':       { title: 'Hex Edit', origin: 'Raw Binary Surgery', amber: true, text: 'Simulates aggressive raw file corruption across all seven classic bands, pushing pixels into abstract texture.' },

  // Clear Action Controls
  'btn:openPhoto':  { title: 'Open Photo', origin: '100% Local in Browser', amber: false, text: 'Switch between three high-contrast test artworks or load any image from your device. Nothing ever leaves your browser.' },
  'btn:compare':    { title: 'Compare Original', origin: 'Before & After', amber: false, text: 'Press and hold Compare, click the canvas, or hold Spacebar anytime to inspect the untouched original artwork.' },
  'btn:undo':       { title: 'Undo & Redo', origin: '25-Step History', amber: false, text: 'Step backward or forward through your recent slider, preset, grid, and hex edits anytime (Cmd/Ctrl+Z).' },
  'btn:save':       { title: 'Save Artwork', origin: 'PNG / JPEG / GIF', amber: false, text: 'Downloads a crisp PNG in Effects or Grid mode, raw mutated JPEG bytes in Hex mode, or an animated GIF in GIF Export.' },
  'btn:presets':    { title: 'Presets', origin: '12 Built-In + Saved', amber: false, text: 'Try 12 built-in databending recipes inspired by classic glitch art and Audacity tricks, or save your own locally.' },
  'btn:shuffle':    { title: 'Shuffle', origin: 'Chance Operations', amber: true, text: 'Rolls fresh random intensities across all seven equalizer faders, embracing the happy accidents of glitch art.' },
  'btn:resetFx':    { title: 'Reset Effects', origin: 'Clean Equalizer', amber: false, text: 'Zeroes all seven equalizer faders back to 0. Use Undo anytime if you want your previous mix back.' },
  'btn:bypass':     { title: 'Bypass Equalizer', origin: 'Signal Switch', amber: false, text: 'Temporarily switches off all seven equalizer bands without losing your fader levels, just like hardware audio EQ.' },
  'btn:gridClear':  { title: 'Clear Zones', origin: 'Spatial Reset', amber: false, text: 'Clears the active grid effect layer or wipes all six spatial layers across the 3x3 canvas.' },
  'btn:gridRand':   { title: 'Randomize Grid', origin: 'Chance Patching', amber: false, text: 'Randomly activates tiles across the 3x3 canvas for the selected spatial effect.' },

  // Audio Controls
  'audio:play':     { title: 'Image Sonifier', origin: 'Web Audio Synth', amber: false, text: 'Translates your bent pixels into live stereo sound: brighter pixels raise pitch and drive the glowing LCD spectrum.' },
  'audio:stop':     { title: 'Stop Audio', origin: 'Audio Only', amber: false, text: 'Stops sound playback and resets the audio playhead to 00:00 without touching any of your artwork settings.' },
  'audio:scrub':    { title: 'Audio Progress', origin: '6-Second Scan', amber: false, text: 'Shows playback position as the synthesizer scans your image top-to-bottom. Click or drag anywhere to seek.' },
  'audio:volume':   { title: 'Output Volume', origin: 'Master Gain', amber: false, text: 'Adjusts the output volume of the image sonifier and lights the ascending Winamp volume pips.' },
  'audio:spectrum': { title: 'Spectrum Analyzer', origin: 'Click to Cycle Style', amber: false, text: 'Displays live audio frequencies while playing or image luminance while idle. Click directly to cycle Bars, Mirror, and Wave.' },
  'audio:saveWav':  { title: 'Export Stereo WAV', origin: '16-Bit 44.1 kHz PCM', amber: false, text: 'Encodes your sonified image straight into an uncompressed 16-bit stereo RIFF/WAVE file in the browser, ready for any DAW or sampler.' },

  // Hex Controls
  'hex:lock':       { title: 'Header Lock', origin: 'JPEG Blueprint Shield', amber: false, text: 'Protects the JPEG file header and tables so edits only bend safe picture scan bytes. Turn off to risk real decode crashes.' },
  'hex:transpose':  { title: 'Transpose Bytes', origin: 'Entropy Chunk Swap', amber: false, text: 'Swaps two slices of compressed scan data, teleporting 8x8 color blocks and cascading hue shifts downward.' },
  'hex:invert':     { title: 'Invert Bits (XOR FF)', origin: 'Binary Flip', amber: true, text: 'Flips every 0 to 1 and 1 to 0 across a run of scan bytes for sharp high-contrast codec fractures.' },
  'hex:smear':      { title: 'Smear Repeat', origin: 'Echo Motif', amber: false, text: 'Repeats a 5-byte entropy motif down the bitstream, locking JPEG blocks into rhythmic diagonal bands.' },
  'hex:reset':      { title: 'Reset Bytes', origin: 'Clean JPEG Capture', amber: false, text: 'Restores every byte in the hex inspector back to the clean JPEG captured from the canvas.' },
  'hex:repair':     { title: 'Repair Header', origin: 'Blueprint Recovery', amber: true, text: 'Restores damaged JPEG header and end markers from backup while keeping all your wild scan-data glitches.' },

  // GIF Controls
  'gif:sweep':  { title: 'Sweep Animation', origin: 'Parameter Ramp', amber: false, text: 'Smoothly sweeps your active effects up to peak intensity and back down for a seamless looping GIF.' },
  'gif:pulse':  { title: 'Pulse Animation', origin: 'Sine Wave', amber: false, text: 'Breathes RGB split, scanlines, and row offsets smoothly along a sine wave for continuous rhythmic motion.' },
  'gif:drift':  { title: 'Hex Drift Animation', origin: 'Animated Byte Bend', amber: false, text: 'Slides a live mutation window through real JPEG scan bytes frame by frame, animating genuine codec glitches.' },
  'gif:strobe': { title: 'Strobe Animation', origin: 'Rhythmic Cuts', amber: true, text: 'Fires sharp bit-shift and offset accents on rhythmic frames, echoing cut-up experimental video art.' },
  'gif:frames': { title: 'Frame Count', origin: 'Loop Length (6-20)', amber: false, text: 'Sets how many frames make up one loop. More frames create smoother motion and a slightly larger file.' },
  'gif:fps':    { title: 'Playback Speed', origin: '4 to 20 FPS', amber: false, text: 'Writes frame timing directly into the GIF89a header, from slow contemplative drift to fast flicker.' },
  'gif:export': { title: 'Pure-JS GIF89a Encoder', origin: '256-Color + LZW', amber: false, text: 'Quantizes frames to 256 colors with Median Cut, compresses with LZW, and downloads a looping NETSCAPE2.0 .gif.' }
};

export const JPEG_SEG_NOTES = {
  [SEG_SOI]:   { title: 'SOI Marker (FF D8)', origin: 'Start of Image', amber: false, text: 'Start of Image: these first two signature bytes tell every browser a valid JPEG file begins right here.' },
  [SEG_APP]:   { title: 'APP Header (FF E0)', origin: 'File Metadata', amber: false, text: 'Stores JFIF format labels, pixel density, and color metadata before the compression tables begin.' },
  [SEG_DQT]:   { title: 'DQT Table (FF DB)', origin: 'Quantization Table', amber: true, text: 'Quantization Table: sets how aggressively fine detail is compressed. Tweaking here warps block contrast globally.' },
  [SEG_SOF]:   { title: 'SOF0 Frame (FF C0)', origin: 'Image Dimensions', amber: true, text: 'Start of Frame: declares pixel width, height, and color channels. Editing here breaks decoding when Header Lock is off.' },
  [SEG_DHT]:   { title: 'DHT Table (FF C4)', origin: 'Huffman Codebook', amber: true, text: 'Huffman Table: the bit dictionary turning compressed symbols back into 8x8 color blocks.' },
  [SEG_SOS]:   { title: 'SOS Header (FF DA)', origin: 'Start of Scan', amber: false, text: 'Start of Scan: announces that setup tables are done and live compressed picture bytes start on the next byte.' },
  [SEG_SCAN]:  { title: 'Scan Data (Picture)', origin: 'Editable Entropy Bytes', amber: false, text: 'Compressed 8x8 picture blocks. Editing one byte here safely ripples color shifts and tears down the image.' },
  [SEG_EOI]:   { title: 'EOI Marker (FF D9)', origin: 'End of Image', amber: true, text: 'End of Image: the closing two-byte seal telling the browser the compressed JPEG bitstream is finished.' },
  [SEG_OTHER]: { title: 'JPEG Marker Byte', origin: 'Header Segment', amber: false, text: 'Structural marker byte inside the JPEG file header before compressed image scan data begins.' }
};
