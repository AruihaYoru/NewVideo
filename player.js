/**
 * player.js (v4.0.0 "Final Cut")
 * Fully-featured MRV player with keyboard shortcuts and restored UI controls.
 * This version contains the complete, unminified source code for all classes.
 *
 * This script is structured using ES6 classes to separate concerns:
 * - WebGLRenderer: Manages all WebGL-related tasks.
 * - MRVParser: Handles the parsing of the binary .mrv file format.
 * - MRVPlayer: The main controller, orchestrating UI, state, and other modules.
 *
 * @version 4.0.0
 * @author A different programmer (for the last time)
 */
'use strict';

/**
 * @class WebGLRenderer
 * Manages all WebGL rendering operations for the player. Encapsulates shader
 * compilation, buffer management, and texture handling.
 */
class WebGLRenderer {
    /**
     * @param {HTMLCanvasElement} canvas The canvas element to render to.
     */
    constructor(canvas) {
        this.canvas = canvas;
        /** @type {WebGLRenderingContext} */
        this.gl = this.canvas.getContext('webgl');

        if (!this.gl) {
            throw new Error('WebGL is not supported in this browser.');
        }

        /** @type {WebGLProgram} */
        this.program = null;
        /** @type {Object<string, number|WebGLUniformLocation>} */
        this.locations = {};
        /** @type {Object<string, WebGLTexture>} */
        this.textures = {};
    }

    /**
     * Initializes the WebGL context, shaders, program, and buffers.
     */
    init() {
        const vsSource = `
            attribute vec4 a_position;
            attribute vec2 a_texcoord;
            varying vec2 v_texcoord;
            void main() {
                gl_Position = a_position;
                v_texcoord = a_texcoord;
            }`;

        const fsSource = `
            precision mediump float;
            varying vec2 v_texcoord;
            uniform sampler2D u_pixel_texture;
            uniform sampler2D u_palette_texture;
            void main() {
                float paletteIndex = texture2D(u_pixel_texture, v_texcoord).r * 255.0;
                vec2 paletteCoord = vec2((paletteIndex + 0.5) / 256.0, 0.5);
                gl_FragColor = texture2D(u_palette_texture, paletteCoord);
            }`;

        this.program = this._createProgram(vsSource, fsSource);
        this.gl.useProgram(this.program);

        this._getLocations();
        this._setupBuffers();
        this._setupTextures();
    }

    /**
     * Renders a frame using the provided pixel and palette data.
     */
    render(pixelData, paletteData, width, height) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.textures.palette);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 256, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, paletteData);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textures.pixel);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixelData);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    
    /**
     * Resizes the canvas element and the WebGL viewport.
     */
    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
    }

    _getLocations() {
        this.locations = {
            position: this.gl.getAttribLocation(this.program, 'a_position'),
            texcoord: this.gl.getAttribLocation(this.program, 'a_texcoord'),
            pixelTexture: this.gl.getUniformLocation(this.program, 'u_pixel_texture'),
            paletteTexture: this.gl.getUniformLocation(this.program, 'u_palette_texture'),
        };
    }

    _setupBuffers() {
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const texcoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
        this._createBuffer(positions, this.locations.position, 2);
        this._createBuffer(texcoords, this.locations.texcoord, 2);
    }

    _createBuffer(data, location, size) {
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, data, this.gl.STATIC_DRAW);
        this.gl.enableVertexAttribArray(location);
        this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, 0, 0);
        return buffer;
    }

    _setupTextures() {
        this.textures.pixel = this._createTexture();
        this.textures.palette = this._createTexture();
        this.gl.uniform1i(this.locations.pixelTexture, 0);
        this.gl.uniform1i(this.locations.paletteTexture, 1);
    }

    _createTexture() {
        const texture = this.gl.createTexture();
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        return texture;
    }
    
    _createProgram(vsSource, fsSource) {
        const vertexShader = this._compileShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this._compileShader(this.gl.FRAGMENT_SHADER, fsSource);
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            throw new Error('Failed to link shader program: ' + this.gl.getProgramInfoLog(program));
        }
        return program;
    }

    _compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            const error = 'Failed to compile shader: ' + this.gl.getShaderInfoLog(shader);
            this.gl.deleteShader(shader);
            throw new Error(error);
        }
        return shader;
    }
}

