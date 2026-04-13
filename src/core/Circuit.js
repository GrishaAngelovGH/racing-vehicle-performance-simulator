import * as THREE from 'three';

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
            new THREE.Vector3(-100, 0, -100),
            new THREE.Vector3(0, 0, 0)
        ],
        treeProb: 0.7,
        buildingProb: 0.3,
        groundColor: 0x116611,
        curbColor: 0xffffff,
        description: 'A flowing open-country circuit with wide sweeping arcs, a large outer loop, and tight infield twists. Smooth, committed driving is rewarded over braking.'
    }
};

export function createCircuit(scene, config) {
    const circuitGroup = new THREE.Group();
    scene.add(circuitGroup);

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
        const pos = circuitCurve.getPoint(t % 1);
        const tangent = circuitCurve.getTangent(t % 1).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

        // Left vertex
        const pLeft = new THREE.Vector3().copy(pos).addScaledVector(side, circuitWidth / 2);
        vertices.push(pLeft.x, 0.1, pLeft.z);

        // Right vertex
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

    // Create Curbs (White edges)
    const curbWidth = 0.8;
    const curbGeo = new THREE.BufferGeometry();
    const curbVertices = [];
    const curbIndices = [];

    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const pos = circuitCurve.getPoint(t % 1);
        const tangent = circuitCurve.getTangent(t % 1).normalize();
        const side = new THREE.Vector3().crossVectors(tangent, up).normalize();

        // Left curb
        const l1 = new THREE.Vector3().copy(pos).addScaledVector(side, circuitWidth / 2);
        const l2 = new THREE.Vector3().copy(pos).addScaledVector(side, circuitWidth / 2 + curbWidth);
        curbVertices.push(l1.x, 0.15, l1.z, l2.x, 0.15, l2.z);

        // Right curb
        const r1 = new THREE.Vector3().copy(pos).addScaledVector(side, -circuitWidth / 2);
        const r2 = new THREE.Vector3().copy(pos).addScaledVector(side, -circuitWidth / 2 - curbWidth);
        curbVertices.push(r1.x, 0.15, r1.z, r2.x, 0.15, r2.z);

        if (i < segments) {
            const base = i * 4;
            // Left curb faces
            curbIndices.push(base, base + 1, base + 4);
            curbIndices.push(base + 1, base + 5, base + 4);
            // Right curb faces
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

    return { circuitGroup, circuitCurve };
}
