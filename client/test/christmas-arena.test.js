import test from 'node:test';
import assert from 'node:assert/strict';
import { CHRISTMAS_ARENA, CHRISTMAS_ARENA_VALIDATION, materializeChristmasArena, validateChristmasArena } from '../src/ChristmasArena.js';

test('shared Christmas map loads with mirrored collisions and the widened corridor rule', () => {
  const arena = materializeChristmasArena();
  const report = validateChristmasArena(arena);
  assert.equal(report.ok, true, report.issues.join('\n'));
  assert.equal(arena.colliderCount, 63);
  assert.equal(arena.walls.length, 63);
  assert.equal(report.minCorridorWorld, 4.9);
  assert.equal(arena.worldWidth, 144);
  assert.equal(arena.worldDepth, 96);
});

test('map data provides eight alternating spawn positions and seven safe gift sites', () => {
  assert.equal(CHRISTMAS_ARENA.spawns.length, 8);
  assert.equal(CHRISTMAS_ARENA.pickupSpawns.length, 7);
  assert.equal(CHRISTMAS_ARENA.pickupSpawns[0].type, 'EXTRA_LIFE');
  assert.equal(CHRISTMAS_ARENA.pickupSpawns[0].rarity, 'LEGENDARY');
  assert.deepEqual(CHRISTMAS_ARENA_VALIDATION.issues, []);
});

test('Java and client use the same scaled perimeter and cover collider profiles', () => {
  const pillar = CHRISTMAS_ARENA.walls.find(wall => wall.id === 'perimeter-pillar-h-north-0');
  const cover = CHRISTMAS_ARENA.walls.find(wall => wall.id === 'long-cover+x-z');
  const close = (actual, expected) => assert.ok(actual.every((value, index) => Math.abs(value - expected[index]) < 1e-9));
  close([pillar.x, pillar.z, pillar.width, pillar.depth, pillar.height], [-69, -45, 6, 6, 7.434]);
  close([cover.x, cover.z, cover.width, cover.depth, cover.height], [29, -11, 28, 5, 2.478]);
});