/**
 * @class MRVParser
 * Handles parsing of the MRV binary format from a zip-compressed file.
 */
class MRVParser {
    async parse(file, onOverallProgress) { // Renamed callback for clarity
        const updateOverallProgress = (percent, message) => {
            if (onOverallProgress) onOverallProgress(percent, message);
        };

        // --- Stage 1: Load ArrayBuffer from file (initial unzipping) ---
        updateOverallProgress(0, 'Unzipping MRV file...');
        const zip = await JSZip.loadAsync(await file.arrayBuffer());

        const dataFile = zip.file('data.bin');
        if (!dataFile) {
            throw new Error('Invalid MRV file: "data.bin" not found.');
        }

        // --- Stage 2: Read data.bin ArrayBuffer from JSZip ---
        updateOverallProgress(5, 'Reading compressed data...'); // Starting at 5% for this stage
        const buffer = await dataFile.async('arraybuffer', (metadata) => {
            // Map 0-100% of this stage to 5-85% of overall progress
            updateOverallProgress(5 + metadata.percent * 0.8, 'Reading compressed data...');
        });

        // --- Stage 3: Parse binary data ---
        // This stage occupies 85% to 99% of overall progress
        const videoData = this._parseBinary(buffer, (parsePercent, parseMessage) => {
            // Map 0-100% of this stage to 85-99% of overall progress
            updateOverallProgress(85 + parsePercent * 0.14, parseMessage);
        });

        updateOverallProgress(99, 'Finalizing data...'); // Small buffer before 100%
        // Add a small delay for the "Finalizing" message to be readable
        await new Promise(resolve => setTimeout(resolve, 50)); 

        updateOverallProgress(100, 'Load complete!');
        return videoData;
    }
    
    _parseBinary(buffer, onParseProgress) { // Callback for detailed parsing progress
        const view = new DataView(buffer);
        let offset = 0;
        
        // --- Header ---
        onParseProgress(0, 'Reading header (width, height, fps)...');
        const width = view.getUint16(offset, true); offset += 2;
        const height = view.getUint16(offset, true); offset += 2;
        const fps = view.getUint8(offset, true); offset += 1;
        const numPixels = width * height;
        const frames = [];

        // Pre-calculate total frames for accurate progress (requires full scan)
        onParseProgress(0.5, 'Counting total frames...');
        const totalFrames = this._calculateTotalFrames(buffer, width, height);
        onParseProgress(1, `Total frames: ${totalFrames}. Starting frame parsing.`);

        let currentFrameIndex = 0;

        // --- Frames ---
        while (offset < buffer.byteLength) {
            const marker = view.getUint8(offset, true); offset += 1;
            
            // Calculate progress for the parsing stage (0-100 for this stage)
            const currentParsePercent = (currentFrameIndex / totalFrames) * 100;
            // Ensure 100% is only reported at the very end
            const limitedParsePercent = Math.min(99.9, currentParsePercent); 

            if (marker === 0xFF) { // I-Frame
                onParseProgress(limitedParsePercent, `Processing I-frame ${currentFrameIndex}/${totalFrames} (palette & ${numPixels} pixels)...`);
                const palette = new Uint8Array(buffer, offset, 768); offset += 768; // Palette: 256 * 3 bytes
                const pixels = new Uint8Array(buffer, offset, numPixels); offset += numPixels; // Pixels: width * height bytes
                frames.push({ type: 'I', palette, pixels });
            } else if (marker === 0xFE) { // P-Frame
                const deltaCount = view.getUint32(offset, true); offset += 4; // Delta count: 4 bytes
                onParseProgress(limitedParsePercent, `Processing P-frame ${currentFrameIndex}/${totalFrames} (${deltaCount} deltas)...`);
                const deltas = new Array(deltaCount);
                for (let i = 0; i < deltaCount; i++) {
                    const pIdx = view.getUint8(offset, true); offset += 1; // pIdx: 1 byte
                    const idx = view.getUint32(offset, true); offset += 4; // idx: 4 bytes
                    deltas[i] = { pIdx, idx };
                }
                frames.push({ type: 'P', deltas });
            } else {
                console.warn(`Unknown marker 0x${marker.toString(16)} at offset ${offset - 1}. Stopping parsing.`);
                onParseProgress(limitedParsePercent, `Error: Unknown marker 0x${marker.toString(16)}! Stopping.`);
                break;
            }
            currentFrameIndex++;
        }
        onParseProgress(100, 'Binary parsing complete.');
        return { width, height, fps, frames };
    }

