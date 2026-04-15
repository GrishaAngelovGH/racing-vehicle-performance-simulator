import * as THREE from 'three';

export class Weather {
    constructor(scene) {
        this.scene = scene;
        this.isRaining = false;
        this.rainParticles = null;
        this.rainAudio = null;
        this.rainGain = null;
        this.audioCtx = null;
        this.originalBackground = new THREE.Color(0x87ceeb);
        this.originalFog = new THREE.Color(0x87ceeb);

        this.createRain();
    }

    createRain() {
        const count = 4000;
        // Each rain drop is a line (2 points), so we need count * 2 positions
        const positions = new Float32Array(count * 6); // 2 points * 3 coords each

        for (let i = 0; i < count; i++) {
            const baseIdx = i * 6;
            const x = (Math.random() - 0.5) * 400;
            const y = Math.random() * 80;
            const z = (Math.random() - 0.5) * 400;

            // Top of the drop
            positions[baseIdx] = x;
            positions[baseIdx + 1] = y;
            positions[baseIdx + 2] = z;

            // Bottom of the drop (slightly lower to create a streak)
            positions[baseIdx + 3] = x;
            positions[baseIdx + 4] = y - 1.5; // 1.5 units long streak
            positions[baseIdx + 5] = z;
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        const mat = new THREE.LineBasicMaterial({
            color: 0xaaaaaa,
            transparent: true,
            opacity: 0.4,
            linewidth: 1
        });

        this.rainParticles = new THREE.LineSegments(geo, mat);
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    }

    update(dt, camera) {
        if (!this.isRaining || !this.rainParticles) return;

        const positions = this.rainParticles.geometry.attributes.position.array;
        // Each drop is 2 points (6 values: x,y,z for top and x,y,z for bottom)
        for (let i = 0; i < positions.length; i += 6) {
            // Move top point
            positions[i + 1] -= 60 * dt;
            // Move bottom point (maintain the 1.5 unit streak length)
            positions[i + 4] -= 60 * dt;

            // Reset when drop hits ground
            if (positions[i + 1] < 0) {
                positions[i + 1] = 80;
                positions[i + 4] = 78.5; // 80 - 1.5
            }
        }
        this.rainParticles.geometry.attributes.position.needsUpdate = true;
        this.rainParticles.position.set(camera.position.x, 0, camera.position.z);
    }

    initAudio(audioCtx) {
        if (this.rainAudio) return;

        this.audioCtx = audioCtx;
        const bufferSize = audioCtx.sampleRate * 2;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) output[i] = (Math.random() * 2 - 1) * 0.5;

        this.rainAudio = audioCtx.createBufferSource();
        this.rainAudio.buffer = buffer;
        this.rainAudio.loop = true;

        this.rainGain = audioCtx.createGain();
        this.rainGain.gain.setValueAtTime(0, audioCtx.currentTime);

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1500, audioCtx.currentTime);

        this.rainAudio.connect(filter);
        filter.connect(this.rainGain);
        this.rainGain.connect(audioCtx.destination);
        this.rainAudio.start();
    }

    toggle(audioCtx = null) {
        this.isRaining = !this.isRaining;

        if (this.rainParticles) {
            this.rainParticles.visible = this.isRaining;
        }

        if (this.isRaining) {
            this.scene.background = new THREE.Color(0x333344);
            this.scene.fog.color = new THREE.Color(0x333344);
            this.scene.fog.far = 150;

            if (audioCtx && !this.rainAudio) {
                this.initAudio(audioCtx);
            }
            if (this.rainGain) {
                this.rainGain.gain.setTargetAtTime(0.3, this.audioCtx.currentTime, 1);
            }
        } else {
            this.scene.background = this.originalBackground;
            this.scene.fog.color = this.originalFog;
            this.scene.fog.far = 1000;

            if (this.rainGain) {
                this.rainGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 1);
            }
        }

        return this.isRaining;
    }

    isRainEnabled() {
        return this.isRaining;
    }
}
