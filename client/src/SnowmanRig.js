import * as THREE from 'three';
import { getVariantConfig } from './SnowmanConfig.js';

/** Hierarchical pivot rig; accessories in main.js attach to the named joints. */
export class SnowmanRig {
  constructor(variantName = 'classic', configuredVariant = null) {
    const resolved = getVariantConfig(variantName);
    this.variantName = resolved.name;
    this.variantConfig = configuredVariant || resolved.config;
    this.group = new THREE.Group();
    this.poseRoot = new THREE.Group();
    this.ownedGeometries = new Set();
    this.ownedMaterials = new Set();
    this.group.add(this.poseRoot);
    const v = this.variantConfig;
    this.poseRoot.scale.y = v.visualScaleY || 1;
    const snow = new THREE.MeshStandardMaterial({ color: '#fffdf5', roughness: 0.9, flatShading: true });
    this.ownedMaterials.add(snow);

    this.hips = new THREE.Group();
    this.hips.position.y = v.baseRadius;
    this.poseRoot.add(this.hips);
    this.baseBall = this.#ball(snow, v.baseRadius);
    this.hips.add(this.baseBall);

    this.torsoPivot = new THREE.Group();
    this.torsoPivot.position.y = v.baseRadius + v.torsoRadius * 0.84;
    this.hips.add(this.torsoPivot);
    this.torsoBall = this.#ball(snow, v.torsoRadius);
    this.torsoPivot.add(this.torsoBall);

    this.neck = new THREE.Group();
    this.neck.position.y = v.torsoRadius * 0.84;
    this.torsoPivot.add(this.neck);
    this.headPivot = new THREE.Group();
    this.headPivot.position.y = v.headRadius * 0.84;
    this.neck.add(this.headPivot);
    this.headBall = this.#ball(snow, v.headRadius);
    this.headPivot.add(this.headBall);

    this.legs = [];
    for (const side of [-1, 1]) {
      const footPivot = new THREE.Group();
      footPivot.position.set(side * v.baseRadius * 0.43, -v.baseRadius * 0.82, v.baseRadius * 0.12);
      this.hips.add(footPivot);
      const foot = new THREE.Mesh(this.#geometry(new THREE.SphereGeometry(v.footSize, 8, 6)), snow);
      foot.scale.set(1.25, 0.68, 1.55);
      foot.position.z = 0.06;
      foot.castShadow = true;
      footPivot.add(foot);
      this.legs.push({ pivot: footPivot, side, restY: footPivot.position.y, restZ: footPivot.position.z });
    }

    this.arms = [];
    const twigMaterial = new THREE.MeshStandardMaterial({ color: '#6b513e', roughness: 0.9, flatShading: true });
    this.ownedMaterials.add(twigMaterial);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * v.torsoRadius * 0.91, v.torsoRadius * 0.22, 0.02);
      shoulder.rotation.z = side * v.armRestAngle;
      this.torsoPivot.add(shoulder);
      const upperLength = v.armLength * 0.62;
      const lowerLength = v.armLength * 0.48;
      // A thicker twig silhouette reads clearly at the normal third-person distance.
      const armRadius = Math.max(0.075, v.baseRadius * 0.076);
      const upperArm = this.#stick(twigMaterial, upperLength * 1.06, armRadius);
      upperArm.position.y = -upperLength * 0.5;
      shoulder.add(upperArm);
      const shoulderJoint = new THREE.Mesh(this.#geometry(new THREE.SphereGeometry(armRadius * 1.24, 7, 6)), twigMaterial);
      shoulderJoint.position.set(0, -0.025, 0);
      shoulder.add(shoulderJoint);
      const elbow = new THREE.Group();
      elbow.position.set(side * 0.025, -upperLength, 0);
      shoulder.add(elbow);
      const forearm = this.#stick(twigMaterial, lowerLength * 1.08, armRadius * 0.9);
      forearm.position.set(side * lowerLength * 0.12, -lowerLength * 0.5, 0);
      forearm.rotation.z = -side * 0.12;
      elbow.add(forearm);
      const elbowJoint = new THREE.Mesh(this.#geometry(new THREE.SphereGeometry(armRadius * 1.15, 7, 6)), twigMaterial);
      elbowJoint.position.set(0, -0.015, 0);
      elbow.add(elbowJoint);
      const hand = new THREE.Group();
      hand.position.set(side * lowerLength * 0.12, -lowerLength, 0.12);
      elbow.add(hand);
      // One small hand twig keeps each shoulder chain reading as one arm.
      const twig = this.#stick(twigMaterial, v.armLength * 0.22, armRadius * 0.55);
      twig.position.set(side * 0.025, -0.025, 0);
      twig.rotation.z = -side * 0.18;
      hand.add(twig);
      this.arms.push({ mesh: shoulder, elbow, hand, side, rest: side * v.armRestAngle, restX: 0 });
    }
  }

  #ball(material, radius) {
    // More facets keep the silhouette clean at close range while flat shading
    // preserves the intentionally low-poly snowman style.
    const mesh = new THREE.Mesh(this.#geometry(new THREE.SphereGeometry(radius, 18, 14)), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  #stick(material, length, radius) {
    const mesh = new THREE.Mesh(this.#geometry(new THREE.CylinderGeometry(radius * 0.82, radius, length, 5)), material);
    mesh.castShadow = true;
    return mesh;
  }

  #geometry(geometry) {
    this.ownedGeometries.add(geometry);
    return geometry;
  }

  /** Dispose rig resources no longer reachable after an accessory/skin swap. */
  disposeDetachedResources() {
    const liveGeometries = new Set();
    const liveMaterials = new Set();
    this.group.traverse(object => {
      if (object.geometry) liveGeometries.add(object.geometry);
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) liveMaterials.add(material);
      }
    });
    for (const geometry of this.ownedGeometries) if (!liveGeometries.has(geometry)) geometry.dispose();
    for (const material of this.ownedMaterials) if (!liveMaterials.has(material)) material.dispose();
  }

  /** Lightweight anchor check used by development diagnostics and rig tests. */
  checkRigConnections(tolerance = 0.02) {
    this.group.updateMatrixWorld(true);
    const v = this.variantConfig;
    const torsoBottom = this.torsoPivot.position.y - v.torsoRadius;
    const torsoTop = this.torsoPivot.position.y + v.torsoRadius;
    const headBottom = this.torsoPivot.position.y + this.neck.position.y + this.headPivot.position.y - v.headRadius;
    const baseGap = Math.max(0, torsoBottom - v.baseRadius);
    const headGap = Math.max(0, headBottom - torsoTop);
    const linked = this.baseBall.parent === this.hips && this.torsoBall.parent === this.torsoPivot
      && this.torsoPivot.parent === this.hips && this.neck.parent === this.torsoPivot
      && this.headPivot.parent === this.neck && this.headBall.parent === this.headPivot
      && this.legs.every(leg => leg.pivot.parent === this.hips)
      && this.arms.every(arm => arm.mesh.parent === this.torsoPivot && arm.elbow.parent === arm.mesh);
    return linked && Math.max(baseGap, headGap) <= tolerance;
  }
}
