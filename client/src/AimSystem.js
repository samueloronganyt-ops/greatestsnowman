import * as THREE from 'three';

export const AIM_CONFIG = Object.freeze({
  maxDistance: 60,
  minHandDistance: 1.5,
  yawTurnRate: 540 * Math.PI / 180,
  maxPitch: 0.45,
  rayNear: 0.12
});
const groundPointScratch = new THREE.Vector3();

export function angleDiff(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function lerpAngle(from, to, amount) {
  return from + angleDiff(from, to) * THREE.MathUtils.clamp(amount, 0, 1);
}

export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function isWithinRoots(object, roots) {
  for (let current = object; current; current = current.parent) {
    if (roots.has(current)) return true;
  }
  return false;
}

/** Finds the first visible world point without allowing the local rig or UI sprites to self-hit. */
export function resolveCameraAimPoint({ raycaster, targets, ignoredRoots = [], groundPlane = null,
  fallbackDistance = AIM_CONFIG.maxDistance, maxDistance = AIM_CONFIG.maxDistance, out = new THREE.Vector3() }) {
  const ignored = ignoredRoots instanceof Set ? ignoredRoots : new Set(ignoredRoots);
  raycaster.near = AIM_CONFIG.rayNear;
  raycaster.far = maxDistance;
  const hits = raycaster.intersectObjects(targets, true);
  let closest = null;
  for (const hit of hits) {
    if (!Number.isFinite(hit.distance) || hit.distance < AIM_CONFIG.rayNear || hit.distance > maxDistance) continue;
    if (hit.object.isSprite || isWithinRoots(hit.object, ignored)) continue;
    closest = hit;
    break;
  }

  let groundDistance = Infinity;
  if (groundPlane) {
    const groundPoint = raycaster.ray.intersectPlane(groundPlane, groundPointScratch);
    if (groundPoint) {
      groundDistance = raycaster.ray.origin.distanceTo(groundPoint);
      if (groundDistance > maxDistance) groundDistance = Infinity;
      if (!closest || groundDistance < closest.distance) {
        out.copy(groundPoint);
        return out;
      }
    }
  }
  if (closest) return out.copy(closest.point);
  return raycaster.ray.at(Math.min(maxDistance, fallbackDistance), out);
}

export function directionFromHand(hand, target, fallbackYaw = 0) {
  const dx = target.x - hand.x;
  const dy = target.y - hand.y;
  const dz = target.z - hand.z;
  const horizontal = Math.hypot(dx, dz);
  const distance = Math.hypot(horizontal, dy);
  if (![dx, dy, dz, distance].every(Number.isFinite) || distance < AIM_CONFIG.minHandDistance) {
    return { yaw: wrapAngle(fallbackYaw), pitch: 0, distance: AIM_CONFIG.maxDistance };
  }
  return {
    yaw: wrapAngle(Math.atan2(dx, dz)),
    pitch: THREE.MathUtils.clamp(Math.atan2(dy, horizontal), -AIM_CONFIG.maxPitch, AIM_CONFIG.maxPitch),
    distance: Math.min(AIM_CONFIG.maxDistance, distance)
  };
}

/** Short hand-to-aim ray used to clamp the reticle point to the first blocking wall. */
export function resolveMuzzleBlock(hand, target, obstacles, raycaster) {
  const direction = new THREE.Vector3().subVectors(target, hand);
  const distance = direction.length();
  if (!Number.isFinite(distance) || distance < 1e-6) return null;
  raycaster.set(hand, direction.multiplyScalar(1 / distance));
  raycaster.near = 0.01;
  raycaster.far = distance;
  return raycaster.intersectObjects(obstacles, false)[0] || null;
}

