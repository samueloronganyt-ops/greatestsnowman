import * as THREE from 'three';
import './style.css';
import { SNOWMAN_CONFIG, getVariantConfig } from './SnowmanConfig.js';
import { SnowmanRig } from './SnowmanRig.js';
import { SnowmanAnimator } from './SnowmanAnimator.js';
import { ScreenFlow, ScreenState } from './ScreenFlow.js';
import { TitleSceneRenderer } from './TitleSceneRenderer.js';
import { AIM_CONFIG, angleDiff, resolveCameraAimPoint, directionFromHand, resolveMuzzleBlock } from './AimSystem.js';
import { CHRISTMAS_ARENA } from './ChristmasArena.js';

const $ = selector => document.querySelector(selector);
// Vite replaces import.meta.env for its bundles. The typeof guard also keeps
// the client safe when served through the older standalone esbuild path.
const isDevelopmentBuild = typeof import.meta.env === 'object' && import.meta.env.DEV === true;
const renderingError = $('#rendering-error');
const reportedRenderErrors = new Set();
function reportClientError(source, error) {
  const message = error instanceof Error ? error.message : String(error);
  const key = `${source}: ${message}`;
  if (reportedRenderErrors.has(key)) return;
  reportedRenderErrors.add(key);
  console.error(`[Snowman ${source}]`, error);
  if (renderingError) {
    // Keep the actual failure visible in production too. This is a local game
    // client error and the extra context makes rendering failures diagnosable.
    renderingError.textContent = `3D scene error (${source}): ${message}`;
    renderingError.hidden = false;
  }
}
window.addEventListener('error', event => reportClientError('startup', event.error || event.message));
window.addEventListener('unhandledrejection', event => reportClientError('async', event.reason));
const root = $('#game');
const titleScreen = $('#title-screen');
const titleLoader = $('#title-loader');
const accountPanel = $('.account-panel');
const thanksScreen = $('#thanks-screen');
const screenFlow = new ScreenFlow();
let titleScene = null;
let titleHideTimer = 0;
const status = $('#connection');
const roster = $('#roster');
const accountMessage = $('#account-message');
const authView = $('#auth-view');
const profileView = $('#profile-view');
const roomMenu = $('#room-menu-view');
const lobbyView = $('#lobby-view');
const minimapWrap = $('#minimap-wrap');
const minimapCanvas = $('#minimap');
const minimapContext = minimapCanvas.getContext('2d');
let lastZoneName = '';
let zoneToastTimer = 0;
const players = new Map();
const snowballMeshes = new Map();
const powerUpMeshes = new Map();
const impactEffects = new Map();
const trailParticles = new Set();
const trailPool = [];
const dashStreaks = [];
const enemyGroups = [];
const aimTargets = [];
const ignoredAimRoots = new Set();
const aimGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cameraAimPoint = new THREE.Vector3();
const snowballGeometry = new THREE.SphereGeometry(1, 12, 10);
const trailGeometry = new THREE.SphereGeometry(0.075, 5, 4);
const dashLineGeometry = new THREE.BoxGeometry(0.045, 0.025, 1.1);
const maxTrailParticles = 72;
const seenEffectIds = new Set();
const footprintPool = [];
const footprintPosition = new THREE.Vector3();
const keys = new Set();
const joystick = { x: 0, y: 0, pointerId: null };
const mobileControls = $('#touch-controls');
// Used before the first room snapshot; Java MovementConfig replaces it in a live room.
const DEFAULT_MOVEMENT_CONFIG = {
  baseSpeed: 6,
  dashDurationSeconds: 0.25,
  dashCooldownSeconds: 2.5,
  getUpSeconds: 0.4,
  dashSpeedMultiplier: 3,
  variants: SNOWMAN_CONFIG.variants,
  states: {
    STANDING: { height: 3.4, radius: 0.82, speedMultiplier: 1, accuracyRadians: 0.045, throwHeight: 2.54 },
    CROUCHING: { height: 2.04, radius: 0.74, speedMultiplier: 0.55, accuracyRadians: 0.026, throwHeight: 1.55 },
    DASHING: { height: 3.4, radius: 0.82, speedMultiplier: 3, accuracyRadians: 0.045, throwHeight: 2.54 }
  }
};
let movementConfig = DEFAULT_MOVEMENT_CONFIG;
const touchDevice = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
const deviceStartsWithTouch = touchDevice;
let crouchMode = safeStorageGet('snowmanCrouchMode') || (deviceStartsWithTouch ? 'toggle' : 'hold');
let crouchToggled = false;
let mobileDashUntil = 0;
let aimHoldMode = false;
let controlEditMode = false;
let controlLayout = {};
let selectedControl = 'joystick';
let screenShakeStartedAt = 0;
const cameraOffsetDynamic = new THREE.Vector3();
const aimCameraOffsetDynamic = new THREE.Vector3();
const gameEventListeners = new Map();

function onGameEvent(name, listener) {
  if (!gameEventListeners.has(name)) gameEventListeners.set(name, new Set());
  gameEventListeners.get(name).add(listener);
  return () => gameEventListeners.get(name)?.delete(listener);
}

function dispatchGameEvent(name, detail) {
  for (const listener of gameEventListeners.get(name) || []) listener(detail);
}

function safeStorageGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeStorageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } }

const controlElements = {
  joystick: () => $('#mobile-joystick'), throw: () => $('#mobile-throw'), aim: () => $('#mobile-aim'),
  crouch: () => $('#mobile-crouch'), dash: () => $('#mobile-dash')
};
const defaultControlLayouts = {
  portrait: { joystick: [14, 82], throw: [87, 82], aim: [90, 58], crouch: [64, 81], dash: [74, 69] },
  landscape: { joystick: [10, 77], throw: [92, 78], aim: [89, 60], crouch: [68, 78], dash: [77, 60] }
};
function controlOrientation() { return matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'; }
function controlLayoutKey() { return `snowmanControls_v2_${controlOrientation()}`; }
function loadControlLayout() {
  try { controlLayout = JSON.parse(localStorage.getItem(controlLayoutKey()) || '{}') || {}; }
  catch { controlLayout = {}; }
  const options = controlLayout.options || {};
  aimHoldMode = Boolean(options.aimHoldMode);
  if (options.crouchMode === 'hold' || options.crouchMode === 'toggle') crouchMode = options.crouchMode;
  $('#aim-hold-mode').checked = aimHoldMode;
  $('#crouch-hold-mode').checked = crouchMode === 'hold';
  $('#hide-crouch').checked = Boolean(options.hideCrouch);
  $('#hide-dash').checked = Boolean(options.hideDash);
  for (const name of Object.keys(controlElements)) {
    const fallback = defaultControlLayouts[controlOrientation()][name];
    const saved = controlLayout[name] || {};
    controlLayout[name] = {
      x: Number.isFinite(saved.x) ? saved.x : fallback[0], y: Number.isFinite(saved.y) ? saved.y : fallback[1],
      size: THREE.MathUtils.clamp(Number(saved.size) || 100, 70, 150),
      opacity: THREE.MathUtils.clamp(Number(saved.opacity) || 72, 30, 100)
    };
  }
  applyControlLayout();
}
function applyControlLayout() {
  const viewportWidth = Math.max(1, document.documentElement.clientWidth || innerWidth);
  const viewportHeight = Math.max(1, document.documentElement.clientHeight || innerHeight);
  for (const [name, getElement] of Object.entries(controlElements)) {
    const element = getElement(); if (!element) continue;
    const settings = controlLayout[name] || { x: 50, y: 50, size: 100, opacity: 72 };
    const rect = element.getBoundingClientRect();
    const halfWidth = Math.max(32, rect.width / 2);
    const halfHeight = Math.max(32, rect.height / 2);
    settings.x = THREE.MathUtils.clamp(Number(settings.x) || 50, (halfWidth + 8) / viewportWidth * 100, 100 - (halfWidth + 8) / viewportWidth * 100);
    settings.y = THREE.MathUtils.clamp(Number(settings.y) || 50, (halfHeight + 8) / viewportHeight * 100, 100 - (halfHeight + 8) / viewportHeight * 100);
    element.style.left = `${settings.x}%`; element.style.top = `${settings.y}%`;
    element.style.right = 'auto'; element.style.bottom = 'auto'; element.style.transform = 'translate(-50%, -50%)';
    element.style.setProperty('--control-scale', String(settings.size / 100));
    element.style.setProperty('--control-opacity', String(settings.opacity / 100));
    element.classList.toggle('control-hidden', Boolean(name === 'crouch' && $('#hide-crouch')?.checked)
      || Boolean(name === 'dash' && $('#hide-dash')?.checked));
  }
}
let viewportLayoutTimer = 0;
let orientationLayoutPending = false;
function scheduleViewportLayout(reloadOrientationLayout = false) {
  orientationLayoutPending ||= reloadOrientationLayout;
  clearTimeout(viewportLayoutTimer);
  requestAnimationFrame(() => {
    if (orientationLayoutPending && !controlEditMode) loadControlLayout();
    else applyControlLayout();
    resizeRenderers();
    requestAnimationFrame(() => { applyControlLayout(); resizeRenderers(); });
  });
  // Mobile browsers often settle their fullscreen/visual viewport after the first resize.
  viewportLayoutTimer = setTimeout(() => {
    if (orientationLayoutPending && !controlEditMode) loadControlLayout();
    else applyControlLayout();
    orientationLayoutPending = false;
    resizeRenderers();
  }, 180);
}
function saveControlLayout() {
  controlLayout.options = { aimHoldMode, crouchMode, hideCrouch: $('#hide-crouch').checked, hideDash: $('#hide-dash').checked };
  safeStorageSet(controlLayoutKey(), JSON.stringify(controlLayout));
}
function selectControl(name) {
  selectedControl = name;
  const settings = controlLayout[name];
  $('#control-target').value = name;
  $('#control-size').value = settings.size; $('#control-size-value').value = `${settings.size}%`;
  $('#control-opacity').value = settings.opacity; $('#control-opacity-value').value = `${settings.opacity}%`;
  for (const [key, getElement] of Object.entries(controlElements)) getElement()?.classList.toggle('edit-selected', key === name);
}
function findControlOverlaps() {
  const entries = Object.entries(controlElements).map(([key, getElement]) => [key, getElement()])
    .filter(([, element]) => element && !element.classList.contains('control-hidden'));
  const collisions = [];
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const [aName, a] = entries[i], [bName, b] = entries[j];
    const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
    if (x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top) collisions.push(`${aName} + ${bName}`);
  }
  return collisions;
}
function reportControlOverlaps() {
  const collisions = findControlOverlaps();
  $('#control-overlap-warning').textContent = collisions.length ? `Overlapping: ${collisions.join(', ')}` : 'No control overlaps detected.';
  return collisions;
}
function setControlEditMode(enabled) {
  controlEditMode = enabled;
  document.body.classList.toggle('control-editing', enabled);
  $('#control-editor').hidden = !enabled;
  mobileControls.hidden = enabled ? false : !(gameStatus === 'IN_GAME' && touchDevice);
  if (enabled) { paused = true; $('#pause-menu').hidden = true; selectControl(selectedControl); reportControlOverlaps(); }
  else { $('#pause-menu').hidden = paused; }
}
for (const [name, getElement] of Object.entries(controlElements)) {
  const element = getElement();
  element.addEventListener('pointerdown', event => {
    if (!controlEditMode) return;
    event.preventDefault(); event.stopPropagation(); selectControl(name);
    element.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      if (moveEvent.pointerId !== event.pointerId) return;
      controlLayout[name].x = moveEvent.clientX / innerWidth * 100;
      controlLayout[name].y = moveEvent.clientY / innerHeight * 100;
      applyControlLayout(); reportControlOverlaps();
    };
    const finish = finishEvent => {
      if (finishEvent.pointerId !== event.pointerId) return;
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', finish);
      element.removeEventListener('pointercancel', finish);
    };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);
  });
  element.addEventListener('click', event => { if (controlEditMode) { event.preventDefault(); event.stopPropagation(); selectControl(name); } });
}
$('#customize-controls-open').addEventListener('click', () => setControlEditMode(true));
$('#control-target').addEventListener('change', event => selectControl(event.target.value));
$('#control-size').addEventListener('input', event => {
  controlLayout[selectedControl].size = Number(event.target.value);
  $('#control-size-value').value = `${event.target.value}%`; applyControlLayout(); reportControlOverlaps();
});
$('#control-opacity').addEventListener('input', event => {
  controlLayout[selectedControl].opacity = Number(event.target.value);
  $('#control-opacity-value').value = `${event.target.value}%`; applyControlLayout();
});
$('#aim-hold-mode').addEventListener('change', event => { aimHoldMode = event.target.checked; });
$('#crouch-hold-mode').addEventListener('change', event => { crouchMode = event.target.checked ? 'hold' : 'toggle'; crouchModeSelect.value = crouchMode; });
$('#hide-crouch').addEventListener('change', applyControlLayout);
$('#hide-dash').addEventListener('change', applyControlLayout);
$('#controls-save').addEventListener('click', () => {
  const collisions = reportControlOverlaps();
  if (collisions.length && !window.confirm(`Controls overlap (${collisions.join(', ')}). Save anyway?`)) return;
  saveControlLayout(); setControlEditMode(false); paused = false;
});
$('#controls-reset').addEventListener('click', () => {
  controlLayout = {};
  for (const name of Object.keys(controlElements)) {
    const p = defaultControlLayouts[controlOrientation()][name];
    controlLayout[name] = { x: p[0], y: p[1], size: 100, opacity: 72 };
  }
  $('#hide-crouch').checked = $('#hide-dash').checked = $('#aim-hold-mode').checked = false;
  $('#crouch-hold-mode').checked = false; crouchMode = 'toggle'; aimHoldMode = false;
  applyControlLayout(); selectControl(selectedControl); reportControlOverlaps();
});
$('#controls-cancel').addEventListener('click', () => { loadControlLayout(); setControlEditMode(false); paused = false; });
loadControlLayout();

function playerForEvent(detail) {
  return players.get(detail.playerId);
}

onGameEvent('onThrowStart', detail => {
  const player = playerForEvent(detail);
  if (player) {
    player.isCharging = true;
    player.throwStartedAt = performance.now();
    player.chargeStartedAt = player.throwStartedAt;
    player.throwReleaseStartedAt = 0;
  }
  playArcadeSound('scoop');
});
onGameEvent('onThrowRelease', detail => {
  const player = playerForEvent(detail);
  if (player) {
    player.isCharging = false;
    player.throwReleaseStartedAt = performance.now() - SNOWMAN_CONFIG.animation.throwReleaseStart * 1000;
    player.throwStartedAt = player.throwReleaseStartedAt;
    player.criticalThrow = Boolean(detail.critical);
  }
  playArcadeSound(detail.critical ? 'critical' : 'throw');
  if (detail.local) {
    if (detail.critical) screenShakeStartedAt = performance.now();
    const position = player?.group.position || { x: 0, z: 0 };
    spawnSnowPuff(position, player?.yaw || 0, detail.critical ? '#ffd05c' : '#eafaff', detail.critical ? 1.25 : 0.75);
  }
});
onGameEvent('onHit', detail => {
  const player = playerForEvent(detail);
  if (player) player.hitStartedAt = performance.now();
  if (detail.playerId === myId) {
    $('#damage-flash').classList.add('show');
    setTimeout(() => $('#damage-flash').classList.remove('show'), 240);
  }
});
onGameEvent('onDash', detail => {
  const player = playerForEvent(detail);
  if (player) player.dashStartedAt = performance.now();
  if (player) spawnDashLines(player);
  playArcadeSound('dash');
});
onGameEvent('onStanceChange', detail => {
  const player = playerForEvent(detail);
  if (player) player.stanceChangedAt = performance.now();
  const stance = detail.movementState || player?.movementState;
  if (stance === 'CROUCHING') playArcadeSound('crouch');
});
onGameEvent('onRespawn', detail => {
  const player = playerForEvent(detail);
  if (player) {
    player.respawnStartedAt = performance.now();
    spawnSnowPuff({ x: detail.x, z: detail.z }, player.yaw || 0, '#c4f3ff', 1.4);
  }
});

let myId = null;
let socket = null;
let socketRejected = false;
let accountMode = 'login';
let currentProfile = null;
let currentRoom = null;
let currentArena = null;
let arenaGroup = null;
let centerStatueGroup = null;
let gameStatus = 'MENU';
let lastResultsHandled = null;
let yaw = 0;
// Drag the view with the finger. At the default rear camera angle, screen-right is world -X.
// The server applies the matching camera-relative strafe basis.
const CONTROL_CONFIG = Object.freeze({ lookXSign: -1, lookYSign: -1 });
let invertX = localStorage.getItem('snowmanInvertX') === 'true';
let invertY = localStorage.getItem('snowmanInvertY') === 'true';
let limitVerticalAngle = localStorage.getItem('snowmanLimitVertical') === 'true';
const cameraOrbit = new THREE.Quaternion();
const cameraOffset = new THREE.Vector3(0, 6, -9);
const aimCameraOffset = new THREE.Vector3(0, 0.55, -5.8);
const worldUp = new THREE.Vector3(0, 1, 0);
const cameraLocalRight = new THREE.Vector3(-1, 0, 0);
const cameraObstacles = [];
const arenaPointLights = [];
const spawnRingAnimations = [];
let arenaBulbState = null;
let arenaBackgroundGroup = null;
let arenaBulbUpdateAt = 0;
let minimapLastDraw = 0;
let lastInputSent = 0;
let mobileThrowHeld = false;
let mobileThrowPointerId = null;
let localChargeRatio = 0;
let aimMode = false;
let aimShoulderSide = 1;
let aimYawCache = yaw;
let aimYawInitialized = false;
let aimPitchCache = 0;
let aimWorldPoint = new THREE.Vector3(0, 1.6, 28);
const aimHandPosition = new THREE.Vector3();
let paused = false;
let muted = localStorage.getItem('snowmanMuted') === 'true';
let graphicsPreset = localStorage.getItem('snowmanGraphics') || 'medium';

function prefersMobileRendering() {
  return matchMedia('(pointer: coarse)').matches || innerWidth <= 760;
}

function applyCameraDrag(deltaX, deltaY) {
  // Pointer-lock can report stale accumulated movement on mobile browsers.
  // Bound single-event jumps; ordinary high-rate mouse movement stays intact.
  deltaX = THREE.MathUtils.clamp(deltaX, -160, 160);
  deltaY = THREE.MathUtils.clamp(deltaY, -160, 160);
  const aimSensitivity = aimMode ? 0.7 : 1;
  const horizontalAngle = deltaX * 0.004 * aimSensitivity * CONTROL_CONFIG.lookXSign * (invertX ? -1 : 1);
  const verticalAngle = deltaY * 0.004 * aimSensitivity * CONTROL_CONFIG.lookYSign * (invertY ? -1 : 1);
  cameraOrbit.premultiply(new THREE.Quaternion().setFromAxisAngle(worldUp, horizontalAngle));
  const cameraRight = cameraLocalRight.clone().applyQuaternion(cameraOrbit).normalize();
  cameraOrbit.premultiply(new THREE.Quaternion().setFromAxisAngle(cameraRight, verticalAngle)).normalize();
  refreshCameraHeading();
  if (limitVerticalAngle) {
    const offset = cameraOffset.clone().applyQuaternion(cameraOrbit);
    const horizontal = Math.hypot(offset.x, offset.z);
    const elevation = Math.atan2(offset.y, horizontal);
    const bounded = THREE.MathUtils.clamp(elevation, -1.48, 1.48);
    if (Math.abs(elevation - bounded) > 1e-4) {
      const heading = Math.atan2(offset.x, offset.z);
      const boundedOffset = new THREE.Vector3(Math.sin(heading) * Math.cos(bounded), Math.sin(bounded), Math.cos(heading) * Math.cos(bounded));
      cameraOrbit.setFromUnitVectors(cameraOffset.clone().normalize(), boundedOffset).normalize();
      refreshCameraHeading();
    }
  }
}

function refreshCameraHeading() {
  const offset = cameraOffset.clone().applyQuaternion(cameraOrbit);
  const forwardX = -offset.x;
  const forwardZ = -offset.z;
  if (Math.hypot(forwardX, forwardZ) > 1e-4) yaw = Math.atan2(forwardX, forwardZ);
}

function resetCamera() {
  cameraOrbit.identity();
  yaw = 0;
}

async function enterFullscreen() {
  const doc = document;
  const activeElement = doc.fullscreenElement || doc.webkitFullscreenElement;
  if (activeElement) return;
  try {
    const target = document.documentElement;
    if (target.requestFullscreen) await target.requestFullscreen();
    else if (target.webkitRequestFullscreen) target.webkitRequestFullscreen();
    else { $('#fullscreen-hint').hidden = false; return; }
    if (/Android/i.test(navigator.userAgent)) {
      try { await screen.orientation?.lock?.('landscape'); } catch { /* Device/browser may reject orientation locks. */ }
    }
  } catch {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) $('#fullscreen-hint').hidden = false;
  }
}

async function toggleFullscreen() {
  const doc = document;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    if (doc.exitFullscreen) await doc.exitFullscreen();
    else doc.webkitExitFullscreen?.();
    return;
  }
  await enterFullscreen();
}

let rotateHintDismissed = false;
function updateRotateHint() {
  const portrait = matchMedia('(orientation: portrait)').matches;
  $('#rotate-hint').hidden = gameStatus !== 'IN_GAME' || !portrait || rotateHintDismissed;
}

