import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SnowmanRig } from '../src/SnowmanRig.js';

test('each body variant has two shoulder-linked arms with a real hand anchor', () => {
  for (const variant of ['classic', 'tall', 'wide']) {
    const rig = new SnowmanRig(variant);
    rig.group.updateMatrixWorld(true);

    assert.equal(rig.arms.length, 2, `${variant} must have exactly two arms`);
    assert.deepEqual(rig.arms.map(arm => arm.side).sort((a, b) => a - b), [-1, 1]);
    for (const arm of rig.arms) {
      assert.equal(arm.mesh.parent, rig.torsoPivot);
      assert.equal(arm.elbow.parent, arm.mesh);
      assert.equal(arm.hand.parent, arm.elbow);
      const position = arm.hand.getWorldPosition(new THREE.Vector3());
      assert.ok(Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z));
      assert.ok(position.y > 1.4, `${variant} hand anchor should not sit beside the base ball`);
    }
    assert.ok(rig.checkRigConnections(), `${variant} rig anchors should remain connected`);
  }
});
