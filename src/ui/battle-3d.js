import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { battleActors, classStandIns, hexToWorld, HEX } from './battle-presentation.js';
import { SCENARIO_SETUPS } from '../sim/scenarios.js';
import { createActorModel, disposeActorModel, animateWakes } from './battle-models.js';
import { createEffects } from './battle-effects.js';
import { lookFor } from './battle-looks.js';
import { anchorSurfaceFoam } from './battle-waterline.js';
import { createCameraDirector } from './battle-camera.js';
import { createWaterNormals, configureSea } from './battle-sea.js';
import { adoptAuthoredModel, createShipAssetManager, hasShipAsset, shipAssetIdFor, disposeShipAssetInstance } from './ship-assets.js';

const ORIGIN = { q: 0, r: 0 };
const dirs = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const rad = THREE.MathUtils.degToRad;
function facingAngle(facing) {
  const [q, r] = dirs[facing] || dirs[0];
  return Math.atan2(-(q + r / 2), -r * 0.866);
}
// The wind index names where it blows from; smoke drifts the other way.
function downwind(wind) {
  const { x, z } = hexToWorld({ q: dirs[(wind + 3) % 6][0], r: dirs[(wind + 3) % 6][1] }, ORIGIN);
  return new THREE.Vector3(x, 0, z).setLength(1.1);
}
function hashPhase(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h >>> 0) / 4294967296 * Math.PI * 2;
}

