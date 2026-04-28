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

/** Lathe surface from [radius, y] pairs — great for fuselage cross-sections */
function lathe(pairs, mat, segs = 64) {
    const pts = pairs.map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.Mesh(new THREE.LatheGeometry(pts, segs), mat);
}

/** Helper for creating a wing element that follows a 3D path (for spoon shapes) */
function curvedWing(path, chord, camber, thickness, mat, bevel = 0.002) {
    const s = new THREE.Shape();
    const N = 16;
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = t * chord;
        const weight = Math.pow(t, 0.7) * Math.pow(1 - t, 1.2);
        const y = (thickness * 4.0 * weight) + (camber * Math.sin(Math.PI * t));
        if (i === 0) s.moveTo(0, 0);
        else s.lineTo(x, y);
    }
    s.lineTo(chord, 0);
    s.lineTo(0, 0);

    const geo = new THREE.ExtrudeGeometry(s, {
        extrudePath: path,
        steps: 40,
        bevelEnabled: true,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 2
    });
    return new THREE.Mesh(geo, mat);
}

/** Airfoil wing element extruded along span (X axis) */
function wing(span, chord, camber, thickness, mat, bevel = 0.004) {
    // NACA-style profile: max thickness at ~30% chord, sharp trailing edge
    const s = new THREE.Shape();
    const N = 24;

    // Top surface
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x = t * chord;
        // Shift peak to ~30% using a power function
        const weight = Math.pow(t, 0.7) * Math.pow(1 - t, 1.2);
        const y = (thickness * 4.0 * weight) + (camber * Math.sin(Math.PI * t));
        if (i === 0) s.moveTo(0, 0);
        else s.lineTo(x, y);
    }
    // Sharp trailing edge and flat-ish bottom
    s.lineTo(chord, 0);
    s.lineTo(0, 0);

    const geo = new THREE.ExtrudeGeometry(s, {
        depth: span,
        bevelEnabled: true,
        bevelSize: bevel,
        bevelThickness: bevel,
        bevelSegments: 2,
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
            soft: { name: 'Soft', color: 0xe10600, grip: 0.18, wear: 0.15 },
            medium: { name: 'Medium', color: 0xf9d62e, grip: 0.08, wear: 0.08 },
            hard: { name: 'Hard', color: 0xffffff, grip: -0.04, wear: 0.04 },
            intermediate: { name: 'Intermediate', color: 0x00cc00, grip: 0.12, wear: 0.10 },
            wet: { name: 'Full Wet', color: 0x0066ff, grip: 0.18, wear: 0.07 },
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
        let livery;
        try {
            livery = JSON.parse(localStorage.getItem('car_livery')) || { primary: '#a50000', accent1: '#a50000', accent2: '#a50000' };
        } catch (e) {
            livery = { primary: localStorage.getItem('car_livery') || '#a50000', accent1: '#a50000', accent2: '#a50000' };
        }

        const primaryColor = new THREE.Color(livery.primary || '#a50000');
        const accent1Color = new THREE.Color(livery.accent1 || livery.primary || '#a50000');
        const accent2Color = new THREE.Color(livery.accent2 || livery.primary || '#a50000');

        const materials = {
            body: new THREE.MeshStandardMaterial({ color: primaryColor, metalness: 0.15, roughness: 0.40, side: THREE.DoubleSide }),
            bodyDark: new THREE.MeshStandardMaterial({ color: primaryColor.clone().multiplyScalar(0.6), metalness: 0.10, roughness: 0.50 }),
            accent1: new THREE.MeshStandardMaterial({ color: accent1Color, metalness: 0.20, roughness: 0.35 }),
            accent2: new THREE.MeshStandardMaterial({ color: accent2Color, metalness: 0.20, roughness: 0.35 }),
            carbon: new THREE.MeshStandardMaterial({ color: 0x656565, metalness: 0.85, roughness: 0.18 }), // Significantly lightened color, slightly reduced roughness
            carbonG: new THREE.MeshStandardMaterial({ color: 0x7a7a7a, metalness: 0.92, roughness: 0.08, side: THREE.DoubleSide }), // Significantly lightened color
            mech: new THREE.MeshStandardMaterial({ color: 0x585858, metalness: 0.96, roughness: 0.12 }),
            chrome: new THREE.MeshStandardMaterial({ color: 0xc8c8c8, metalness: 1.00, roughness: 0.03 }),
            tire: new THREE.MeshStandardMaterial({ color: 0x252525, roughness: 0.75, metalness: 0.0 }),
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
        this.createGearbox(materials);
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
        floorSh.moveTo(0.20,  1.80);                                      // right, near nose strut
        floorSh.lineTo(1.05,  1.50);                                      // step out to floor edge behind front wheel
        floorSh.lineTo(1.05, -0.60);                                      // straight run along sidepod
        floorSh.bezierCurveTo(1.05, -1.55, 0.78, -1.95, 0.75, -2.20);   // diffuser taper
        floorSh.lineTo(-0.75, -2.20);                                     // rear edge
        floorSh.bezierCurveTo(-0.78, -1.95, -1.05, -1.55, -1.05, -0.60);
        floorSh.lineTo(-1.05,  1.50);
        floorSh.lineTo(-0.20,  1.80);
        floorSh.lineTo( 0.20,  1.80);

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

        // Floor edge accent strip — clean straight outer edge
        const floorEdge = tube([
            new THREE.Vector3( 1.05, -0.28,  1.50),
            new THREE.Vector3( 1.05, -0.28, -0.60),
            new THREE.Vector3( 0.75, -0.28, -2.20),
        ], 0.020, materials.accent1, 8, 6);
        this.body.add(floorEdge);
        const floorEdgeL = tube([
            new THREE.Vector3(-1.05, -0.28,  1.50),
            new THREE.Vector3(-1.05, -0.28, -0.60),
            new THREE.Vector3(-0.75, -0.28, -2.20),
        ], 0.020, materials.accent1, 8, 6);
        this.body.add(floorEdgeL);

        // Floor edge winglets — small angled fins along outer edge
        [-1, 1].forEach(side => {
            [1.10, 0.45, -0.25].forEach(zPos => {
                const wl = new THREE.Mesh(
                    new THREE.BoxGeometry(0.005, 0.07, 0.13),
                    materials.carbon
                );
                wl.position.set(side * 1.05, -0.24, zPos);
                wl.rotation.z = side * 0.15;
                this.body.add(wl);
            });
        });

        // Vortex generators — small upright tabs on floor surface
        [-1, 1].forEach(sx => {
            for (let i = 0; i < 5; i++) {
                const zPos = 1.20 - i * 0.44;
                this.body.add(tube([
                    new THREE.Vector3(sx * 0.88, -0.28, zPos),
                    new THREE.Vector3(sx * 0.88, -0.17, zPos),
                ], 0.008, materials.carbon, 4, 2));
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

        // Fuselage — Already added above
    }

    createNoseCone(materials) {
        /* ── 4. NOSE CONE ───────────────────────────────────────────────── */
        // Use a Group to act as a hinge pivot at the junction (Z=2.15)
        const noseGroup = new THREE.Group();
        noseGroup.position.set(0, 0.15, 2.13);
        this.body.add(noseGroup);

        const nosePoints = [
            new THREE.Vector2(0, -0.05), // Overlap cap
            new THREE.Vector2(0.22, 0),  // Base matches fuselage
            new THREE.Vector2(0.21, 0.30),
            new THREE.Vector2(0.19, 0.65),
            new THREE.Vector2(0.16, 1.00),
            new THREE.Vector2(0.13, 1.20),
            new THREE.Vector2(0.10, 1.35),
            new THREE.Vector2(0.07, 1.42),
            new THREE.Vector2(0.05, 1.45),  // Blunter Tip
            new THREE.Vector2(0, 1.45)      // Cap
        ];

        // Split nose into main and tip for accent color
        const mainPoints = nosePoints.slice(0, 6);
        const tipPoints = nosePoints.slice(5);

        const noseMesh = new THREE.Mesh(new THREE.LatheGeometry(mainPoints, 32), materials.body);
        noseMesh.scale.set(1, 1, 0.75); // Match fuselage height scale
        noseMesh.rotation.x = Math.PI / 2;
        noseMesh.castShadow = true;
        noseGroup.add(noseMesh);

        const tipMesh = new THREE.Mesh(new THREE.LatheGeometry(tipPoints, 32), materials.accent1);
        tipMesh.scale.set(1, 1, 0.75);
        tipMesh.rotation.x = Math.PI / 2;
        tipMesh.castShadow = true;
        noseGroup.add(tipMesh);

        noseGroup.rotation.x = 0.08;
    }

    createCockpit(materials) {
        /* ── 5. COCKPIT ─────────────────────────────────────────────────── */
        // Mirrors
        [-1, 1].forEach(side => {
            const mirrorGroup = new THREE.Group();
            mirrorGroup.position.set(side * 0.75, 0.60, 1.40);
            // Angle slightly toward the driver for better visibility/realism
            mirrorGroup.rotation.y = side * 0.25;
            this.body.add(mirrorGroup);

            // Mirror Body (Rounded aerodynamic housing)
            const mShape = new THREE.Shape();
            const mw = 0.20, mh = 0.09, mr = 0.02;
            mShape.moveTo(-mw / 2, -mh / 2 + mr);
            mShape.lineTo(-mw / 2, mh / 2 - mr);
            mShape.quadraticCurveTo(-mw / 2, mh / 2, -mw / 2 + mr, mh / 2);
            mShape.lineTo(mw / 2 - mr, mh / 2);
            mShape.quadraticCurveTo(mw / 2, mh / 2, mw / 2, mh / 2 - mr);
            mShape.lineTo(mw / 2, -mh / 2 + mr);
            mShape.quadraticCurveTo(mw / 2, -mh / 2, mw / 2 - mr, -mh / 2);
            mShape.lineTo(-mw / 2 + mr, -mh / 2);
            mShape.quadraticCurveTo(-mw / 2, -mh / 2, -mw / 2, -mh / 2 + mr);

            const mirrorBody = new THREE.Mesh(
                new THREE.ExtrudeGeometry(mShape, {
                    depth: 0.04,
                    bevelEnabled: true,
                    bevelThickness: 0.01,
                    bevelSize: 0.01,
                    bevelSegments: 3
                }),
                materials.accent2
            );
            // Center the extruded geometry
            mirrorBody.position.z = -0.02;
            mirrorGroup.add(mirrorBody);

            // Mirror Glass (Reflective surface - rounded to match housing)
            const gShape = new THREE.Shape();
            const gw = 0.198, gh = 0.088, gr = 0.019;
            gShape.moveTo(-gw / 2, -gh / 2 + gr);
            gShape.lineTo(-gw / 2, gh / 2 - gr);
            gShape.quadraticCurveTo(-gw / 2, gh / 2, -gw / 2 + gr, gh / 2);
            gShape.lineTo(gw / 2 - gr, gh / 2);
            gShape.quadraticCurveTo(gw / 2, gh / 2, gw / 2, gh / 2 - gr);
            gShape.lineTo(gw / 2, -gh / 2 + gr);
            gShape.quadraticCurveTo(gw / 2, -gh / 2, gw / 2 - gr, -gh / 2);
            gShape.lineTo(-gw / 2 + gr, -gh / 2);
            gShape.quadraticCurveTo(-gw / 2, -gh / 2, -gw / 2, -gh / 2 + gr);

            const mirrorGlass = new THREE.Mesh(
                new THREE.ShapeGeometry(gShape),
                new THREE.MeshPhysicalMaterial({
                    color: 0x111111,
                    metalness: 1.0,
                    roughness: 0.0,
                    reflectivity: 1.0,
                    clearcoat: 1.0,
                    clearcoatRoughness: 0.0,
                    emissive: 0x223344, // Subtle blue tint to fake sky reflection
                    emissiveIntensity: 0.5
                })
            );
            mirrorGlass.position.z = -0.032; // Recessed slightly into the beveled housing
            mirrorGlass.rotation.y = Math.PI; // Face toward the driver
            mirrorGroup.add(mirrorGlass);

            const mirrorStem = tube([
                new THREE.Vector3(side * 0.20, 0.35, 1.10), // Base connection
                new THREE.Vector3(side * 0.35, 0.40, 1.20), // Mid-arch
                new THREE.Vector3(side * 0.58, 0.52, 1.35), // Approaching mirror
                new THREE.Vector3(side * 0.64, 0.60, 1.42), // Final connection
            ], 0.008, materials.carbon, 6, 4);
            this.body.add(mirrorStem);
        });
    }

    createDriverHelmet(materials) {
        /* ── 6. DRIVER HELMET (Realistic version) ────────────────────────── */
        const helmetGroup = new THREE.Group();
        helmetGroup.position.set(0, 0.65, 0.15);
        helmetGroup.name = 'driver_helmet';
        this.body.add(helmetGroup);

        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.25, metalness: 0.1 });
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.05, metalness: 0.9 });
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

        // Main Shell - slightly aerodynamic shape
        const shell = new THREE.Mesh(
            new THREE.SphereGeometry(0.145, 32, 32),
            whiteMat
        );
        shell.scale.set(0.92, 1, 1.08);
        helmetGroup.add(shell);

        // Chin Guard / Face Piece
        const chin = new THREE.Mesh(
            new THREE.CylinderGeometry(0.145, 0.145, 0.12, 32, 1, false, -Math.PI * 0.45, Math.PI * 0.9),
            whiteMat
        );
        chin.scale.set(0.92, 1, 1.08);
        chin.position.y = -0.06;
        helmetGroup.add(chin);

        // Dark Visor Strip
        const visor = new THREE.Mesh(
            new THREE.CylinderGeometry(0.148, 0.148, 0.08, 32, 1, false, -Math.PI * 0.38, Math.PI * 0.76),
            visorMat
        );
        visor.scale.set(0.92, 1, 1.08);
        visor.position.y = 0.015;
        helmetGroup.add(visor);

        // Bottom Seal
        const seal = new THREE.Mesh(
            new THREE.TorusGeometry(0.138, 0.015, 8, 32),
            baseMat
        );
        seal.rotation.x = Math.PI / 2;
        seal.position.y = -0.12;
        helmetGroup.add(seal);
    }

    createAirboxAndIntake(materials) {
        /* ── 7. AIRBOX / ENGINE INTAKE ──────────────────────────────────── */
        const airPts = [
            new THREE.Vector3(0, 0.70, 0.75),  // Intake mouth — slightly taller opening
            new THREE.Vector3(0, 0.72, 0.45),  // Rises gently to a low plateau
            new THREE.Vector3(0, 0.72, 0.10),  // Flat top — no hump, sits just above helmet
            new THREE.Vector3(0, 0.66, -0.50), // Gentle start of descent
            new THREE.Vector3(0, 0.44, -1.30), // Smooth descent
            new THREE.Vector3(0, 0.26, -2.18), // Rear exit, sunken into fuselage
        ];
        const airbox = tube(airPts, 0.26, materials.body, 22, 28);
        airbox.scale.set(1.10, 1, 1);
        airbox.name = 'airbox';
        this.body.add(airbox);

        // Accent intake ring — thin collar flush on the airbox mouth
        const intakeRing = tube([
            new THREE.Vector3(0, 0.70, 0.80),
            new THREE.Vector3(0, 0.70, 0.70),
        ], 0.265, materials.accent1, 32, 12);
        intakeRing.scale.set(1.10, 1, 1);
        this.body.add(intakeRing);
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
            // Main sidepod — Smooth LatheGeometry for continuous surface
            const podPts = podStations.map(s => new THREE.Vector2(s.rw * 2.2, s.z)).reverse();
            // Cap ends at the exact same Z to create flat faces instead of points
            podPts.unshift(new THREE.Vector2(0, podStations[podStations.length - 1].z)); // Flat rear
            podPts.push(new THREE.Vector2(0, podStations[0].z));                        // Flat front

            const podMesh = new THREE.Mesh(new THREE.LatheGeometry(podPts, 48), materials.body);
            // Non-uniform scaling to make them wider than they are tall
            podMesh.scale.set(1.2, 1, 0.7);
            podMesh.rotation.x = Math.PI / 2;
            // Move significantly closer to the center to merge with the fuselage
            podMesh.position.set(side * 0.45, 0.18, 0);
            podMesh.castShadow = true;
            this.body.add(podMesh);

            // Undercut recessed dark region — more subtle
            const undercutSeg = new THREE.Mesh(
                new THREE.CylinderGeometry(1, 1, 1.80, 36, 1), materials.bodyDark
            );
            undercutSeg.scale.set(0.42, 1, 0.16);
            undercutSeg.rotation.x = Math.PI / 2;
            undercutSeg.position.set(side * 0.45, -0.12, -0.15);
            this.body.add(undercutSeg);

            // Inlet "Mouth" — Darker primary interior to simulate depth
            const inletMouth = new THREE.Mesh(
                new THREE.CircleGeometry(0.18, 32),
                new THREE.MeshStandardMaterial({ color: materials.body.color.clone().multiplyScalar(0.4), roughness: 0.9, metalness: 0.1 })
            );
            inletMouth.scale.set(1.2, 1, 1);
            inletMouth.rotation.y = Math.PI; // Face forward
            // Flush with the front face of the sidepod (0.78)
            inletMouth.position.set(side * 0.45, 0.18, 0.782);
            this.body.add(inletMouth);

            // Louvers
            for (let i = 0; i < 6; i++) {
                this.body.add(tube([
                    new THREE.Vector3(side * 0.52, 0.32 - i * 0.030, -0.05 - i * 0.18),
                    new THREE.Vector3(side * 0.58, 0.32 - i * 0.030, -0.15 - i * 0.18),
                ], 0.006, materials.carbon, 4, 2));
            }
        });
    }

    createGearbox(materials) {
        /* ── 9. GEARBOX ─────────────────────────────────────────────────── */
        // Main gearbox casing — wide, flat, tapered box sitting under the engine
        // Wider at the front (engine side), narrower at the rear (where it meets the crash structure)
        const gearboxMain = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.28, 0.80),
            materials.carbon
        );
        gearboxMain.position.set(0, 0.04, -1.80);
        this.body.add(gearboxMain);

        // Rear taper section — narrower box blending into the diffuser area
        const gearboxRear = new THREE.Mesh(
            new THREE.BoxGeometry(0.30, 0.22, 0.40),
            materials.carbon
        );
        gearboxRear.position.set(0, 0.04, -2.18);
        this.body.add(gearboxRear);

        // Bottom casing detail — flat undertray of the gearbox
        const gearboxBase = new THREE.Mesh(
            new THREE.BoxGeometry(0.44, 0.06, 1.10),
            materials.mech
        );
        gearboxBase.position.set(0, -0.08, -1.85);
        this.body.add(gearboxBase);
    }

    createFrontWing(materials) {
        /* ── 10. FRONT WING — Symmetrical Spoon Aero ────────────────────── */
        const fwGroup = new THREE.Group();
        this.body.add(fwGroup);

        const fwZ = 4.10;   // Leading edge reference
        const fwY = -0.18;  // Ground clearance
        const span = 2.50;
        const hspan = span / 2;
        const wingHspan = hspan - 0.01; // Overlap with the endplate interior without poking through

        // Define paths for the curved wing elements (Spoon Shape)
        const createSpoonPath = (zOff, yOff, sweep, dip) => {
            return new THREE.CatmullRomCurve3([
                new THREE.Vector3(-wingHspan, yOff + 0.12, zOff),
                new THREE.Vector3(-wingHspan * 0.45, yOff + 0.02, zOff + sweep * 0.5),
                new THREE.Vector3(0, yOff - dip, zOff + sweep),
                new THREE.Vector3(wingHspan * 0.45, yOff + 0.02, zOff + sweep * 0.5),
                new THREE.Vector3(wingHspan, yOff + 0.12, zOff)
            ]);
        };

        // 1. MAIN PLANE (Continuous bottom element)
        const mainPath = createSpoonPath(-0.75, -0.05, 0.25, 0.08);
        const mainPlane = curvedWing(mainPath, 0.60, 0.01, 0.025, materials.carbon);
        fwGroup.add(mainPlane);

        // 2. FLAPS (Three progressive elements)
        const flapConfigs = [
            { zOff: -0.50, yOff: 0.04, dip: 0.05, sweep: 0.20, chord: 0.45, camber: 0.04, thick: 0.018, mat: materials.accent2 },
            { zOff: -0.35, yOff: 0.12, dip: 0.02, sweep: 0.15, chord: 0.38, camber: 0.07, thick: 0.014, mat: materials.accent2 },
            { zOff: -0.22, yOff: 0.22, dip: 0.00, sweep: 0.10, chord: 0.30, camber: 0.10, thick: 0.010, mat: materials.accent2 }
        ];

        flapConfigs.forEach(cfg => {
            const path = createSpoonPath(cfg.zOff, cfg.yOff, cfg.sweep, cfg.dip);
            const flap = curvedWing(path, cfg.chord, cfg.camber, cfg.thick, cfg.mat);
            fwGroup.add(flap);
        });

        // ── ENDPLATES (Rectangular design at wing edge) ──────────────────
        [-1, 1].forEach(side => {
            // Endplate at exact wing edge - wingHspan is the actual wing half-span
            const epX = side * wingHspan;
            const epH = 0.42;
            const epD = 0.88;
            // Local coordinates relative to fwGroup (fwGroup is already placed at fwZ, fwY)
            const epY = 0.22;   // fwY is the group's Y, so local offset only
            const epZ = -0.75;  // local Z offset within the group

            // Primary endplate slab — thin in X (side-to-side), tall in Y, deep in Z (chord-wise)
            const ep = new THREE.Mesh(
                new THREE.BoxGeometry(0.012, epH, epD),
                materials.accent1
            );
            ep.position.set(epX, epY, epZ);
            fwGroup.add(ep);

            // Lower rounded edge strip
            const epEdge = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, epD, 12),
                materials.carbon
            );
            epEdge.rotation.x = Math.PI / 2;
            epEdge.position.set(epX, epY - epH / 2 + 0.008, epZ);
            fwGroup.add(epEdge);

            // Footplate — wider and slightly longer than endplate
            const fp = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 0.012, epD + 0.06),
                materials.carbon
            );
            fp.position.set(epX, epY - epH / 2 - 0.006, epZ);
            fwGroup.add(fp);
        });

        // ── NOSE-TO-WING CONNECTING STRUT ─────────────────────────────────
        // Small support strut connecting nose cone underside to front wing
        const strutHeight = 0.13;  // Further reduced to ensure it's not out of the wing
        const strutTopY = 0.12;
        const strutBottomY = strutTopY - strutHeight;
        const noseStrut = new THREE.Mesh(
            new THREE.CylinderGeometry(0.030, 0.040, strutHeight, 16),
            materials.accent1
        );
        noseStrut.position.set(0, 0.01, 3.47); // Adjusted z-position to pull it back slightly
        noseStrut.rotation.x = 0.08; // Adjusted rotation to align better
        noseStrut.castShadow = true;
        this.body.add(noseStrut);

        // Final group placement under the nose
        fwGroup.position.set(0, fwY, fwZ);
    }

    createRearWing(materials) {
        /* ── 11. REAR WING ──────────────────────────────────────────────── */
        // Compact rear wing - smaller span, sleeker design, no DRS
        const rwSpan = 1.60;
        const hrwSpan = rwSpan / 2;

        // Wing elements should be slightly narrower than the endplate-to-endplate span
        const wSpan = rwSpan - 0.04;
        const hwSpan = wSpan / 2;

        const rw = wing(wSpan, 0.72, 0.048, 0.032, materials.body); // Labeled 'primary'
        rw.position.set(-hwSpan, 0.74, -2.54);
        this.body.add(rw);

        const rw1 = wing(wSpan, 0.42, 0.055, 0.022, materials.accent1); // Labeled 'sec'
        rw1.position.set(-hwSpan, 0.88, -2.58);
        this.body.add(rw1);

        // Sleek Y-shaped pillars — rooted into the bodywork, shortened
        [-0.32, 0.32].forEach(sx => {
            const pillarPath = [
                new THREE.Vector3(sx * 0.5, 0.50, -2.14),
                new THREE.Vector3(sx * 0.6, 0.64, -2.22),
                new THREE.Vector3(sx * 0.4, 0.74, -2.54),
                new THREE.Vector3(sx * 0.32, 0.88, -2.58),
            ];
            this.body.add(tube(pillarPath, 0.032, materials.carbon, 8, 5));
        });

        // Compact beam wing
        const bw = wing(1.20, 0.24, 0.028, 0.014, materials.accent1);
        bw.position.set(-0.60, 0.06, -2.18);
        this.body.add(bw);

        /* ── ENDPLATES ───────────────────────────────────────────────────── */
        const rwY = 0.74; // Y position of the lower wing element
        const rw1Y = 0.88; // Y position of the upper wing element
        const epHeight = 0.22; // Calculated to span below rw and above rw1
        const epDepth = 0.72;  // Match main wing chord
        const epBottomY = 0.70; // Lowest Y coordinate for the endplate assembly

        [-1, 1].forEach(side => {
            const epX = side * (hrwSpan - 0.01); // Position slightly inside full span

            // Primary endplate slab
            const ep = new THREE.Mesh(
                new THREE.BoxGeometry(0.012, epHeight, epDepth), // Thin, tall, deep
                materials.accent1
            );
            // Position center of height at epBottomY + epHeight / 2, center of depth at -2.54 (rear wing Z position)
            ep.position.set(epX, epBottomY + epHeight / 2, -2.54);
            this.body.add(ep);

            // Lower rounded edge strip
            const epEdge = new THREE.Mesh(
                new THREE.CylinderGeometry(0.008, 0.008, epDepth, 12), // Thin cylinder
                materials.carbon
            );
            epEdge.rotation.x = Math.PI / 2; // Orient correctly
            // Position at the bottom edge of the endplate, centered on the wing's Z position
            epEdge.position.set(epX, epBottomY, -2.54);
            this.body.add(epEdge);

            // Footplate — flat skid along the bottom
            const fp = new THREE.Mesh(
                new THREE.BoxGeometry(0.14, 0.012, epDepth + 0.06), // Wider than endplate depth
                materials.carbon
            );
            // Position at the bottom of the endplate, centered on the wing's Z position
            fp.position.set(epX, epBottomY - 0.012 / 2, -2.54);
            this.body.add(fp);
        });

    }

    createRainLight(materials) {
        /* ── 12. RAIN LIGHT ─────────────────────────────────────────────── */
        // Rectangular housing with a high-intensity LED panel
        const lightGroup = new THREE.Group();

        // Housing / Bezel
        const housing = new THREE.Mesh(
            new THREE.BoxGeometry(0.20, 0.16, 0.08),
            materials.carbon
        );
        lightGroup.add(housing);

        // The actual light surface (emissive)
        this.rainLight = new THREE.Mesh(
            new THREE.BoxGeometry(0.18, 0.14, 0.02),
            materials.red
        );
        // Position on the rear face
        this.rainLight.position.z = -0.045;
        lightGroup.add(this.rainLight);

        // SpotLight angled DOWNWARDS to hit the track immediately behind the car
        this.rainLightSource = new THREE.SpotLight(0xff0000, 0, 6, Math.PI / 2.5, 0.6, 1);
        this.rainLightSource.position.set(0, 0, -0.04);

        // Directional target pointing down and back
        const lightTarget = new THREE.Object3D();
        lightTarget.position.set(0, -1.2, -1.0); // Tilted down towards the track
        lightGroup.add(lightTarget);
        this.rainLightSource.target = lightTarget;

        lightGroup.add(this.rainLightSource);

        // Positioned closer to the car for a tighter glow
        lightGroup.position.set(0, 0.40, -2.12);
        this.body.add(lightGroup);
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
            { x: 1.50, y: 0, z: -1.70, front: false },
            { x: -1.50, y: 0, z: -1.70, front: false },
            { x: 1.20, y: -0.04, z: 2.30, front: true },
            { x: -1.20, y: -0.04, z: 2.30, front: true },
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

            // Multi-spoke Rim (similar to sample-1.png)
            const spokeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.2, roughness: 0.5 });
            const numSpokes = 10;
            const spokeGeo = new THREE.BoxGeometry(0.03, Rr, 0.015);
            const rimRingGeo = new THREE.TorusGeometry(Rr, 0.025, 12, 48);
            const hubGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 16);

            // Apply rim to both sides of the wheel
            [-1, 1].forEach(side => {
                const sideGroup = new THREE.Group();
                sideGroup.position.x = side * (W / 2);

                // Outer Ring
                const ring = new THREE.Mesh(rimRingGeo, spokeMat);
                ring.rotation.y = Math.PI / 2;
                sideGroup.add(ring);

                // Spokes
                for (let i = 0; i < numSpokes; i++) {
                    const angle = (i / numSpokes) * Math.PI * 2;
                    const spoke = new THREE.Mesh(spokeGeo, spokeMat);
                    spoke.rotation.x = angle;
                    spoke.position.y = Math.cos(angle) * Rr / 2;
                    spoke.position.z = Math.sin(angle) * Rr / 2;
                    sideGroup.add(spoke);
                }

                // Hub
                const hub = new THREE.Mesh(hubGeo, materials.mech);
                hub.rotation.z = Math.PI / 2;
                sideGroup.add(hub);

                wg.add(sideGroup);
            });

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

    setRainMode(isRaining) {
        if (this.rainLight && this.rainLight.material) {
            // Further reduced emissive intensity to 5.0
            this.rainLight.material.emissiveIntensity = isRaining ? 5.0 : 0.0;
        }
        if (this.rainLightSource) {
            // Further reduced PointLight intensity to 5.0
            this.rainLightSource.intensity = isRaining ? 5.0 : 0.0;
        }
        if (this.steeringWheel) {
            this.steeringWheel.children.forEach(child => {
                if (child.material && child.material.emissive) {
                    const hex = child.material.emissive.getHex();
                    if (hex === 0x00ffff) {
                        child.material.emissiveIntensity = isRaining ? 0.4 : 1.5;
                    } else if (child.material.emissiveIntensity === 0.5 || child.material.emissiveIntensity === 0.15) {
                        child.material.emissiveIntensity = isRaining ? 0.15 : 0.5;
                    }
                }
            });
        }
    }
}