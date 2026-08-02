let algorithms = [];
let currentStream = null;
let streamInterval = null;
let isWebcamMode = true;

const video = document.getElementById('webcam');
const captureCanvas = document.getElementById('captureCanvas');
const outputImage = document.getElementById('outputImage');
const statusBadge = document.getElementById('statusBadge');
const algoSelect = document.getElementById('algorithmSelect');
const paramsContainer = document.getElementById('dynamicParamsContainer');
const algoDesc = document.getElementById('algorithmDesc');

// Initialize App Specs
async function initApp() {
    try {
        const res = await fetch('/api/v1/algorithms');
        algorithms = await res.json();
        populateAlgorithmSelect();
        setupWebcam();
    } catch (err) {
        console.error("Failed to connect to backend:", err);
    }
}

function populateAlgorithmSelect() {
    algoSelect.innerHTML = '';
    algorithms.forEach(algo => {
        const opt = document.createElement('option');
        opt.value = algo.id;
        opt.textContent = algo.name;
        algoSelect.appendChild(opt);
    });

    algoSelect.addEventListener('change', renderDynamicControls);
    renderDynamicControls();
}

function renderDynamicControls() {
    const selectedAlgo = algorithms.find(a => a.id === algoSelect.value);
    paramsContainer.innerHTML = '';
    if (!selectedAlgo) return;

    algoDesc.textContent = selectedAlgo.description;

    selectedAlgo.parameters.forEach(param => {
        const group = document.createElement('div');
        group.className = 'field-group';

        const label = document.createElement('label');
        label.textContent = param.name.replace('_', ' ');
        group.appendChild(label);

        if (param.type === 'select') {
            const select = document.createElement('select');
            select.dataset.paramName = param.name;
            param.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (opt === param.default) option.selected = true;
                select.appendChild(option);
            });
            group.appendChild(select);
        } else if (param.type === 'range') {
            const slider = document.createElement('input');
            slider.type = 'range';
            slider.dataset.paramName = param.name;
            slider.min = param.min_val;
            slider.max = param.max_val;
            slider.step = param.step;
            slider.value = param.default;
            group.appendChild(slider);
        }

        paramsContainer.appendChild(group);
    });
}

function getParamValues() {
    const values = {};
    paramsContainer.querySelectorAll('[data-param-name]').forEach(input => {
        values[input.dataset.paramName] = input.value;
    });
    return values;
}

// Camera & Processing Stream
async function setupWebcam() {
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
        video.srcObject = currentStream;
        statusBadge.textContent = 'LIVE';
        statusBadge.classList.add('active');

        // Send video frame to backend every 120ms (~8 FPS for smooth server-side rendering)
        if (streamInterval) clearInterval(streamInterval);
        streamInterval = setInterval(captureAndProcessFrame, 120);
    } catch (err) {
        statusBadge.textContent = 'CAMERA ERROR';
    }
}

async function captureAndProcessFrame() {
    if (!isWebcamMode || video.paused || video.ended) return;

    captureCanvas.width = video.videoWidth || 640;
    captureCanvas.height = video.videoHeight || 480;
    const ctx = captureCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    captureCanvas.toBlob(async (blob) => {
        if (!blob) return;
        const formData = new FormData();
        formData.append('file', blob, 'frame.jpg');
        formData.append('algorithm', algoSelect.value);
        formData.append('params', JSON.stringify(getParamValues()));

        try {
            const res = await fetch('/api/v1/dither', { method: 'POST', body: formData });
            if (res.ok) {
                const ditheredBlob = await res.blob();
                outputImage.src = URL.createObjectURL(ditheredBlob);
            }
        } catch (e) {
            console.error(e);
        }
    }, 'image/jpeg', 0.8);
}

// Event Listeners for File Upload
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    isWebcamMode = false;
    if (streamInterval) clearInterval(streamInterval);
    statusBadge.textContent = 'FILE MODE';
    statusBadge.classList.remove('active');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('algorithm', algoSelect.value);
    formData.append('params', JSON.stringify(getParamValues()));

    const res = await fetch('/api/v1/dither', { method: 'POST', body: formData });
    if (res.ok) {
        const ditheredBlob = await res.blob();
        outputImage.src = URL.createObjectURL(ditheredBlob);
    }
});

document.getElementById('btnSnapshot').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = outputImage.src;
    a.download = `dither-${Date.now()}.png`;
    a.click();
});

initApp();