    /**
     * Helper to pre-scan the buffer and calculate the total number of frames.
     * This is necessary for accurate percentage progress during frame parsing.
     */
    _calculateTotalFrames(buffer, width, height) {
        let tempOffset = 0;
        const tempView = new DataView(buffer);
        tempOffset += 5; // Skip header (2 bytes width, 2 bytes height, 1 byte fps)
        let frameCount = 0;
        const numPixels = width * height;

        while (tempOffset < buffer.byteLength) {
            // Check if there's enough bytes to read the marker
            if (tempOffset + 1 > buffer.byteLength) {
                // console.warn("Buffer ended unexpectedly while looking for marker.");
                break;
            }
            const marker = tempView.getUint8(tempOffset, true); tempOffset += 1;

            if (marker === 0xFF) { // I-Frame
                // Check if there's enough bytes for palette and pixels
                if (tempOffset + 768 + numPixels > buffer.byteLength) {
                    // console.warn(`Buffer ended unexpectedly within I-frame at offset ${tempOffset - 1}.`);
                    break;
                }
                tempOffset += 768; // palette (256 * 3 bytes)
                tempOffset += numPixels; // pixels (width * height bytes)
                frameCount++;
            } else if (marker === 0xFE) { // P-Frame
                // Check if there's enough bytes for deltaCount
                if (tempOffset + 4 > buffer.byteLength) {
                    // console.warn(`Buffer ended unexpectedly while reading deltaCount at offset ${tempOffset - 1}.`);
                    break;
                }
                const deltaCount = tempView.getUint32(tempOffset, true); tempOffset += 4; // Delta count (4 bytes)
                // Check if there's enough bytes for all deltas
                if (tempOffset + deltaCount * (1 + 4) > buffer.byteLength) {
                    // console.warn(`Buffer ended unexpectedly within P-frame deltas at offset ${tempOffset - 1}. Expected ${deltaCount} deltas.`);
                    break;
                }
                tempOffset += deltaCount * (1 + 4); // pIdx (1 byte) + idx (4 bytes) per delta
                frameCount++;
            } else {
                // console.warn(`Unknown marker 0x${marker.toString(16)} at offset ${tempOffset - 1}. Stopping frame count.`);
                break; // Unknown marker, stop counting
            }
        }
        return frameCount;
    }
}

/**
 * @class MRVPlayer
 * The main player class that orchestrates UI, parsing, state, and rendering.
 */
class MRVPlayer {
    constructor(rootEl) {
        this.dom = {
            root: rootEl,
            dropZone: rootEl.querySelector('#drop-zone'),
            fileInput: rootEl.querySelector('#file-input'),
            progressContainer: rootEl.querySelector('#load-progress-container'),
            progressBar: rootEl.querySelector('#load-progress-bar'),
            loadLog: rootEl.querySelector('#load-log'),
            playerContainer: rootEl.querySelector('#player-container'),
            canvas: rootEl.querySelector('#video-canvas'),
            playPauseBtn: document.getElementById('play-pause-btn'),
            sidePanels: document.getElementById('side-panels-container'),
            debugVars: document.getElementById('debug-vars'),
            debugDeltas: document.getElementById('debug-deltas'),
            consoleInfo: document.getElementById('console-info'),
            fpsSlider: document.getElementById('fps-slider'),
            fpsValue: document.getElementById('fps-value'),
            rotateSlider: document.getElementById('rotate-slider'),
            rotateValue: document.getElementById('rotate-value'),
        };
        
        this.icons = {
            play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`,
            pause: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`,
        };

        this.state = {};
        this.prevState = {};
        this.videoData = null;
        this.pixelBuffer = null;
        this.paletteBuffer = null;
        this.animationFrameId = null;
        this.lastFrameTime = 0;

        this.renderer = new WebGLRenderer(this.dom.canvas);
        this.parser = new MRVParser();
    }

