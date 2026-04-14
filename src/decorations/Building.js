import * as THREE from 'three';

export class Building {
    constructor(pos) {
        this.group = new THREE.Group();
        this.create(pos);
    }

    create(pos) {
        // Core parameters
        const tiers = Math.floor(Math.random() * 3) + 1; // 1 to 3 tiers
        const baseW = 10 + Math.random() * 10;
        const baseD = 10 + Math.random() * 10;
        const tierHeight = 15 + Math.random() * 15;

        // Shared materials (Lighter, more architectural palette)
        const hue = Math.random();
        const glassMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(hue, 0.3, 0.7),
            metalness: 0.6,
            roughness: 0.3
        });

        const windowMat = new THREE.MeshStandardMaterial({
            color: 0xffffaa,
            emissive: 0xffffaa,
            emissiveIntensity: 0.8
        });

        let currentY = 0;
        for (let i = 0; i < tiers; i++) {
            const scale = 1 - (i * 0.25);
            const w = baseW * scale;
            const d = baseD * scale;
            const h = tierHeight;

            const tierGeo = new THREE.BoxGeometry(w, h, d);
            const tierMesh = new THREE.Mesh(tierGeo, glassMat);
            tierMesh.position.y = currentY + h / 2;
            tierMesh.castShadow = true;
            tierMesh.receiveShadow = true;
            this.group.add(tierMesh);

            // Add structured windows for this tier
            const rows = Math.floor(h / 3);
            const cols = Math.floor(w / 2);
            const winGeo = new THREE.PlaneGeometry(0.6, 1.0);

            for (let r = 1; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    if (Math.random() > 0.4) {
                        const win = new THREE.Mesh(winGeo, windowMat);
                        // Front face
                        win.position.set(-w / 2 + 1 + c * 2, currentY + r * 3, d / 2 + 0.05);
                        this.group.add(win);

                        // Back face (if thick enough)
                        if (Math.random() > 0.5) {
                            const winB = win.clone();
                            winB.position.z = -d / 2 - 0.05;
                            winB.rotation.y = Math.PI;
                            this.group.add(winB);
                        }
                    }
                }
            }

            currentY += h;

            // On the final tier, add roof details
            if (i === tiers - 1) {
                // Roof box
                const roofBoxGeo = new THREE.BoxGeometry(w * 0.4, 2, d * 0.4);
                const roofBox = new THREE.Mesh(roofBoxGeo, glassMat);
                roofBox.position.set(0, currentY + 1, 0);
                this.group.add(roofBox);

                // Antenna
                if (Math.random() > 0.5) {
                    const antGeo = new THREE.CylinderGeometry(0.05, 0.05, 5);
                    const ant = new THREE.Mesh(antGeo, glassMat);
                    ant.position.set(w * 0.1, currentY + 3.5, d * 0.1);
                    this.group.add(ant);
                }
            }
        }

        this.group.position.copy(pos);
        this.group.rotation.y = Math.random() * Math.PI * 2;
    }
}
