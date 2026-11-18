const frame = (time, pose) => Object.freeze({ time, pose: Object.freeze(pose) });

// Title-only motion settings. Gameplay animation remains owned by SnowmanAnimator.
export const TITLE_ANIMATION_CONFIG = Object.freeze({
  fov: 35,
  cameraElevationRadians: 8 * Math.PI / 180,
  targetStageHeight: 0.96,
  targetStageWidth: 0.82,
  welcomeArmRaise: 2.27,
  baseBreathHz: 0.25,
  baseBreathScale: 0.015,
  gestureIntervalSeconds: Object.freeze([4, 9]),
  gestureBlendSeconds: 0.25,
  interruptCooldownSeconds: 0.6,
  clickBounceSeconds: 0.56,
  playBounceSeconds: 0.75,
  clickBounceHeight: 0.28,
  playBounceHeight: 0.34,
  torsoYawFollow: 0.12,
  neckYawShare: 0.16,
  headYawShare: 0.72,
  eyeFollowScale: 0.24,
  eyeFollowVerticalScale: 0.2,
  headRollPerYaw: 0.12,
  hipShiftHz: 0.1,
  hipShiftRadians: 1.5 * Math.PI / 180,
  armSwayHz: 0.27,
  armSwayRadians: 0.035,
  hatBobHz: 0.41,
  hatBobHeight: 0.014,
  scarfFlutterHz: 0.46,
  scarfFlutterRadians: 0.025,
  scarfTailBaseRoll: -0.72,
  scarfTailRollRadians: 0.035,
  idleLookIntervalSeconds: Object.freeze([1.8, 3.7]),
  idleLookYawRadians: 0.18,
  idleLookPitchRadians: 0.1,
  welcomeElbowBend: 0.14,
  waveElbowSwing: 0.22,
  armAngleLimits: Object.freeze([-2.9, 2.9]),
  elbowAngleLimits: Object.freeze([-0.9, 0.9]),
  shiverPosition: 0.025,
  shiverFrequency: 24,
  gestureTorsoShake: 0.012,
  hatIdleBobHz: 0.3,
  scarfTailIdleHz: 0.35,
  snowPuffSeconds: 0.52,
  snowPuffSpread: 0.55,
  snowPuffRise: 0.9,
  headLimits: Object.freeze({ yaw: 40 * Math.PI / 180, pitch: 20 * Math.PI / 180, roll: 6 * Math.PI / 180 }),
  headResponseSeconds: 0.21,
  headMaxSpeed: 3.8,
  pointerIdleSeconds: 3,
  eyeSaccadeIntervalSeconds: Object.freeze([0.35, 0.75]),
  eyeSaccadeRadians: 0.022,
  blinkIntervalSeconds: Object.freeze([3, 6]),
  blinkDurationSeconds: 0.12,
  gestures: Object.freeze([
    Object.freeze({ name: 'WAVE', weight: 1.3, frames: Object.freeze([
      frame(0, {}), frame(0.24, { rightArm: 0.35, rightElbow: -0.2, headRoll: -0.08 }),
      frame(0.55, { rightArm: 0.35, rightElbow: 0.42 }), frame(0.86, { rightArm: 0.35, rightElbow: -0.34 }),
      frame(1.17, { rightArm: 0.35, rightElbow: 0.42 }), frame(1.48, { rightArm: 0.35, rightElbow: -0.34 }),
      frame(1.8, { rightArm: 0.35, rightElbow: 0.42 }), frame(2.12, { rightArm: 0.35, rightElbow: -0.28 }),
      frame(2.48, { headRoll: -0.04 }), frame(2.75, {})
    ]) }),
    Object.freeze({ name: 'DOUBLE_WAVE', weight: 1.0, frames: Object.freeze([
      frame(0, {}), frame(0.28, { leftArm: 0.32, rightArm: 0.36, hop: 0.12, squash: -0.08 }),
      frame(0.68, { leftArm: 0.48, rightArm: 0.5, leftElbow: -0.2, rightElbow: 0.2, hop: 0.17, squash: 0.05 }),
      frame(1.08, { leftArm: 0.36, rightArm: 0.42, leftElbow: 0.2, rightElbow: -0.2, hop: 0.04 }),
      frame(1.48, { leftArm: 0.48, rightArm: 0.5, leftElbow: -0.2, rightElbow: 0.2, squash: -0.06 }), frame(1.9, {})
    ]) }),
    Object.freeze({ name: 'HAT_TIP', weight: 0.75, frames: Object.freeze([
      frame(0, {}), frame(0.32, { rightArm: 0.38, rightElbow: 0.22, torsoLean: -0.04, headPitch: -0.12 }),
      frame(0.62, { rightArm: 0.5, rightElbow: 0.34, torsoLean: -0.08, headPitch: -0.2, hatLift: 1 }),
      frame(0.94, { rightArm: 0.5, rightElbow: 0.28, torsoLean: -0.08, headPitch: -0.17, hatLift: 1 }),
      frame(1.2, { rightArm: 0.36, rightElbow: 0.16, torsoLean: -0.04, headPitch: -0.08, hatLift: 0.4 }), frame(1.55, {})
    ]) }),
    Object.freeze({ name: 'LOOK_AROUND', weight: 1.0, frames: Object.freeze([
      frame(0, {}), frame(0.35, { headYaw: -0.48, headRoll: -0.05 }), frame(0.88, { headYaw: -0.48 }),
      frame(1.18, { headYaw: 0.46, headRoll: 0.05 }), frame(1.72, { headYaw: 0.46 }),
      frame(2.02, { headYaw: 0.08, headPitch: 0.2, hop: 0.13 }), frame(2.35, { headPitch: 0.16 }), frame(2.7, {})
    ]) }),
    Object.freeze({ name: 'HAPPY_HOP', weight: 0.9, frames: Object.freeze([
      frame(0, {}), frame(0.22, { squash: -0.13, leftArm: 0.2, rightArm: 0.2 }),
      frame(0.5, { hop: 0.4, squash: 0.09, leftArm: 0.5, rightArm: 0.5 }),
      frame(0.82, { hop: 0.34, squash: 0.04, leftArm: 0.48, rightArm: 0.48 }),
      frame(1.04, { squash: -0.14, leftArm: 0.26, rightArm: 0.26 }), frame(1.5, {})
    ]) }),
    Object.freeze({ name: 'SHIVER', weight: 0.8, frames: Object.freeze([
      frame(0, {}), frame(0.22, { shiver: 1, scarfFlutter: 0.08, leftArm: -0.12, rightArm: -0.12 }),
      frame(0.72, { shiver: 1, scarfFlutter: 0.18, leftArm: -0.16, rightArm: -0.16, headRoll: 0.035 }),
      frame(1.12, { shiver: 0.85, scarfFlutter: 0.12, leftArm: 0.02, rightArm: 0.02 }),
      frame(1.55, { scarfFlutter: 0.035, leftArm: 0.08, rightArm: 0.08 }), frame(1.9, {})
    ]) }),
    Object.freeze({ name: 'JUGGLE', weight: 0.7, frames: Object.freeze([
      frame(0, {}), frame(0.28, { leftArm: 0.28, rightArm: 0.28, leftElbow: 0.22, rightElbow: -0.22 }),
      frame(0.56, { leftArm: 0.38, rightArm: 0.38, juggle: 1 }), frame(2.35, { leftArm: 0.38, rightArm: 0.38, juggle: 1 }),
      frame(2.7, { leftArm: 0.15, rightArm: 0.15 }), frame(3.05, {})
    ]) }),
    Object.freeze({ name: 'POINT_AT_PLAY', weight: 0.85, frames: Object.freeze([
      frame(0, {}), frame(0.3, { rightArm: -1.7, rightElbow: -0.04, headYaw: -0.08, headPitch: 0.08 }),
      frame(0.68, { rightArm: -1.82, rightElbow: -0.04, headYaw: -0.08, headPitch: 0.08, blink: 1 }),
      frame(1.0, { rightArm: -1.82, rightElbow: -0.04, headYaw: -0.08, headPitch: 0.08 }),
      frame(1.35, { rightArm: -0.6, headPitch: 0.03 }), frame(1.7, {})
    ]) })
  ])
});