    init() {
        try {
            this.renderer.init();
            this._setupEventListeners();
            this._resetState();
            this.dom.playPauseBtn.innerHTML = this.icons.play;
            console.log('MRV Player v4 initialized.');
        } catch (error) {
            console.error('Initialization failed:', error);
            this.dom.root.innerHTML = `<p style="color: #f88; text-align: center;">Error: ${error.message}</p>`;
        }
    }

    async load(file) {
        this.pause();
        this._resetUI();
        this.dom.progressContainer.classList.remove('hidden');
        this.dom.loadLog.classList.remove('hidden');

        const progressCallback = (percent, message) => {
            this.dom.progressBar.style.width = `${percent}%`;
            this.dom.loadLog.textContent = `${message} (${Math.round(percent)}%)`;
        };
        
        try {
            this.videoData = await this.parser.parse(file, progressCallback);
            progressCallback(100, 'Initializing player...');
            
            await new Promise(resolve => setTimeout(resolve, 300));

            this._preparePlayback();
            this._switchToPlayerView();
            this.play();
        } catch (error) {
            console.error('Failed to load MRV file:', error);
            alert(`Error loading file: ${error.message}`);
            this._resetUI();
            this.dom.loadLog.classList.remove('hidden');
            this.dom.loadLog.style.color = '#f88'; // Red color for error
            this.dom.loadLog.textContent = `Error: ${error.message}`;
        }
    }

    play() {
        if (this.state.isPlaying || !this.videoData) return;
        this.state.isPlaying = true;
        this.dom.playPauseBtn.innerHTML = this.icons.pause;
        this.lastFrameTime = performance.now();
        this.animationFrameId = requestAnimationFrame(this._tick.bind(this));
    }

    pause() {
        if (!this.state.isPlaying) return;
        this.state.isPlaying = false;
        this.dom.playPauseBtn.innerHTML = this.icons.play;
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }

    _resetState() {
        this.state = {
            isPlaying: false,
            currentFrame: 0,
            playbackRate: 1.0,
            transform: { scale: 1, translateX: 0, translateY: 0, rotation: 0 },
            isDragging: false,
            lastDragPos: { x: 0, y: 0 },
        };
    }
    
    _resetUI() {
        this.dom.playerContainer.classList.add('hidden');
        this.dom.sidePanels.classList.add('hidden');
        this.dom.dropZone.classList.remove('hidden');
        this.dom.progressContainer.classList.add('hidden');
        this.dom.loadLog.classList.add('hidden');
        this.dom.progressBar.style.width = '0%';
        this.dom.loadLog.textContent = '';
        this.dom.loadLog.style.color = ''; // Reset color
    }

    _preparePlayback() {
        this._resetState();
        this._updateConsoleUI();
        this.renderer.resize(this.videoData.width, this.videoData.height);
        this.pixelBuffer = new Uint8Array(this.videoData.width * this.videoData.height);
        this.paletteBuffer = new Uint8Array(768);
        this._updateFrameData(0);
        this.dom.consoleInfo.innerHTML = `<span>${this.videoData.width}x${this.videoData.height}</span> | <span>${this.videoData.frames.length} frames</span>`;
    }
    
    _switchToPlayerView() {
        this.dom.dropZone.classList.add('hidden');
        this.dom.playerContainer.classList.remove('hidden');
        this.dom.sidePanels.classList.remove('hidden');
    }

