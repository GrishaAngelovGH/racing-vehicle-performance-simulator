import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Engine {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.domElement.id = 'simulation-canvas';

        this.init();
    }

    init() {
        this.camera.position.set(0, 50, 100);

        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    start(updateCallback) {
        const animate = () => {
            requestAnimationFrame(animate);
            if (updateCallback) updateCallback();
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }
}