function placeOrbitCamera(target, deltaTime, shoulderOffset = 0, lookDistance = 0, stance = 'STANDING') {
  const baseOffset = shoulderOffset ? aimCameraOffsetDynamic : cameraOffsetDynamic;
  baseOffset.copy(shoulderOffset ? aimCameraOffset : cameraOffset);
  if (stance === 'CROUCHING') baseOffset.y *= 0.76;
  const visualScale = players.get(myId)?.variantConfig?.visualScaleY || 1;
  if (shoulderOffset) baseOffset.y *= visualScale;
  const orbitOffset = baseOffset.clone().applyQuaternion(cameraOrbit);
  // Rear camera looks along +Z, so its screen-right axis is world -X at yaw zero.
  const cameraRight = cameraLocalRight.clone().applyQuaternion(cameraOrbit).normalize();
  const cameraUp = worldUp.clone().applyQuaternion(cameraOrbit).normalize();
  const destination = target.clone().add(orbitOffset)
    .addScaledVector(cameraRight, shoulderOffset ? shoulderOffset * visualScale * aimShoulderSide : 0)
    .addScaledVector(cameraUp, shoulderOffset ? shoulderOffset * visualScale * 0.36 : 0);
  destination.y = Math.max(0.35, destination.y);
  const direction = destination.clone().sub(target);
  const distance = direction.length();
  direction.normalize();
  cameraRaycaster.set(target, direction);
  cameraRaycaster.far = distance;
  const blockers = cameraRaycaster.intersectObjects(cameraObstacles, false);
  if (blockers.length && blockers[0].distance < distance) {
    // Move in immediately when occluded so the arm cannot interpolate through a wall.
    // The unobstructed path below eases back to the fixed mode distance.
    destination.copy(target).addScaledVector(direction, Math.max(0.55, blockers[0].distance - 0.22));
    camera.position.copy(destination);
  } else {
    camera.position.lerp(destination, 1 - Math.exp(-7 * deltaTime));
  }
  camera.position.y = Math.max(0.28, camera.position.y);
  camera.up.copy(cameraUp);
  const cameraForward = new THREE.Vector3(0, 0, 1).applyQuaternion(cameraOrbit).normalize();
  // In shoulder mode, aim past the snowman instead of at its chest; this keeps
  // the avatar offset from the center ray and gives the reticle clear sight.
  camera.lookAt(target.clone().addScaledVector(cameraForward, shoulderOffset ? Math.max(8, lookDistance) : lookDistance));
}

const scene = new THREE.Scene();
for (let index = 0; index < 24; index++) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6),
    new THREE.MeshBasicMaterial({ color: '#b8ccd3', transparent: true, opacity: 0, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  scene.add(mesh);
  footprintPool.push({ mesh, bornAt: 0 });
}
arenaGroup = new THREE.Group();
scene.add(arenaGroup);
scene.background = new THREE.Color('#6c82c3');
scene.fog = new THREE.Fog('#9da9dc', 86, 178);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 300);
const cameraBaseFov = camera.fov;
let aimFov = cameraBaseFov;
let cameraDashKick = 0;
const smoothedCameraFocus = new THREE.Vector3();
let cameraFocusInitialized = false;
const aimRaycaster = new THREE.Raycaster();
const muzzleRay = new THREE.Raycaster();
const cameraRaycaster = new THREE.Raycaster();
// Exact viewport center; the DOM reticle and Three.js ray use this same point.
const aimReticleViewport = new THREE.Vector2(0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = !prefersMobileRendering();
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);

const arenaHemisphere = new THREE.HemisphereLight('#e8efff', '#777fba', 1.75);
scene.add(arenaHemisphere);
const sun = new THREE.DirectionalLight('#fff5db', 2.5);
sun.position.set(-18, 28, 12);
sun.castShadow = renderer.shadowMap.enabled;
sun.shadow.mapSize.set(768, 768);
scene.add(sun);

const snowfallPositions = new Float32Array(90 * 3);
for (let i = 0; i < 90; i++) {
  snowfallPositions[i * 3] = (Math.random() - 0.5) * CHRISTMAS_ARENA.worldWidth;
  snowfallPositions[i * 3 + 1] = Math.random() * 18;
  snowfallPositions[i * 3 + 2] = (Math.random() - 0.5) * CHRISTMAS_ARENA.worldDepth;
}
const snowfallGeometry = new THREE.BufferGeometry();
snowfallGeometry.setAttribute('position', new THREE.BufferAttribute(snowfallPositions, 3));
const snowfall = new THREE.Points(snowfallGeometry, new THREE.PointsMaterial({ color: '#f4fcff', size: 0.2, transparent: true, opacity: 0.72, depthWrite: false }));
scene.add(snowfall);
let previousSnowCenter = { x: 0, z: 0 };

function clearArenaGroup() {
  arenaGroup.traverse(object => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
    else object.material?.dispose();
  });
  scene.remove(arenaGroup);
  arenaGroup = new THREE.Group();
  scene.add(arenaGroup);
  cameraObstacles.length = 0;
  spawnRingAnimations.length = 0;
  arenaPointLights.splice(0).forEach(light => scene.remove(light));
  arenaBulbState = null;
}

function makeStoneTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#7784ad'; context.fillRect(0, 0, 256, 128);
  for (let row = 0; row < 4; row++) {
    const y = row * 32;
    context.fillStyle = row % 2 ? '#8591b7' : '#7784ad';
    context.fillRect(0, y, 256, 31);
    context.strokeStyle = '#56658e'; context.lineWidth = 2;
    context.beginPath(); context.moveTo(0, y + 31); context.lineTo(256, y + 31); context.stroke();
    const offset = row % 2 ? 0 : 32;
    for (let x = offset; x < 256; x += 64) {
      context.beginPath(); context.moveTo(x, y); context.lineTo(x, y + 31); context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
  return texture;
}

function setInstance(mesh, index, x, y, z, sx, sy, sz, color = null) {
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  mesh.setMatrixAt(index, matrix);
  if (color) mesh.setColorAt(index, new THREE.Color(color));
}

function createArenaBackground(arena) {
  if (arenaBackgroundGroup) {
    scene.remove(arenaBackgroundGroup);
    arenaBackgroundGroup.traverse(object => {
      object.geometry?.dispose(); object.material?.dispose?.();
    });
  }
  arenaBackgroundGroup = new THREE.Group();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(260, 18, 10), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color('#a8bce8') }, zenith: { value: new THREE.Color('#596da9') } },
    vertexShader: 'varying float vSkyHeight; void main(){ vec4 world=modelMatrix*vec4(position,1.0); vSkyHeight=normalize(world.xyz).y; gl_Position=projectionMatrix*viewMatrix*world; }',
    fragmentShader: 'uniform vec3 horizon; uniform vec3 zenith; varying float vSkyHeight; void main(){ float blend=smoothstep(-0.12,0.58,vSkyHeight); gl_FragColor=vec4(mix(horizon,zenith,blend),1.0); }'
  }));
  arenaBackgroundGroup.add(sky);

  const mountainGeometry = new THREE.ConeGeometry(1, 1, 6);
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: '#7386c1', roughness: 1, flatShading: true });
  const snowMaterial = new THREE.MeshStandardMaterial({ color: '#e1eaff', roughness: 1, flatShading: true });
  const peaks = 16;
  const mountains = new THREE.InstancedMesh(mountainGeometry, mountainMaterial, peaks);
  const caps = new THREE.InstancedMesh(mountainGeometry, snowMaterial, peaks);
  for (let i = 0; i < peaks; i++) {
    const angle = i / peaks * Math.PI * 2;
    const radiusX = arena.worldWidth * 0.62;
    const radiusZ = arena.worldDepth * 0.72;
    const x = Math.cos(angle) * radiusX, z = Math.sin(angle) * radiusZ;
    const height = 23 + (i % 4) * 4;
    setInstance(mountains, i, x, height / 2 - 2, z, 18 + (i % 3) * 3, height, 16 + (i % 2) * 4);
    setInstance(caps, i, x, height * 0.82, z, 8 + (i % 3), height * 0.36, 7 + (i % 2));
  }
  mountains.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
  arenaBackgroundGroup.add(mountains, caps);
  scene.add(arenaBackgroundGroup);
  applyArenaGraphicsPreset();
}

function addStatue(x, z, scale = 1, color = '#f2f9ff', collidable = false) {
  const group = new THREE.Group();
  group.position.set(x, 0, z); group.scale.setScalar(scale);
  const snowball = new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: true });
  const coal = new THREE.MeshStandardMaterial({ color: '#17263a', roughness: 0.82 });
  const nose = new THREE.MeshStandardMaterial({ color: '#e98b43', roughness: 0.7 });
  const scarf = new THREE.MeshStandardMaterial({ color: '#c84453', roughness: 0.82 });
  const hat = new THREE.MeshStandardMaterial({ color: '#17243c', roughness: 0.72 });
  const parts = [
    [new THREE.SphereGeometry(1.1, 8, 6), 0, 1.12, 0, 1.1, 1.02, 1.1, snowball],
    [new THREE.SphereGeometry(0.78, 8, 6), 0, 2.48, 0, 0.78, 0.75, 0.78, snowball],
    [new THREE.SphereGeometry(0.54, 8, 6), 0, 3.57, 0, 0.54, 0.54, 0.54, snowball],
    [new THREE.CylinderGeometry(0.4, 0.43, 0.16, 8), 0, 4.06, 0, 1, 1, 1, hat],
    [new THREE.CylinderGeometry(0.27, 0.33, 0.48, 8), 0, 4.35, 0, 1, 1, 1, hat],
    [new THREE.TorusGeometry(0.78, 0.16, 5, 12), 0, 2.95, 0, 1, 1, 1, scarf],
    [new THREE.SphereGeometry(0.075, 6, 4), -0.2, 3.68, 0.48, 1, 1, 1, coal],
    [new THREE.SphereGeometry(0.075, 6, 4), 0.2, 3.68, 0.48, 1, 1, 1, coal],
    [new THREE.ConeGeometry(0.11, 0.56, 5), 0, 3.45, 0.58, 1, 1, 1, nose]
  ];
  for (const [geometry, px, py, pz, sx, sy, sz, material] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(px, py, pz); mesh.scale.set(sx, sy, sz); mesh.castShadow = true;
    group.add(mesh);
  }
  for (let i = 0; i < 3; i++) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), coal);
    button.position.set(0, 2.58 - i * 0.35, 0.75); group.add(button);
  }
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 5), new THREE.MeshStandardMaterial({ color: '#765139', roughness: 1 }));
    arm.position.set(side * 0.9, 2.65, 0); arm.rotation.z = side * -0.8; group.add(arm);
  }
  arenaGroup.add(group);
  if (collidable && Math.abs(x) < 0.01 && Math.abs(z) < 0.01) centerStatueGroup = group;
  return group;
}

function addWreath(prop) {
  const group = new THREE.Group();
  group.position.set(prop.x, prop.y || 5.55, prop.z);
  if (prop.z > 0) group.rotation.y = Math.PI;
  const green = new THREE.MeshStandardMaterial({ color: '#166345', roughness: 0.9 });
  const red = new THREE.MeshStandardMaterial({ color: '#d53550', roughness: 0.75 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.17, 5, 16), green);
  group.add(ring);
  for (let i = 0; i < 10; i++) {
    const angle = i / 10 * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.2, 5, 4), green);
    leaf.position.set(Math.cos(angle) * 1.15, Math.sin(angle) * 1.15, 0.04);
    leaf.scale.set(1.1, 0.7, 0.65); group.add(leaf);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), red);
  knot.position.set(0, 1.3, 0.08); group.add(knot);
  for (const side of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(0.34, 6, 4), red);
    loop.position.set(side * 0.34, 1.27, 0.04); loop.scale.set(1, 0.55, 0.32); group.add(loop);
  }
  arenaGroup.add(group);
}

function addSmallDecorations(arena) {
  const decorations = arena.props || [];
  const pines = decorations.filter(prop => prop.type === 'pine');
  if (pines.length) {
    const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.25, 1, 5),
      new THREE.MeshStandardMaterial({ color: '#705039', roughness: 1 }), pines.length);
    const greens = ['#195b48', '#24765a', '#2d8462'];
    const foliageMeshes = greens.map((color, level) => new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }), pines.length));
    const snowMeshes = greens.map((_, level) => new THREE.InstancedMesh(
      new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: '#e6f4ff', roughness: 1, flatShading: true }), pines.length));
    pines.forEach((prop, index) => {
      const s = prop.scale;
      setInstance(trunkMesh, index, prop.x, 0.75 * s, prop.z, 0.38 * s, 1.5 * s, 0.38 * s);
      foliageMeshes.forEach((mesh, level) => {
        const size = (2.8 - level * 0.38) * s;
        setInstance(mesh, index, prop.x, (2.0 + level * 1.75) * s, prop.z, size, 2.4 * s, size);
        const cap = snowMeshes[level];
        setInstance(cap, index, prop.x, (2.83 + level * 1.75) * s, prop.z, size * 0.76, 0.7 * s, size * 0.76);
      });
    });
    for (const mesh of [trunkMesh, ...foliageMeshes, ...snowMeshes]) {
      mesh.instanceMatrix.needsUpdate = true; arenaGroup.add(mesh);
    }
  }

  for (const prop of decorations) {
    if (prop.type === 'pine') continue;
    if (prop.type === 'snowman-statue') { addStatue(prop.x, prop.z, 0.84, prop.color || '#f2f9ff', true); continue; }
    if (prop.type === 'snowman-statue-small') { addStatue(prop.x, prop.z, 0.7 * prop.scale, '#eff8ff'); continue; }
    if (prop.type === 'wreath') { addWreath(prop); continue; }
    const group = new THREE.Group();
    group.position.set(prop.x, 0, prop.z); group.rotation.y = prop.rotation || 0;
    group.scale.setScalar(prop.scale || 1);
    if (prop.type === 'candy-cane') {
      const white = new THREE.MeshStandardMaterial({ color: '#fff9ef', roughness: 0.62 });
      const red = new THREE.MeshStandardMaterial({ color: '#d93951', roughness: 0.62 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 3.0, 8), white);
      pole.position.y = 1.45; group.add(pole);
      const stripes = new THREE.InstancedMesh(new THREE.TorusGeometry(0.25, 0.07, 5, 9), red, 5);
      for (let i = 0; i < 5; i++) {
        const transform = new THREE.Matrix4().compose(new THREE.Vector3(0, 0.35 + i * 0.48, 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1));
        stripes.setMatrixAt(i, transform);
      }
      stripes.instanceMatrix.needsUpdate = true; group.add(stripes);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.24, 6, 10, Math.PI), white);
      hook.position.set(0.22, 2.94, 0); hook.rotation.z = Math.PI; group.add(hook);
    } else if (prop.type === 'gift-stack') {
      const colors = ['#c83a4c', '#238675', '#315eb2'];
      for (let i = 0; i < 3; i++) {
        const size = 0.9 - (i % 2) * 0.1;
        const gift = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.8 }));
        gift.position.set((i - 1) * 0.48, size * 0.5 + (i === 2 ? 0.82 : 0), (i % 2) * 0.2);
        group.add(gift);
        const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.12, size + 0.02, size + 0.02), new THREE.MeshStandardMaterial({ color: '#f6cf68', roughness: 0.55 }));
        ribbon.position.copy(gift.position); group.add(ribbon);
      }
    } else if (prop.type === 'snow-pile') {
      const pile = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 5), new THREE.MeshStandardMaterial({ color: '#edf7ff', roughness: 1 }));
      pile.scale.set(1.6, 0.42, 1.05); pile.position.y = 0.17; group.add(pile);
    }
    arenaGroup.add(group);
  }
}

function addIceStacks(arena) {
  const stacks = arena.walls.filter(wall => wall.type === 'ICE_BLOCK');
  if (!stacks.length) return;
  const cube = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: '#a6e6ff', roughness: 0.18, metalness: 0.05,
      emissive: '#327fa8', emissiveIntensity: 0.1, transparent: true, opacity: 0.88 }), stacks.length * 5);
  let index = 0;
  for (const stack of stacks) {
    const blocks = [
      [-1.5, -0.75, 0.825, 3, 1.65, 3], [1.5, -0.75, 0.825, 3, 1.65, 3],
      [0, 1.5, 0.825, 3, 1.65, 3], [-0.7, -0.2, 2.475, 2.6, 1.65, 2.6],
      [0.8, 0.45, 2.475, 2.6, 1.65, 2.6]
    ];
    for (const [dx, dz, y, sx, sy, sz] of blocks) {
      setInstance(cube, index++, stack.x + dx, y, stack.z + dz, sx, sy, sz,
        index % 3 === 0 ? '#c7f3ff' : '#8fd4f2');
    }
  }
  cube.instanceMatrix.needsUpdate = true;
  if (cube.instanceColor) cube.instanceColor.needsUpdate = true;
  arenaGroup.add(cube);
}

function makeSnowCapGeometry() {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 12, 1, 4);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    if (y < 0.49) continue;
    const wave = (Math.sin((x + 0.5) * Math.PI * 8) + Math.cos((z + 0.5) * Math.PI * 6)) * 0.09;
    positions.setY(index, y + wave);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function addWallsAndChristmasLights(arena) {
  const stoneTexture = makeStoneTexture();
  const stoneMaterial = new THREE.MeshStandardMaterial({ map: stoneTexture, color: '#b4bfdc', roughness: 0.92, flatShading: true });
  const iceMaterial = new THREE.MeshStandardMaterial({ color: '#91d9f6', roughness: 0.2, metalness: 0.08,
    emissive: '#286b91', emissiveIntensity: 0.12, flatShading: true });
  const snowMaterial = new THREE.MeshStandardMaterial({ color: '#f3fbff', roughness: 0.88, flatShading: true });
  const stoneWalls = arena.walls.filter(wall => ['PERIMETER', 'PILLAR', 'BARRIER', 'SIDE_POST'].includes(wall.type));
  const iceWalls = arena.walls.filter(wall => wall.type === 'ICE_BLOCK');
  const wallMeshes = [];
  for (const [rows, material] of [[stoneWalls, stoneMaterial], [iceWalls, iceMaterial]]) {
    if (!rows.length) continue;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, rows.length);
    rows.forEach((wall, index) => setInstance(mesh, index, wall.x, wall.height / 2, wall.z,
      wall.width, wall.height, wall.depth,
      wall.type === 'PILLAR' ? '#8793b7' : wall.type === 'ICE_BLOCK' ? '#a9e7ff' : '#aab6d4'));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    arenaGroup.add(mesh); cameraObstacles.push(mesh); wallMeshes.push(mesh);
  }

  const capWalls = stoneWalls;
  if (capWalls.length) {
    const caps = new THREE.InstancedMesh(makeSnowCapGeometry(), snowMaterial, capWalls.length);
    capWalls.forEach((wall, index) => setInstance(caps, index, wall.x, wall.height + 0.06, wall.z,
      wall.width + 0.24, 0.22, wall.depth + 0.24));
    caps.instanceMatrix.needsUpdate = true; arenaGroup.add(caps);
  }

  const bulbColors = ['#f44f55', '#36e390', '#ffe16a', '#56b9ff', '#ff8bd3'];
  const bulbPoints = [], cableVertices = [], phases = [], baseColors = [];
  for (const wall of arena.walls) {
    if (!['PERIMETER', 'BARRIER', 'SIDE_POST'].includes(wall.type)) continue;
    const horizontal = wall.width >= wall.depth;
    const length = horizontal ? wall.width : wall.depth;
    const count = Math.max(4, Math.floor(length / 1.55));
    const frontSign = horizontal ? (wall.z <= 0 ? 1 : -1) : (wall.x <= 0 ? 1 : -1);
    let previous = null;
    for (let step = 0; step <= count; step++) {
      const t = step / count;
      const along = (t - 0.5) * length;
      const sag = 0.32 * Math.sin(Math.PI * t);
      const x = horizontal ? wall.x + along : wall.x + frontSign * (wall.width / 2 + 0.06);
      const z = horizontal ? wall.z + frontSign * (wall.depth / 2 + 0.06) : wall.z + along;
      const y = wall.height * 0.76 - sag;
      const point = { x, y, z };
      if (previous) cableVertices.push(previous.x, previous.y, previous.z, x, y, z);
      previous = point;
      if (step === count || step % 2 !== 0) continue;
      const colorIndex = bulbPoints.length % bulbColors.length;
      bulbPoints.push(point); phases.push(bulbPoints.length % 4);
      baseColors.push(new THREE.Color(bulbColors[colorIndex]));
    }
  }
  if (bulbPoints.length) {
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 4),
      new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true }), bulbPoints.length);
    bulbPoints.forEach((point, index) => setInstance(bulbs, index, point.x, point.y, point.z, 1, 1, 1, baseColors[index]));
    bulbs.instanceMatrix.needsUpdate = true; if (bulbs.instanceColor) bulbs.instanceColor.needsUpdate = true;
    arenaGroup.add(bulbs);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cableVertices, 3));
    arenaGroup.add(new THREE.LineSegments(lineGeometry, new THREE.LineBasicMaterial({ color: '#56637d', transparent: true, opacity: 0.75 })));
    arenaBulbState = { mesh: bulbs, phases, colors: baseColors };
  }

  const pillars = arena.walls.filter(wall => wall.type === 'PILLAR' && wall.lantern);
  if (pillars.length) {
    const lanterns = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.74, 0.62),
      new THREE.MeshStandardMaterial({ color: '#ffd46e', emissive: '#f2a628', emissiveIntensity: 1.2, roughness: 0.45 }), pillars.length);
    pillars.forEach((wall, index) => setInstance(lanterns, index, wall.x, wall.height + 0.48, wall.z, 1, 1, 1));
    lanterns.instanceMatrix.needsUpdate = true; arenaGroup.add(lanterns);
    const pointPillars = pillars.filter(wall => (Math.abs(wall.x) > arena.worldWidth * 0.45 && Math.abs(wall.z) > arena.worldDepth * 0.4)
      || Math.abs(wall.x) < 0.1 || Math.abs(wall.z) < 0.1).slice(0, 8);
    for (const wall of pointPillars) {
      const light = new THREE.PointLight('#ffc75e', 1.2, 18, 2);
      light.position.set(wall.x, wall.height + 0.95, wall.z);
      scene.add(light); arenaPointLights.push(light);
    }
  }
  return wallMeshes;
}

