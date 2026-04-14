import * as THREE from 'three';
import { Building } from '../decorations/Building.js';

export const CIRCUIT_CONFIGS = {
    classic: {
        name: 'High-Speed Classic',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(150, 0, 0),
            new THREE.Vector3(400, 0, 0),
            new THREE.Vector3(550, 0, 50),
            new THREE.Vector3(600, 0, 150),
            new THREE.Vector3(550, 0, 300),
            new THREE.Vector3(450, 0, 400),
            new THREE.Vector3(300, 0, 420),
            new THREE.Vector3(200, 0, 380),
            new THREE.Vector3(0, 0, 350),
            new THREE.Vector3(-200, 0, 350),
            new THREE.Vector3(-400, 0, 500),
            new THREE.Vector3(-550, 0, 650),
            new THREE.Vector3(-450, 0, 750),
            new THREE.Vector3(-200, 0, 800),
            new THREE.Vector3(-50, 0, 900),
            new THREE.Vector3(200, 0, 950),
            new THREE.Vector3(400, 0, 850),
            new THREE.Vector3(700, 0, 600),
            new THREE.Vector3(800, 0, 300),
            new THREE.Vector3(850, 0, 0),
            new THREE.Vector3(800, 0, -300),
            new THREE.Vector3(500, 0, -500),
            new THREE.Vector3(100, 0, -450),
            new THREE.Vector3(-50, 0, -300),
            new THREE.Vector3(-100, 0, -100)
        ],
        treeProb: 0.7,
        buildingProb: 0.3,
        groundColor: 0x116611,
        curbColor: 0xffffff,
        description: 'A flowing open-country circuit with wide sweeping arcs, a large outer loop, and tight infield twists. Smooth, committed driving is rewarded over braking.'
    },
    forest: {
        name: 'Forest Sprint',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(150, 0, 50),
            new THREE.Vector3(300, 0, 0),
            new THREE.Vector3(450, 0, 150),
            new THREE.Vector3(400, 0, 350),
            new THREE.Vector3(200, 0, 500),
            new THREE.Vector3(-100, 0, 400),
            new THREE.Vector3(-200, 0, 150)
        ],
        treeProb: 0.95,
        buildingProb: 0.05,
        groundColor: 0x0a4d0a,
        curbColor: 0xe10600,
        description: 'An organic, high-speed course winding through dense woodlands. Tight hairpins and flowing curves test both grip and precision.'
    },
    city: {
        name: 'City Street',
        points: [
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(200, 0, 0),
            new THREE.Vector3(400, 0, 0),
            new THREE.Vector3(400, 0, 20),
            new THREE.Vector3(400, 0, 200),
            new THREE.Vector3(380, 0, 200),
            new THREE.Vector3(100, 0, 200),
            new THREE.Vector3(100, 0, 220),
            new THREE.Vector3(100, 0, 400),
            new THREE.Vector3(80, 0, 400),
            new THREE.Vector3(-100, 0, 400),
            new THREE.Vector3(-100, 0, 100),
            new THREE.Vector3(-80, 0, 0)
        ],
        treeProb: 0.1,
        buildingProb: 0.9,
        groundColor: 0x222222,
        curbColor: 0xf9d62e,
        description: 'A technical harbor-style street circuit with sharp 90-degree turns and narrow urban canyons between skyscrapers.'
    },
    custom: {
        name: 'Custom User Circuit',
        points: [],
        treeProb: 0.5,
        buildingProb: 0.5,
        groundColor: 0x222222,
        curbColor: 0xffffff,
        description: 'A circuit designed by you! Featuring your unique layout and balance of scenery.'
    }
};

function makeChequeredTexture(cols, rows, tileSize = 32) {
    const canvas = document.createElement('canvas');
    canvas.width = cols * tileSize;
    canvas.height = rows * tileSize;
    const ctx = canvas.getContext('2d');
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#000000';
            ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);
        }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function makeGantrySignTexture(circuitName) {
    const cw = 1024, ch = 192;
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, '#1a0000');
    grad.addColorStop(1, '#3d0000');
    ctx.fillStyle = grad;
    if (ctx.roundRect) {
        ctx.roundRect(0, 0, cw, ch, 16);
        ctx.fill();
    } else {
        ctx.fillRect(0, 0, cw, ch);
    }

    ctx.fillStyle = '#e10600';
    ctx.fillRect(0, 0, cw, 8);
    ctx.fillRect(0, ch - 8, cw, 8);

    const tileSize = 14;
    const cornerCols = 6, cornerRows = 3;
    for (let side = 0; side < 2; side++) {
        const startX = side === 0 ? 0 : cw - cornerCols * tileSize;
        for (let r = 0; r < cornerRows; r++) {
            for (let c = 0; c < cornerCols; c++) {
                ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
                ctx.fillRect(startX + c * tileSize, 8 + r * tileSize, tileSize, tileSize);
            }
        }
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4422';
    ctx.shadowBlur = 24;
    ctx.font = 'bold 80px "Arial Black", Impact, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('START / FINISH', cw / 2, ch * 0.44);

    ctx.shadowBlur = 8;
    ctx.shadowColor = '#e10600';
    ctx.font = 'bold 28px Arial, sans-serif';
    ctx.fillStyle = '#ffcccc';
    if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '4px';
    ctx.fillText(circuitName.toUpperCase(), cw / 2, ch * 0.82);

    return new THREE.CanvasTexture(canvas);
}