// Painted grade in linear light, before tone mapping: tint, saturation, vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, tint: { value: new THREE.Vector3(1, 1, 1) }, saturation: { value: 1 }, vignette: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec3 tint;
    uniform float saturation, vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 color = max(mix(vec3(l), c.rgb, saturation), 0.0) * tint;
      vec2 d = vUv - 0.5;
      color *= 1.0 - vignette * dot(d, d) * 2.2;
      gl_FragColor = vec4(color, c.a);
    }`,
};

function distanceToSegment(p, a, b) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return a.clone().addScaledVector(ab, t).distanceTo(p);
}

export function createBattle3D(host, onFailure = () => {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  let quality = 1;
  const pixelRatio = () => Math.min(devicePixelRatio || 1, 1.5) * quality;
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  renderer.domElement.className = 'battle-canvas';
  renderer.domElement.setAttribute('aria-label', '3D battle camera. Drag to orbit and scroll or pinch to zoom.');
  renderer.domElement.setAttribute('role', 'img');
  const hud = document.createElement('pre');
  hud.className = 'battle-hud';
  hud.hidden = !/[?&]hud\b/.test(location.search);
  host.replaceChildren(renderer.domElement, hud);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9aa6a8, 0.006);
  // Ships and effects live in sea-fixed coordinates inside `world`, which eases
  // so the followed ship stays at the camera's origin: smoke stays on the sea.
  const world = new THREE.Group();
  const worldTarget = new THREE.Vector3();
  scene.add(world);

  // Preetham radiance is several times brighter than lit hulls; scale it once at
  // the source so the sky, its environment map, reflections and haze all agree.
  // The sun disc is clamped so it blooms as a bright sun, not a white-out, and
  // below the horizon the sky becomes the sea haze, so there is no hard band.
  const sky = new Sky();
  sky.scale.setScalar(1500);
  Object.assign(sky.material.uniforms, { skyScale: { value: 0.2 }, seaHaze: { value: new THREE.Color() }, hazeMix: { value: 0 } });
  sky.material.fragmentShader = 'uniform float skyScale, hazeMix;\nuniform vec3 seaHaze;\n' + sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    'gl_FragColor = vec4( mix( min( texColor * skyScale, vec3( 3.5 ) ), seaHaze, hazeMix * smoothstep( 0.02, -0.01, direction.y ) ), 1.0 );');
  scene.add(sky);
  const skyScene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null;

  const sunDirection = new THREE.Vector3(0, 1, 0);
  const water = new Water(new THREE.PlaneGeometry(6000, 6000), {
    textureWidth: 512, textureHeight: 512, waterNormals: createWaterNormals(), sunDirection,
    sunColor: 0xffffff, waterColor: 0x1d3a3e, distortionScale: 3, fog: true,
  });
  water.rotation.x = -Math.PI / 2;
  const seaSurface = configureSea(water);
  scene.add(water);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3d8193, side: THREE.DoubleSide }));
  scene.add(ceiling);

  const sunlight = new THREE.DirectionalLight(0xffffff, 3);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 400 });
  sunlight.shadow.camera.updateProjectionMatrix();
  sunlight.shadow.normalBias = 0.03;
  scene.add(sunlight, sunlight.target);
  const underwaterLight = new THREE.PointLight(0x9bc6ce, 0, 40);
  scene.add(underwaterLight);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 2400);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduced.matches;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.autoRotateSpeed = 0.35;
  const director = createCameraDirector({ reduced: reduced.matches, hex: HEX });
  controls.addEventListener('start', () => director.userInput()); // the player's hand always wins

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.35, 3.2);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  // Guns, hits and explosions shake the camera by how close they are to its subject.
  const effects = createEffects(world, { onImpulse: (point, strength) => director.impulse(strength, world.localToWorld(point.clone()).distanceTo(controls.target)) });
  const models = new Map();
  const shipAssets = createShipAssetManager({ renderer });
  let lastFrame = 0, frame = 0, active = false, disposed = false, era = '', lookId = '', underseaMode = null, cameraDepth = 0, focusId = null;
  let look = lookFor('', 'dreadnought');
  const stats = { frames: 0, since: 0, work: 0, fps: 0, ms: 0, slow: 0, stalls: 0 };

  // Average the sky around the horizon so haze matches the air it fades into.
  function horizonColor() {
    const target = new THREE.WebGLRenderTarget(8, 8, { type: THREE.FloatType });
    const probe = new THREE.PerspectiveCamera(70, 1, 0.1, 3000);
    const pixels = new Float32Array(8 * 8 * 4), sum = new THREE.Color(0, 0, 0);
    try {
      for (const a of [0, 90, 180, 270]) {
        probe.lookAt(Math.sin(rad(a)), 0.06, Math.cos(rad(a)));
        renderer.setRenderTarget(target);
        renderer.render(skyScene, probe);
        renderer.readRenderTargetPixels(target, 0, 0, 8, 8, pixels);
        for (let i = 0; i < pixels.length; i += 4) sum.r += pixels[i], sum.g += pixels[i + 1], sum.b += pixels[i + 2];
      }
      return sum.multiplyScalar(1 / 256);
    } catch {
      return null;
    } finally {
      renderer.setRenderTarget(null);
      target.dispose();
    }
  }

  function applyLook(undersea) {
    const u = sky.material.uniforms, s = look.sky;
    sunDirection.setFromSphericalCoords(1, rad(90 - look.sun[0]), rad(look.sun[1]));
    u.turbidity.value = s.turbidity;
    u.skyScale.value = look.skyScale ?? 0.2;
    u.rayleigh.value = s.rayleigh;
    u.mieCoefficient.value = s.mie;
    u.mieDirectionalG.value = s.g;
    u.cloudCoverage.value = s.clouds;
    u.cloudDensity.value = s.cloudDensity;
    u.sunPosition.value.copy(sunDirection);
    // Environment map from the same sky (sun disc off to avoid fireflies).
    skyScene.add(sky);
    u.showSunDisc.value = 0;
    u.hazeMix.value = 0;
    envTarget?.dispose();
    envTarget = pmrem.fromScene(skyScene, 0, 0.1, 3000);
    const horizon = horizonColor();
    u.showSunDisc.value = 1;
    scene.add(sky);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = undersea ? 0.25 : look.env;

    const sunColor = new THREE.Color(look.sunColor);
    sunlight.color.copy(sunColor);
    sunlight.intensity = undersea ? 0.2 : look.sunIntensity;
    sunlight.position.copy(sunDirection).multiplyScalar(150);
    const wu = water.material.uniforms;
    wu.sunColor.value.copy(sunColor).multiplyScalar(0.9);
    wu.waterColor.value.set(look.water);
    wu.size.value = look.waves.size;
    wu.distortionScale.value = look.waves.distortion;

    renderer.toneMapping = look.tone === 'agx' ? THREE.AgXToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = look.exposure;
    grade.uniforms.tint.value.set(...look.grade.tint);
    grade.uniforms.saturation.value = look.grade.saturation;
    grade.uniforms.vignette.value = look.grade.vignette;

    sky.visible = water.visible = !undersea;
    ceiling.visible = undersea;
    scene.background = undersea ? new THREE.Color(0x08283a) : null;
    scene.fog.color.copy(undersea ? new THREE.Color(0x08283a) : horizon || new THREE.Color(0x9aa6a8));
    scene.fog.density = undersea ? 0.045 : look.haze;
    u.seaHaze.value.copy(scene.fog.color);
    u.hazeMix.value = 1;
    underwaterLight.intensity = undersea ? 40 : 0;
    const smokeLight = new THREE.Color(1, 1, 1).lerp(sunColor, 0.35).multiplyScalar(look.smoke);
    effects.setScene({ era, wind: downwind(0), fog: scene.fog, tint: smokeLight, surface: undersea ? cameraDepth : 0 });
  }

  // Follow camera: framed from the ship's own size, from whichever bearing is
  // clear of neighbouring hulls, with the low sun behind and to one side of the
  // camera (three-quarter key light), on the end of the ship the sun lights, so
  // hull sides and canvas facing us are the lit ones.
  function frameCamera() {
    const item = models.get(focusId);
    if (underseaMode) {
      controls.minDistance = 7; controls.maxDistance = 26;
      controls.minPolarAngle = 1.48; controls.maxPolarAngle = 1.56;
      camera.position.set(8, cameraDepth + 1.2, 11);
      controls.target.set(0, cameraDepth, 0);
    } else if (item) {
      const r = item.model.userData.radius;
      const target = new THREE.Vector3(0, r * 0.2, 0);
      const distance = r * 3.1 + 3, elevation = rad(12);
      const sun = sunDirection.clone().setY(0).normalize();
      const heading = item.model.rotation.y, forward = new THREE.Vector3(-Math.sin(heading), 0, -Math.cos(heading));
      const others = [...models.values()].filter(m => m !== item).map(m => ({ p: m.target.clone().sub(item.target), r: m.model.userData.radius }));
      let best = null, bestScore = -Infinity;
      for (let k = 0; k < 18; k++) {
        const a = heading + k * Math.PI / 9;
        const position = new THREE.Vector3(Math.sin(a) * Math.cos(elevation), Math.sin(elevation), Math.cos(a) * Math.cos(elevation)).multiplyScalar(distance).add(target);
        const clearance = Math.min(Infinity, ...others.map(o => distanceToSegment(o.p, target, position) - o.r));
        const view = target.clone().sub(position).setY(0).normalize();
        const quarter = Math.abs(Math.sin(k * Math.PI / 9)) > 0.3; // not dead ahead or astern
        const litEnd = forward.dot(view) * forward.dot(sun) < 0; // we see the end the sun lights
        const score = (clearance > 1 ? 0 : clearance - 100) - Math.abs(view.dot(sun) + 0.35) * 2 + (quarter ? 0.3 : 0) + (litEnd ? 0.6 : 0);
        if (score > bestScore) { bestScore = score; best = position; }
      }
      controls.minDistance = r * 1.25;
      controls.maxDistance = HEX * 7;
      controls.minPolarAngle = 0.15;
      controls.maxPolarAngle = Math.PI / 2 - 0.04;
      const glide = director.begin(camera.position, controls.target, best, target);
      camera.position.copy(glide ? glide.position : best);
      controls.target.copy(glide ? glide.target : target);
    }
    controls.update();
    renderOnce();
  }

  const resize = () => {
    if (!host.clientWidth || !host.clientHeight) return;
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    composer.setPixelRatio(pixelRatio());
    composer.setSize(host.clientWidth, host.clientHeight);
    renderOnce();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  const contextLost = event => { event.preventDefault(); stop(); onFailure('3D graphics context was lost. Returned to the tactical chart.'); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const toggleHud = event => { if (event.key === '`' && active) hud.hidden = !hud.hidden; };
  document.addEventListener('keydown', toggleHud);

  function renderOnce() {
    if (disposed || !host.clientWidth) return;
    if (underseaMode) underwaterLight.position.copy(camera.position);
    renderer.info.reset();
    composer.render();
  }

  // Hulls sit in the water: heave, pitch and roll from the swell, and the slow
  // settle of a sinking or a list after striking.
  function moveShips(seconds) {
    const swell = underseaMode ? 0 : look.swell;
    for (const item of models.values()) {
      const { model, target } = item;
      const k = item.sinking ? 0.012 : 0.13;
      model.position.x += (target.x - model.position.x) * 0.13;
      model.position.z += (target.z - model.position.z) * 0.13;
      item.y += (target.y - item.y) * k;
      item.pitch += (item.pitchTarget - item.pitch) * k;
      item.roll += (item.rollTarget - item.roll) * k;
      const sea = item.floats ? swell : 0, t = seconds + item.phase;
      model.position.y = item.y + sea * 0.07 * Math.sin(t * 0.9);
      model.rotation.x = item.pitch + sea * 0.012 * Math.sin(t * 0.7);
      model.rotation.z = item.roll + sea * 0.02 * Math.sin(t * 0.55 + 1.3);
      anchorSurfaceFoam(model);
    }
  }

  function measure(now, interval, work) {
    stats.frames++; stats.work += work;
    if (interval > 250) stats.stalls++;
    if (now - stats.since < 1000) return;
    const seconds = (now - stats.since) / 1000;
    stats.fps = stats.frames / seconds; stats.ms = stats.work / stats.frames;
    // Adaptive resolution: if the GPU cannot hold ~20 fps under the 30 fps cap,
    // step the pixel ratio down (never up mid-battle, to avoid oscillating).
    // Mostly-stalled windows are a throttled or backgrounded tab, not a slow GPU.
    const throttled = document.hidden || stats.stalls > stats.frames / 2;
    if (stats.since && !throttled && stats.fps < 20 && quality > 0.6) { stats.slow++; if (stats.slow >= 2) { quality -= 0.2; stats.slow = 0; resize(); } }
    else stats.slow = 0;
    stats.since = now; stats.frames = 0; stats.work = 0; stats.stalls = 0;
    if (!hud.hidden) {
      const { calls, triangles } = renderer.info.render;
      hud.textContent = `${stats.fps.toFixed(0)} fps · ${stats.ms.toFixed(1)} ms cpu\n${calls} draws · ${(triangles / 1000).toFixed(0)}k tris\n${effects.particles} particles · ${renderer.getPixelRatio().toFixed(2)}× px\n${look.note}${water.material.userData.seaShaderFallback ? '\nplain sea · detail patch unavailable' : ''}`;
    }
  }

  function animate(now) {
    if (!active || disposed) return;
    frame = requestAnimationFrame(animate);
    if (now - lastFrame < 32) return; // keep the scene near 30 fps
    const interval = lastFrame ? now - lastFrame : 33;
    const dt = Math.min(0.1, interval / 1000);
    lastFrame = now;
    const started = performance.now(), seconds = now / 1000;
    world.position.lerp(worldTarget, 0.13);
    moveShips(seconds);
    animateWakes(seconds);
    water.material.uniforms.time.value += dt * look.waves.speed;
    sky.material.uniforms.time.value = seconds;
    if (!underseaMode) effects.shipSmoke(models.values(), dt);
    effects.update(dt, camera);
    const glide = director.step(dt);
    if (glide) { camera.position.copy(glide.position); controls.target.copy(glide.target); }
    controls.autoRotate = director.drifting && !underseaMode;
    controls.update(dt);
    const shake = director.shake(seconds);
    if (shake) camera.position.add(shake);
    renderOnce();
    if (shake) camera.position.sub(shake);
    measure(now, interval, performance.now() - started);
  }
  // establish: open with the sweeping establishing shot (the battle view was
  // just opened, not merely un-hidden with the tab).
  function start({ establish = false } = {}) {
    if (disposed || active) return;
    active = true;
    if (establish) {
      director.establishNext();
      if (models.has(focusId)) frameCamera();
    }
    lastFrame = 0;
    stats.since = 0;
    resize();
    if (!reduced.matches) frame = requestAnimationFrame(animate);
    else renderOnce();
  }
  function stop() { active = false; cancelAnimationFrame(frame); }
  controls.addEventListener('change', () => { if (active && reduced.matches) renderOnce(); });

  function removeModel(id) {
    const item = models.get(id);
    if (!item) return;
    world.remove(item.model);
    if (item.model.userData.shipAssetInstance) {
      // Surface foam is procedural geometry on shared materials, unlike the glTF clone's.
      for (const key of ['wake', 'waterlineFoam']) {
        const foam = item.model.userData[key];
        if (foam) { item.model.remove(foam); disposeActorModel(foam); }
      }
      disposeShipAssetInstance(item.model);
    } else disposeActorModel(item.model);
    models.delete(id);
  }
  const standInCache = new Map();
  function standInsFor(view, nextEra) {
    const side = view.ships[0]?.side;
    const key = `${view.scenarioId}|${side}|${nextEra}`;
    if (!standInCache.has(key)) standInCache.set(key, classStandIns(SCENARIO_SETUPS[view.scenarioId]?.ships || [], side, name => shipAssetIdFor({ name }, nextEra)));
    return standInCache.get(key);
  }
  function sync(view, selectedId, nextEra, events = []) {
    if (disposed) return { reports: 0 };
    const presented = battleActors(view, selectedId, standInsFor(view, nextEra));
    if (!presented.focus) return { reports: 0 };
    const undersea = nextEra === 'coldwar' && presented.focus.depth !== 'surface';
    const nextLook = view.scenarioId || nextEra;
    const changedEra = era !== nextEra || underseaMode !== undersea || lookId !== nextLook;
    const reframe = changedEra || cameraDepth !== presented.focus.y || focusId !== presented.focus.id;
    era = nextEra;
    lookId = nextLook;
    underseaMode = undersea;
    cameraDepth = presented.focus.y;
    focusId = presented.focus.id;
    if (changedEra) {
      look = lookFor(view.scenarioId, nextEra);
      effects.clear();
      applyLook(undersea);
    }
    seaSurface.update({ wind: downwind(view.wind ?? 0), swell: look.swell });
    effects.setScene({ era, wind: downwind(view.wind ?? 0), fog: scene.fog, surface: undersea ? cameraDepth : 0 });

    // Sea-fixed coordinates: the focus sits at `origin`; `world` eases to follow it.
    const origin = hexToWorld(presented.focus, ORIGIN);
    worldTarget.set(-origin.x, 0, -origin.z);
    if (changedEra || world.position.distanceTo(worldTarget) > HEX * 8) world.position.copy(worldTarget);

    const ids = new Set(presented.actors.map(a => a.id));
    for (const id of models.keys()) if (!ids.has(id) || changedEra) removeModel(id);
    for (const actor of presented.actors) {
      let item = models.get(actor.id);
      if (item && (item.type !== actor.type || item.className !== actor.className || item.name !== actor.name || item.assetId !== actor.assetId || item.uncertain !== actor.uncertain || item.stale !== actor.stale)) { removeModel(actor.id); item = null; }
      const sunk = actor.own && actor.status === 'sunk', struck = actor.own && actor.status === 'struck';
      const target = new THREE.Vector3(actor.x + origin.x, actor.y - (sunk ? 2.6 : struck ? 0.15 : 0), actor.z + origin.z);
      if (!item) {
        const model = createActorModel(actor, nextEra);
        model.position.copy(target);
        model.rotation.y = Number.isInteger(actor.facing) ? facingAngle(actor.facing) : Math.PI * 0.3;
        world.add(model);
        item = { model, target, y: target.y, pitch: 0, roll: 0, type: actor.type, className: actor.className, name: actor.name, assetId: actor.assetId, uncertain: actor.uncertain, stale: actor.stale, phase: hashPhase(actor.id) };
        models.set(actor.id, item);
        // Keep the procedural hull visible until a registered local asset is
        // ready. Identity check rejects late loads after contact/era changes.
        if ((!actor.uncertain || actor.own) && hasShipAsset(actor, nextEra)) {
          const pendingItem = item;
          shipAssets.createModel(actor, nextEra).then(loaded => {
            if (!loaded) return;
            if (disposed || models.get(actor.id) !== pendingItem || loaded.userData.proceduralFallback) {
              disposeShipAssetInstance(loaded);
              return;
            }
            const previous = pendingItem.model;
            adoptAuthoredModel(previous, loaded, {
              floating: pendingItem.floats && pendingItem.afloat,
              underway: pendingItem.underway && pendingItem.afloat,
            });
            world.remove(previous);
            disposeActorModel(previous);
            pendingItem.model = loaded;
            world.add(loaded);
            anchorSurfaceFoam(loaded);
            if (focusId === actor.id) frameCamera();
            if (reduced.matches) renderOnce();
          }).catch(error => console.warn('Ship asset unavailable; retaining procedural model', error));
        }
      }
      item.target.copy(target);
      item.sinking = sunk;
      item.pitchTarget = sunk ? -0.15 : 0;
      item.rollTarget = sunk ? 0.4 : struck ? 0.12 : 0;
      item.floats = !undersea && !(actor.uncertain && !actor.own) && actor.y === 0;
      item.underway = item.floats && !actor.anchored && (!actor.own || actor.status === 'active'); // ships at anchor leave no wake
      item.afloat = !sunk;
      item.hull = actor.own ? actor.hull : undefined;
      if (item.model.userData.wake) item.model.userData.wake.visible = item.underway && !sunk;
      if (item.model.userData.waterlineFoam) item.model.userData.waterlineFoam.visible = item.floats && !sunk;
      if (Number.isInteger(actor.facing)) item.model.rotation.y = facingAngle(actor.facing);
    }
    if (reframe) frameCamera();
    const pos = ref => {
      if (!ref || !Number.isFinite(ref.q) || !Number.isFinite(ref.r)) return null;
      const { x, z } = hexToWorld(ref, ORIGIN);
      return new THREE.Vector3(x, undersea ? cameraDepth : 0, z);
    };
    if (events.length && !reduced.matches) effects.play(events.slice(0, 18), { pos });
    if (reduced.matches) {
      world.position.copy(worldTarget);
      for (const item of models.values()) {
        item.model.position.copy(item.target);
        item.y = item.target.y; item.pitch = item.pitchTarget; item.roll = item.rollTarget;
        item.model.rotation.x = item.pitch; item.model.rotation.z = item.roll;
        anchorSurfaceFoam(item.model);
      }
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
    document.removeEventListener('keydown', toggleHud);
    for (const id of [...models.keys()]) removeModel(id);
    effects.dispose();
    shipAssets.dispose();
    water.geometry.dispose(); water.material.dispose(); water.material.uniforms.normalSampler.value.dispose();
    ceiling.geometry.dispose(); ceiling.material.dispose();
    sky.geometry.dispose(); sky.material.dispose();
    envTarget?.dispose(); pmrem.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    hud.remove();
    disposed = true;
  }
  if (import.meta.env?.DEV) window.__battle3d = { scene, camera, renderer, controls, sky, water, models, effects, get look() { return look; } };
  return { start, stop, sync, resetCamera: frameCamera, resize, dispose };
}
