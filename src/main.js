import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { initEnvironment } from './core/Environment.js';
import { CIRCUIT_CONFIGS, createCircuit, analyzeCircuitGeometry, getIdealSetup } from './core/Circuit.js';
import { CircuitDesigner } from './core/CircuitDesigner.js';
import { Vehicle } from './core/Vehicle.js';
import { Camera } from './core/Camera.js';
import { Weather } from './core/Weather.js';
import { initAudio, updateEngineSound, toggleSound, enableSound, isAudioInitialized, playFastestLapSound, setSoundMode, getAudioContext, toggleTTS, isTTSEnabled, playRadioAndSpeak } from './core/Audio.js';
import { initReportFeature, showReportButton, hideReportButton, generateReport } from './core/Report.js';
import { playEngineerAnalysis, analyzeSetupChange, generateLapSummary, formatTimeForTTS } from './core/RaceEngineer.js';
import { RaceSession } from './core/RaceSession.js';

const engine = new Engine();
initEnvironment(engine.scene);

// Create the Car
const car = new Vehicle();
engine.scene.add(car.group);

// Create a persistent group for the circuit
const circuitGroup = new THREE.Group();
engine.scene.add(circuitGroup);

// Create a separate group for decorations (trees and buildings)
const decorationsGroup = new THREE.Group();
engine.scene.add(decorationsGroup);

// Decoration toggle state
let showDecorations = true;

const camera = new Camera(engine.camera, car, engine.scene);

// Initialize Weather system
const weather = new Weather(engine.scene, camera);

// --- Race Session State ---
const session = new RaceSession();
let lapStartTime = 0;
let lastFrameTime = performance.now();
let progress = 0;
let currentSpeed = 0;
let trackCurve = null;
let warningPlayed = false;

// Configuration variables (controlled by sliders)
let maxSpeed = 200;
let acceleration = 50;
let grip = 0.8;
let brakePower = 6;
let downforce = 1.0;
let uiHideMode = 0;

// Get compound-specific values from the car's tire compound definitions
function getTireWearRate() {
    const baseRate = car.tireCompounds[session.currentTireCompound].wear;
    const benchmarkLaps = 10;
    const scalingFactor = benchmarkLaps / Math.max(1, session.totalLaps);
    return baseRate * scalingFactor;
}

function getTireGripBonus() {
    return car.tireCompounds[session.currentTireCompound].grip;
}

let lastSetupValues = {
    maxSpeed: maxSpeed,
    acceleration: acceleration,
    grip: grip,
    brakePower: brakePower,
    downforce: downforce,
    tireCompound: session.currentTireCompound
};

function updateLapDisplay() {
    const lapEl = document.getElementById('currentLap');
    if (lapEl) {
        if (session.simulationRunning) {
            lapEl.textContent = `${session.currentLap} / ${session.totalLaps}`;
        } else {
            lapEl.textContent = '-';
        }
    }
}

