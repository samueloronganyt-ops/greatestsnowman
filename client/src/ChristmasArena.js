import * as THREE from 'three';
import definition from '../../maps/christmas_arena.json' with { type: 'json' };

const VARIANT_RADII = [0.82, 0.77, 0.98];
const EPSILON = 0.01;

function mirroredPoints(source) {
  const xSigns = source.mirrorX ? [-1, 1] : [1];
  const zSigns = source.mirrorZ ? [-1, 1] : [1];
  const points = [];
  for (const sx of xSigns) for (const sz of zSigns) {
    const x = source.x * sx, z = source.z * sz;
    if (points.some(point => Math.abs(point.x - x) < EPSILON && Math.abs(point.z - z) < EPSILON)) continue;
    points.push({ x, z, suffix: `${sx < 0 ? '-x' : '+x'}${sz < 0 ? '-z' : '+z'}` });
  }
  return points;
}

function pillarCenters(halfExtent, endInset, spacing) {
  const first = -halfExtent + endInset;
  const last = halfExtent - endInset;
  const centers = [first];
  for (let value = Math.ceil(first / spacing) * spacing; value < last - EPSILON; value += spacing) {
    if (value > first + EPSILON) centers.push(value);
  }
  centers.push(last);
  return centers;
}

function createPerimeter(data, scale, snowmanHeight) {
  const { units, perimeter } = data;
  const halfWidth = units.width / 2, halfDepth = units.depth / 2;
  const horizontalCenters = pillarCenters(halfWidth, perimeter.pillarSize / 2, perimeter.pillarSpacing);
  const verticalCenters = pillarCenters(halfDepth, perimeter.pillarSize / 2, perimeter.pillarSpacing);
  const walls = [];
  const add = (id, type, x, z, width, depth, heightHs, pillar = false) => walls.push({
    id, type, x: x * scale, z: z * scale, width: width * scale, depth: depth * scale,
    height: heightHs * snowmanHeight, collidable: true, pillar,
    lantern: pillar && perimeter.lanterns
  });

  for (const sign of [-1, 1]) {
    const z = sign * (halfDepth - perimeter.pillarSize / 2);
    const sideName = sign < 0 ? 'north' : 'south';
    horizontalCenters.forEach((x, index) => {
      add(`perimeter-pillar-h-${sideName}-${index}`, 'PILLAR', x, z,
        perimeter.pillarSize, perimeter.pillarSize, perimeter.pillarHeightHs, true);
      if (index + 1 < horizontalCenters.length) {
        const next = horizontalCenters[index + 1];
        add(`perimeter-h-${sideName}-${index}`, 'PERIMETER', (x + next) / 2, z,
          next - x - perimeter.pillarSize, perimeter.thickness, perimeter.wallHeightHs);
      }
    });
  }

  for (const sign of [-1, 1]) {
    const x = sign * (halfWidth - perimeter.pillarSize / 2);
    const sideName = sign < 0 ? 'west' : 'east';
    verticalCenters.forEach((z, index) => {
      if (index > 0 && index + 1 < verticalCenters.length) {
        add(`perimeter-pillar-v-${sideName}-${index}`, 'PILLAR', x, z,
          perimeter.pillarSize, perimeter.pillarSize, perimeter.pillarHeightHs, true);
      }
      if (index + 1 < verticalCenters.length) {
        const next = verticalCenters[index + 1];
        add(`perimeter-v-${sideName}-${index}`, 'PERIMETER', x, (z + next) / 2,
          perimeter.thickness, next - z - perimeter.pillarSize, perimeter.wallHeightHs);
      }
    });
  }
  return walls;
}

function createWalls(data, scale, snowmanHeight) {
  const result = createPerimeter(data, scale, snowmanHeight);
  for (const source of data.solids) {
    for (const point of mirroredPoints(source)) {
      result.push({ id: `${source.id}${point.suffix}`, type: source.type,
        x: point.x * scale, z: point.z * scale,
        width: source.width * scale, depth: source.depth * scale,
        height: source.heightHs * snowmanHeight, collidable: true, pillar: false, lantern: false });
    }
  }
  for (const source of data.decorations.filter(item => item.collidable)) {
    for (const point of mirroredPoints(source)) {
      result.push({ id: `${source.id}${point.suffix}`, type: source.type === 'snowman-statue' ? 'STATUE' : 'PINE',
        x: point.x * scale, z: point.z * scale,
        width: source.width * scale, depth: source.depth * scale,
        height: source.heightHs * snowmanHeight, collidable: true, pillar: false, lantern: false });
    }
  }
  return result;
}