function addSpawnPads(arena) {
  for (const pad of arena.pads) {
    const blue = pad.team === 'BLUE';
    const color = blue ? '#37c8ff' : '#ff5269';
    const deck = new THREE.Mesh(new THREE.BoxGeometry(pad.width, pad.raise, pad.depth),
      new THREE.MeshStandardMaterial({ color: blue ? '#4a86be' : '#b44d67', roughness: 0.66, emissive: color, emissiveIntensity: 0.12 }));
    deck.position.set(pad.x, pad.raise / 2, pad.z); deck.receiveShadow = true; arenaGroup.add(deck);
    const snowCap = new THREE.Mesh(new THREE.BoxGeometry(pad.width + 0.18, 0.14, pad.depth + 0.18),
      new THREE.MeshStandardMaterial({ color: '#edf7ff', roughness: 0.94 }));
    snowCap.position.set(pad.x, pad.raise + 0.07, pad.z); snowCap.receiveShadow = true; arenaGroup.add(snowCap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.16, 6, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.88 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(pad.x, pad.raise + 0.16, pad.z); arenaGroup.add(ring);
    ring.scale.set((pad.width / 2 - 1) / 2.65, (pad.depth / 2 - 1) / 2.65, 1);
    spawnRingAnimations.push({ ring, start: pad.team === 'BLUE' ? 0 : Math.PI });
  }
}

function addGroundTracks(arena) {
  const pathMaterial = new THREE.MeshBasicMaterial({ color: '#a5b8df', transparent: true,
    opacity: 0.13, depthWrite: false, side: THREE.DoubleSide });
  const printMaterial = new THREE.MeshBasicMaterial({ color: '#91a9d5', transparent: true,
    opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
  for (const pad of arena.pads) {
    const towardCenter = pad.z < arena.island.z ? 1 : -1;
    const pathLength = Math.max(0, Math.abs(pad.z - arena.island.z) - arena.island.radius - pad.depth / 2);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.7, pathLength), pathMaterial);
    path.rotation.x = -Math.PI / 2;
    path.position.set(pad.x, 0.015, pad.z + towardCenter * (pad.depth / 2 + pathLength / 2));
    arenaGroup.add(path);
    for (let step = 0; step < 3; step++) for (const side of [-1, 1]) {
      const print = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.36), printMaterial);
      print.rotation.x = -Math.PI / 2;
      const along = step === 0 ? pad.depth / 2 - 1.0 : pad.depth / 2 + step * 0.65 - 0.25;
      print.position.set(pad.x + side * 0.22, step === 0 ? pad.raise + 0.151 : 0.022,
        pad.z + towardCenter * (along + (side > 0 ? 0.16 : 0)));
      print.rotation.y = side * 0.12;
      arenaGroup.add(print);
    }
  }
}

function getArenaSurfaceHeight(x, z) {
  let height = 0;
  for (const pad of currentArena?.pads || []) {
    if (Math.abs(x - pad.x) <= pad.width / 2 && Math.abs(z - pad.z) <= pad.depth / 2) {
      height = Math.max(height, pad.raise + 0.14);
    }
  }
  const island = currentArena?.island;
  if (island && Math.hypot(x - island.x, z - island.z) <= island.radius) height = Math.max(height, island.height);
  return height;
}

function renderArena(arena) {
  if (!arena || arena.id === currentArena?.id) return;
  clearArenaGroup();
  centerStatueGroup = null;
  currentArena = arena;
  const width = arena.worldWidth || arena.worldSize;
  const depth = arena.worldDepth || arena.worldSize;
  const snowCanvas = document.createElement('canvas');
  snowCanvas.width = snowCanvas.height = 256;
  const snowContext = snowCanvas.getContext('2d');
  snowContext.fillStyle = '#e9f1ff'; snowContext.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1200; i++) {
    const shade = 217 + Math.floor(Math.random() * 35);
    snowContext.fillStyle = `rgba(${shade - 2},${shade},255,${Math.random() * 0.16})`;
    snowContext.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 2);
  }
  const snowTexture = new THREE.CanvasTexture(snowCanvas);
  snowTexture.colorSpace = THREE.SRGBColorSpace;
  snowTexture.wrapS = snowTexture.wrapT = THREE.RepeatWrapping;
  snowTexture.repeat.set(width / 12, depth / 12);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width + 20, depth + 20),
    new THREE.MeshStandardMaterial({ color: '#e9efff', map: snowTexture, roughness: 0.98 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; arenaGroup.add(ground);

  if (arena.island) {
    const island = new THREE.Mesh(new THREE.CylinderGeometry(arena.island.radius, arena.island.radius * 0.96,
      arena.island.height, 18), new THREE.MeshStandardMaterial({ color: '#f8fcff', roughness: 0.9, flatShading: true }));
    island.position.set(arena.island.x, arena.island.height / 2, arena.island.z);
    island.receiveShadow = true; island.castShadow = true; arenaGroup.add(island);
  }

  addWallsAndChristmasLights(arena);
  addIceStacks(arena);
  addSpawnPads(arena);
  addGroundTracks(arena);
  addSmallDecorations(arena);
  createArenaBackground(arena);
  for (const prop of arena.props || []) {
    if (!prop.collidable) continue;
    const collider = new THREE.Mesh(new THREE.BoxGeometry(prop.width, prop.height, prop.depth),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
    collider.position.set(prop.x, prop.height / 2, prop.z);
    arenaGroup.add(collider); cameraObstacles.push(collider);
  }
  camera.far = Math.max(width, depth) * 2.6;
  camera.updateProjectionMatrix();
  scene.fog = new THREE.Fog('#9da9dc', Math.max(width, depth) * 0.58, Math.max(width, depth) * 1.28);
  applyArenaGraphicsPreset();
}

function applyArenaGraphicsPreset() {
  const low = graphicsPreset === 'low';
  if (arenaBackgroundGroup) arenaBackgroundGroup.visible = !low;
  if (arenaBulbState) arenaBulbState.mesh.visible = !low;
  arenaPointLights.forEach(light => { light.visible = !low; });
  sun.castShadow = !low && !prefersMobileRendering();
  renderer.shadowMap.enabled = !low && !prefersMobileRendering();
  for (const ring of spawnRingAnimations) ring.ring.visible = !low;
}

function updateArenaVisualEffects(now) {
  for (const entry of spawnRingAnimations) {
    const wave = (now * 0.001 + entry.start) % (Math.PI * 2);
    const pulse = 1 + Math.sin(wave) * 0.035;
    entry.ring.scale.set(pulse, pulse, pulse);
    entry.ring.material.opacity = 0.72 + (Math.sin(wave) + 1) * 0.13;
  }
  if (graphicsPreset === 'low' || !arenaBulbState || now - arenaBulbUpdateAt < 260) return;
  arenaBulbUpdateAt = now;
  for (let i = 0; i < arenaBulbState.colors.length; i++) {
    const phase = arenaBulbState.phases[i];
    const brightness = 0.54 + (Math.sin(now * 0.004 + phase * Math.PI / 2) + 1) * 0.22;
    arenaBulbState.mesh.setColorAt(i, arenaBulbState.colors[i].clone().multiplyScalar(brightness));
  }
  if (arenaBulbState.mesh.instanceColor) arenaBulbState.mesh.instanceColor.needsUpdate = true;
}

renderArena(CHRISTMAS_ARENA);

const snow = new THREE.MeshStandardMaterial({ color: '#fffdf5', roughness: 0.9 });
const dark = new THREE.MeshStandardMaterial({ color: '#152b3b' });
const carrot = new THREE.MeshStandardMaterial({ color: '#e88c47' });
const sharedSnowmanMaterials = new Set([snow, dark, carrot]);

function makeSnowman(color = '#69a9e8', look = {}) {
  const choices = { hat: 'top-hat', scarf: 'classic', nose: 'carrot', arms: 'twigs', body: 'classic', ...look };
  const resolvedVariant = getVariantConfig(choices.body);
  choices.body = resolvedVariant.name;
  const variantConfig = resolvedVariant.config;
  const rig = new SnowmanRig(choices.body, variantConfig);
  const { group, poseRoot, torsoPivot, neck, headPivot, arms } = rig;
  if (arms.length !== 2 || arms[0].side === arms[1].side) {
    throw new Error(`Snowman rig must contain one arm per side; found ${arms.length}.`);
  }
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
  const parts = [rig.baseBall, rig.torsoBall, rig.headBall];
  const torsoRadius = variantConfig.torsoRadius;
  const headRadius = variantConfig.headRadius;

  let scarf = null;
  if (choices.scarf !== 'none') {
    scarf = new THREE.Mesh(new THREE.TorusGeometry(choices.scarf === 'bowtie' ? torsoRadius * 0.52 : torsoRadius * 0.78, 0.12, 4, 8), accent);
    scarf.position.y = -torsoRadius * 0.74;
    scarf.rotation.x = Math.PI / 2;
    neck.add(scarf);
    if (choices.scarf !== 'bowtie') {
      const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.68, 0.08), accent);
      scarfTail.position.set(torsoRadius * 0.48, -torsoRadius * 0.95, torsoRadius * 0.75);
      scarfTail.rotation.z = -0.16;
      const tailPivot = new THREE.Group();
      tailPivot.position.copy(scarfTail.position);
      scarfTail.position.set(0, -0.34, 0);
      tailPivot.add(scarfTail);
      neck.add(tailPivot);
      rig.scarfTailPivot = tailPivot;
    }
    if (choices.scarf === 'striped') {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(torsoRadius * 0.78, 0.035, 3, 8), new THREE.MeshStandardMaterial({ color: '#fff2d1' }));
      stripe.position.copy(scarf.position);
      stripe.rotation.copy(scarf.rotation);
      neck.add(stripe);
    }
  }

  let nose;
  if (choices.nose === 'button') {
    nose = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), carrot);
    nose.position.set(0, 0, headRadius * 0.92);
  } else {
    const noseMaterial = choices.nose === 'golden' ? new THREE.MeshStandardMaterial({ color: '#ffd45a' }) : carrot;
    nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.48, 5), noseMaterial);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0, headRadius * 0.82);
  }
  headPivot.add(nose);

  const featureScale = headRadius / 0.5;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.067 * featureScale, 6, 5), dark);
  eye.position.set(-0.155 * featureScale, 0.14 * featureScale, headRadius * 0.86);
  const secondEye = eye.clone();
  secondEye.position.x = 0.155 * featureScale;
  const eyeGlintMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.02 * featureScale, 5, 4), eyeGlintMaterial);
  glint.position.set(-0.17 * featureScale, 0.16 * featureScale, headRadius * 1.02);
  const secondGlint = glint.clone();
  secondGlint.position.x = 0.14 * featureScale;
  const cheekMaterial = new THREE.MeshStandardMaterial({ color: '#f2a99d', roughness: 1 });
  const leftCheek = new THREE.Mesh(new THREE.SphereGeometry(0.075 * featureScale, 6, 4), cheekMaterial);
  leftCheek.scale.set(1.35, 0.58, 0.36);
  leftCheek.position.set(-0.285 * featureScale, -0.025 * featureScale, headRadius * 0.82);
  const rightCheek = leftCheek.clone();
  rightCheek.position.x = 0.285;
  headPivot.add(eye, secondEye, glint, secondGlint, leftCheek, rightCheek);
  const smileMaterial = new THREE.MeshStandardMaterial({ color: '#26333a', roughness: 0.9 });
  for (let i = 0; i < 5; i++) {
    const offset = (i - 2) * 0.095 * featureScale;
    const coal = new THREE.Mesh(new THREE.SphereGeometry(0.036 * featureScale, 5, 4), smileMaterial);
    coal.scale.set(1, 0.76, 0.6);
    coal.position.set(offset, -0.14 * featureScale + Math.abs(offset) * 0.28, headRadius * 0.86 - Math.abs(offset) * 0.035);
    headPivot.add(coal);
  }
  for (let i = 0; i < 3; i++) {
    const button = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), dark);
    button.position.set(0, torsoRadius * 0.55 - i * torsoRadius * 0.62, torsoRadius * 0.88);
    torsoPivot.add(button);
  }

  const hatPivot = new THREE.Group();
  hatPivot.position.set(0, headRadius * 0.9, 0);
  headPivot.add(hatPivot);
  if (choices.hat !== 'none') {
    if (choices.hat === 'beanie') {
      const beanie = new THREE.Mesh(new THREE.SphereGeometry(headRadius * 0.88, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), accent);
      beanie.position.y = 0.025;
      hatPivot.add(beanie);
    } else if (choices.hat === 'crown') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(headRadius * 0.7, headRadius * 0.82, headRadius * 0.7, 6), accent);
      crown.position.y = 0.08;
      hatPivot.add(crown);
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07 * featureScale, 0.2 * featureScale, 4), accent);
        const angle = i / 5 * Math.PI * 2;
        spike.position.set(Math.cos(angle) * headRadius * 0.58, headRadius * 0.72, Math.sin(angle) * headRadius * 0.58);
        hatPivot.add(spike);
      }
    } else {
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(headRadius * 0.62, headRadius * 0.86, headRadius * 0.96, 6), accent);
      hat.position.y = headRadius * 0.45;
      hatPivot.add(hat);
    }
  }

  if (choices.arms === 'none') arms.forEach(arm => { arm.mesh.visible = false; });
  if (choices.arms === 'candy-canes') arms.forEach(arm => arm.mesh.traverse(object => {
    if (object.isMesh) object.material = new THREE.MeshStandardMaterial({ color: object.material.color, roughness: 0.7 });
  }));
  const healthBack = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#183044', depthTest: false }));
  const visualHeight = (variantConfig.baseRadius * 2 + variantConfig.torsoRadius * 1.68 + variantConfig.headRadius * 1.84) * (variantConfig.visualScaleY || 1);
  healthBack.position.set(0, visualHeight + 0.48, 0);
  healthBack.scale.set(1.85, 0.22, 1);
  group.add(healthBack);
  const healthFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#66e29b', depthTest: false }));
  healthFill.position.set(0, visualHeight + 0.48, 0.02);
  healthFill.scale.set(1.7, 0.12, 1);
  group.add(healthFill);
  const chargeVisual = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#9deeff', transparent: true, opacity: 0.88 }));
  const throwingArm = arms.find(arm => arm.side === 1);
  const handAnchor = throwingArm?.hand || torsoPivot;
  if (!throwingArm) chargeVisual.position.set(0, 0.4, torsoRadius);
  handAnchor.add(chargeVisual);
  chargeVisual.visible = false;
  const shieldVisual = new THREE.Mesh(new THREE.SphereGeometry(1.35, 8, 6), new THREE.MeshBasicMaterial({ color: '#73dcff', transparent: true, opacity: 0.2, wireframe: true }));
  shieldVisual.position.y = visualHeight * 0.46;
  shieldVisual.visible = false;
  group.add(shieldVisual);
  group.userData.snowmanRig = rig;
  return { group, rig, variantName: rig.variantName, variantConfig, poseRoot, hips: rig.hips, torsoPivot, neck, headPivot, hatPivot, scarf,
    scarfTailPivot: rig.scarfTailPivot, parts, arms, legs: rig.legs, visualHeight,
    accent, choices, eyes: [eye, secondEye], eyeGlints: [glint, secondGlint], healthBack, healthFill, chargeVisual, shieldVisual };
}

function makeTitleSnowman() {
  const model = makeSnowman('#d94445', { hat: 'top-hat', scarf: 'striped', nose: 'carrot', arms: 'twigs', body: 'classic' });
  model.healthBack.visible = false;
  model.healthFill.visible = false;
  model.chargeVisual.visible = false;
  model.shieldVisual.visible = false;

  const midnight = new THREE.MeshStandardMaterial({ color: '#172333', roughness: 0.78 });
  for (const child of model.hatPivot.children) if (child.isMesh) child.material = midnight;
  const radius = model.variantConfig.headRadius;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.09, 10), midnight);
  brim.position.y = 0.035;
  model.hatPivot.add(brim);
  const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.8, radius * 0.8, 0.095, 8), new THREE.MeshStandardMaterial({ color: '#bd3e3d', roughness: 0.8 }));
  hatBand.position.y = radius * 0.18;
  model.hatPivot.add(hatBand);
  const hollyGreen = new THREE.MeshStandardMaterial({ color: '#287b4d', roughness: 0.85 });
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), hollyGreen);
    leaf.scale.set(1.45, 0.46, 0.62);
    leaf.position.set(side * 0.13, radius * 0.67, radius * 0.47);
    leaf.rotation.z = side * -0.48;
    model.hatPivot.add(leaf);
  }
  const berryMaterial = new THREE.MeshStandardMaterial({ color: '#e54645', roughness: 0.6 });
  for (let index = 0; index < 3; index++) {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(0.055, 7, 5), berryMaterial);
    berry.position.set((index - 1) * 0.075, radius * 0.64, radius * 0.57);
    model.hatPivot.add(berry);
  }
  if (model.scarf) {
    const greenStripe = new THREE.MeshStandardMaterial({ color: '#2b8052', roughness: 0.86 });
    for (const offset of [-0.32, 0.32]) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(model.variantConfig.torsoRadius * 0.78, 0.045, 4, 12), greenStripe);
      stripe.position.z = offset;
      model.scarf.add(stripe);
    }
  }
  if (model.scarfTailPivot) {
    // Keep the scarf tail over one shoulder so it reads as a wrapped scarf, not a chest stripe.
    model.scarfTailPivot.position.set(model.variantConfig.torsoRadius * 0.82, -model.variantConfig.torsoRadius * 0.32, model.variantConfig.torsoRadius * 0.62);
    model.scarfTailPivot.rotation.z = -0.72;
    const tailStripe = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.075, 0.025), hollyGreen);
    tailStripe.position.set(0, -0.18, 0.055);
    model.scarfTailPivot.add(tailStripe);
  }
  return model;
}

function checkRigConnections() {
  let connected = true;
  for (const model of [menuAvatarParts, previewSnowman, ...players.values()]) {
    if (model?.rig && !model.rig.checkRigConnections()) {
      console.warn('[Snowman rig] disconnected body anchor:', model.variantName || 'unknown variant');
      connected = false;
    }
  }
  return connected;
}

function disposeSnowman(model) {
  if (!model?.group) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  model.group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (!object.material) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (sharedSnowmanMaterials.has(material)) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  model.rig?.disposeDetachedResources();
  model.group.clear();
}

const menuAvatarParts = makeSnowman('#74bbed');
const menuAvatarGroup = menuAvatarParts.group;
menuAvatarParts.healthBack.visible = false;
menuAvatarParts.healthFill.visible = false;
menuAvatarGroup.position.set(0, 0, 0);
scene.add(menuAvatarGroup);

function setMenuAvatarVisible(visible) {
  menuAvatarGroup.visible = visible;
  // The map's center statue shares the menu avatar's origin; show only one at a time.
  if (centerStatueGroup) centerStatueGroup.visible = !visible;
}
setMenuAvatarVisible(true);

titleScene = new TitleSceneRenderer($('#title-snowman-canvas'), makeTitleSnowman, disposeSnowman,
  () => titleScreen.classList.add('title-static-fallback'), () => playArcadeSound('pickup'));
titleScreen.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch' || prefersMobileRendering()) return;
  // Track the cursor across the entire title screen, including the logo and buttons.
  titleScene?.setPointerFromScreen(event.clientX, event.clientY);
  const x = event.clientX / Math.max(1, innerWidth) - 0.5;
  const y = event.clientY / Math.max(1, innerHeight) - 0.5;
  titleScreen.style.setProperty('--title-pan-x', `${-x * 10}px`);
  titleScreen.style.setProperty('--title-pan-y', `${-y * 8}px`);
});
titleScreen.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') titleScene?.setPointerFromScreen(event.clientX, event.clientY, { touch: true });
});
titleScreen.addEventListener('pointerleave', event => {
  titleScreen.style.setProperty('--title-pan-x', '0px');
  titleScreen.style.setProperty('--title-pan-y', '0px');
  if (event.pointerType !== 'touch') titleScene?.clearPointer();
});
const titleButtons = [$('#title-play'), $('#title-quit')];
titleScreen.classList.add('title-loading');
titleButtons.forEach(button => { button.disabled = true; });
const titleAssets = [
  '/assets/title/bg.jpg', '/assets/title/logo.png',
  '/assets/title/play.png', '/assets/title/play-hover.png', '/assets/title/play-pressed.png',
  '/assets/title/quit.png', '/assets/title/quit-hover.png', '/assets/title/quit-pressed.png'
];
let titleAssetsFinished = false;
function finishTitleLoading(failedAsset = false) {
  if (titleAssetsFinished) return;
  titleAssetsFinished = true;
  if (failedAsset) titleScreen.classList.add('title-static-fallback');
  titleLoader.hidden = true;
  titleScreen.classList.remove('title-loading');
  titleButtons.forEach(button => { button.disabled = false; });
}
Promise.all(titleAssets.map(source => new Promise(resolve => {
  const image = new Image();
  image.onload = () => resolve(true);
  image.onerror = () => resolve(false);
  image.src = source;
}))).then(results => finishTitleLoading(results.some(loaded => !loaded)));
window.setTimeout(() => finishTitleLoading(false), 4500);

const previewCanvas = $('#preview-canvas');
const previewScene = new THREE.Scene();
previewScene.background = null;
const previewCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
const previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true, alpha: true, powerPreference: 'low-power' });
previewRenderer.setClearColor(0x000000, 0);
previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
previewScene.add(new THREE.HemisphereLight('#f8fcff', '#aab9c2', 1.8));
const previewLight = new THREE.DirectionalLight('#fff4df', 1.35);
previewLight.position.set(-3, 6, 5);
previewScene.add(previewLight);
const previewGround = new THREE.Mesh(new THREE.CircleGeometry(2.2, 28), new THREE.MeshStandardMaterial({ color: '#edf4f4', roughness: 0.95 }));
previewGround.rotation.x = -Math.PI / 2;
previewGround.position.y = 0.015;
previewScene.add(previewGround);
let previewGroup = null;
let previewSnowman = null;
let previewRotation = 0;
let previewDragging = false;
let previewPointerId = null;
let previewPointerX = 0;

