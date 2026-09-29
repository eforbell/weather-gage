# Design

## Source of truth
- Status: Active, playable command workspace with optional 3D view. Refreshed: 2026-09-29.
- Surfaces: briefing, tactical chart, squadron orders, contact reports, dispatch/debrief.
- Evidence: `reference/Design Doc.dc.html` §§1–15; `reference/Frigate Duel v2.dc.html`; `reference/Admiral View.dc.html`.
- User override: modern naval tactics are a first-class requirement, extending the source document's pre-WWII scope.

## Brand
A working naval chart, not a generic dashboard. Paper, ink, restrained blue and vermilion. Trust comes from legible orders, explained mechanics, and honest uncertainty. Avoid glossy panels, excessive ornament, and false historical precision.

## Product goals
- Give a commodore useful decisions, then let captains execute.
- Make each era feel different using one simulation (sail, ironclad, dreadnought, Cold War, fictional modern).
- Teach as you play: a tactics primer in the briefing, a live flag-lieutenant advisor, and a debrief lesson.
- Complete a mission from brief to outcome; save and resume locally.
- Non-goals: full historical fidelity, campaign, multiplayer, individually flown aircraft, production-scale combat.
- Success: every scenario can be played, paused, finished, restarted, saved, and deterministically reproduced.
- The optional **3D Battle camera** lets a visual-first player orbit actual ship models and watch the same action without replacing the chart or changing command rules.

## Personas and jobs
Strategy/simulation players who enjoy Fleet Command's information warfare and Civilization's readable rules. Desktop/laptop is primary; smaller screens get a stacked layout, not a separate experience.

## Information architecture
Single tactical workspace: identity/time bar, mission ribbon, squadron roster, primary chart, command inspector, event dispatch. Action dispatch and recent log entries belong beneath the mission objective in the center column, not after the tallest sidebar. Briefing/help and mission debrief use dialogs. Scenario switching is explicit.

## Design principles
Command rather than micro-control. Information before firepower. Show uncertainty instead of cheating. Keep the map dominant. An initial limited model is preferable to a broad fake one.

## Visual language
Warm paper #f2edde, ink #242b2d, muted #656b65, ocean #e2e8df, blue #285867, red #9d463c. Serif display with monospace operational labels; system fonts only, no network font dependency. 4px spacing rhythm, squared controls, thin rules, no floating-card shadows. Hex geometry and vector ship silhouettes instead of bitmap assets. Combat is animated on the chart (ship glide, muzzle flash, shell flight, splash/hit, torpedo wakes, sinking, callout banners) because a text-only transcript made play feel like reading a simulation. Animation is presentation only, derived from per-side `fx` events, and collapses to static markers under reduced motion. Sound is synthesized, opt-in and remembered per browser: quiet era-specific ambience begins after a sound-enabled user gesture, with combat effects layered above it.

## Components
Battle view is a reversible WebGL overlay on the chart viewport, not a second simulation or a targeting tool. Three.js renders procedural meshes, late-day lighting, wakes, smoke, and combat flashes from the selected ship's public player view. In surface eras, uncertain/stale contacts remain markers; unseen enemies never appear. In Cold War sorties, own-ship depth controls the camera and model elevation: surface cameras omit submerged hulls, while submerged cameras limit optical visibility to nearby friendlies on the same layer. Sonar reports have no public depth, so they remain in the chart/list rather than becoming visible 3D vessels. The roster, signal office, and clock stay usable, while precise hex plotting requires returning to the chart. The renderer is lazy-loaded and stops when hidden; a WebGL failure returns to the playable chart.

Shared native buttons, selects, meters, dialog, roster entries and contact rows. SVG chart owns hex cells, contact uncertainty, ship symbols and order destinations. Tokens in `src/ui/style.css`; screen structure/rendering in `src/ui/app.js`. Selected, disabled, pending, stale, and terminal states must be distinct. An issued signal gets an immediate receipt beside the order buttons: recipient/scope, order, submitted tick and public delivery timing. Queued is not acknowledged. Receipts persist through ticks and selection changes, update as pending orders resolve, and reset on new/restored sorties.

