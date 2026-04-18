import * as THREE from 'three';

/* ─────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────── */

/** Smooth tube along an array of Vector3 via CatmullRom */
function tube(pts, r, mat, radSeg = 10, tubSeg = 20) {
    return new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), tubSeg, r, radSeg, false),
        mat
    );
}

/** Rounded-edge flat plank — a very thin cylinder stretched on X/Z */
function plank(w, h, d, mat, radSeg = 4) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 64, 1), mat);
    m.scale.set(w, h, d);
    return m;
}

/** Lathe surface from [radius, y] pairs — great for fuselage cross-sections */
function lathe(pairs, mat, segs = 64) {
    const pts = pairs.map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.Mesh(new THREE.LatheGeometry(pts, segs), mat);
}

/** Airfoil wing element extruded along span (X axis) */
function wing(span, chord, camber, thickness, mat, bevel = 0.008) {
    // NACA-ish profile: flat bottom, curved top
    const s = new THREE.Shape();
    const N = 24;
    // top surface
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = t * chord;
        const y = thickness * Math.sin(Math.PI * t) + camber * Math.sin(Math.PI * t);
        if (i === 0) s.moveTo(0, 0);
        else s.lineTo(x, y);
    }
    // bottom surface back to start
    s.lineTo(chord, 0);
    s.lineTo(0, 0);

    const geo = new THREE.ExtrudeGeometry(s, {
        depth: span,
        bevelEnabled: true,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 3,
    });
    const m = new THREE.Mesh(geo, mat);
    // pivot so span goes along X
    m.rotation.y = Math.PI / 2;
    return m;
}

/* ─────────────────────────────────────────────────────────────────────────
   VEHICLE
───────────────────────────────────────────────────────────────────────── */
export class Vehicle {
    constructor() {
        this.group = new THREE.Group();
        this.body = new THREE.Group();
        this.tireSidewalls = [];
        this.steeringWheel = null;
        this.rainLight = null;
        this.wheelGroups = [];

        this.tireCompounds = {
            soft: { name: 'Soft', color: 0xe10600, grip: 0.18, wear: 0.10 },
            medium: { name: 'Medium', color: 0xf9d62e, grip: 0.08, wear: 0.04 },
            hard: { name: 'Hard', color: 0xffffff, grip: -0.04, wear: 0.015 },
        };
        this.currentCompound = 'medium';
        this.init();
    }

    setCompound(key) {
        if (!this.tireCompounds[key]) return;
        this.currentCompound = key;
        const c = this.tireCompounds[key];
        this.tireSidewalls.forEach(s => {
            s.material.color.setHex(c.color);
            s.material.emissive.setHex(c.color);
        });
    }

