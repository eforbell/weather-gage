import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SCENARIO_SETUPS } from '../src/sim/scenarios.js';
import { createGame, getView } from '../src/sim/engine.js';
import { battleActors, modelMetersToWorld } from '../src/ui/battle-presentation.js';
import { SHIP_ASSET_REGISTRY, shipAssetSpecFor, cloneShipAsset, adoptAuthoredModel, createShipAssetManager, disposeShipAssetInstance } from '../src/ui/ship-assets.js';
import { createActorModel, disposeActorModel } from '../src/ui/battle-models.js';
import { loadShipSpec, shipGunCount } from '../scripts/ship-asset-report.mjs';

const fleet = SCENARIO_SETUPS.convoy.ships;
const idFor = s => s.name.toLowerCase().replaceAll(' ', '-');
async function gltfFor(ship) {
  const id = idFor(ship), bytes = await readFile(`public/assets/ships/ww2/${id}.glb`);
  return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength), '');
}

test('every Wolf Pack hull is an exact-name WWII asset without replacing older fleet entries', () => {
  assert.equal(fleet.length, 14);
  const ids = [];
  for (const ship of fleet) {
    assert.ok(Object.hasOwn(SHIP_ASSET_REGISTRY.ww2,ship.name.toLowerCase()), ship.name);
    const entry = shipAssetSpecFor(ship,'ww2');
    assert.equal(entry.specId,idFor(ship));
    assert.equal(entry.era,'ww2');
    assert.equal(entry.units,'meters');
    assert.equal(entry.scale,modelMetersToWorld('ww2'));
    assert.equal(shipAssetSpecFor(ship,'coldwar'),null,'WWII assets do not become Cold War models');
    ids.push(entry.specId);
  }
  assert.equal(new Set(ids).size,14);
  for (const scenario of ['nevis','line','hampton','dogger','esperance']) {
    for (const ship of SCENARIO_SETUPS[scenario].ships) assert.ok(shipAssetSpecFor(ship,ship.era),`${scenario}: ${ship.name}`);
  }
  assert.equal(shipAssetSpecFor({name:'Unresolved contact',type:'submarine'},'ww2'),null);
  assert.equal(shipAssetSpecFor({name:'Unknown freighter',type:'merchant'},'ww2'),null);
});

for (const ship of fleet) {
  test(`${ship.name}: original1942 spec matches scenario battery`, async () => {
    const spec = await loadShipSpec(idFor(ship));
    assert.equal(spec.era,'ww2');
    assert.equal(shipGunCount(spec),ship.guns);
    assert.match(spec.configuration,/1942/);
    const provenance = await readFile(`ships/${spec.id}/PROVENANCE.md`,'utf8');
    assert.match(provenance,/original/i);
    assert.match(provenance,/approxi|simplif|inspired|faithful|reconstruction/i);
    if (ship.guns === 0) {
      assert.equal((spec.turrets || []).length,0);
      assert.equal((spec.deckGuns || []).length,0);
      assert.equal((spec.batteries || []).length,0);
    }
  });
  if (ship.type === 'submarine') {
    test(`${ship.name}: surfaced U-boat has scopes, no funnel smoke, and true small-hull scale`, async () => {
      const spec = await loadShipSpec(idFor(ship)), {scene} = await gltfFor(ship);
      const instance = cloneShipAsset(scene,shipAssetSpecFor({...ship,own:true},'ww2'));
      try {
        assert.equal((spec.funnels || []).length,0);
        assert.equal((instance.userData.funnels || []).length,0);
        assert.ok(spec.masts.length >= 2,'two supported periscope poles');
        for (const mast of spec.masts) assert.ok(instance.userData.anchors[`mast_${mast.id}`],mast.id);
        assert.ok(spec.hull.length / spec.hull.beam > 9,'slender pressure-hull silhouette');
        assert.ok(spec.hull.length < 75,'boat does not inherit a destroyer/cruiser hull');
        assert.ok(Math.abs(instance.userData.size.length-spec.hull.length*modelMetersToWorld('ww2'))<1e-6);
      } finally {disposeShipAssetInstance(instance);}
    });
  }
  if (ship.guns > 0) {
    test(`${ship.name}: exported escort barrels are exposed above surrounding fittings`, async () => {
      const spec=await loadShipSpec(idFor(ship)),{scene}=await gltfFor(ship);scene.updateMatrixWorld(true);
      const type=spec.turretType;
      for(const turret of spec.turrets){
        const axis=scene.getObjectByName(`anchor_turret_${turret.id}`).getWorldPosition(new THREE.Vector3());
        const direction=turret.facing==='aft'?1:-1,sides=turret.guns===1?[0]:turret.guns===2?[-1,1]:[-2,0,2];
        for(const side of sides)for(const fraction of [.2,.5,.9]){
          const extension=1.3+(type.barrelLength-1.3)*fraction,x=(turret.side||0)+side*type.gunSpacing/2,z=axis.z-direction*(type.barrelLength-extension);
          const hit=new THREE.Raycaster(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0)).intersectObject(scene,true)[0];
          assert.ok(hit,`${turret.id}: barrel geometry exists`);
          assert.ok(hit.point.y>=axis.y-.02&&hit.point.y<=axis.y+type.barrelRadius+.12,`${turret.id}: barrel${side} is buried/obstructed (top${hit.point.y}, axis${axis.y})`);
        }
      }
    });
  }
}

