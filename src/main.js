import * as THREE from 'three';
import { Engine } from './core/Engine.js';
import { initEnvironment } from './core/Environment.js';
import { CIRCUIT_CONFIGS, createCircuit } from './core/Circuit.js';
import { CircuitDesigner } from './core/CircuitDesigner.js';
import './style.css';

const engine = new Engine();
initEnvironment(engine.scene);

// Create a persistent group for the circuit
const circuitGroup = new THREE.Group();
engine.scene.add(circuitGroup);

function loadCircuit(id) {
    const config = CIRCUIT_CONFIGS[id];
    if (!config || (id === 'custom' && config.points.length === 0)) return;

    // 1. Update Ground Color
    const ground = engine.scene.getObjectByName('ground');
    if (ground) ground.material.color.set(config.groundColor);

    // 2. Rebuild Circuit
    const { circuitCurve } = createCircuit(circuitGroup, config);

    // 3. Reset Camera to Start
    const startPos = circuitCurve.getPointAt(0);
    const startTangent = circuitCurve.getTangentAt(0);
    const up = new THREE.Vector3(0, 1, 0);
    const sideVec = new THREE.Vector3().crossVectors(startTangent, up).normalize();

    // Position camera behind and above the start line
    engine.camera.position.copy(startPos)
        .addScaledVector(startTangent, -50)
        .addScaledVector(up, 20)
        .addScaledVector(sideVec, 30);
    
    engine.controls.target.copy(startPos);
    engine.controls.update();
}

// Initialize Designer
new CircuitDesigner(() => loadCircuit('custom'));

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
    // Future update logic will go here
});
