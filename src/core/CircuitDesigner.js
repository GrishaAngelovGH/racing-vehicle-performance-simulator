import * as THREE from 'three';
import { CIRCUIT_CONFIGS } from './Circuit.js';

export class CircuitDesigner {
    constructor(onGenerate) {
        this.onGenerate = onGenerate;
        this.isDrawing = false;
        this.drawnPoints = [];
        this.canvas = document.getElementById('draw-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        
        this.init();
    }

    init() {
        const container = document.getElementById('canvas-container');
        const resize = () => {
            this.canvas.width = container.clientWidth;
            this.canvas.height = container.clientHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        window.addEventListener('mousemove', (e) => this.draw(e));
        window.addEventListener('mouseup', () => this.stopDrawing());

        document.getElementById('openDrawBtn').addEventListener('click', () => {
            document.getElementById('draw-modal').style.display = 'flex';
            resize();
            this.clearCanvas();
        });

        document.getElementById('closeDrawBtn').addEventListener('click', () => {
            document.getElementById('draw-modal').style.display = 'none';
        });

        document.getElementById('clearDrawBtn').addEventListener('click', () => this.clearCanvas());
        document.getElementById('generateTrackBtn').addEventListener('click', () => this.generateCustomTrack());
    }

    startDrawing(e) {
        this.isDrawing = true;
        this.drawnPoints = [];
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.clearCanvas();
        this.ctx.beginPath();
        this.ctx.moveTo(x, y);
        this.drawnPoints.push({ x, y });
    }

    draw(e) {
        if (!this.isDrawing) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const lastPoint = this.drawnPoints[this.drawnPoints.length - 1];
        
        this.ctx.beginPath();
        this.ctx.moveTo(lastPoint.x, lastPoint.y);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();
        
        this.drawnPoints.push({ x, y });
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.drawnPoints.length > 5) {
            // Visually close the loop
            this.ctx.lineTo(this.drawnPoints[0].x, this.drawnPoints[0].y);
            this.ctx.stroke();
        }
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = '#e10600';
        this.ctx.lineWidth = 5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    generateCustomTrack() {
        if (this.drawnPoints.length < 20) {
            alert('Please draw a longer, more complete circuit path!');
            return;
        }

        // 1. Map canvas coordinates to 3D World space
        // Legacy logic: 
        // Canvas (0 to Width) -> World (-600 to 600)
        // Canvas (0 to Height) -> World (-400 to 400)
        const worldPoints = [];
        for (let i = 0; i < this.drawnPoints.length; i += 5) {
            const p = this.drawnPoints[i];
            const worldX = ((p.x / this.canvas.width) - 0.5) * 1200;
            const worldZ = ((p.y / this.canvas.height) - 0.5) * 800;
            worldPoints.push(new THREE.Vector3(worldX, 0, worldZ));
        }

        // 2. Update the custom config
        CIRCUIT_CONFIGS.custom.points = worldPoints;

        // 3. Trigger callback to load the new circuit
        if (this.onGenerate) {
            this.onGenerate();
        }

        // 4. Close modal and update selector
        document.getElementById('draw-modal').style.display = 'none';
        const selector = document.getElementById('circuitSelect');
        if (selector) {
            // Add custom option if it doesn't exist
            let customOption = selector.querySelector('option[value="custom"]');
            if (!customOption) {
                customOption = document.createElement('option');
                customOption.value = 'custom';
                customOption.textContent = '-- Custom Track --';
                selector.appendChild(customOption);
            }
            selector.value = 'custom';
        }
    }
}
