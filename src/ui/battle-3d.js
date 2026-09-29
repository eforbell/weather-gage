import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { battleActors } from './battle-presentation.js';
import { createActorModel, disposeActorModel } from './battle-models.js';

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const world = (point, focus) => new THREE.Vector3(
  ((point.q - focus.q) + (point.r - focus.r) / 2) * 4.8,
  focus.y,
  (point.r - focus.r) * 4.15,
);
function facingAngle(facing) {
  const [q, r] = dirs[facing] || dirs[0];
  return Math.atan2(-(q + r / 2), -r * 0.866);
}
function disposeTree(root) {
  root.traverse(item => {
    item.geometry?.dispose();
    if (Array.isArray(item.material)) item.material.forEach(m => m.dispose());
    else item.material?.dispose();
  });
}

function skyDome() {
  const geometry = new THREE.SphereGeometry(180, 36, 20);
  const positions = geometry.getAttribute('position');
  const colors = [];
  const low = new THREE.Color(0xedb078), high = new THREE.Color(0x273f55);
  for (let i = 0; i < positions.count; i++) {
    const t = clamp((positions.getY(i) + 4) / 112, 0, 1);
    const c = low.clone().lerp(high, Math.pow(t, 0.55));
    colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

function sunGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,244,202,1)');
  gradient.addColorStop(0.12, 'rgba(255,225,160,.88)');
  gradient.addColorStop(0.42, 'rgba(255,190,112,.22)');
  gradient.addColorStop(1, 'rgba(255,190,112,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.position.set(-42, 13, -100);
  sprite.scale.set(39, 39, 1);
  return sprite;
}

function sea() {
  const geometry = new THREE.PlaneGeometry(360, 360, 76, 76);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x24596c, metalness: 0.04, roughness: 0.88, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  const base = Float32Array.from(geometry.getAttribute('position').array);
  return { mesh, base };
}

function sunGlitter() {
  const points = [];
  for (let i = 0; i < 115; i++) {
    const z = -4 - ((i * 47) % 75);
    const center = z * 0.18;
    const spread = 1.4 + Math.abs(z) * 0.19;
    const x = center + Math.sin(i * 71.3) * spread;
    const length = 0.12 + (i % 7) * 0.085;
    points.push(x - length, 0.14, z, x + length, 0.14, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xffd69c, transparent: true, opacity: 0.29, depthWrite: false }));
}

function smokeFor(model, actor, undersea) {
  if (undersea || actor.uncertain || /submarine|ssn|ssbn/i.test(actor.type || '')) return null;
  const group = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  gradient.addColorStop(0, 'rgba(62,70,72,.58)');
  gradient.addColorStop(0.5, 'rgba(86,92,91,.28)');
  gradient.addColorStop(1, 'rgba(110,116,113,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: actor.hull < 60 ? 0.7 : 0.35, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const puff = new THREE.Sprite(material);
    puff.userData.offset = i / 7;
    group.add(puff);
  }
  model.add(group);
  return { group, texture };
}

