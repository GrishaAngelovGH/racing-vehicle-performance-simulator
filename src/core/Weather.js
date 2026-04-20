import * as THREE from 'three';

export class Weather {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.isRaining = false;
        this.rainParticles = null;
        this.rainAudio = null;
        this.rainGain = null;
        this.audioCtx = null;
        this.originalBackground = new THREE.Color(0x87ceeb);
        this.originalFog = new THREE.Color(0x87ceeb);

        this.createRain();
        this.createRainOnLens();
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
            linewidth: 0.5
        });

        this.rainParticles = new THREE.LineSegments(geo, mat);
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    }

    createRainOnLens() {
        // Canvas texture for water drops
        this.lensCanvas = document.createElement('canvas');
        this.lensCanvas.width = 512;
        this.lensCanvas.height = 512;
        this.lensCtx = this.lensCanvas.getContext('2d');

        this.lensTexture = new THREE.CanvasTexture(this.lensCanvas);
        this.lensTexture.minFilter = THREE.LinearFilter;
        this.lensTexture.magFilter = THREE.LinearFilter;

        // Create lens plane that sits in front of camera
        const lensGeo = new THREE.PlaneGeometry(4, 2.25);
        const lensMat = new THREE.MeshBasicMaterial({
            map: this.lensTexture,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });
        this.lensPlane = new THREE.Mesh(lensGeo, lensMat);
        this.lensPlane.visible = false;
        this.lensPlane.renderOrder = 9999;
        this.scene.add(this.lensPlane);

        // Water drops data
        this.drops = [];
        this.maxDrops = 40;
        this.dropSpawnTimer = 0;
        this.windStrength = 0;
    }

    spawnDrop() {
        if (this.drops.length >= this.maxDrops) return;

        const sizeVariation = Math.random();
        // Slightly reduced base drop sizes to avoid excessively wide traces
        const radius = sizeVariation < 0.3 ?
            1.5 + Math.random() * 2 : // Small droplets (30%)
            sizeVariation < 0.8 ?
                3.5 + Math.random() * 4 : // Medium drops (50%)
                7 + Math.random() * 6;  // Large drops (20%)

        const drop = {
            x: Math.random() * this.lensCanvas.width,
            y: -30 - Math.random() * 50, // Start above the canvas
            radius: radius,
            opacity: 0.25 + Math.random() * 0.35,
            fallSpeed: 40 + Math.random() * 60 + radius * 2, // Larger drops fall faster
            wobble: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.3 + Math.random() * 0.7,
            trail: [] // Trail of previous positions for streak effect
        };
        this.drops.push(drop);
    }

    updateLensTexture(dt, speed) {
        const ctx = this.lensCtx;
        const w = this.lensCanvas.width;
        const h = this.lensCanvas.height;

        // Fade existing pixels to transparent
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';

        // Spawn new drops
        this.dropSpawnTimer += dt;
        // Increased spawn rate for more dense rain on the lens
        const spawnInterval = 0.03 + Math.random() * 0.04; // Random interval 30-70ms
        if (this.dropSpawnTimer > spawnInterval && this.drops.length < this.maxDrops) {
            this.spawnDrop();
            this.dropSpawnTimer = 0;
        }

        // Update drop positions and draw them
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];

            // Store previous position for trail
            drop.trail.unshift({ x: drop.x, y: drop.y });
            if (drop.trail.length > 10) drop.trail.pop(); // Longer trail

            // --- Physics: Wind and Speed Influence ---
            // Higher speed pushes drops more horizontally and slightly up
            const windInfluence = (speed / 150); // Max wind influence at 150 km/h
            const horizontalPush = Math.sin(drop.wobble) * 0.5 * windInfluence; // Reduced horizontal push
            drop.x += horizontalPush;

            // Drops fall, but speed affects how fast they are pushed down/sideways
            const fallSpeedFactor = 1.0 + (speed / 100) * 0.8; // Speed adds to fall speed, but less than pure gravity
            drop.y += drop.fallSpeed * fallSpeedFactor * dt;

            // Remove if fallen off screen
            if (drop.y > h + drop.radius * 2) { // Ensure drops completely leave canvas
                this.drops.splice(i, 1);
                continue;
            }

            // Draw the water drop with improved visual properties and trail
            this.drawRealisticDrop(ctx, drop, speed);
        }

        this.lensTexture.needsUpdate = true;
    }

    drawRealisticDrop(ctx, drop, speed) {
        // Make drops more elongated at higher speeds, simulating wind shear
        const stretch = 1.0 + Math.max(0, (speed / 100) - 0.5) * 2.0; // Stretch starts at 50km/h, max at 150km/h+

        // Drops get thinner as they stretch to conserve volume. 
        // Base width (rx) is reduced to make traces less wide.
        const rx = drop.radius * Math.max(0.3, 1.0 / Math.sqrt(stretch)) * 0.45;
        const ry = drop.radius * stretch * 0.8;

        ctx.save();
        ctx.translate(drop.x, drop.y);

        // --- Refined Drop Shape and Shading ---
        // 1. Outer Glow/Refraction Ring
        ctx.beginPath();
        ctx.ellipse(0, -ry * 0.1, rx * 1.05, ry * 0.75, 0, Math.PI, 0);
        ctx.quadraticCurveTo(rx * 1.1, ry * 0.3, 0, ry * 1.1);
        ctx.quadraticCurveTo(-rx * 1.1, ry * 0.3, -rx * 1.05, ry * 0.4);
        ctx.closePath();
        ctx.strokeStyle = `rgba(200, 220, 255, ${drop.opacity * 0.4})`;
        ctx.lineWidth = rx * 0.1;
        ctx.stroke();

        // 2. Main Drop Body with inner highlights and depth
        ctx.beginPath();
        ctx.ellipse(0, -ry * 0.2, rx * 0.9, ry * 0.6, 0, Math.PI, 0);
        ctx.quadraticCurveTo(rx * 0.8, ry * 0.3, 0, ry);
        ctx.quadraticCurveTo(-rx * 0.8, ry * 0.3, -rx * 0.9, ry * 0.4);
        ctx.closePath();

        // Subtle gradient for a wet look
        const bodyGrad = ctx.createLinearGradient(-rx * 0.5, -ry, rx * 0.5, ry);
        bodyGrad.addColorStop(0, `rgba(230, 240, 255, ${drop.opacity * 0.5})`);
        bodyGrad.addColorStop(0.6, `rgba(180, 200, 220, ${drop.opacity * 0.6})`);
        bodyGrad.addColorStop(1, `rgba(160, 180, 210, ${drop.opacity * 0.7})`);
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // 3. Inner Refraction Highlight (simulates light bending through water)
        ctx.beginPath();
        ctx.ellipse(0, -ry * 0.3, rx * 0.7, ry * 0.35, 0, Math.PI * 1.2, Math.PI * 0.1);
        ctx.strokeStyle = `rgba(255, 255, 255, ${drop.opacity * 0.8})`;
        ctx.lineWidth = rx * 0.12;
        ctx.stroke();

        // 4. Bright Specular Highlight (sun reflection on the water surface)
        ctx.beginPath();
        const highlightSize = rx * 0.2;
        ctx.ellipse(-rx * 0.3, -ry * 0.35, highlightSize, highlightSize * 0.5, -0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${drop.opacity * 1.0})`;
        ctx.fill();

        // 5. Subtle Dark Edge at the bottom (simulates thickness/shadow)
        ctx.beginPath();
        ctx.moveTo(-rx * 0.4, ry * 0.7);
        ctx.quadraticCurveTo(0, ry * 0.95, rx * 0.4, ry * 0.7);
        ctx.strokeStyle = `rgba(100, 110, 140, ${drop.opacity * 0.5})`;
        ctx.lineWidth = rx * 0.1;
        ctx.stroke();

        ctx.restore();

        // --- Dynamic Trail Effect ---
        // Draw a fading trail behind the drop, more pronounced at higher speeds
        if (drop.trail.length > 3) {
            ctx.globalCompositeOperation = 'screen'; // Additive blending for glow
            for (let i = 3; i < Math.min(drop.trail.length, 8); i++) {
                const t = drop.trail[i];
                // Trail gets fainter and smaller further back
                const alpha = (1 - i / 8) * drop.opacity * 0.15;
                const trailRadius = rx * (1 - i / 10) * 0.8; // Match width better

                ctx.beginPath();
                // Use ellipse to follow the stretched shape instead of round dots
                ctx.ellipse(t.x, t.y, trailRadius, trailRadius * Math.min(2, stretch), 0, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
                ctx.fill();
            }
            ctx.globalCompositeOperation = 'source-over'; // Reset blending mode
        }
    }

    updateLensPosition(camera, camMode) {
        // Only show lens effect in onboard (1) or cockpit (2) mode during rain
        const showLens = this.isRaining && (camMode === 1 || camMode === 2);
        this.lensPlane.visible = showLens;

        if (!showLens) return;

        // Position lens plane slightly in front of camera
        const lensDistance = 0.3;
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const lensPos = camera.position.clone().add(forward.multiplyScalar(lensDistance));

        this.lensPlane.position.copy(lensPos);
        this.lensPlane.quaternion.copy(camera.quaternion);
    }

    update(dt, camera, camMode = 0, currentSpeed = 0) {
        // Update rain particles
        if (this.isRaining && this.rainParticles) {
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

        // Update lens rain effect for onboard/cockpit views
        if (this.lensPlane) {
            this.updateLensPosition(camera, camMode);
            if (this.isRaining && (camMode === 1 || camMode === 2)) {
                // Pass currentSpeed to updateLensTexture for physics calculations
                this.updateLensTexture(dt, currentSpeed);
            }
        }
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

            const sun = this.scene.getObjectByName('sun');
            if (sun) sun.intensity = 0.4;
            const ambient = this.scene.getObjectByName('ambientLight');
            if (ambient) ambient.intensity = 0.4;

            if (audioCtx && !this.rainAudio) {
                this.initAudio(audioCtx);
            }
            if (this.rainGain) {
                this.rainGain.gain.setTargetAtTime(0.1, this.audioCtx.currentTime, 1);
            }
        } else {
            this.scene.background = this.originalBackground;
            this.scene.fog.color = this.originalFog;
            this.scene.fog.far = 1000;

            const sun = this.scene.getObjectByName('sun');
            if (sun) sun.intensity = 1.0;
            const ambient = this.scene.getObjectByName('ambientLight');
            if (ambient) ambient.intensity = 0.5;

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