    init() {
        this.group.add(this.body);

        /* ── MATERIALS ─────────────────────────────────────────────────── */
        const materials = {
            body: new THREE.MeshStandardMaterial({ color: 0xcc0000, metalness: 0.80, roughness: 0.10, side: THREE.DoubleSide }),
            bodyDark: new THREE.MeshStandardMaterial({ color: 0x880000, metalness: 0.75, roughness: 0.18 }),
            carbon: new THREE.MeshStandardMaterial({ color: 0x656565, metalness: 0.85, roughness: 0.18 }), // Significantly lightened color, slightly reduced roughness
            carbonG: new THREE.MeshStandardMaterial({ color: 0x7a7a7a, metalness: 0.92, roughness: 0.08, side: THREE.DoubleSide }), // Significantly lightened color
            mech: new THREE.MeshStandardMaterial({ color: 0x585858, metalness: 0.96, roughness: 0.12 }),
            chrome: new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 1.00, roughness: 0.03 }),
            tire: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.97, metalness: 0.0 }),
            yellow: new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.6, roughness: 0.12 }),
            red: new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 0, side: THREE.DoubleSide }),
        };

        this.createAerodynamicFloor(materials);
        this.createFuselage(materials);
        this.createNoseCone(materials);
        this.createCockpit(materials);
        this.createDriverHelmet(materials);
        this.createAirboxAndIntake(materials);
        this.createSidepods(materials);
        this.createGearboxAndExhaust(materials);
        this.createFrontWing(materials);
        this.createRearWing(materials);
        this.createRainLight(materials);
        this.createSteeringWheel(materials);
        this.createWheelsAndSuspension(materials);

        /* ── 15. RIDE HEIGHT ────────────────────────────────────────────── */
        this.group.position.y = 0.61;
    }

    createAerodynamicFloor(materials) {
        /* ── 1. AERODYNAMIC FLOOR ──────────────────────────────────────
           Custom shape that tapers front and rear (Coke-bottle style).
           We build one half and use a mirrored copy or a single large shape.
           Let's use a single large symmetrical shape.
        ──────────────────────────────────────────────────────────────── */
        const floorSh = new THREE.Shape();
        // 1. Tip and Narrow Nose (past wheels at z=2.0)
        floorSh.moveTo(0, 3.40);
        floorSh.lineTo(0.35, 3.35);
        floorSh.lineTo(0.38, 2.10);

        // 2. The "S-Curve" Flare (Bargeboard area)
        // Flare OUT behind front wheels
        floorSh.bezierCurveTo(0.40, 1.95, 1.25, 1.85, 1.25, 1.45);
        // Curve IN slightly before main sidepod
        floorSh.bezierCurveTo(1.25, 1.20, 1.05, 1.05, 1.15, 0.40);

        // 3. Main Sidepod & Rear
        floorSh.lineTo(1.15, -0.60);
        floorSh.bezierCurveTo(1.15, -1.50, 0.85, -1.90, 0.85, -2.20);

        // 4. Mirror (Back to front)
        floorSh.lineTo(-0.85, -2.20);
        floorSh.bezierCurveTo(-0.85, -1.90, -1.15, -1.50, -1.15, -0.60);
        floorSh.lineTo(-1.15, 0.40);
        floorSh.bezierCurveTo(-1.05, 1.05, -1.25, 1.20, -1.25, 1.45);
        floorSh.bezierCurveTo(-1.25, 1.85, -0.40, 1.95, -0.38, 2.10);
        floorSh.lineTo(-0.35, 3.35);
        floorSh.lineTo(0, 3.40);

        const floorGeo = new THREE.ExtrudeGeometry(floorSh, {
            depth: 0.055,
            bevelEnabled: true,
            bevelSize: 0.015,
            bevelThickness: 0.01,
            bevelSegments: 3
        });
        const floorMesh = new THREE.Mesh(floorGeo, materials.carbon);
        // Rotate to lay flat (Extrude defaults to Z depth)
        floorMesh.rotation.x = Math.PI / 2;
        floorMesh.position.set(0, -0.30, 0);
        floorMesh.receiveShadow = true;
        this.body.add(floorMesh);

        // Vortex fences (adjusted to match new floor profile)
        [-1, 1].forEach(sx => {
            for (let i = 0; i < 7; i++) {
                const zPos = 1.15 - i * 0.38;
                // Calculate approximate X at this Z for the curve
                const xPos = sx * (zPos > 0.4 ? 1.05 : 0.95);
                const f = tube([
                    new THREE.Vector3(xPos, -0.28, zPos),
                    new THREE.Vector3(xPos, -0.14, zPos),
                ], 0.010, materials.carbon, 4, 2);
                this.body.add(f);
            }
        });
    }

    createFuselage(materials) {
        /* ── 3. MAIN FUSELAGE — Smooth LatheGeometry ──────────────────── */
        const stations = [
            { z: 2.15, rw: 0.22, rh: 0.14, yc: 0.12 },
            { z: 1.50, rw: 0.30, rh: 0.18, yc: 0.15 },
            { z: 0.80, rw: 0.38, rh: 0.22, yc: 0.20 },
            { z: 0.10, rw: 0.36, rh: 0.20, yc: 0.18 },
            { z: -0.55, rw: 0.32, rh: 0.18, yc: 0.16 },
            { z: -1.20, rw: 0.28, rh: 0.16, yc: 0.14 },
            { z: -1.85, rw: 0.24, rh: 0.14, yc: 0.12 },
            { z: -2.30, rw: 0.18, rh: 0.10, yc: 0.10 },
        ];

        // Create a single smooth lathe for the fuselage
        // Reverse stations to go from back to front (-2.30 to 2.15) for correct outward normals
        const fusePts = stations.map(s => new THREE.Vector2(s.rw, s.z)).reverse();
        fusePts.unshift(new THREE.Vector2(0, -2.30)); // Cap rear
        fusePts.push(new THREE.Vector2(0, 2.15));    // Cap front

        const fuselage = new THREE.Mesh(new THREE.LatheGeometry(fusePts, 48), materials.body);
        // Slightly meatier height (0.75) to better join with sidepods and cockpit
        fuselage.scale.set(1, 1, 0.75);
        fuselage.rotation.x = Math.PI / 2;
        fuselage.position.y = 0.15;
        fuselage.castShadow = true;
        this.body.add(fuselage);

        // Engine cover — narrower spine on top
        const coverPts = [
            new THREE.Vector3(0, 0.48, -0.30),
            new THREE.Vector3(0, 0.54, -0.75),
            new THREE.Vector3(0, 0.56, -1.20),
            new THREE.Vector3(0, 0.52, -1.75),
            new THREE.Vector3(0, 0.44, -2.10),
        ];
        const engineCover = tube(coverPts, 0.085, materials.bodyDark, 22, 20);
        engineCover.name = 'engine_cover';
        this.body.add(engineCover);
    }

    createNoseCone(materials) {
        /* ── 4. NOSE CONE ───────────────────────────────────────────────── */
        // Use a Group to act as a hinge pivot at the junction (Z=2.15)
        const noseGroup = new THREE.Group();
        // Slightly deeper overlap (2.13) to ensure a solid join
        noseGroup.position.set(0, 0.15, 2.13);
        this.body.add(noseGroup);

        const nosePoints = [
            new THREE.Vector2(0, -0.05), // Increased overlap cap
            new THREE.Vector2(0.220, 0), // Base matches fuselage
            new THREE.Vector2(0.200, 0.30),
            new THREE.Vector2(0.175, 0.65),
            new THREE.Vector2(0.145, 0.95),
            new THREE.Vector2(0.120, 1.15),
            new THREE.Vector2(0.105, 1.28),
            new THREE.Vector2(0.095, 1.36),
            new THREE.Vector2(0.075, 1.41),
            new THREE.Vector2(0, 1.43)
        ];
        const noseMesh = new THREE.Mesh(new THREE.LatheGeometry(nosePoints, 32), materials.body);
        noseMesh.scale.set(1, 1, 0.75); // Match fuselage height scale
        noseMesh.rotation.x = Math.PI / 2;
        noseMesh.castShadow = true;
        noseGroup.add(noseMesh);

        // Tilt the whole group for the downward droop
        noseGroup.rotation.x = 0.06;

        // Nose-wing mounting pedestal - wider and flatter for realistic look
        const pedestal = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.24, 0.08, 24),
            materials.carbon
        );
        pedestal.position.set(0, -0.12, 3.10);
        this.body.add(pedestal);
    }

    createCockpit(materials) {
        /* ── 5. COCKPIT ─────────────────────────────────────────────────── */
        // Opening rim — smooth oval
        const cockpitRim = new THREE.Mesh(
            new THREE.TorusGeometry(0.270, 0.035, 16, 48, Math.PI),
            materials.carbonG
        );
        cockpitRim.rotation.x = Math.PI / 2;
        cockpitRim.rotation.z = Math.PI;
        cockpitRim.position.set(0, 0.58, 0.25);
        cockpitRim.name = 'cockpit_rim';
        this.body.add(cockpitRim);

        // Mirrors
        [-1, 1].forEach(side => {
            const mirrorStem = tube([
                new THREE.Vector3(side * 0.28, 0.68, 0.45),
                new THREE.Vector3(side * 0.48, 0.72, 0.42),
            ], 0.012, materials.carbon, 6, 4);
            this.body.add(mirrorStem);

            const mirrorBody = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), materials.body);
            mirrorBody.position.set(side * 0.52, 0.72, 0.42);
            this.body.add(mirrorBody);
        });

        // Side flanges
        [-1, 1].forEach(side => {
            const flange = new THREE.Mesh(
                new THREE.CylinderGeometry(1, 1, 0.80, 32, 1),
                materials.carbonG
            );
            flange.scale.set(0.080, 1, 0.180);
            flange.rotation.x = Math.PI / 2;
            flange.position.set(side * 0.26, 0.45, 0.24);
            flange.name = 'cockpit_flange';
            this.body.add(flange);
        });
    }

    createDriverHelmet(materials) {
        /* ── 6. DRIVER HELMET ───────────────────────────────────────────── */
        try {
            const hMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.65, roughness: 0.10 });
            const helmet = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.11, 8, 28), hMat); // Reduced radius and height
            helmet.position.set(0, 0.64, 0.15);
            helmet.name = 'driver_helmet';
            this.body.add(helmet);

            // Visor
            const visorMat = new THREE.MeshStandardMaterial({
                color: 0x110e00, metalness: 0.98, roughness: 0.03, transparent: true, opacity: 0.80,
            });
            const visor = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14, 0, Math.PI, 0.2, 0.7), visorMat); // Reduced radius
            visor.rotation.x = -0.4;
            visor.position.set(0, 0.66, 0.26);
            visor.name = 'driver_visor';
            this.body.add(visor);
        } catch {
            const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 18), // Reduced radius in fallback
                new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.6, roughness: 0.2 }));
            helmet.position.set(0, 0.72, 0.18);
            helmet.name = 'driver_helmet';
            this.body.add(helmet);
        }
    }

    createAirboxAndIntake(materials) {
        /* ── 7. AIRBOX / ENGINE INTAKE ──────────────────────────────────── */
        const airPts = [
            new THREE.Vector3(0, 0.58, 0.22),
            new THREE.Vector3(0, 0.72, 0.00),
            new THREE.Vector3(0, 0.78, -0.42),
            new THREE.Vector3(0, 0.76, -0.90),
            new THREE.Vector3(0, 0.58, -2.00), // Connected to rear bodywork
        ];
        const airbox = tube(airPts, 0.200, materials.body, 22, 28); // Reduced radius from 0.260 to 0.200
        airbox.name = 'airbox';
        this.body.add(airbox);

        // Shark fin
        const finSh = new THREE.Shape();
        finSh.moveTo(0, 0);
        finSh.bezierCurveTo(0.03, 0.25, -0.20, 0.40, -0.70, 0.05); // Adjusted for smaller, rounder shape
        finSh.lineTo(-0.70, 0); // Adjusted to match bezier end point
        finSh.closePath();
        const finGeo = new THREE.ExtrudeGeometry(finSh, {
            depth: 0.015, // Reduced depth
            bevelEnabled: true,
            bevelSize: 0.01, // Increased bevel for roundness
            bevelSegments: 3,
        });
        const fin = new THREE.Mesh(finGeo, materials.body); // Changed to M.body to match car color
        fin.rotation.y = Math.PI / 2;
        fin.position.set(0.01, 0.72, -0.38);
        fin.name = 'shark_fin';
        this.body.add(fin);
    }

    createSidepods(materials) {
        /* ── 8. SIDEPODS ────────────────────────────────────────────────── */
        [-1, 1].forEach(side => {
            // Main sidepod — a series of elliptical cross-section cylinders
            const podStations = [
                { z: 0.78, rw: 0.12, rh: 0.16, yc: 0.28 },  // slimmed inlet shoulder
                { z: 0.30, rw: 0.22, rh: 0.20, yc: 0.20 },
                { z: -0.30, rw: 0.24, rh: 0.22, yc: 0.18 },
                { z: -1.00, rw: 0.18, rh: 0.16, yc: 0.16 }, // tighter taper
                { z: -1.55, rw: 0.10, rh: 0.10, yc: 0.14 },
                { z: -1.95, rw: 0.08, rh: 0.08, yc: 0.12 },
            ];
            for (let i = 0; i < podStations.length - 1; i++) {
                const a = podStations[i], b = podStations[i + 1];
                const segLen = Math.abs(a.z - b.z);
                const midZ = (a.z + b.z) / 2;
                const seg = new THREE.Mesh(
                    new THREE.CylinderGeometry(1, 1, segLen, 40, 1), materials.body
                );
                seg.scale.set(b.rw + a.rw, 1, (a.rh + b.rh) / 2 * 1.8);
                seg.rotation.x = Math.PI / 2;
                seg.position.set(side * (0.38 + (a.rw + b.rw) / 4), (a.yc + b.yc) / 2, midZ);
                seg.castShadow = true;
                this.body.add(seg);
            }

            // Undercut recessed dark region — more subtle
            const undercutSeg = new THREE.Mesh(
                new THREE.CylinderGeometry(1, 1, 1.80, 36, 1), materials.bodyDark
            );
            undercutSeg.scale.set(0.38, 1, 0.16);
            undercutSeg.rotation.x = Math.PI / 2;
            undercutSeg.position.set(side * 0.55, -0.12, -0.15);
            this.body.add(undercutSeg);

            // Inlet ring — more compact
            const inletRing = new THREE.Mesh(
                new THREE.TorusGeometry(0.140, 0.020, 14, 40), materials.carbon
            );
            inletRing.scale.set(1.1, 1, 1);
            inletRing.rotation.z = Math.PI / 2;
            inletRing.position.set(side * 0.45, 0.28, 0.78);
            this.body.add(inletRing);

            // Louvers
            for (let i = 0; i < 6; i++) {
                this.body.add(tube([
                    new THREE.Vector3(side * 0.52, 0.32 - i * 0.030, -0.05 - i * 0.18),
                    new THREE.Vector3(side * 0.58, 0.32 - i * 0.030, -0.15 - i * 0.18),
                ], 0.006, materials.carbon, 4, 2));
            }

            // Bargeboard
            this.body.add(tube([
                new THREE.Vector3(side * 0.55, 0.20, 1.05),
                new THREE.Vector3(side * 0.60, 0.04, 0.88),
                new THREE.Vector3(side * 0.58, -0.12, 0.68),
            ], 0.016, materials.carbonG, 6, 8));
        });
    }

    createGearboxAndExhaust(materials) {
        /* ── 9. GEARBOX & EXHAUST ───────────────────────────────────────── */
        const gearbox = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 0.85, 36, 1), materials.carbon
        );
        gearbox.scale.set(0.18, 1, 0.16);
        gearbox.rotation.x = Math.PI / 2;
        gearbox.position.set(0, 0.08, -2.12);
        this.body.add(gearbox);

        // Sleek single central exhaust pipe
        this.body.add(tube([
            new THREE.Vector3(0, 0.50, -1.94),
            new THREE.Vector3(0, 0.55, -2.18),
        ], 0.030, materials.chrome, 16, 5));
    }

    createFrontWing(materials) {
        /* ── 10. FRONT WING ─────────────────────────────────────────────── */
        // Front Wing (Old simple box-based design)
        const fwMain = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.8), materials.carbon);
        fwMain.position.set(0, -0.12, 3.2);
        this.body.add(fwMain);

        const fwUpper = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.04, 0.4), materials.carbon);
        fwUpper.position.set(0, 0.0, 3.1);
        this.body.add(fwUpper);

        const fwPlateGeo = new THREE.BoxGeometry(0.05, 0.4, 1.0);
        const leftFwPlate = new THREE.Mesh(fwPlateGeo, materials.body);
        leftFwPlate.position.set(-1.6, 0.05, 3.2);
        this.body.add(leftFwPlate);
        const rightFwPlate = leftFwPlate.clone();
        rightFwPlate.position.x = 1.6;
        this.body.add(rightFwPlate);
    }

    createRearWing(materials) {
        /* ── 11. REAR WING ──────────────────────────────────────────────── */
        // Compact rear wing - smaller span, sleeker design, no DRS
        const rwSpan = 1.60;
        const rw = wing(rwSpan, 0.72, 0.048, 0.032, materials.carbonG);
        rw.position.set(-0.80, 0.74, -2.54);
        this.body.add(rw);

        const rw1 = wing(rwSpan, 0.42, 0.055, 0.022, materials.body);
        rw1.position.set(-0.80, 0.88, -2.58);
        this.body.add(rw1);

        // Sleek Y-shaped pillars
        [-0.32, 0.32].forEach(sx => {
            const pillarPath = [
                new THREE.Vector3(sx, 0.06, -2.18),
                new THREE.Vector3(sx * 0.7, 0.45, -2.16),
                new THREE.Vector3(sx * 0.4, 0.74, -2.54), // Connects to lower wing (rw)
                new THREE.Vector3(sx * 0.32, 0.88, -2.58), // Connects to upper wing (rw1)
            ];
            this.body.add(tube(pillarPath, 0.028, materials.carbon, 8, 5));
        });

        // Compact beam wing
        const bw = wing(1.20, 0.24, 0.028, 0.014, materials.carbon);
        bw.position.set(-0.60, 0.06, -2.18);
        this.body.add(bw);
    }

    createRainLight(materials) {
        /* ── 12. RAIN LIGHT ─────────────────────────────────────────────── */
        this.rainLight = new THREE.Mesh(
            new THREE.PlaneGeometry(0.14, 0.08), materials.red
        );
        this.rainLight.position.set(0, 0.44, -2.34);
        this.body.add(this.rainLight);
    }

    createSteeringWheel(materials) {
        /* ── 13. STEERING WHEEL ─────────────────────────────────────────── */
        // Steering Wheel (Old design with buttons)
        this.steeringWheel = new THREE.Group();

        // Main Wheel Body (Smaller)
        const wheelMainGeo = new THREE.BoxGeometry(0.153, 0.09, 0.027);
        const wheelMain = new THREE.Mesh(wheelMainGeo, materials.carbon);
        this.steeringWheel.add(wheelMain);

        // Side Grips (Smaller rounded handles)
        const gripGeo = new THREE.CapsuleGeometry(0.0234, 0.0765, 4, 16);
        const leftGrip = new THREE.Mesh(gripGeo, materials.mech);
        leftGrip.position.set(-0.09, 0, 0);
        this.steeringWheel.add(leftGrip);
        const rightGrip = leftGrip.clone();
        rightGrip.position.x = 0.09;
        this.steeringWheel.add(rightGrip);

        // Central LCD Display Screen (Smaller)
        const screenGeo = new THREE.PlaneGeometry(0.054, 0.0315);
        const screenMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            emissive: 0x00ffff,
            emissiveIntensity: 1.5,
            metalness: 0.9,
            roughness: 0.1
        });
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, 0, -0.0198); // Flush with front face
        screen.rotation.y = Math.PI; // Face the driver
        this.steeringWheel.add(screen);

        // Shift Light Strip (Tighter layout)
        this.shiftLights = [];
        const ledGeo = new THREE.BoxGeometry(0.009, 0.0072, 0.0072);
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
            led.position.set((i - 4) * 0.0153, 0.0378, -0.0198);
            this.steeringWheel.add(led);
            this.shiftLights.push({ mesh: led, originalColor: color });
        });

        // Functional Buttons (Smaller)
        const btnGeo = new THREE.CylinderGeometry(0.003825, 0.003825, 0.00765, 16);
        const btnColors = [0xe10600, 0x00ff00, 0xf9d62e, 0x0044ff, 0xffffff];

        // Buttons on the face
        const btnPositions = [
            { x: -0.0369, y: 0.0189 }, { x: 0.0369, y: 0.0189 },   // Top row
            { x: -0.0432, y: -0.0063 }, { x: 0.0432, y: -0.0063 }, // Middle row
            { x: -0.0306, y: -0.0243 }, { x: 0.0306, y: -0.0243 }  // Bottom row
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
            btn.position.set(pos.x, pos.y, -0.0198);
            this.steeringWheel.add(btn);
        });

        this.steeringWheel.position.set(0, 0.72, 0.70);
        this.steeringWheel.rotation.x = 0.6; // Tilted toward the driver's face
        this.body.add(this.steeringWheel);
    }

    createWheelsAndSuspension(materials) {
        /* ── 14. WHEELS & SUSPENSION ────────────────────────────────────── */
        const wheelDef = [
            { x: 1.30, y: 0, z: -1.70, front: false },
            { x: -1.30, y: 0, z: -1.70, front: false },
            { x: 1.20, y: -0.04, z: 2.00, front: true },
            { x: -1.20, y: -0.04, z: 2.00, front: true },
        ];

        wheelDef.forEach(pos => {
            const wg = new THREE.Group();
            const R = pos.front ? 0.47 : 0.51;
            const W = pos.front ? 0.50 : 0.70;
            const Rr = pos.front ? 0.308 : 0.348;

            // Tire
            const tire = new THREE.Mesh(new THREE.CylinderGeometry(R, R, W, 64), materials.tire);
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            wg.add(tire);

            // Rim / Wheel Cover (Aerodynamic disc as seen in car.jpg)
            const coverMat = materials.carbonG;
            const cover = new THREE.Mesh(new THREE.CylinderGeometry(Rr * 1.05, Rr * 1.05, W + 0.02, 32), coverMat);
            cover.rotation.z = Math.PI / 2;
            wg.add(cover);

            // Hub detail on cover
            const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W + 0.08, 16), materials.mech);
            hub.rotation.z = Math.PI / 2;
            wg.add(hub);

            // Compound sidewall ring
            const cmpd = this.tireCompounds[this.currentCompound];
            const swMat = new THREE.MeshStandardMaterial({
                color: cmpd.color, emissive: cmpd.color, emissiveIntensity: 0.22,
            });
            // Increased radius factor from 0.70 to 0.78 and X position from 0.46 to 0.49
            // to ensure it is visible outside the aero cover, especially for the larger rear wheels.
            const sw = new THREE.Mesh(new THREE.TorusGeometry(R * 0.78, 0.024, 10, 64), swMat);
            sw.rotation.y = Math.PI / 2;
            sw.position.x = pos.x > 0 ? W * 0.49 : -W * 0.49;
            wg.add(sw);
            this.tireSidewalls.push(sw);

            wg.position.set(pos.x, pos.y, pos.z);
            this.group.add(wg);
            this.wheelGroups.push(wg);

            // Suspension arms
            const ax = pos.front ? (pos.x > 0 ? 0.24 : -0.24) : (pos.x > 0 ? 0.44 : -0.44);
            this.body.add(tube([
                new THREE.Vector3(ax, 0.22, pos.z - 0.08),
                new THREE.Vector3(pos.x * 0.86, 0.23, pos.z + 0.09),
            ], 0.020, materials.mech, 7, 6));
            this.body.add(tube([
                new THREE.Vector3(ax, -0.04, pos.z + 0.11),
                new THREE.Vector3(pos.x * 0.86, -0.05, pos.z - 0.11),
            ], 0.018, materials.mech, 7, 6));
            // Pushrod
            this.body.add(tube([
                new THREE.Vector3(pos.x * 0.80, -0.05, pos.z),
                new THREE.Vector3(ax * 0.65, 0.12, pos.z + (pos.front ? -0.12 : 0.12)),
            ], 0.012, materials.chrome, 5, 5));
        });
    }
}