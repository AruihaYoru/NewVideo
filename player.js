// --- グローバル設定と状態 ---
const DEBUG_HIGHLIGHT_COLOR = [0.0, 1.0, 0.0, 1.0];
const FONT_ATLAS_CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

let gl;
let appState = {
    // 再生情報
    isPlaying: false,
    isLoaded: false,
    startTime: 0,
    currentFrame: 0,
    lastFrameTime: 0,
    fps: 0,
    // ファイルデータ
    fileBuffer: null,
    dataView: null,
    frameOffsets: [],
    // メタデータ
    metadata: {
        width: 0,
        height: 0,
        fps: 24,
        totalFrames: 0,
    },
    // 現在のフレーム状態
    currentPalette: new Uint8Array(256 * 3),
    currentCharacterData: null,
    isKeyFrame: true,
    diffDataCount: 0,
    // WebGLリソース
    program: null,
    buffers: {},
    textures: {},
    uniforms: {},
    attributes: {},
    // デバッグ関連
    debug: {
        isVisible: false,
        highlightDiffs: false,
        lastFrameUpdatedIndices: new Set(),
    },
    // ユーティリティ
    fontAtlasMap: new Map(),
    // インタラクション(ズーム/パン)関連
    transform: {
        x: 0, y: 0, scale: 1.0,
        isDragging: false, lastX: 0, lastY: 0,
        lastPinchDist: 0,
    },
};

// --- 初期化 ---
window.onload = () => {
    initEventListeners();
    for (let i = 0; i < FONT_ATLAS_CHARS.length; i++) {
        appState.fontAtlasMap.set(FONT_ATLAS_CHARS[i], i);
    }
};

// --- ファイル処理 ---
async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const progressBarContainer = document.getElementById('progress-bar-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    progressBarContainer.style.display = 'block';
    progressText.textContent = 'Unzipping...';
    try {
        const zip = await new JSZip().loadAsync(file);
        const abinFile = zip.file('movie.abin');
        if (!abinFile) throw new Error('movie.abin not found in the zip file.');
        appState.fileBuffer = await abinFile.async('arraybuffer', (metadata) => {
            const percent = metadata.percent.toFixed(0);
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `Loading binary data... ${percent}%`;
        });
        appState.dataView = new DataView(appState.fileBuffer);
        document.getElementById('upload-prompt').style.display = 'none';
        document.getElementById('gl-canvas').style.display = 'block';
        parseAndStartIndex();
        initWebGL();
        appState.isLoaded = true;
        resetTransform(true);
        startPlayback();
    } catch (error) {
        console.error('Error processing file:', error);
        alert('Error: ' + error.message);
        progressBarContainer.style.display = 'none';
        progressText.textContent = '';
    }
}

// --- バイナリ解析 ---
function parseAndStartIndex() {
    console.log("Parsing file header and indexing frames...");
    const magic = String.fromCharCode(...new Uint8Array(appState.fileBuffer, 0, 4));
    if (magic !== 'ASCI') throw new Error('Invalid file format.');
    appState.metadata.width = appState.dataView.getUint16(6, true);
    appState.metadata.height = appState.dataView.getUint16(8, true);
    appState.metadata.fps = appState.dataView.getUint16(10, true);
    appState.metadata.totalFrames = appState.dataView.getUint32(12, true);
    appState.currentCharacterData = new Uint8Array(appState.metadata.width * appState.metadata.height * 2);
    let offset = 16;
    appState.frameOffsets = [];
    for (let i = 0; i < appState.metadata.totalFrames; i++) {
        if (offset >= appState.fileBuffer.byteLength) { console.warn(`Reached end of file prematurely while indexing. Found ${i} frames out of ${appState.metadata.totalFrames}`); appState.metadata.totalFrames = i; break; }
        appState.frameOffsets.push(offset);
        const frameType = appState.dataView.getUint8(offset); offset += 1;
        if (frameType === 0) { offset += 256 * 3; offset += appState.metadata.width * appState.metadata.height * 2; }
        else { const diffCount = appState.dataView.getUint32(offset, true); offset += 4; offset += diffCount * 6; }
    }
    console.log('File indexed:', appState.metadata);
}

