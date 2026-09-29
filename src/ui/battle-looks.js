// Light first (docs/3d-visual-direction.md): each scenario gets a time of day and
// weather that says something. Pure data, so looks can be tuned without touching
// the renderer. Fog colour is not listed: it is sampled from the sky's horizon so
// distant ships fade into the air around them instead of a fog wall.
//
// sun: [elevation°, azimuth°]; sky: Preetham turbidity/rayleigh/mie plus cloud
// cover; haze: exponential fog density per world unit; tone: 'aces' or 'agx';
// grade: linear tint, saturation and vignette before tone mapping; swell scales
// hull motion; smoke is the brightness of sunlit smoke and spray.
export const LOOKS = {
  nevis: {
    note: 'Late-day Caribbean sun, sails glowing',
    sun: [12, 250], sunColor: 0xffbd85, sunIntensity: 4.6,
    sky: { turbidity: 4, rayleigh: 2.2, mie: 0.006, g: 0.88, clouds: 0.28, cloudDensity: 0.3 },
    water: 0x0c4658, haze: 0.0042, env: 0.9, exposure: 0.78, tone: 'aces',
    grade: { tint: [1.05, 1.0, 0.93], saturation: 1.1, vignette: 0.35 },
    swell: 0.8, waves: { size: 3, speed: 0.8, distortion: 0.6 }, smoke: 1.5,
  },
  hampton: {
    note: 'Flat afternoon over brackish Roads',
    sun: [32, 200], sunColor: 0xfff0da, sunIntensity: 2.6,
    sky: { turbidity: 8, rayleigh: 1.5, mie: 0.006, g: 0.8, clouds: 0.72, cloudDensity: 0.55 },
    water: 0x34473b, haze: 0.0055, env: 1.2, exposure: 0.66, tone: 'agx',
    grade: { tint: [1.02, 1.0, 0.97], saturation: 0.9, vignette: 0.35 },
    swell: 0.35, waves: { size: 3.5, speed: 0.6, distortion: 0.4 }, smoke: 1.2,
  },
  dogger: {
    note: 'Cold North Sea morning haze',
    sun: [16, 120], sunColor: 0xffe6cc, sunIntensity: 3.4,
    sky: { turbidity: 7, rayleigh: 1.2, mie: 0.004, g: 0.75, clouds: 0.5, cloudDensity: 0.5 }, skyScale: 0.2,
    water: 0x27474a, haze: 0.0072, env: 1.2, exposure: 0.8, tone: 'agx',
    grade: { tint: [0.97, 1.0, 1.04], saturation: 0.84, vignette: 0.4 },
    swell: 1, waves: { size: 3, speed: 0.9, distortion: 0.45 }, smoke: 1.25,
  },
  northern_screen: {
    note: 'North Atlantic, grey and heaving',
    sun: [18, 160], sunColor: 0xe6ecf0, sunIntensity: 2.2,
    sky: { turbidity: 12, rayleigh: 0.8, mie: 0.008, g: 0.75, clouds: 0.85, cloudDensity: 0.7 },
    water: 0x19303a, haze: 0.007, env: 1.3, exposure: 0.66, tone: 'agx',
    grade: { tint: [0.95, 1.0, 1.05], saturation: 0.75, vignette: 0.45 },
    swell: 1.8, waves: { size: 2.4, speed: 1.1, distortion: 1 }, smoke: 1.1,
  },
  strait: {
    note: 'Hot, hazy strait under a high sun',
    sun: [24, 230], sunColor: 0xffe2b4, sunIntensity: 3.8,
    sky: { turbidity: 14, rayleigh: 1.6, mie: 0.012, g: 0.82, clouds: 0.1, cloudDensity: 0.3 },
    water: 0x155660, haze: 0.006, env: 0.9, exposure: 0.58, tone: 'aces',
    grade: { tint: [1.03, 1.0, 0.95], saturation: 1.0, vignette: 0.3 },
    swell: 0.6, waves: { size: 3, speed: 0.8, distortion: 0.6 }, smoke: 1.4,
  },
};
LOOKS.defector = { ...LOOKS.northern_screen, note: 'Barents Sea, low grey light' };

const ERA_LOOK = { sail: 'nevis', ironclad: 'hampton', dreadnought: 'dogger', coldwar: 'northern_screen', modern: 'strait' };

export function lookFor(scenarioId, era) {
  return LOOKS[scenarioId] || LOOKS[ERA_LOOK[era]] || LOOKS.dogger;
}