test('Wolf Pack portraits preserve uncertainty and request-failure fallback', async () => {
  const requests=[];
  const manager=createShipAssetManager({gltfLoader:{async loadAsync(url){requests.push(url);throw new Error('missing convoy asset');}},fallbackFactory:()=>new THREE.Group()});
  try{
    for(const ship of fleet){const model=await manager.createModel({...ship,own:false,uncertain:true},'ww2');assert.equal(model.userData.proceduralFallback,true);disposeShipAssetInstance(model);}
    assert.equal(requests.length,0);
    for(const ship of fleet){const model=await manager.createModel({...ship,own:true},'ww2');assert.equal(model.userData.proceduralFallback,true);disposeShipAssetInstance(model);}
    assert.equal(new Set(requests).size,14);
  }finally{manager.dispose();}
});

test('an identified submerged enemy remains a sensor report, not an authored surface hull', () => {
  const state=createGame('convoy',1942),view=getView(state,'blue','b_walker');
  const contact={id:'uboat-report',name:'U-96',className:'Type VII U-boat',q:14,r:9,confidence:'identified',stale:false,uncertainty:0};
  const dry=battleActors({...view,contacts:[contact]},'b_walker');
  assert.ok(dry.actors.some(a=>a.id===contact.id));
  const submerged=battleActors({...view,contacts:[{...contact,submerged:true}]},'b_walker');
  assert.ok(!submerged.actors.some(a=>a.id===contact.id));
  // WWII captains choose when to dive; this fixture presents that public state.
  const deep=structuredClone(state);deep.ships.find(s=>s.id==='r_u96').doctrine.depth='shallow';
  const ownView=getView(deep,'red','r_u96');
  const own=battleActors(ownView,'r_u96');
  assert.equal(own.focus.depth,'shallow');
  assert.ok(own.actors.find(a=>a.id==='r_u96').y<0,'own boat dives rather than floating on the surface');
});


test('loading an authored submerged hull does not re-enable surface foam or wake', async () => {
  const ship=fleet.find(s=>s.id==='r_u96');
  const previous=createActorModel({...ship,own:true},'ww2');
  previous.position.y=-2.7;
  const {scene}=await gltfFor(ship);
  const loaded=adoptAuthoredModel(previous,cloneShipAsset(scene,shipAssetSpecFor({...ship,own:true},'ww2')),{floating:false,underway:false});
  try {
    assert.equal(loaded.position.y,-2.7);
    assert.equal(loaded.userData.waterlineFoam.visible,false);
    assert.equal(loaded.userData.wake.visible,false);
    assert.notEqual(loaded.userData.waterlineFoam,previous.userData.waterlineFoam,'new hull still gets its own contour');
  } finally {
    disposeActorModel(previous);
    for (const key of ['waterlineFoam','wake']) {const effect=loaded.userData[key];if(effect){loaded.remove(effect);disposeActorModel(effect);}}
    disposeShipAssetInstance(loaded);
  }
});