// --- デコード処理 ---
function decodeFrame(frameIndex) {
    if (frameIndex >= appState.metadata.totalFrames) return;
    let offset = appState.frameOffsets[frameIndex];
    const frameType = appState.dataView.getUint8(offset); offset++;
    appState.isKeyFrame = (frameType === 0);
    appState.debug.lastFrameUpdatedIndices.clear();
    if (appState.isKeyFrame) {
        appState.currentPalette.set(new Uint8Array(appState.fileBuffer, offset, 256 * 3)); offset += 256 * 3;
        const totalChars = appState.metadata.width * appState.metadata.height;
        for (let i = 0; i < totalChars; i++) {
            const asciiCode = appState.dataView.getUint8(offset + i * 2); const paletteIndex = appState.dataView.getUint8(offset + i * 2 + 1);
            const char = String.fromCharCode(asciiCode); const atlasIndex = appState.fontAtlasMap.get(char) || 0;
            appState.currentCharacterData[i * 2] = atlasIndex; appState.currentCharacterData[i * 2 + 1] = paletteIndex;
        }
        appState.diffDataCount = totalChars;
        updatePaletteTexture(appState.currentPalette); updateCharacterVBO(appState.currentCharacterData);
    } else {
        const diffCount = appState.dataView.getUint32(offset, true); offset += 4;
        appState.diffDataCount = diffCount;
        for (let i = 0; i < diffCount; i++) {
            const asciiCode = appState.dataView.getUint8(offset); const paletteIndex = appState.dataView.getUint8(offset + 1); const screenIndex = appState.dataView.getUint32(offset + 2, true); offset += 6;
            if (screenIndex < appState.metadata.width * appState.metadata.height) {
                const char = String.fromCharCode(asciiCode); const atlasIndex = appState.fontAtlasMap.get(char) || 0;
                appState.currentCharacterData[screenIndex * 2] = atlasIndex; appState.currentCharacterData[screenIndex * 2 + 1] = paletteIndex;
                appState.debug.lastFrameUpdatedIndices.add(screenIndex);
            }
        }
        updateCharacterVBOSub(appState.currentCharacterData);
    }
}


// --- 再生ループ ---
function startPlayback() {
    console.log("Preparing first frame and starting playback...");
    appState.currentFrame = 0; decodeFrame(0); drawScene();
    appState.isPlaying = true; appState.startTime = performance.now(); appState.lastFrameTime = appState.startTime;
    requestAnimationFrame(renderLoop);
}

function renderLoop(timestamp) {
    if (!appState.isPlaying) return;

    // requestAnimationFrameを最初に呼ぶことで、ループが途切れないことを保証
    requestAnimationFrame(renderLoop);
    
    const elapsed = timestamp - appState.startTime;
    const targetFrame = Math.floor(elapsed / (1000 / appState.metadata.fps));

    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    // ★ これが完璧なループ処理です ★
    // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
    if (targetFrame >= appState.metadata.totalFrames) {
        console.log("Playback finished. Looping...");
        
        // 1. タイマーを現在の時刻でリセット
        appState.startTime = timestamp;
        
        // 2. 現在のフレームを0に戻す
        appState.currentFrame = 0;
        
        // 3. フレーム0のデータをデコード
        decodeFrame(0);
        
        // 4. 即座にフレーム0を描画
        drawScene();
        
        // 5. このrenderLoopの処理を終了し、次のフレームでの再開を待つ
        return; 
    }
    
    if (targetFrame > appState.currentFrame) {
        appState.currentFrame = targetFrame;
        decodeFrame(appState.currentFrame);
    }
    
    const delta = timestamp - appState.lastFrameTime; appState.fps = 1000 / delta; appState.lastFrameTime = timestamp;
    if (appState.debug.isVisible) updateDebugPanel();
    
    drawScene();
}


// --- デバッグ機能 ---
function updateDebugPanel() {
    document.getElementById('playback-info').textContent = `
Frame: ${appState.currentFrame} / ${appState.metadata.totalFrames}
Time : ${(appState.currentFrame / appState.metadata.fps).toFixed(2)}s
FPS  : ${appState.fps.toFixed(1)}
Mode : ${appState.isKeyFrame ? 'KEYFRAME' : 'Diff Frame'}`;

    document.getElementById('binary-info').textContent = `
File Size  : ${(appState.fileBuffer.byteLength / 1024 / 1024).toFixed(2)} MB
Resolution : ${appState.metadata.width}x${appState.metadata.height} (${appState.metadata.width * appState.metadata.height} chars)
Diffs      : ${appState.diffDataCount}`;

    document.getElementById('rendering-info').textContent = `
Draw Calls : 1
Zoom Level : ${appState.transform.scale.toFixed(2)}x
Debug Mode : Highlight Diffs (${appState.debug.highlightDiffs ? 'ON' : 'OFF'} - 'h' key)`;

    const paletteContainer = document.getElementById('palette-container');
    if (appState.isKeyFrame || paletteContainer.childElementCount === 0) {
        paletteContainer.innerHTML = '';
        for (let i = 0; i < 256; i++) {
            const colorDiv = document.createElement('div');
            colorDiv.className = 'palette-color';
            const r = appState.currentPalette[i * 3];
            const g = appState.currentPalette[i * 3 + 1];
            const b = appState.currentPalette[i * 3 + 2];
            colorDiv.style.backgroundColor = `rgb(${r},${g},${b})`;
            paletteContainer.appendChild(colorDiv);
        }
    }
}

