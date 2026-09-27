# Concept Review

## Source anchors
- Original concept: `reference/Design Doc.dc.html`, especially §§1-4 (pitch, pillars, loop, command model), §§5-8 (hex sea, time, detection/fog, combat), §§9-14 (era table, fitting out, missions/campaigns, v1 exclusions, prototype recommendations), and §15 (approved decisions).
- Direct tactical prototype: `reference/Frigate Duel.dc.html` — M1-M2 helm/gunnery prototype with hex wind movement, broadside arcs, round/chain/grape shot, four damage tracks, and victory/defeat.
- Command prototype: `reference/Frigate Duel v2.dc.html` — doctrine/signals prototype with orders, captain traits, pending flag signals, Take Command, and automated captain movement/combat.
- Admiral UI target: `reference/Admiral View.dc.html` — operational chart mockup with squadron cards, contact reports, uncertainty rings, signal log, standing doctrine, and order panels.

## Grounded assessment
The concept is strong enough for a functional scaffold because the core verbs and first playable slice are already specified: command a squadron, manage imperfect information, maneuver on a hex sea, let captains execute doctrine, and resolve combat automatically. The v2 frigate prototype is the best behavioral source because it moves away from captain-level micro-control and toward the stated pillar: "You are the commodore, not the captain."

The design document originally frames v1 around Age of Sail, ironclads, and dreadnoughts, with WWII and later systems out of scope. The user's current direction overrides that limitation: modern naval tactics are now first-class, not a distant post-v1 afterthought. The scaffold therefore includes both a sail scenario and a fictional modern 2v2 missile exercise to prove that the simulation can support more than broadside combat.

## Chosen scaffold scope
- Browser-first, dependency-free ESM JavaScript, SVG chart, semantic HTML/CSS, Node >=22 scripts and tests.
- Fixed-tick deterministic simulation separated from DOM rendering.
- Two playable scenarios: one sail surface action and one fictional modern surface missile action.
- Orders, delayed signal delivery, contacts/fog reports, automatic captain execution, win/loss/draw outcomes.
- Modern abstractions included now: active radar toggle, passive/emission contact behavior, finite missile magazines, finite defenses, delayed missile impacts, save/load/export/import.

## Deliberate deviations from the original recommendation
- The concept recommends TypeScript plus PixiJS or Canvas 2D; this scaffold uses dependency-free ESM JavaScript and SVG to stay portable and immediately runnable without installs beyond Node.
- The concept's first playable recommendation is two frigates vs two frigates; this scaffold keeps that spirit but also adds a fictional modern 2v2 because modern tactics are now a core requirement.
- The concept distinguishes era time presentations; this scaffold exposes both manual stepping and a pauseable one-tick-per-second clock over the same simulation for both eras. Era-specific pacing remains future work.
- The prototypes included Take Command; this scaffold currently emphasizes orders/doctrine and does not implement direct quarterdeck control.

## Deferred original features
- Take Command direct helm/gun control.
- Sail shot-mix selection: round, chain, grape.
- Fitting-out phase: loadouts, formation setup, doctrine presets, signal plans.
- Campaign chain, Admiralty Favour, repair time, captain progression, prizes joining the fleet.
- Ironclad and dreadnought eras.
- True weather/smoke/fog line-of-sight and signal blocking.
- Historical scenario accuracy beyond inspiration.

## Deferred modern features
- Submarines, aircraft, carriers, torpedoes, mines, helicopters, drones, and shore-based strikes.
- Detailed radar horizon, datalink, jamming, ESM classification, decoys, reload doctrine, missile salvos, and layered defense.
- Fleet Command-grade real-time tactical picture and order workflow.

## Current limits
This is a playable research scaffold, not a finished Fleet Command successor. It demonstrates the architecture direction and a compact game loop, but it still needs era-rule registries, stronger data schemas, deeper modern sensor/weapon modeling, richer command UX, and broader tests before it can carry the full concept.