function scaledRows(rows, scale, snowmanHeight) {
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (typeof value !== 'number') return [key, value];
    if (['x', 'z', 'width', 'depth', 'radius'].includes(key)) return [key, value * scale];
    if (['raiseHs', 'heightHs'].includes(key)) return [key === 'raiseHs' ? 'raise' : 'height', value * snowmanHeight];
    return [key, value];
  })));
}

/** Expands the shared unit-space JSON into the exact world-space room protocol. */
export function materializeChristmasArena(data = definition) {
  const scale = data.units.worldScale;
  const snowmanHeight = data.units.classicSnowmanHeight;
  const decorations = data.decorations.flatMap(source => mirroredPoints(source).map(point => ({
    id: `${source.id}${point.suffix}`, type: source.type, x: point.x * scale, z: point.z * scale,
    y: (source.yHs || 0) * snowmanHeight, scale: source.scale || 1, rotation: source.rotation || 0,
    collidable: Boolean(source.collidable), width: (source.width || 0) * scale,
    depth: (source.depth || 0) * scale, height: (source.heightHs || 0) * snowmanHeight,
    color: source.color || undefined
  })));
  const island = data.features.island;
  return {
    id: data.id, title: data.title, size: 'CHRISTMAS', unitScale: scale,
    classicSnowmanHeight: snowmanHeight,
    worldWidth: data.units.width * scale, worldDepth: data.units.depth * scale,
    worldSize: Math.max(data.units.width, data.units.depth) * scale,
    walls: createWalls(data, scale, snowmanHeight),
    props: decorations,
    spawns: data.spawns.map(spawn => ({ ...spawn, x: spawn.x * scale, z: spawn.z * scale })),
    pickupSpawns: data.pickupSpawns.map(spawn => ({ ...spawn, x: spawn.x * scale, z: spawn.z * scale })),
    zones: scaledRows(data.features.zones, scale, snowmanHeight),
    pads: scaledRows(data.features.pads, scale, snowmanHeight),
    island: { ...island, x: island.x * scale, z: island.z * scale,
      radius: island.radius * scale, height: island.heightHs * snowmanHeight },
    colliderCount: createWalls(data, scale, snowmanHeight).length
  };
}

function rectDistance(a, b) {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.width + b.width) / 2);
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.depth + b.depth) / 2);
  return Math.hypot(dx, dz);
}

function rectanglesOverlap(a, b) {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 - EPSILON
    && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 - EPSILON;
}

function isPerimeter(wall) { return wall.type === 'PERIMETER' || wall.type === 'PILLAR'; }

function lineBlocked(from, to, walls, height) {
  for (const wall of walls) {
    if (wall.height < height) continue;
    const dx = to.x - from.x, dz = to.z - from.z;
    let tMin = 0, tMax = 1;
    for (const [origin, delta, min, max] of [
      [from.x, dx, wall.x - wall.width / 2, wall.x + wall.width / 2],
      [from.z, dz, wall.z - wall.depth / 2, wall.z + wall.depth / 2]
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < min || origin > max) { tMin = 2; break; }
      } else {
        let a = (min - origin) / delta, b = (max - origin) / delta;
        if (a > b) [a, b] = [b, a];
        tMin = Math.max(tMin, a); tMax = Math.min(tMax, b);
      }
    }
    if (tMin <= tMax && tMax >= 0 && tMin <= 1) return true;
  }
  return false;
}