export function createBattle3D(host, onFailure = () => {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'battle-canvas';
  renderer.domElement.setAttribute('aria-label', '3D battle camera. Drag to orbit and scroll or pinch to zoom.');
  renderer.domElement.setAttribute('role', 'img');
  host.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x365e6a, 0.007);
  const sky = skyDome(); scene.add(sky);
  const sun = sunGlow(); scene.add(sun);
  const water = sea(); scene.add(water.mesh);
  const glitter = sunGlitter(); scene.add(glitter);
  const ambient = new THREE.HemisphereLight(0xffdfaf, 0x254d65, 2.2);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight(0xffce96, 2.9);
  sunlight.position.set(-48, 36, -70);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -40;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 40;
  sunlight.shadow.normalBias = 0.035;
  scene.add(sunlight);
  const bounce = new THREE.DirectionalLight(0xa7c6d1, 0.85);
  bounce.position.set(20, 10, 25); scene.add(bounce);
  const underwaterLight = new THREE.PointLight(0x9bc6ce, 0, 30);
  scene.add(underwaterLight);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.15, 550);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduced.matches;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 9;
  controls.maxDistance = 64;
  controls.minPolarAngle = 0.19;
  controls.maxPolarAngle = Math.PI / 2.12;
  let lastFrame = 0, frame = 0, active = false, disposed = false, era = '', underseaMode = null, cameraDepth = 0;
  function resetCamera() {
    if (underseaMode) {
      controls.minDistance = 7;
      controls.maxDistance = 24;
      controls.minPolarAngle = 1.48;
      controls.maxPolarAngle = 1.56;
      camera.position.set(8, cameraDepth + 1.2, 11);
      controls.target.set(0, cameraDepth, 0);
    } else {
      controls.minDistance = 9;
      controls.maxDistance = 64;
      controls.minPolarAngle = 0.19;
      controls.maxPolarAngle = Math.PI / 2.12;
      camera.position.set(12, 8, 17);
      controls.target.set(0, 0.75, 0);
    }
    controls.update();
    renderOnce();
  }
  resetCamera();

  const models = new Map();
  const effects = [];
  const resize = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    renderOnce();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const contextLost = event => { event.preventDefault(); stop(); onFailure('3D graphics context was lost. Returned to the tactical chart.'); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);

  function renderOnce() {
    if (disposed) return;
    if (underseaMode) underwaterLight.position.copy(camera.position);
    renderer.render(scene, camera);
  }
  function moveWaves(seconds) {
    const attr = water.mesh.geometry.getAttribute('position');
    const target = attr.array;
    for (let i = 0; i < target.length; i += 3) {
      const x = water.base[i], z = water.base[i + 2];
      target[i + 1] = Math.sin(x * 0.28 + seconds * 0.9) * 0.13 + Math.cos(z * 0.24 - seconds * 0.68) * 0.11 + Math.sin((x + z) * 0.47 + seconds * 1.3) * 0.045;
    }
    attr.needsUpdate = true;
    water.mesh.geometry.computeVertexNormals();
  }
  function updateSmoke(seconds) {
    for (const { smoke } of models.values()) if (smoke) {
      for (const puff of smoke.group.children) {
        const age = (seconds * 0.22 + puff.userData.offset) % 1;
        puff.position.set(0.6 + age * 1.25, 1.6 + age * 4.3, 0.6 + Math.sin(seconds + age * 8) * 0.25);
        puff.scale.setScalar(0.45 + age * 2.2);
      }
    }
  }
  function updateEffects(now) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i];
      const progress = (now - effect.start) / effect.duration;
      if (progress >= 1) { scene.remove(effect.group); disposeTree(effect.group); effects.splice(i, 1); continue; }
      if (effect.path) {
        effect.group.position.copy(effect.path.getPoint(clamp(progress, 0, 1)));
        effect.group.scale.setScalar(0.7 + progress * 0.35);
      } else {
        effect.group.scale.setScalar(0.3 + progress * 3.2);
        effect.group.children.forEach(obj => { if (obj.material) obj.material.opacity = 0.9 * (1 - progress); });
      }
    }
  }
  function animate(now) {
    if (!active || disposed) return;
    frame = requestAnimationFrame(animate);
    if (now - lastFrame < 32) return; // keep the scene near 30 fps
    lastFrame = now;
    const seconds = now / 1000;
    moveWaves(seconds);
    updateSmoke(seconds);
    glitter.material.opacity = 0.21 + Math.sin(seconds * 1.4) * 0.07;
    updateEffects(now);
    for (const { model, target } of models.values()) model.position.lerp(target, 0.13);
    controls.update();
    renderOnce();
  }
  function start() {
    if (disposed || active) return;
    active = true;
    resize();
    if (!reduced.matches) frame = requestAnimationFrame(animate);
    else renderOnce();
  }
  function stop() { active = false; cancelAnimationFrame(frame); }
  controls.addEventListener('change', () => { if (active && reduced.matches) renderOnce(); });

  function removeModel(id) {
    const item = models.get(id);
    if (!item) return;
    scene.remove(item.model);
    disposeActorModel(item.model);
    item.smoke?.texture.dispose();
    models.delete(id);
  }
  function addEffects(events, focus) {
    for (const event of events.slice(0, 18)) {
      const origin = event.from && world(event.from, focus);
      const destination = (event.to || event.at) && world(event.to || event.at, focus);
      if (!destination && !origin) continue;
      const hit = ['missile-hit', 'torpedo-hit', 'mine', 'ram'].includes(event.type) || (['salvo', 'broadside'].includes(event.type) && event.hits);
      const shot = ['salvo', 'broadside', 'missile'].includes(event.type) && origin && destination;
      if (!hit && !shot) continue;
      const group = new THREE.Group();
      let path;
      if (shot) {
        path = new THREE.QuadraticBezierCurve3(origin.clone().add(new THREE.Vector3(0, 1.2, 0)), origin.clone().lerp(destination, 0.5).add(new THREE.Vector3(0, event.type === 'missile' ? 2.7 : 7, 0)), destination.clone().add(new THREE.Vector3(0, 0.5, 0)));
        group.add(new THREE.Mesh(new THREE.SphereGeometry(event.type === 'missile' ? 0.18 : 0.12, 8, 6), new THREE.MeshBasicMaterial({ color: event.type === 'missile' ? 0xffd495 : 0xfff0c5 })));
      } else {
        group.position.copy(destination);
        group.add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff9b45, transparent: true, opacity: 0.9, depthWrite: false })));
        group.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1cb, transparent: true, opacity: 0.9, depthWrite: false })));
      }
      scene.add(group);
      effects.push({ group, path, start: performance.now(), duration: shot ? 1050 : 1300 });
    }
  }
  function sync(view, selectedId, nextEra, events = []) {
    if (disposed) return { reports: 0 };
    const presented = battleActors(view, selectedId);
    if (!presented.focus) return { reports: 0 };
    const undersea = nextEra === 'coldwar' && presented.focus.depth !== 'surface';
    const changedEra = era !== nextEra || underseaMode !== undersea;
    const cameraChanged = underseaMode !== undersea || cameraDepth !== presented.focus.y;
    era = nextEra;
    underseaMode = undersea;
    cameraDepth = presented.focus.y;
    sky.visible = sun.visible = glitter.visible = !undersea;
    water.mesh.material.color.set(undersea ? 0x12384b : 0x24596c);
    scene.background = undersea ? new THREE.Color(0x08283a) : null;
    scene.fog.color.set(undersea ? 0x08283a : 0x365e6a);
    scene.fog.density = undersea ? 0.052 : 0.007;
    ambient.intensity = undersea ? 1.1 : 2.2;
    sunlight.intensity = undersea ? 0.18 : 2.9;
    bounce.intensity = undersea ? 0.65 : 0.85;
    underwaterLight.intensity = undersea ? 32 : 0;
    if (cameraChanged) resetCamera();
    const ids = new Set(presented.actors.map(a => a.id));
    for (const id of models.keys()) if (!ids.has(id) || changedEra) removeModel(id);
    for (const actor of presented.actors) {
      let item = models.get(actor.id);
      if (item && (item.type !== actor.type || item.uncertain !== actor.uncertain || item.stale !== actor.stale)) { removeModel(actor.id); item = null; }
      if (!item) {
        const model = createActorModel(actor, nextEra);
        const target = new THREE.Vector3(actor.x, actor.y - (actor.own && actor.status !== 'active' ? 0.65 : 0), actor.z);
        model.position.copy(target);
        model.rotation.y = actor.own ? facingAngle(actor.facing) : Math.PI * 0.3;
        if (actor.own && actor.status !== 'active') model.rotation.z = 0.24;
        scene.add(model);
        item = { model, target, type: actor.type, uncertain: actor.uncertain, stale: actor.stale, smoke: smokeFor(model, actor, undersea) };
        models.set(actor.id, item);
      }
      item.target.set(actor.x, actor.y - (actor.own && actor.status !== 'active' ? 0.65 : 0), actor.z);
      if (actor.own) item.model.rotation.y = facingAngle(actor.facing);
    }
    if (events.length) addEffects(events, presented.focus);
    if (reduced.matches) {
      for (const { model, target } of models.values()) model.position.copy(target);
      renderOnce();
    }
    return { reports: view.contacts.length };
  }
  function dispose() {
    if (disposed) return;
    stop();
    observer.disconnect();
    controls.dispose();
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    for (const id of [...models.keys()]) removeModel(id);
    for (const effect of effects) { scene.remove(effect.group); disposeTree(effect.group); }
    effects.length = 0;
    water.mesh.geometry.dispose(); water.mesh.material.dispose();
    glitter.geometry.dispose(); glitter.material.dispose();
    sky.geometry.dispose(); sky.material.dispose();
    sun.material.map.dispose(); sun.material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    disposed = true;
  }
  return { start, stop, sync, resetCamera, resize, dispose };
}