function recordLap(time) {
    const result = session.recordLap(time);
    const { lapNumber, stopPerformed, adjustedTime, isLastLap, isNewBest, previousBest } = result;

    if (stopPerformed) {
        const boxBtn = document.getElementById('boxBtn');
        if (boxBtn) {
            boxBtn.style.background = '';
            boxBtn.style.color = '';
        }
    }

    const li = document.createElement('li');
    const stopIndicator = stopPerformed ? '<span class="pit-stop-tag">PIT</span> ' : '';
    li.innerHTML = `<span class="lap-num">Lap ${lapNumber}:</span> ${stopIndicator}<span>${RaceSession.formatTime(adjustedTime)}</span>`;

    if (isNewBest) {
        const bestLapEl = document.getElementById('bestLap');
        if (bestLapEl) {
            bestLapEl.textContent = RaceSession.formatTime(session.bestLap);
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

    // Race engineer voice summary
    if (isTTSEnabled()) {
        if (stopPerformed) {
            playRadioAndSpeak("Fresh tires fitted. Let's see what we can do on this set.");
        } else {
            const summary = generateLapSummary(adjustedTime, lapNumber, previousBest, isLastLap, session.tireHealth, getTireWearRate());
            playRadioAndSpeak(summary);
        }
    }
}

function clearLapHistory() {
    session.reset();
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

function resetOnParamChange() {
    if (session.simulationRunning) {
        session.simulationRunning = false;
        progress = 0;
        session.reset();
        clearLapHistory();
        lapStartTime = 0;
        updateLapDisplay();
        const launchBtn = document.getElementById('launchBtn');
        if (launchBtn) launchBtn.textContent = "LAUNCH SIMULATION";
        const boxBtn = document.getElementById('boxBtn');
        if (boxBtn) {
            boxBtn.style.display = 'none';
            boxBtn.style.background = '';
            boxBtn.style.color = '';
        }
        session.pitRequested = false;
        const currentTimeEl = document.getElementById('currentTime');
        if (currentTimeEl) currentTimeEl.textContent = '--:--.---';
        const speedEl = document.getElementById('currentSpeed');
        if (speedEl) speedEl.textContent = "0 km/h";
        hideReportButton();
        // Reset car to start position
        loadCircuit(document.getElementById('circuitSelect').value);
    }
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

    // Dynamically profile custom circuits based on drawn points
    if (id === 'custom') {
        config.characteristics = analyzeCircuitGeometry(config.points);
    }

    // 1. Update Ground Color
    const ground = engine.scene.getObjectByName('ground');
    if (ground) ground.material.color.set(config.groundColor);

    // 2. Rebuild Circuit
    const result = createCircuit(circuitGroup, config, decorationsGroup);
    trackCurve = result.circuitCurve;

    // Apply decorations toggle state
    if (decorationsGroup) {
        decorationsGroup.visible = showDecorations;
    }

    // 3. Reset Car Position
    const startPos = trackCurve.getPointAt(0);
    const startTangent = trackCurve.getTangentAt(0).normalize();

    car.group.position.copy(startPos);
    car.group.position.y = 0.61;
    const lookAtPos = new THREE.Vector3().copy(startPos).add(startTangent);
    car.group.lookAt(lookAtPos.x, 0.61, lookAtPos.z);

    // 4. Reset Camera to Start
    camera.resetCameraForCircuit(trackCurve);

    // 5. Update Circuit Info Display
    updateCircuitDisplay(config);
    const circuitInfoPanel = document.getElementById('circuit-info');
    if (circuitInfoPanel) {
        if (uiHideMode === 0) {
            circuitInfoPanel.style.display = 'flex';
        } else {
            circuitInfoPanel.style.display = 'none';
        }
    }

    // Race Engineer circuit intro
    const chars = config.characteristics;
    const format = session.totalLaps <= 5 ? "sprint" : (session.totalLaps <= 15 ? "standard" : "endurance");
    const introText = `Circuit loaded: ${config.name}. This is a ${chars.speed} speed, ${chars.type} layout. We've adjusted the tire wear for a ${session.totalLaps} lap ${format}. I'll analyze your setup changes for the ${chars.straights} straights and ${chars.braking} braking zones.`;
    playEngineerAnalysis(introText);

    // Reset simulation state
    progress = 0;
    currentSpeed = 0;
    session.simulationRunning = false;
    lapStartTime = 0;
    clearLapHistory();
    const launchBtn = document.getElementById('launchBtn');
    if (launchBtn) launchBtn.textContent = "LAUNCH SIMULATION";
    hideReportButton();
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
        session.totalLaps = parseInt(e.target.value) || 5;
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
        resetOnParamChange();
    });
    maxSpeedInput.addEventListener('change', (e) => {
        analyzeSetupChange('maxSpeed', parseInt(e.target.value), { lastSetupValues, totalLaps: session.totalLaps, weather, car });
    });
}

// Acceleration Input Handler
const accelerationInput = document.getElementById('acceleration');
const accelerationValue = document.getElementById('accelerationValue');
if (accelerationInput) {
    accelerationInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        acceleration = value;
        if (accelerationValue) accelerationValue.textContent = value;
        resetOnParamChange();
    });
    accelerationInput.addEventListener('change', (e) => {
        analyzeSetupChange('acceleration', parseInt(e.target.value), { lastSetupValues, totalLaps: session.totalLaps, weather, car });
    });
}

// Grip Input Handler
const gripInput = document.getElementById('grip');
const gripValue = document.getElementById('gripValue');
if (gripInput) {
    gripInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        grip = value;
        if (gripValue) gripValue.textContent = value.toFixed(1);
        resetOnParamChange();
    });
    gripInput.addEventListener('change', (e) => {
        analyzeSetupChange('grip', parseFloat(e.target.value), { lastSetupValues, totalLaps: session.totalLaps, weather, car });
    });
}

// Brake Input Handler
const brakePowerInput = document.getElementById('brakePower');
const brakePowerValue = document.getElementById('brakePowerValue');
if (brakePowerInput) {
    brakePowerInput.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        brakePower = value;
        if (brakePowerValue) brakePowerValue.textContent = value;
        resetOnParamChange();
    });
    brakePowerInput.addEventListener('change', (e) => {
        analyzeSetupChange('brakePower', parseInt(e.target.value), { lastSetupValues, totalLaps: session.totalLaps, weather, car });
    });
}

