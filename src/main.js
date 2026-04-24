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
let acceleration = 50; // Acceleration rating (10-100)
let grip = 0.8;
let brakePower = 6;
let downforce = 1.0;
let tireHealth = 1.0;
let lapStartTime = 0;
let lapTimes = [];
let bestLap = Infinity;
let currentTireCompound = 'medium'; // soft, medium, hard
let pitRequested = false; // Flag for pit stop on next lap completion
let warningPlayed = false; // Flag to prevent repetitive engineer warnings per lap

// Get compound-specific values from the car's tire compound definitions
function getTireWearRate() {
    const baseRate = car.tireCompounds[currentTireCompound].wear;
    const benchmarkLaps = 10; // The base rates in Vehicle.js are tuned for a 10-lap race
    const scalingFactor = benchmarkLaps / Math.max(1, totalLaps);
    return baseRate * scalingFactor;
}

function getTireGripBonus() {
    return car.tireCompounds[currentTireCompound].grip;
}

let lastSetupValues = {
    maxSpeed: maxSpeed,
    acceleration: acceleration,
    grip: grip,
    brakePower: brakePower,
    downforce: downforce,
    tireCompound: currentTireCompound
};

function playEngineerAnalysis(text) {
    if (isTTSEnabled()) {
        playRadioAndSpeak(text);
    }
}

