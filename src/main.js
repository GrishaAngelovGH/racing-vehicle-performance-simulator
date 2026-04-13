import { Engine } from './core/Engine.js';
import { initEnvironment } from './core/Environment.js';
import './style.css';

const engine = new Engine();
initEnvironment(engine.scene);

engine.start(() => {
    // Future update logic will go here
});