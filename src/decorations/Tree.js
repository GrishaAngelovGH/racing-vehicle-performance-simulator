import * as THREE from 'three';

export class Tree {
    constructor(pos) {
        this.group = new THREE.Group();
        this.create(pos);
    }

    create(pos) {
        // Trunk
        const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4d2926 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 2;
        trunk.castShadow = true;
        this.group.add(trunk);

        // Foliage
        const foliageGeo = new THREE.ConeGeometry(3, 8, 8);
        const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e5a27 });
        const foliage = new THREE.Mesh(foliageGeo, foliageMat);
        foliage.position.y = 7;
        foliage.castShadow = true;
        this.group.add(foliage);

        this.group.position.copy(pos);
        // Random scale for variety
        const scale = 0.8 + Math.random() * 0.4;
        this.group.scale.set(scale, scale, scale);
    }
}
