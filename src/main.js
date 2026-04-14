import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { initEnvironment } from './core/Environment.js';
import { CIRCUIT_CONFIGS, createCircuit } from './core/Circuit.js';
import { CircuitDesigner } from './core/CircuitDesigner.js';
import { Vehicle } from './core/Vehicle.js';
import { Camera } from './core/Camera.js';
import './style.css';

const engine = new Engine();
initEnvironment(engine.scene);

// Create the Car
const car = new Vehicle();
engine.scene.add(car.group);

// Create a persistent group for the circuit
const circuitGroup = new THREE.Group();
engine.scene.add(circuitGroup);

const camera = new Camera(engine.camera, car, engine.scene);

// --- UI State for 'h' key toggle ---
// This state variable is essential for managing the UI visibility modes for controls and stats panels.
let uiHideMode = 0; // 0 = controls & stats shown, 1 = controls hidden & stats shown, 2 = both hidden


function loadCircuit(id) {
    const config = CIRCUIT_CONFIGS[id];
    if (!config || (id === 'custom' && config.points.length === 0)) return;

    // 1. Update Ground Color
    const ground = engine.scene.getObjectByName('ground');
    if (ground) ground.material.color.set(config.groundColor);

    // 2. Rebuild Circuit
    const { circuitCurve } = createCircuit(circuitGroup, config);

    // 3. Reset Car Position
    const startPos = circuitCurve.getPointAt(0);
    const startTangent = circuitCurve.getTangentAt(0).normalize();

    car.group.position.copy(startPos);
    car.group.position.y = 0.5;
    const lookAtPos = new THREE.Vector3().copy(startPos).add(startTangent);
    car.group.lookAt(lookAtPos.x, 0.5, lookAtPos.z);

    // 4. Reset Camera to Start
    camera.resetCameraForCircuit(circuitCurve);
} // <-- loadCircuit ends here

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

// Keyboard controls for panel toggle
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return; // Prevent shortcuts when typing in inputs

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
    // Animation loop for camera and simulation updates
    camera.update();
});
