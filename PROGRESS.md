# Dungeon SK — Progress

Milestone 1: pure HTML5 Canvas / vanilla JS top-down roguelike shooter (Soul Knight-inspired).
Milestone 2: weapon variety, energy economy, rarity tiers, ground loot swapping, treasure rooms and a third enemy archetype.
Milestone 3: Home Room hub, persistent Gem meta-currency, run-reset return-home flow, selectable Knight & Gravito, hero skills and the Gravity Greatsword / Gravity Wells kit.
Milestone 4: per-floor difficulty scaling — enemies gain HP and spawn in greater numbers as the floor depth increases.
Milestone 5: Dimensional Traveler hero with the Kamui Rift dimension shift and Intangibility, plus the Kamui Gloves portal-banish weapon.
Milestone 5.1: full-window display scaling — the 480x270 design view widens up to 640x270 on wide windows so the canvas fills the browser.
Milestone 5.2: the interface renders on its own half-size pixel grid (50% of the UI's previous size) while the world stays unchanged.

## Status: Milestone 5.2 complete (verified)

Last updated: 2026-11-15

All Milestone 1–4 mechanics remain intact and are regression-tested. The full test matrix is in `TESTING.md`; real bugs and fixes are in `ERRORS.md`.

## Milestone 5.1 — full-window display scaling

### Build checklist
- [x] Virtual height stays 270px; virtual width becomes dynamic (`BASE_VW` 480 → `MAX_VW` 640) and widens on windows wider than 16:9
- [x] `Game.resize()` sizes the canvas to the viewport exactly when the requested width is achievable; otherwise it uniformly contains the 480x270 design view
- [x] Continuous CSS scaling replaces integer snapping, so the canvas reaches the window edges instead of wasting a full scale step
- [x] Nearest-neighbour rendering preserved (`imageSmoothingEnabled = false`, `image-rendering: pixelated`) and integer canvas offsets keep the pixel grid on whole device pixels
- [x] Vignette/hurt-tint canvases rebuilt when the virtual width changes
- [x] Camera snaps to the new viewport after every resize
- [x] Home-room bedrock now tiles the whole visible surround, so the wider hub view shows rock instead of black bands
- [x] `resize`, `orientationchange` and `visualViewport.resize` listeners, plus a `100dvh` shell with a `100vh` fallback
- [x] HUD re-anchored to the live width: floor badge centred, gem counters, minimap and `[HOME]` on the right edge, muted label at the right edge (superseded by the 5.2 layer system, which anchors whole clusters)
- [x] Pause panel, pause `RETURN HOME` button, home-confirm modal, confirm/cancel buttons, game-over panel and its stat columns centred on the live width (kept in 5.2 inside the centre UI layer)
- [x] All anchors resolve to the original coordinates at 480px, so the 16:9 layout is unchanged (true until 5.2 intentionally halved the interface)
- [x] Mouse/keyboard, camera, room triggers, auto-aim, minimap, hero cards and debug overlay keep working across live resizes

### Verification summary
- [x] `node --check` passes on all seven scripts
- [x] Canvas fills the viewport exactly at 1920x940 (552x270 virtual, 3.48x), 1920x1080 (480x270, 4x), 1600x900 (480x270, 3.33x) and 2560x1080 (640x270, 4x)
- [x] Narrow windows keep the 480x270 design view and only letterbox vertically: 1512x892 → 1512x851, 1280x800 → 1280x720, 1024x768 → 1024x576, 800x600 → 800x450
- [x] Extreme cases stay sane: 1920x300 → 711x300 contained, 300x200 → 300x169 fractional fallback
- [x] 26/26 display/regression assertions pass: exact fill, virtual width, home camera, mouse mapping at the virtual centre, movement, HOME hit-box, confirm/cancel clicks, pause centring, five live resizes, HUD re-anchoring, home hub interaction
- [x] Zero console warnings/errors and zero page errors across every viewport and resize sequence
- [x] Visual review: wide home hub, wide dungeon HUD/minimap, floor notice, pause overlay, return-home modal and game-over panel are all centred and edge-anchored correctly

## Milestone 5.2 — half-size interface

### Build checklist
- [x] Backing store doubled (`UI_SCALE = 2`) and the world drawn through a 2× transform, so the playfield keeps its exact previous on-screen pixels
- [x] The interface keeps its original 480x270 design coordinates but draws 1:1 in backing pixels, so every UI pixel covers half a world pixel (50% of the old UI size)
- [x] Per-cluster UI layers (`uiTL`/`uiTC`/`uiTR`/`uiBL`/`uiBC`/`uiBR`/`uiC`) keep panels glued to their screen edges at any virtual width
- [x] Stats panel + vitals, two-row skill panel, floor badge, gem counter, `[HOME]`, minimap, weapon slots and muted label all drawn through the left/top-right/bottom-left layers
- [x] Notices, hints and the `[F3]` debug panel use the top-centre / bottom-centre / top-left layers
- [x] Home selected-hero plate, sanctuary title, gem counter and hint use the same layer system
- [x] Pause, return-home confirmation, game-over and descending overlays dim the full world but draw their panels and text in the centred UI layer at half size
- [x] Hero info cards render on the half-size grid around their pedestal anchor (world-space connector tick preserved)
- [x] Hit testing converts the mouse into each layer's design space; `[HOME]`, confirm/cancel and pause RETURN HOME still click correctly at 552/480/640 virtual widths
- [x] Gravity Wells on-screen targeting reads `game.viewW`/`viewH` (logical view) instead of the doubled backing width
- [x] Damaging/rendering effects, dust, vignettes, rift wash and screen shake stay in the world pass and are visually unchanged

### Verification summary
- [x] `node --check` passes on all seven scripts
- [x] UI pixel is exactly half a world pixel: 1.739 vs 3.478 CSS px at 1920x940; backing 1104x540 for a 552x270 view
- [x] 25/25 UI assertions pass: boot, backing/view sizes, mouse world mapping, HOME/confirm/pause hit boxes, movement, logical view for entities, four live resizes with re-mapped clicks, zero errors
- [x] 7/7 gameplay smoke passes on the half-size HUD: room lock, shooting/kills, chest + gate flow, portal advance, Traveler two-row HUD and abilities
- [x] Full-size HOME coordinates no longer trigger the button; the old layout is gone exactly as intended
- [x] Visual review at 1920x940, 1280x800, 800x600 and 2560x1080: canvases fill/centre correctly, HUD panels remain edge-glued, overlays centred, no clipping
- [x] 60.1 fps at 1920x940 with the 1104x540 backing; zero console/page errors

## Milestone 5 build checklist

### Dimensional Traveler hero (`entities.js`, `sprites.js`, `home.js`, `main.js`)
- [x] `traveler` added to `SK.Heroes` with base stats 6 HP / 5 Armor / 220 Energy, `unlockCost: 0`, starter weapon `kamuiGloves`
- [x] Free base hero: fresh saves include `traveler` in `unlockedHeroes`; older saves auto-migrate and gain it on boot without changing their selected hero
- [x] 24x28 four-frame walk sprite: charcoal tattered cloak, crimson Kamui mask with a black spiral, single sharingan eye, high collar, red scarf, violet coat lining, gold buckle, red/black gloves and red shin wraps
- [x] Pure-black 1px outline, 4-frame walk, `travelerGhost` violet afterimage sprite
- [x] Dynamic `spriteW` / `spriteH` / `ghost` hero fields used by Player, afterimages, idle pedestal heroes, hero cards and the selected-hero plate
- [x] Third home pedestal at the carpet centre, three non-overlapping name plates, traveler-specific violet pedestal glow and a floating eye/rune accent
- [x] Traveler starts with the legendary **KAMUI GLOVES** (red/black glove sprite) in slot 1
- [x] Hero card shows both abilities (`F KAMUI RIFT`, `SHIFT INTANGIBILITY`) and a taller 52x58 portrait frame
- [x] Home selected-hero plate enlarged to fit the 24x28 portrait

### Ability 1 — Kamui Rift (`F`)
- [x] F toggles the rift; committed 0.8s two-phase entry/exit spin locks movement and attacks
- [x] Player rotates on the sagittal axis twice: the first spin shrinks them into the portal, the second grows them back in the destination dimension
- [x] Large animated dense Kamui vortex (radius 54) opens at the player: grey haze, 10 spiral ribbons at different speeds, heavy broken ink bands, outer smoke, inward specks, stable black centre
- [x] Portal is fully closed 0.5s after the player is in the dimension (open 0.18s, hold 0.86s, close 0.26s; entry completes at 0.8s, close runs 1.04–1.30s)
- [x] During the rift: light-purple screen wash, violet ghost body, violet afterimages, enemies cannot see/act, hostile bullets pass through, damage ignored
- [x] Walls, gates and crates stop blocking only the Traveler's movement; enemy/black-hole/bullet collision still uses `game.isBlocked`
- [x] Attacking is disabled with `NO ATTACK IN RIFT` feedback
- [x] Camera follows the Traveler outside generated room bounds while rifting
- [x] Exiting spins back and places the Traveler on the nearest non-solid, gate-free, crate-free spot (falls back to spawn if needed)
- [x] Exit starts a 6.0s cooldown; pressing during entering/exiting is ignored; cooldown denial shows `RIFT COOLDOWN`
- [x] Floor loads and hero switches reset rift state; portal advance is suppressed while rifting
- [x] HUD row shows ENTER / RIFT seconds / EXIT / cooldown / READY with a `[F]` keycap and fill bar

### Ability 2 — Intangibility (`Shift`)
- [x] 4.0s active window on a 9.0s activation-to-ready cycle
- [x] Enemies still see, chase and fire; contact, bullets and `takeDamage` cannot hurt the player
- [x] Walls still block movement; attacking is disabled with `NO ATTACK WHILE PHASED`
- [x] Translucent player body plus a dark eye halo
- [x] Sparse, broken black/grey spiral tendrils unravelling from the eye with varied speeds, thickness, opacity, length and pale edge highlights
- [x] HUD row shows active seconds / cooldown seconds / READY with a `[SHIFT]` keycap and fill bar
- [x] Shift while in the rift is denied; phase fades out cleanly after the active window

### Kamui Gloves — portal banish weapon (`entities.js`, `kamui.js`)
- [x] New `summon` weapon kind (never swings, never creates a bullet)
- [x] Legendary, 0 energy, 2.0s fire rate, damage 9999 + `execute: true`
- [x] Targets the sticky aim target or the nearest visible enemy within 280px
- [x] Spawns a dense Kamui vortex (radius 34) centred on the target
- [x] Target spins on the sagittal axis, shrinks over 0.9s, then pops with `BANISHED!`, particles and a ring
- [x] One-shots guards, shamans and turrets at any depth; no HP check
- [x] Banished targets are skipped by auto-aim, bullets, melee, beams, Sky Meteor, Gravity Wells and black-hole pull; cannot be damaged mid-animation
- [x] Room stays locked until the banished target actually dies; kill/drop/Gem flow unchanged
- [x] No-target casts show `NO TARGET` and use a short 0.45s retry cooldown instead of the full 2s
- [x] In-hand violet aura and charge specks; weapon slot HUD shows the glove sprite, name and 2s cooldown bar

### Presentation / UX
- [x] Two-row 184x48 skill panel for dual-ability heroes; single 168x24 panel unchanged for Knight/Gravito
- [x] Notice banners move to y=116 for the Traveler so they clear the second row; Knight/Gravito stay at y=92
- [x] Controls hint and pause panel mention `F / SHIFT`
- [x] Rift overlay ramps with the entry/exit spin and never covers the HUD
- [x] Hero cards position beside the nearest pedestal based on screen position, not hero id
- [x] Unlock copy and VFX use the hero's own name, cost, primary and glow (no hardcoded GRAVITO/1 GEM)
- [x] Debug hooks: `triggerSkill(slot)`, `triggerPhase()`, `banishNearest()`, `riftState()`
- [x] New synthesized sounds: `kamuiOpen`, `kamuiExit`, `kamuiReturn`, `kamuiBanish`, `kamuiPop`, `phase`

### Verification summary (Milestone 5)
- [x] `node --check` passes on all seven scripts
- [x] Traveler mechanics suite passes 63/63 (two-phase 0.8s spin, portal life 1.30s/removed exactly 0.5s after entry, wall phasing, safe exit, camera, enemy blindness, damage immunity, intangibility, cooldowns, HUD)
- [x] Kamui Gloves suite passes 46/46 (2s rate, no projectile/swing, one-shot guard/shaman/turret at depths 1 and 10, spin/shrink/pop, room clear, no-target, LOS, auto-aim skip)
- [x] Regression suite passes (61/61 assertions: Knight/Gravito, save migration, home cards/pedestals, difficulty, floor flow, death/home, persistence)
- [x] Zero console warnings/errors and zero page errors across all flows
- [x] Visual review: traveler home card, rift entry spiral, full-rift purple wash, phasing eye trails, enemy banish portal/pop, two-row HUD
- [x] `file://` launch: 7 scripts load, 60 sprites, `SK.Kamui`/`KamuiVortex` present, `localStorage` save written, zero errors

## Milestone 4 build checklist

### Per-floor difficulty scaling (`difficulty.js`, `dungeon.js`, `entities.js`, `main.js`)
- [x] New `difficulty.js` defines `SK.Difficulty` as the single source of truth, loaded before the dungeon and entity modules
- [x] HP multiplier `1 + 0.2 × (depth − 1)`; `scaleHp` rounds to a whole number with a minimum of 1
- [x] Guards, Shamans and Crystal Turrets all scale HP with depth (depth 1 stays exactly 12 / 9 / 18)
- [x] Combat-room goblins: 3–4 at depth 1, +1 to both ends every 2 floors, capped at 7–8
- [x] Every combat room still guarantees at least one Guard and one Shaman
- [x] Combat-room turrets: 1–2 at depth 1, +1 every 3 floors, capped at 3–4 (max 4)
- [x] `Dungeon` normalizes missing/invalid depth to 1; depth 1 layout and content are unchanged
- [x] `Enemy` accepts a depth and stores it; live `hp`/`maxHp` come from the scaled base stat while `ENEMY_STATS` stays immutable
- [x] `Game.loadFloor` passes the floor depth into every spawned enemy
- [x] Floor-advance notice shows `ENEMY HP +<percent>%` instead of `KEEP DESCENDING`
- [x] Spawn caps keep deep rooms placeable and readable; no enemy/crate overlaps the reserved chest centre
- [x] Floor-clear, gate, chest, drop, Gem, minimap and hero/skill rules are untouched

### Verification summary (Milestone 4)
- [x] `node --check` passes on all six scripts
- [x] 800-seed depth-1 generator suite still passes (6 rooms, 3 combat, treasure branch, gates, turrets, crates)
- [x] Depth-scaling generator suite passes at depths 1, 2, 3, 4, 5, 7, 9, 10, 12 and 20 (200 seeds each): observed counts always equal the declared ranges, Guard + Shaman present, entities on floor tiles, treasure room empty
- [x] 9,000-room placement audit (depths 1/10/20 × 500 seeds): no enemy or crate overlaps the reserved chest centre
- [x] Browser suite confirms guard/shaman/turret HP at depths 1, 2, 3, 5 and 10 matches the curve exactly and `enemy.depth` is correct
- [x] Browser suite confirms per-room counts: 3–4 goblins / 1–2 turrets on floor 1-1, 7–8 goblins / 3–4 turrets on floor 1-10 (30–33 live enemies per floor)
- [x] Floor-advance notice renders the correct `ENEMY HP +<percent>%` subtitle through both the forced overlay and the natural portal path; depth 20 shows `+380%` without clipping
- [x] Room lock → clear (9 enemies) → gate retraction → chest flow still works on a scaled floor 5
- [x] Zero console warnings/errors and zero page errors; boot and display scaling verified

## Milestone 3 build checklist

### Persistent meta-progression (`main.js`, `entities.js`)
- [x] `saveData` persisted in `localStorage` under `dungeonSK.save.v1`
- [x] `gems` integer (starts 0), `unlockedHeroes` (starts `['knight']`), `selectedHero` (starts `'knight'`)
- [x] Defensive load: invalid/corrupt values are floored/filtered; selected hero must be unlocked
- [x] Default save is written on first boot so the record exists immediately
- [x] Gem sprite `10x10`, faceted cyan/magenta, generated 1px pure-black outline, bright animated specular sparkle
- [x] Gem pickup magnetises to the player, increments `saveData.gems`, saves immediately and updates the HUD count
- [x] Enemy death: 8% chance to drop a Gem
- [x] Combat-room reward chest: 45% chance to contain a Gem (rolled when the room is cleared; gem spills on opening)
- [x] Entering the exit portal always awards `+1 Gem` and shows a floating `+1 GEM!` reward
- [x] Gem HUD counter in both the Home Room and Dungeon HUD
- [x] Gems survive floor advance, return-home, death and reload

### Home Room hub (`home.js`, `main.js`)
- [x] Boots directly into the Home Room instead of a title screen / Floor 1-1
- [x] Handcrafted 22x15 tile room = 352x240 px, centered in the 480x270 viewport
- [x] Warm polished stone floor, red/gold woven carpet runner, gold border and fringe
- [x] Flickering wall torches with warm radial light pools
- [x] Bookshelves and weapon racks along the upper walls
- [x] Outlined sanctuary pillars with collision
- [x] Two flanking braziers and a gold spawn sigil
- [x] Large animated Dungeon Entrance Portal at top-center (shared with the dungeon exit portal)
- [x] `[E] ENTER DUNGEON` prompt within 36px; walking into the core starts Floor 1-1
- [x] Knight pedestal on the left carpet edge, Gravito on the right
- [x] Non-controlled hero (including locked Gravito) idles at its pedestal with bob/sway; Gravito also has a floating rune
- [x] Pedestal name/status plates: ACTIVE / LOCKED
- [x] Within 26px, a semi-transparent dark Hero Info Card shows name, 2x portrait, HP/AR/EN, starting weapon in rarity colour, skill name/description and action prompt
- [x] Locked prompt: `[E] UNLOCK (1 GEM)` in green when affordable; gray prompt + red `NEED 1 GEM!` when not
- [x] Unlocked prompt: `[E] SELECT HERO`; current hero: `EQUIPPED`
- [x] Unlock deducts exactly 1 Gem, adds `gravito`, saves, switches the player, plays a ring/particle burst and shows a notice
- [x] Selecting an unlocked hero swaps stats, sprite, skill and starter weapon immediately; previous hero returns to its pedestal
- [x] `selectedHero` persists across reloads

### Return-home flow (`main.js`)
- [x] Clickable `[HOME]` pixel button in the top-right Dungeon HUD
- [x] `H` shortcut and clickable `[H] RETURN HOME` option in the pause overlay
- [x] Clicking HOME pauses the game and opens a confirmation modal
- [x] Modal text: return to home room; current dungeon run & weapons will be lost; gems are kept
- [x] `[Y]`/`[N]` keys and clickable `[Y] Confirmation Return Home` / `[N] Cancel` buttons
- [x] Cancel resumes play without losing state
- [x] Confirm wipes enemies, floor, temporary weapons, pickups, effects, HP/armour/energy and run counters
- [x] Returns to the Home Room with the selected hero at full base stats and starter weapon
- [x] Gems, unlocked heroes and selected hero are preserved
- [x] Death now returns to the Home Room (meta kept) instead of starting a new run immediately

### Hero system (`entities.js`, `sprites.js`, `main.js`)
- [x] `SK.Heroes` registry with `knight` and `gravito` definitions (name, title, sprite, stats, starter weapon, cost, colours, skill data)
- [x] Player loads stats, sprite prefix, starter weapon and skill from the registry
- [x] Hero switch resets HP/armour/energy/weapons/skill state at the current position
- [x] `F` or `Shift` activates the skill; `Q` / RMB still swaps; LMB / Space still attacks
- [x] Skill icon, `[F]` keycap badge, active glow fill and radial/vertical cooldown sweep with remaining seconds below the HP/AR/EN bars
- [x] Skill timer model: cooldown counts from activation, active window is visually distinct

### Knight (`sprites.js`, `entities.js`)
- [x] `20x22` chibi knight: silver helmet, red plume, dark 1x2 visor eyes, steel chestplate, gold belt, 1px pure-black outline
- [x] 4-frame walk cycle
- [x] Base stats 7 HP / 6 Armor / 200 Energy
- [x] Starting weapon: Bad Pistol (Common)
- [x] Skill “Battle Overdrive”: +50% attack speed for all weapon kinds (cooldown / 1.5), 5.0s active, 10.0s activation-to-ready cycle
- [x] Golden-orange speed aura, translucent golden afterimages while moving, battle-cry ring pulse on activation

### Gravito (`sprites.js`, `entities.js`)
- [x] `20x22` hooded cosmic mage-knight: `#1e1b4b` cloak, `#a855f7` trim, neon-violet `1x2` eyes, floating cosmic rune, 1px pure-black outline
- [x] 4-frame walk cycle
- [x] Base stats 5 HP / 5 Armor / 240 Energy
- [x] Starting weapon: Meteoric Gravity Greatsword (Legendary, 0 Energy)
- [x] `34x13` Starscourge-inspired art: ribbed/beaded dark-iron hilt, flared T-pommel, engraved bronze-gold crossguard, wide tapered meteoric blade, blue bevel, light fuller, two backward-hooked jagged barbs, 1px black outline
- [x] Continuous violet gravitational motes + translucent aura around the held blade
- [x] `0.56s` swing cooldown, 12 damage wide dark-violet/indigo crescent, destroys enemy bullets
- [x] 5 glowing violet charge pips at the feet; every 5th swing summons Sky Meteor
- [x] Sky Meteor targets nearest enemy within 230px, else 120px ahead; floor reticle; falls from `(targetX+75, targetY-230)` in 0.42s
- [x] Detailed meteor: 18x18 rotating jagged rock, layered white/lavender/deep-purple tail, violet/orange embers
- [x] Impact: 18 AoE damage within 48px, 5px shake, dual purple/white shockwave, 18 debris particles, fading crater
- [x] Skill “Gravity Wells”: passive orbs spawn every `2.5s`, cap at 3, and orbit at 26px radius / 120° spacing / 2.6 rad/s
- [x] Orb layers: swirling halo + 3 inward stardust specks, bright event-horizon ring, pulsing black core, 3 jagged white/pink lightning arcs per frame, 12-point trails
- [x] Orbs passively auto-track visible enemies, deal 9 single-target damage, and reform after 0.75s; they resume hunting during the skill cooldown
- [x] Pressing F with a visible target (any alive enemy on screen with LOS) pauses orb attacks, fills any missing orbs to 3 and starts a 0.42s collapse; the black hole starts a 20.0s cooldown
- [x] Pressing F with no target or an active/forming black hole shows feedback and does not consume orbs
- [x] Black hole homes to the chosen enemy, deals 20 damage to it on impact, anchors for `3.0s`, pulls enemies, turrets and hostile bullets toward it within `1.5×` the outer aura ball, then dissipates
- [x] Six-layer cel-shaded black-hole VFX: periwinkle aura + ring, white horizontal flares, white→periwinkle upper wisps, lavender bottom streaks, solid `#05010a` core, pale-lavender inner rim, rotating pink/white accretion slash
- [x] HUD states: 20s cooldown/radial sweep, orb count/next-orb sweep when ready, FORM, SEEK, anchored seconds, FADE
- [x] Floor advance clears any transient black hole so it cannot leak into the next floor

### Presentation / regression
- [x] 480x270 design canvas, `imageSmoothingEnabled = false` preserved (presentation superseded by M5.1 full-window scaling)
- [x] 8-direction normalized movement + sub-stepped sliding AABB preserved
- [x] Soft auto-aim, sticky target, predictive lead, crate cover and reticle preserved
- [x] HP/Armor/Energy segmented HUD now uses each hero's maxima; armor/HP rules unchanged
- [x] Melee bullet clearing, deflect sparks and screen shake preserved
- [x] Two-slot inventory, rarity tiers, energy costs, dry fire and E/F loot flow preserved (F is now skill; E remains interaction/loot)
- [x] Room lock gates, room-clear chest, portal and multi-room floor advance preserved
- [x] Pause, mute persistence, auto-pause on blur, game-over flow and scaling preserved/updated
- [x] New skill/gem/HOME/skill-gauge HUD integrated without crowding the minimap

### Verification summary
- [x] `node --check` passes on all five Milestone 3 scripts
- [x] 800-seed dungeon structural/content stress suite still passes (6 rooms, 3 combat, treasure branch, gates, turrets, crates)
- [x] M3 browser suite: home boot/default save, no-gem deny, unlock, hero stats/weapon, portal entry, gravity sword stats, 5th-swing meteor, passive Gravity Wells orbs 1→3 at 2.5s with 9-damage seeking, 20s cooldown, press-collapse into a black hole, 20 damage to the tracked target, pull distance decreasing, 3s dissipation, HOME modal, cancel/confirm, home reset, Knight 5/10 + cooldown/1.5, reload persistence — **all pass**
- [x] Gem suite: collection + immediate localStorage write, 8% enemy roll, 45% chest gem, portal +1, floor 2, pause-H confirm, reload persistence — **all pass**
- [x] M1/M2 regression suite: 8-way movement, auto-aim, pistol, dry fire, railgun energy, melee bullet clear, ground pickup, room lock/clear/chest, portal/stats/loadout preservation, death → home — **all pass**
- [x] `file://` launch and HTTP launch both boot with zero console/page errors; `localStorage` save works on `file://` in Chromium
- [x] Presentation: 1280x800 → 1280x720 (2.67×), smoothing disabled (integer scaling later replaced in M5.1)
- [x] Sprite audit: hero/greatsword/gem/meteor/home-prop sizes exact; zero non-outline art pixels on any audited canvas edge
- [x] Visual review: home hub, both hero cards (locked/selected), portal prompt, gem pickup + HUD, Knight overdrive/afterimages, cooldown sweep, gravity sword, Sky Meteor fall/impact, Gravity Wells passive attacking orbs, cooldown HUD, collapse forming, black hole travel/anchor/pull VFX, HOME confirmation modal, return-home, game-over

## Remaining ideas for a later milestone (not required)
- Boss encounter and chapter end / win condition.
- More heroes, unlock costs above 1 Gem, hero-specific passives.
- A Gem shop with consumables/meta upgrades.
- Elite variants, affixes and boss modifiers.
- Weapon upgrades, affixes, or a third inventory slot.
- Gamepad/touch controls.
- Optional CRT/scale shaders (would deviate from crisp pixel art).