function createStartFinish(circuitGroup, circuitCurve, config, circuitWidth) {
    const startPos = circuitCurve.getPointAt(0);
    const startTangent = circuitCurve.getTangentAt(0).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const sideVec = new THREE.Vector3().crossVectors(startTangent, up).normalize();

    const chequeredTex = makeChequeredTexture(12, 2, 32);
    const startLineGeo = new THREE.PlaneGeometry(circuitWidth, 2);
    const startLineMat = new THREE.MeshStandardMaterial({
        map: chequeredTex,
        roughness: 0.4,
        metalness: 0.1
    });
    const startLine = new THREE.Mesh(startLineGeo, startLineMat);
    startLine.position.copy(startPos);
    startLine.position.y = 0.22;
    
    const basis = new THREE.Matrix4();
    basis.makeBasis(sideVec, startTangent, up);
    startLine.quaternion.setFromRotationMatrix(basis);
    
    circuitGroup.add(startLine);

    const gantryGroup = new THREE.Group();
    const gantryHeight = 12;
    const gantryWidth = circuitWidth + 6;

    const pillarGeo = new THREE.CylinderGeometry(0.4, 0.4, gantryHeight, 12);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.copy(startPos).addScaledVector(sideVec, gantryWidth / 2);
    leftPillar.position.y = gantryHeight / 2;
    leftPillar.castShadow = true;
    gantryGroup.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.copy(startPos).addScaledVector(sideVec, -gantryWidth / 2);
    rightPillar.position.y = gantryHeight / 2;
    rightPillar.castShadow = true;
    gantryGroup.add(rightPillar);

    const crossbarGeo = new THREE.BoxGeometry(gantryWidth + 1, 2, 1.5);
    const crossbarMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const crossbar = new THREE.Mesh(crossbarGeo, crossbarMat);
    crossbar.position.copy(startPos);
    crossbar.position.y = gantryHeight;
    
    const crossbarBasis = new THREE.Matrix4();
    crossbarBasis.makeBasis(sideVec, up, startTangent.clone().negate());
    crossbar.quaternion.setFromRotationMatrix(crossbarBasis);
    crossbar.castShadow = true;
    gantryGroup.add(crossbar);

    const signTex = makeGantrySignTexture(config.name);
    const signGeo = new THREE.PlaneGeometry(gantryWidth * 0.85, 1.8);
    const signMat = new THREE.MeshStandardMaterial({
        map: signTex,
        side: THREE.DoubleSide,
        roughness: 0.3,
        metalness: 0.1
    });

    const signForward = new THREE.Mesh(signGeo, signMat);
    signForward.position.copy(crossbar.position);
    signForward.position.y -= 0.1;
    signForward.position.addScaledVector(startTangent, 0.8);
    signForward.quaternion.copy(crossbar.quaternion);
    gantryGroup.add(signForward);

    const signBackward = signForward.clone();
    signBackward.position.copy(crossbar.position);
    signBackward.position.y -= 0.1;
    signBackward.position.addScaledVector(startTangent, -0.8);
    signBackward.quaternion.copy(crossbar.quaternion);
    gantryGroup.add(signBackward);

    circuitGroup.add(gantryGroup);
}

