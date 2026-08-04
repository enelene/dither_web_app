const video = document.getElementById('videoElement');
const displayCanvas = document.getElementById('displayCanvas');
const ctx = displayCanvas.getContext('2d');
const statusBadge = document.getElementById('statusBadge');
const recBadge = document.getElementById('recBadge');

const btnCamera = document.getElementById('btnCamera');
const btnFlipCam = document.getElementById('btnFlipCam');
const btnMirror = document.getElementById('btnMirror');
const fileInput = document.getElementById('fileInput');
const btnCapture = document.getElementById('btnCapture');
const btnRecord = document.getElementById('btnRecord');

const algoSelect = document.getElementById('algoSelect');
const paletteSelect = document.getElementById('paletteSelect');
const matrixSelect = document.getElementById('matrixSelect');
const matrixGroup = document.getElementById('matrixGroup');

const scaleSlider = document.getElementById('scaleSlider');
const scaleVal = document.getElementById('scaleVal');
const contrastSlider = document.getElementById('contrastSlider');
const contrastVal = document.getElementById('contrastVal');
const brightnessSlider = document.getElementById('brightnessSlider');
const brightnessVal = document.getElementById('brightnessVal');

// State Variables
let mode = 'camera';
let isMirrored = false;
let facingMode = 'user';
let loadedImage = null;
let loadedVideoActive = false;
let streamActive = false;
let useFastAPI = false;

// Hidden video element for playing back uploaded video files
const fileVideo = document.createElement('video');
fileVideo.playsInline = true;
fileVideo.loop = true;
fileVideo.muted = true;

// Video Recording Variables
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recTimer = null;
let recSeconds = 0;

// Offscreen Processing Canvas
const offscreen = document.createElement('canvas');
const bctx = offscreen.getContext('2d', { willReadFrequently: true });

const PALETTES = {
    monochrome: [[0, 0, 0], [255, 255, 255]],
    gameboy: [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]],
    cga_cyberpunk: [[0, 0, 0], [85, 255, 255], [255, 85, 255], [255, 255, 255]],
    epaper_6color: [[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]
};

const BAYER_MATRICES = {
    2: [[0, 2], [3, 1]].map(r => r.map(v => (v + 0.5) / 4)),
    4: [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5]
    ].map(r => r.map(v => (v + 0.5) / 16)),
    8: [
        [0, 32, 8, 40, 2, 34, 10, 42],
        [48, 16, 56, 24, 50, 18, 58, 26],
        [12, 44, 4, 36, 14, 46, 6, 38],
        [60, 28, 52, 20, 62, 30, 54, 22],
        [3, 35, 11, 43, 1, 33, 9, 41],
        [51, 19, 59, 27, 49, 17, 57, 25],
        [15, 47, 7, 39, 13, 45, 5, 37],
        [63, 31, 55, 23, 61, 29, 53, 21]
    ].map(r => r.map(v => (v + 0.5) / 64))
};

async function checkFastAPI() {
    try {
        const res = await fetch('/api/v1/algorithms');
        if (res.ok) {
            const algos = await res.json();
            useFastAPI = true;
            algoSelect.innerHTML = '';
            algos.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.textContent = a.name;
                algoSelect.appendChild(opt);
            });
        }
    } catch (err) {
        useFastAPI = false;
    }
}

async function startCamera() {
    try {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        let stream;
        try {
            // Attempt to request both video and audio (microphone)
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: facingMode
                },
                audio: true
            });
        } catch (audioErr) {
            // Fallback to video-only if microphone permission is denied or unavailable
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: facingMode
                },
                audio: false
            });
        }

        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        try {
            await video.play();
        } catch (playErr) {
            // Autoplay was blocked; camera permission still succeeded,
            // frame rendering will resume once play() succeeds
        }

        streamActive = true;
        mode = 'camera';
        statusBadge.textContent = 'CAMERA';
        btnCamera.classList.add('active');
    } catch (err) {
        statusBadge.textContent = 'CAMERA ERROR';
        streamActive = false;
    }
}

btnFlipCam.addEventListener('click', () => {
    facingMode = (facingMode === 'user') ? 'environment' : 'user';
    btnFlipCam.textContent = `Cam: ${facingMode === 'user' ? 'Front' : 'Back'}`;
    if (mode === 'camera') startCamera();
});