    _tick(timestamp) {
        if (!this.state.isPlaying) return;

        const frameInterval = (1000 / this.videoData.fps) / this.state.playbackRate;
        const elapsed = timestamp - this.lastFrameTime;

        if (elapsed >= frameInterval) {
            this.lastFrameTime = timestamp - (elapsed % frameInterval);
            this.renderer.render(this.pixelBuffer, this.paletteBuffer, this.videoData.width, this.videoData.height);
            this.state.currentFrame = (this.state.currentFrame + 1) % this.videoData.frames.length;
            this._updateFrameData(this.state.currentFrame);
        }
        this._updateDebugInfo();
        this.animationFrameId = requestAnimationFrame(this._tick.bind(this));
    }

    _updateFrameData(frameIndex) {
        const frame = this.videoData.frames[frameIndex];
        if (frame.type === 'I') {
            this.paletteBuffer.set(frame.palette);
            this.pixelBuffer.set(frame.pixels);
        } else {
            for (const delta of frame.deltas) {
                this.pixelBuffer[delta.idx] = delta.pIdx;
            }
        }
        this._updateDeltaDebug(frame);
    }
    
    _seek(delta) {
        if (!this.videoData) return;
        this.pause();
        const totalFrames = this.videoData.frames.length;
        this.state.currentFrame = (this.state.currentFrame + delta + totalFrames) % totalFrames;
        this._updateFrameData(this.state.currentFrame);
        this.renderer.render(this.pixelBuffer, this.paletteBuffer, this.videoData.width, this.videoData.height);
        this._updateDebugInfo();
    }

    _updateDebugInfo() {
        if (!this.videoData) return; // Prevent error on first load
        const debugData = {
            Frame: `${this.state.currentFrame} / ${this.videoData.frames.length}`,
            Playing: this.state.isPlaying,
            Scale: this.state.transform.scale.toFixed(2),
            TranslateX: `${this.state.transform.translateX.toFixed(0)}px`,
            TranslateY: `${this.state.transform.translateY.toFixed(0)}px`,
            Rotation: `${this.state.transform.rotation}°`,
        };
        
        let html = '';
        for (const key in debugData) {
            const value = debugData[key];
            const prevValue = this.prevState[key];
            const highlightClass = value !== prevValue ? 'highlight' : '';
            html += `<div><span>${key}</span><span class="${highlightClass}">${value}</span></div>`;
        }
        this.dom.debugVars.innerHTML = html;
        const highlighted = this.dom.debugVars.querySelectorAll('.highlight');
        if (highlighted.length > 0) {
            setTimeout(() => highlighted.forEach(el => el.classList.remove('highlight')), 200);
        }
        this.prevState = { ...debugData };
    }

