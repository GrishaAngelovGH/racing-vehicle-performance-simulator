import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { initEnvironment } from './core/Environment.js';
import { CIRCUIT_CONFIGS, createCircuit } from './core/Circuit.js';
import { CircuitDesigner } from './core/CircuitDesigner.js';
import { Vehicle } from './core/Vehicle.js';
import './style.css';

const engine = new Engine();
initEnvironment(engine.scene);

// Create the Car
const car = new Vehicle();
engine.scene.add(car.group);

// Create a persistent group for the circuit
const circuitGroup = new THREE.Group();
engine.scene.add(circuitGroup);

// --- Camera State ---
let camMode = 0; // 0 = chase, 1 = onboard, 2 = t-cam, 3 = birds-eye (legacy modes)
const chaseOffset = new THREE.Vector3(0, 12, -22); // Relative offset for chase cam
const targetLookAtOffset = new THREE.Vector3(0, 0.5, 2); // Offset for look-at point relative to car

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
    const up = new THREE.Vector3(0, 1, 0);
    const sideVec = new THREE.Vector3().crossVectors(startTangent, up).normalize();

    // Position camera behind and above the car
    engine.camera.position.copy(startPos)
        .addScaledVector(startTangent, -50)
        .addScaledVector(up, 20)
        .addScaledVector(sideVec, 30);
    
    engine.controls.target.copy(startPos);
    engine.controls.update();
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
    
    // Update camera based on car's position and rotation (Chase Cam)
    if (car && car.group && camMode === 0) { // Check if car exists and camera mode is chase
        const carPosition = car.group.position;
        const carQuaternion = car.group.quaternion;

        // Calculate ideal camera position based on car's position and rotation
        const idealPos = new THREE.Vector3().copy(chaseOffset).applyQuaternion(carQuaternion).add(carPosition);
        
        // Smoothly move camera towards ideal position
        const lerpFactor = 0.05; // Adjust for desired smoothness
        engine.camera.position.lerp(idealPos, lerpFactor);

        // Calculate look-at target
        const lookTarget = new THREE.Vector3().copy(targetLookAtOffset).applyQuaternion(carQuaternion).add(carPosition);
        engine.camera.lookAt(lookTarget);
    }

    // Add future simulation update logic here
});
