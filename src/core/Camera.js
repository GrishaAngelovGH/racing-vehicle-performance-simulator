import * as THREE from 'three';

export class Camera {
    constructor(camera, car, scene) {
        this.camera = camera;
        this.car = car;
        this.scene = scene;

        this.camMode = 0; // 0 = chase, 1 = onboard, 2 = cockpit, 3 = Bird's Eye
        this.camModeLabels = ['Chase', 'Onboard', 'Cockpit', "Bird's Eye"];
        this.currentCircuitCurve = null; // Store reference to current circuit curve

        // Camera state properties
        this.chaseOffset = new THREE.Vector3(0, 12, -22); // Relative offset for chase cam
        this.targetLookAtOffset = new THREE.Vector3(0, 0.5, 2); // Offset for look-at point relative to car

        // Onboard camera offset (Airbox)
        this.onboardOffset = new THREE.Vector3(0, 1.4, 0.8);

        // Cockpit camera offset (Driver Eye)
        this.cockpitOffset = new THREE.Vector3(0, 0.78, 0.1);

        // Bird's Eye camera state
        this.birdseyeDistance = 100;
        this.birdseyeTilt = 0;
        this.birdseyeRotation = 0;

        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT') return;
            if (e.key === 'c' || e.key === 'C') {
                this.cycleCamMode();
            }
        });

        // Add mouse wheel listener for Bird's Eye zoom, tilt, and rotation
        window.addEventListener('wheel', (e) => {
            if (this.camMode !== 3) return;
            if (e.ctrlKey) {
                e.preventDefault(); // Prevent browser from zooming the page
                // Change tilt
                const tiltDirection = e.deltaY > 0 ? 0.05 : -0.05;
                this.birdseyeTilt += tiltDirection;
                // Clamp tilt: 0 is top-down, ~1.3 is near-horizon (approx 75 deg)
                this.birdseyeTilt = Math.max(0, Math.min(1.3, this.birdseyeTilt));
            } else if (e.shiftKey) {
                e.preventDefault(); // Prevent page scrolling
                // Change horizontal rotation
                const rotDirection = e.deltaY > 0 ? 0.1 : -0.1;
                this.birdseyeRotation += rotDirection;
            } else {
                // Logarithmic zooming for smoother feel at different scales
                const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85;
                this.birdseyeDistance *= zoomFactor;
                // Clamp distance between 5 and 1500
                this.birdseyeDistance = Math.max(5, Math.min(1500, this.birdseyeDistance));
            }
        }, { passive: false });
    }

    cycleCamMode() {
        const nextMode = (this.camMode + 1) % this.camModeLabels.length;

        // When entering Bird's Eye (now index 3), seed rotation/tilt from the current camera position
        if (nextMode === 3 && this.car && this.car.group) {
            const carForward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.group.quaternion);
            this.birdseyeRotation = Math.atan2(-carForward.x, -carForward.z);
            this.birdseyeTilt = 0.5;   // ~29 degrees, a natural overview angle
            this.birdseyeDistance = 100;
        }

        this.camMode = nextMode;
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

    update(progress = 0, currentSpeed = 0, simulationRunning = false) {
        if (!this.car || !this.car.group) return;

        // Reset camera UP to default to prevent "leaked" orientation from Bird's Eye mode
        this.camera.up.set(0, 1, 0);

        // Manage cockpit visibility: Hide helmet, visor and airbox parts in Cockpit mode (2)
        if (this.car.body) {
            const hiddenParts = ['driver_helmet', 'driver_visor', 'airbox', 'airbox_intake', 'shark_fin'];
            this.car.body.children.forEach(child => {
                if (hiddenParts.includes(child.name)) {
                    child.visible = this.camMode !== 2;
                }
            });
        }

        const carPosition = this.car.group.position;
        const carQuaternion = this.car.group.quaternion;

        if (this.camMode === 0) { // Chase camera
            const idealPos = new THREE.Vector3().copy(this.chaseOffset).applyQuaternion(carQuaternion).add(carPosition);

            // Dynamic lerp: faster at high speed, very fast when not simulating (for preview/reset)
            const lerpFactor = simulationRunning ? (0.05 + (currentSpeed / 200) * 0.15) : 0.8;
            this.camera.position.lerp(idealPos, lerpFactor);

            const lookTarget = new THREE.Vector3().copy(this.targetLookAtOffset).applyQuaternion(carQuaternion).add(carPosition);
            this.camera.lookAt(lookTarget);
        } else if (this.camMode === 1 || this.camMode === 2) { // Onboard (1) or Cockpit (2) camera
            const offset = this.camMode === 1 ? this.onboardOffset : this.cockpitOffset;
            
            // For Cockpit mode, follow the car body's rotation (pitch/roll) for a stable view
            const baseQuaternion = this.camMode === 2 ? this.car.body.getWorldQuaternion(new THREE.Quaternion()) : carQuaternion;
            
            const camPos = new THREE.Vector3().copy(offset).applyQuaternion(baseQuaternion).add(carPosition);
            this.camera.position.copy(camPos);

            if (this.currentCircuitCurve) {
                // Look ahead 5% of the track to anticipate corners
                const lookAheadDist = 0.05;
                const lookAheadU = (progress + lookAheadDist) % 1;
                const lookTarget = this.currentCircuitCurve.getPointAt(lookAheadU);
                
                // Adjust look height: Onboard (Airbox) looks higher, Cockpit looks lower to see wheel
                const lookHeight = this.camMode === 1 ? 0.5 : 0.1;
                lookTarget.y = carPosition.y + lookHeight;
                
                this.camera.lookAt(lookTarget);
            } else {
                // Fallback: look ahead in car direction if no track curve exists
                const forwardVector = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuaternion);
                const lookAhead = new THREE.Vector3().copy(carPosition).addScaledVector(forwardVector, 20);
                this.camera.lookAt(lookAhead);
            }
        } else if (this.camMode === 3) { // Bird's Eye Camera
            // Orbit purely in world space around the world Y axis.
            // birdseyeTilt controls elevation (0 = top-down, ~1.3 = near-horizon)
            // birdseyeRotation controls horizontal orbit angle in world space

            const height = this.birdseyeDistance * Math.cos(this.birdseyeTilt);
            const radius = this.birdseyeDistance * Math.sin(this.birdseyeTilt);

            // World-space offset — rotation is around the world Y axis, no car quaternion involved
            const wx = Math.sin(this.birdseyeRotation) * radius;
            const wy = height;
            const wz = Math.cos(this.birdseyeRotation) * radius;

            this.camera.position.set(
                carPosition.x + wx,
                carPosition.y + wy,
                carPosition.z + wz
            );

            // Always look at the car
            this.camera.lookAt(carPosition);

            // Keep world up so there's no roll/twist
            this.camera.up.set(0, 1, 0);
        }
    }
}