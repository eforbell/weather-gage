import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createActorModel, disposeActorModel } from './battle-models.js';

export const SHIP_ASSET_REGISTRY = Object.freeze({
  sail: Object.freeze({}),
  ironclad: Object.freeze({}),
  dreadnought: Object.freeze({}),
  modern: Object.freeze({}),
  coldwar: Object.freeze({}),
});

export const SHIP_ASSET_DECODERS = Object.freeze({
  basisTranscoderPath: '',
  meshopt: 'three/addons/libs/meshopt_decoder.module.js',
});

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function hasUrlScheme(url) {
  return URL_SCHEME.test(String(url || ''));
}

function assertLocalPath(path, name) {
  if (path == null || path === '') return;
  if (hasUrlScheme(path) || String(path).startsWith('//')) throw new Error(`${name} must be a local path, not a URL`);
}

function assertSameOriginOrLocal(path, name) {
  const value = String(path || '');
  if (!value || value.startsWith('blob:') || value.startsWith('data:')) return value;
  if (value.startsWith('//')) throw new Error(`${name} must stay on the local origin`);
  if (!hasUrlScheme(value)) return value;
  if (globalThis.location) {
    const url = new URL(value, globalThis.location.href);
    if (url.origin === globalThis.location.origin) return value;
  }
  throw new Error(`${name} must stay on the local origin`);
}

function createLocalAssetManager(manager) {
  if (manager) return manager;
  const loadingManager = new THREE.LoadingManager();
  loadingManager.setURLModifier(url => assertSameOriginOrLocal(url, 'ship asset dependency'));
  return loadingManager;
}

function actorKeys(actor) {
  const publicName = String(actor?.name || '').toLowerCase();
  const className = String(actor?.className || '').toLowerCase();
  const type = String(actor?.type || '').toLowerCase();
  return [...new Set([publicName, className, type].filter(Boolean))];
}

export function normalizeShipAssetSpec(spec) {
  if (!spec) return null;
  assertLocalPath(spec.url, 'ship asset url');
  const scale = Number.isFinite(spec.scale) ? spec.scale : 1;
  const size = spec.size || (Number.isFinite(spec.length) && Number.isFinite(spec.width) ? { length: spec.length * scale, width: spec.width * scale } : null);
  return Object.freeze({
    ...spec,
    scale,
    waterlineY: Number.isFinite(spec.waterlineY) ? spec.waterlineY : 0,
    rotationY: Number.isFinite(spec.rotationY) ? spec.rotationY : 0,
    size,
    dimensions: Object.freeze({
      lengthMeters: Number.isFinite(spec.lengthMeters) ? spec.lengthMeters : null,
      beamMeters: Number.isFinite(spec.beamMeters) ? spec.beamMeters : null,
    }),
  });
}

export function shipAssetSpecFor(actor, era, registry = SHIP_ASSET_REGISTRY) {
  const eraRegistry = registry?.[era] || {};
  for (const key of actorKeys(actor)) if (eraRegistry[key]) return normalizeShipAssetSpec(eraRegistry[key]);
  return null;
}

export function hasShipAsset(actor, era, registry = SHIP_ASSET_REGISTRY) {
  const eraRegistry = registry?.[era] || {};
  return actorKeys(actor).some(key => !!eraRegistry[key]);
}

function cloneMaterial(material) {
  if (Array.isArray(material)) return material.map(m => m?.clone?.() || m);
  return material?.clone?.() || material;
}

function applySpecTransform(child, spec) {
  child.scale.multiplyScalar(spec.scale);
  child.rotation.y += spec.rotationY;
  child.position.y -= spec.waterlineY * spec.scale;
}

export function cloneShipAsset(source, spec = normalizeShipAssetSpec({ url: './procedural.glb' })) {
  const normalized = normalizeShipAssetSpec(spec);
  const child = (source.scene || source).clone(true);
  child.traverse(item => {
    if (item.isMesh || item.isLine || item.isPoints) {
      if (item.material) item.material = cloneMaterial(item.material);
    }
    if (item.isMesh) {
      item.castShadow = true;
      item.receiveShadow = true;
    }
  });
  applySpecTransform(child, normalized);

  const wrapper = new THREE.Group();
  wrapper.rotation.order = 'YXZ';
  wrapper.add(child);
  wrapper.userData = {
    shipAssetInstance: true,
    shipAssetSpec: normalized,
    shipClass: normalized.className || normalized.key || normalized.url,
    size: normalized.size || child.userData.size,
    dimensions: normalized.dimensions,
  };
  if (Array.isArray(normalized.funnels)) {
    wrapper.userData.funnels = normalized.funnels.map(f => new THREE.Vector3(f.x || 0, f.y || 0, f.z || 0));
  }
  wrapper.userData.radius = new THREE.Box3().setFromObject(wrapper).getBoundingSphere(new THREE.Sphere()).radius || child.userData.radius || 1;
  return wrapper;
}

function collectMaterialTextures(material, textures) {
  for (const value of Object.values(material || {})) {
    if (value?.isTexture) textures.add(value);
  }
}