function setupMouseOver() {
    const canvas = document.getElementById('gl-canvas');
    const infoBox = document.getElementById('mouseover-info');

    // canvasの親要素を基準にマウス座標を取得
    const parent = canvas.parentElement;

    parent.addEventListener('mousemove', (e) => {
        if (!appState.debug.isVisible || !appState.currentCharacterData) {
            infoBox.style.display = 'none';
            return;
        }

        const t = appState.transform;
        
        // 親要素からのマウス座標を取得
        const parentRect = parent.getBoundingClientRect();
        const mouseX = e.clientX - parentRect.left;
        const mouseY = e.clientY - parentRect.top;
        
        // マウス座標を、スケールとパンが適用されたキャンバス上の座標に変換
        const canvasX = (mouseX - t.x) / t.scale;
        const canvasY = (mouseY - t.y) / t.scale;

        // キャンバス上の座標をグリッド座標に変換
        const gridX = Math.floor(canvasX);
        const gridY = Math.floor(canvasY);
        
        if (gridX < 0 || gridX >= appState.metadata.width || gridY < 0 || gridY >= appState.metadata.height) {
            infoBox.style.display = 'none';
            return;
        }

        const screenIndex = gridY * appState.metadata.width + gridX;
        const atlasIndex = appState.currentCharacterData[screenIndex * 2];
        const paletteIndex = appState.currentCharacterData[screenIndex * 2 + 1];
        const char = FONT_ATLAS_CHARS[atlasIndex] || '?';
        const r = appState.currentPalette[paletteIndex * 3];
        const g = appState.currentPalette[paletteIndex * 3 + 1];
        const b = appState.currentPalette[paletteIndex * 3 + 2];

        infoBox.style.display = 'block';
        infoBox.style.left = `${e.clientX + 15}px`;
        infoBox.style.top = `${e.clientY + 15}px`;
        infoBox.textContent = `
Character    : '${char}' (Atlas: ${atlasIndex})
Palette Index: ${paletteIndex}
Color        : rgb(${r}, ${g}, ${b})
Screen Index : ${screenIndex}`;
    });

    parent.addEventListener('mouseleave', () => {
        infoBox.style.display = 'none';
    });
}