function walkGrid(arena, excluded = new Set()) {
  const step = 1;
  const minX = -arena.worldWidth / 2, minZ = -arena.worldDepth / 2;
  const columns = Math.floor(arena.worldWidth / step) + 1;
  const rows = Math.floor(arena.worldDepth / step) + 1;
  const count = columns * rows;
  const blocked = new Uint8Array(count);
  const widestRadius = Math.max(...VARIANT_RADII);
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const index = row * columns + column;
    if (excluded.has(index)) { blocked[index] = 1; continue; }
    const x = minX + column * step, z = minZ + row * step;
    if (arena.walls.some(wall => rectDistance({ x, z, width: 0, depth: 0 }, wall) < widestRadius)) blocked[index] = 1;
  }
  const toIndex = point => {
    const column = THREE.MathUtils.clamp(Math.round((point.x - minX) / step), 0, columns - 1);
    const row = THREE.MathUtils.clamp(Math.round((point.z - minZ) / step), 0, rows - 1);
    return row * columns + column;
  };
  return { blocked, columns, rows, count, toIndex, minX, minZ, step };
}

function findPath(grid, start, goal) {
  const startIndex = grid.toIndex(start), goalIndex = grid.toIndex(goal);
  if (grid.blocked[startIndex] || grid.blocked[goalIndex]) return null;
  const previous = new Int32Array(grid.count).fill(-1);
  const queue = new Int32Array(grid.count);
  let head = 0, tail = 0;
  queue[tail++] = startIndex;
  previous[startIndex] = startIndex;
  while (head < tail) {
    const current = queue[head++];
    if (current === goalIndex) break;
    const column = current % grid.columns, row = Math.floor(current / grid.columns);
    for (const next of [column > 0 ? current - 1 : -1, column + 1 < grid.columns ? current + 1 : -1,
      row > 0 ? current - grid.columns : -1, row + 1 < grid.rows ? current + grid.columns : -1]) {
      if (next < 0 || grid.blocked[next] || previous[next] !== -1) continue;
      previous[next] = current;
      queue[tail++] = next;
    }
  }
  if (previous[goalIndex] === -1) return null;
  const path = [];
  for (let current = goalIndex; current !== startIndex; current = previous[current]) path.push(current);
  path.push(startIndex);
  return path;
}

