import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { initEnvironment } from './core/Environment.js';
import { CIRCUIT_CONFIGS, createCircuit } from './core/Circuit.js';
import { CircuitDesigner } from './core/CircuitDesigner.js';
import { Vehicle } from './core/Vehicle.js';
import { Camera } from './core/Camera.js';
import { initAudio, updateEngineSound, toggleSound, enableSound, isAudioInitialized, playFastestLapSound } from './core/Audio.js';

const engine = new Engine();
initEnvironment(engine.scene);

// Create the Car
const car = new Vehicle();
engine.scene.add(car.group);

// Create a persistent group for the circuit
const circuitGroup = new THREE.Group();
engine.scene.add(circuitGroup);

const camera = new Camera(engine.camera, car, engine.scene);

// --- UI State & Simulation Variables ---
let uiHideMode = 0; // 0 = controls & stats shown, 1 = controls hidden & stats shown, 2 = both hidden
let simulationRunning = false;
let currentSpeed = 0;
let progress = 0; // 0 to 1 representing progress along the track curve
let trackCurve = null;
let lastFrameTime = performance.now();
let totalLaps = 5;
let currentLap = 1;
let maxSpeed = 200; // Max speed in km/h
let lapStartTime = 0;
let lapTimes = [];
let bestLap = Infinity;

function updateLapDisplay() {
    const lapEl = document.getElementById('currentLap');
    if (lapEl) {
        if (simulationRunning) {
            lapEl.textContent = `${currentLap} / ${totalLaps}`;
        } else {
            lapEl.textContent = '-';
        }
    }
}

function recordLap(time) {
    lapTimes.push(time);

    const li = document.createElement('li');
    li.innerHTML = `<span class="lap-num">Lap ${lapTimes.length}:</span> <span>${formatTime(time)}</span>`;

    if (time < bestLap) {
        bestLap = time;

        const bestLapEl = document.getElementById('bestLap');
        if (bestLapEl) {
            bestLapEl.textContent = formatTime(bestLap);
        }
        playFastestLapSound();

        // Remove 'fastest' class from previous and add to this one
        const allLaps = document.querySelectorAll('#lapHistory li');
        allLaps.forEach(el => el.classList.remove('fastest'));
        li.classList.add('fastest');
    }

    const lapHistoryEl = document.getElementById('lapHistory');
    if (lapHistoryEl) {
        lapHistoryEl.appendChild(li);
        lapHistoryEl.scrollTop = lapHistoryEl.scrollHeight;
    }
}

function clearLapHistory() {
    lapTimes = [];
    bestLap = Infinity;
    const bestLapEl = document.getElementById('bestLap');
    if (bestLapEl) {
        bestLapEl.textContent = '--:--.---';
    }
    const lapHistoryEl = document.getElementById('lapHistory');
    if (lapHistoryEl) lapHistoryEl.innerHTML = '';
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function drawMinimap(config, canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Get points with high sampling for smoothness
    const tempCurve = new THREE.CatmullRomCurve3(config.points);
    tempCurve.closed = true;
    const drawPoints = tempCurve.getPoints(100);

    // Normalize coordinates
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    drawPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    });

    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;
    const padding = 20;
    const scale = Math.min((w - padding * 2) / rangeX, (h - padding * 2) / rangeZ);

    const offsetX = (w - rangeX * scale) / 2 - minX * scale;
    const offsetZ = (h - rangeZ * scale) / 2 - minZ * scale;

    // Draw track path
    ctx.beginPath();
    ctx.strokeStyle = '#e10600';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    // Add glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#e10600';

    drawPoints.forEach((p, i) => {
        const x = p.x * scale + offsetX;
        const z = p.z * scale + offsetZ;
        if (i === 0) ctx.moveTo(x, z);
        else ctx.lineTo(x, z);
    });

    ctx.closePath();
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw start/finish indicator
    const sP = drawPoints[0];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sP.x * scale + offsetX, sP.z * scale + offsetZ, 4, 0, Math.PI * 2);
    ctx.fill();
}

function updateCircuitDisplay(config) {
    const nameEl = document.getElementById('info-circuit-name');
    const descEl = document.getElementById('info-circuit-desc');
    const canvas = document.getElementById('track-minimap');

    if (nameEl) nameEl.textContent = config.name;
    if (descEl) descEl.textContent = config.description;
    if (canvas) drawMinimap(config, canvas);
}

