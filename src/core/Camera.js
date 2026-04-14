import * as THREE from 'three';

export class Camera {
    constructor(camera, car, scene) {
        this.camera = camera;
        this.car = car;
        this.scene = scene;

        this.camMode = 0; // 0 = chase, 1 = onboard, 2 = Bird's Eye
        this.camModeLabels = ['Chase', 'Onboard', "Bird's Eye"];
        this.currentCircuitCurve = null; // Store reference to current circuit curve

        // Camera state properties
        this.chaseOffset = new THREE.Vector3(0, 12, -22); // Relative offset for chase cam
        this.targetLookAtOffset = new THREE.Vector3(0, 0.5, 2); // Offset for look-at point relative to car

        // Onboard camera offset (legacy F1 driver eye position)
        this.onboardOffset = new THREE.Vector3(0, 1.4, 0.8);

        // Bird's Eye camera state
        this.birdseyeDistance = 30; // Fixed distance for Bird's Eye view
        this.birdseyeTilt = 0; // Fixed tilt for top-down view

        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.key === 'c' || e.key === 'C') {
                this.cycleCamMode();
            }
        });
    }

    cycleCamMode() {
        this.camMode = (this.camMode + 1) % this.camModeLabels.length;
        const camModeEl = document.getElementById('camMode');
        if (camModeEl) {
            camModeEl.textContent = this.camModeLabels[this.camMode];
        }
    }

    // Method to be called by loadCircuit to update the camera's initial position
    resetCameraForCircuit(circuitCurve) {
        if (!circuitCurve || !this.car || !this.car.group) return;
        this.currentCircuitCurve = circuitCurve;

        const startPos = circuitCurve.getPointAt(0);
        const startTangent = circuitCurve.getTangentAt(0).normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const sideVec = new THREE.Vector3().crossVectors(startTangent, up).normalize();

        // Position camera behind and above the car for initial circuit load
        this.camera.position.copy(startPos)
            .addScaledVector(startTangent, -50)
            .addScaledVector(up, 20)
            .addScaledVector(sideVec, 30);
    }

    update(progress = 0) {
        if (!this.car || !this.car.group) return;

        // Reset camera UP to default to prevent "leaked" orientation from Bird's Eye mode
        this.camera.up.set(0, 1, 0);

        const carPosition = this.car.group.position;
        const carQuaternion = this.car.group.quaternion;

        if (this.camMode === 0) { // Chase camera
            const idealPos = new THREE.Vector3().copy(this.chaseOffset).applyQuaternion(carQuaternion).add(carPosition);
            const lerpFactor = 0.05;
            this.camera.position.lerp(idealPos, lerpFactor);

            const lookTarget = new THREE.Vector3().copy(this.targetLookAtOffset).applyQuaternion(carQuaternion).add(carPosition);
            this.camera.lookAt(lookTarget);
        } else if (this.camMode === 1) { // Onboard camera
            const camPos = new THREE.Vector3().copy(this.onboardOffset).applyQuaternion(carQuaternion).add(carPosition);
            this.camera.position.copy(camPos);

            if (this.currentCircuitCurve) {
                // Look ahead 5% of the track to anticipate corners (Legacy logic)
                const lookAheadDist = 0.05;
                const lookAheadU = (progress + lookAheadDist) % 1;
                const lookTarget = this.currentCircuitCurve.getPointAt(lookAheadU);
                lookTarget.y = carPosition.y + 0.5;
                this.camera.lookAt(lookTarget);
            } else {
                // Fallback: look ahead in car direction if no track curve exists
                const forwardVector = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuaternion);
                const lookAhead = new THREE.Vector3().copy(carPosition).addScaledVector(forwardVector, 20);
                this.camera.lookAt(lookAhead);
            }
        } else if (this.camMode === 2) { // Bird's Eye Camera
            const localOffset = new THREE.Vector3(0, this.birdseyeDistance * Math.cos(this.birdseyeTilt), -this.birdseyeDistance * Math.sin(this.birdseyeTilt));
            const idealPos = new THREE.Vector3().copy(localOffset).applyQuaternion(carQuaternion).add(carPosition);

            this.camera.position.copy(idealPos);

            const carForward = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuaternion);
            this.camera.up.copy(carForward);
            this.camera.lookAt(carPosition);
        }
    }
}