/** Runs a lightweight deterministic geometry/navigation validation at import time. */
export function validateChristmasArena(arena) {
  const issues = [];
  const worldScale = arena.unitScale;
  const minGap = 2.5 * 2 * Math.max(...VARIANT_RADII);
  for (const wall of arena.walls) {
    const mirrorX = arena.walls.some(other => Math.abs(other.x + wall.x) < EPSILON
      && Math.abs(other.z - wall.z) < EPSILON && Math.abs(other.width - wall.width) < EPSILON
      && Math.abs(other.depth - wall.depth) < EPSILON && Math.abs(other.height - wall.height) < EPSILON);
    const mirrorZ = arena.walls.some(other => Math.abs(other.x - wall.x) < EPSILON
      && Math.abs(other.z + wall.z) < EPSILON && Math.abs(other.width - wall.width) < EPSILON
      && Math.abs(other.depth - wall.depth) < EPSILON && Math.abs(other.height - wall.height) < EPSILON);
    if (!mirrorX || !mirrorZ) issues.push(`symmetry: ${wall.id}`);
  }
  for (let i = 0; i < arena.walls.length; i++) for (let j = i + 1; j < arena.walls.length; j++) {
    const a = arena.walls[i], b = arena.walls[j];
    if (rectanglesOverlap(a, b)) issues.push(`overlap: ${a.id} / ${b.id}`);
    if (isPerimeter(a) && isPerimeter(b)) continue;
    const gap = rectDistance(a, b);
    if (gap + EPSILON < minGap) issues.push(`corridor ${(gap / worldScale).toFixed(2)} units: ${a.id} / ${b.id}`);
  }
  for (const pad of arena.pads) {
    const padRect = { x: pad.x, z: pad.z, width: pad.width, depth: pad.depth };
    for (const wall of arena.walls) if (rectanglesOverlap(padRect, wall)) issues.push(`pad collision: ${pad.id} / ${wall.id}`);
  }
  const minX = -arena.worldWidth / 2, minZ = -arena.worldDepth / 2;
  const maxRadius = Math.max(...VARIANT_RADII);
  for (const spawn of arena.spawns) {
    if (Math.abs(spawn.x) > -minX - maxRadius || Math.abs(spawn.z) > -minZ - maxRadius
      || arena.walls.some(wall => rectDistance({ ...spawn, width: 0, depth: 0 }, wall) < maxRadius)) {
      issues.push(`blocked/out-of-bounds spawn: ${spawn.id}`);
    }
  }
  const pickupRadius = 0.9;
  for (const pickup of arena.pickupSpawns) {
    if (arena.walls.some(wall => rectDistance({ ...pickup, width: 0, depth: 0 }, wall) < pickupRadius)) {
      issues.push(`blocked pickup spawn: ${pickup.id}`);
    }
    for (const prop of arena.props) {
      if (prop.collidable || prop.type === 'pine' || prop.type === 'wreath' || prop.type === 'snow-pile') continue;
      if (Math.hypot(pickup.x - prop.x, pickup.z - prop.z) < 1.6 * prop.scale) issues.push(`decoration blocks pickup: ${pickup.id} / ${prop.id}`);
    }
  }
  const handHeight = arena.classicSnowmanHeight * 0.4;
  const bluePad = arena.spawns.find(spawn => spawn.id === 'north-main');
  const redPad = arena.spawns.find(spawn => spawn.id === 'south-main');
  if (lineBlocked(bluePad, redPad, arena.walls, handHeight)) {
    // This is the intended result: center cover/statue prevents spawn-to-spawn hits.
  } else issues.push('line of sight: north and south main spawns are exposed');
  const blueSpawns = arena.spawns.filter(spawn => spawn.team === 'BLUE');
  const redSpawns = arena.spawns.filter(spawn => spawn.team === 'RED');
  for (const blue of blueSpawns) for (const red of redSpawns) {
    if (Math.hypot(blue.x - red.x, blue.z - red.z) < 6) issues.push(`enemy spawns too close: ${blue.id} / ${red.id}`);
    if (!lineBlocked(blue, red, arena.walls, handHeight)) issues.push(`line of sight: ${blue.id} / ${red.id} are exposed`);
  }

  const grid = walkGrid(arena);
  const mainBlue = arena.spawns.find(spawn => spawn.id === 'north-main');
  const mainRed = arena.spawns.find(spawn => spawn.id === 'south-main');
  const primaryPath = findPath(grid, mainBlue, mainRed);
  if (!primaryPath) issues.push('navigation: main spawn pads are disconnected');
  else {
    const blocked = new Set();
    const radiusCells = 1;
    for (const index of primaryPath.slice(4, -4)) {
      const c = index % grid.columns, r = Math.floor(index / grid.columns);
      for (let dz = -radiusCells; dz <= radiusCells; dz++) for (let dx = -radiusCells; dx <= radiusCells; dx++) {
        const nc = c + dx, nr = r + dz;
        if (nc >= 0 && nc < grid.columns && nr >= 0 && nr < grid.rows && Math.hypot(dx, dz) <= radiusCells) blocked.add(nr * grid.columns + nc);
      }
    }
    blocked.delete(grid.toIndex(mainBlue)); blocked.delete(grid.toIndex(mainRed));
    const alternate = findPath(walkGrid(arena, blocked), mainBlue, mainRed);
    if (!alternate) issues.push('navigation: only one separated route connects the main spawn pads');
  }
  const landmarks = [...arena.spawns, ...arena.pickupSpawns,
    { id: 'center-island', x: arena.island.x + arena.island.radius * 0.75, z: arena.island.z }];
  for (const landmark of landmarks) {
    const path = findPath(grid, mainBlue, landmark);
    if (!path) issues.push(`navigation: unreachable ${landmark.id}`);
  }
  return { ok: issues.length === 0, issues, colliderCount: arena.walls.length, minCorridorWorld: minGap };
}

export const CHRISTMAS_ARENA = materializeChristmasArena();
export const CHRISTMAS_ARENA_VALIDATION = validateChristmasArena(CHRISTMAS_ARENA);
console.info(`[Christmas Arena] ${CHRISTMAS_ARENA_VALIDATION.ok ? 'valid' : 'needs attention'}; `
  + `${CHRISTMAS_ARENA_VALIDATION.colliderCount} colliders; minimum corridor ${CHRISTMAS_ARENA_VALIDATION.minCorridorWorld.toFixed(2)} world units`,
CHRISTMAS_ARENA_VALIDATION.issues);