// Aero Downforce Input Handler
const downforceInput = document.getElementById('downforce');
const downforceValue = document.getElementById('downforceValue');
if (downforceInput) {
    downforceInput.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        downforce = value;
        if (downforceValue) downforceValue.textContent = value.toFixed(1);
        resetOnParamChange();
    });
    downforceInput.addEventListener('change', (e) => {
        analyzeSetupChange('downforce', parseFloat(e.target.value), { lastSetupValues, totalLaps: session.totalLaps, weather, car });
    });
}

// Launch Button Handler
const launchBtn = document.getElementById('launchBtn');
if (launchBtn) {
    launchBtn.addEventListener('click', () => {
        if (!session.simulationRunning) {
            // Starting simulation
            session.totalLaps = parseInt(lapsInput?.value) || 5;
            maxSpeed = parseInt(maxSpeedInput?.value) || 200;
            session.tireHealth = 1.0;
            session.currentLap = 1;
            clearLapHistory();
            lapStartTime = performance.now();
            session.simulationRunning = true;
            warningPlayed = false;
            currentSpeed = maxSpeed;
            launchBtn.textContent = "RESET SIMULATION";
            hideReportButton();
            const speedEl = document.getElementById('currentSpeed');
            if (speedEl) speedEl.textContent = `${maxSpeed} km/h`;
            updateLapDisplay();
            // Auto-hide circuit info panel on start
            const circuitInfoPanel = document.getElementById('circuit-info');
            if (circuitInfoPanel) circuitInfoPanel.style.display = 'none';
        } else {
            // Resetting simulation
            session.simulationRunning = false;
            session.pitRequested = false;
            warningPlayed = false;
            const boxBtn = document.getElementById('boxBtn');
            if (boxBtn) {
                boxBtn.style.display = 'none';
                boxBtn.style.background = '';
                boxBtn.style.color = '';
            }
            session.currentLap = 1;
            lapStartTime = 0;
            updateLapDisplay();
            launchBtn.textContent = "LAUNCH SIMULATION";
            const currentTimeEl = document.getElementById('currentTime');
            if (currentTimeEl) currentTimeEl.textContent = '--:--.---';
            loadCircuit(document.getElementById('circuitSelect').value);
        }
    });
}

// --- Box (Pit Stop) Button Handler ---
const boxBtn = document.getElementById('boxBtn');
if (boxBtn) {
    boxBtn.addEventListener('click', () => {
        if (!session.simulationRunning || session.currentLap >= session.totalLaps) return;

        session.pitRequested = !session.pitRequested;
        if (session.pitRequested) {
            boxBtn.style.background = '#ffeb3b';
            boxBtn.style.color = '#000';
            playEngineerAnalysis("Copy that. Box, box, box.");
        } else {
            boxBtn.style.background = '';
            boxBtn.style.color = '';
            playEngineerAnalysis("Cancel pit stop. Stay out, stay out.");
        }
    });
}

// --- Sound Mode Selection ---
const dynamicSoundBtn = document.getElementById('dynamicSoundBtn');
const realSoundBtn = document.getElementById('realSoundBtn');

// --- Decorations Toggle ---
const toggleDecorBtn = document.getElementById('toggleDecorBtn');
if (toggleDecorBtn) {
    toggleDecorBtn.addEventListener('click', () => {
        showDecorations = !showDecorations;
        if (decorationsGroup) {
            decorationsGroup.visible = showDecorations;
        }
        // Update button visual state
        if (showDecorations) {
            toggleDecorBtn.classList.add('active');
        } else {
            toggleDecorBtn.classList.remove('active');
        }
    });
}

// --- Rain Toggle ---
const toggleRainBtn = document.getElementById('toggleRainBtn');
const rainHint = document.getElementById('rainHint');
const intermediateTyreBtn = document.getElementById('intermediateTyreBtn');
const wetTyreBtn = document.getElementById('wetTyreBtn');

if (toggleRainBtn) {
    toggleRainBtn.addEventListener('click', () => {
        // Initialize audio if needed
        if (!isAudioInitialized()) {
            initAudio();
        }
        const isRaining = weather.toggle(getAudioContext());
        if (typeof car !== 'undefined' && car.setRainMode) {
            car.setRainMode(isRaining);
        }
        // Update button visual state
        if (isRaining) {
            toggleRainBtn.classList.add('active');
            if (intermediateTyreBtn) intermediateTyreBtn.style.display = 'block';
            if (wetTyreBtn) wetTyreBtn.style.display = 'block';
            if (softTyreBtn) softTyreBtn.style.display = 'none';
            if (mediumTyreBtn) mediumTyreBtn.style.display = 'none';
            if (hardTyreBtn) hardTyreBtn.style.display = 'none';
            
            // Switch to inters if currently on dry tires when rain starts
            if (['soft', 'medium', 'hard'].includes(session.currentTireCompound)) {
                updateCompoundUI('intermediate');
            }
        } else {
            toggleRainBtn.classList.remove('active');
            if (intermediateTyreBtn) intermediateTyreBtn.style.display = 'none';
            if (wetTyreBtn) wetTyreBtn.style.display = 'none';
            if (softTyreBtn) softTyreBtn.style.display = 'block';
            if (mediumTyreBtn) mediumTyreBtn.style.display = 'block';
            if (hardTyreBtn) hardTyreBtn.style.display = 'block';
            
            // Revert to medium if a wet tire was selected when it stops raining
            if (session.currentTireCompound === 'intermediate' || session.currentTireCompound === 'wet') {
                updateCompoundUI('medium');
            }
        }
        // Show/hide rain hint
        if (rainHint) {
            rainHint.style.display = isRaining ? 'block' : 'none';
        }
        // Reset simulation to maintain valid performance measurements (rain affects grip)
        resetOnParamChange();
    });
}