function analyzeSetupChange(param, newValue) {
    const oldValue = lastSetupValues[param];
    if (oldValue === newValue) return;

    const circuitId = document.getElementById('circuitSelect')?.value || 'classic';
    const config = CIRCUIT_CONFIGS[circuitId];
    if (!config.characteristics && id === 'custom') {
        config.characteristics = analyzeCircuitGeometry(config.points);
    }
    const chars = config.characteristics;
    const targets = getIdealSetup(chars);
    const isRaining = weather.isRainEnabled();

    let text = "";
    const margin = 0.1; // Percentage margin for "optimal" range
    
    if (param === 'maxSpeed') {
        const diffToTarget = newValue - targets.maxSpeed;
        if (Math.abs(diffToTarget) < targets.maxSpeed * 0.05) {
            text = "Spot on. That top speed is perfectly balanced for this circuit's straights.";
        } else if (newValue > targets.maxSpeed) {
            text = "We've got plenty of top speed now, perhaps too much. We might be sacrificing too much elsewhere to reach it.";
        } else {
            text = "Good increase, but we're still a bit short on top end for these straights. Keep pushing it up.";
        }
        // Special case for decreasing when already too low
        if (newValue < oldValue && newValue < targets.maxSpeed - 20) {
            text = "Wait, we're already slow on the straights. Decreasing top speed further will really hurt our lap times.";
        }
    } else if (param === 'acceleration') {
        if (Math.abs(newValue - targets.acceleration) < 5) {
            text = "That's the sweet spot for acceleration. Great punch out of the corners without spinning the wheels.";
        } else if (newValue > targets.acceleration) {
            text = "That's a lot of torque. It might be hard to manage the traction on corner exit.";
        } else {
            text = "Better, but we still need more 'get-up-and-go' for this layout.";
        }
    } else if (param === 'grip') {
        if (Math.abs(newValue - targets.grip) < 0.1) {
            text = "The mechanical grip feels perfect now. The car is balanced and predictable.";
        } else if (newValue > targets.grip) {
            text = "We have massive grip now, but be careful of the car feeling too heavy or 'lazy' in quick transitions.";
        } else {
            text = "Increased grip is good, but I think we can find even more stability in the high-speed sections.";
        }
    } else if (param === 'brakePower') {
        if (newValue >= targets.brakePower) {
            text = "Excellent stopping power. That's exactly what we need for these heavy braking zones.";
        } else {
            text = "Stronger brakes, but I'd still like more bite for the big stops at the end of the straights.";
        }
    } else if (param === 'downforce') {
        const diff = newValue - targets.downforce;
        if (Math.abs(diff) < 0.15) {
            text = "Aero balance is perfect. Just enough downforce for the fast turns without too much drag.";
        } else if (newValue > targets.downforce) {
            text = "We've got huge downforce now, great for the sweeps, but the drag will make us a sitting duck on the straights.";
        } else {
            if (newValue > oldValue) text = "Better stability, but we can still add more wing for these fast corners.";
            else text = "Low downforce will help our top speed, but the car will be very nervous in the fast stuff.";
        }
    } else if (param === 'tireCompound') {
        const ideal = targets.idealCompound;
        
        if (newValue === 'soft') {
            if (ideal === 'soft') {
                text = "Perfect choice. Softs will give us the maximum bite needed for these tight corners.";
            } else {
                text = "Softs fitted. They'll be fast, but I'm worried about high-speed degradation on this layout.";
            }
        } else if (newValue === 'medium') {
            if (ideal === 'medium') {
                text = "Mediums are the smart choice here. Good consistency throughout the stint.";
            } else {
                text = "Switching to Mediums. A safe bet, but we might be leaving some time on the table compared to the optimal strategy.";
            }
        } else if (newValue === 'hard') {
            if (ideal === 'hard') {
                text = "Smart move. Hards are the way to go for these long high-speed runs. They'll stay consistent.";
            } else {
                text = "Hard tires? We'll struggle for grip in the slower sections. It's a bold strategy.";
            }
        } else if (newValue === 'intermediate') {
            text = isRaining ? "Good call on the Intermediates. Perfect for this amount of water." : "It's too dry for Intermediates. They'll be destroyed in no time.";
        } else if (newValue === 'wet') {
            text = isRaining ? "Full Wets are necessary now. Safety first in these conditions." : "Way too dry for Wets. You'll have zero grip and ruin the tires.";
        }
    }

    if (text) {
        playEngineerAnalysis(text);
    }
    
    lastSetupValues[param] = newValue;
}

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
    const previousBest = bestLap;
    
    // Handle Pit Stop
    let stopPerformed = false;
    let adjustedTime = time;
    if (pitRequested) {
        adjustedTime += 12; // 12s pit lane penalty
        tireHealth = 1.0;
        pitRequested = false;
        stopPerformed = true;
        
        const boxBtn = document.getElementById('boxBtn');
        if (boxBtn) {
            boxBtn.style.background = '';
            boxBtn.style.color = '';
        }
    }

    lapTimes.push(adjustedTime);
    const lapNumber = lapTimes.length;
    const isLastLap = lapNumber === totalLaps;

    const li = document.createElement('li');
    const stopIndicator = stopPerformed ? '<span class="pit-stop-tag">PIT</span> ' : '';
    li.innerHTML = `<span class="lap-num">Lap ${lapTimes.length}:</span> ${stopIndicator}<span>${formatTime(adjustedTime)}</span>`;

    if (adjustedTime < bestLap) {
        bestLap = adjustedTime;

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

    // Race engineer voice summary
    if (isTTSEnabled()) {
        if (stopPerformed) {
            playRadioAndSpeak("Fresh tires fitted. Let's see what we can do on this set.");
        } else {
            const summary = generateLapSummary(adjustedTime, lapNumber, previousBest, isLastLap);
            playRadioAndSpeak(summary);
        }
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

function formatTimeForTTS(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    let text = '';
    if (mins > 0) text += `${mins} minute${mins !== 1 ? 's' : ''} `;
    text += `${secs} point ${ms.toString().padStart(3, '0')} seconds`;
    return text.trim();
}

function resetOnParamChange() {
    if (simulationRunning) {
        simulationRunning = false;
        progress = 0;
        currentLap = 1;
        tireHealth = 1.0;
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
        pitRequested = false;
        const currentTimeEl = document.getElementById('currentTime');
        if (currentTimeEl) currentTimeEl.textContent = '--:--.---';
        const speedEl = document.getElementById('currentSpeed');
        if (speedEl) speedEl.textContent = "0 km/h";
        hideReportButton();
        // Reset car to start position
        loadCircuit(document.getElementById('circuitSelect').value);
    }
}

function generateLapSummary(time, lapNumber, previousBest, isLastLap) {
    const ttsTime = formatTimeForTTS(time);
    let text = `Lap ${lapNumber} complete. Time, ${ttsTime}. `;

    if (isLastLap) {
        text += `That was the final lap. `;
    }

    if (lapNumber === 1) {
        text += `Good start, keep pushing.`;
    } else if (time < previousBest && previousBest !== Infinity) {
        text += `That is a new fastest lap. Well done.`;
    } else if (previousBest !== Infinity) {
        const diff = time - previousBest;
        const diffMs = Math.round(diff * 1000);
        if (diffMs < 500) {
            text += `You are within half a second of your best. Nice consistency.`;
        } else if (diffMs < 2000) {
            text += `You are ${formatTimeForTTS(diff)} off your best pace. Keep pushing.`;
        } else {
            text += `You are ${formatTimeForTTS(diff)} off your best pace. We need to find some time.`;
        }
    }

    const wornTireHealth = Math.max(0, Math.round((tireHealth - getTireWearRate()) * 100));
    if (wornTireHealth < 30) {
        text += ` Tire wear is critical at ${wornTireHealth} percent. Box this lap if you can.`;
    } else if (wornTireHealth < 60) {
        text += ` Tire wear is now at ${wornTireHealth} percent.`;
    }

    return text;
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
    const format = totalLaps <= 5 ? "sprint" : (totalLaps <= 15 ? "standard" : "endurance");
    const introText = `Circuit loaded: ${config.name}. This is a ${chars.speed} speed, ${chars.type} layout. We've adjusted the tire wear for a ${totalLaps} lap ${format}. I'll analyze your setup changes for the ${chars.straights} straights and ${chars.braking} braking zones.`;
    playEngineerAnalysis(introText);

    // Reset simulation state
    progress = 0;
    currentSpeed = 0;
    simulationRunning = false;
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
        resetOnParamChange();
    });
    maxSpeedInput.addEventListener('change', (e) => {
        analyzeSetupChange('maxSpeed', parseInt(e.target.value));
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
        analyzeSetupChange('acceleration', parseInt(e.target.value));
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
        analyzeSetupChange('grip', parseFloat(e.target.value));
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
        analyzeSetupChange('brakePower', parseInt(e.target.value));
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
        analyzeSetupChange('downforce', parseFloat(e.target.value));
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
            tireHealth = 1.0;
            currentLap = 1;
            clearLapHistory();
            lapStartTime = performance.now();
            simulationRunning = true;
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
            simulationRunning = false;
            pitRequested = false;
            warningPlayed = false;
            const boxBtn = document.getElementById('boxBtn');
            if (boxBtn) {
                boxBtn.style.display = 'none';
                boxBtn.style.background = '';
                boxBtn.style.color = '';
            }
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

// --- Box (Pit Stop) Button Handler ---
const boxBtn = document.getElementById('boxBtn');
if (boxBtn) {
    boxBtn.addEventListener('click', () => {
        if (!simulationRunning) return;

        pitRequested = !pitRequested;
        if (pitRequested) {
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
            if (['soft', 'medium', 'hard'].includes(currentTireCompound)) {
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
            if (currentTireCompound === 'intermediate' || currentTireCompound === 'wet') {
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
            const format = totalLaps <= 5 ? "sprint" : (totalLaps <= 15 ? "standard" : "endurance");
            const introText = `Race engineer online. We're at ${config.name}. This is a ${chars.speed} speed, ${chars.type} layout. We've adjusted the tire wear for a ${totalLaps} lap ${format}. I'll analyze your setup changes for the ${chars.straights} straights and ${chars.braking} braking zones.`;
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
    if (simulationRunning && currentTireCompound !== compound) {
        // Request pit stop for next lap instead of resetting
        currentTireCompound = compound; // Pre-select for next set
        if (!pitRequested) {
            const boxBtn = document.getElementById('boxBtn');
            if (boxBtn) {
                pitRequested = true;
                boxBtn.style.background = '#ffeb3b';
                boxBtn.style.color = '#000';
            }
            playEngineerAnalysis("Copy that, we'll ready the " + car.tireCompounds[compound].name + " tires. Box this lap.");
        }
        return;
    }

    currentTireCompound = compound;

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
    if (!simulationRunning) {
        resetOnParamChange();
    }
    
    analyzeSetupChange('tireCompound', compound);
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
            if (circuitInfoPanel && !simulationRunning) circuitInfoPanel.style.display = 'flex';
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
        if (simulationRunning) {
            lapEl.textContent = `Lap ${currentLap}/${totalLaps}`;
        } else {
            lapEl.textContent = 'Ready';
        }
    }

    if (laptimeEl) {
        if (simulationRunning && lapStartTime > 0) {
            const lapElapsed = (performance.now() - lapStartTime) / 1000;
            laptimeEl.textContent = formatTime(lapElapsed);
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

    if (simulationRunning && trackCurve) {
        // Calculate track curvature at current position
        const tangent = trackCurve.getTangentAt(progress);
        const lookAhead = (progress + 0.02) % 1;
        const nextTangent = trackCurve.getTangentAt(lookAhead);
        const angle = tangent.angleTo(nextTangent);
        const curvature = Math.min(1.0, angle * 15.0); // Normalized curvature [0, 1]

        // --- Cornering Grip Logic ---
        const compoundBonus = getTireGripBonus();
        const wearPenalty = (1.0 - tireHealth) * 0.45; // Max 0.45 grip loss at 0% health
        const downforceGripBonus = (downforce - 1.0) * 0.4;
        
        let rainGripFactor = 1.0;
        if (weather.isRainEnabled()) {
            if (currentTireCompound === 'wet') {
                rainGripFactor = 0.95; 
            } else if (currentTireCompound === 'intermediate') {
                rainGripFactor = 0.85; 
            } else {
                rainGripFactor = 0.6; // 40% grip reduction in rain for slicks
            }
        } else {
            if (currentTireCompound === 'wet') {
                rainGripFactor = 0.4; // Terrible in dry
            } else if (currentTireCompound === 'intermediate') {
                rainGripFactor = 0.6; // Bad in dry
            }
        }

        const baseGrip = (grip + compoundBonus - wearPenalty + downforceGripBonus) * rainGripFactor;
        const effectiveGrip = Math.min(1.4, Math.max(0.1, baseGrip));

        // Aero drag penalty from downforce (higher downforce = lower top speed)
        const aeroDragFactor = (downforce - 1.0) * 0.15;
        const effectiveMaxSpeed = maxSpeed * (1.0 - aeroDragFactor);

        // Target speed calculation - slower in corners, faster on straights
        const speedPenalty = curvature * (1.8 - effectiveGrip);
        let targetSpeed = effectiveMaxSpeed * (1.0 - Math.min(0.8, speedPenalty));

        targetSpeed = Math.max(effectiveMaxSpeed * 0.2, targetSpeed); // Minimum 20% of effective max speed
        // Acceleration/deceleration logic
        const accelKmhPerSec = (acceleration / 100) * 200;
        const accelRate = accelKmhPerSec * dt;

        let estimatedAccel = 0;
        if (currentSpeed < targetSpeed) {
            currentSpeed = Math.min(currentSpeed + accelRate, targetSpeed);
            estimatedAccel = accelKmhPerSec;
        } else {
            currentSpeed = Math.max(currentSpeed - accelRate * brakePower, targetSpeed);
            estimatedAccel = -accelKmhPerSec * brakePower;
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
            tireHealthEl.textContent = `${Math.max(0, Math.round(tireHealth * 100))}%`;
            // Color interpolation: Red (0%) to Green (100%)
            const r = Math.round(255 * (1 - tireHealth));
            const g = Math.round(200 * tireHealth);
            tireHealthEl.style.color = `rgb(${r}, ${g}, 0)`;
        }

        // --- Box Button Pulse/Alert Logic ---
        const boxBtn = document.getElementById('boxBtn');
        if (boxBtn) {
            // Only show if simulation is running AND there is a strategic "need"
            const needsPit = tireHealth < 0.6 || pitRequested;
            boxBtn.style.display = (simulationRunning && needsPit) ? 'block' : 'none';

            if (pitRequested) {
                // Keep solid yellow when requested
                boxBtn.style.background = '#ffeb3b';
                boxBtn.style.color = '#000';
                boxBtn.style.boxShadow = '0 0 15px rgba(255, 235, 59, 0.5)';
            } else if (tireHealth < 0.3) {
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
                // Standard state
                boxBtn.style.background = '';
                boxBtn.style.color = '#ffeb3b';
                boxBtn.style.borderColor = '#ffeb3b';
                boxBtn.style.boxShadow = '';
            }
        }

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

            // Reduce tire health
            tireHealth = Math.max(0, tireHealth - getTireWearRate());
            warningPlayed = false; // Reset warning for next lap

            updateLapDisplay();
            if (currentLap > totalLaps) {
                simulationRunning = false;
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

        const lookAheadU = (progress + 0.01) % 1;
        const lookAtPos = trackCurve.getPointAt(lookAheadU);
        car.group.lookAt(lookAtPos.x, 0.61, lookAtPos.z);
    }

    // Update engine sound
    updateEngineSound(currentSpeed, maxSpeed, simulationRunning);

    // Animation loop for camera and simulation updates
    camera.update(progress, currentSpeed, simulationRunning);

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
        lapTimes,
        currentCircuitId: document.getElementById('circuitSelect')?.value || 'classic',
        totalLaps,
        maxSpeed,
        acceleration,
        grip,
        brakePower,
        downforce,
        currentTireCompound,
        tireHealth,
        circuitConfigs: CIRCUIT_CONFIGS,
        trackCurve,
        tireCompounds: car.tireCompounds,
        isRaining: weather.isRainEnabled(),
        formatTime
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