function loadCircuit(id) {
    const config = CIRCUIT_CONFIGS[id];
    if (!config || (id === 'custom' && config.points.length === 0)) return;

    // 1. Update Ground Color
    const ground = engine.scene.getObjectByName('ground');
    if (ground) ground.material.color.set(config.groundColor);

    // 2. Rebuild Circuit
    const result = createCircuit(circuitGroup, config);
    trackCurve = result.circuitCurve;

    // 3. Reset Car Position
    const startPos = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();

    car.group.position.copy(startPos);
    car.group.position.y = 0.5;
    const lookAtPos = new THREE.Vector3().copy(startPos).add(startTangent);
    car.group.lookAt(lookAtPos.x, 0.5, lookAtPos.z);

    // 4. Reset Camera to Start
    camera.resetCameraForCircuit(trackCurve);

    // 5. Update Circuit Info Display
    updateCircuitDisplay(config);
    const circuitInfoPanel = document.getElementById('circuit-info');
    if (circuitInfoPanel) circuitInfoPanel.style.display = 'flex';

    // Reset simulation state
    progress = 0;
    currentSpeed = 0;
    simulationRunning = false;
    lapStartTime = 0;
    clearLapHistory();
    const launchBtn = document.getElementById('launchBtn');
    if (launchBtn) launchBtn.textContent = "LAUNCH SIMULATION";
    const speedEl = document.getElementById('currentSpeed');
    if (speedEl) speedEl.textContent = "0 km/h";
    const currentTimeEl = document.getElementById('currentTime');
    if (currentTimeEl) currentTimeEl.textContent = '--:--.---';
}

// Initialize Designer
const designer = new CircuitDesigner(() => loadCircuit('custom'));

// --- Import/Export Logic ---
const exportBtn = document.getElementById('exportCircuitBtn');
const importBtn = document.getElementById('importCircuitBtn');
const circuitInput = document.getElementById('circuitInput');