btnMirror.addEventListener('click', () => {
    isMirrored = !isMirrored;
    btnMirror.textContent = `Mirror: ${isMirrored ? 'On' : 'Off'}`;
    btnMirror.classList.toggle('active', isMirrored);
    if (mode === 'file' && loadedImage) renderFrame();
});

function getNearestColor(r, g, b, palette) {
    let minDist = Infinity;
    let best = palette[0];
    for (let i = 0; i < palette.length; i++) {
        const dr = r - palette[i][0];
        const dg = g - palette[i][1];
        const db = b - palette[i][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < minDist) {
            minDist = dist;
            best = palette[i];
        }
    }
    return best;
}

function renderFrame() {
    let srcWidth = 640;
    let srcHeight = 480;

    if (mode === 'camera' && streamActive && video.readyState >= 2) {
        srcWidth = video.videoWidth;
        srcHeight = video.videoHeight;
    } else if (mode === 'file' && loadedVideoActive && fileVideo.readyState >= 2) {
        srcWidth = fileVideo.videoWidth;
        srcHeight = fileVideo.videoHeight;
    } else if (mode === 'file' && loadedImage) {
        srcWidth = loadedImage.width;
        srcHeight = loadedImage.height;
    } else {
        return;
    }

    const scale = parseInt(scaleSlider.value);
    const bw = Math.max(16, Math.floor(srcWidth / scale));
    const bh = Math.max(16, Math.floor(srcHeight / scale));

    displayCanvas.width = srcWidth;
    displayCanvas.height = srcHeight;
    offscreen.width = bw;
    offscreen.height = bh;

    bctx.save();
    if (isMirrored && mode === 'camera') {
        bctx.translate(bw, 0);
        bctx.scale(-1, 1);
    }

    if (mode === 'camera' && streamActive) {
        bctx.drawImage(video, 0, 0, bw, bh);
    } else if (mode === 'file' && loadedVideoActive) {
        bctx.drawImage(fileVideo, 0, 0, bw, bh);
    } else if (mode === 'file' && loadedImage) {
        bctx.drawImage(loadedImage, 0, 0, bw, bh);
    }
    bctx.restore();

    const imgData = bctx.getImageData(0, 0, bw, bh);
    const data = imgData.data;
    const matrixKey = parseInt(matrixSelect.value);
    const matrix = BAYER_MATRICES[matrixKey] || BAYER_MATRICES[4];
    const mSize = matrix.length;
    const palette = PALETTES[paletteSelect.value] || PALETTES.monochrome;

    const contrast = parseFloat(contrastSlider.value);
    const brightness = parseInt(brightnessSlider.value);

    for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
            const i = (y * bw + x) * 4;

            let r = (data[i] - 128) * contrast + 128 + brightness;
            let g = (data[i + 1] - 128) * contrast + 128 + brightness;
            let b = (data[i + 2] - 128) * contrast + 128 + brightness;

            const threshold = matrix[y % mSize][x % mSize];
            const noise = (threshold - 0.5) * 110;

            const nr = Math.min(255, Math.max(0, r + noise));
            const ng = Math.min(255, Math.max(0, g + noise));
            const nb = Math.min(255, Math.max(0, b + noise));

            const finalCol = getNearestColor(nr, ng, nb, palette);

            data[i] = finalCol[0];
            data[i + 1] = finalCol[1];
            data[i + 2] = finalCol[2];
        }
    }

    bctx.putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, bw, bh, 0, 0, srcWidth, srcHeight);
}

function formatTimer(secs) {
    const m = String(Math.floor(secs / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function startVideoRecording() {
    recordedChunks = [];
    const canvasStream = displayCanvas.captureStream(30);

    // Combine dithered canvas video track with microphone audio track if available
    const recordTracks = [...canvasStream.getVideoTracks()];
    if (video.srcObject && video.srcObject.getAudioTracks().length > 0) {
        recordTracks.push(...video.srcObject.getAudioTracks());
    }
    const recordStream = new MediaStream(recordTracks);

    // Prioritize MP4 formats (H.264/AAC) for universal compatibility with iOS, Mac, Android, & Windows
    const candidateTypes = [
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4;codecs=avc1',
        'video/mp4;codecs=h264',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
    ];

    const selectedMime = candidateTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';
    const options = selectedMime ? { mimeType: selectedMime } : {};

    try {
        mediaRecorder = new MediaRecorder(recordStream, options);
    } catch (err) {
        mediaRecorder = new MediaRecorder(recordStream);
    }

    mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
            recordedChunks.push(e.data);
        }
    };

    mediaRecorder.onstop = () => {
        const mime = mediaRecorder.mimeType || 'video/webm';
        const blob = new Blob(recordedChunks, { type: mime });
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        saveMedia(blob, `dither-video-${Date.now()}.${ext}`, mime);
    };

    mediaRecorder.start();
    isRecording = true;

    btnRecord.textContent = 'STOP RECORDING';
    btnRecord.classList.add('recording');

    recSeconds = 0;
    recBadge.style.display = 'block';
    recBadge.textContent = `● REC 00:00`;

    recTimer = setInterval(() => {
        recSeconds++;
        recBadge.textContent = `● REC ${formatTimer(recSeconds)}`;
    }, 1000);
}

function stopVideoRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        clearInterval(recTimer);
        recBadge.style.display = 'none';

        btnRecord.textContent = 'REC VIDEO';
        btnRecord.classList.remove('recording');
    }
}

