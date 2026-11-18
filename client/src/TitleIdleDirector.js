import { TITLE_ANIMATION_CONFIG as CONFIG } from './TitleAnimationConfig.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
const smoothstep = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const randomBetween = (random, range) => range[0] + clamp(random(), 0, 0.999999) * (range[1] - range[0]);

const EMPTY_POSE = Object.freeze({
  breath: 0, hipShift: 0, armSway: 0, hatBob: 0, scarfFlutter: 0, headYaw: 0, headPitch: 0, headRoll: 0,
  eyeX: 0, eyeY: 0, blink: 0, leftArm: 0, rightArm: 0, leftElbow: 0, rightElbow: 0,
  torsoLean: 0, hop: 0, squash: 0, shiver: 0, hatLift: 0, juggle: 0, playNod: 0, gesture: ''
});

/** Title-only pose director. It emits values; the renderer is the sole pivot writer. */
export class TitleIdleDirector {
  constructor({ random = Math.random } = {}) {
    this.random = random;
    this.elapsed = 0;
    this.activeGesture = null;
    this.previousGesture = '';
    this.nextGestureAt = this.randomDelay();
    this.scheduledInterval = this.nextGestureAt;
    this.lastGesturePose = {};
    this.cancelBlend = null;
    this.interruptKind = '';
    this.interruptElapsed = 0;
    this.lastInterruptAt = -Infinity;
    this.pointerMode = '';
    this.pointerYaw = 0;
    this.pointerPitch = 0;
    this.lastPointerAt = -Infinity;
    this.hover = null;
    this.idleHeadYaw = 0;
    this.idleHeadPitch = 0;
    this.nextIdleLookAt = 0;
    this.currentHeadYaw = 0;
    this.currentHeadPitch = 0;
    this.currentHeadRoll = 0;
    this.saccadeX = 0;
    this.saccadeY = 0;
    this.nextSaccadeAt = 0;
    this.nextBlinkAt = randomBetween(this.random, CONFIG.blinkIntervalSeconds);
    this.blinkRemaining = 0;
    this.hoverStartedAt = 0;
    this.paused = false;
  }

  randomDelay() { return randomBetween(this.random, CONFIG.gestureIntervalSeconds); }

  setPointerTarget(yaw, pitch, { touch = false, activity = true } = {}) {
    const limits = CONFIG.headLimits;
    this.pointerYaw = clamp(yaw, -limits.yaw, limits.yaw);
    this.pointerPitch = clamp(pitch, -limits.pitch, limits.pitch);
    this.pointerMode = touch ? 'touch' : 'mouse';
    if (activity) this.lastPointerAt = this.elapsed;
  }

  clearPointer() {
    this.pointerMode = '';
    this.pointerYaw = 0;
    this.pointerPitch = 0;
  }

  resetPointer() { this.clearPointer(); }

  setHover(name, yaw = 0, pitch = 0) {
    if (!name) { this.hover = null; return; }
    if (this.hover?.name !== name) this.hoverStartedAt = this.elapsed;
    this.hover = { name, yaw: clamp(yaw, -CONFIG.headLimits.yaw, CONFIG.headLimits.yaw), pitch: clamp(pitch, -CONFIG.headLimits.pitch, CONFIG.headLimits.pitch) };
  }

  startNextGesture() {
    const choices = CONFIG.gestures.filter(gesture => gesture.name !== this.previousGesture);
    const totalWeight = choices.reduce((sum, gesture) => sum + gesture.weight, 0);
    let selection = clamp(this.random(), 0, 0.999999) * totalWeight;
    const definition = choices.find(gesture => (selection -= gesture.weight) < 0) || choices[0];
    this.activeGesture = { definition, elapsed: 0 };
    return definition.name;
  }

  /** Cancel a gesture and blend its current pose out before a click/play bounce. */
  interrupt(kind = 'click') {
    if (this.elapsed - this.lastInterruptAt < CONFIG.interruptCooldownSeconds) return false;
    this.lastInterruptAt = this.elapsed;
    if (this.activeGesture) this.previousGesture = this.activeGesture.definition.name;
    this.cancelBlend = { pose: { ...this.lastGesturePose }, elapsed: 0 };
    this.activeGesture = null;
    this.interruptKind = kind;
    this.interruptElapsed = 0;
    return true;
  }

