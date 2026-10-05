import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { modelMetersToWorld } from './battle-presentation.js';
import { createActorModel, createSurfaceEffects, disposeActorModel } from './battle-models.js';

// Authored hero models, built headlessly from ships/<id>/spec.json by
// `npm run ship:build -- <id>` (docs/ship-pipeline.md). Keys are lower-case
// public names; uncertain contacts never load these.
export const SHIP_ASSET_REGISTRY = Object.freeze({
  sail: Object.freeze({
    'uss constellation': Object.freeze({
      url: 'assets/ships/sail/uss-constellation.glb',
      era: 'sail',
      specId: 'uss-constellation',
      className: 'Humphreys heavy frigate (38)',
      units: 'meters',
      lengthMeters: 50,
      beamMeters: 12.5,
      length: 50,
      width: 12.5,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-constellation/spec.json; see ships/uss-constellation/PROVENANCE.md',
    }),
    'uss baltimore': Object.freeze({
      url: 'assets/ships/sail/uss-baltimore.glb',
      era: 'sail',
      specId: 'uss-baltimore',
      className: 'American frigate (32)',
      units: 'meters',
      lengthMeters: 42,
      beamMeters: 10.5,
      length: 42,
      width: 10.5,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-baltimore/spec.json; see ships/uss-baltimore/PROVENANCE.md',
    }),
    'l’insurgente': Object.freeze({
      url: 'assets/ships/sail/linsurgente.glb',
      era: 'sail',
      specId: 'linsurgente',
      className: 'French 12-pounder frigate (40)',
      units: 'meters',
      lengthMeters: 47.5,
      beamMeters: 11.9,
      length: 47.5,
      width: 11.9,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/linsurgente/spec.json; see ships/linsurgente/PROVENANCE.md',
    }),
    'volontaire': Object.freeze({
      url: 'assets/ships/sail/volontaire.glb',
      era: 'sail',
      specId: 'volontaire',
      className: 'French frigate (32)',
      units: 'meters',
      lengthMeters: 45,
      beamMeters: 11.27,
      length: 45,
      width: 11.27,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/volontaire/spec.json; see ships/volontaire/PROVENANCE.md',
    }),
    'hms bellerophon': Object.freeze({
      url: 'assets/ships/sail/british-74.glb',
      era: 'sail',
      specId: 'british-74',
      className: 'Third-rate ship of the line (74)',
      units: 'meters',
      lengthMeters: 53,
      beamMeters: 14.6,
      length: 53,
      width: 14.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/british-74/spec.json; see ships/british-74/PROVENANCE.md',
    }),
    'hms marlborough': Object.freeze({
      url: 'assets/ships/sail/british-74.glb',
      era: 'sail',
      specId: 'british-74',
      className: 'Third-rate ship of the line (74)',
      units: 'meters',
      lengthMeters: 53,
      beamMeters: 14.6,
      length: 53,
      width: 14.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/british-74/spec.json; see ships/british-74/PROVENANCE.md',
    }),
    'hms russell': Object.freeze({
      url: 'assets/ships/sail/british-74.glb',
      era: 'sail',
      specId: 'british-74',
      className: 'Third-rate ship of the line (74)',
      units: 'meters',
      lengthMeters: 53,
      beamMeters: 14.6,
      length: 53,
      width: 14.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/british-74/spec.json; see ships/british-74/PROVENANCE.md',
    }),
    'le vengeur du peuple': Object.freeze({
      url: 'assets/ships/sail/french-74.glb',
      era: 'sail',
      specId: 'french-74',
      className: 'Téméraire-class ship of the line (74)',
      units: 'meters',
      lengthMeters: 53,
      beamMeters: 14.6,
      length: 53,
      width: 14.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/french-74/spec.json; see ships/french-74/PROVENANCE.md',
    }),
    'l’achille': Object.freeze({
      url: 'assets/ships/sail/french-74.glb',
      era: 'sail',
      specId: 'french-74',
      className: 'Téméraire-class ship of the line (74)',
      units: 'meters',
      lengthMeters: 53,
      beamMeters: 14.6,
      length: 53,
      width: 14.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/french-74/spec.json; see ships/french-74/PROVENANCE.md',
    }),
    'le northumberland': Object.freeze({
      url: 'assets/ships/sail/french-74.glb',
      era: 'sail',
      specId: 'french-74',
      className: 'Téméraire-class ship of the line (74)',
      units: 'meters',
      lengthMeters: 53,
      beamMeters: 14.6,
      length: 53,
      width: 14.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/french-74/spec.json; see ships/french-74/PROVENANCE.md',
    }),
  }),
  ironclad: Object.freeze({
    'uss congress': Object.freeze({
      url: 'assets/ships/ironclad/uss-congress.glb',
      era: 'ironclad',
      specId: 'uss-congress',
      className: 'Frigate (1841)',
      units: 'meters',
      lengthMeters: 54,
      beamMeters: 14.9,
      length: 54,
      width: 14.9,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-congress/spec.json; see ships/uss-congress/PROVENANCE.md',
    }),
    'uss cumberland': Object.freeze({
      url: 'assets/ships/ironclad/uss-cumberland.glb',
      era: 'ironclad',
      specId: 'uss-cumberland',
      className: 'Sloop of war (razeed frigate)',
      units: 'meters',
      lengthMeters: 53,
      beamMeters: 13.4,
      length: 53,
      width: 13.4,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-cumberland/spec.json; see ships/uss-cumberland/PROVENANCE.md',
    }),
    'css virginia': Object.freeze({
      url: 'assets/ships/ironclad/css-virginia.glb',
      era: 'ironclad',
      specId: 'css-virginia',
      className: 'Casemate ironclad (ex-Merrimack)',
      units: 'meters',
      lengthMeters: 83.8,
      beamMeters: 15.6,
      length: 83.8,
      width: 15.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/css-virginia/spec.json; see ships/css-virginia/PROVENANCE.md',
    }),
    'css patrick henry': Object.freeze({
      url: 'assets/ships/ironclad/css-patrick-henry.glb',
      era: 'ironclad',
      specId: 'css-patrick-henry',
      className: 'Side-wheel gunboat (ex-Yorktown)',
      units: 'meters',
      lengthMeters: 76,
      beamMeters: 10.4,
      length: 76,
      width: 10.4,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/css-patrick-henry/spec.json; see ships/css-patrick-henry/PROVENANCE.md',
    }),
    'css jamestown': Object.freeze({
      url: 'assets/ships/ironclad/css-jamestown.glb',
      era: 'ironclad',
      specId: 'css-jamestown',
      className: 'Side-wheel gunboat (ex-Thomas Jefferson)',
      units: 'meters',
      lengthMeters: 73,
      beamMeters: 10,
      length: 73,
      width: 10,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/css-jamestown/spec.json; see ships/css-jamestown/PROVENANCE.md',
    }),
    'uss minnesota': Object.freeze({
      url: 'assets/ships/ironclad/uss-minnesota.glb',
      era: 'ironclad',
      specId: 'uss-minnesota',
      className: 'Screw steam frigate (Merrimack class)',
      units: 'meters',
      lengthMeters: 80.5,
      beamMeters: 15.5,
      length: 80.5,
      width: 15.5,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-minnesota/spec.json; see ships/uss-minnesota/PROVENANCE.md',
    }),
    'uss monitor': Object.freeze({
      url: 'assets/ships/ironclad/uss-monitor.glb',
      era: 'ironclad',
      specId: 'uss-monitor',
      className: 'Turret ironclad (Ericsson)',
      units: 'meters',
      lengthMeters: 52.4,
      beamMeters: 12.6,
      length: 52.4,
      width: 12.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-monitor/spec.json; see ships/uss-monitor/PROVENANCE.md',
    }),
  }),
  dreadnought: Object.freeze({
    'hms lion': Object.freeze({
      url: 'assets/ships/dreadnought/hms-lion.glb',
      era: 'dreadnought',
      specId: 'hms-lion',
      className: 'Lion-class battlecruiser',
      units: 'meters',
      lengthMeters: 213.4,
      beamMeters: 27,
      length: 213.4,
      width: 27,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hms-lion/spec.json; see ships/hms-lion/PROVENANCE.md',
    }),
    'sms seydlitz': Object.freeze({
      url: 'assets/ships/dreadnought/sms-seydlitz.glb',
      era: 'dreadnought',
      specId: 'sms-seydlitz',
      className: 'Seydlitz-class battlecruiser',
      units: 'meters',
      lengthMeters: 200.6,
      beamMeters: 28.5,
      length: 200.6,
      width: 28.5,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/sms-seydlitz/spec.json; see ships/sms-seydlitz/PROVENANCE.md',
    }),
    'hms orion': Object.freeze({
      url: 'assets/ships/dreadnought/hms-orion.glb',
      era: 'dreadnought',
      specId: 'hms-orion',
      className: 'Orion-class dreadnought battleship',
      units: 'meters',
      lengthMeters: 177.1,
      beamMeters: 27,
      length: 177.1,
      width: 27,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hms-orion/spec.json; see ships/hms-orion/PROVENANCE.md',
    }),
    'sms posen': Object.freeze({
      url: 'assets/ships/dreadnought/sms-posen.glb',
      era: 'dreadnought',
      specId: 'sms-posen',
      className: 'Nassau-class dreadnought battleship',
      units: 'meters',
      lengthMeters: 146.1,
      beamMeters: 26.9,
      length: 146.1,
      width: 26.9,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/sms-posen/spec.json; see ships/sms-posen/PROVENANCE.md',
    }),
    'hms meteor': Object.freeze({
      url: 'assets/ships/dreadnought/hms-meteor.glb',
      era: 'dreadnought',
      specId: 'hms-meteor',
      className: 'Thornycroft M-class destroyer',
      units: 'meters',
      lengthMeters: 83.6,
      beamMeters: 8.3,
      length: 83.6,
      width: 8.3,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hms-meteor/spec.json; see ships/hms-meteor/PROVENANCE.md',
    }),
    'hms laurel': Object.freeze({
      url: 'assets/ships/dreadnought/hms-laurel.glb',
      era: 'dreadnought',
      specId: 'hms-laurel',
      className: 'Laforey-class destroyer',
      units: 'meters',
      lengthMeters: 81.9,
      beamMeters: 8.4,
      length: 81.9,
      width: 8.4,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hms-laurel/spec.json; see ships/hms-laurel/PROVENANCE.md',
    }),
    'sms v186': Object.freeze({
      url: 'assets/ships/dreadnought/sms-v186.glb',
      era: 'dreadnought',
      specId: 'sms-v186',
      className: 'S-138-class large torpedo boat',
      units: 'meters',
      lengthMeters: 73.9,
      beamMeters: 7.9,
      length: 73.9,
      width: 7.9,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/sms-v186/spec.json; see ships/sms-v186/PROVENANCE.md',
    }),
    'sms s33': Object.freeze({
      url: 'assets/ships/dreadnought/sms-s33.glb',
      era: 'dreadnought',
      specId: 'sms-s33',
      className: 'V25-class large torpedo boat',
      units: 'meters',
      lengthMeters: 79.6,
      beamMeters: 8.3,
      length: 79.6,
      width: 8.3,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/sms-s33/spec.json; see ships/sms-s33/PROVENANCE.md',
    }),
  }),
  ww2: Object.freeze({
    'uss san francisco': Object.freeze({
      url: 'assets/ships/ww2/uss-san-francisco.glb',
      era: 'ww2',
      specId: 'uss-san-francisco',
      className: 'New Orleans-class heavy cruiser',
      units: 'meters',
      lengthMeters: 179.3,
      beamMeters: 19.1,
      length: 179.3,
      width: 19.1,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-san-francisco/spec.json; see ships/uss-san-francisco/PROVENANCE.md',
    }),
    'uss boise': Object.freeze({
      url: 'assets/ships/ww2/uss-boise.glb',
      era: 'ww2',
      specId: 'uss-boise',
      className: 'Brooklyn-class light cruiser',
      units: 'meters',
      lengthMeters: 185.4,
      beamMeters: 18.8,
      length: 185.4,
      width: 18.8,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-boise/spec.json; see ships/uss-boise/PROVENANCE.md',
    }),
    'uss salt lake city': Object.freeze({
      url: 'assets/ships/ww2/uss-salt-lake-city.glb',
      era: 'ww2',
      specId: 'uss-salt-lake-city',
      className: 'Pensacola-class heavy cruiser',
      units: 'meters',
      lengthMeters: 178.5,
      beamMeters: 19.9,
      length: 178.5,
      width: 19.9,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-salt-lake-city/spec.json; see ships/uss-salt-lake-city/PROVENANCE.md',
    }),
    'uss helena': Object.freeze({
      url: 'assets/ships/ww2/uss-helena.glb',
      era: 'ww2',
      specId: 'uss-helena',
      className: 'St. Louis-subclass Brooklyn-class light cruiser',
      units: 'meters',
      lengthMeters: 185.1,
      beamMeters: 18.8,
      length: 185.1,
      width: 18.8,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-helena/spec.json; see ships/uss-helena/PROVENANCE.md',
    }),
    'uss farenholt': Object.freeze({
      url: 'assets/ships/ww2/uss-farenholt.glb',
      era: 'ww2',
      specId: 'uss-farenholt',
      className: 'Benson/Gleaves-family destroyer',
      units: 'meters',
      lengthMeters: 108,
      beamMeters: 11,
      length: 108,
      width: 11,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-farenholt/spec.json; see ships/uss-farenholt/PROVENANCE.md',
    }),
    'uss duncan': Object.freeze({
      url: 'assets/ships/ww2/uss-duncan.glb',
      era: 'ww2',
      specId: 'uss-duncan',
      className: 'Gleaves-class destroyer',
      units: 'meters',
      lengthMeters: 106.2,
      beamMeters: 11,
      length: 106.2,
      width: 11,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-duncan/spec.json; see ships/uss-duncan/PROVENANCE.md',
    }),
    'uss laffey': Object.freeze({
      url: 'assets/ships/ww2/uss-laffey.glb',
      era: 'ww2',
      specId: 'uss-laffey',
      className: 'Benson-class destroyer',
      units: 'meters',
      lengthMeters: 107,
      beamMeters: 11,
      length: 107,
      width: 11,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/uss-laffey/spec.json; see ships/uss-laffey/PROVENANCE.md',
    }),
    'aoba': Object.freeze({
      url: 'assets/ships/ww2/aoba.glb',
      era: 'ww2',
      specId: 'aoba',
      className: 'Aoba-class heavy cruiser',
      units: 'meters',
      lengthMeters: 185.17,
      beamMeters: 17.56,
      length: 185.17,
      width: 17.56,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/aoba/spec.json; see ships/aoba/PROVENANCE.md',
    }),
    'furutaka': Object.freeze({
      url: 'assets/ships/ww2/furutaka.glb',
      era: 'ww2',
      specId: 'furutaka',
      className: 'Furutaka-class heavy cruiser',
      units: 'meters',
      lengthMeters: 181.8,
      beamMeters: 16.93,
      length: 181.8,
      width: 16.93,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/furutaka/spec.json; see ships/furutaka/PROVENANCE.md',
    }),
    'kinugasa': Object.freeze({
      url: 'assets/ships/ww2/kinugasa.glb',
      era: 'ww2',
      specId: 'kinugasa',
      className: 'Aoba-class heavy cruiser',
      units: 'meters',
      lengthMeters: 185.17,
      beamMeters: 17.56,
      length: 185.17,
      width: 17.56,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/kinugasa/spec.json; see ships/kinugasa/PROVENANCE.md',
    }),
    'fubuki': Object.freeze({
      url: 'assets/ships/ww2/fubuki.glb',
      era: 'ww2',
      specId: 'fubuki',
      className: 'Fubuki-class destroyer',
      units: 'meters',
      lengthMeters: 118.4,
      beamMeters: 10.4,
      length: 118.4,
      width: 10.4,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/fubuki/spec.json; see ships/fubuki/PROVENANCE.md',
    }),
    'hatsuyuki': Object.freeze({
      url: 'assets/ships/ww2/hatsuyuki.glb',
      era: 'ww2',
      specId: 'hatsuyuki',
      className: 'Fubuki-class destroyer',
      units: 'meters',
      lengthMeters: 118,
      beamMeters: 10.35,
      length: 118,
      width: 10.35,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hatsuyuki/spec.json; see ships/hatsuyuki/PROVENANCE.md',
    }),
    'ss empire ocelot': Object.freeze({
      url: 'assets/ships/ww2/ss-empire-ocelot.glb',
      era: 'ww2',
      specId: 'ss-empire-ocelot',
      className: 'Empire-style North Atlantic tramp freighter',
      units: 'meters',
      lengthMeters: 138,
      beamMeters: 18.4,
      length: 138,
      width: 18.4,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/ss-empire-ocelot/spec.json; see ships/ss-empire-ocelot/PROVENANCE.md',
    }),
    'ss baron ogilvy': Object.freeze({
      url: 'assets/ships/ww2/ss-baron-ogilvy.glb',
      era: 'ww2',
      specId: 'ss-baron-ogilvy',
      className: 'Baron-line inspired coal tramp steamer',
      units: 'meters',
      lengthMeters: 126,
      beamMeters: 16.2,
      length: 126,
      width: 16.2,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/ss-baron-ogilvy/spec.json; see ships/ss-baron-ogilvy/PROVENANCE.md',
    }),
    'ss clan macnab': Object.freeze({
      url: 'assets/ships/ww2/ss-clan-macnab.glb',
      era: 'ww2',
      specId: 'ss-clan-macnab',
      className: 'Clan-line inspired cargo liner',
      units: 'meters',
      lengthMeters: 136,
      beamMeters: 17.7,
      length: 136,
      width: 17.7,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/ss-clan-macnab/spec.json; see ships/ss-clan-macnab/PROVENANCE.md',
    }),
    'ss trevisa': Object.freeze({
      url: 'assets/ships/ww2/ss-trevisa.glb',
      era: 'ww2',
      specId: 'ss-trevisa',
      className: 'Short wartime coastal tramp freighter',
      units: 'meters',
      lengthMeters: 112,
      beamMeters: 15.6,
      length: 112,
      width: 15.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/ss-trevisa/spec.json; see ships/ss-trevisa/PROVENANCE.md',
    }),
    'ss hartington': Object.freeze({
      url: 'assets/ships/ww2/ss-hartington.glb',
      era: 'ww2',
      specId: 'ss-hartington',
      className: 'Hartington-style broad cargo steamer',
      units: 'meters',
      lengthMeters: 119,
      beamMeters: 16.9,
      length: 119,
      width: 16.9,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/ss-hartington/spec.json; see ships/ss-hartington/PROVENANCE.md',
    }),
    'ss bretwalda': Object.freeze({
      url: 'assets/ships/ww2/ss-bretwalda.glb',
      era: 'ww2',
      specId: 'ss-bretwalda',
      className: 'Bretwalda-inspired small tramp freighter',
      units: 'meters',
      lengthMeters: 106,
      beamMeters: 15.2,
      length: 106,
      width: 15.2,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/ss-bretwalda/spec.json; see ships/ss-bretwalda/PROVENANCE.md',
    }),
    'hms walker': Object.freeze({
      url: 'assets/ships/ww2/hms-walker.glb',
      era: 'ww2',
      specId: 'hms-walker',
      className: 'V/W-class escort destroyer',
      units: 'meters',
      lengthMeters: 95,
      beamMeters: 8.6,
      length: 95,
      width: 8.6,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hms-walker/spec.json; see ships/hms-walker/PROVENANCE.md',
    }),
    'hms stork': Object.freeze({
      url: 'assets/ships/ww2/hms-stork.glb',
      era: 'ww2',
      specId: 'hms-stork',
      className: 'Bittern-class sloop',
      units: 'meters',
      lengthMeters: 86,
      beamMeters: 11,
      length: 86,
      width: 11,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hms-stork/spec.json; see ships/hms-stork/PROVENANCE.md',
    }),
    'hmcs sackville': Object.freeze({
      url: 'assets/ships/ww2/hmcs-sackville.glb',
      era: 'ww2',
      specId: 'hmcs-sackville',
      className: 'Flower-class corvette',
      units: 'meters',
      lengthMeters: 62.5,
      beamMeters: 10.1,
      length: 62.5,
      width: 10.1,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hmcs-sackville/spec.json; see ships/hmcs-sackville/PROVENANCE.md',
    }),
    'hms gentian': Object.freeze({
      url: 'assets/ships/ww2/hms-gentian.glb',
      era: 'ww2',
      specId: 'hms-gentian',
      className: 'Flower-class corvette',
      units: 'meters',
      lengthMeters: 62.5,
      beamMeters: 9.9,
      length: 62.5,
      width: 9.9,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/hms-gentian/spec.json; see ships/hms-gentian/PROVENANCE.md',
    }),
    'u-96': Object.freeze({
      url: 'assets/ships/ww2/u-96.glb',
      era: 'ww2',
      specId: 'u-96',
      className: 'Type VII-style U-boat',
      units: 'meters',
      lengthMeters: 67.1,
      beamMeters: 6.2,
      length: 67.1,
      width: 6.2,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/u-96/spec.json; see ships/u-96/PROVENANCE.md',
    }),
    'u-201': Object.freeze({
      url: 'assets/ships/ww2/u-201.glb',
      era: 'ww2',
      specId: 'u-201',
      className: 'Type VII-style U-boat',
      units: 'meters',
      lengthMeters: 67.1,
      beamMeters: 6.2,
      length: 67.1,
      width: 6.2,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/u-201/spec.json; see ships/u-201/PROVENANCE.md',
    }),
    'u-552': Object.freeze({
      url: 'assets/ships/ww2/u-552.glb',
      era: 'ww2',
      specId: 'u-552',
      className: 'Type VII-style U-boat',
      units: 'meters',
      lengthMeters: 67.1,
      beamMeters: 6.2,
      length: 67.1,
      width: 6.2,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/u-552/spec.json; see ships/u-552/PROVENANCE.md',
    }),
    'u-432': Object.freeze({
      url: 'assets/ships/ww2/u-432.glb',
      era: 'ww2',
      specId: 'u-432',
      className: 'Type VII-style U-boat',
      units: 'meters',
      lengthMeters: 67.1,
      beamMeters: 6.2,
      length: 67.1,
      width: 6.2,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/u-432/spec.json; see ships/u-432/PROVENANCE.md',
    }),
  }),
  modern: Object.freeze({
    'bns valiant': Object.freeze({
      url: 'assets/ships/modern/bns-valiant.glb',
      era: 'modern',
      specId: 'bns-valiant',
      className: 'Fictional area-defense destroyer',
      units: 'meters',
      lengthMeters: 156,
      beamMeters: 18.4,
      length: 156,
      width: 18.4,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/bns-valiant/spec.json; see ships/bns-valiant/PROVENANCE.md',
    }),
    'bns kestrel': Object.freeze({
      url: 'assets/ships/modern/bns-kestrel.glb',
      era: 'modern',
      specId: 'bns-kestrel',
      className: 'Fictional littoral frigate',
      units: 'meters',
      lengthMeters: 126,
      beamMeters: 14.8,
      length: 126,
      width: 14.8,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/bns-kestrel/spec.json; see ships/bns-kestrel/PROVENANCE.md',
    }),
    'rns shahin': Object.freeze({
      url: 'assets/ships/modern/rns-shahin.glb',
      era: 'modern',
      specId: 'rns-shahin',
      className: 'Qamar fictional missile destroyer',
      units: 'meters',
      lengthMeters: 146,
      beamMeters: 16,
      length: 146,
      width: 16,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/rns-shahin/spec.json; see ships/rns-shahin/PROVENANCE.md',
    }),
    'rns miraj': Object.freeze({
      url: 'assets/ships/modern/rns-miraj.glb',
      era: 'modern',
      specId: 'rns-miraj',
      className: 'Qamar fictional missile corvette',
      units: 'meters',
      lengthMeters: 94,
      beamMeters: 10.8,
      length: 94,
      width: 10.8,
      waterlineY: 0,
      rotationY: 0,
      license: 'Original model generated from ships/rns-miraj/spec.json; see ships/rns-miraj/PROVENANCE.md',
    }),
  }),
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

// `era` picks the metre-to-world factor for metre assets (modelMetersToWorld);
// a normalized spec remembers it, so normalizing again is a no-op.
export function normalizeShipAssetSpec(spec, era = spec?.era) {
  if (!spec) return null;
  assertLocalPath(spec.url, 'ship asset url');
  if (!['meters', 'presentation'].includes(spec.units)) throw new Error('ship asset units must be meters or presentation');
  const scale = spec.units === 'meters' ? modelMetersToWorld(era) : (spec.scale === undefined ? 1 : spec.scale);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('ship asset scale must be positive and finite');
  if (spec.units === 'meters' && spec.scale !== undefined && spec.scale !== scale) {
    throw new Error('meter asset scale must use the shared conversion; omit scale');
  }
  const size = spec.size || (Number.isFinite(spec.length) && Number.isFinite(spec.width) ? { length: spec.length * scale, width: spec.width * scale } : null);
  return Object.freeze({
    ...spec,
    ...(era ? { era } : {}),
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

// A classified contact names no ship: she carries the model id of her class
// stand-in (classStandIns), looked up by id rather than by public name.
function registryEntryFor(actor, eraRegistry) {
  if (actor?.assetId) return Object.values(eraRegistry).find(entry => entry.specId === actor.assetId) || null;
  for (const key of actorKeys(actor)) if (eraRegistry[key]) return eraRegistry[key];
  return null;
}

export function shipAssetSpecFor(actor, era, registry = SHIP_ASSET_REGISTRY) {
  const entry = registryEntryFor(actor, registry?.[era] || {});
  return entry ? normalizeShipAssetSpec(entry, era) : null;
}

// The authored model id a ship would load, for choosing class stand-ins.
export function shipAssetIdFor(actor, era, registry = SHIP_ASSET_REGISTRY) {
  return registryEntryFor(actor, registry?.[era] || {})?.specId || null;
}

export function hasShipAsset(actor, era, registry = SHIP_ASSET_REGISTRY) {
  const eraRegistry = registry?.[era] || {};
  return !!registryEntryFor(actor, eraRegistry);
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

function parseWaterline(value) {
  try {
    const points = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(points) && points.length >= 3 && points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return points;
  } catch { /* fall through: no contour */ }
  return null;
}

// Swap a loaded authored model in for the procedural stand-in: same pose, and
// fresh surface foam/wake built for the authored hull (the stand-in's foam is
// disposed with it). Returns the loaded model; the caller swaps scene membership.
export function adoptAuthoredModel(previous, loaded, { floating = true, underway = true } = {}) {
  loaded.position.copy(previous.position);
  loaded.rotation.order = 'YXZ';
  loaded.quaternion.copy(previous.quaternion);
  loaded.userData.size ||= previous.userData.size;
  createSurfaceEffects(loaded);
  // Rebuilt contours must respect the actor's current surface state, including
  // a boat that was already submerged when its asynchronous asset load ended.
  if (loaded.userData.waterlineFoam) loaded.userData.waterlineFoam.visible = floating;
  if (loaded.userData.wake) loaded.userData.wake.visible = underway;
  return loaded;
}

export function cloneShipAsset(source, spec = normalizeShipAssetSpec({ units: 'presentation', url: './procedural.glb' })) {
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
  // Named empties exported with the model (anchor_funnel_1, anchor_turret_A...)
  // become wrapper-space points; funnel anchors are the smoke origins.
  wrapper.updateMatrixWorld(true);
  const anchors = {};
  child.traverse(item => {
    if (item.name?.startsWith('anchor_')) anchors[item.name.slice('anchor_'.length)] = wrapper.worldToLocal(item.getWorldPosition(new THREE.Vector3()));
  });
  wrapper.userData.anchors = anchors;
  // The build's waterline contour ([[halfBreadth, z], ...] in source units, bow
  // -Z) becomes wrapper units, for surface foam that hugs this hull.
  const contour = parseWaterline(child.userData?.weatherGageWaterline);
  if (contour) {
    wrapper.userData.waterline = contour.map(([half, z]) => {
      const edge = wrapper.worldToLocal(child.localToWorld(new THREE.Vector3(half, 0, z)));
      const centre = wrapper.worldToLocal(child.localToWorld(new THREE.Vector3(0, 0, z)));
      return [edge.distanceTo(centre), centre.z];
    });
  }
  if (Array.isArray(normalized.funnels)) {
    wrapper.userData.funnels = normalized.funnels.map(f => new THREE.Vector3(f.x || 0, f.y || 0, f.z || 0));
  } else {
    const funnels = Object.keys(anchors).filter(name => name.startsWith('funnel_')).map(name => anchors[name]).sort((a, b) => a.z - b.z);
    if (funnels.length) wrapper.userData.funnels = funnels;
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
  const ktx = ktx2Loader || (renderer ? new KTX2Loader(localManager).setTranscoderPath(basisTranscoderPath).detectSupport(renderer) : null);
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
