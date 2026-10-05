# Modern Qamar model acceptance

Base main `6e59f08`; isolated worktree `weather-gage-modern-models`, branch
`feat/modern-qamar-models`. Other immersive-UI work is not included.

Four original fictional models:156m Valiant,126m Kestrel,146m Shahin,94m Miraj.
Best-guess readable equipment and silhouettes, no historical reconstruction,
research archives, third-party meshes or reference images. One declared forward
gun per ship; launcher cells are visual cues, not literal ammo counts.

## Evidence

- **596/596** full tests; **12/12** modern coverage/provenance/barrel/scale/FOW/fallback tests.
- Syntax, production build and current source-stamp checks pass. The existing
  renderer bundle-size advisory remains, not an error.
- All51 unique authored assets pass reports and pinned Khronos validation,
  zero errors/warnings. All47 previous models/specs, kit files and scale rules
  are unchanged. No simulation, map, Cold War or carrier changes.
- Actual Qamar before/after viewport captures for all4 hulls on both commanded
  sides;3 ticks advanced per side. Authored=true, appropriate foam/wake/smoke
  anchors present; zero unexpected after-load warnings. Blocking requests keeps
  procedural fallbacks. Unknown contacts never fetch these named hulls.
- Root render review found unsupported launcher/mast fittings in early outputs;
  spec-only support/cradle/brace corrections were rebuilt and checked.
- Independent five-view and gameplay review: **91/100, pass**, no blocking buried
  gun, floating support, major clipping or seam artifact. Dark Workbench water
  shadows in static game-distance renders are not present as game defects.

## Budgets

| Asset | Triangles | Draw calls | KiB |
|---|---:|---:|---:|
| `bns-valiant` | 19,860 | 8 | 761 |
| `bns-kestrel` | 16,434 | 8 | 650 |
| `rns-shahin` | 19,156 | 8 | 719 |
| `rns-miraj` | 12,662 | 8 | 474 |

Total modern pack: **2.54 MiB raw**, each within40k/12 draws/2MB. No LOD/compression or equipment animation introduced.

## Reproduce

`npm ci`, `npm test`, `npm run check`, `npm run build`.
`FIXTURE_TOOLS=<pinned validator prefix> npm run ship:build -- <id>`;
see [ship-fixtures.md](ship-fixtures.md) for validator setup.
Review-only source renders: `output/ships/<id>/{profile,plan,quarter,stern-quarter,game-distance}.png`;
actual captures and metadata: `output/playwright/modern-{before,after}-<id>.png`
and `modern-evidence.json`. Independent report/verdict are under `output/ships/`
and `.omx/state/modern-independent/`; these local review outputs stay out of git.
