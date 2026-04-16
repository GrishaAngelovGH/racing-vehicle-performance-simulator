import * as THREE from 'three';

export class Vehicle {
    constructor() {
        this.group = new THREE.Group();
        this.body = new THREE.Group(); // Subgroup for rolling/tilting parts
        this.tireSidewalls = [];
        this.steeringWheel = null;
        this.rainLight = null;

        // --- Constants for Tire Compounds and State ---
        this.tireCompounds = {
            soft: { name: 'Soft', color: 0xe10600, grip: 0.18, wear: 0.10 },
            medium: { name: 'Medium', color: 0xf9d62e, grip: 0.08, wear: 0.04 },
            hard: { name: 'Hard', color: 0xffffff, grip: -0.04, wear: 0.015 }
        };
        this.currentCompound = 'medium'; // Default to medium

        this.init();
    }

    setCompound(compoundKey) {
        if (!this.tireCompounds[compoundKey]) return;

        this.currentCompound = compoundKey;
        const compound = this.tireCompounds[compoundKey];

        // Update all sidewall colors
        this.tireSidewalls.forEach(sidewall => {
            sidewall.material.color.setHex(compound.color);
            sidewall.material.emissive.setHex(compound.color);
        });
    }

    init() {
        this.group.add(this.body);

        // --- Materials ---
        const bodyColor = 0xe10600; // Red
        const bodyMat = new THREE.MeshStandardMaterial({
            color: bodyColor,
            metalness: 0.7,
            roughness: 0.15,
            envMapIntensity: 1.0
        });
        const carbonMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            metalness: 0.8,
            roughness: 0.4
        });
        const mechanicalMat = new THREE.MeshStandardMaterial({
            color: 0x444444,
            metalness: 0.9,
            roughness: 0.2
        });
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            roughness: 0.9
        });

        // 1. FLOOR & DIFFUSER
        const floorGeo = new THREE.BoxGeometry(2.2, 0.1, 4.4);
        const floor = new THREE.Mesh(floorGeo, carbonMat);
        floor.position.y = -0.15;
        floor.receiveShadow = true;
        floor.castShadow = true;
        this.body.add(floor);

        // Vertical strakes for diffuser
        for (let i = -2; i <= 2; i++) {
            const strakeGeo = new THREE.BoxGeometry(0.02, 0.2, 0.6);
            const strake = new THREE.Mesh(strakeGeo, carbonMat);
            strake.position.set(i * 0.4, -0.2, -2.2);
            this.body.add(strake);
        }

        // 2. MAIN CHASSIS (Tapered Tub)
        const tubGeo = new THREE.BoxGeometry(1.0, 0.6, 2.5);
        const tub = new THREE.Mesh(tubGeo, bodyMat);
        tub.position.y = 0.2;
        tub.castShadow = true;
        this.body.add(tub);

        // Nose cone (tapered)
        const noseGeo = new THREE.CylinderGeometry(0.2, 0.5, 1.8, 8);
        const nose = new THREE.Mesh(noseGeo, bodyMat);
        nose.rotation.x = Math.PI / 2;
        nose.position.set(0, 0.1, 2.15);
        nose.castShadow = true;
        this.body.add(nose);

        // 3. COCKPIT, HALO & AIRBOX
        const airboxGeo = new THREE.CylinderGeometry(0.35, 0.45, 1.0, 8);
        const airbox = new THREE.Mesh(airboxGeo, bodyMat);
        airbox.rotation.x = Math.PI / 2;
        airbox.position.set(0, 0.75, -0.2);
        airbox.scale.set(1.2, 1, 1);
        airbox.castShadow = true;
        airbox.name = 'airbox';
        this.body.add(airbox);

        const intakeGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.1, 8);
        const intake = new THREE.Mesh(intakeGeo, carbonMat);
        intake.rotation.x = Math.PI / 2;
        intake.position.set(0, 0.75, 0.3);
        intake.name = 'airbox_intake';
        this.body.add(intake);

        // Shark Fin
        const finGeo = new THREE.BoxGeometry(0.02, 0.7, 1.2);
        const fin = new THREE.Mesh(finGeo, bodyMat);
        fin.position.set(0, 0.8, -1.0);
        fin.name = 'shark_fin';
        this.body.add(fin);

        // Driver & Helmet
        try {
            const helmetGeo = new THREE.CapsuleGeometry(0.22, 0.15, 4, 16);
            const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.6, roughness: 0.2 });
            const helmet = new THREE.Mesh(helmetGeo, helmetMat);
            helmet.position.set(0, 0.45, 0.1);
            helmet.name = 'driver_helmet';
            this.body.add(helmet);

            const visorGeo = new THREE.BoxGeometry(0.3, 0.1, 0.1);
            const visor = new THREE.Mesh(visorGeo, carbonMat);
            visor.position.set(0, 0.52, 0.25);
            visor.name = 'driver_visor';
            this.body.add(visor);
        } catch (e) {
            // Fallback to sphere if CapsuleGeometry is not available
            const helmetGeo = new THREE.SphereGeometry(0.25, 16, 16);
            const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.6, roughness: 0.2 });
            const helmet = new THREE.Mesh(helmetGeo, helmetMat);
            helmet.position.set(0, 0.45, 0.1);
            helmet.name = 'driver_helmet';
            this.body.add(helmet);
        }

        // Steering Wheel
        this.steeringWheel = new THREE.Group();
        
        // Main Wheel Body (Slightly narrower core to allow for wider grips)
        const wheelMainGeo = new THREE.BoxGeometry(0.3, 0.18, 0.05);
        const wheelMain = new THREE.Mesh(wheelMainGeo, carbonMat);
        this.steeringWheel.add(wheelMain);

        // Side Grips (Rounded ergonomic handles using CapsuleGeometry)
        const gripGeo = new THREE.CapsuleGeometry(0.045, 0.16, 4, 16);
        const leftGrip = new THREE.Mesh(gripGeo, mechanicalMat);
        leftGrip.position.set(-0.19, 0, 0);
        this.steeringWheel.add(leftGrip);
        const rightGrip = leftGrip.clone();
        rightGrip.position.x = 0.19;
        this.steeringWheel.add(rightGrip);

        // Central LCD Display Screen (Smaller and more compact)
        const screenGeo = new THREE.PlaneGeometry(0.1, 0.07);
        const screenMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: 0x00ffff,
            emissiveIntensity: 1.5,
            metalness: 0.9,
            roughness: 0.1
        });
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, 0, -0.041); // Flush with front face
        screen.rotation.y = Math.PI; // Face the driver
        this.steeringWheel.add(screen);

        // Shift Light Strip (Refined layout)
        this.shiftLights = [];
        const ledGeo = new THREE.BoxGeometry(0.02, 0.015, 0.01);
        const colors = [
            0x0000ff, 0x0000ff, 0x0000ff, // Blue
            0xff0000, 0xff0000, 0xff0000, // Red
            0x00ff00, 0x00ff00, 0x00ff00  // Green
        ];
        
        colors.forEach((color, i) => {
            const led = new THREE.Mesh(ledGeo, new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0
            }));
            // Spread across the top
            led.position.set((i - 4) * 0.032, 0.075, -0.041);
            this.steeringWheel.add(led);
            this.shiftLights.push({ mesh: led, originalColor: color });
        });

        // Functional Buttons & Rotary Switches
        const btnGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 16);
        const rotaryGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16);
        const btnColors = [0xe10600, 0x00ff00, 0xf9d62e, 0x0044ff, 0xffffff];
        
        // Buttons on the face
        const btnPositions = [
            { x: -0.1, y: 0.05 }, { x: 0.1, y: 0.05 },   // Top row
            { x: -0.11, y: -0.02 }, { x: 0.11, y: -0.02 }, // Middle row
            { x: -0.08, y: -0.06 }, { x: 0.08, y: -0.06 }  // Bottom row
        ];

        btnPositions.forEach((pos, i) => {
            const btnColor = btnColors[i % btnColors.length];
            const btnMat = new THREE.MeshStandardMaterial({
                color: btnColor,
                emissive: btnColor,
                emissiveIntensity: 0.5,
                metalness: 0.5,
                roughness: 0.5
            });
            const btn = new THREE.Mesh(btnGeo, btnMat);
            btn.rotation.x = -Math.PI / 2;
            btn.position.set(pos.x, pos.y, -0.041);
            this.steeringWheel.add(btn);
        });

        this.steeringWheel.position.set(0, 0.52, 0.65);
        this.steeringWheel.rotation.x = 0.6; // Tilted toward the driver's face
        this.body.add(this.steeringWheel);

        // 4. SIDEPODS & BARGEBOARDS
        const sidepodShape = new THREE.BoxGeometry(0.65, 0.55, 2.0);
        const leftSidepod = new THREE.Mesh(sidepodShape, bodyMat);
        leftSidepod.position.set(-0.85, 0.15, -0.2);
        leftSidepod.rotation.y = 0.15;
        this.body.add(leftSidepod);

        const rightSidepod = leftSidepod.clone();
        rightSidepod.position.x = 0.85;
        rightSidepod.rotation.y = -0.15;
        this.body.add(rightSidepod);

        const bbGeo = new THREE.BoxGeometry(0.05, 0.5, 0.8);
        const leftBB = new THREE.Mesh(bbGeo, carbonMat);
        leftBB.position.set(-0.6, 0.1, 1.0);
        this.body.add(leftBB);
        const rightBB = leftBB.clone();
        rightBB.position.x = 0.6;
        this.body.add(rightBB);

        // 5. WINGS
        // Front Wing
        const fwMain = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.8), carbonMat);
        fwMain.position.set(0, -0.12, 3.2);
        this.body.add(fwMain);

        const fwUpper = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.4), carbonMat);
        fwUpper.position.set(0, 0.0, 3.1);
        this.body.add(fwUpper);

        const fwPlateGeo = new THREE.BoxGeometry(0.05, 0.4, 1.0);
        const leftFwPlate = new THREE.Mesh(fwPlateGeo, bodyMat);
        leftFwPlate.position.set(-1.6, 0.05, 3.2);
        this.body.add(leftFwPlate);
        const rightFwPlate = leftFwPlate.clone();
        rightFwPlate.position.x = 1.6;
        this.body.add(rightFwPlate);

        // Rear Wing
        const rwMain = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.9), carbonMat);
        rwMain.position.set(0, 0.8, -2.1);
        this.body.add(rwMain);
        const rwTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.6), carbonMat);
        rwTop.position.set(0, 1.0, -2.1);
        this.body.add(rwTop);

        const drsGeo = new THREE.BoxGeometry(0.1, 0.25, 0.1);
        const drs = new THREE.Mesh(drsGeo, mechanicalMat);
        drs.position.set(0, 0.9, -2.1);
        this.body.add(drs);

        const rwPlateGeo = new THREE.BoxGeometry(0.05, 1.2, 1.2);
        const leftRwPlate = new THREE.Mesh(rwPlateGeo, bodyMat);
        leftRwPlate.position.set(-1.2, 0.4, -2.1);
        this.body.add(leftRwPlate);
        const rightRwPlate = leftRwPlate.clone();
        rightRwPlate.position.x = 1.2;
        this.body.add(rightRwPlate);

        // Rain Light
        const rlGeo = new THREE.PlaneGeometry(0.2, 0.2);
        this.rainLight = new THREE.Mesh(rlGeo, new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0,
            side: THREE.DoubleSide
        }));
        this.rainLight.position.set(0, 0.4, -2.2);
        this.body.add(this.rainLight);

        // 6. SUSPENSION & WHEELS
        const wheelPositions = [
            { x: 1.25, y: 0.0, z: -1.6 }, // Rear Right
            { x: -1.25, y: 0.0, z: -1.6 }, // Rear Left
            { x: 1.15, y: 0.0, z: 1.8 },  // Front Right
            { x: -1.15, y: 0.0, z: 1.8 }  // Front Left
        ];

        const wheelGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.6, 32);
        const rimGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.62, 16);
        const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.65, 8);
        const sidewallGeo = new THREE.TorusGeometry(0.32, 0.04, 8, 32);

        wheelPositions.forEach((pos) => {
            const wheelGroup = new THREE.Group();

            const tire = new THREE.Mesh(wheelGeo, tireMat);
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            wheelGroup.add(tire);

            const rim = new THREE.Mesh(rimGeo, mechanicalMat);
            rim.rotation.z = Math.PI / 2;
            wheelGroup.add(rim);

            const hub = new THREE.Mesh(hubGeo, carbonMat);
            hub.rotation.z = Math.PI / 2;
            wheelGroup.add(hub);

            // Sidewall color based on current compound
            const sidewallMat = new THREE.MeshStandardMaterial({
                color: this.tireCompounds[this.currentCompound].color,
                emissive: this.tireCompounds[this.currentCompound].color,
                emissiveIntensity: 0.3
            });
            const sidewall = new THREE.Mesh(sidewallGeo, sidewallMat);
            sidewall.rotation.y = Math.PI / 2;
            sidewall.position.x = pos.x > 0 ? 0.32 : -0.32;
            wheelGroup.add(sidewall);
            this.tireSidewalls.push(sidewall);

            wheelGroup.position.set(pos.x, pos.y, pos.z);
            this.group.add(wheelGroup); // Wheels attached to main car, not body

            // Suspension Arms (Wishbones)
            const armGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 8);
            const armPivot = new THREE.Group();
            armPivot.position.set(pos.x > 0 ? 0.5 : -0.5, 0.2, pos.z);

            const armTop = new THREE.Mesh(armGeo, mechanicalMat);
            armTop.rotation.z = Math.PI / 2 + (pos.x > 0 ? -0.2 : 0.2);
            armTop.scale.y = 0.8;
            armPivot.add(armTop);

            const armBottom = new THREE.Mesh(armGeo, mechanicalMat);
            armBottom.rotation.z = Math.PI / 2 + (pos.x > 0 ? 0.2 : -0.2);
            armBottom.scale.y = 0.8;
            armBottom.position.y = -0.2;
            armPivot.add(armBottom);

            this.body.add(armPivot); // Arms attached to body
        });

        this.group.position.y = 0.5;
    }
}