function lookFromProfile() {
  return currentProfile?.snowmanLook || { hat: 'top-hat', scarf: 'classic', nose: 'carrot', arms: 'twigs', body: 'classic' };
}

function refreshPreview() {
  if (previewGroup) {
    previewScene.remove(previewGroup);
    disposeSnowman(previewSnowman);
  }
  previewGroup = null;
  previewSnowman = null;
  const preview = makeSnowman(currentProfile?.snowmanColor || $('#look-color').value || '#69a9e8', lookFromProfile());
  preview.healthBack.visible = false;
  preview.healthFill.visible = false;
  previewGroup = preview.group;
  previewSnowman = preview;
  previewGroup.rotation.y = previewRotation;
  previewScene.add(previewGroup);
  fitPreviewCamera();
  updateLookStats();
}

function fitPreviewCamera() {
  if (!previewGroup || !previewSnowman) return;
  previewGroup.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(previewGroup);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const verticalFov = THREE.MathUtils.degToRad(previewCamera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(0.25, previewCamera.aspect));
  const fitHeight = size.y * 0.5 / Math.tan(verticalFov / 2);
  const fitWidth = size.x * 0.5 / Math.tan(horizontalFov / 2);
  const distance = Math.max(fitHeight, fitWidth, size.z) * 1.22;
  const front = new THREE.Vector3(0.16, 0.10, 1).normalize();
  previewCamera.position.copy(center).addScaledVector(front, distance);
  previewCamera.near = Math.max(0.01, distance / 100);
  previewCamera.far = Math.max(40, distance * 4);
  previewCamera.lookAt(center.x, bounds.min.y + size.y * 0.48, center.z);
  previewCamera.updateProjectionMatrix();
  const groundRadius = Math.max(size.x, size.z) * 0.5 + 0.35;
  previewGround.scale.setScalar(groundRadius / 2.2);
}

previewCanvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || previewPointerId !== null) return;
  event.preventDefault();
  previewDragging = true;
  previewPointerId = event.pointerId;
  previewPointerX = event.clientX;
  previewCanvas.setPointerCapture(event.pointerId);
});
previewCanvas.addEventListener('pointermove', event => {
  if (!previewDragging || event.pointerId !== previewPointerId) return;
  previewRotation += (event.clientX - previewPointerX) * 0.009;
  previewPointerX = event.clientX;
  if (previewGroup) previewGroup.rotation.y = previewRotation;
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) previewCanvas.addEventListener(type, event => {
  if (event.pointerId !== previewPointerId) return;
  previewDragging = false;
  previewPointerId = null;
});

function updateLookStats() {
  const look = lookFromProfile();
  const stats = [];
  if (look.hat === 'top-hat') stats.push('Pickup range +10%');
  if (look.hat === 'beanie') stats.push('Movement speed +5%');
  if (look.scarf === 'striped') stats.push('Movement speed +5%');
  if (look.scarf === 'bowtie') stats.push('Pickup range +5%');
  if (look.arms === 'candy-canes') stats.push('Throw range +10%');
  if (look.body === 'wide') stats.push('Health +20%, speed -10%');
  if (look.body === 'tall') stats.push('Throw range +5%');
  $('#look-stats').textContent = stats.length ? `Balanced appearance bonuses\n${stats.join('\n')}` : 'Balanced appearance\nNo bonus selected';
}

function setLookControls(look, color) {
  $('#look-hat').value = look.hat;
  $('#look-scarf').value = look.scarf;
  $('#look-nose').value = look.nose;
  $('#look-arms').value = look.arms;
  $('#look-body').value = look.body;
  $('#look-color').value = color || '#69a9e8';
  refreshPreview();
}

function readLookControls() {
  return {
    hat: $('#look-hat').value,
    scarf: $('#look-scarf').value,
    nose: $('#look-nose').value,
    arms: $('#look-arms').value,
    body: $('#look-body').value
  };
}

function updatePlayers(list) {
  const active = new Set(list.map(player => player.id));
  for (const [id, player] of players) {
    if (active.has(id)) continue;
    scene.remove(player.group);
    player.card.remove();
    players.delete(id);
  }
  for (const data of list) {
    let player = players.get(data.id);
    const appearance = JSON.stringify([data.color, data.look]);
    if (!player || player.appearance !== appearance) {
      if (player) {
        scene.remove(player.group);
        player.card.remove();
      }
      const made = makeSnowman(data.color, data.look);
      scene.add(made.group);
      const card = document.createElement('div');
      card.className = 'player-card';
      roster.append(card);
      player = { ...made, card, target: new THREE.Vector3(), appearance, lastX: data.x, lastZ: data.z,
        animClock: Math.random() * Math.PI * 2, animator: new SnowmanAnimator(), knockedOut: false,
        aimYaw: Number(data.aimYaw ?? data.yaw) || 0, aimPitch: Number(data.aimPitch) || 0,
        aimYawTarget: Number(data.aimYaw ?? data.yaw) || 0, aimPitchTarget: Number(data.aimPitch) || 0,
        aiming: Boolean(data.aiming),
        deathStartedAt: 0, respawnStartedAt: 0, throwStartedAt: 0, throwReleaseStartedAt: 0,
        lastMovedAt: performance.now(), lastTargetX: data.x, lastTargetZ: data.z,
        lastWalkPuffAt: 0, hitStartedAt: 0,
        pose: { leanX: 0, leanZ: 0, bodyY: 1, bodyX: 1, bodyZ: 1, lift: 0, headX: 0, headY: 0, hatZ: 0, scarfZ: 0, armX: 0, armZ: 0, twist: 0 },
        poseFrom: { leanX: 0, leanZ: 0, bodyY: 1, bodyX: 1, bodyZ: 1, lift: 0, headX: 0, headY: 0, hatZ: 0, scarfZ: 0, armX: 0, armZ: 0, twist: 0 } };
      players.set(data.id, player);
    }
    player.card.style.setProperty('--player-color', data.color);
    player.card.innerHTML = `${escapeText(data.name)}<small>${data.host ? 'HOST ' : ''}${data.ready ? 'READY' : 'NOT READY'}${gameStatus !== 'LOBBY' ? ` | ${data.score || 0} PTS` : ''}${data.id === myId ? ' | YOU' : ''}</small>`;
    player.target.set(data.x, 0, data.z);
    player.yaw = data.yaw;
    player.aimYawTarget = Number.isFinite(data.aimYaw) ? data.aimYaw : data.yaw;
    player.aimPitchTarget = Number.isFinite(data.aimPitch)
      ? THREE.MathUtils.clamp(data.aimPitch, -AIM_CONFIG.maxPitch, AIM_CONFIG.maxPitch) : 0;
    player.aiming = Boolean(data.aiming);
    player.movementState = data.movementState || 'STANDING';
    player.stanceState = data.stanceState || player.movementState;
    player.dashCooldownSeconds = Number(data.dashCooldownSeconds) || 0;
    player.serverHitboxHeight = Number(data.hitboxHeight) || movementConfig.states[player.stanceState]?.height || 3.4;
    if (Math.hypot(data.x - player.lastTargetX, data.z - player.lastTargetZ) > 0.035) player.lastMovedAt = performance.now();
    player.lastTargetX = data.x;
    player.lastTargetZ = data.z;
    const knockedOut = data.health <= 0;
    const stateChangedAt = performance.now();
    if (knockedOut && !player.knockedOut) {
      player.deathStartedAt = stateChangedAt;
      player.respawnStartedAt = 0;
    } else if (!knockedOut && player.knockedOut) {
      player.deathStartedAt = 0;
      player.respawnStartedAt = stateChangedAt;
    }
    player.knockedOut = knockedOut;
    player.ready = Boolean(data.ready);
    const healthRatio = THREE.MathUtils.clamp((data.health ?? 100) / 100, 0, 1);
    const showOverheadHealth = !knockedOut && data.id !== myId;
    player.healthBack.visible = showOverheadHealth;
    player.healthFill.visible = showOverheadHealth;
    player.healthFill.scale.x = 1.7 * healthRatio;
    player.healthFill.position.x = -0.85 * (1 - healthRatio);
    player.healthFill.material.color.set(healthRatio > 0.55 ? '#66e29b' : healthRatio > 0.25 ? '#ffd05c' : '#ff6472');
    player.chargeVisual.visible = Boolean(data.charging);
    player.isCharging = Boolean(data.charging);
    player.shieldVisual.visible = (data.powerUpStatus?.shield || 0) > 0;
    const chargeRatio = THREE.MathUtils.clamp(data.charge || 0, 0, 1);
    player.chargeRatio = chargeRatio;
    player.chargeVisual.scale.setScalar(0.45 + chargeRatio * 1.25);
    player.chargeVisual.material.color.set(chargeRatio >= 0.96 ? '#ffd05c' : '#9deeff');
  }
}

function animationMode(player, walkBlend, now) {
  if (player.knockedOut) return 'KNOCKED_OUT';
  if (player.movementState === 'DASHING') return 'DASH';
  if (player.isCharging) return 'CHARGE';
  if (player.throwReleaseStartedAt && now - player.throwReleaseStartedAt < SNOWMAN_CONFIG.animation.throwSeconds * 1000) return 'THROW';
  if (now - player.hitStartedAt < 240) return 'HIT';
  if (player.stanceState === 'CROUCHING') return walkBlend > 0.1 ? 'CROUCH_WALK' : 'CROUCH_IDLE';
  if (currentRoom?.status === 'RESULTS' && currentRoom.winnerId === player.id) return 'VICTORY';
  if (currentRoom?.status === 'LOBBY' && player.ready) return 'WAVE';
  if (walkBlend > 0.72) return 'RUN';
  if (walkBlend > 0.1) return 'WALK';
  if (now - player.lastMovedAt > 8000) return 'SHIVER';
  return 'IDLE';
}

function desiredSnowmanPose(player, mode, now, walkBlend, variantConfig) {
  const time = now * 0.001;
  const phase = player.animator.phase;
  const breath = Math.sin(time * SNOWMAN_CONFIG.animation.idleBreathHz * Math.PI * 2 + phase * 0.1);
  const pose = { leanX: 0, leanZ: 0, bodyY: 1 + breath * 0.012, bodyX: 1, bodyZ: 1,
    lift: 0, headX: 0, headY: 0, hatZ: 0, scarfZ: 0, armX: 0, armZ: 0, twist: 0 };
  if (mode === 'IDLE') {
    pose.bodyY = 1 + breath * SNOWMAN_CONFIG.animation.idleBreathScale;
    pose.leanZ = Math.sin(time * SNOWMAN_CONFIG.animation.idleSwayHz * Math.PI * 2) * SNOWMAN_CONFIG.animation.idleSwayRadians;
    pose.headY = Math.sin(time * SNOWMAN_CONFIG.animation.idleHeadHz * Math.PI * 2) * 0.035;
    pose.hatZ = Math.sin(time * 2.3) * 0.035;
    pose.scarfZ = Math.sin(time * SNOWMAN_CONFIG.animation.idleScarfHz * Math.PI * 2) * 0.012;
    pose.armZ = Math.sin(time * 1.35) * 0.035;
  } else if (mode === 'SHIVER') {
    pose.leanZ = Math.sin(time * 18) * 0.035;
    pose.bodyY = 0.985 + Math.abs(Math.sin(time * 15)) * 0.025;
    pose.headY = Math.sin(time * 1.7) * 0.22;
    pose.hatZ = Math.sin(time * 15) * 0.11;
    pose.scarfZ = Math.sin(time * 17) * 0.08;
    pose.armZ = Math.sin(time * 17) * 0.055;
  } else if (mode === 'WALK') {
    pose.leanZ = Math.sin(phase) * variantConfig.waddle * 0.72 * walkBlend;
    pose.bodyY = 1 + Math.abs(Math.sin(phase * 2)) * 0.022 * walkBlend;
    pose.armZ = Math.sin(phase) * 0.32 * walkBlend;
    pose.armX = Math.sin(phase) * 0.30 * walkBlend;
    pose.scarfZ = Math.sin(phase * 1.6) * 0.035;
  } else if (mode === 'RUN') {
    pose.leanX = 0.22;
    pose.leanZ = Math.sin(phase) * variantConfig.waddle * 0.9;
    pose.bodyY = 1 + Math.abs(Math.sin(phase * 2)) * 0.04;
    pose.armZ = Math.sin(phase) * 0.55;
    pose.armX = Math.sin(phase) * 0.50;
    pose.scarfZ = Math.sin(phase * 1.6) * 0.075;
  } else if (mode === 'CROUCH_IDLE' || mode === 'CROUCH_WALK') {
    pose.bodyY = 0.61 + (mode === 'CROUCH_WALK' ? Math.abs(Math.sin(player.animClock * 2)) * 0.014 : 0);
    pose.bodyX = mode === 'CROUCH_WALK' ? 1 + Math.sin(player.animClock) * 0.014 : 1;
    pose.leanX = mode === 'CROUCH_WALK' ? 0.08 : 0.025;
    pose.leanZ = mode === 'CROUCH_WALK' ? Math.sin(phase) * variantConfig.waddle * 0.5 * walkBlend : Math.sin(time) * 0.008;
    pose.armZ = mode === 'CROUCH_WALK' ? Math.sin(phase + Math.PI) * 0.18 * walkBlend : 0.05;
    pose.headX = 0.08;
  } else if (mode === 'DASH') {
    pose.leanX = 0.34;
    pose.bodyY = 0.91;
    pose.bodyZ = 1.13;
    pose.armX = -0.4;
    pose.armZ = Math.sin(time * 28) * 0.08;
    pose.scarfZ = Math.sin(time * 22) * 0.08;
  } else if (mode === 'CHARGE') {
    const charge = Math.max(0, Math.min(1, player.chargeRatio || 0));
    const tremble = Math.sin(time * SNOWMAN_CONFIG.animation.chargeTrembleHz * Math.PI * 2);
    const finalCharge = Math.max(0, (charge - 0.75) / 0.25);
    pose.armX = 0.24 + charge * 0.16;
    pose.armZ = Math.sin(time * 1.3) * 0.025 + tremble * charge * SNOWMAN_CONFIG.animation.chargeTrembleRadians;
    pose.leanX = 0.035;
    pose.bodyY = 1 + tremble * charge * 0.005 + Math.sin(time * SNOWMAN_CONFIG.animation.chargeFinalTrembleHz * Math.PI * 2) * finalCharge * 0.005;
  } else if (mode === 'THROW') {
    const progress = Math.max(0, Math.min(1, (now - player.throwReleaseStartedAt) / (SNOWMAN_CONFIG.animation.throwSeconds * 1000)));
    const releaseStart = SNOWMAN_CONFIG.animation.throwReleaseStart / SNOWMAN_CONFIG.animation.throwSeconds;
    const releaseEnd = SNOWMAN_CONFIG.animation.throwReleaseEnd / SNOWMAN_CONFIG.animation.throwSeconds;
    const snap = progress < releaseStart ? progress / releaseStart : progress < releaseEnd ? 1 : (1 - progress) / (1 - releaseEnd);
    if (player.stanceState === 'CROUCHING') {
      pose.bodyY = 0.61 - Math.sin(progress * Math.PI) * 0.025;
      pose.leanX = 0.12 * Math.max(0, snap);
      pose.armX = -0.65 * Math.max(0, snap);
      pose.armZ = 0.08 * Math.max(0, snap);
    } else {
      pose.leanX = 0.16 * Math.max(0, snap);
      pose.armX = -0.82 * Math.max(0, snap);
      pose.armZ = 0.10 * Math.max(0, snap);
      pose.bodyY = 1 - Math.sin(progress * Math.PI) * 0.035;
    }
  } else if (mode === 'HIT') {
    const age = Math.max(0, now - player.hitStartedAt) / 240;
    pose.leanZ = Math.sin(age * Math.PI * 5) * (1 - age) * 0.13;
    pose.bodyY = 1 - Math.sin(age * Math.PI) * 0.12;
    pose.headY = Math.sin(age * Math.PI * 4) * (1 - age) * 0.14;
  } else if (mode === 'WAVE') {
    pose.lift = Math.max(0, Math.sin(time * 2.5)) * 0.025;
    pose.armX = Math.sin(time * 5) * 0.1;
    pose.armZ = Math.sin(time * 5) * 0.3;
    pose.headY = Math.sin(time * 2) * 0.08;
  } else if (mode === 'VICTORY') {
    pose.lift = Math.max(0, Math.sin(time * 5)) * 0.3;
    pose.bodyY = 1 + Math.max(0, Math.sin(time * 5)) * 0.08;
    pose.armX = Math.sin(time * 5) * 0.18;
    pose.armZ = Math.sin(time * 5) * 0.45;
    pose.headY = Math.sin(time * 2) * 0.12;
  } else if (mode === 'KNOCKED_OUT') {
    const fall = Math.max(0, Math.min(1, (now - player.deathStartedAt) / 480));
    pose.leanX = fall * 1.18;
    pose.leanZ = Math.sin(fall * Math.PI) * 0.12;
    pose.bodyY = 1 - fall * 0.22;
  }
  return pose;
}

function updateSnowmanAnimation(player, now, dt, travel) {
  const variantConfig = player.variantConfig;
  const moveSpeed = travel / Math.max(dt, 0.001);
  const walkBlend = THREE.MathUtils.clamp(moveSpeed / SNOWMAN_CONFIG.animation.runSpeed, 0, 1);
  player.animator.advance(dt, travel, variantConfig, moveSpeed > 0.05);
  player.animClock = player.animator.phase;
  const mode = animationMode(player, walkBlend, now);
  const target = desiredSnowmanPose(player, mode, now, walkBlend, variantConfig);
  if (mode !== player.animator.current) {
    // The release snapshot and projectile appear together; align the hand to
    // its release pose immediately, while all locomotion changes still blend.
    Object.assign(player.poseFrom, mode === 'THROW' ? target : player.pose);
    player.animator.transition(mode, now);
  }
  if (player.isCharging) player.chargeRatio = localRoomCharge(player);
  let blend = player.animator.blend(now);
  for (const key in player.pose) {
    player.pose[key] = THREE.MathUtils.lerp(player.poseFrom[key], target[key], blend);
  }
  const pose = player.pose;
  player.poseRoot.position.y = pose.lift;
  // The root is for vertical movement and scale only; only the upper torso may lean.
  player.poseRoot.rotation.set(0, 0, 0);
  player.poseRoot.scale.set(pose.bodyX, (variantConfig.visualScaleY || 1) * pose.bodyY, pose.bodyZ);
  const lookYaw = Number.isFinite(player.aimYaw) ? player.aimYaw : (player.yaw || 0);
  const lookYawOffset = angleDiff(player.group.rotation.y, lookYaw);
  player.torsoPivot.rotation.y = pose.twist + (player.aiming
    ? THREE.MathUtils.clamp(lookYawOffset, -0.43, 0.43) : 0);
  const upperBodyPitch = pose.leanX - (player.aiming ? player.aimPitch * 0.34 : 0);
  player.torsoPivot.rotation.x = Number.isFinite(upperBodyPitch)
    ? THREE.MathUtils.clamp(upperBodyPitch, -0.21, 0.21) : 0;
  player.torsoPivot.rotation.z = Number.isFinite(pose.leanZ)
    ? THREE.MathUtils.clamp(pose.leanZ, -0.12, 0.12) : 0;
  player.headPivot.rotation.set(pose.headX - THREE.MathUtils.clamp(player.aimPitch || 0, -0.43, 0.43),
    pose.headY + THREE.MathUtils.clamp(lookYawOffset, -0.52, 0.52), 0);
  player.hatPivot.rotation.z = pose.hatZ;
  const healthHeight = player.stanceState === 'CROUCHING' ? player.visualHeight * 0.72 : player.visualHeight + 0.48;
  player.healthBack.position.y = healthHeight;
  player.healthFill.position.y = healthHeight;
  if (player.scarf) player.scarf.rotation.set(Math.PI / 2, 0, pose.scarfZ);
  for (const arm of player.arms) {
    const throwingArm = arm.side === 1;
    let armX = arm.restX + pose.armX * arm.side;
    let armZ = arm.rest + pose.armZ * arm.side;
    if (mode === 'CHARGE') {
      armX = throwingArm ? pose.armX : -0.06;
      armZ = arm.rest + (throwingArm ? pose.armZ : 0);
    } else if (mode === 'THROW') {
      armX = throwingArm ? pose.armX : -0.04;
      armZ = arm.rest + (throwingArm ? pose.armZ : 0);
    } else if (player.aiming && mode !== 'DASH' && mode !== 'KNOCKED_OUT') {
      armX = throwingArm ? -0.12 : -0.06;
      armZ = arm.rest;
    }
    arm.mesh.rotation.x = Number.isFinite(armX) ? THREE.MathUtils.clamp(armX, -0.8, 0.8) : 0;
    // Keep the shoulder swing below a T-pose while preserving the outward rest angle.
    arm.mesh.rotation.z = Number.isFinite(armZ) ? THREE.MathUtils.clamp(armZ, -0.5, 0.5) : arm.rest;
    const elbowBend = mode === 'THROW' && throwingArm ? Math.abs(pose.armZ) * 0.5
      : mode === 'WALK' || mode === 'RUN' ? Math.abs(pose.armZ) * 0.16 : 0;
    arm.elbow.rotation.z = Number.isFinite(elbowBend) ? THREE.MathUtils.clamp(elbowBend, 0, 0.2) : 0;
  }
  for (const leg of player.legs) {
    const step = Math.sin(player.animator.phase + (leg.side < 0 ? 0 : Math.PI));
    const moving = mode === 'WALK' || mode === 'RUN' || mode === 'CROUCH_WALK' || mode === 'DASH';
    const crouch = player.stanceState === 'CROUCHING';
    leg.pivot.position.y = leg.restY + (moving ? Math.max(0, step) * (mode === 'RUN' ? 0.11 : 0.08) : 0);
    const gaitDistance = variantConfig.strideLength / variantConfig.stepFrequency;
    leg.pivot.position.z = leg.restZ + (moving ? step * gaitDistance * (mode === 'RUN' ? 0.10 : 0.08) : 0);
    leg.pivot.rotation.x = moving ? step * 0.14 : 0;
    leg.pivot.scale.x = crouch ? 1.18 : 1;
  }
  if (player.scarfTailPivot) player.scarfTailPivot.rotation.x = pose.scarfZ * 0.65;
  player.group.scale.setScalar(1);
  if (player.knockedOut) {
    const fall = THREE.MathUtils.clamp((now - player.deathStartedAt) / 480, 0, 1);
    player.group.scale.set(1 - fall * 0.08, 1 - fall * 0.13, 1 - fall * 0.08);
  } else if (player.respawnStartedAt) {
    const pop = THREE.MathUtils.clamp((now - player.respawnStartedAt) / 360, 0, 1);
    const popEase = pop < 1 ? 1 + Math.sin((1 - pop) * Math.PI) * 0.16 * (1 - pop) : 1;
    player.group.scale.setScalar(popEase);
    player.group.position.y = pop < 1 ? Math.sin(pop * Math.PI) * 0.22 : 0;
    if (pop >= 1) player.respawnStartedAt = 0;
  }
  const mobileRender = prefersMobileRendering();
  const localPlayer = player.id === myId;
  if (walkBlend > 0.25 && (!mobileRender || localPlayer)
    && now - player.lastWalkPuffAt > (mobileRender ? 900 : 650)) {
    player.lastWalkPuffAt = now;
    spawnSnowPuff(player.group.position, player.yaw, '#f5fdff', 0.55);
  }
  if (mode === 'DASH' && now - player.lastWalkPuffAt > 45) {
    player.lastWalkPuffAt = now;
    spawnSnowPuff(player.group.position, player.yaw, '#bdefff', 1.15);
  }
  if (!mobileRender && (mode === 'WALK' || mode === 'RUN') && now - player.lastFootprintAt > 440) {
    player.lastFootprintAt = now;
    spawnFootprint(player);
  }
  return walkBlend;
}

/** Rebuilds both aiming rays from the final camera transform and live hand bone. */
function refreshAimPoint(local, dt = 0) {
  camera.updateMatrixWorld(true);
  const ray = aimRaycaster;
  ray.setFromCamera(aimReticleViewport, camera);
  enemyGroups.length = 0;
  for (const [id, player] of players) if (id !== myId && !player.knockedOut) enemyGroups.push(player.group);
  aimTargets.length = 0;
  aimTargets.push(...cameraObstacles, ...enemyGroups);
  ignoredAimRoots.clear();
  ignoredAimRoots.add(local.group);
  const point = resolveCameraAimPoint({ raycaster: ray,
    targets: aimTargets, ignoredRoots: ignoredAimRoots, groundPlane: aimGroundPlane,
    maxDistance: AIM_CONFIG.maxDistance, out: cameraAimPoint });

  local.group.updateMatrixWorld(true);
  const throwingHand = local.arms.find(arm => arm.side === 1)?.hand;
  if (throwingHand) throwingHand.getWorldPosition(aimHandPosition);
  else aimHandPosition.copy(local.group.position);
  if (point.distanceTo(aimHandPosition) < AIM_CONFIG.minHandDistance) ray.ray.at(32, aimWorldPoint);
  else aimWorldPoint.copy(point);

  // A second ray from the actual hand clamps shots against walls the camera can see around.
  const muzzleBlock = resolveMuzzleBlock(aimHandPosition, aimWorldPoint, cameraObstacles, muzzleRay);
  if (muzzleBlock) aimWorldPoint.copy(muzzleBlock.point);
  const direction = directionFromHand(aimHandPosition, aimWorldPoint,
    aimYawInitialized ? aimYawCache : yaw);
  if (!aimYawInitialized) { aimYawCache = direction.yaw; aimYawInitialized = true; }
  else {
    const maxYawStep = AIM_CONFIG.yawTurnRate * Math.max(0, dt);
    aimYawCache += THREE.MathUtils.clamp(angleDiff(aimYawCache, direction.yaw), -maxYawStep, maxYawStep);
  }
  aimYawCache = Math.atan2(Math.sin(aimYawCache), Math.cos(aimYawCache));
  aimPitchCache = direction.pitch;
}

function spawnFootprint(player) {
  const foot = player.legs[player.nextFootprintSide || 0];
  player.nextFootprintSide = player.nextFootprintSide ? 0 : 1;
  if (!foot) return;
  let mark = footprintPool[0];
  for (const entry of footprintPool) {
    if (!entry.mesh.visible) { mark = entry; break; }
    if (entry.bornAt < mark.bornAt) mark = entry;
  }
  foot.pivot.getWorldPosition(footprintPosition);
  mark.mesh.position.set(footprintPosition.x, 0.018, footprintPosition.z);
  mark.mesh.rotation.z = player.yaw || 0;
  const size = player.variantConfig.footSize * 0.48;
  mark.mesh.scale.set(size * 1.05, size * 1.7, 1);
  mark.mesh.material.opacity = 0.28;
  mark.mesh.visible = true;
  mark.bornAt = performance.now();
}

function localRoomCharge(player) {
  const state = currentRoom?.players?.find(candidate => candidate.id === player.id);
  return THREE.MathUtils.clamp(Number(state?.charge) || 0, 0, 1);
}

function spawnSnowPuff(position, yawValue, color, size) {
  if (trailParticles.size >= maxTrailParticles) return;
  const puff = trailPool.pop() || (trailParticles.size < maxTrailParticles
    ? { particle: new THREE.Mesh(trailGeometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, depthWrite: false })) }
    : null);
  if (!puff) return;
  puff.material = puff.particle.material;
  puff.material.color.set(color);
  puff.material.opacity = 0.72;
  puff.start = performance.now();
  puff.lifetime = 420;
  puff.particle.position.set(position.x - Math.sin(yawValue) * 0.5, 0.18, position.z - Math.cos(yawValue) * 0.5);
  puff.particle.scale.setScalar(size);
  scene.add(puff.particle);
  trailParticles.add(puff);
}