    _updateDeltaDebug(frame) {
        const frag = document.createDocumentFragment();
        const header = document.createElement('li');
        
        if (frame.type === 'I') {
            header.textContent = `I-FRAME: Full Refresh`;
            frag.appendChild(header);
        } else {
            header.textContent = `P-FRAME: ${frame.deltas.length} pixels changed`;
            frag.appendChild(header);

            const deltasToShow = frame.deltas.slice(0, 100);
            for (const delta of deltasToShow) {
                const x = delta.idx % this.videoData.width;
                const y = Math.floor(delta.idx / this.videoData.width);
                const colorIdx = delta.pIdx * 3;
                const r = this.paletteBuffer[colorIdx];
                const g = this.paletteBuffer[colorIdx + 1];
                const b = this.paletteBuffer[colorIdx + 2];
                const hex = `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
                const li = document.createElement('li');
                li.innerHTML = `
                    <div class="color-swatch" style="background-color: ${hex}"></div>
                    <span class="delta-info">@(${x}, ${y}) → ${hex}</span>
                `;
                frag.appendChild(li);
            }
        }
        this.dom.debugDeltas.innerHTML = '';
        this.dom.debugDeltas.appendChild(frag);
    }
    
    _setupEventListeners() {
        const dz = this.dom.dropZone;
        dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
        dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
        dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); if (e.dataTransfer.files.length) this.load(e.dataTransfer.files[0]); });
        dz.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.fileInput.addEventListener('change', e => { if (e.target.files.length) this.load(e.target.files[0]); });
        
        this.dom.playPauseBtn.addEventListener('click', () => this.state.isPlaying ? this.pause() : this.play());
        this.dom.fpsSlider.addEventListener('input', e => { this.state.playbackRate = parseFloat(e.target.value); this._updateConsoleUI(); });
        this.dom.rotateSlider.addEventListener('input', e => { this.state.transform.rotation = parseInt(e.target.value, 10); this._updateConsoleUI(); });

        const pc = this.dom.playerContainer;
        pc.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = pc.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const mouseOnCanvasX = (mouseX - this.state.transform.translateX) / this.state.transform.scale;
            const mouseOnCanvasY = (mouseY - this.state.transform.translateY) / this.state.transform.scale;
            const scaleAmount = 1 - e.deltaY * 0.001;
            const newScale = Math.max(0.1, Math.min(20, this.state.transform.scale * scaleAmount));
            this.state.transform.translateX = mouseX - mouseOnCanvasX * newScale;
            this.state.transform.translateY = mouseY - mouseOnCanvasY * newScale;
            this.state.transform.scale = newScale;
            this._updateCanvasTransform();
        }, { passive: false });
        
        pc.addEventListener('mousedown', e => {
            this.state.isDragging = true;
            this.state.lastDragPos = { x: e.clientX, y: e.clientY };
        });
        window.addEventListener('mousemove', e => {
            if (!this.state.isDragging) return;
            const dx = e.clientX - this.state.lastDragPos.x;
            const dy = e.clientY - this.state.lastDragPos.y;
            this.state.transform.translateX += dx;
            this.state.transform.translateY += dy;
            this.state.lastDragPos = { x: e.clientX, y: e.clientY };
            this._updateCanvasTransform();
        });
        window.addEventListener('mouseup', () => { this.state.isDragging = false; });

        window.addEventListener('keydown', this._handleKeyDown.bind(this));
    }
    
    _handleKeyDown(e) {
        if (e.target.tagName === 'INPUT') return; // Do not interfere with text inputs
        if (!this.videoData) return;

        if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
            e.preventDefault();
        }

        switch(e.code) {
            case 'Space':
                this.state.isPlaying ? this.pause() : this.play();
                break;
            case 'ArrowRight':
                this._seek(1);
                break;
            case 'ArrowLeft':
                this._seek(-1);
                break;
            case 'ArrowUp':
                this.state.playbackRate = Math.min(4.0, this.state.playbackRate + 0.1);
                this._updateConsoleUI();
                break;
            case 'ArrowDown':
                this.state.playbackRate = Math.max(0.1, this.state.playbackRate - 0.1);
                this._updateConsoleUI();
                break;
            case 'BracketRight':
                {
                    let newRotation = this.state.transform.rotation + 5;
                    if (newRotation > 180) newRotation -= 360;
                    this.state.transform.rotation = newRotation;
                }
                this._updateConsoleUI();
                break;
            case 'BracketLeft':
                {
                    let newRotation = this.state.transform.rotation - 5;
                    if (newRotation < -180) newRotation += 360;
                    this.state.transform.rotation = newRotation;
                }
                this._updateConsoleUI();
                break;
            case 'KeyR':
                this.state.transform.rotation = 0;
                this._updateConsoleUI();
                break;
            case 'KeyF':
                this.state.transform.scale = 1;
                this.state.transform.translateX = 0;
                this.state.transform.translateY = 0;
                this._updateCanvasTransform();
                break;
        }
    }
    
    _updateConsoleUI() {
        this.dom.fpsSlider.value = this.state.playbackRate;
        this.dom.fpsValue.textContent = `${this.state.playbackRate.toFixed(1)}x`;
        this.dom.rotateSlider.value = this.state.transform.rotation;
        this.dom.rotateValue.textContent = `${this.state.transform.rotation}°`;
        this._updateCanvasTransform();
    }
    
    _updateCanvasTransform() {
        const { translateX, translateY, scale, rotation } = this.state.transform;
        this.dom.canvas.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotation}deg)`;
    }
}

// --- Entry Point ---
document.addEventListener('DOMContentLoaded', () => {
    const playerAppRoot = document.getElementById('app');
    if (playerAppRoot) {
        new MRVPlayer(playerAppRoot).init();
    } else {
        console.error('Player application root element "#app" not found.');
    }
});