export function createCircuit(circuitGroup, config) {
    circuitGroup.clear();

    const points = config.points;
    const circuitCurve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
    circuitCurve.closed = true;

    const circuitWidth = 12;
    const segments = 400;
    const circuitGeo = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];
    const uvs = [];

    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = circuitCurve.getPointAt(t);
        const tangent = circuitCurve.getTangentAt(t).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const pLeft = new THREE.Vector3().copy(pos).addScaledVector(side, circuitWidth / 2);
        vertices.push(pLeft.x, 0.1, pLeft.z);

        const pRight = new THREE.Vector3().copy(pos).addScaledVector(side, -circuitWidth / 2);
        vertices.push(pRight.x, 0.1, pRight.z);

        uvs.push(0, t * 20);
        uvs.push(1, t * 20);

        if (i < segments) {
            const a = i * 2;
            const b = i * 2 + 1;
            const c = (i + 1) * 2;
            const d = (i + 1) * 2 + 1;

            indices.push(a, b, c);
            indices.push(b, d, c);
        }
    }

    circuitGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    circuitGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    circuitGeo.setIndex(indices);
    circuitGeo.computeVertexNormals();

    const circuitMat = new THREE.MeshStandardMaterial({
        color: 0x333333,
        side: THREE.DoubleSide
    });
    const circuitMesh = new THREE.Mesh(circuitGeo, circuitMat);
    circuitMesh.receiveShadow = true;
    circuitGroup.add(circuitMesh);

    const curbWidth = 0.8;
    const curbGeo = new THREE.BufferGeometry();
    const curbVertices = [];
    const curbIndices = [];

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = circuitCurve.getPointAt(t);
        const tangent = circuitCurve.getTangentAt(t).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

        const l1 = new THREE.Vector3().copy(pos).addScaledVector(side, circuitWidth / 2);
        const l2 = new THREE.Vector3().copy(pos).addScaledVector(side, circuitWidth / 2 + curbWidth);
        curbVertices.push(l1.x, 0.15, l1.z, l2.x, 0.15, l2.z);

        const r1 = new THREE.Vector3().copy(pos).addScaledVector(side, -circuitWidth / 2);
        const r2 = new THREE.Vector3().copy(pos).addScaledVector(side, -circuitWidth / 2 - curbWidth);
        curbVertices.push(r1.x, 0.15, r1.z, r2.x, 0.15, r2.z);

        if (i < segments) {
            const base = i * 4;
            curbIndices.push(base, base + 1, base + 4);
            curbIndices.push(base + 1, base + 5, base + 4);
            curbIndices.push(base + 2, base + 3, base + 6);
            curbIndices.push(base + 3, base + 7, base + 6);
        }
    }

    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbVertices, 3));
    curbGeo.setIndex(curbIndices);
    curbGeo.computeVertexNormals();
    const curbMat = new THREE.MeshStandardMaterial({ color: config.curbColor, side: THREE.DoubleSide });
    const curbs = new THREE.Mesh(curbGeo, curbMat);
    circuitGroup.add(curbs);

    populateDecorations(circuitGroup, circuitCurve, config, circuitWidth);
    createStartFinish(circuitGroup, circuitCurve, config, circuitWidth);

    return { circuitCurve };
}

function populateDecorations(circuitGroup, circuitCurve, config, trackWidth) {
    const isCity = config.name.toLowerCase().includes('city');
    const count = isCity ? 180 : 150; // Match legacy counts
    const offsetDistance = isCity ? 15 : 20;

    // Create a cached list of track points for collision checking
    const trackPoints = [];
    const numSamples = 400; // Increased to match legacy
    for (let i = 0; i <= numSamples; i++) {
        trackPoints.push(circuitCurve.getPointAt(i / numSamples));
    }

    const minClearance = trackWidth / 2 + 8; // Half-width + safety buffer for buildings

    for (let i = 0; i < count; i++) {
        let placed = false;
        let attempts = 0;

        // Try up to 10 times to find a clear spot (Legacy logic)
        while (!placed && attempts < 10) {
            attempts++;
            const t = Math.random();
            const pos = circuitCurve.getPointAt(t);
            const tangent = circuitCurve.getTangentAt(t).normalize();
            const up = new THREE.Vector3(0, 1, 0);
            const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

            // Randomly choose left or right side of track
            const sideDir = Math.random() > 0.5 ? 1 : -1;
            
            // Only place if it passes the building probability check
            if (Math.random() < config.buildingProb) {
                const dist = (trackWidth / 2 + offsetDistance) + Math.random() * 40;
                const finalPos = new THREE.Vector3().copy(pos).addScaledVector(side, sideDir * dist);

                // Collision check against ALL points on the track curve
                let tooClose = false;
                for (let j = 0; j < trackPoints.length; j++) {
                    if (finalPos.distanceTo(trackPoints[j]) < minClearance) {
                        tooClose = true;
                        break;
                    }
                }

                if (!tooClose) {
                    const building = new Building(finalPos);
                    circuitGroup.add(building.group);
                    placed = true;
                }
            } else {
                // If the probability check fails, we consider this "slot" filled by nothing (or later, a tree)
                placed = true; 
            }
        }
    }
}