function spawnDashLines(player) {
  if (dashStreaks.length >= 10) return;
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: '#c7f4ff', transparent: true,
    opacity: 0.64, depthWrite: false });
  for (let index = 0; index < 3; index++) {
    const line = new THREE.Mesh(dashLineGeometry, material);
    line.position.set((index - 1) * 0.36, 0.45 + index * 0.42, -0.85 - (index % 2) * 0.28);
    group.add(line);
  }
  group.position.copy(player.group.position);
  group.rotation.y = player.yaw || 0;
  scene.add(group);
  dashStreaks.push({ group, material, start: performance.now() });
}

function updateSnowballs(list = []) {
  const active = new Set(list.map(ball => ball.id));
  for (const [id, item] of snowballMeshes) {
    if (active.has(id)) continue;
    scene.remove(item.mesh);
    item.mesh.material.dispose();
    snowballMeshes.delete(id);
  }
  for (const ball of list) {
    let item = snowballMeshes.get(ball.id);
    if (!item) {
      const material = new THREE.MeshStandardMaterial({
        color: ball.critical ? '#ffd05c' : '#fffdf5',
        emissive: ball.critical ? '#f09d2f' : '#000000',
        emissiveIntensity: ball.critical ? 0.75 : 0,
        roughness: 0.7
      });
      const mesh = new THREE.Mesh(snowballGeometry, material);
      mesh.castShadow = false;
      mesh.scale.setScalar(ball.radius * 0.18);
      const launchX = Number.isFinite(ball.startX) ? ball.startX : ball.x;
      const launchY = Number.isFinite(ball.startY) ? ball.startY : ball.y;
      const launchZ = Number.isFinite(ball.startZ) ? ball.startZ : ball.z;
      mesh.position.set(launchX, launchY, launchZ);
      mesh.visible = Boolean(ball.launched);
      scene.add(mesh);
      item = { mesh, target: new THREE.Vector3(), lastTrail: new THREE.Vector3(launchX, launchY, launchZ),
        radius: ball.radius, spawnAt: performance.now(), wasLaunched: Boolean(ball.launched),
        justLaunched: Boolean(ball.launched) };
      snowballMeshes.set(ball.id, item);
    }
    if (ball.launched && !item.wasLaunched) {
      const launchX = Number.isFinite(ball.startX) ? ball.startX : ball.x;
      const launchY = Number.isFinite(ball.startY) ? ball.startY : ball.y;
      const launchZ = Number.isFinite(ball.startZ) ? ball.startZ : ball.z;
      item.mesh.position.set(launchX, launchY, launchZ);
      item.justLaunched = true;
    }
    item.wasLaunched = Boolean(ball.launched);
    item.target.set(ball.x, ball.y, ball.z);
    item.mesh.visible = Boolean(ball.launched);
    if (!ball.launched) continue;
    if (item.lastTrail.distanceTo(item.target) > 0.68) {
      const trail = trailPool.pop() || (trailParticles.size < maxTrailParticles
        ? { particle: new THREE.Mesh(trailGeometry, new THREE.MeshBasicMaterial({ color: '#eefaff', transparent: true, opacity: 0.7, depthWrite: false })) }
        : null);
      if (trail) {
        trail.material = trail.particle.material;
        trail.material.color.set(ball.critical ? '#ffd56c' : '#eefaff');
        trail.material.opacity = 0.7;
        trail.start = performance.now();
        trail.lifetime = 320;
        trail.particle.position.copy(item.mesh.position);
        trail.particle.scale.setScalar(1);
        scene.add(trail.particle);
        trailParticles.add(trail);
      }
      item.lastTrail.copy(item.target);
    }
  }
}

function updatePowerUps(list = []) {
  const active = new Set(list.map(item => item.id));
  for (const [id, item] of powerUpMeshes) {
    if (active.has(id)) { item.removingAt = 0; continue; }
    if (!item.removingAt) { item.removingAt = performance.now(); spawnGiftBurst(item.group.position, item.color); }
  }
  const colors = { SPEED: '#ef5364', STRONG: '#57c985', SHIELD: '#55b9f5', HEAL: '#f2c14f', EXTRA_LIFE: '#ad78e8' };
  const symbols = { SPEED: '↟', STRONG: '✦', SHIELD: '◇', HEAL: '+', EXTRA_LIFE: '★' };
  for (const pickup of list) {
    if (powerUpMeshes.has(pickup.id)) continue;
    const group = new THREE.Group();
    const color = colors[pickup.type] || '#ffffff';
    const wrapper = new THREE.MeshStandardMaterial({ color, roughness: 0.44, metalness: 0.04 });
    const ribbon = new THREE.MeshStandardMaterial({ color: '#fff1cb', emissive: color, emissiveIntensity: 0.16, roughness: 0.28 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.58, 0.78), wrapper);
    base.position.y = 0.38; base.castShadow = true; base.receiveShadow = true;
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.68, -0.38); group.add(lidPivot);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.9), wrapper); lid.position.set(0, 0, 0.38); lid.castShadow = true; lidPivot.add(lid);
    const verticalRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 0.82), ribbon); verticalRibbon.position.set(0, 0.38, 0);
    const crossRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.68, 0.16), ribbon); crossRibbon.position.set(0, 0.38, 0);
    const lidRibbon = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.92), ribbon); lidRibbon.position.set(0, 0, 0.38); lidPivot.add(lidRibbon);
    const bowKnot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), ribbon); bowKnot.position.set(0, 0.81, 0);
    const bowLoopGeometry = new THREE.TorusGeometry(0.16, 0.045, 6, 10, Math.PI * 1.55);
    const bowLeft = new THREE.Mesh(bowLoopGeometry, ribbon); bowLeft.position.set(-0.14, 0.83, 0); bowLeft.rotation.z = -0.52;
    const bowRight = bowLeft.clone(); bowRight.position.x = 0.14; bowRight.rotation.z = Math.PI + 0.52;
    const sparkles = Array.from({ length: 3 }, (_, index) => {
      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), new THREE.MeshBasicMaterial({ color: '#fff5b5', transparent: true }));
      sparkle.position.set(Math.cos(index * Math.PI * 2 / 3) * 0.66, 0.72 + index * 0.12, Math.sin(index * Math.PI * 2 / 3) * 0.66);
      group.add(sparkle); return sparkle;
    });
    const ringColor = pickup.rarity === 'LEGENDARY' ? '#ffe16a' : color;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.68, 0.035, 5, 20), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.68 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, 96, 96);
    context.fillStyle = '#ffffff';
    context.font = 'bold 70px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(symbols[pickup.type] || '✦', 48, 51);
    const iconTexture = new THREE.CanvasTexture(canvas);
    iconTexture.colorSpace = THREE.SRGBColorSpace;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture, transparent: true, depthWrite: false }));
    icon.position.y = 1.48;
    icon.scale.set(0.42, 0.42, 1);
    group.add(base, verticalRibbon, crossRibbon, bowKnot, bowLeft, bowRight, ring, icon);
    group.position.set(pickup.x, 0, pickup.z);
    scene.add(group);
    powerUpMeshes.set(pickup.id, { id: pickup.id, group, lidPivot, ring, icon, sparkles,
      type: pickup.type, rarity: pickup.rarity || 'COMMON', color, bornAt: performance.now(), removingAt: 0 });
  }
}

const giftConfetti = new Set();
function spawnGiftBurst(position, color) {
  for (let i = 0; i < 10; i++) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.035), new THREE.MeshBasicMaterial({ color, transparent: true }));
    piece.position.set(position.x, 0.65 + Math.random() * 0.45, position.z);
    piece.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 3, 1.4 + Math.random() * 2, (Math.random() - 0.5) * 3);
    piece.userData.bornAt = performance.now(); scene.add(piece); giftConfetti.add(piece);
  }
}

let audioContext = null;
let musicMode = null;
let musicTimer = 0;
let musicStep = 0;
let musicGain = null;

function setMusicMode(mode) {
  if (musicMode === mode) return;
  musicMode = mode;
  musicStep = 0;
  clearInterval(musicTimer);
  musicTimer = 0;
  if (mode && !muted) unlockAudio();
  else syncMusicPlayback();
}

function syncMusicPlayback() {
  if (!audioContext) return;
  if (musicGain) {
    const now = audioContext.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(muted || !musicMode ? 0 : 0.32, now, 0.12);
  }
  if (muted || !musicMode || audioContext.state !== 'running') {
    clearInterval(musicTimer);
    musicTimer = 0;
    return;
  }
  if (!musicGain) {
    musicGain = audioContext.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(audioContext.destination);
    musicGain.gain.setTargetAtTime(0.32, audioContext.currentTime, 0.2);
  }
  if (musicTimer) return;
  const titleNotes = [659, 784, 880, 784, 698, 587, 523, 587];
  const lobbyNotes = [392, 523, 659, 523, 440, 587, 698, 587];
  const matchNotes = [523, 659, 784, 659, 587, 698, 880, 698];
  const notes = musicMode === 'TITLE' ? titleNotes : musicMode === 'LOBBY' ? lobbyNotes : matchNotes;
  const interval = musicMode === 'TITLE' ? 590 : musicMode === 'LOBBY' ? 520 : 390;
  musicTimer = window.setInterval(() => {
    if (!audioContext || audioContext.state !== 'running' || muted || !musicMode) return;
    const now = audioContext.currentTime;
    const note = notes[musicStep % notes.length];
    const playTone = (frequency, duration, volume, type) => {
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.linearRampToValueAtTime(volume, now + 0.035);
      envelope.gain.setTargetAtTime(0.0001, now + duration * 0.55, duration * 0.22);
      oscillator.connect(envelope);
      envelope.connect(musicGain);
      oscillator.start(now);
      oscillator.stop(now + duration);
    };
    playTone(note, 0.3, 0.12, 'sine');
    if (musicStep % 2 === 0) playTone(note / 2, 0.48, 0.085, 'triangle');
    if (musicStep % 4 === 0) playTone(note * 1.5, 0.18, 0.035, 'sine');
    musicStep = (musicStep + 1) % notes.length;
  }, interval);
}
function playImpactSound(critical) {
  if (muted) return;
  try {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return;
    audioContext ||= new AudioContextType();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = critical ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(critical ? 660 : 280, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(critical ? 180 : 120, audioContext.currentTime + 0.14);
    gain.gain.setValueAtTime(critical ? 0.16 : 0.07, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.17);
  } catch { /* Audio is optional when the browser blocks playback. */ }
}

function updateEffects(list = []) {
  for (const effect of list) {
    if (seenEffectIds.has(effect.id)) continue;
    seenEffectIds.add(effect.id);
    if (seenEffectIds.size > 160) seenEffectIds.clear();
    if (effect.type === 'throwStart') {
      if (effect.playerId !== myId) dispatchGameEvent('onThrowStart', { playerId: effect.playerId, local: false });
      continue;
    }
    if (effect.type === 'throwRelease') {
      dispatchGameEvent('onThrowRelease', { playerId: effect.playerId, local: effect.playerId === myId,
        critical: Boolean(effect.critical), x: effect.x, z: effect.z });
      continue;
    }
    if (effect.type === 'dash') {
      dispatchGameEvent('onDash', { playerId: effect.playerId, local: effect.playerId === myId });
      continue;
    }
    if (effect.type === 'stance') {
      const player = currentRoom?.players?.find(candidate => candidate.id === effect.playerId);
      dispatchGameEvent('onStanceChange', { playerId: effect.playerId, local: effect.playerId === myId,
        movementState: player?.movementState || 'STANDING' });
      continue;
    }
    if (effect.type === 'respawn') {
      dispatchGameEvent('onRespawn', { playerId: effect.playerId, x: effect.x, z: effect.z });
      continue;
    }
    const critical = effect.type === 'criticalHit';
    if (effect.type === 'criticalHit' || effect.type === 'snowballHit') {
      dispatchGameEvent('onHit', { playerId: effect.playerId, critical, x: effect.x, z: effect.z });
      if (effect.ownerId === myId) {
        const marker = $('#hit-marker');
        marker.classList.toggle('critical', critical);
        marker.classList.remove('show');
        void marker.offsetWidth;
        marker.classList.add('show');
        setTimeout(() => marker.classList.remove('show'), 320);
      }
    }
    const localPlayer = players.get(myId);
    if (critical && localPlayer && Math.hypot(localPlayer.group.position.x - effect.x, localPlayer.group.position.z - effect.z) < (effect.radius || 0.8) + 2) {
      $('#damage-flash').classList.add('show');
      setTimeout(() => $('#damage-flash').classList.remove('show'), 280);
    }
    const damageLabel = document.createElement('div');
    damageLabel.className = `damage-number${critical ? ' critical' : ''}`;
    damageLabel.textContent = critical ? 'CRITICAL!' : effect.type === 'powerUp' ? 'PICKUP!' : 'HIT!';
    const screenPoint = new THREE.Vector3(effect.x, 2.8, effect.z).project(camera);
    if (Math.abs(screenPoint.x) <= 1.15 && Math.abs(screenPoint.y) <= 1.15) {
      damageLabel.style.left = `${(screenPoint.x * 0.5 + 0.5) * innerWidth}px`;
      damageLabel.style.top = `${(-screenPoint.y * 0.5 + 0.5) * innerHeight}px`;
      document.body.append(damageLabel);
      setTimeout(() => damageLabel.remove(), 650);
    }
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: critical ? '#ffd04f' : '#c6f4ff', transparent: true, opacity: 0.82, depthWrite: false });
    const flash = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), material);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: critical ? '#ff8c42' : '#e8fbff', transparent: true, opacity: 0.9, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.5, effect.radius || 0.8), 0.08, 4, 16), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.2;
    group.add(flash, ring);
    group.position.set(effect.x, 1.5, effect.z);
    scene.add(group);
    impactEffects.set(effect.id, { group, start: performance.now(), material, ringMaterial });
    if (effect.type === 'powerUp') playArcadeSound('pickup');
    else playImpactSound(critical);
  }
}

function escapeText(text) {
  const span = document.createElement('span');
  span.textContent = text;
  return span.innerHTML;
}

