// Character proportions and timing live together so variants share one animator.
export const SNOWMAN_CONFIG = Object.freeze({
  animation: Object.freeze({
    crossFadeSeconds: 0.15,
    idleBreathHz: 0.25,
    idleBreathScale: 0.015,
    idleSwayHz: 0.2,
    idleSwayRadians: 0.026,
    idleHeadHz: 0.16,
    idleScarfHz: 0.45,
    chargeTrembleHz: 7,
    chargeTrembleRadians: 0.01745,
    chargeFinalTrembleHz: 7.5,
    idleVariantSeconds: 8,
    throwSeconds: 0.45,
    throwReleaseStart: 0.12,
    throwReleaseEnd: 0.20,
    runSpeed: 4.1
  }),
  variants: Object.freeze({
    classic: Object.freeze({ name: 'CLASSIC', baseRadius: 1.0, torsoRadius: 0.72, headRadius: 0.5,
      armLength: 0.88, armRestAngle: 0.30, strideLength: 1.2, stepFrequency: 1.0,
      waddle: 0.07, footSize: 0.25, visualScaleY: 1.0, hitboxRadius: 0.82, hitboxHeight: 4.13, speedMultiplier: 1 }),
    tall: Object.freeze({ name: 'TALL', baseRadius: 0.85, torsoRadius: 0.65, headRadius: 0.45,
      armLength: 1.04, armRestAngle: 0.27, strideLength: 1.38, stepFrequency: 0.88,
      waddle: 0.055, footSize: 0.21, visualScaleY: 1.425, hitboxRadius: 0.77, hitboxHeight: 5.16, speedMultiplier: 0.95 }),
    wide: Object.freeze({ name: 'WIDE', baseRadius: 1.2, torsoRadius: 0.8, headRadius: 0.52,
      armLength: 0.72, armRestAngle: 0.34, strideLength: 0.91, stepFrequency: 1.18,
      waddle: 0.115, footSize: 0.30, visualScaleY: 0.79, hitboxRadius: 0.98, hitboxHeight: 3.72, speedMultiplier: 0.9 })
  })
});

// World dimensions are shared conceptually with MovementConfig/MapGenerator.
export const WORLD_SCALE = Object.freeze({
  wallHeight: Object.freeze({ ice: 2.8, snow: 2.4, fence: 1.25 }),
  visualScale: Object.freeze({ classic: 1, tall: 1.32, wide: 1 }),
  camera: Object.freeze({ distance: 8.0, aimDistance: 5.8, aimHeight: 0.55 })
});

const warnedVariantNames = new Set();

/** Resolve server/profile input once to a canonical, safe visual variant. */
export function getVariantConfig(value) {
  const variantName = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const config = SNOWMAN_CONFIG.variants[variantName];
  if (config) return { name: variantName, config };
  const warningKey = variantName || '<missing>';
  if (!warnedVariantNames.has(warningKey)) {
    warnedVariantNames.add(warningKey);
    console.warn(`[Snowman variant] Unknown body variant "${warningKey}"; using classic.`);
  }
  return { name: 'classic', config: SNOWMAN_CONFIG.variants.classic };
}

// Compatibility helper for existing consumers.
export function getSnowmanVariant(value) { return getVariantConfig(value).config; }