// --- WebGL レンダリング ---
function initWebGL() {
    const canvas = document.getElementById('gl-canvas');
    gl = canvas.getContext('webgl2', { antialias: false, powerPreference: "high-performance" });
    if (!gl) { throw new Error('WebGL 2 not supported'); }
    
    canvas.width = appState.metadata.width;
    canvas.height = appState.metadata.height;

    const vsSource = `#version 300 es
        in vec2 a_quadVertex; in vec2 a_charData; in float a_updated;
        uniform vec2 u_gridSize;
        out vec2 v_texCoord; out float v_paletteIndex; out float v_updated;
        const float FONT_ATLAS_COLS = 16.0;
        void main() {
            float atlasIndex = a_charData.x; v_paletteIndex = a_charData.y; v_updated = a_updated;
            float instanceId = float(gl_InstanceID);
            float col = mod(instanceId, u_gridSize.x); float row = floor(instanceId / u_gridSize.x);
            vec2 charSize = vec2(1.0) / u_gridSize; vec2 charPos = vec2(col, row) * charSize;
            vec2 pos = (charPos + a_quadVertex * charSize) * 2.0 - 1.0;
            gl_Position = vec4(pos.x, -pos.y, 0, 1);
            float atlasCol = mod(atlasIndex, FONT_ATLAS_COLS); float atlasRow = floor(atlasIndex / FONT_ATLAS_COLS);
            v_texCoord = (vec2(atlasCol, atlasRow) + a_quadVertex) / FONT_ATLAS_COLS;
        }`;
    
    const fsSource = `#version 300 es
        precision highp float;
        in vec2 v_texCoord; in float v_paletteIndex; in float v_updated;
        uniform sampler2D u_fontAtlas; uniform sampler2D u_palette;
        uniform bool u_highlightDiffs; uniform vec4 u_highlightColor;
        uniform float u_zoomLevel; // JavaScriptから現在のズームレベルを受け取る

        out vec4 outColor;
        
        void main() {
            vec4 baseColor = texture(u_palette, vec2((v_paletteIndex + 0.5) / 256.0, 0.5));
            vec4 finalColor = (u_highlightDiffs && v_updated > 0.5) ? u_highlightColor : baseColor;

            // ズームレベルが一定値以下（ズームアウト時）は、文字を無視して色で塗りつぶす
            if (u_zoomLevel < 40.0) {
                outColor = finalColor;
            } else {
                // 通常のズームレベルなら、フォントテクスチャから文字の形を読み込む
                float fontAlpha = texture(u_fontAtlas, v_texCoord).r;
                if (fontAlpha < 0.1) { discard; }
                outColor = vec4(finalColor.rgb, finalColor.a * fontAlpha);
            }
        }`;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource); const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    appState.program = createProgram(gl, vertexShader, fragmentShader); gl.useProgram(appState.program);
    appState.attributes = { quadVertex: gl.getAttribLocation(appState.program, 'a_quadVertex'), charData: gl.getAttribLocation(appState.program, 'a_charData'), updated: gl.getAttribLocation(appState.program, 'a_updated') };
    appState.uniforms = {
        gridSize: gl.getUniformLocation(appState.program, 'u_gridSize'),
        palette: gl.getUniformLocation(appState.program, 'u_palette'),
        fontAtlas: gl.getUniformLocation(appState.program, 'u_fontAtlas'),
        highlightDiffs: gl.getUniformLocation(appState.program, 'u_highlightDiffs'),
        highlightColor: gl.getUniformLocation(appState.program, 'u_highlightColor'),
        zoomLevel: gl.getUniformLocation(appState.program, 'u_zoomLevel'), // ★★★★★ 修正点2: zoomLevelの場所を取得 ★★★★★
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const totalChars = appState.metadata.width * appState.metadata.height;
    const quadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
    appState.buffers.quad = createBuffer(gl, gl.ARRAY_BUFFER, quadVertices);
    gl.enableVertexAttribArray(appState.attributes.quadVertex);
    gl.vertexAttribPointer(appState.attributes.quadVertex, 2, gl.FLOAT, false, 0, 0);
    appState.buffers.charData = createBuffer(gl, gl.ARRAY_BUFFER, totalChars * 2, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(appState.attributes.charData);
    gl.vertexAttribPointer(appState.attributes.charData, 2, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.vertexAttribDivisor(appState.attributes.charData, 1);
    appState.buffers.updated = createBuffer(gl, gl.ARRAY_BUFFER, totalChars, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(appState.attributes.updated);
    gl.vertexAttribPointer(appState.attributes.updated, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    gl.vertexAttribDivisor(appState.attributes.updated, 1);
    
    appState.textures.fontAtlas = createFontAtlasTexture();
    appState.textures.palette = createPaletteTexture();
    
    gl.uniform2f(appState.uniforms.gridSize, appState.metadata.width, appState.metadata.height);
    gl.uniform1i(appState.uniforms.fontAtlas, 0);
    gl.uniform1i(appState.uniforms.palette, 1);
    gl.uniform4fv(appState.uniforms.highlightColor, DEBUG_HIGHLIGHT_COLOR);
    
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    setupMouseOver();
}

function drawScene() {
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, appState.textures.fontAtlas);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, appState.textures.palette);
	gl.uniform1f(appState.uniforms.zoomLevel, appState.transform.scale);
    gl.uniform1i(appState.uniforms.highlightDiffs, appState.debug.highlightDiffs);
    const totalChars = appState.metadata.width * appState.metadata.height;
    const updatedFlags = new Uint8Array(totalChars);
    if (appState.debug.highlightDiffs) {
        if (appState.isKeyFrame) { updatedFlags.fill(1); }
        else { for (const index of appState.debug.lastFrameUpdatedIndices) { updatedFlags[index] = 1; } }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, appState.buffers.updated);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, updatedFlags);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, totalChars);
}

