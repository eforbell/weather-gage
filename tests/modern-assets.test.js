import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SCENARIOS,SCENARIO_SETUPS} from '../src/sim/scenarios.js';
import {SHIP_ASSET_REGISTRY,shipAssetSpecFor,createShipAssetManager,disposeShipAssetInstance} from '../src/ui/ship-assets.js';
import {loadShipSpec,shipGunCount} from '../scripts/ship-asset-report.mjs';
import {SHIP_LENGTH,modelMetersToWorld} from '../src/ui/battle-presentation.js';
const fleet=SCENARIO_SETUPS.strait.ships;
const idFor=s=>s.name.toLowerCase().replaceAll(' ','-');

test('all four Qamar ships resolve by exact name to separate modern assets',()=>{
  assert.equal(fleet.length,4);
  const ids=fleet.map(s=>{assert.ok(Object.hasOwn(SHIP_ASSET_REGISTRY.modern,s.name.toLowerCase()));const e=shipAssetSpecFor(s,'modern');assert.equal(e.specId,idFor(s));assert.equal(e.era,'modern');assert.equal(e.units,'meters');assert.equal(e.scale,SHIP_LENGTH/210);assert.equal(shipAssetSpecFor(s,'coldwar'),null);return e.specId;});
  assert.equal(new Set(ids).size,4);
  assert.equal(shipAssetSpecFor({name:'Unresolved contact',className:'Missile destroyer'},'modern'),null);
  assert.equal(shipAssetSpecFor({name:'Other frigate',type:'frigate'},'modern'),null);
});

for(const ship of fleet){
  const id=idFor(ship);
  test(`${ship.name}: fictional source and declared visual battery are explicit`,async()=>{
    const s=await loadShipSpec(id);
    assert.equal(s.era,'modern');assert.equal(s.guns,1);assert.equal(shipGunCount(s),1);
    assert.equal(s.turrets.length,1);assert.equal(s.turrets[0].guns,1);
    assert.ok(s.hull.length/s.hull.beam>=7,'modern slender hull, not a carrier stand-in');
    assert.ok(s.rig?.spars?.length,'visible original radar/missile fittings');
    const p=await readFile(`ships/${id}/PROVENANCE.md`,'utf8');
    assert.match(p,/original/i);assert.match(p,/fictional/i);assert.match(p,/approxi|simplif|guess|inspired|readab/i);
  });
  test(`${ship.name}: actual forward barrel stays exposed above the deck/fittings`,async()=>{
    const s=await loadShipSpec(id),b=await readFile(`public/assets/ships/modern/${id}.glb`),{scene}=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');scene.updateMatrixWorld(true);
    const turret=s.turrets[0],t=s.turretType,a=scene.getObjectByName('anchor_turret_'+turret.id).getWorldPosition(new THREE.Vector3()),d=turret.facing==='aft'?1:-1;
    for(const f of [.2,.5,.9]){const e=1.3+(t.barrelLength-1.3)*f,z=a.z-d*(t.barrelLength-e),hit=new THREE.Raycaster(new THREE.Vector3(turret.side||0,100,z),new THREE.Vector3(0,-1,0)).intersectObject(scene,true)[0];assert.ok(hit);assert.ok(hit.point.y>=a.y-.02&&hit.point.y<=a.y+t.barrelRadius+.12,`${turret.id} blocked/missing barrel: axis${a.y}, top${hit.point.y}`);}
  });
}

test('modern fleet keeps destroyers larger than frigate and corvette at a single scale',async()=>{
  const [v,k,s,m]=await Promise.all(['bns-valiant','bns-kestrel','rns-shahin','rns-miraj'].map(loadShipSpec));
  assert.ok(v.hull.length>k.hull.length&&s.hull.length>k.hull.length);assert.ok(k.hull.length>m.hull.length);assert.ok(v.hull.beam>m.hull.beam);
  const f=modelMetersToWorld('modern');assert.equal(f,SHIP_LENGTH/210);assert.ok(m.hull.length*f<k.hull.length*f);
});

test('modern assets preserve uncertainty and failed-request fallback',async()=>{
  const requests=[],manager=createShipAssetManager({gltfLoader:{async loadAsync(url){requests.push(url);throw Error('missing modern asset');}},fallbackFactory:()=>new THREE.Group()});
  try{for(const s of fleet){const m=await manager.createModel({...s,own:false,uncertain:true},'modern');assert.equal(m.userData.proceduralFallback,true);disposeShipAssetInstance(m);}assert.equal(requests.length,0);for(const s of fleet){const m=await manager.createModel({...s,own:true},'modern');assert.equal(m.userData.proceduralFallback,true);disposeShipAssetInstance(m);}assert.equal(new Set(requests).size,4);}finally{manager.dispose();}
});

test('all non-Cold-War missions keep complete authored ship coverage',()=>{
  for(const sc of SCENARIOS.filter(s=>s.era!=='coldwar'))for(const ship of SCENARIO_SETUPS[sc.id].ships)assert.ok(shipAssetSpecFor(ship,sc.era),`${sc.id}: ${ship.name}`);
});
