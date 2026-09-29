# Design

## Source of truth
- Status: Active, first playable scaffold. Refreshed: 2026-09-26.
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

## Personas and jobs
Strategy/simulation players who enjoy Fleet Command's information warfare and Civilization's readable rules. Desktop/laptop is primary; smaller screens get a stacked layout, not a separate experience.

## Information architecture
Single tactical workspace: identity/time bar, mission ribbon, squadron roster, primary chart, command inspector, event dispatch. Briefing/help and mission debrief use dialogs. Scenario switching is explicit.

## Design principles
Command rather than micro-control. Information before firepower. Show uncertainty instead of cheating. Keep the map dominant. An initial limited model is preferable to a broad fake one.

## Visual language
Warm paper #f2edde, ink #242b2d, muted #656b65, ocean #e2e8df, blue #285867, red #9d463c. Serif display with monospace operational labels; system fonts only, no network font dependency. 4px spacing rhythm, squared controls, thin rules, no floating-card shadows. Hex geometry and vector ship silhouettes instead of bitmap assets. Combat is animated on the chart (ship glide, muzzle flash, shell flight, splash/hit, torpedo wakes, sinking, callout banners) because a text-only transcript made play feel like reading a simulation. Animation is presentation only, derived from per-side `fx` events, and collapses to static markers under reduced motion. Sound is synthesized, opt-in and remembered per browser: quiet era-specific ambience begins after a sound-enabled user gesture, with combat effects layered above it.

## Components
Shared native buttons, selects, meters, dialog, roster entries and contact rows. SVG chart owns hex cells, contact uncertainty, ship symbols and order destinations. Tokens in `src/ui/style.css`; screen structure/rendering in `src/ui/app.js`. Selected, disabled, pending, stale, and terminal states must be distinct.

## Accessibility
Aim for WCAG 2.2 AA; not certified. Native labeled controls, visible focus, keyboard-operable roster and coordinate inputs as an alternative to map clicks. Text labels supplement color. SVG has a title/description. Only concise status messages use live regions. Respect reduced-motion settings.

## Responsive behavior
Three columns on wide screens; command panel moves below chart on medium screens; stacked roster/chart/controls on phones. Chart preserves coordinate geometry. No hover-only controls; touch targets at least 36px, primary controls 44px.

## Interaction states
Brief visible on first visit. No loading spinner: static ESM startup. Empty contact list says no contacts. Save failures remain playable and show a message; invalid imports do not replace current state. Outcome stops clock and opens a debrief. Running clocks pause on new fresh contact, outcome, hidden tab, briefing, and save/load operations.

In Cold War sorties, the chart and contact list show the selected vessel's sensor track. Each captain moves and fires from that vessel's own track; side-level summaries remain for command dispatches, not instant target sharing. Selecting another vessel changes the tactical picture. Older saves rebuild tracks from each vessel's current sensors rather than copying the former shared report.

The fictional Northern Screen sortie extends that rule to ASW destroyers and a carrier: each platform keeps its own contact picture. Carrier aircraft are finite two-tick patrol missions returning a one-tick report to the carrier, not autonomous aircraft units or globally shared detections. Its 30×18 map is scenario-sized; earlier missions and saves retain 20×14 charts.

## Content voice
Short dispatches. Explain game rules rather than imply real-world accuracy. Modern setting is fictional. Keep display time/ticks explicitly abstract.

## Implementation constraints
Dependency-free JavaScript ES modules, SVG chart, semantic HTML and CSS. Node's built-in test runner and static dev server; no install or bundler required. This deliberately differs from the concept's TypeScript/Pixi recommendation to keep the first repository portable and immediately runnable without adding packages. Browser modules must be served over HTTP, not file URLs. Simulation cannot depend on DOM, clock, or unseeded randomness. Ship/scenario definitions are separate from rendering. Native browser storage is best-effort, with JSON export as backup.

## Open questions
- Real-time pacing and desired mission duration after playtesting.
- Next modern layer: missiles in flight / aircraft / submarines / electronic warfare?
- Historical rigor versus accessible tactics; initial numbers are game abstractions.