// --- インタラクション(ズーム/パン)関連 ---
function initEventListeners() {
    const uploadPrompt = document.getElementById('upload-prompt'); const fileInput = document.getElementById('file-input'); const canvas = document.getElementById('gl-canvas');
    uploadPrompt.onclick = () => fileInput.click(); fileInput.onchange = handleFileSelect;
    document.body.ondragover = (e) => e.preventDefault();
    document.body.ondrop = (e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) { handleFileSelect({ target: { files: e.dataTransfer.files } }); } };
    window.addEventListener('keydown', (e) => { if (!appState.isLoaded) return; if (e.key === 'd' || e.key === '`') { appState.debug.isVisible = !appState.debug.isVisible; document.getElementById('debug-panel').style.display = appState.debug.isVisible ? 'block' : 'none'; } if (e.key === 'h') { appState.debug.highlightDiffs = !appState.debug.highlightDiffs; } });
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handlePointerDown); canvas.addEventListener('mousemove', handlePointerMove); canvas.addEventListener('mouseup', handlePointerUp); canvas.addEventListener('mouseleave', handlePointerUp);
    canvas.addEventListener('dblclick', () => resetTransform(false));
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false }); canvas.addEventListener('touchmove', handlePointerMove, { passive: false }); canvas.addEventListener('touchend', handlePointerUp); canvas.addEventListener('touchcancel', handlePointerUp);
}
function handleWheel(e) {
    e.preventDefault();
    const t = appState.transform;
    const parentRect = e.target.parentElement.getBoundingClientRect();
    // マウス座標を、キャンバスの親要素（player-container）からの相対位置で取得
    const mouseX = e.clientX - parentRect.left;
    const mouseY = e.clientY - parentRect.top;

    const scaleAmount = -e.deltaY * 0.001;
    const newScale = t.scale * (1 + scaleAmount);
    
    zoom(newScale, mouseX, mouseY);
}
function handlePointerDown(e) { e.preventDefault(); appState.transform.isDragging = true; if (e.touches) { if (e.touches.length === 1) { appState.transform.lastX = e.touches[0].clientX; appState.transform.lastY = e.touches[0].clientY; } else if (e.touches.length >= 2) { appState.transform.lastPinchDist = getPinchDistance(e.touches); } } else { appState.transform.lastX = e.clientX; appState.transform.lastY = e.clientY; } }

function handlePointerMove(e) {
    e.preventDefault();
    if (!appState.transform.isDragging) return;

    if (e.touches) {
        if (e.touches.length === 1) {
            const dx = e.touches[0].clientX - appState.transform.lastX;
            const dy = e.touches[0].clientY - appState.transform.lastY;
            pan(dx, dy);
            appState.transform.lastX = e.touches[0].clientX;
            appState.transform.lastY = e.touches[0].clientY;
        } else if (e.touches.length >= 2) {
            const newPinchDist = getPinchDistance(e.touches);
            const scaleAmount = newPinchDist / appState.transform.lastPinchDist;
            const newScale = appState.transform.scale * scaleAmount;

            const center = getPinchCenter(e.touches);
            const parentRect = e.target.parentElement.getBoundingClientRect();
            // ピンチの中心も、親要素からの相対位置で取得
            const centerX = center.x - parentRect.left;
            const centerY = center.y - parentRect.top;
            zoom(newScale, centerX, centerY);
            
            appState.transform.lastPinchDist = newPinchDist;
        }
    } else { // Mouse move
        const dx = e.clientX - appState.transform.lastX;
        const dy = e.clientY - appState.transform.lastY;
        pan(dx, dy);
        appState.transform.lastX = e.clientX;
        appState.transform.lastY = e.clientY;
    }
}
function handlePointerUp(e) { appState.transform.isDragging = false; appState.transform.lastPinchDist = 0; }
function pan(dx, dy) { appState.transform.x += dx; appState.transform.y += dy; updateCanvasTransform(); }
function zoom(newScale, centerX, centerY) {
    const t = appState.transform;
    const oldScale = t.scale;
    t.scale = Math.max(0.1, Math.min(newScale, 40.0));

    // 「マウスカーソルの下の点が、ズーム後も同じ画面位置に留まる」ための計算
    // 新しい座標 = マウス位置 - (マウス位置 - 古い座標) * (新しいスケール / 古いスケール)
    t.x = centerX - (centerX - t.x) * (t.scale / oldScale);
    t.y = centerY - (centerY - t.y) * (t.scale / oldScale);

    updateCanvasTransform();
}