// --- Radio Engineer Toggle ---
const toggleRadioEngineerBtn = document.getElementById('toggleRadioEngineerBtn');
if (toggleRadioEngineerBtn) {
    toggleRadioEngineerBtn.addEventListener('click', () => {
        const enabled = toggleTTS();
        if (enabled) {
            toggleRadioEngineerBtn.classList.add('active');
            if (!isAudioInitialized()) {
                initAudio();
            }
            
            const circuitId = document.getElementById('circuitSelect')?.value || 'classic';
            const config = CIRCUIT_CONFIGS[circuitId];
            // Race Engineer circuit intro
            const chars = config.characteristics;
            const format = session.totalLaps <= 5 ? "sprint" : (session.totalLaps <= 15 ? "standard" : "endurance");
            const introText = `Race engineer online. We're at ${config.name}. This is a ${chars.speed} speed, ${chars.type} layout. We've adjusted the tire wear for a ${session.totalLaps} lap ${format}. I'll analyze your setup changes for the ${chars.straights} straights and ${chars.braking} braking zones.`;
            playEngineerAnalysis(introText);
        } else {
            toggleRadioEngineerBtn.classList.remove('active');
        }
    });
}

function updateSoundUI(enabled) {
    const soundValue = document.getElementById('soundStatus');
    if (soundValue) {
        soundValue.textContent = enabled ? 'On' : 'Off';
        soundValue.className = enabled ? 'value' : 'value off';
    }
}

if (dynamicSoundBtn && realSoundBtn) {
    dynamicSoundBtn.addEventListener('click', () => {
        setSoundMode('dynamic');
        dynamicSoundBtn.classList.add('active');
        realSoundBtn.classList.remove('active');
        // Initialize and enable audio on first explicit mode choice
        if (!isAudioInitialized()) {
            initAudio();
            enableSound();
            updateSoundUI(true);
        }
    });

    realSoundBtn.addEventListener('click', () => {
        setSoundMode('real');
        realSoundBtn.classList.add('active');
        dynamicSoundBtn.classList.remove('active');
        // Initialize and enable audio on first explicit mode choice
        if (!isAudioInitialized()) {
            initAudio();
            enableSound();
            updateSoundUI(true);
        }
    });
}

// --- Tyre Compound Selection ---
const softTyreBtn = document.getElementById('softTyreBtn');
const mediumTyreBtn = document.getElementById('mediumTyreBtn');
const hardTyreBtn = document.getElementById('hardTyreBtn');
const compoundGripEl = document.getElementById('compoundGrip');
const compoundWearEl = document.getElementById('compoundWear');
const currentCompoundEl = document.getElementById('currentCompound');

function updateCompoundUI(compound) {
    if (session.simulationRunning && session.currentTireCompound !== compound) {
        // Request pit stop for next lap instead of resetting
        session.currentTireCompound = compound; // Pre-select for next set
        if (!session.pitRequested) {
            const boxBtn = document.getElementById('boxBtn');
            if (boxBtn) {
                session.pitRequested = true;
                boxBtn.style.background = '#ffeb3b';
                boxBtn.style.color = '#000';
            }
            playEngineerAnalysis("Copy that, we'll ready the " + car.tireCompounds[compound].name + " tires. Box this lap.");
        }
        return;
    }

    session.currentTireCompound = compound;

    // Update button states
    softTyreBtn?.classList.remove('active');
    mediumTyreBtn?.classList.remove('active');
    hardTyreBtn?.classList.remove('active');
    intermediateTyreBtn?.classList.remove('active');
    wetTyreBtn?.classList.remove('active');

    if (compound === 'soft') softTyreBtn?.classList.add('active');
    if (compound === 'medium') mediumTyreBtn?.classList.add('active');
    if (compound === 'hard') hardTyreBtn?.classList.add('active');
    if (compound === 'intermediate') intermediateTyreBtn?.classList.add('active');
    if (compound === 'wet') wetTyreBtn?.classList.add('active');

    // Update stats display
    const compoundData = car.tireCompounds[compound];
    if (compoundGripEl) {
        const sign = compoundData.grip >= 0 ? '+' : '';
        compoundGripEl.textContent = `Grip: ${sign}${compoundData.grip}`;
    }
    if (compoundWearEl) {
        const wear = getTireWearRate();
        compoundWearEl.textContent = `Wear: ${Math.round(wear * 100)}%/lap`;
    }

    // Update stats panel
    if (currentCompoundEl) {
        currentCompoundEl.textContent = compoundData.name;
        currentCompoundEl.className = `value compound-${compound}`;
    }

    // Update car visuals
    car.setCompound(compound);

    // Reset simulation if running (this branch only hit if simulation NOT running or same compound)
    if (!session.simulationRunning) {
        resetOnParamChange();
    }
    
    analyzeSetupChange('tireCompound', compound, { lastSetupValues, totalLaps: session.totalLaps, weather, car });
}