function renderRoom(room) {
  if (room.arena) renderArena(room.arena);
  room.arena = currentArena;
  currentRoom = room;
  if (screenFlow.state !== ScreenState.QUIT_CONFIRM && screenFlow.state !== ScreenState.THANKS) {
    if (room.status === 'LOBBY' && screenFlow.state === ScreenState.MENU) screenFlow.enterLobby();
    else if (room.status === 'LOBBY' && screenFlow.state === ScreenState.GAME) {
      screenFlow.roomLeft();
      screenFlow.enterLobby();
    } else if (room.status === 'IN_GAME' && screenFlow.state === ScreenState.LOBBY) screenFlow.enterGame();
    syncScreenVisibility();
  }
  movementConfig = room.movementConfig || DEFAULT_MOVEMENT_CONFIG;
  roomMenu.hidden = true;
  lobbyView.hidden = false;
  requestAnimationFrame(resizeRenderers);
  minimapWrap.hidden = false;
  setMenuAvatarVisible(false);
  $('#room-code-label').textContent = room.roomCode;
  $('#room-code-mini').textContent = room.roomCode;
  setMusicMode(room.status === 'LOBBY' ? 'LOBBY' : room.status === 'IN_GAME' ? 'MATCH' : null);
  $('#room-corner-label').textContent = room.status === 'IN_GAME' ? 'PLAYERS' : 'ROOM';
  $('#room-settings-label').textContent = `${room.players.length}/${room.maxPlayers} players  |  First to ${room.scoreGoal}  |  ${room.arena?.title || 'Christmas Arena'}  |  ${room.status === 'LOBBY' ? 'Lobby' : 'Match started'}`;
  if (room.status !== 'IN_GAME') {
    const list = $('#player-list');
    list.replaceChildren();
    for (const player of room.players) {
      const row = document.createElement('div');
      row.className = 'room-player';
      row.style.setProperty('--player-color', player.color);
      const identity = document.createElement('span');
      identity.textContent = player.name + (player.host ? ' (Host)' : '');
      const ready = document.createElement('small');
      ready.className = player.ready ? 'ready-pill' : '';
      ready.textContent = player.ready ? 'READY' : 'NOT READY';
      row.append(identity, ready);
      list.append(row);
    }
  }
  const self = room.players.find(player => player.id === myId);
  $('#ready-toggle').textContent = self?.ready ? 'CANCEL READY' : 'READY';
  $('#ready-toggle').disabled = room.status !== 'LOBBY';
  const start = $('#start-match');
  start.hidden = !self?.host;
  start.disabled = !room.canStart;
  start.textContent = room.status === 'IN_GAME' ? 'MATCH STARTED' : 'START MATCH';
  const previousGameStatus = gameStatus;
  gameStatus = room.status;
  if (room.status === 'IN_GAME' && previousGameStatus !== 'IN_GAME') {
    $('#room-corner').classList.remove('collapsed');
    $('#room-corner-toggle').setAttribute('aria-expanded', 'true');
    crouchToggled = false;
    mobileDashUntil = 0;
    keys.delete('c');
    keys.delete('control');
    keys.delete('shift');
  }
  if (room.status !== 'IN_GAME') {
    $('#room-corner').classList.add('collapsed');
    $('#room-corner-toggle').setAttribute('aria-expanded', 'false');
  }
  $('#match-hud').hidden = room.status !== 'IN_GAME';
  const touchMatch = room.status === 'IN_GAME' && touchDevice;
  $('#desktop-pause').hidden = room.status !== 'IN_GAME' || touchMatch;
  $('#match-fullscreen').hidden = room.status !== 'IN_GAME' || touchMatch;
  $('#mobile-fullscreen').hidden = !touchMatch;
  $('#menu-fullscreen').hidden = room.status === 'IN_GAME';
  minimapWrap.hidden = room.status === 'IN_GAME' ? minimapWrap.hidden : false;
  $('#customize-controls-open').hidden = !touchDevice || room.status !== 'IN_GAME';
  mobileControls.hidden = !touchMatch;
  if (touchMatch) scheduleViewportLayout();
  document.body.classList.toggle('game-active', room.status === 'IN_GAME');
  document.body.classList.toggle('touch-match', touchMatch);
  updateRotateHint();
  $('#roster').classList.toggle('roster-in-match', room.status === 'IN_GAME');
  if (room.status !== 'IN_GAME') { paused = false; $('#pause-menu').hidden = true; }
  if (room.status !== 'IN_GAME') {
    releaseMobileThrow();
    resetJoystick();
  }
  const resultView = $('#results-view');
  const isResults = room.status === 'RESULTS';
  resultView.hidden = !isResults;
  $('#lobby-content').hidden = isResults;
  if (isResults) {
    const winner = room.players.find(player => player.id === room.winnerId);
    $('#results-winner').textContent = winner ? `${winner.name} wins!` : 'Match complete';
    $('#results-summary').textContent = `First to ${room.scoreGoal} points`;
    const sorted = [...room.players].sort((a, b) => (b.score || 0) - (a.score || 0));
    $('#results-scoreboard').replaceChildren(...sorted.map((player, index) => {
      const row = document.createElement('div');
      row.className = `results-row${player.id === room.winnerId ? ' winner' : ''}`;
      const place = document.createElement('span');
      place.textContent = `#${index + 1}`;
      const name = document.createElement('strong');
      name.textContent = player.name;
      const score = document.createElement('b');
      score.textContent = `${player.score || 0} PTS`;
      row.append(place, name, score);
      return row;
    }));
    const host = room.hostId === myId;
    $('#restart-match').hidden = !host;
    $('#back-to-lobby').hidden = !host;
    $('#results-host-note').textContent = host ? 'Choose a rematch or return everyone to the lobby.' : 'Waiting for the host to choose what happens next.';
    const resultKey = `${room.roomCode}:${room.winnerId}`;
    if (lastResultsHandled !== resultKey) {
      lastResultsHandled = resultKey;
      accountRequest('/profile').then(profile => {
        currentProfile = profile;
        const achievements = profile.achievements.length ? profile.achievements.join(', ') : 'None yet';
        $('#profile-stats').textContent = `Wins: ${profile.wins}\nTotal score: ${profile.totalScore}\nGames played: ${profile.gamesPlayed}\nAchievements: ${achievements}`;
      }).catch(() => {});
    }
  } else {
    lastResultsHandled = null;
  }
  if (room.status === 'IN_GAME') {
    status.textContent = `ROOM ${room.roomCode} - MATCH READY`;
    accountMessage.textContent = 'Battle live: tap Space to throw, or hold Space and release for a critical snowball.';
  } else {
    status.textContent = `ROOM ${room.roomCode} - LOBBY`;
  }
  updatePlayers(room.players);
  updateSnowballs(room.snowballs || []);
  updateEffects(room.effects || []);
  const localState = room.players.find(player => player.id === myId);
  if (localState) {
    const zone = room.arena?.zones?.find(candidate => Math.abs(localState.x - candidate.x) <= candidate.width / 2 && Math.abs(localState.z - candidate.z) <= candidate.depth / 2);
    if (zone?.name && zone.name !== lastZoneName) {
      lastZoneName = zone.name;
      $('#zone-toast').textContent = zone.name.toUpperCase();
      $('#zone-toast').classList.add('show');
      clearTimeout(zoneToastTimer); zoneToastTimer = setTimeout(() => $('#zone-toast').classList.remove('show'), 1700);
    }
    const health = THREE.MathUtils.clamp(localState.health ?? 100, 0, 100);
    $('#match-health-fill').style.width = `${health}%`;
    $('#match-health-fill').style.background = health > 55 ? '#66e29b' : health > 25 ? '#ffd05c' : '#ff6472';
    $('#match-health-value').textContent = health <= 0 ? 'DOWN' : `${Math.ceil(health)}`;
    const charge = THREE.MathUtils.clamp(localState.charge || 0, 0, 1);
    const stance = localState.movementState || 'STANDING';
    const stanceLabels = { STANDING: ['●', 'STAND'], CROUCHING: ['▾', 'CROUCH'], DASHING: ['➤', 'DASH'] };
    const [stanceIcon, stanceLabel] = stanceLabels[stance] || stanceLabels.STANDING;
    $('#stance-icon').textContent = stanceIcon;
    $('#stance-label').textContent = stanceLabel;
    const dashCooldown = movementConfig.dashCooldownSeconds || 2.5;
    const dashRemaining = THREE.MathUtils.clamp(Number(localState.dashCooldownSeconds) || 0, 0, dashCooldown);
    const dashCooldownRatio = dashCooldown > 0 ? dashRemaining / dashCooldown : 0;
    $('#dash-indicator').style.setProperty('--dash-cooldown', String(dashCooldownRatio));
    $('#mobile-dash').style.setProperty('--dash-cooldown', String(dashCooldownRatio));
    $('#mobile-dash-time').textContent = dashRemaining > 0 ? dashRemaining.toFixed(1) : 'READY';
    $('#mobile-crouch').classList.toggle('active', localState.stanceState === 'CROUCHING');
    $('#mobile-crouch').setAttribute('aria-pressed', String(localState.stanceState === 'CROUCHING'));
    localChargeRatio = charge;
    $('#crosshair').style.setProperty('--charge-progress', `${charge * 100}%`);
    $('#crosshair').classList.toggle('charging', Boolean(localState.charging));
    $('#crosshair').classList.toggle('fully-charged', charge >= 0.99);
    $('#charge-fill').style.width = `${charge * 100}%`;
    $('#match-charge').hidden = !localState.charging;
    $('#charge-label').textContent = charge >= 1 ? 'CRITICAL' : 'CHARGING';
    const powerupStatus = $('#powerup-status');
    powerupStatus.replaceChildren();
    const giftInfo = { speed: ['↟', '#ef5364'], strong: ['✦', '#57c985'], shield: ['◇', '#55b9f5'], heal: ['+', '#f2c14f'] };
    for (const [key, value] of Object.entries(localState.powerUpStatus || {})) {
      if (key === 'extraLives' || !(value > 0) || !giftInfo[key]) continue;
      const [symbol, color] = giftInfo[key];
      const chip = document.createElement('span'); chip.className = 'powerup-chip'; chip.style.setProperty('--gift-color', color);
      chip.style.setProperty('--gift-progress', `${THREE.MathUtils.clamp(Number(value) / 8, 0, 1) * 100}%`);
      const icon = document.createElement('b'); icon.textContent = symbol;
      const timer = document.createElement('small'); timer.textContent = `${Math.ceil(value)}s`;
      chip.append(icon, timer); powerupStatus.append(chip);
    }
    if (localState.powerUpStatus?.extraLives) {
      const chip = document.createElement('span'); chip.className = 'powerup-chip'; chip.style.setProperty('--gift-color', '#ad78e8');
      chip.innerHTML = `<b>★</b><small>×${Number(localState.powerUpStatus.extraLives)}</small>`; powerupStatus.append(chip);
    }
  }
  $('#match-scores').textContent = `${room.players.map(player => `${player.name} ${player.score || 0}`).join(' / ')} — FIRST TO ${room.scoreGoal}`;
  updatePowerUps(room.powerUps || []);
}

function returnToRoomMenu(message = 'You left the room.') {
  releaseMobileThrow();
  setMusicMode(null);
  resetJoystick();
  currentRoom = null;
  gameStatus = 'MENU';
  if ([ScreenState.LOBBY, ScreenState.GAME].includes(screenFlow.state)) screenFlow.roomLeft();
  lobbyView.hidden = true;
  roomMenu.hidden = false;
  minimapWrap.hidden = true;
  $('#match-hud').hidden = true;
  $('#match-fullscreen').hidden = true;
  $('#menu-fullscreen').hidden = false;
  $('#desktop-pause').hidden = true;
  mobileControls.hidden = true;
  crouchToggled = false;
  mobileDashUntil = 0;
  document.body.classList.remove('touch-match');
  document.body.classList.remove('game-active');
  setMenuAvatarVisible(true);
  updatePlayers([]);
  updatePowerUps([]);
  status.textContent = socket?.readyState === WebSocket.OPEN ? 'CONNECTED - HOST OR JOIN A ROOM' : 'LOG IN TO PLAY';
  accountMessage.textContent = message;
  syncScreenVisibility();
}

function connect(takeOver = false) {
  const token = sessionStorage.getItem('snowmanSession');
  if (!token || (!takeOver && socketRejected) || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
  if (takeOver) socketRejected = false;
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const connection = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}${takeOver ? '&takeover=true' : ''}`);
  socket = connection;
  connection.addEventListener('open', () => {
    status.textContent = 'CONNECTED - HOST OR JOIN A ROOM';
    status.style.color = '#a8f2cb';
  });
  connection.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.type === 'welcome') {
      myId = message.id;
      $('#duplicate-session-notice').hidden = true;
      return;
    }
    if (message.type === 'roomState') {
      renderRoom(message);
      return;
    }
    if (message.type === 'roomLeft') {
      returnToRoomMenu();
      return;
    }
    if (message.type === 'error') {
      if (message.code === 'DUPLICATE_SESSION') {
        socketRejected = true;
        $('#duplicate-session-notice').hidden = false;
      }
      status.textContent = message.message;
      accountMessage.textContent = message.message;
    }
  });
  connection.addEventListener('close', () => {
    if (socket !== connection) return;
    if (!sessionStorage.getItem('snowmanSession') || socketRejected) return;
    status.textContent = 'DISCONNECTED - RECONNECTING';
    setTimeout(connect, 1800);
  });
  connection.addEventListener('error', () => { status.textContent = 'SERVER NOT REACHABLE'; });
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function syncScreenVisibility(animateTitle = true) {
  const state = screenFlow.state;
  const quitReturnState = state === ScreenState.QUIT_CONFIRM ? screenFlow.returnState : null;
  const titleActive = state === ScreenState.TITLE || quitReturnState === ScreenState.TITLE;
  const loginActive = state === ScreenState.LOGIN || quitReturnState === ScreenState.LOGIN;
  const profileActive = [ScreenState.MENU, ScreenState.LOBBY, ScreenState.GAME].includes(state)
    || [ScreenState.MENU, ScreenState.LOBBY, ScreenState.GAME].includes(quitReturnState);
  document.body.classList.toggle('title-active', titleActive);
  document.body.classList.toggle('login-active', loginActive);
  document.body.classList.toggle('logged-in', profileActive);
  accountPanel.hidden = !(loginActive || profileActive);
  authView.hidden = !loginActive;
  profileView.hidden = !profileActive;
  thanksScreen.hidden = state !== ScreenState.THANKS;

  if (titleActive) {
    clearTimeout(titleHideTimer);
    titleScreen.hidden = false;
    titleScreen.inert = false;
    titleScreen.classList.remove('is-leaving');
    titleScene?.show();
  } else if (!titleScreen.hidden && !titleScreen.classList.contains('is-leaving')) {
    titleScreen.inert = true;
    titleScreen.classList.add('is-leaving');
    titleHideTimer = window.setTimeout(() => {
      if (screenFlow.state === ScreenState.TITLE
        || (screenFlow.state === ScreenState.QUIT_CONFIRM && screenFlow.returnState === ScreenState.TITLE)) return;
      titleScreen.hidden = true;
      titleScreen.classList.remove('is-leaving');
      titleScene?.hide();
    }, animateTitle ? 430 : 0);
  }
}

function openLoginScreen(message = 'Log in to open your saved profile.') {
  setMusicMode(null);
  if (screenFlow.state === ScreenState.TITLE) screenFlow.play(false);
  authView.hidden = false;
  profileView.hidden = true;
  roomMenu.hidden = false;
  lobbyView.hidden = true;
  accountMessage.textContent = message;
  syncScreenVisibility();
  $('#account-username').focus({ preventScroll: true });
}

syncScreenVisibility(false);

function showProfile(profile) {
  socketRejected = false;
  if (screenFlow.state === ScreenState.TITLE) screenFlow.play(true);
  else if (screenFlow.state === ScreenState.LOGIN) screenFlow.loginSucceeded();
  currentProfile = profile;
  currentProfile.snowmanLook ||= { hat: 'top-hat', scarf: 'classic', nose: 'carrot', arms: 'twigs', body: 'classic' };
  roomMenu.hidden = false;
  lobbyView.hidden = true;
  syncScreenVisibility();
  accountMessage.textContent = `Signed in as ${profile.username}.`;
  $('#profile-username').value = profile.username;
  const achievements = profile.achievements.length ? profile.achievements.join(', ') : 'None yet';
  $('#profile-stats').textContent = `Wins: ${profile.wins}\nTotal score: ${profile.totalScore}\nGames played: ${profile.gamesPlayed}\nAchievements: ${achievements}`;
  setLookControls(profile.snowmanLook, profile.snowmanColor);
  connect();
}

async function accountRequest(path, method = 'GET', body = null) {
  const headers = {};
  const token = sessionStorage.getItem('snowmanSession');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/accounts${path}`, { method, headers, body: body === null ? undefined : JSON.stringify(body) });
  if (response.status === 204) return null;
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'The account request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

$('#account-mode').addEventListener('click', () => {
  accountMode = accountMode === 'login' ? 'register' : 'login';
  $('#account-submit').textContent = accountMode === 'login' ? 'LOG IN' : 'REGISTER';
  $('#account-mode').textContent = accountMode === 'login' ? 'CREATE ACCOUNT' : 'BACK TO LOG IN';
  $('#account-password').autocomplete = accountMode === 'login' ? 'current-password' : 'new-password';
  accountMessage.textContent = accountMode === 'login' ? 'Log in to open your saved profile.' : 'Use a password with at least 8 characters.';
});

$('#account-form').addEventListener('submit', async event => {
  event.preventDefault();
  unlockAudio();
  enterFullscreen();
  try {
    const result = await accountRequest(accountMode === 'login' ? '/login' : '/register', 'POST', {
      username: $('#account-username').value,
      password: $('#account-password').value
    });
    sessionStorage.setItem('snowmanSession', result.token);
    $('#account-password').value = '';
    showProfile(result.profile);
  } catch (error) { accountMessage.textContent = error.message; }
});

$('#title-play').addEventListener('click', async () => {
  if (screenFlow.state !== ScreenState.TITLE) return;
  const button = $('#title-play');
  button.disabled = true;
  unlockAudio();
  setMusicMode('TITLE');
  playArcadeSound('pickup');
  titleScene?.bounce('play');
  const token = sessionStorage.getItem('snowmanSession');
  if (!token) {
    screenFlow.play(false);
    openLoginScreen();
    button.disabled = false;
    return;
  }
  try {
    const profile = await accountRequest('/profile');
    screenFlow.play(true);
    showProfile(profile);
  } catch (error) {
    if (error.status === 401 || error.status === 403) sessionStorage.removeItem('snowmanSession');
    screenFlow.play(false);
    openLoginScreen(error.status === 401 || error.status === 403
      ? 'Your saved sign-in expired. Log in to continue.'
      : `Could not restore your session. Log in when the server is available.`);
  } finally {
    button.disabled = false;
  }
});

$('#title-play').addEventListener('pointerenter', () => titleScene?.setHover('play', true, $('#title-play')));
$('#title-play').addEventListener('pointerleave', () => titleScene?.setHover('play', false, $('#title-play')));
$('#title-quit').addEventListener('pointerenter', () => titleScene?.setHover('quit', true, $('#title-quit')));
$('#title-quit').addEventListener('pointerleave', () => titleScene?.setHover('quit', false, $('#title-quit')));
$('#title-quit').addEventListener('click', requestQuit);
$('#pause-quit').addEventListener('click', requestQuit);
$('#title-fullscreen').addEventListener('click', toggleFullscreen);

const quitDialog = $('#quit-confirmation');
function requestQuit() {
  if (screenFlow.state === ScreenState.QUIT_CONFIRM || screenFlow.state === ScreenState.THANKS) return;
  screenFlow.requestQuit();
  syncScreenVisibility();
  if (!quitDialog.open) quitDialog.showModal();
  $('#quit-cancel').focus({ preventScroll: true });
}

function cancelQuit() {
  if (quitDialog.open) quitDialog.close();
  if (screenFlow.state === ScreenState.QUIT_CONFIRM) screenFlow.cancelQuit();
  syncScreenVisibility();
}

quitDialog.addEventListener('cancel', event => { event.preventDefault(); cancelQuit(); });
$('#quit-cancel').addEventListener('click', cancelQuit);
$('#quit-confirm').addEventListener('click', async () => {
  if (screenFlow.state !== ScreenState.QUIT_CONFIRM) return;
  if (quitDialog.open) quitDialog.close();
  const wasInRoom = Boolean(currentRoom);
  if (wasInRoom) {
    send({ type: 'leave' });
    await new Promise(resolve => window.setTimeout(resolve, 140));
  }
  if (sessionStorage.getItem('snowmanSession')) {
    try { await accountRequest('/logout', 'POST'); }
    catch (error) { console.warn('[Snowman quit] Sign-out request did not complete:', error.message); }
  }
  setMusicMode(null);
  sessionStorage.removeItem('snowmanSession');
  socketRejected = true;
  socket?.close(1000, 'quit');
  socket = null;
  myId = null;
  currentProfile = null;
  currentRoom = null;
  gameStatus = 'MENU';
  paused = false;
  releaseMobileThrow();
  resetJoystick();
  updatePlayers([]);
  updatePowerUps([]);
  document.body.classList.remove('game-active', 'touch-match');
  mobileControls.hidden = true;
  minimapWrap.hidden = true;
  $('#match-hud').hidden = true;
  $('#desktop-pause').hidden = true;
  $('#match-fullscreen').hidden = true;
  $('#pause-menu').hidden = true;
  screenFlow.confirmQuit();
  syncScreenVisibility(false);
  try { window.close(); } catch { /* The thanks view is the supported in-page exit. */ }
  if (!window.closed) {
    thanksScreen.hidden = false;
    $('#play-again').focus({ preventScroll: true });
  }
});

$('#play-again').addEventListener('click', () => {
  if (screenFlow.state !== ScreenState.THANKS) return;
  screenFlow.playAgain();
  status.textContent = 'LOG IN TO PLAY';
  accountMessage.textContent = 'Register or log in to save your profile.';
  syncScreenVisibility();
});

$('#profile-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const profile = await accountRequest('/profile', 'PUT', {
      username: $('#profile-username').value,
      currentPassword: $('#current-password').value,
      newPassword: $('#new-password').value,
      snowmanColor: currentProfile.snowmanColor,
      snowmanLook: currentProfile.snowmanLook
    });
    $('#current-password').value = '';
    $('#new-password').value = '';
    showProfile(profile);
    accountMessage.textContent = 'Account profile saved.';
  } catch (error) { accountMessage.textContent = error.message; }
});

function resetToTitle(message) {
  setMusicMode(null);
  sessionStorage.removeItem('snowmanSession');
  socketRejected = true;
  socket?.close(1000, 'logout');
  socket = null;
  myId = null;
  currentProfile = null;
  currentRoom = null;
  gameStatus = 'MENU';
  paused = false;
  profileView.hidden = true;
  roomMenu.hidden = false;
  lobbyView.hidden = true;
  $('#pause-menu').hidden = true;
  $('#match-hud').hidden = true;
  $('#desktop-pause').hidden = true;
  $('#match-fullscreen').hidden = true;
  $('#menu-fullscreen').hidden = false;
  mobileControls.hidden = true;
  minimapWrap.hidden = true;
  document.body.classList.remove('game-active', 'touch-match');
  setMenuAvatarVisible(true);
  updatePlayers([]);
  updatePowerUps([]);
  if (screenFlow.state !== ScreenState.TITLE) screenFlow.logout();
  status.textContent = 'LOG IN TO PLAY';
  accountMessage.textContent = message;
  syncScreenVisibility();
}