btnRecord.addEventListener('click', () => {
    if (!isRecording) {
        startVideoRecording();
    } else {
        stopVideoRecording();
    }
});

scaleSlider.addEventListener('input', (e) => {
    scaleVal.textContent = e.target.value;
    if (mode === 'file') renderFrame();
});

contrastSlider.addEventListener('input', (e) => {
    contrastVal.textContent = e.target.value;
    if (mode === 'file') renderFrame();
});

brightnessSlider.addEventListener('input', (e) => {
    brightnessVal.textContent = e.target.value;
    if (mode === 'file') renderFrame();
});

algoSelect.addEventListener('change', () => {
    matrixGroup.style.display = algoSelect.value === 'bayer' ? 'flex' : 'none';
    if (mode === 'file') renderFrame();
});

paletteSelect.addEventListener('change', () => {
    if (mode === 'file') renderFrame();
});

matrixSelect.addEventListener('change', () => {
    if (mode === 'file') renderFrame();
});

btnCamera.addEventListener('click', () => {
    mode = 'camera';
    if (loadedVideoActive) {
        fileVideo.pause();
        loadedVideoActive = false;
    }
    btnCamera.classList.add('active');
    statusBadge.textContent = 'CAMERA';
    if (!streamActive) startCamera();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Stop any previous file-based media before loading the new one
    loadedImage = null;
    if (loadedVideoActive) {
        fileVideo.pause();
        loadedVideoActive = false;
    }

    if (file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        fileVideo.src = url;
        fileVideo.onloadeddata = () => {
            loadedVideoActive = true;
            mode = 'file';
            btnCamera.classList.remove('active');
            statusBadge.textContent = 'FILE (VIDEO)';
            fileVideo.play();
        };
    } else {
        const reader = new FileReader();
        reader.onload = (evt) => {
            const img = new Image();
            img.onload = () => {
                loadedImage = img;
                mode = 'file';
                btnCamera.classList.remove('active');
                statusBadge.textContent = 'FILE';
                renderFrame();
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    }
});

async function saveMedia(blob, filename, mimeType) {
    const file = new File([blob], filename, { type: mimeType });

    // Web Share API with files: on iOS/Android this opens the native share sheet,
    // which includes "Save Image"/"Save Video" that goes straight to Photos.
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file] });
            return;
        } catch (err) {
            // User cancelled the share sheet, or share failed — fall through to download
            if (err.name === 'AbortError') return;
        }
    }

    // Fallback (desktop browsers, or share unsupported): standard download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

btnCapture.addEventListener('click', () => {
    displayCanvas.toBlob((blob) => {
        if (blob) saveMedia(blob, `dither-${Date.now()}.png`, 'image/png');
    }, 'image/png');
});

function loop() {
    if (mode === 'camera' || loadedVideoActive) {
        renderFrame();
    }
    requestAnimationFrame(loop);
}

function stopCamera() {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    streamActive = false;
}

// Release camera/mic when the tab is hidden (backgrounded, minimized, app-switched)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        stopCamera();
        statusBadge.textContent = 'PAUSED';
    } else if (mode === 'camera') {
        startCamera();
    }
});

// Release camera/mic when the tab is closed or navigated away from
window.addEventListener('pagehide', stopCamera);
window.addEventListener('beforeunload', stopCamera);

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/sw.js').catch(() => {});
    });
}

checkFastAPI();
startCamera();
requestAnimationFrame(loop);