if (softTyreBtn && mediumTyreBtn && hardTyreBtn) {
    softTyreBtn.addEventListener('click', () => updateCompoundUI('soft'));
    mediumTyreBtn.addEventListener('click', () => updateCompoundUI('medium'));
    hardTyreBtn.addEventListener('click', () => updateCompoundUI('hard'));
    if (intermediateTyreBtn) intermediateTyreBtn.addEventListener('click', () => updateCompoundUI('intermediate'));
    if (wetTyreBtn) wetTyreBtn.addEventListener('click', () => updateCompoundUI('wet'));
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
        updateSoundUI(isEnabled);
    }

    // Panel toggle with 'h' key
    if (e.key === 'h' || e.key === 'H') {
        uiHideMode = (uiHideMode + 1) % 3; // Cycle through 3 states: 0=All, 1=Stats only, 2=None

        const controlsPanel = document.getElementById('controls');
        const statsPanel = document.getElementById('stats');
        const circuitInfoPanel = document.getElementById('circuit-info');
        const uiHint = document.getElementById('ui-hint');
        const floatingMinimap = document.getElementById('floating-minimap-container');

        if (uiHideMode === 0) {
            // Show all panels
            if (controlsPanel) controlsPanel.style.display = 'block';
            if (statsPanel) statsPanel.style.display = 'block';
            if (uiHint) uiHint.style.display = 'none';
            if (floatingMinimap) floatingMinimap.style.display = 'none';
            // Show circuit-info only if simulation is not running (it might have been hidden by simulation start)
            if (circuitInfoPanel && !session.simulationRunning) circuitInfoPanel.style.display = 'flex';
        } else if (uiHideMode === 1) {
            // Show stats only
            if (controlsPanel) controlsPanel.style.display = 'none';
            if (statsPanel) statsPanel.style.display = 'block';
            if (uiHint) uiHint.style.display = 'none';
            if (floatingMinimap) floatingMinimap.style.display = 'none';
            // Also hide circuit-info in mode 1 for focus
            if (circuitInfoPanel) circuitInfoPanel.style.display = 'none';
        } else {
            // Hide all panels - show floating minimap with HUD
            if (controlsPanel) controlsPanel.style.display = 'none';
            if (statsPanel) statsPanel.style.display = 'none';
            if (circuitInfoPanel) circuitInfoPanel.style.display = 'none';
            if (uiHint) uiHint.style.display = 'block';
            if (floatingMinimap) floatingMinimap.style.display = 'flex';
        }
    }
});