$('#logout').addEventListener('click', async () => {
  try {
    await accountRequest('/logout', 'POST');
    resetToTitle('You are logged out.');
  } catch (error) { accountMessage.textContent = error.message; }
});

$('#delete-account').addEventListener('click', async () => {
  if (!confirm('Permanently delete this account and its saved profile?')) return;
  try {
    await accountRequest('/profile', 'DELETE', { password: $('#current-password').value });
    resetToTitle('Account deleted.');
  } catch (error) { accountMessage.textContent = error.message; }
});

$('#host-room').addEventListener('click', () => { unlockAudio(); enterFullscreen(); send({
  type: 'host',
  maxPlayers: Number($('#max-players').value),
  scoreGoal: Number($('#score-goal').value),
  mapSize: $('#map-size').value
}); });
$('#join-room').addEventListener('click', () => { unlockAudio(); send({ type: 'joinRoom', roomCode: $('#room-code-input').value.trim().toUpperCase() }); });
$('#room-code-input').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
$('#ready-toggle').addEventListener('click', () => {
  const self = currentRoom?.players.find(player => player.id === myId);
  send({ type: 'ready', ready: !self?.ready });
});
$('#start-match').addEventListener('click', () => { enterFullscreen(); send({ type: 'start' }); });
$('#restart-match').addEventListener('click', () => send({ type: 'restart' }));
$('#back-to-lobby').addEventListener('click', () => send({ type: 'backToLobby' }));
$('#leave-room').addEventListener('click', () => send({ type: 'leave' }));
const mobilePauseButton = $('#mobile-leave');
function openMobilePause() {
  if (gameStatus !== 'IN_GAME') return;
  paused = true;
  $('#pause-menu').hidden = false;
}
mobilePauseButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  mobilePauseButton.setPointerCapture(event.pointerId);
  openMobilePause();
});
mobilePauseButton.addEventListener('click', event => { if (event.detail === 0) openMobilePause(); });
$('#takeover-session').addEventListener('click', () => connect(true));
$('#dismiss-duplicate').addEventListener('click', () => { $('#duplicate-session-notice').hidden = true; });
$('#resume-game').addEventListener('click', () => { paused = false; $('#pause-menu').hidden = true; });
$('#desktop-pause').addEventListener('click', () => { paused = true; $('#pause-menu').hidden = false; });
$('#pause-leave').addEventListener('click', () => { paused = false; $('#pause-menu').hidden = true; send({ type: 'leave' }); });
$('#pause-logout').addEventListener('click', () => $('#logout').click());
$('#invert-x').checked = invertX;
$('#invert-x').addEventListener('change', event => { invertX = event.target.checked; localStorage.setItem('snowmanInvertX', String(invertX)); });
$('#invert-y').checked = invertY;
$('#invert-y').addEventListener('change', event => { invertY = event.target.checked; localStorage.setItem('snowmanInvertY', String(invertY)); });
$('#limit-vertical').checked = limitVerticalAngle;
$('#limit-vertical').addEventListener('change', event => { limitVerticalAngle = event.target.checked; localStorage.setItem('snowmanLimitVertical', String(limitVerticalAngle)); });
$('#graphics-quality').value = graphicsPreset;
$('#graphics-quality').addEventListener('change', event => {
  graphicsPreset = event.target.value; localStorage.setItem('snowmanGraphics', graphicsPreset);
  renderQuality = graphicsPreset === 'low' ? 0.42 : graphicsPreset === 'high' ? 0.82 : 0.62;
  applyArenaGraphicsPreset();
  resizeRenderers();
});
function syncSoundControls() {
  const menuSound = $('#mute-audio');
  const titleSound = $('#title-sound-toggle');
  menuSound.textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
  menuSound.setAttribute('aria-pressed', String(muted));
  titleSound.setAttribute('aria-pressed', String(muted));
  titleSound.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
  titleSound.querySelector('span').textContent = muted ? '♪̸' : '♫';
}
function toggleSound() {
  muted = !muted;
  safeStorageSet('snowmanMuted', String(muted));
  if (muted) syncMusicPlayback();
  else {
    unlockAudio();
    if (screenFlow.state === ScreenState.TITLE) setMusicMode('TITLE');
  }
  syncSoundControls();
}
syncSoundControls();
$('#mute-audio').addEventListener('click', toggleSound);
$('#title-sound-toggle').addEventListener('click', toggleSound);
function toggleAim() {
  aimMode = !aimMode;
  if (aimMode) {
    // Start shift-lock from the current camera heading so rotation is stable
    // before the first target ray resolves.
    aimYawCache = yaw;
    aimYawInitialized = true;
  }
  $('#aim-indicator').hidden = !aimMode;
  $('#aim-indicator').classList.toggle('visible', aimMode);
  $('#aim-shoulder-swap').hidden = !aimMode || !touchDevice;
  if (aimMode) setTimeout(() => { if (aimMode) $('#aim-indicator').classList.remove('visible'); }, 1600);
  $('#mobile-aim').classList.toggle('active', aimMode);
  $('#mobile-aim').setAttribute('aria-pressed', String(aimMode));
  if (!prefersMobileRendering() && aimMode) renderer.domElement.requestPointerLock?.();
  else if (document.pointerLockElement) document.exitPointerLock?.();
}
function swapAimShoulder() {
  aimShoulderSide *= -1;
}
$('#aim-shoulder-swap')?.addEventListener('pointerdown', event => {
  event.preventDefault(); event.stopPropagation(); swapAimShoulder();
});
$('#aim-shoulder-swap')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
window.addEventListener('keydown', event => {
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (!event.repeat && key === 'v' && gameStatus === 'IN_GAME') swapAimShoulder();
});
const mobileAimButton = $('#mobile-aim');
const aimPointers = new Set();
mobileAimButton.addEventListener('pointerdown', event => {
  if (controlEditMode || gameStatus !== 'IN_GAME' || paused || event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  mobileAimButton.setPointerCapture(event.pointerId);
  if (aimHoldMode) {
    aimPointers.add(event.pointerId);
    if (!aimMode) toggleAim();
  } else toggleAim();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) mobileAimButton.addEventListener(type, event => {
  event.preventDefault(); event.stopPropagation();
  if (aimPointers.delete(event.pointerId) && aimPointers.size === 0 && aimHoldMode && aimMode) toggleAim();
});
mobileAimButton.addEventListener('click', event => {
  // Preserve keyboard activation without depending on a synthesized touch click.
  if (event.detail === 0 && !controlEditMode && gameStatus === 'IN_GAME' && !paused && !aimHoldMode) toggleAim();
});
const crouchModeSelect = $('#crouch-mode');
crouchModeSelect.value = crouchMode;
crouchModeSelect.addEventListener('change', event => {
  crouchMode = event.target.value === 'toggle' ? 'toggle' : 'hold';
  localStorage.setItem('snowmanCrouchMode', crouchMode);
  crouchToggled = false;
});
const mobileCrouchButton = $('#mobile-crouch');
const crouchPointers = new Set();
mobileCrouchButton.addEventListener('pointerdown', event => {
  if (controlEditMode || event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  if (gameStatus !== 'IN_GAME' || paused) return;
  mobileCrouchButton.setPointerCapture(event.pointerId);
  if (crouchMode === 'toggle') crouchToggled = !crouchToggled;
  else { crouchPointers.add(event.pointerId); keys.add('c'); }
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) mobileCrouchButton.addEventListener(type, event => {
  event.preventDefault(); event.stopPropagation();
  if (crouchPointers.delete(event.pointerId) && crouchPointers.size === 0) keys.delete('c');
});
const mobileDashButton = $('#mobile-dash');
mobileDashButton.addEventListener('pointerdown', event => {
  if (controlEditMode || gameStatus !== 'IN_GAME' || paused || event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  mobileDashButton.setPointerCapture(event.pointerId);
  mobileDashUntil = performance.now() + 160;
});
mobileDashButton.addEventListener('click', event => {
  if (event.detail === 0 && !controlEditMode && gameStatus === 'IN_GAME' && !paused) mobileDashUntil = performance.now() + 160;
});
$('#room-corner-toggle').addEventListener('click', event => {
  const corner = $('#room-corner');
  const collapsed = corner.classList.toggle('collapsed');
  event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
});
$('#menu-fullscreen').addEventListener('click', toggleFullscreen);
$('#match-fullscreen').addEventListener('click', toggleFullscreen);
const mobileFullscreenButton = $('#mobile-fullscreen');
mobileFullscreenButton.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); event.stopPropagation();
  mobileFullscreenButton.setPointerCapture(event.pointerId);
  toggleFullscreen();
});
mobileFullscreenButton.addEventListener('click', event => { if (event.detail === 0) toggleFullscreen(); });
$('#pause-fullscreen').addEventListener('click', toggleFullscreen);
$('#dismiss-fullscreen-hint').addEventListener('click', () => { $('#fullscreen-hint').hidden = true; });
$('#dismiss-rotate-hint').addEventListener('click', () => { rotateHintDismissed = true; $('#rotate-hint').hidden = true; });
$('#minimap').addEventListener('pointerdown', event => { event.preventDefault(); $('#minimap-wrap').classList.add('expanded'); setTimeout(() => $('#minimap-wrap').classList.remove('expanded'), 2300); });
$('#minimap').addEventListener('dblclick', resetCamera);
document.addEventListener('fullscreenchange', () => scheduleViewportLayout());
document.addEventListener('webkitfullscreenchange', () => scheduleViewportLayout());
window.addEventListener('orientationchange', () => { scheduleViewportLayout(true); updateRotateHint(); });
screen.orientation?.addEventListener?.('change', () => { scheduleViewportLayout(true); updateRotateHint(); });
window.addEventListener('touchmove', event => {
  if (gameStatus === 'IN_GAME' && !event.target.closest?.('.pause-card, .control-editor-card')) event.preventDefault();
}, { passive: false });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && aimMode && !prefersMobileRendering()) { aimMode = false; $('#aim-indicator').hidden = true; } });
$('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(currentRoom?.roomCode || '');
    accountMessage.textContent = 'Room code copied.';
  } catch { accountMessage.textContent = `Share room code ${currentRoom?.roomCode || ''} with your friends.`; }
});

async function saveLook() {
  const look = readLookControls();
  const color = $('#look-color').value;
  currentProfile = { ...currentProfile, snowmanColor: color, snowmanLook: look };
  refreshPreview();
  try {
    currentProfile = await accountRequest('/profile', 'PUT', {
      snowmanColor: color,
      snowmanLook: look
    });
    send({ type: 'customize', color, look });
    accountMessage.textContent = 'Snowman look saved.';
  } catch (error) { accountMessage.textContent = error.message; }
}
$('#look-form').addEventListener('change', saveLook);

function drawMinimap(now = performance.now()) {
  if (minimapWrap.hidden || !currentRoom?.arena || now - minimapLastDraw < 50) return;
  minimapLastDraw = now;
  const ctx = minimapContext;
  const size = minimapCanvas.width;
  const center = size / 2;
  const edge = center - 12;
  const radius = 28;
  const scale = edge / radius;
  const self = currentRoom.players?.find(player => player.id === myId);
  if (!self) return;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const localPoint = (x, z) => {
    const dx = x - self.x, dz = z - self.z;
    return { x: center + (dx * cos - dz * sin) * scale,
      y: center - (dx * sin + dz * cos) * scale };
  };
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath(); ctx.arc(center, center, edge, 0, Math.PI * 2); ctx.clip();
  const background = ctx.createRadialGradient(center, center, 8, center, center, edge);
  background.addColorStop(0, '#e8f5f2'); background.addColorStop(1, '#b5d0d4');
  ctx.fillStyle = background; ctx.fillRect(0, 0, size, size);
  for (const wall of currentRoom.arena.walls || []) {
    const corners = [
      [wall.x - wall.width / 2, wall.z - wall.depth / 2], [wall.x + wall.width / 2, wall.z - wall.depth / 2],
      [wall.x + wall.width / 2, wall.z + wall.depth / 2], [wall.x - wall.width / 2, wall.z + wall.depth / 2]
    ].map(([x, z]) => localPoint(x, z));
    ctx.beginPath(); ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = wall.type === 'ICE_BLOCK' ? '#1684aa'
      : wall.type === 'PINE' ? '#347252'
        : ['BARRIER', 'SIDE_POST', 'PERIMETER', 'PILLAR'].includes(wall.type) ? '#647b87' : '#94653c';
    ctx.fill();
  }
  const arena = currentRoom.arena;
  for (const pad of arena.pads || []) {
    const corners = [[pad.x-pad.width/2,pad.z-pad.depth/2],[pad.x+pad.width/2,pad.z-pad.depth/2],
      [pad.x+pad.width/2,pad.z+pad.depth/2],[pad.x-pad.width/2,pad.z+pad.depth/2]].map(([x,z])=>localPoint(x,z));
    ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y);
    for (const corner of corners.slice(1)) ctx.lineTo(corner.x,corner.y);
    ctx.closePath(); ctx.fillStyle = pad.team === 'BLUE' ? 'rgba(45,166,230,.42)' : 'rgba(233,68,90,.42)'; ctx.fill();
  }
  if (arena.island) {
    const island = localPoint(arena.island.x, arena.island.z);
    ctx.beginPath(); ctx.arc(island.x, island.y, arena.island.radius * scale, 0, Math.PI * 2);
    ctx.fillStyle = '#d8e7f9'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  for (const pickup of currentRoom.powerUps || []) {
    const at = localPoint(pickup.x, pickup.z);
    if (Math.hypot(at.x - center, at.y - center) > edge) continue;
    ctx.fillStyle = ({ SPEED: '#ef5364', STRONG: '#57c985', SHIELD: '#55b9f5', HEAL: '#f2c14f', EXTRA_LIFE: '#ad78e8' })[pickup.type] || '#efb836';
    ctx.fillRect(at.x - 3.5, at.y - 2.8, 7, 6);
    ctx.fillRect(at.x - 4.2, at.y - 4.5, 8.4, 2.2);
    ctx.fillStyle = '#fff1cb'; ctx.fillRect(at.x - 0.7, at.y - 4.5, 1.4, 7.7); ctx.fillRect(at.x - 3.8, at.y - 1.2, 7.6, 1.4);
  }
  for (const player of currentRoom.players || []) {
    if (player.id === myId) continue;
    const at = localPoint(player.x, player.z);
    const dx = at.x - center, dy = at.y - center;
    const distance = Math.hypot(dx, dy);
    if (distance > edge - 6) {
      const angle = Math.atan2(dy, dx);
      const ex = center + Math.cos(angle) * (edge - 5), ey = center + Math.sin(angle) * (edge - 5);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(angle);
      ctx.fillStyle = player.color; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill(); ctx.restore();
    } else {
      ctx.fillStyle = player.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(at.x, at.y, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
  const facing = self.yaw - yaw;
  ctx.save(); ctx.translate(center, center); ctx.rotate(facing);
  ctx.fillStyle = '#10283d'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(-5, 5); ctx.lineTo(0, 3); ctx.lineTo(5, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  const northX = center + Math.sin(yaw) * (edge - 9), northY = center + Math.cos(yaw) * (edge - 9);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', northX, northY);
  ctx.restore();
  ctx.strokeStyle = '#d6f8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(center, center, edge, 0, Math.PI * 2); ctx.stroke();
}

function setJoystickFromPointer(event) {
  const base = $('#mobile-joystick').getBoundingClientRect();
  const centerX = base.left + base.width / 2;
  const centerY = base.top + base.height / 2;
  const radius = base.width * 0.37;
  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;
  const length = Math.hypot(dx, dy);
  if (length > radius) {
    dx *= radius / length;
    dy *= radius / length;
  }
  const deadZone = radius * 0.12;
  const adjustedLength = Math.hypot(dx, dy);
  const strength = adjustedLength <= deadZone ? 0 : (adjustedLength - deadZone) / (radius - deadZone);
  joystick.x = adjustedLength ? dx / adjustedLength * strength : 0;
  joystick.y = adjustedLength ? -dy / adjustedLength * strength : 0;
  $('#joystick-stick').style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function resetJoystick() {
  joystick.x = joystick.y = 0;
  joystick.pointerId = null;
  $('#joystick-stick').style.transform = 'translate(-50%,-50%)';
}

function unlockAudio() {
  try {
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextType) return;
    audioContext ||= new AudioContextType();
    if (audioContext.state === 'suspended') audioContext.resume().then(syncMusicPlayback).catch(() => {});
    else syncMusicPlayback();
  } catch { /* Audio is optional when the browser blocks playback. */ }
}

function playArcadeSound(kind) {
  if (muted) return;
  unlockAudio();
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const notesByKind = {
    pickup: [520, 780], critical: [660, 440, 220], throw: [330, 210],
    dash: [180, 520, 210], crouch: [240, 190], scoop: [300, 390]
  };
  const notes = notesByKind[kind] || [260, 150];
  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = now + index * 0.065;
    oscillator.type = kind === 'critical' ? 'sawtooth' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * 0.72), start + 0.11);
    const volume = kind === 'critical' ? 0.07 : kind === 'dash' ? 0.055 : 0.04;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + (kind === 'dash' ? 0.18 : 0.12));
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + (kind === 'dash' ? 0.19 : 0.13));
  });
}

function releaseMobileThrow() {
  if (!mobileThrowHeld) return;
  mobileThrowHeld = false;
  mobileThrowPointerId = null;
  $('#mobile-throw').classList.remove('charging');
  sendThrow();
}

function sendThrow() {
  // Refresh the camera ray at input release so throw direction cannot use a
  // stale wind-up sample or the previous animation frame's camera matrices.
  const local = players.get(myId);
  if (local && gameStatus === 'IN_GAME') {
    // Put the local rig at the release pose before reading its actual hand anchor.
    local.isCharging = false;
    local.throwReleaseStartedAt = performance.now() - SNOWMAN_CONFIG.animation.throwReleaseStart * 1000;
    local.throwStartedAt = local.throwReleaseStartedAt;
    updateSnowmanAnimation(local, performance.now(), 0, 0);
    local.group.updateMatrixWorld(true);
    const focus = cameraFocusInitialized ? smoothedCameraFocus : local.group.position.clone()
      .add(new THREE.Vector3(0, local.visualHeight * 0.57, 0));
    placeOrbitCamera(focus, 1 / 60, aimMode ? 1.15 : 0, aimMode ? 12 : 8, local.stanceState || 'STANDING');
    refreshAimPoint(local, 0);
  }
  // Send the release-frame direction, not a client-authored world hit point.
  // The server rebuilds the throw from its own hand origin and these angles.
  send({ type: 'throw', aimYaw: aimYawCache, aimPitch: aimPitchCache });
}

