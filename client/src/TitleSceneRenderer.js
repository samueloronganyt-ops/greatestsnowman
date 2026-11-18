import * as THREE from 'three';
import { SnowmanAnimator } from './SnowmanAnimator.js';
import { TITLE_ANIMATION_CONFIG as CONFIG } from './TitleAnimationConfig.js';
import { TitleIdleDirector } from './TitleIdleDirector.js';

/** A disposable, low-cost renderer for the title snowman, separate from the match scene. */
export class TitleSceneRenderer {
  constructor(canvas, createSnowman, disposeSnowman, onFallback = () => {}, onInteraction = () => {}) {
    this.canvas = canvas;
    this.createSnowman = createSnowman;
    this.disposeSnowman = disposeSnowman;
    this.onFallback = onFallback;
    this.onInteraction = onInteraction;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.model = null;
    this.group = null;
    this.animator = null;
    this.idleDirector = new TitleIdleDirector();
    this.sparkles = [];
    this.elapsed = 0;
    this.pointerScreen = null;
    this.eyeRestPositions = [];
    this.glintRestPositions = [];
    this.hipsRestPosition = null;
    this.hatRest = null;
    this.hatInHand = false;
    this.previousGesture = '';
    this.failed = false;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.handleResize = () => this.resize();
    this.handleViewportResize = () => requestAnimationFrame(() => this.resize());
    this.handleClick = event => {
      if (event.button !== 0) return;
      this.bounce('click');
      this.onInteraction();
    };
    this.handleContextLost = event => {
      event.preventDefault();
      this.fail();
    };
    this.canvas.addEventListener('click', this.handleClick);
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleViewportResize);
    document.addEventListener('fullscreenchange', this.handleViewportResize);
    window.visualViewport?.addEventListener('resize', this.handleViewportResize);
  }

  show() {
    if (this.renderer || this.failed) return;
    try {
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(CONFIG.fov, 1, 0.05, 40);
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false
      });
      this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = false;
      this.scene.add(new THREE.HemisphereLight('#f7fbff', '#7589aa', 1.65));
      const warmKey = new THREE.DirectionalLight('#ffe5ba', 2.0);
      warmKey.position.set(-4, 5, 6);
      this.scene.add(warmKey);
      const coolRim = new THREE.DirectionalLight('#8ac8ff', 1.35);
      coolRim.position.set(4, 4, -5);
      this.scene.add(coolRim);

      this.addSnowMound();

      this.model = this.createSnowman();
      this.group = this.model.group;
      this.hatInHand = false;
      this.group.position.y = 0.05;
      for (const arm of this.model.arms) {
        arm.mesh.rotation.z = arm.rest + arm.side * CONFIG.welcomeArmRaise;
        arm.elbow.rotation.z = -arm.side * 0.14;
      }
      this.eyeRestPositions = this.model.eyes?.map(eye => eye.position.clone()) || [];
      this.glintRestPositions = this.model.eyeGlints?.map(eye => eye.position.clone()) || [];
      this.hipsRestPosition = this.model.hips.position.clone();
      this.hatRest = { position: this.model.hatPivot.position.clone(), rotation: this.model.hatPivot.rotation.clone() };
      this.scene.add(this.group);
      this.animator = new SnowmanAnimator();
      this.addSparkles();
      this.addJuggleBall();
      this.addSnowPuff();
      this.resize();
      if (this.pointerScreen) this.updatePointerAim();
    } catch (error) {
      console.warn('[Snowman title] WebGL preview unavailable; using the static artwork.', error);
      this.fail();
    }
  }

  setPointerFromScreen(clientX, clientY, { touch = false } = {}) {
    this.pointerScreen = { x: clientX, y: clientY, touch };
    this.updatePointerAim();
  }

  clearPointer() { this.idleDirector.clearPointer(); }

  updatePointerAim(recordActivity = true) {
    if (!this.model || !this.camera || this.reducedMotion || !this.pointerScreen) return;
    this.camera.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
    const projected = this.model.headPivot.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const bounds = this.canvas.getBoundingClientRect();
    const headX = bounds.left + (projected.x + 1) * 0.5 * bounds.width;
    const headY = bounds.top + (1 - projected.y) * 0.5 * bounds.height;
    const x = THREE.MathUtils.clamp((this.pointerScreen.x - headX) / Math.max(1, window.innerWidth * 0.47), -1, 1);
    const y = THREE.MathUtils.clamp((headY - this.pointerScreen.y) / Math.max(1, window.innerHeight * 0.47), -1, 1);
    this.idleDirector.setPointerTarget(x * CONFIG.headLimits.yaw, y * CONFIG.headLimits.pitch, { touch: this.pointerScreen.touch, activity: recordActivity });
  }

  setHover(name, active, element) {
    if (!active) { this.idleDirector.setHover(null); return; }
    const bounds = element?.getBoundingClientRect();
    if (!bounds) return;
    const pointX = bounds.left + bounds.width / 2;
    const pointY = bounds.top + bounds.height / 2;
    if (this.model && this.camera) {
      this.pointerScreen = { x: pointX, y: pointY, touch: false };
      this.updatePointerAim(false);
    }
    const target = this.idleDirector.pointerYaw === undefined ? { yaw: 0, pitch: 0 }
      : { yaw: this.idleDirector.pointerYaw, pitch: this.idleDirector.pointerPitch };
    this.idleDirector.setHover(name, target.yaw, target.pitch);
  }

  addSnowMound() {
    const makeGradient = (inner, outer) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      const context = canvas.getContext('2d');
      const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 62);
      gradient.addColorStop(0, inner);
      gradient.addColorStop(0.58, inner);
      gradient.addColorStop(1, outer);
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    };
    const softGround = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.8), new THREE.MeshBasicMaterial({
      map: makeGradient('rgba(246,252,255,0.82)', 'rgba(235,247,255,0)'), transparent: true, depthWrite: false
    }));
    softGround.rotation.x = -Math.PI / 2;
    softGround.position.y = 0.026;
    this.scene.add(softGround);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: '#f7fcff', roughness: 0.98, flatShading: true }));
    mound.scale.set(1.35, 0.13, 0.82);
    mound.position.set(0, 0.055, 0.02);
    this.scene.add(mound);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.15, 1.42), new THREE.MeshBasicMaterial({
      map: makeGradient('rgba(71,105,151,0.34)', 'rgba(71,105,151,0)'), transparent: true, depthWrite: false
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0.08, 0.033, 0.06);
    this.scene.add(shadow);
    for (let index = 0; index < 5; index++) {
      const lump = new THREE.Mesh(new THREE.SphereGeometry(0.16 + (index % 2) * 0.04, 7, 5), new THREE.MeshStandardMaterial({ color: '#f4faff', roughness: 1, flatShading: true }));
      const angle = index / 5 * Math.PI * 2;
      lump.scale.set(1.25, 0.42, 0.9);
      lump.position.set(Math.cos(angle) * 1.0, 0.06, Math.sin(angle) * 0.57);
      this.scene.add(lump);
    }
  }

  addJuggleBall() {
    this.juggleBall = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, flatShading: true }));
    this.juggleBall.visible = false;
    this.scene.add(this.juggleBall);
  }

  addSnowPuff() {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(9 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0, depthWrite: false });
    this.snowPuff = new THREE.Points(geometry, material);
    this.snowPuff.visible = false;
    this.scene.add(this.snowPuff);
    this.puffStartedAt = -Infinity;
  }

  emitSnowPuff() {
    if (!this.snowPuff || !this.group) return;
    this.puffStartedAt = this.elapsed;
    const positions = this.snowPuff.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      positions.setXYZ(index, (Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.5);
    }
    positions.needsUpdate = true;
    this.snowPuff.visible = true;
  }

  addSparkles() {
    const positions = new Float32Array(24 * 3);
    for (let index = 0; index < 24; index++) {
      positions[index * 3] = (Math.random() - 0.5) * 4.4;
      positions[index * 3 + 1] = Math.random() * 3.5;
      positions[index * 3 + 2] = (Math.random() - 0.5) * 2.3;
      this.sparkles.push({ index, speed: 0.12 + Math.random() * 0.18, phase: Math.random() * Math.PI * 2 });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: '#e8f8ff', size: 0.045, transparent: true, opacity: 0.72, depthWrite: false, sizeAttenuation: true });
    this.snow = new THREE.Points(geometry, material);
    this.scene.add(this.snow);
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const bounds = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (!this.group) return;
    this.group.updateMatrixWorld(true);
    const bounds3d = new THREE.Box3();
    this.group.traverse(object => {
      if (!object.visible || !object.geometry) return;
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);
      bounds3d.union(box);
    });
    const size = bounds3d.getSize(new THREE.Vector3());
    const center = bounds3d.getCenter(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(CONFIG.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
    const distance = Math.max(size.y / (2 * Math.tan(verticalFov / 2) * CONFIG.targetStageHeight), size.x / (2 * Math.tan(horizontalFov / 2) * CONFIG.targetStageWidth));
    this.camera.position.set(0.12, center.y + Math.max(0.35, distance * Math.tan(CONFIG.cameraElevationRadians)), Math.max(2.6, distance));
    this.camera.lookAt(0, center.y - size.y * 0.04, 0);
    this.camera.near = 0.05;
    this.camera.far = 40;
    this.camera.updateProjectionMatrix();
    this.updatePointerAim();
  }

  render(dt, now) {
    if (document.hidden) { this.idleDirector.update(0, { hidden: true }); return; }
    if (!this.renderer || !this.scene || !this.camera || !this.model) return;
    const boundedDt = Math.min(dt, 0.04);
    this.elapsed += boundedDt;
    this.updatePointerAim(false);
    this.animator.advance(boundedDt, 0, this.model.variantConfig, false);
    const pose = this.idleDirector.update(boundedDt, { reducedMotion: this.reducedMotion });
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(1 + pose.squash * 0.25);
    const tremble = this.reducedMotion ? 0 : Math.sin(this.elapsed * CONFIG.shiverFrequency) * pose.shiver * CONFIG.shiverPosition;
    this.model.hips.position.set(this.hipsRestPosition.x + tremble, this.hipsRestPosition.y, this.hipsRestPosition.z + Math.cos(this.elapsed * CONFIG.shiverFrequency) * pose.shiver * CONFIG.shiverPosition);
    this.model.hips.rotation.set(0, 0, this.reducedMotion ? 0 : pose.hipShift + tremble * CONFIG.gestureTorsoShake);
    this.model.torsoPivot.rotation.set(0, pose.headYaw * CONFIG.torsoYawFollow, pose.torsoLean);
    this.model.torsoPivot.scale.y = Math.max(0.86, 1 + pose.breath + pose.squash);
    this.model.neck.rotation.y = pose.headYaw * CONFIG.neckYawShare;
    this.model.headPivot.rotation.y = THREE.MathUtils.clamp(pose.headYaw * CONFIG.headYawShare, -CONFIG.headLimits.yaw, CONFIG.headLimits.yaw);
    this.model.headPivot.rotation.x = THREE.MathUtils.clamp(-pose.headPitch, -CONFIG.headLimits.pitch, CONFIG.headLimits.pitch);
    this.model.headPivot.rotation.z = THREE.MathUtils.clamp(pose.headRoll + pose.headPitch * 0.08, -CONFIG.headLimits.roll, CONFIG.headLimits.roll);
    if (!this.hatInHand) this.model.hatPivot.position.y = this.hatRest.position.y + (this.reducedMotion ? 0 : pose.hatBob);
    this.model.hatPivot.rotation.z = this.reducedMotion ? 0 : Math.sin(this.elapsed * Math.PI * 2 * CONFIG.hatIdleBobHz) * 0.018;
    if (this.model.scarf) this.model.scarf.rotation.z = this.reducedMotion ? 0 : pose.scarfFlutter;
    if (this.model.scarfTailPivot) this.model.scarfTailPivot.rotation.x = this.reducedMotion ? 0 : pose.scarfFlutter * 2.4;
    this.model.scarfTailPivot && (this.model.scarfTailPivot.rotation.z = CONFIG.scarfTailBaseRoll + (this.reducedMotion ? 0 : Math.sin(this.elapsed * Math.PI * 2 * CONFIG.scarfTailIdleHz) * CONFIG.scarfTailRollRadians + pose.scarfFlutter));
    const playNod = this.reducedMotion ? 0 : pose.playNod;
    this.model.headPivot.rotation.x = THREE.MathUtils.clamp(this.model.headPivot.rotation.x + playNod, -CONFIG.headLimits.pitch, CONFIG.headLimits.pitch);
    const blink = pose.blink;
    this.model.eyes?.forEach((eye, index) => {
      const base = this.eyeRestPositions[index];
      if (base) eye.position.set(base.x + pose.eyeX * CONFIG.eyeFollowScale, base.y + pose.eyeY * CONFIG.eyeFollowVerticalScale, base.z + Math.abs(pose.eyeX) * 0.04);
      eye.scale.y = Math.max(0.08, 1 - blink);
    });
    this.model.eyeGlints?.forEach((eye, index) => {
      const base = this.glintRestPositions[index];
      if (base) eye.position.set(base.x + pose.eyeX * CONFIG.eyeFollowScale, base.y + pose.eyeY * CONFIG.eyeFollowVerticalScale, base.z + Math.abs(pose.eyeX) * 0.04);
      eye.scale.y = Math.max(0.08, 1 - blink);
    });
    const gesture = pose.gesture || '';
    for (const arm of this.model.arms) {
      const armOffset = arm.side > 0 ? pose.rightArm : pose.leftArm;
      const elbowOffset = arm.side > 0 ? pose.rightElbow : pose.leftElbow;
      const waveWrist = gesture === 'WAVE' && arm.side > 0 ? Math.sin((pose.gestureProgress || 0) * Math.PI * 8) * CONFIG.waveElbowSwing : 0;
      arm.mesh.rotation.x = this.reducedMotion ? 0 : THREE.MathUtils.clamp(Math.sin(this.elapsed * 1.6 + arm.side) * 0.012, -0.1, 0.1);
      const armAngle = arm.rest + arm.side * CONFIG.welcomeArmRaise + (this.reducedMotion ? 0 : arm.side * pose.armSway) + armOffset;
      arm.mesh.rotation.z = THREE.MathUtils.clamp(Number.isFinite(armAngle) ? armAngle : arm.rest, ...CONFIG.armAngleLimits);
      const elbowAngle = -arm.side * CONFIG.welcomeElbowBend + elbowOffset + waveWrist;
      arm.elbow.rotation.z = THREE.MathUtils.clamp(Number.isFinite(elbowAngle) ? elbowAngle : 0, ...CONFIG.elbowAngleLimits);
    }
    this.group.position.y = 0.05 + (this.reducedMotion ? 0 : pose.hop);
    this.updateHatGesture(pose.hatLift);
    this.updateJuggleBall(pose);
    this.updateSnowPuff();
    if (gesture !== this.previousGesture && ['HAPPY_HOP', 'DOUBLE_WAVE'].includes(gesture)) this.emitSnowPuff();
    if (this.previousGesture === 'JUGGLE' && gesture !== 'JUGGLE') this.emitSnowPuff();
    this.previousGesture = gesture;
    if (this.snow) {
      const attribute = this.snow.geometry.getAttribute('position');
      for (const particle of this.sparkles) {
        if (this.reducedMotion) continue;
        let y = attribute.getY(particle.index) - boundedDt * particle.speed;
        if (y < 0.12) y = 3.6 + (particle.index % 7) * 0.19;
        attribute.setY(particle.index, y);
        attribute.setX(particle.index, Math.sin(this.elapsed * 0.36 + particle.phase) * 1.9 + Math.cos(particle.phase) * 0.26);
      }
      attribute.needsUpdate = true;
      this.snow.material.opacity = 0.56 + (Math.sin(this.elapsed * 1.1) + 1) * 0.1;
    }
    this.renderer.render(this.scene, this.camera);
  }

  updateHatGesture(amount) {
    const arm = this.model.arms.find(candidate => candidate.side > 0);
    if (!arm || !this.model.hatPivot) return;
    if (amount > 0.45 && !this.hatInHand) {
      this.group.updateMatrixWorld(true);
      arm.hand.attach(this.model.hatPivot);
      this.model.hatPivot.position.set(0, 0.02, 0.02);
      this.hatInHand = true;
    } else if (amount < 0.2 && this.hatInHand) {
      this.model.headPivot.attach(this.model.hatPivot);
      this.model.hatPivot.position.copy(this.hatRest.position);
      this.model.hatPivot.rotation.copy(this.hatRest.rotation);
      this.hatInHand = false;
    }
    if (this.hatInHand) {
      this.model.hatPivot.rotation.z = -0.2 - amount * 0.35;
    this.model.hatPivot.rotation.x = -0.16;
    }
  }

  updateJuggleBall(pose) {
    if (!this.juggleBall || pose.juggle <= 0.05 || this.reducedMotion) { if (this.juggleBall) this.juggleBall.visible = false; return; }
    const hands = this.model.arms.map(arm => arm.hand.getWorldPosition(new THREE.Vector3()));
    const progress = ((pose.gestureProgress || 0) * 2) % 1;
    const point = progress < 0.5
      ? hands[0].clone().lerp(hands[1], progress * 2)
      : hands[1].clone().lerp(hands[0], (progress - 0.5) * 2);
    point.y += Math.sin(progress * Math.PI * 2) * 0.65;
    this.juggleBall.position.copy(point);
    this.juggleBall.visible = true;
  }

  updateSnowPuff() {
    if (!this.snowPuff?.visible) return;
    const age = this.elapsed - this.puffStartedAt;
    if (age >= CONFIG.snowPuffSeconds) { this.snowPuff.visible = false; this.snowPuff.material.opacity = 0; return; }
    const positions = this.snowPuff.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const angle = index / positions.count * Math.PI * 2;
      const distance = age * (CONFIG.snowPuffSpread + (index % 3) * 0.2);
      positions.setXYZ(index, Math.cos(angle) * distance, 0.12 + age * (CONFIG.snowPuffRise + (index % 2) * 0.35), Math.sin(angle) * distance * 0.7);
    }
    positions.needsUpdate = true;
    this.snowPuff.material.opacity = Math.max(0, 1 - age / CONFIG.snowPuffSeconds);
  }

  bounce(kind = 'click') { this.idleDirector.interrupt(kind); this.emitSnowPuff(); }

  fail() {
    this.failed = true;
    this.onFallback();
    this.disposeResources();
  }

  hide() {
    this.idleDirector.update(0, { hidden: true });
    this.disposeResources();
  }

  disposeResources() {
    const model = this.model;
    if (this.scene) this.scene.traverse(object => {
      if (model?.group && (object === model.group || model.group.getObjectById(object.id))) return;
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
      else object.material?.dispose();
    });
    if (model) this.disposeSnowman(model);
    this.renderer?.dispose();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.group = null;
    this.animator = null;
    this.snow = null;
    this.sparkles = [];
  }

  destroy() {
    this.hide();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleViewportResize);
    document.removeEventListener('fullscreenchange', this.handleViewportResize);
    window.visualViewport?.removeEventListener('resize', this.handleViewportResize);
    this.canvas.removeEventListener('click', this.handleClick);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
  }
}
