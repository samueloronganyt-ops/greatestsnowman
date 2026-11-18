import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { angleDiff, lerpAngle, directionFromHand, resolveCameraAimPoint, resolveMuzzleBlock } from '../src/AimSystem.js';

test('yaw interpolation follows the short direction across the PI boundary', () => {
  const delta = angleDiff(Math.PI - 0.05, -Math.PI + 0.05);
  assert.ok(Math.abs(delta - 0.1) < 1e-9);
  assert.ok(Math.abs(Math.abs(lerpAngle(Math.PI - 0.05, -Math.PI + 0.05, 0.5)) - Math.PI) < 1e-6);
});

test('client and Java use +Z-forward yaw and the same clamped pitch convention', () => {
  const direction = directionFromHand({ x: 1, y: 2, z: 3 }, { x: 5, y: 5, z: 9 });
  assert.ok(Math.abs(direction.yaw - Math.atan2(4, 6)) < 1e-9);
  assert.ok(Math.abs(direction.pitch - Math.atan2(3, Math.hypot(4, 6))) < 1e-9);
});

test('center ray ignores all local snowman descendants and hits the remote target', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, 1);
  camera.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const own = new THREE.Group();
  own.position.z = 4;
  own.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial()));
  own.updateMatrixWorld(true);
  const enemy = new THREE.Group();
  enemy.position.z = 9;
  enemy.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial()));
  enemy.updateMatrixWorld(true);
  const target = resolveCameraAimPoint({ raycaster, targets: [own, enemy], ignoredRoots: [own], maxDistance: 60 });
  assert.ok(target.z > 8 && target.z < 9);
});

test('hand ray stops at the first wall between the hand and camera-selected point', () => {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.4), new THREE.MeshBasicMaterial());
  wall.position.set(0, 1, 4);
  wall.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const hit = resolveMuzzleBlock(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 10), [wall], raycaster);
  assert.ok(hit);
  assert.ok(Math.abs(hit.point.z - 3.8) < 1e-6);
});
