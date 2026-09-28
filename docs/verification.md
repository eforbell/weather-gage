# Verification — 2026-09-27

## Automated evidence
- `npm test`: **35 tests passed**, zero failures.
- `npm run check`: all JavaScript source, scripts and tests pass Node syntax parsing.
- Eight complete deterministic sorties: both eras with seeds 1, 42, 1799 and 2026. Each must produce combat, terminate by its limit, preserve input state, and reproduce every next tick after save/load.
- Tests cover order delay/replacement, formation orders, autonomous search, edge geometry, withdrawal, wind, modern standoff range, finite missiles/defense, pending impacts, fog/contact views, last-known reports, event-time log redaction, malformed saves, mutual destruction, and terminal stepping.
- Static server test checks module MIME types, inaccessible internal/reference paths, missing files and write-method rejection.

## Browser smoke (Chromium via Playwright CLI)
- Loaded briefing and chart; selected missions and issued formation/engage orders.
- Advanced both scenarios through a terminal debrief; terminal clock controls were disabled.
- Ran the sail clock and verified automatic pause on new contact.
- Enabled radar and exercised finite missile combat in the modern scenario.
- Saved locally, advanced, loaded, and verified the saved tick restored.
- Imported a malformed save missing ship doctrine: rejected with the original tick/state preserved.
- Imported a valid modern save and resumed; tested save/load with missiles pending.
- Desktop screenshot: `output/playwright/desktop-final.png` (1440px wide, full page).
- Mobile screenshot: `output/playwright/mobile-final.png` (390 × 844). Document width and viewport width both 390px: no horizontal document overflow.
- Browser console: **0 errors, 0 warnings** in the final run.

Screenshots and temporary QA save files are local ignored artifacts, not runtime dependencies.

## Review findings resolved
1. Malformed saves previously passed shallow validation. Nested state validation and transactional UI restore now prevent replacement by invalid imports.
2. Global dispatches previously leaked enemy names/actions. Side-specific reports are now frozen when events occur; hidden enemy events are suppressed and unidentified names redacted.
3. Simultaneous mutual destruction previously counted as victory. It now produces a draw.
4. Integration also fixed idle default fleets, broken formation commands, edge-coordinate crashes, missile records appearing as command signals, unlimited empty point defense, and failure to leave the map on withdrawal.

## Boundaries of this evidence
- Verified in Chromium only. Safari, Firefox, physical mobile devices, screen readers and touch ergonomics have not been tested.
- No TypeScript check, third-party linter or full accessibility certification is claimed. `check` is syntax/static parsing only.
- A browser-responsive layout is not the same as a polished phone game: the chart and labels are small on narrow displays; desktop/laptop remains the intended first-playtest surface.
- AI pathfinding, combat balance, signal realism and multi-era architecture need further iteration. Local heuristics can stall around terrain; there is no global route planner.
- Current scenarios are short abstract exercises, not the concept's finished 30–60 minute missions. Campaigns, aircraft/submarines, multiplayer and production hosting are outside this build.

## Update — 0.2 (dreadnought era + animated combat), 2026-09-27
- `npm test`: **50 tests pass** (adds `tests/dreadnought.test.js`: speed classes, fire-control ranging, per-side fx redaction, wireless detection, torpedo save/load determinism, save validation, minefield avoidance, capital-ship victory rule). `npm run check` passes.
- Balance: 200-seed sweeps per plan, recorded in `docs/era-extension.md`.
- An independent code review found a fog-of-war leak: sinkings of *sighted* but unidentified enemies reached the chart as named events. It is fixed; such events now show only as an unexplained explosion. The review also caught outcome and animation timers leaking into the next sortie, lax validation of the new save fields, and the missing capital-ship victory rule. All are fixed and covered by tests.
- Chromium (Playwright) smoke at 1440px and 390px: full Dogger Bank sortie to debrief, frigate and missile scenarios animate, New sortie leaves no stray effects, no horizontal overflow on mobile. The only console error was the headless browser lacking an audio device.
- Not yet verified: Safari/Firefox animation and Web Audio behaviour, real mobile devices, screen readers.

## Update — 0.3 (ironclads, era registry, mission browser), 2026-09-27
- `npm test`: **65 tests pass**, adding `tests/ironclad.test.js`: draught vs shoals, anchored ships, reserve arrival (including a blocked arrival hex), armour, beam-on vs glancing rams, a rammer striking, broadside fire during ram recovery, idle-admiral scoring, save validation, and replay determinism with fires and rams. `npm run check` passes.
- Sail, modern and dreadnought outcome distributions over 200 seeds are unchanged by the refactor.
- A second independent review found no determinism or save-compatibility problems. Its high and medium findings are all fixed: rammer status not resolved, Virginia idling bow-on during ram recovery, reserves blocked indefinitely, fire/ram effects on unidentified contacts, ram decisions reading the hidden hull type, uneven time-limit scoring, torpedo items accepted in other eras, and locale-dependent sort ties.
- Chromium smoke: the chart room at 1440px and 390px (no overflow), closing it at startup falls back to the briefing, launching from a card, a full Hampton Roads sortie to debrief, the result recorded on the mission card, and hostile torpedoes shown only as bearing wedges and noisy "WAKE" sightings.
