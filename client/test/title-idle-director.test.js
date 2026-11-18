import test from 'node:test';
import assert from 'node:assert/strict';
import { TitleIdleDirector } from '../src/TitleIdleDirector.js';
import { TITLE_ANIMATION_CONFIG } from '../src/TitleAnimationConfig.js';

const advance = (director, seconds, options = {}) => {
  let pose;
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.05) pose = director.update(0.05, options);
  return pose;
};

test('title idle director schedules varied gestures without repeating back-to-back', () => {
  const director = new TitleIdleDirector({ random: () => 0.5 });
  const seen = [];
  let wasActive = false;
  for (let step = 0; step < 2600; step++) {
    const pose = director.update(0.05);
    const active = Boolean(director.activeGesture);
    if (active && !wasActive) seen.push(director.activeGesture.definition.name);
    wasActive = active;
    assert.ok(director.scheduledInterval >= 4 && director.scheduledInterval <= 9);
    for (const value of Object.values(pose)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  assert.ok(seen.length >= 5, `expected multiple title gestures, got ${seen.join(', ')}`);
  for (let index = 1; index < seen.length; index++) assert.notEqual(seen[index], seen[index - 1]);
  assert.deepEqual(new Set(TITLE_ANIMATION_CONFIG.gestures.map(gesture => gesture.name)), new Set([
    'WAVE', 'DOUBLE_WAVE', 'HAT_TIP', 'LOOK_AROUND', 'HAPPY_HOP', 'SHIVER', 'JUGGLE', 'POINT_AT_PLAY'
  ]));
});

test('interrupt cancels the current gesture and eases its pose out', () => {
  const director = new TitleIdleDirector({ random: () => 0.5 });
  advance(director, 7);
  assert.ok(director.activeGesture, 'a gesture should have started');
  assert.equal(director.interrupt('click'), true);
  assert.equal(director.activeGesture, null);
  assert.ok(director.cancelBlend);
  const pose = advance(director, 0.3);
  assert.equal(pose.gesture, '');
  assert.equal(director.cancelBlend, null);
});

test('head targets stay clamped and finite at extreme pointer positions', () => {
  const director = new TitleIdleDirector({ random: () => 0.5 });
  director.setPointerTarget(100, -100);
  let pose = advance(director, 0.7);
  assert.ok(Math.abs(pose.headYaw) <= TITLE_ANIMATION_CONFIG.headLimits.yaw);
  assert.ok(Math.abs(pose.headPitch) <= TITLE_ANIMATION_CONFIG.headLimits.pitch);
  assert.ok(Math.abs(pose.headRoll) <= TITLE_ANIMATION_CONFIG.headLimits.roll);
  for (const value of Object.values(pose)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
});

test('reduced motion keeps calm breathing and blinking while disabling gestures', () => {
  const director = new TitleIdleDirector({ random: () => 0.5 });
  const pose = advance(director, 7.3, { reducedMotion: true });
  assert.equal(pose.gesture, '');
  assert.equal(pose.hop, 0);
  assert.equal(pose.shiver, 0);
  assert.notEqual(pose.breath, 0);
});
