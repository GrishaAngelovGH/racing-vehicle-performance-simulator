import { Engine } from './core/Engine.js';
import { initEnvironment } from './core/Environment.js';
import { CIRCUIT_CONFIGS, createCircuit } from './core/Circuit.js';
import './style.css';

const engine = new Engine();
initEnvironment(engine.scene);

createCircuit(engine.scene, CIRCUIT_CONFIGS.classic);

engine.start(() => {
    // Future update logic will go here
});