const joystickElement = $('#mobile-joystick');
joystickElement.addEventListener('pointerdown', event => {
  if (controlEditMode) return;
  event.preventDefault();
  event.stopPropagation();
  if (joystick.pointerId !== null) return;
  joystick.pointerId = event.pointerId;
  joystickElement.setPointerCapture(event.pointerId);
  setJoystickFromPointer(event);
});
joystickElement.addEventListener('pointermove', event => {
  if (joystick.pointerId !== event.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  setJoystickFromPointer(event);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  joystickElement.addEventListener(type, event => {
    if (joystick.pointerId !== null && event.pointerId !== joystick.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resetJoystick();
  });
}

const mobileThrowButton = $('#mobile-throw');
mobileThrowButton.addEventListener('pointerdown', event => {
  if (controlEditMode) return;
  event.preventDefault();
  event.stopPropagation();
  if (gameStatus !== 'IN_GAME' || mobileThrowHeld) return;
  unlockAudio();
  mobileThrowHeld = true;
  mobileThrowPointerId = event.pointerId;
  mobileThrowButton.classList.add('charging');
  mobileThrowButton.setPointerCapture(event.pointerId);
  send({ type: 'chargeStart' });
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  mobileThrowButton.addEventListener(type, event => {
    event.preventDefault();
    event.stopPropagation();
    if (mobileThrowPointerId !== null && event.pointerId !== mobileThrowPointerId) return;
    releaseMobileThrow();
  });
}

window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea,button')) return;
  // Mobile and synthetic keyboard events may omit KeyboardEvent.key.
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (key === 'escape' && gameStatus === 'IN_GAME') {
    if (aimMode) { aimMode = false; $('#aim-indicator').hidden = true; if (document.pointerLockElement) document.exitPointerLock(); }
    else { paused = !paused; $('#pause-menu').hidden = !paused; }
    return;
  }
  if (key === 'q' && gameStatus === 'IN_GAME' && !event.repeat) { event.preventDefault(); toggleAim(); return; }
  if (['arrowup','arrowdown','arrowleft','arrowright',' ','shift','control'].includes(key)) event.preventDefault();
  if (key === 'c' || key === 'control') {
    if (gameStatus === 'IN_GAME' && crouchMode === 'toggle' && !event.repeat) crouchToggled = !crouchToggled;
    else if (gameStatus === 'IN_GAME') keys.add(key);
    return;
  }
  if (key === ' ' && !keys.has(key) && gameStatus === 'IN_GAME') {
    unlockAudio();
    send({ type: 'chargeStart' });
  }
  keys.add(key);
});
window.addEventListener('keyup', event => {
  const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
  if (key === ' ' && keys.has(key) && gameStatus === 'IN_GAME') {
    sendThrow();
  }
  keys.delete(key);
});
window.addEventListener('blur', () => {
  if (keys.has(' ') && gameStatus === 'IN_GAME') {
    sendThrow();
  }
  releaseMobileThrow();
  resetJoystick();
  keys.clear();
});

let dragging = false;
let lastPointer = null;
let lookPointerId = null;
let mouseCharging = false;
let rightMouseAim = false;
for (const type of ['contextmenu', 'dragstart', 'selectstart']) {
  renderer.domElement.addEventListener(type, event => event.preventDefault());
  document.querySelector('.hud').addEventListener(type, event => event.preventDefault());
  document.querySelector('.account-panel').addEventListener(type, event => event.preventDefault());
}
renderer.domElement.addEventListener('mousedown', event => {
  event.preventDefault();
  if (gameStatus !== 'IN_GAME' || paused) return;
  if (event.button === 2) { rightMouseAim = true; if (!aimMode) toggleAim(); return; }
  if (event.button === 0 && !mouseCharging) { mouseCharging = true; unlockAudio(); send({ type: 'chargeStart' }); }
});
window.addEventListener('mouseup', event => {
  if (event.button === 2 && rightMouseAim) {
    rightMouseAim = false;
    if (aimMode) { aimMode = false; $('#aim-indicator').hidden = true; $('#mobile-aim').classList.remove('active'); if (document.pointerLockElement) document.exitPointerLock?.(); }
  }
  if (event.button === 0 && mouseCharging) { mouseCharging = false; sendThrow(); }
});
renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0 || event.pointerType === 'mouse' && gameStatus === 'IN_GAME') return;
  if (event.pointerType === 'touch' && event.clientX < innerWidth * 0.38) return;
  if (lookPointerId !== null) return;
  lookPointerId = event.pointerId;
  dragging = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(type, event => {
  if (event.pointerId !== lookPointerId) return;
  dragging = false; lastPointer = null; lookPointerId = null;
});
renderer.domElement.addEventListener('pointermove', event => {
  if (document.pointerLockElement === renderer.domElement) {
    applyCameraDrag(event.movementX, event.movementY);
    return;
  }
  if (!dragging || event.pointerId !== lookPointerId || !lastPointer) return;
  applyCameraDrag(event.clientX - lastPointer.x, event.clientY - lastPointer.y);
  lastPointer = { x: event.clientX, y: event.clientY };
});

const clock = new THREE.Clock();
function render(now) {
  let renderStage = 'frame setup';
  let sceneRendered = false;
  try {
  const dt = Math.min(clock.getDelta(), 0.05);
  renderStage = 'quality tuning';
  tuneRenderQuality(now);
  renderStage = 'player movement and animation';
  if (gameStatus === 'IN_GAME' && !paused && myId && now - lastInputSent > 50) {
    lastInputSent = now;
    const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown')) + joystick.y;
    const rightIntent = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft')) + joystick.x;
    const side = rightIntent;
    const direction = forward > 0.05 ? 'FORWARD' : forward < -0.05 ? 'BACK' : side > 0.05 ? 'RIGHT' : side < -0.05 ? 'LEFT' : '—';
    const inputYaw = aimMode ? aimYawCache : yaw;
    const worldX = -side * Math.cos(inputYaw) + forward * Math.sin(inputYaw);
    const worldZ = side * Math.sin(inputYaw) + forward * Math.cos(inputYaw);
    const moving = Math.hypot(worldX, worldZ) > 0.08;
    const ownPlayer = players.get(myId);
    const bodyYaw = aimMode ? aimYawCache
      : moving ? Math.atan2(worldX, worldZ) : (ownPlayer?.yaw ?? inputYaw);
    const arrow = (forward > 0.05 ? '↑' : forward < -0.05 ? '↓' : '') + (side > 0.05 ? '→' : side < -0.05 ? '←' : '');
    $('#controls-calibration').textContent = `MOVE ${arrow || '·'} ${direction} · WORLD ${worldX.toFixed(2)}, ${worldZ.toFixed(2)}`;
    const crouch = crouchMode === 'toggle' ? crouchToggled : keys.has('c') || keys.has('control');
    const dash = keys.has('shift') || now < mobileDashUntil;
    send({ type: 'input', moveX: side, moveZ: forward, moveYaw: inputYaw, yaw: bodyYaw,
      aimYaw: aimYawInitialized ? aimYawCache : inputYaw, aimPitch: aimPitchCache,
      aiming: aimMode, crouch, dash });
  }
  let local;
  for (const [id, player] of players) {
    const beforeX = player.group.position.x;
    const beforeZ = player.group.position.z;
    player.group.position.lerp(player.target, 1 - Math.exp(-12 * dt));
    const aimDelta = angleDiff(player.aimYaw, player.aimYawTarget);
    const aimStep = THREE.MathUtils.clamp(aimDelta, -AIM_CONFIG.yawTurnRate * 1.35 * dt,
      AIM_CONFIG.yawTurnRate * 1.35 * dt);
    player.aimYaw = Math.atan2(Math.sin(player.aimYaw + aimStep), Math.cos(player.aimYaw + aimStep));
    player.aimPitch += (player.aimPitchTarget - player.aimPitch) * (1 - Math.exp(-16 * dt));
    const yawDelta = angleDiff(player.group.rotation.y, player.yaw || 0);
    const yawStep = THREE.MathUtils.clamp(yawDelta, -AIM_CONFIG.yawTurnRate * dt, AIM_CONFIG.yawTurnRate * dt);
    player.group.rotation.y = Math.atan2(Math.sin(player.group.rotation.y + yawStep),
      Math.cos(player.group.rotation.y + yawStep));
    const travel = Math.hypot(player.group.position.x - beforeX, player.group.position.z - beforeZ);
    try {
      updateSnowmanAnimation(player, now, dt, travel);
    } catch (error) {
      // A malformed model must not prevent the camera, scene, or other players
      // from updating. Keep the error visible for diagnosis and skip this rig.
      reportClientError(`player animation / ${player.variantName || player.id}`, error);
    }
    const targetSurface = getArenaSurfaceHeight(player.group.position.x, player.group.position.z);
    player.arenaSurfaceY ??= 0;
    player.arenaSurfaceY += (targetSurface - player.arenaSurfaceY) * (1 - Math.exp(-12 * dt));
    player.group.position.y = player.arenaSurfaceY;
    if (id === myId) {
      local = player;
      const respawnProgress = player.respawnStartedAt ? THREE.MathUtils.clamp((now - player.respawnStartedAt) / 360, 0, 1) : 1;
      const respawnLift = respawnProgress < 1 ? Math.sin(respawnProgress * Math.PI) * 0.22 : 0;
      if (!player.knockedOut) player.group.position.y = player.arenaSurfaceY + respawnLift;
    }
  }
  const snowCenter = local?.group.position || menuAvatarGroup.position;
  const snowShiftX = snowCenter.x - previousSnowCenter.x;
  const snowShiftZ = snowCenter.z - previousSnowCenter.z;
  previousSnowCenter = { x: snowCenter.x, z: snowCenter.z };
  const snowPositions = snowfallGeometry.attributes.position;
  for (let index = 0; index < snowPositions.count; index++) {
    let x = snowPositions.getX(index) + snowShiftX;
    let y = snowPositions.getY(index) - dt * 2.5;
    let z = snowPositions.getZ(index) + snowShiftZ;
    if (y < 0) { x = snowCenter.x + (Math.random() - 0.5) * CHRISTMAS_ARENA.worldWidth; y = 15 + Math.random() * 5; z = snowCenter.z + (Math.random() - 0.5) * CHRISTMAS_ARENA.worldDepth; }
    snowPositions.setXYZ(index, x, y, z);
  }
  snowPositions.needsUpdate = true;
  if (local) {
    const target = local.group.position;
    const stance = local.stanceState || 'STANDING';
    const focusHeight = local.visualHeight * (stance === 'CROUCHING' ? 0.42 : 0.57);
    if (!cameraFocusInitialized) {
      smoothedCameraFocus.set(target.x, target.y + focusHeight, target.z);
      cameraFocusInitialized = true;
    } else {
      smoothedCameraFocus.x += (target.x - smoothedCameraFocus.x) * (1 - Math.exp(-8 * dt));
      smoothedCameraFocus.z += (target.z - smoothedCameraFocus.z) * (1 - Math.exp(-8 * dt));
      smoothedCameraFocus.y += (target.y + focusHeight - smoothedCameraFocus.y) * (1 - Math.exp(-6 * dt));
    }
    placeOrbitCamera(smoothedCameraFocus, dt, aimMode ? 1.15 : 0, aimMode ? 12 : 8, stance);
    camera.updateMatrixWorld(true);
    const dashTarget = local.movementState === 'DASHING' ? 1 : 0;
    cameraDashKick += (dashTarget - cameraDashKick) * (1 - Math.exp(-(dashTarget ? 18 : 5) * dt));
    const targetAimFov = cameraBaseFov - (aimMode ? 7 : 0);
    aimFov += (targetAimFov - aimFov) * (1 - Math.exp(-7 * dt));
    const nextFov = aimFov + cameraDashKick * 8;
    if (Math.abs(camera.fov - nextFov) > 0.02) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
    if (screenShakeStartedAt) {
      const shakeAge = (now - screenShakeStartedAt) / 320;
      if (shakeAge >= 1) screenShakeStartedAt = 0;
      else {
        const strength = (1 - shakeAge) * 0.12;
        camera.position.x += Math.sin(now * 0.09) * strength;
        camera.position.y += Math.cos(now * 0.11) * strength;
      }
    }
    refreshAimPoint(local, dt);
  } else {
    cameraFocusInitialized = false;
    cameraDashKick += (0 - cameraDashKick) * (1 - Math.exp(-5 * dt));
    const nextFov = cameraBaseFov + cameraDashKick * 8;
    if (Math.abs(camera.fov - nextFov) > 0.02) { camera.fov = nextFov; camera.updateProjectionMatrix(); }
    const target = menuAvatarGroup.position;
    const focus = target.clone().add(new THREE.Vector3(0, 2.2, 0));
    placeOrbitCamera(focus, dt);
  }
  renderStage = 'projectiles and effects';
  for (const item of snowballMeshes.values()) {
    if (item.justLaunched) item.justLaunched = false;
    else item.mesh.position.lerp(item.target, 1 - Math.exp(-40 * dt));
    const spawnProgress = THREE.MathUtils.clamp((now - item.spawnAt) / 150, 0, 1);
    const growth = 1 - Math.pow(1 - spawnProgress, 3);
    item.mesh.scale.setScalar(item.radius * (0.18 + 0.82 * growth));
    item.mesh.rotation.x += dt * 5;
    item.mesh.rotation.z += dt * 4;
  }
  for (const item of powerUpMeshes.values()) {
    const drop = THREE.MathUtils.clamp((now - item.bornAt) / 650, 0, 1);
    const near = [...players.values()].some(player => player.id === myId
      && Math.hypot(player.group.position.x - item.group.position.x, player.group.position.z - item.group.position.z) < 3.2);
    const remove = item.removingAt ? THREE.MathUtils.clamp((now - item.removingAt) / 420, 0, 1) : 0;
    item.group.position.y = (1 - drop) * 2.8 + Math.sin(now * 0.0028 + item.group.position.x) * (0.06 + (near ? 0.025 : 0));
    const scale = (drop < 1 ? 0.75 + 0.25 * Math.sin(drop * Math.PI / 2) : 1) * (near ? 1.06 + Math.sin(now * 0.009) * 0.06 : 1) * (1 - remove);
    item.group.scale.setScalar(scale);
    item.group.rotation.y += dt * (near ? 0.8 : 0.48);
    item.lidPivot.rotation.x = remove * 2.2;
    item.ring.rotation.z += dt * 0.65;
    item.ring.material.opacity = 0.48 + Math.sin(now * 0.004) * 0.16;
    item.sparkles.forEach((sparkle, index) => {
      sparkle.material.opacity = 0.35 + (Math.sin(now * 0.008 + index * 2) + 1) * 0.3;
      sparkle.scale.setScalar(0.7 + (Math.sin(now * 0.01 + index) + 1) * 0.35);
    });
    if (item.removingAt && remove >= 1) {
      scene.remove(item.group);
      item.group.traverse(object => { object.geometry?.dispose(); if (Array.isArray(object.material)) object.material.forEach(m => m.dispose()); else object.material?.dispose(); });
      powerUpMeshes.delete(item.id);
    }
  }
  for (const piece of giftConfetti) {
    const age = (now - piece.userData.bornAt) / 700;
    if (age >= 1) { scene.remove(piece); piece.geometry.dispose(); piece.material.dispose(); giftConfetti.delete(piece); continue; }
    piece.position.addScaledVector(piece.userData.velocity, dt);
    piece.userData.velocity.y -= dt * 5;
    piece.rotation.x += dt * 6; piece.rotation.z += dt * 8;
    piece.material.opacity = 1 - age;
  }
  for (const [id, effect] of impactEffects) {
    const age = (now - effect.start) / 520;
    if (age >= 1) {
      scene.remove(effect.group);
      effect.group.children.forEach(child => { child.geometry.dispose(); child.material.dispose(); });
      impactEffects.delete(id);
      continue;
    }
    effect.group.scale.setScalar(0.45 + age * 1.35);
    effect.material.opacity = (1 - age) * 0.8;
    effect.ringMaterial.opacity = (1 - age) * 0.9;
  }
  for (const trail of trailParticles) {
    const age = (now - trail.start) / (trail.lifetime || 320);
    if (age >= 1) { scene.remove(trail.particle); trailPool.push(trail); trailParticles.delete(trail); continue; }
    trail.material.opacity = (1 - age) * 0.72;
    trail.particle.scale.setScalar(1 - age * 0.55);
  }
  for (const print of footprintPool) {
    if (!print.mesh.visible) continue;
    const age = (now - print.bornAt) / 1700;
    if (age >= 1) { print.mesh.visible = false; continue; }
    print.mesh.material.opacity = 0.28 * (1 - age);
  }
  for (let index = dashStreaks.length - 1; index >= 0; index--) {
    const streak = dashStreaks[index];
    const age = (now - streak.start) / 240;
    if (age >= 1) {
      scene.remove(streak.group);
      streak.material.dispose();
      dashStreaks.splice(index, 1);
      continue;
    }
    streak.material.opacity = (1 - age) * 0.64;
    streak.group.scale.z = 1 + age * 1.8;
  }
  updateArenaVisualEffects(now);
  renderStage = 'menu snowman and minimap';
  if (menuAvatarGroup.visible) menuAvatarGroup.rotation.y = Math.sin(now * 0.0007) * 0.18;
  const idleBreath = Math.sin(now * 0.002) * 0.012;
  menuAvatarParts.torsoPivot.scale.y = 1 + idleBreath;
  menuAvatarParts.headPivot.rotation.y = Math.sin(now * 0.0007) * 0.07;
  menuAvatarParts.hatPivot.rotation.z = Math.sin(now * 0.003) * 0.035;
  if (menuAvatarParts.scarf) menuAvatarParts.scarf.rotation.set(Math.PI / 2, 0, Math.sin(now * 0.004) * 0.025);
  if (menuAvatarParts.scarfTailPivot) menuAvatarParts.scarfTailPivot.rotation.x = Math.sin(now * 0.003) * 0.08;
  drawMinimap(now);
  renderStage = 'main WebGL render';
  if (titleScreen.hidden) renderer.render(scene, camera);
  sceneRendered = true;
  renderStage = 'lobby preview render';
  if (previewGroup && !lobbyView.hidden && previewCanvas.getBoundingClientRect().width > 0) {
    if (!previewDragging) previewRotation += dt * 0.12;
    previewGroup.rotation.y = previewRotation;
    if (previewSnowman) {
      previewSnowman.torsoPivot.scale.y = 1 + idleBreath;
      previewSnowman.headPivot.rotation.y = Math.sin(now * 0.0007) * 0.07;
      previewSnowman.hatPivot.rotation.z = Math.sin(now * 0.003) * 0.035;
      if (previewSnowman.scarfTailPivot) previewSnowman.scarfTailPivot.rotation.x = Math.sin(now * 0.003) * 0.08;
      const localReady = currentRoom?.players?.find(player => player.id === myId)?.ready;
      const armSwing = Math.sin(now * (localReady ? 0.005 : 0.00135)) * (localReady ? 0.28 : 0.035);
      for (const arm of previewSnowman.arms) {
        arm.mesh.rotation.x = arm.restX;
        arm.mesh.rotation.z = arm.rest + armSwing * arm.side;
      }
      const previewWalking = Boolean(localReady);
      for (const leg of previewSnowman.legs) {
        const phase = now * 0.003 + (leg.side < 0 ? 0 : Math.PI);
        leg.pivot.position.y = leg.restY + (previewWalking ? Math.max(0, Math.sin(phase)) * 0.12 : 0);
        leg.pivot.position.z = leg.restZ + (previewWalking ? Math.sin(phase) * previewSnowman.variantConfig.strideLength * 0.12 : 0);
      }
    }
    try {
      previewRenderer.render(previewScene, previewCamera);
    } catch (error) {
      reportClientError('lobby preview', error);
    }
  }
  if (!titleScreen.hidden) {
    try { titleScene?.render(dt, now); }
    catch (error) {
      reportClientError('title snowman preview', error);
      titleScene?.fail();
    }
  }
  } catch (error) {
    reportClientError(`render loop / ${renderStage}`, error);
    // A HUD/minimap/animation update should not blank the entire game world.
    // Retry the scene render once if this frame failed before reaching WebGL.
    if (!sceneRendered && titleScreen.hidden) {
      try {
        renderer.render(scene, camera);
      } catch (renderError) {
        reportClientError('fallback WebGL render', renderError);
      }
    }
  } finally {
    requestAnimationFrame(render);
  }
}

let renderQuality = prefersMobileRendering() ? 0.56 : 0.76;
let qualityWindowStart = performance.now();
let qualityFrameCount = 0;
function tuneRenderQuality(now) {
  qualityFrameCount++;
  const elapsed = now - qualityWindowStart;
  if (elapsed < 1800) return;
  const framesPerSecond = qualityFrameCount * 1000 / elapsed;
  const min = prefersMobileRendering() ? 0.38 : 0.5;
  const max = prefersMobileRendering() ? 0.62 : 0.84;
  const previousQuality = renderQuality;
  if (framesPerSecond < 28) renderQuality = Math.max(min, renderQuality - 0.04);
  else if (framesPerSecond > 48) renderQuality = Math.min(max, renderQuality + 0.015);
  qualityWindowStart = now;
  qualityFrameCount = 0;
  if (Math.abs(previousQuality - renderQuality) >= 0.01) resizeRenderers();
}

function resizeRenderers() {
  const mobile = prefersMobileRendering();
  renderer.shadowMap.enabled = !mobile;
  sun.castShadow = !mobile;
  const qualityBase = graphicsPreset === 'low' ? 0.42 : graphicsPreset === 'high' ? 0.82 : renderQuality;
  const viewport = root.getBoundingClientRect();
  const viewportWidth = Math.max(1, viewport.width);
  const viewportHeight = Math.max(1, viewport.height);
  renderer.setSize(Math.max(1, Math.round(viewportWidth * qualityBase)), Math.max(1, Math.round(viewportHeight * qualityBase)), false);
  camera.aspect = viewportWidth / viewportHeight;
  camera.updateProjectionMatrix();
  const bounds = previewCanvas.getBoundingClientRect();
  if (bounds.width && bounds.height) {
    previewRenderer.setSize(Math.max(1, Math.round(bounds.width)), Math.max(1, Math.round(bounds.height)), false);
    previewCamera.aspect = bounds.width / bounds.height;
    previewCamera.updateProjectionMatrix();
    fitPreviewCamera();
  }
  updateRotateHint();
}

function checkHudOverlaps() {
  const selectors = ['#minimap-wrap', '#match-hud', '#room-corner', '#match-fullscreen', '#desktop-pause', '#mobile-leave',
    '#mobile-joystick', '#mobile-throw', '#mobile-aim', '#mobile-crouch', '#mobile-dash'];
  const visible = selectors.map(selector => document.querySelector(selector)).filter(element => {
    if (!element || element.hidden || element.classList.contains('control-hidden')) return false;
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
  const overlaps = [];
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i].getBoundingClientRect(), b = visible[j].getBoundingClientRect();
    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
      overlaps.push(`${visible[i].id || visible[i].className} × ${visible[j].id || visible[j].className}`);
  }
  if (overlaps.length) console.warn('[Snowman HUD] overlapping controls:', overlaps);
  return overlaps;
}
if (isDevelopmentBuild) {
  window.__checkSnowmanHudOverlaps = checkHudOverlaps;
    window.__checkSnowmanRigConnections = checkRigConnections;
  new ResizeObserver(() => requestAnimationFrame(checkHudOverlaps)).observe(document.documentElement);
  window.addEventListener('orientationchange', () => setTimeout(checkHudOverlaps, 120));
}

// Report useful startup facts in development without requiring DevTools.
if (isDevelopmentBuild) {
  requestAnimationFrame(() => {
    resizeRenderers();
    const bounds = renderer.domElement.getBoundingClientRect();
    console.info('[Snowman startup]', {
      threeRevision: THREE.REVISION,
      webglContext: Boolean(renderer.getContext()),
      canvasWidth: Math.round(bounds.width),
      canvasHeight: Math.round(bounds.height),
      sceneObjects: scene.children.length,
      snowmanModels: scene.children.filter(child => child === menuAvatarGroup).length
    });
    checkRigConnections();
    if (!bounds.width || !bounds.height) reportClientError('startup', new Error('The game canvas has no visible size.'));
  });
}

requestAnimationFrame(render);
window.addEventListener('resize', () => scheduleViewportLayout());
window.visualViewport?.addEventListener('resize', () => scheduleViewportLayout());
window.visualViewport?.addEventListener('scroll', () => scheduleViewportLayout());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (keys.has(' ') && gameStatus === 'IN_GAME') sendThrow();
    keys.clear();
    releaseMobileThrow();
  if (mouseCharging) { mouseCharging = false; sendThrow(); }
    resetJoystick();
  }
});
new ResizeObserver(resizeRenderers).observe($('#preview-canvas'));
new ResizeObserver(resizeRenderers).observe(root);
resizeRenderers();
