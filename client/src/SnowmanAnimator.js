import * as THREE from 'three';
import { SNOWMAN_CONFIG } from './SnowmanConfig.js';

/** Distance-synchronised gait clock and eased state blending for one rig. */
export class SnowmanAnimator {
  constructor() {
    this.phase = 0;
    this.idleSeconds = 0;
    this.current = 'IDLE';
    this.previous = 'IDLE';
    this.changedAt = 0;
  }

  advance(dt, distance, variantConfig, moving) {
    if (moving) {
      this.idleSeconds = 0;
      const gaitDistance = Math.max(0.1, variantConfig.strideLength / variantConfig.stepFrequency);
      this.phase = (this.phase + distance / gaitDistance * Math.PI * 2) % (Math.PI * 2);
    } else this.idleSeconds += dt;
    return this.phase;
  }

  transition(next, now) {
    if (this.current === next) return;
    this.previous = this.current;
    this.current = next;
    this.changedAt = now;
  }

  blend(now) {
    const duration = SNOWMAN_CONFIG.animation.crossFadeSeconds * 1000;
    const progress = THREE.MathUtils.clamp((now - this.changedAt) / duration, 0, 1);
    return progress * progress * (3 - 2 * progress);
  }
}