function resetTransform(isInitial) {
    const t = appState.transform;
    let targetScale = 1.0;
    if (isInitial) {
        // ウィンドウにフィットするスケールを計算
        targetScale = Math.min(window.innerWidth / appState.metadata.width, window.innerHeight / appState.metadata.height) * 0.9;
    }
    t.scale = targetScale;
    // (ウィンドウ幅 - キャンバスのスケール後幅) / 2 で中央寄せ
    t.x = (window.innerWidth - appState.metadata.width * t.scale) / 2;
    t.y = (window.innerHeight - appState.metadata.height * t.scale) / 2;
    updateCanvasTransform();
}
function updateCanvasTransform() {
    const canvas = document.getElementById('gl-canvas');
    const t = appState.transform;
    
    // ★★★★★★★★★★★★★★★★★★★★★ 修正点4: パン範囲の制限（ストッパー） ★★★★★★★★★★★★★★★★★★★★
    const margin = 200; // 画面外にどれだけはみ出せるかの許容量
    const scaledWidth = canvas.width * t.scale;
    const scaledHeight = canvas.height * t.scale;
    
    // X座標の最小・最大値を計算
    const minX = -scaledWidth + margin;
    const maxX = window.innerWidth - margin;
    // Y座標の最小・最大値を計算
    const minY = -scaledHeight + margin;
    const maxY = window.innerHeight - margin;

    // 現在の座標を最小・最大値の範囲内に収める（クランプ処理）
    t.x = Math.max(minX, Math.min(t.x, maxX));
    t.y = Math.max(minY, Math.min(t.y, maxY));
    
    canvas.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
}

function getPinchDistance(touches) { const dx = touches[0].clientX - touches[1].clientX; const dy = touches[0].clientY - touches[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
function getPinchCenter(touches) { return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 }; }

// --- WebGL ヘルパー関数 ---
function createShader(gl, type, source) { const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader); if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error('Shader compile error:', gl.getShaderInfoLog(shader)); gl.deleteShader(shader); return null; } return shader; }
function createProgram(gl, vs, fs) { if (!vs || !fs) { return null; } const program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.error('Program link error:', gl.getProgramInfoLog(program)); gl.deleteProgram(program); return null; } return program; }
function createBuffer(gl, target, dataOrSize, usage = gl.STATIC_DRAW) { const buffer = gl.createBuffer(); gl.bindBuffer(target, buffer); gl.bufferData(target, dataOrSize, usage); return buffer; }
function createFontAtlasTexture() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const FONT_SIZE = 64;
    const ATLAS_COLS = 16;
    
    // 2のべき乗サイズを維持
    canvas.width = FONT_SIZE * ATLAS_COLS; // 1024
    canvas.height = 512;

    // ★修正1: より太く、大きく描画してミップマップの消失を防ぐ
    ctx.fillStyle = '#fff';
    ctx.font = `900 ${FONT_SIZE * 0.9}px sans-serif`; // 900は最も太いウェイト
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    for (let i = 0; i < FONT_ATLAS_CHARS.length; i++) {
        const char = FONT_ATLAS_CHARS[i];
        const col = i % ATLAS_COLS;
        const row = Math.floor(i / ATLAS_COLS);
        ctx.fillText(char, col * FONT_SIZE + FONT_SIZE / 2, row * FONT_SIZE + FONT_SIZE / 2);
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);

    // ★修正2: 最も安定した高品質フィルタリングモードに変更
    // ズームアウト時: 最も近いミップマップレベルを選択し、その中で線形補間。高速かつ安定。
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    // ズームイン時: 線形補間で滑らかに。
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
}
function createPaletteTexture() { const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture); const dummyPalette = new Uint8Array(256 * 3); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 256, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, dummyPalette); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return texture; }
function updatePaletteTexture(paletteData) { gl.bindTexture(gl.TEXTURE_2D, appState.textures.palette); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGB, gl.UNSIGNED_BYTE, paletteData); }
function updateCharacterVBO(fullData) { gl.bindBuffer(gl.ARRAY_BUFFER, appState.buffers.charData); gl.bufferData(gl.ARRAY_BUFFER, fullData, gl.DYNAMIC_DRAW); }
function updateCharacterVBOSub(data) { gl.bindBuffer(gl.ARRAY_BUFFER, appState.buffers.charData); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); }