// --- Real-time Minimap ---
function drawRealtimeMinimap(canvasId, width, height) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !trackCurve) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = width;
    const h = canvas.height = height;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Get track points with high sampling
    const drawPoints = trackCurve.getPoints(100);

    // Calculate bounds
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    drawPoints.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
    });

    const rangeX = maxX - minX;
    const rangeZ = maxZ - minZ;
    const padding = 15;
    const scale = Math.min((w - padding * 2) / rangeX, (h - padding * 2) / rangeZ);

    const offsetX = (w - rangeX * scale) / 2 - minX * scale;
    const offsetZ = (h - rangeZ * scale) / 2 - minZ * scale;

    // Helper to transform world coordinates to canvas
    const worldToCanvas = (x, z) => ({
        x: x * scale + offsetX,
        y: z * scale + offsetZ
    });

    // Draw track path
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(225, 6, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';

    drawPoints.forEach((p, i) => {
        const pos = worldToCanvas(p.x, p.z);
        if (i === 0) ctx.moveTo(pos.x, pos.y);
        else ctx.lineTo(pos.x, pos.y);
    });

    ctx.closePath();
    ctx.stroke();

    // Draw start/finish line
    const startPos = worldToCanvas(drawPoints[0].x, drawPoints[0].z);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();
    ctx.arc(startPos.x, startPos.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw car position if simulation is running or car exists
    if (car && progress !== undefined) {
        const carWorldPos = trackCurve.getPointAt(progress % 1);
        const carPos = worldToCanvas(carWorldPos.x, carWorldPos.z);

        // Car indicator with glow
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ff88';
        ctx.fillStyle = '#00ff88';
        ctx.beginPath();
        ctx.arc(carPos.x, carPos.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Direction indicator
        const tangent = trackCurve.getTangentAt(progress % 1);
        const angle = Math.atan2(tangent.x, tangent.z);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(carPos.x, carPos.y);
        ctx.lineTo(
            carPos.x + Math.sin(angle) * 10,
            carPos.y + Math.cos(angle) * 10
        );
        ctx.stroke();
    }
}

function updateFloatingMinimapHUD() {
    const floatingContainer = document.getElementById('floating-minimap-container');
    if (!floatingContainer || floatingContainer.style.display === 'none') return;

    const lapEl = document.getElementById('minimap-lap');
    const laptimeEl = document.getElementById('minimap-laptime');
    const speedEl = document.getElementById('minimap-speed');
    const cameraEl = document.getElementById('minimap-camera');

    if (lapEl) {
        if (session.simulationRunning) {
            lapEl.textContent = `Lap ${session.currentLap}/${session.totalLaps}`;
        } else {
            lapEl.textContent = 'Ready';
        }
    }

    if (laptimeEl) {
        if (session.simulationRunning && lapStartTime > 0) {
            const lapElapsed = (performance.now() - lapStartTime) / 1000;
            laptimeEl.textContent = RaceSession.formatTime(lapElapsed);
        } else {
            laptimeEl.textContent = '--:--.---';
        }
    }

    if (speedEl) {
        speedEl.textContent = `${Math.round(currentSpeed)} km/h`;
    }

    if (cameraEl) {
        cameraEl.textContent = camera.camModeLabels[camera.camMode];
    }
}

// Initial load
loadCircuit('classic');

// Initialize tyre compound UI
updateCompoundUI('medium');

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

    if (session.simulationRunning && trackCurve) {
        // Calculate track curvature at current position
        const trackLength = trackCurve.getLength();
        const lookAheadDistance = 20; // 20 meters absolute lookahead
        const lookAheadStep = lookAheadDistance / trackLength;
        const tangent = trackCurve.getTangentAt(progress);
        const lookAhead = (progress + lookAheadStep) % 1; 
        const nextTangent = trackCurve.getTangentAt(lookAhead);
        const angle = tangent.angleTo(nextTangent);
        
        // Quadratic response: normalized to absolute distance
        const curvature = Math.pow(Math.min(1.0, angle * 8.0), 2); 

        // --- Cornering Grip Logic ---
        const compoundBonus = getTireGripBonus();
        const wearPenalty = (1.0 - session.tireHealth) * 0.45; // Max 0.45 grip loss at 0% health
        const downforceGripBonus = (downforce - 1.0) * 0.4;
        
        let rainGripFactor = 1.0;
        if (weather.isRainEnabled()) {
            if (session.currentTireCompound === 'wet') {
                rainGripFactor = 0.95; 
            } else if (session.currentTireCompound === 'intermediate') {
                rainGripFactor = 0.85; 
            } else {
                rainGripFactor = 0.6; // 40% grip reduction in rain for slicks
            }
        } else {
            if (session.currentTireCompound === 'wet') {
                rainGripFactor = 0.4; // Terrible in dry
            } else if (session.currentTireCompound === 'intermediate') {
                rainGripFactor = 0.6; // Bad in dry
            }
        }

        const baseGrip = (grip + compoundBonus - wearPenalty + downforceGripBonus) * rainGripFactor;
        const effectiveGrip = Math.min(1.6, Math.max(0.1, baseGrip));

        // Aero drag penalty from downforce (higher downforce = lower top speed)
        const aeroDragFactor = (downforce - 1.0) * 0.15;
        const effectiveMaxSpeed = maxSpeed * (1.0 - aeroDragFactor);

        // Target speed calculation - slower in corners, faster on straights
        // Using a reciprocal formula ensures that even high grip has a limit.
        // Added a small deadzone (0.01) to allow 100% speed on very gentle sweeps.
        const speedPenalty = Math.max(0, curvature - 0.01) * (0.45 / effectiveGrip);
        let targetSpeed = effectiveMaxSpeed * (1.0 - Math.min(0.85, speedPenalty));

        targetSpeed = Math.max(effectiveMaxSpeed * 0.15, targetSpeed); // Minimum 15% of effective max speed
        // Acceleration/deceleration logic
        const accelKmhPerSec = (acceleration / 100) * 200;
        const accelRate = accelKmhPerSec * dt;

        // Braking logic: decoupled from engine acceleration and limited by tire grip
        const baseBrakingForce = 18; // km/h/s per 1x of brakePower
        const gripLimitConstant = 110; // Max km/h/s of deceleration per 1.0 of effectiveGrip
        
        const potentialDecelKmhPerSec = baseBrakingForce * brakePower;
        const maxDecelKmhPerSec = effectiveGrip * gripLimitConstant;
        const actualDecelKmhPerSec = Math.min(potentialDecelKmhPerSec, maxDecelKmhPerSec);
        const decelRate = actualDecelKmhPerSec * dt;

        let estimatedAccel = 0;
        if (currentSpeed < targetSpeed) {
            currentSpeed = Math.min(currentSpeed + accelRate, targetSpeed);
            estimatedAccel = accelKmhPerSec;
        } else {
            currentSpeed = Math.max(currentSpeed - decelRate, targetSpeed);
            estimatedAccel = -actualDecelKmhPerSec;
        }

        // Apply visual effects (Pitch: Dive/Squat, Roll: Lean, Steering: Wheel turn)
        if (car && car.body) {
            // 1. Chassis Pitch (Dive/Squat)
            const pitchFactor = 0.0004;
            const targetPitch = THREE.MathUtils.clamp(-estimatedAccel * pitchFactor, -0.05, 0.05); // Max ~3 degrees
            car.body.rotation.x = THREE.MathUtils.lerp(car.body.rotation.x, targetPitch, 0.1);

            // 2. Chassis Roll (Lean)
            const cross = new THREE.Vector3().crossVectors(tangent, nextTangent);
            const rollDirection = cross.y > 0 ? 1 : -1;
            const maxRoll = 0.04; // Max ~2.3 degrees
            const targetRoll = rollDirection * curvature * (currentSpeed / effectiveMaxSpeed) * maxRoll;
            car.body.rotation.z = THREE.MathUtils.lerp(car.body.rotation.z, targetRoll, 0.08);

            // 3. Steering Wheel Rotation
            if (car.steeringWheel) {
                const wheelRot = rollDirection * curvature * 1.8; // More aggressive wheel turn
                car.steeringWheel.rotation.z = THREE.MathUtils.lerp(car.steeringWheel.rotation.z, wheelRot, 0.15);
            }

            // 4. Dynamic Shift Lights
            if (car.shiftLights && car.shiftLights.length > 0) {
                const rpmRatio = currentSpeed / effectiveMaxSpeed;
                const numLights = car.shiftLights.length;

                car.shiftLights.forEach((light, i) => {
                    // Map indices so high index (Green) turns on first
                    const threshold = 0.4 + (((numLights - 1) - i) / (numLights - 1)) * 0.5;

                    // Hysteresis to prevent flickering
                    const isAlreadyOn = light.mesh.material.emissiveIntensity > 0.2;
                    const margin = 0.03;
                    const activeThreshold = isAlreadyOn ? threshold - margin : threshold;

                    if (rpmRatio > 0.98) {
                        // Flash all lights at the very limit
                        const isFlashOn = Math.sin(performance.now() * 0.025) > 0;
                        light.mesh.material.emissiveIntensity = isFlashOn ? 2 : 0;
                    } else if (rpmRatio > activeThreshold) {
                        light.mesh.material.emissiveIntensity = 1.5;
                    } else {
                        light.mesh.material.emissiveIntensity = 0;
                    }
                });
            }
        }

        currentSpeed = Math.max(effectiveMaxSpeed * 0.1, Math.min(currentSpeed, effectiveMaxSpeed));

        // Update speed display
        const speedText = `${Math.round(currentSpeed)} km/h`;
        const speedEl = document.getElementById('currentSpeed');
        if (speedEl) speedEl.textContent = speedText;

        // Update tire health display
        const tireHealthEl = document.getElementById('tireHealth');
        if (tireHealthEl) {
            tireHealthEl.textContent = `${Math.max(0, Math.round(session.tireHealth * 100))}%`;
            // Color interpolation: Red (0%) to Green (100%)
            const r = Math.round(255 * (1 - session.tireHealth));
            const g = Math.round(200 * session.tireHealth);
            tireHealthEl.style.color = `rgb(${r}, ${g}, 0)`;
        }

        // --- Box Button Pulse/Alert Logic ---
        const boxBtn = document.getElementById('boxBtn');
        if (boxBtn) {
            // Only show if simulation is running AND there is a strategic "need"
            const needsPit = (session.tireHealth < 0.6 && session.currentLap < session.totalLaps) || session.pitRequested;
            boxBtn.style.display = (session.simulationRunning && needsPit) ? 'block' : 'none';

            if (session.pitRequested) {
                // Keep solid yellow when requested
                boxBtn.style.background = '#ffeb3b';
                boxBtn.style.color = '#000';
                boxBtn.style.borderWidth = '2px';
                boxBtn.style.boxShadow = '0 0 15px rgba(255, 235, 59, 0.5)';
            } else if (session.tireHealth < 0.3 && session.currentLap < session.totalLaps) {
                // Pulse red when critical health but not yet requested
                const pulse = (Math.sin(Date.now() * 0.01) + 1) / 2;
                boxBtn.style.borderColor = `rgb(255, ${Math.round(235 * (1 - pulse))}, ${Math.round(59 * (1 - pulse))})`;
                boxBtn.style.boxShadow = `0 0 ${10 + pulse * 10}px rgba(255, 0, 0, ${0.3 + pulse * 0.5})`;
                boxBtn.style.color = pulse > 0.5 ? '#fff' : '#ffeb3b';

                // One-time engineer warning per lap
                if (!warningPlayed && isTTSEnabled()) {
                    playEngineerAnalysis("Tire wear is critical. Box, box!");
                    warningPlayed = true;
                }
            } else {
                // Standard state: added subtle glow and background for better visibility
                boxBtn.style.background = 'rgba(255, 235, 59, 0.05)';
                boxBtn.style.color = '#ffeb3b';
                boxBtn.style.borderColor = '#ffeb3b';
                boxBtn.style.borderWidth = '2px';
                boxBtn.style.boxShadow = '0 0 10px rgba(255, 235, 59, 0.2)';
            }
        }

        // Update lap time display
        const lapElapsed = (now - lapStartTime) / 1000;
        const timeText = RaceSession.formatTime(lapElapsed);
        const currentTimeEl = document.getElementById('currentTime');
        if (currentTimeEl) currentTimeEl.textContent = timeText;

        // Convert speed from km/h to meters/sec
        const metersPerSec = currentSpeed * 0.277778;

        const previousProgress = progress;
        progress += (metersPerSec * dt) / trackLength;

        // Check if lap completed
        if (progress >= 1) {
            const lapTime = (now - lapStartTime) / 1000;
            // Reduce tire health for the lap just completed
            session.tireHealth = Math.max(0, session.tireHealth - getTireWearRate());
            recordLap(lapTime);
            progress -= 1;
            lapStartTime = now;
            session.currentLap++;
            warningPlayed = false; // Reset warning for next lap

            updateLapDisplay();
            if (session.currentLap > session.totalLaps) {
                session.simulationRunning = false;
                launchBtn.textContent = "SIMULATION FINISHED - LAUNCH AGAIN";
                showReportButton();
                currentSpeed = 0;
                if (speedEl) speedEl.textContent = "0 km/h";
                const currentTimeEl = document.getElementById('currentTime');
                if (currentTimeEl) currentTimeEl.textContent = '--:--.---';
            }
        }

        const position = trackCurve.getPointAt(progress);
        car.group.position.copy(position);
        car.group.position.y = 0.61;

        const lookAheadU = (progress + 0.015) % 1;
        const lookAtPos = trackCurve.getPointAt(lookAheadU);
        car.group.lookAt(lookAtPos.x, 0.61, lookAtPos.z);
    }

    // Update engine sound
    updateEngineSound(currentSpeed, maxSpeed, session.simulationRunning);

    // Animation loop for camera and simulation updates
    camera.update(progress, currentSpeed, session.simulationRunning);

    // Update weather effects
    weather.update(dt, engine.camera, camera.camMode, currentSpeed);

    // Draw real-time minimaps
    if (uiHideMode === 0 || uiHideMode === 1) {
        // Draw in stats panel when panels are visible
        drawRealtimeMinimap('minimap-panel-canvas', 260, 160);
    } else if (uiHideMode === 2) {
        // Draw floating minimap when all panels are hidden
        drawRealtimeMinimap('realtime-minimap', 180, 140);
        updateFloatingMinimapHUD();
    }
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

// Initialize report feature
initReportFeature(() => {
    const state = {
        lapTimes: session.lapTimes,
        currentCircuitId: document.getElementById('circuitSelect')?.value || 'classic',
        totalLaps: session.totalLaps,
        maxSpeed,
        acceleration,
        grip,
        brakePower,
        downforce,
        currentTireCompound: session.currentTireCompound,
        tireHealth: session.tireHealth,
        circuitConfigs: CIRCUIT_CONFIGS,
        trackCurve,
        tireCompounds: car.tireCompounds,
        isRaining: weather.isRainEnabled(),
        formatTime: RaceSession.formatTime
    };
    generateReport(state);
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