## Accessibility
Aim for WCAG 2.2 AA; not certified. Native labeled controls, visible focus, keyboard-operable roster and coordinate inputs as an alternative to map clicks. Text labels supplement color. SVG has a title/description. Only concise status messages use live regions. Use one stable live status region for submission/rejection; the visual receipt repeats the status near the buttons without a second announcement. Preserve focus on re-rendered command buttons where possible. Respect reduced-motion settings.

## Responsive behavior
At ~1400×1000, dispatch heading and at least three recent log entries must be visible without page scrolling, alongside order controls. Prevent the chart from stretching to match a tall roster or inspector; bound its desktop height without cropping hex geometry. Keep recent history in a labelled, keyboard-scrollable log area. Three columns on wide screens; command panel moves below chart on medium screens; stacked roster/chart/controls on phones. Chart preserves coordinate geometry. No hover-only controls; touch targets at least 36px, primary controls 44px.

## Interaction states
Brief visible on first visit. No loading spinner: static ESM startup. Empty contact list says no contacts. Save failures remain playable and show a message; invalid imports do not replace current state. Outcome stops clock and opens a debrief. Running clocks pause on new fresh contact, outcome, hidden tab, briefing, and save/load operations.

In Cold War sorties, the chart and contact list show the selected vessel's sensor track. Each captain moves and fires from that vessel's own track; side-level summaries remain for command dispatches, not instant target sharing. Selecting another vessel changes the tactical picture. Older saves rebuild tracks from each vessel's current sensors rather than copying the former shared report.

The fictional Northern Screen sortie extends that rule to ASW destroyers and a carrier: each platform keeps its own contact picture. Carrier aircraft are finite two-tick patrol missions returning a one-tick report to the carrier, not autonomous aircraft units or globally shared detections. Its 30×18 map is scenario-sized; earlier missions and saves retain 20×14 charts.

## Content voice
Short dispatches. Explain game rules rather than imply real-world accuracy. Modern setting is fictional. Keep display time/ticks explicitly abstract.

## Implementation constraints
JavaScript ES modules, SVG chart, semantic HTML/CSS, Three.js for the optional 3D camera, and Vite for development/static builds. Node's built-in test runner remains in use. Browser modules must be served over HTTP, not file URLs. Simulation cannot depend on DOM, clock, or unseeded randomness. Ship/scenario definitions are separate from rendering. Native browser storage is best-effort, with JSON export as backup. The optional renderer is merged into `main`; keep it lazy and retain chart fallback.

## Open questions
- Real-time pacing and desired mission duration after playtesting.
- Next modern layer: missiles in flight / aircraft / submarines / electronic warfare?
- Historical rigor versus accessible tactics; initial numbers are game abstractions.
- Whether the 3D art direction should be handcrafted/stylized or licensed high-fidelity glTF ship assets; the procedural meshes are a technical prototype, not a Craig-ready content pass.

## Command visibility acceptance (priority 1)
- Evidence: user-provided desktop screenshot; baseline `app.js` placed dispatch after the workspace, while `.chart-wrap` flexed to sidebar height and left the objective followed by empty center space.
- Reuse the paper/ink system; no new dashboard layer, dependency, or overlay that obscures the chart.
- Immediate accepted/rejected submission feedback must appear without scrolling at the click location; queued timing must derive from the public pending list, not era assumptions.
- Group and replaced orders, lost recipients, coordinate plotting and invalid destinations need honest states. Selecting another vessel must not relabel the prior receipt as that vessel's order.
- Verify chart and 3D modes at 1400×1000, 1280×800 and phone width; keyboard actions, live status, tick delivery, reset/load and no horizontal overflow.
- Craig's feedback is optional, not a release/merge gate. Measurable UI, simulation/fog, licensing and technical checks govern acceptance.

## Motion
Short restrained ink/color emphasis only; no layout jump or required animation. Respect reduced motion; do not expire important feedback on a timer.

## Imagery
Retain chart silhouettes and procedural ship assets; no generated bitmap treatment is needed for command feedback.