  sampleGesture(gesture, time) {
    const frames = gesture.frames;
    const duration = frames.at(-1).time;
    const t = clamp(time, 0, duration);
    let before = frames[0], after = frames.at(-1);
    for (let index = 1; index < frames.length; index++) {
      if (t <= frames[index].time) { before = frames[index - 1]; after = frames[index]; break; }
    }
    const progress = after.time === before.time ? 1 : (t - before.time) / (after.time - before.time);
    const eased = smoothstep(progress);
    const values = {};
    const keys = new Set([...Object.keys(before.pose), ...Object.keys(after.pose)]);
    for (const key of keys) {
      const from = before.pose[key] || 0;
      const to = after.pose[key] || 0;
      values[key] = from + (to - from) * eased;
    }
    const fadeIn = smoothstep(t / CONFIG.gestureBlendSeconds);
    const fadeOut = smoothstep((duration - t) / CONFIG.gestureBlendSeconds);
    const blend = Math.min(fadeIn, fadeOut);
    for (const key of Object.keys(values)) values[key] *= blend;
    return { ...values, gesture: gesture.name, progress: duration > 0 ? t / duration : 1 };
  }

  update(dt, { reducedMotion = false, hidden = false } = {}) {
    const step = clamp(dt, 0, 0.05);
    if (hidden) {
      if (!this.paused) {
        if (this.activeGesture) this.previousGesture = this.activeGesture.definition.name;
        this.activeGesture = null;
        this.cancelBlend = null;
        this.interruptKind = '';
        this.lastGesturePose = {};
        this.nextGestureAt = this.elapsed + this.randomDelay();
        this.scheduledInterval = this.nextGestureAt - this.elapsed;
        this.clearPointer();
      }
      this.paused = true;
      return { ...EMPTY_POSE };
    }
    this.paused = false;
    this.elapsed += step;
    if (this.blinkRemaining > 0) this.blinkRemaining = Math.max(0, this.blinkRemaining - step);
    if (this.elapsed >= this.nextBlinkAt && this.blinkRemaining <= 0) {
      this.blinkRemaining = CONFIG.blinkDurationSeconds;
      this.nextBlinkAt = this.elapsed + randomBetween(this.random, CONFIG.blinkIntervalSeconds);
    }
    if (this.elapsed >= this.nextSaccadeAt) {
      this.saccadeX = (this.random() - 0.5) * CONFIG.eyeSaccadeRadians * 2;
      this.saccadeY = (this.random() - 0.5) * CONFIG.eyeSaccadeRadians * 2;
      this.nextSaccadeAt = this.elapsed + randomBetween(this.random, CONFIG.eyeSaccadeIntervalSeconds);
    }
    if (this.elapsed >= this.nextIdleLookAt) {
      this.idleHeadYaw = (this.random() - 0.5) * CONFIG.idleLookYawRadians * 2;
      this.idleHeadPitch = (this.random() - 0.5) * CONFIG.idleLookPitchRadians * 2;
      this.nextIdleLookAt = this.elapsed + randomBetween(this.random, CONFIG.idleLookIntervalSeconds);
    }

    let targetYaw = this.idleHeadYaw, targetPitch = this.idleHeadPitch;
    const pointerActive = (this.pointerMode === 'mouse' && this.elapsed - this.lastPointerAt < CONFIG.pointerIdleSeconds)
      || (this.pointerMode === 'touch' && this.elapsed - this.lastPointerAt < 2);
    if (this.hover) { targetYaw = this.hover.yaw; targetPitch = this.hover.pitch; }
    else if (pointerActive) { targetYaw = this.pointerYaw; targetPitch = this.pointerPitch; }
    if (reducedMotion) { targetYaw = 0; targetPitch = 0; }

    const limits = CONFIG.headLimits;
    const smooth = 1 - Math.exp(-step / CONFIG.headResponseSeconds);
    const maxStep = CONFIG.headMaxSpeed * step;
    this.currentHeadYaw += clamp((targetYaw - this.currentHeadYaw) * smooth, -maxStep, maxStep);
    this.currentHeadPitch += clamp((targetPitch - this.currentHeadPitch) * smooth, -maxStep, maxStep);
    this.currentHeadYaw = clamp(this.currentHeadYaw, -limits.yaw, limits.yaw);
    this.currentHeadPitch = clamp(this.currentHeadPitch, -limits.pitch, limits.pitch);
    this.currentHeadRoll = reducedMotion ? 0 : clamp(-this.currentHeadYaw * CONFIG.headRollPerYaw, -limits.roll, limits.roll);

    const pose = { ...EMPTY_POSE,
      breath: Math.sin(this.elapsed * Math.PI * 2 * CONFIG.baseBreathHz) * CONFIG.baseBreathScale,
      hipShift: reducedMotion ? 0 : Math.sin(this.elapsed * Math.PI * 2 * CONFIG.hipShiftHz) * CONFIG.hipShiftRadians,
      armSway: reducedMotion ? 0 : Math.sin(this.elapsed * Math.PI * 2 * CONFIG.armSwayHz) * CONFIG.armSwayRadians,
      hatBob: reducedMotion ? 0 : Math.sin(this.elapsed * Math.PI * 2 * CONFIG.hatBobHz) * CONFIG.hatBobHeight,
      scarfFlutter: reducedMotion ? 0 : Math.sin(this.elapsed * Math.PI * 2 * CONFIG.scarfFlutterHz) * CONFIG.scarfFlutterRadians,
      headYaw: this.currentHeadYaw,
      headPitch: this.currentHeadPitch,
      headRoll: this.currentHeadRoll,
      eyeX: reducedMotion ? 0 : this.saccadeX,
      eyeY: reducedMotion ? 0 : this.saccadeY,
      blink: this.blinkRemaining > 0 ? Math.sin((1 - this.blinkRemaining / CONFIG.blinkDurationSeconds) * Math.PI) : 0
    };

    if (!reducedMotion) {
      if (!this.activeGesture && !this.cancelBlend && !this.interruptKind && this.elapsed >= this.nextGestureAt) this.startNextGesture();
      if (this.activeGesture) {
        const definition = this.activeGesture.definition;
        const sampled = this.sampleGesture(definition, this.activeGesture.elapsed);
        // Gesture time advances independently of frame rate.
        this.activeGesture.elapsed += step;
        for (const [key, value] of Object.entries(sampled)) {
          if (typeof value !== 'number') continue;
          if (key === 'hatLift' || key === 'juggle') pose[key] = value;
          else if (key === 'blink') pose[key] = Math.max(pose[key], value);
          else if (Object.hasOwn(pose, key)) pose[key] += value;
        }
        pose.gesture = sampled.gesture;
        pose.gestureProgress = sampled.progress;
        const duration = definition.frames.at(-1).time;
        if (this.activeGesture.elapsed >= duration) {
          this.previousGesture = definition.name;
          this.activeGesture = null;
          this.nextGestureAt = this.elapsed + this.randomDelay();
          this.scheduledInterval = this.nextGestureAt - this.elapsed;
        }
      }
      if (this.cancelBlend) {
        this.cancelBlend.elapsed += step;
        const fade = 1 - smoothstep(this.cancelBlend.elapsed / CONFIG.gestureBlendSeconds);
        for (const [key, value] of Object.entries(this.cancelBlend.pose)) {
          if (key !== 'gesture' && Number.isFinite(value)) pose[key] += value * fade;
        }
        if (fade <= 0) this.cancelBlend = null;
      }
      if (this.interruptKind) {
        const progress = clamp(this.interruptElapsed / (this.interruptKind === 'play' ? CONFIG.playBounceSeconds : CONFIG.clickBounceSeconds), 0, 1);
        const envelope = Math.sin(progress * Math.PI);
        pose.hop += envelope * (this.interruptKind === 'play' ? CONFIG.playBounceHeight : CONFIG.clickBounceHeight);
        pose.squash += progress < 0.25 ? -0.12 * Math.sin(progress / 0.25 * Math.PI) : 0;
        pose.leftArm += envelope * (this.interruptKind === 'play' ? 0.45 : 0.12);
        pose.rightArm += envelope * 0.5;
        pose.rightElbow += envelope * 0.22;
        if (this.interruptKind === 'play') pose.headRoll -= envelope * 0.12;
        this.interruptElapsed += step;
        if (progress >= 1) {
          this.interruptKind = '';
          this.nextGestureAt = this.elapsed + this.randomDelay();
          this.scheduledInterval = this.nextGestureAt - this.elapsed;
        }
      }
      if (this.hover?.name === 'play') pose.playNod = Math.sin(Math.max(0, this.elapsed - this.hoverStartedAt) * 6) * Math.exp(-Math.max(0, this.elapsed - this.hoverStartedAt) * 2.5) * 0.12;
      if (this.hover?.name === 'quit') {
        pose.headRoll += 0.1;
        pose.headPitch += 0.055;
      }
    } else {
      this.activeGesture = null;
      this.cancelBlend = null;
      this.interruptKind = '';
    }
    if (this.activeGesture) this.lastGesturePose = this.sampleGesture(this.activeGesture.definition, this.activeGesture.elapsed);
    else if (!this.cancelBlend) this.lastGesturePose = {};

    for (const key of Object.keys(pose)) if (typeof pose[key] === 'number' && !Number.isFinite(pose[key])) pose[key] = 0;
    pose.headYaw = clamp(pose.headYaw, -limits.yaw, limits.yaw);
    pose.headPitch = clamp(pose.headPitch, -limits.pitch, limits.pitch);
    pose.headRoll = clamp(pose.headRoll, -limits.roll, limits.roll);
    return pose;
  }
}

export { EMPTY_POSE as TITLE_EMPTY_POSE };