function disposeAuthoredResources(root, { includeGeometry = false, includeTextures = false } = {}) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse?.(item => {
    if (includeGeometry && item.geometry) geometries.add(item.geometry);
    const material = item.material;
    if (Array.isArray(material)) material.forEach(m => m && materials.add(m));
    else if (material) materials.add(material);
  });
  materials.forEach(m => { if (includeTextures) collectMaterialTextures(m, textures); });
  geometries.forEach(g => g.dispose?.());
  materials.forEach(m => m.dispose?.());
  if (includeTextures) textures.forEach(t => t.dispose?.());
}

export function disposeShipAssetInstance(root) {
  if (root?.userData?.proceduralFallback) {
    disposeActorModel(root);
    return;
  }
  disposeAuthoredResources(root, { includeGeometry: false, includeTextures: false });
}

function createThreeGltfLoader({ renderer, manager, ktx2Loader, meshoptDecoder = MeshoptDecoder, basisTranscoderPath = SHIP_ASSET_DECODERS.basisTranscoderPath } = {}) {
  assertLocalPath(basisTranscoderPath, 'basisTranscoderPath');
  const localManager = createLocalAssetManager(manager);
  const loader = new GLTFLoader(localManager);
  const ktx = ktx2Loader || (renderer ? new KTX2Loader().setTranscoderPath(basisTranscoderPath).detectSupport(renderer) : null);
  if (ktx) loader.setKTX2Loader(ktx);
  if (meshoptDecoder) loader.setMeshoptDecoder(meshoptDecoder);
  return { loader, ktx2Loader: ktx, ownsKtx2Loader: !ktx2Loader && !!ktx };
}

export function createShipAssetManager({
  renderer = null,
  registry = SHIP_ASSET_REGISTRY,
  gltfLoader = null,
  ktx2Loader = null,
  meshoptDecoder = MeshoptDecoder,
  basisTranscoderPath = SHIP_ASSET_DECODERS.basisTranscoderPath,
  fallbackFactory = createActorModel,
} = {}) {
  const loaderBundle = gltfLoader ? { loader: gltfLoader, ktx2Loader, ownsKtx2Loader: false } : createThreeGltfLoader({ renderer, ktx2Loader, meshoptDecoder, basisTranscoderPath });
  const cache = new Map();
  const templates = new Set();
  let generation = 0;
  let disposed = false;

  const fallback = (actor, era) => {
    const model = fallbackFactory(actor, era);
    model.userData = { ...model.userData, proceduralFallback: true, shipAssetInstance: true };
    return model;
  };

  async function loadTemplate(spec) {
    const normalized = normalizeShipAssetSpec(spec);
    if (!normalized?.url) return null;
    if (!cache.has(normalized.url)) {
      const pending = loaderBundle.loader.loadAsync(normalized.url).then(gltf => {
        const template = gltf.scene || gltf.scenes?.[0];
        if (!template) throw new Error(`glTF ship asset has no scene: ${normalized.url}`);
        template.userData = { ...template.userData, shipAssetUrl: normalized.url, shipAssetSpec: normalized };
        if (disposed) {
          disposeAuthoredResources(template, { includeGeometry: true, includeTextures: true });
          return null;
        }
        templates.add(template);
        return template;
      });
      cache.set(normalized.url, pending);
    }
    return cache.get(normalized.url);
  }

  async function createModel(actor, era, token = generation) {
    if (disposed || token !== generation) return null;
    if (!actor?.own && actor?.uncertain) return fallback(actor, era);
    let spec = null;
    try {
      spec = shipAssetSpecFor(actor, era, registry);
    } catch (error) {
      console.warn(`Falling back to procedural ship model for ${actor?.name || actor?.id || actor?.type || 'ship'}: ${error.message}`);
      return disposed || token !== generation ? null : fallback(actor, era);
    }
    if (!spec) return fallback(actor, era);
    try {
      const template = await loadTemplate(spec);
      if (disposed || token !== generation || !template) return null;
      const instance = cloneShipAsset(template, spec);
      instance.userData = { ...instance.userData, shipAssetSpec: spec, type: actor.type, uncertain: actor.uncertain };
      return instance;
    } catch (error) {
      console.warn(`Falling back to procedural ship model for ${actor?.name || actor?.id || actor?.type || 'ship'}: ${error.message}`);
      return disposed || token !== generation ? null : fallback(actor, era);
    }
  }

  function beginSceneLoad() {
    generation += 1;
    return generation;
  }

  function isStale(token) {
    return disposed || token !== generation;
  }

  function dispose() {
    disposed = true;
    generation += 1;
    cache.clear();
    templates.forEach(template => disposeAuthoredResources(template, { includeGeometry: true, includeTextures: true }));
    templates.clear();
    if (loaderBundle.ownsKtx2Loader) loaderBundle.ktx2Loader?.dispose?.();
  }

  return { createModel, beginSceneLoad, isStale, dispose, registry, cache };
}