if (exportBtn) {
    exportBtn.addEventListener('click', () => {
        const customConfig = CIRCUIT_CONFIGS.custom;
        if (customConfig.points.length === 0) {
            alert('No custom circuit to export! Draw one first.');
            return;
        }

        const data = {
            name: customConfig.name,
            points: customConfig.points.map(p => ({ x: p.x, y: p.y, z: p.z })),
            groundColor: customConfig.groundColor,
            curbColor: customConfig.curbColor,
            description: customConfig.description
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `custom-circuit-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}

if (importBtn) {
    importBtn.addEventListener('click', () => circuitInput.click());
}

if (circuitInput) {
    circuitInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!data.points || !Array.isArray(data.points)) {
                    throw new Error('Invalid circuit file');
                }

                CIRCUIT_CONFIGS.custom.points = data.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                CIRCUIT_CONFIGS.custom.groundColor = data.groundColor || 0x222222;
                CIRCUIT_CONFIGS.custom.curbColor = data.curbColor || 0xffffff;

                designer.addCustomOption();
                loadCircuit('custom');

                circuitInput.value = '';
            } catch (err) {
                alert('Error importing circuit: ' + err.message);
            }
        };
        reader.readAsText(file);
    });
}

// Laps Input Handler
const lapsInput = document.getElementById('laps');
if (lapsInput) {
    lapsInput.addEventListener('change', (e) => {
        totalLaps = parseInt(e.target.value) || 5;
    });
}

// Max Speed Input Handler
const maxSpeedInput = document.getElementById('maxSpeed');
const maxSpeedValue = document.getElementById('maxSpeedValue');
if (maxSpeedInput) {
    maxSpeedInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        maxSpeed = value;
        if (maxSpeedValue) maxSpeedValue.textContent = value;
        // Update live speed display if simulation is running
        if (simulationRunning) {
            currentSpeed = value;
            const speedEl = document.getElementById('currentSpeed');
            if (speedEl) speedEl.textContent = `${value} km/h`;
        }
    });
}

// Launch Button Handler
const launchBtn = document.getElementById('launchBtn');
if (launchBtn) {
    launchBtn.addEventListener('click', () => {
        if (!simulationRunning) {
            // Starting simulation
            totalLaps = parseInt(lapsInput?.value) || 5;
            maxSpeed = parseInt(maxSpeedInput?.value) || 200;
            currentLap = 1;
            clearLapHistory();
            lapStartTime = performance.now();
            simulationRunning = true;
            currentSpeed = maxSpeed;
            launchBtn.textContent = "RESET SIMULATION";
            const speedEl = document.getElementById('currentSpeed');
            if (speedEl) speedEl.textContent = `${maxSpeed} km/h`;
            updateLapDisplay();
            // Auto-hide circuit info panel on start
            const circuitInfoPanel = document.getElementById('circuit-info');
            if (circuitInfoPanel) circuitInfoPanel.style.display = 'none';
        } else {
            // Resetting simulation
            simulationRunning = false;
            currentLap = 1;
            lapStartTime = 0;
            updateLapDisplay();
            launchBtn.textContent = "LAUNCH SIMULATION";
            const currentTimeEl = document.getElementById('currentTime');
            if (currentTimeEl) currentTimeEl.textContent = '--:--.---';
            loadCircuit(document.getElementById('circuitSelect').value);
        }
    });
}

// Keyboard controls for panel toggle
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return; // Prevent shortcuts when typing in inputs

    // Space to toggle simulation
    if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (launchBtn) launchBtn.click();
    }

    if (e.key === 's' || e.key === 'S') {
        let isEnabled;
        if (!isAudioInitialized()) {
            initAudio();
            isEnabled = enableSound();
        } else {
            isEnabled = toggleSound();
        }
        const soundValue = document.getElementById('soundStatus');
        if (soundValue) {
            soundValue.textContent = isEnabled ? 'On' : 'Off';
            soundValue.className = isEnabled ? 'value' : 'value off';
        }
    }

    // Panel toggle with 'h' key
    if (e.key === 'h' || e.key === 'H') {
        uiHideMode = (uiHideMode + 1) % 3; // Cycle through 3 states: 0=All, 1=Stats only, 2=None

        const controlsPanel = document.getElementById('controls');
        const statsPanel = document.getElementById('stats');

        if (uiHideMode === 0) {
            if (controlsPanel) controlsPanel.style.display = 'block';
            if (statsPanel) statsPanel.style.display = 'block';
        } else if (uiHideMode === 1) {
            if (controlsPanel) controlsPanel.style.display = 'none';
            if (statsPanel) statsPanel.style.display = 'block';
        } else {
            if (controlsPanel) controlsPanel.style.display = 'none';
            if (statsPanel) statsPanel.style.display = 'none';
        }
    }
});

// Initial load
loadCircuit('classic');

// UI Event Listeners
const circuitSelect = document.getElementById('circuitSelect');
if (circuitSelect) {
    circuitSelect.addEventListener('change', (e) => {
        loadCircuit(e.target.value);
    });
}

engine.start(() => {
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    if (simulationRunning && trackCurve) {
        // Calculate track curvature at current position
        const tangent = trackCurve.getTangentAt(progress);
        const lookAhead = (progress + 0.02) % 1;
        const nextTangent = trackCurve.getTangentAt(lookAhead);
        const angle = tangent.angleTo(nextTangent);
        const curvature = Math.min(1.0, angle * 15.0); // Normalized curvature [0, 1]

        // Target speed calculation - slower in corners, faster on straights
        // Grip factor affects cornering speed (lower grip = slower corners)
        const gripFactor = 0.8; // Base grip value
        const speedPenalty = curvature * (1.2 - gripFactor);
        let targetSpeed = maxSpeed * (1.0 - Math.min(0.8, speedPenalty));
        targetSpeed = Math.max(maxSpeed * 0.2, targetSpeed); // Minimum 20% of max speed

        // Acceleration/deceleration logic
        const accelKmhPerSec = 100; // Acceleration rate
        const brakePower = 2.0; // Braking is faster than accelerating
        const accelRate = accelKmhPerSec * dt;

        if (currentSpeed < targetSpeed) {
            currentSpeed = Math.min(currentSpeed + accelRate, targetSpeed);
        } else {
            currentSpeed = Math.max(currentSpeed - accelRate * brakePower, targetSpeed);
        }

        currentSpeed = Math.max(maxSpeed * 0.1, Math.min(currentSpeed, maxSpeed));

        // Update speed display
        const speedText = `${Math.round(currentSpeed)} km/h`;
        const speedEl = document.getElementById('currentSpeed');
        if (speedEl) speedEl.textContent = speedText;

        // Update lap time display
        const lapElapsed = (now - lapStartTime) / 1000;
        const timeText = formatTime(lapElapsed);
        const currentTimeEl = document.getElementById('currentTime');
        if (currentTimeEl) currentTimeEl.textContent = timeText;

        // Convert speed from km/h to meters/sec
        const metersPerSec = currentSpeed * 0.277778;
        const trackLength = trackCurve.getLength();

        const previousProgress = progress;
        progress += (metersPerSec * dt) / trackLength;

        // Check if lap completed
        if (progress >= 1) {
            const lapTime = (now - lapStartTime) / 1000;
            recordLap(lapTime);
            progress -= 1;
            lapStartTime = now;
            currentLap++;
            updateLapDisplay();

            if (currentLap > totalLaps) {
                simulationRunning = false;
                launchBtn.textContent = "SIMULATION FINISHED - LAUNCH AGAIN";
                currentSpeed = 0;
                if (speedEl) speedEl.textContent = "0 km/h";
                const currentTimeEl = document.getElementById('currentTime');
                if (currentTimeEl) currentTimeEl.textContent = '--:--.---';
            }
        }

        const position = trackCurve.getPointAt(progress);
        car.group.position.copy(position);
        car.group.position.y = 0.5;

        const lookAheadU = (progress + 0.01) % 1;
        const lookAtPos = trackCurve.getPointAt(lookAheadU);
        car.group.lookAt(lookAtPos.x, 0.5, lookAtPos.z);
    }

    // Update engine sound
    updateEngineSound(currentSpeed, 200, simulationRunning);

    // Animation loop for camera and simulation updates
    camera.update(progress, currentSpeed, simulationRunning);
});

// Hide splash screen when ready
window.addEventListener('load', () => {
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.style.opacity = '0';
            splash.style.visibility = 'hidden';
        }
    }, 500); // Small delay to ensure WebGL context is fully rendered
});

// Request fullscreen on first user interaction (required by browser security)
let fullscreenRequested = false;
document.addEventListener('click', () => {
    if (!fullscreenRequested && !document.fullscreenElement) {
        fullscreenRequested = true;
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else if (document.documentElement.webkitRequestFullscreen) {
            document.documentElement.webkitRequestFullscreen();
        }
    }
}, { once: true });
