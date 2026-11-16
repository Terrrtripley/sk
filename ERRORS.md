# Dungeon SK — Errors & Fixes

Real issues encountered during development, with root cause and fix. All are resolved and regression-checked. No known open errors as of Milestone 4 completion.

## 1. Debug hooks were missing (`window.DungeonSK` undefined)
- **Symptom:** automated tests could inspect `window.__dungeonSK` but `window.DungeonSK.teleportToRoom(...)` threw `Cannot read properties of undefined`.
- **Root cause:** `exposeDebug()` existed on `Game` but was never called in the constructor.
- **Fix:** call `this.exposeDebug()` during boot (before installing `window.__dungeonSK`).
- **Verified:** teleport helpers work; full test suite uses them.

## 2. Game loop froze after the first shot — `sfx` property/method collision
- **Symptom:** firing the pistol spawned one bullet, then the simulation stopped updating. Room locks never happened, enemies stayed idle, chests never opened. Runtime error: `game.sfx is not a function`.
- **Root cause:** `Game` had a property `this.sfx = new Sfx()` and a prototype method `sfx(name)`. The instance property shadows the method, so `game.sfx("shoot")` in entities was trying to call the audio object and threw, aborting the rAF chain.
- **Fix:** renamed the audio engine property to `this.audio` throughout `main.js`; kept `Game.sfx(name)` as the entity-facing convenience method calling `this.audio.play(name)`.
- **Verified:** full combat, room lock, chest, portal and death flows run with zero console errors.

## 3. Crash on room clear — `this.addShake` was never defined
- **Symptom:** after killing the last enemy, the room was marked cleared and the chest/pickups appeared, but the loop stopped; gate retraction, chest interaction, portal and floor advance never ran. Error: `this.addShake is not a function`.
- **Root cause:** `clearRoom()` and `beginAdvance()` called `this.addShake(...)`; the actual method is `shake(amount, duration)`.
- **Fix:** replaced both calls with `this.shake(...)`.
- **Verified:** gates retract (`gateT → 0`), chest opens on contact, floor advances.

## 4. The pistol rendered as a sword
- **Symptom:** with Bad Pistol selected, the player appeared to hold a long silver blade. Shooting still used pistol bullets.
- **Root cause:** `Player.drawWeapon()` checked `weapon.kind === "pistol"`, but `WEAPONS[0].kind` is `"ranged"`. The condition always failed and fell through to the sword drawing branch.
- **Fix:** check `weapon.id === "pistol"` (or kind `ranged`). The pistol is now drawn with its dark slide, brown grip, hand pixel and muzzle flash.
- **Verified:** screenshots show the correct gun/sword per HUD slot and swap state.

## 5. Every room had id 0 during layout generation
- **Symptom:** found while writing the dungeon structural test; rooms generated in a retry attempt all shared `id = 0`, which would make gate `roomId`/enemy `room` associations ambiguous.
- **Root cause:** `makeRoom()` used `this.rooms.length`, but random layouts build a local `rooms` array while `this.rooms` is still empty.
- **Fix:** monotonic `this._nextRoomId++` owned by the dungeon.
- **Verified:** gates map to exactly one combat room; minimap/content joins work; structural tests pass.

## 6. Potion preview rendered green (scratch art tool)
- **Symptom:** the +2 HP potion looked green in the PIL preview.
- **Root cause:** the scratch palette used two-character keys such as `"R1"`, while the renderer treated each character independently, so `"1"` resolved to the goblin green palette entry.
- **Fix:** enforce single-character palette keys everywhere; renamed potion reds to `a/A/z`. This rule is now followed by `bakeSprite`, which throws on unknown characters.
- **Verified:** potion is red in the final baked sprite and in-game.

## 7. Enemies stacked into one silhouette
- **Symptom:** two guards or shamans could occupy nearly the same position, rendering as a single overlapping mess and making hit feedback confusing.
- **Root cause:** separation only pushed when centres were `<13 px`, while 20px-wide sprites overlap visually up to 20 px. The push was also applied after movement as a small correction.
- **Fix:** add a pre-move repulsion force within 20 px, increase the post-move push threshold to 19 px, and fall back to a deterministic direction when centres coincide.
- **Verified:** combat screenshots show distinct, spaced goblins; no runtime changes to AI targeting.

## 8. Shots frequently missed / auto-aim flickered between targets
- **Symptom:** holding fire for 2.4 s produced only a couple of hits; the reticle jumped between equidistant enemies, and shots sometimes hit crates in front of the target.
- **Root causes:** (a) target reacquisition every 0.08 s could flip between enemies; (b) aim used the target's current position while bullets travel; (c) auto-aim considered enemies visible through crates that block bullets.
- **Fix:**
  - Keep the current target while it remains alive, in range and visible; only reacquire when invalid.
  - Lead moving targets with a small velocity estimate (`enemy.vx/vy`).
  - Treat crates as cover in both `findAimTarget` and `targetVisible`.
  - Bump pistol bolt speed to 300 and hitbox radius to 2.5.
- **Verified:** deterministic combat test: guard 12 → 3 HP in 600 ms; two kills in 2.4 s; sword guard 12 → 4 HP in one swing.

## 9. Pure-black voids made rooms look like they were floating
- **Symptom:** the visible void between rooms was almost pure black, fighting the 2.5D wall silhouettes and making the map feel disconnected.
- **Fix:** bake a very dark bedrock 16×16 tile with sparse specks and draw it on void tiles before floors. This keeps contrast low but makes the dungeon feel embedded in stone.
- **Verified:** screenshots show textured darkness around rooms without competing with characters.

## 10. Portal lacked presence in the large portal room
- **Symptom:** the original ~40px portal read as a small glowing puddle in a 20×13 room; it didn't feel like the floor's goal.
- **Fix:** rebuilt the portal as a larger pixel dais (62px wide) with rim runes, a floor ritual ring, four rotating swirl layers, three spiral arms, a rising light plume, a bright core and 16 rising motes.
- **Verified:** portal is the visual focal point; advance trigger still uses the 15px centre radius.

## 11. Pause-resume click fired immediately
- **Symptom:** clicking to resume from pause could fire a shot on the same click.
- **Fix:** clear attack input and set a 0.18 s fire suppression on resume, matching the start/restart behavior.
- **Verified:** pause → click resume no longer shoots.

## Notes
- The full browser test suite finishes with `CONSOLE: (none)` for server and `file://` launches.
- The remaining warnings in development were from deliberately testing nonexistent debug globals in early test scripts, not from the game.

## 12. Pistol shots passed just over crates (chest-height muzzle vs. inset hitbox)
- **Symptom:** a player standing on the same ground line as a crate could fire horizontally and see bullets miss the crate entirely, even though the crate was directly in front. Sword hits worked.
- **Root cause:** the gun fires from the player's torso (`feet - 11px`), while crates used a 14×14 inset collision rect for movement forgiveness. At perfect horizontal alignment the projectile's 2.5px radius stopped just above the crate's collision top (a sub-pixel gap). Crates are 16×16 visually, so the collision did not match the art.
- **Fix:** added `Crate.getHitRect()` returning the full 16×16 visual bounds; projectiles and auto-aim cover now use that rect. Movement collision still uses the 14×14 inset rect so walking feels forgiving. Enemy projectiles also collide with the full crate bounds.
- **Verified:** deterministic test — one pistol burst destroys a 6 HP crate (hp → 0, dead); sword still destroys one in a single hit.

## 13. Some generated 1px outlines were clipped at the sprite canvas edge
- **Symptom:** an edge-alpha audit of the baked sprite registry showed opaque art pixels (not outline pixels) touching the canvas boundary on the guard's right ear/arm, the energy orb, the shaman's staff tip, and the bottom of the potion. The auto-outline had no transparent neighbour left for a 1px border there.
- **Root cause:** those matrices were authored too close to the 20x20/8x8/9x11 canvas edges; the baker correctly refused to write outside the canvas.
- **Fix:** pulled the guard's four right-edge ear pixels inward by 1px, gave the orb a left margin, moved the shaman staff tip down one row, and added a bottom blank row to the potion without changing its height. The white/gold/HUD icon art was left as-is (HUD icons are not in the brief's outlined-entity list and sit over a dark panel).
- **Verified:** audit now reports **zero** clipped art-edge pixels for player frames, guard, shaman, pistol, sword, crate, chest, both chest states, orb and potion. Floors/walls intentionally fill their tiles and have no outline.

## 14. New sprite palettes were missing characters and blocked boot
- **Symptom:** after adding the Milestone 2 art, the game did not boot. `bakeSprite(railgun)` threw `unknown palette char 'J' at 8,9`, and after that `bakeSprite(chestGoldOpen)` threw `unknown palette char 'd' at 3,5`. With `SK.Sprites` undefined, `drawFloor` also threw, so the page was blank.
- **Root cause:** two matrices used letters that were not in their palettes: the railgun's temporary wooden grip used `J`, and the gold chest reused the open-chest rows which contain the dark interior `d`.
- **Fix:** changed the railgun grip to the dark metal `U` and added a dark `d` entry to `GOLD_CHEST_PAL`. The baker's strict validation is intentional and caught both immediately.
- **Verified:** game boots on `file://` and HTTP, every sprite is baked, zero console/page errors.

## 15. Railgun art touched the sprite-canvas bottom edge (clipped outline)
- **Symptom:** the new-sprite outline audit flagged opaque non-outline pixels on the bottom row of the railgun at x=6–9 and 12–15. The generated 1px outline had nowhere to draw below the art.
- **Root cause:** the 24×10 matrix used all ten rows, putting the grip on the last row.
- **Fix:** compressed the lower body/grip into row 8 and restored a transparent bottom margin. The railgun is still exactly 24×10.
- **Verified:** the outline audit reports zero clipped art-edge pixels for shotgun, railgun, scythe, greatsword, turret and both gold chests.

## 16. Pressing 1/2 could select an empty weapon slot
- **Symptom:** found during review of the new two-slot inventory. `Digit1`/`Digit2` set `player.weapon` even when that slot held `null`, leaving the player unable to attack (Q already refused to swap with an empty slot).
- **Root cause:** the M1 hotkey handler assumed both slots were always populated.
- **Fix:** the hotkey now only selects a slot when `player.weapons[idx]` exists. Rendering and firing already tolerate a null active weapon.
- **Verified:** normal two-weapon play, one-weapon debug state, and the 30-check browser suite all pass.

## 17. Pickup feedback overlapped the ground nameplate
- **Symptom:** after swapping a weapon with `E`, the floating weapon-name text at `y - 38` sat on top of the dropped weapon's `[E] NAME` nameplate, producing a garbled line.
- **Root cause:** both labels were placed in the same band above the player's feet.
- **Fix:** pickup feedback now floats from `y - 48`, clearing the nameplate; the nameplate remains the lower, interactive label.
- **Verified:** visual review of the loot-after-swap state.

## 18. False positives in the first Milestone 2 test harness (not game bugs)
- **Wall-occlusion test:** the first version fired from the spawn-room centre toward the right wall, not realizing the ray passed through an open doorway and continued down the corridor. The beam correctly reached its 260px max range. The test now finds a cardinal direction whose first solid pixel is within range and verifies the endpoint against that wall.
- **Crate beam test:** the first crate was placed on a tile row whose centre did not align with the torso-height beam, so the beam legitimately missed it. The test now positions the crate's hit rect on the beam line.
- **Pistol fire test:** a single `keyboard.press('Space')` could complete between fixed updates. The test now holds Space for 160ms.
- **Lesson:** these were test-setup errors; the production behaviour was correct. They are recorded so future test changes do not repeat them.

## Notes
- The full browser suite finishes with zero console/page errors on `file://` and `http://127.0.0.1:8765`.
- Milestone 2 verification: 800 dungeon seeds, forced fallback, 30/30 gameplay checks, 13/13 M1 regression checks.
- Deliberate audio-silence/headless runs do not produce errors because every audio call is guarded.

## Milestone 3

### 19. UI text silently lost `%`, `&` and parentheses
- **Symptom:** the Knight skill read `+50  ATTACK SPEED FOR 5S` with a hole after `50`; the confirmation modal showed `CURRENT DUNGEON RUN  WEAPONS` and `GEMS ARE KEPT` without its brackets; the Gravito card showed `[E] UNLOCK  1 GEM`.
- **Root cause:** the 5x7 `GLYPHS` table had no `%`, `&`, `(` or `)` entries. `PixelFont._drawRaw` intentionally skips unknown characters, so the missing glyphs rendered as blank columns.
- **Fix:** added the four glyphs. `%` and `&` now render, and the modal/skill/unlock text is exact.
- **Verified:** screenshots of the Knight card, locked Gravito card, confirmation modal and skill HUD.

### 20. M3 sprite outlines were clipped at the canvas edge
- **Symptom:** an automated baked-pixel audit found opaque art pixels (not outline pixels) on the top row of both hero sprites, and on the right column of the Gem. The baker had no transparent neighbour outside the art to write the requested 1px black outline into.
- **Root cause:** the first systems used a 19-row hero base starting at row 0 plus 3 leg rows, and the 10x10 Gem art reached column 9. The torch art also reached the bottom row.
- **Fix:**
  - Added `bakeSprite` `outlineColor` option so M3 art uses pure `#000000` while older art keeps `#0a0c12`.
  - Reworked the hero base to 18 art rows, added a blank top margin row and kept the 3 leg rows => 20x22 with a 1px margin on every side.
  - Pulled the Gem art inside a 1px margin, shortened the torch base by one row and widened its canvas to 10px.
  - Kept the greatsword and meteor matrices inside a margin.
- **Verified:** the baked-sprite edge audit reports **zero** non-outline art pixels on any edge for hero frames, ghost, sword, gem, meteor, icons and home props. Hero/gem/sword/meteor outlines are pure `#000000`.

### 21. Gravity Greatsword barbs and charge pips lacked contrast
- **Symptom:** the first 34x13 sword read as a generic blue blade; the two backward barbs near the crossguard were only one thin row and disappeared at 1x. The five charge pips were a low-contrast purple strip.
- **Root cause:** the blade's first/last 5 columns were already at maximum thickness, leaving no silhouette room for hooks; pip fills and glows were too close to the floor colour.
- **Fix:** reduced the base blade thickness near the guard, added a two-row tooth + backward undercut on both edges, and increased the pip contrast with a dark plate, bright core pixel and violet glow.
- **Verified:** 8x sprite-sheet review and in-game screenshot; the barbs read as two distinct notches and the pips build visibly 1→5.

### 22. Sky Meteor splash was centered 10px above the target
- **Symptom:** the meteor landed visually on a target but the 48px check could miss enemies at the target's feet; the reticle/crater were also offset upward.
- **Root cause:** targeting stored `targetY = enemy.y - 10` (centre) and `meteorImpact` then subtracted another 10 when comparing to enemy centres (`e.y - 10`), producing a double offset. The reticle used the centre instead of the floor.
- **Fix:** Sky Meteor now uses ground coordinates. `targetY` is the enemy's feet (or the player's feet + aim fallback), the reticle/crater/shockwave are drawn there, and splash distance compares feet-to-feet. The fallback is still 120px ahead.
- **Verified:** the target enemy takes exactly 18, the ring/crater are centred under it, and nearby enemies within 48px also take 18.

### 23. New save did not exist in localStorage on first boot
- **Symptom:** a fresh session correctly showed `0` Gems and Knight, but `localStorage.getItem('dungeonSK.save.v1')` returned `null` until the first Gem/unlock action.
- **Root cause:** the save manager only wrote on mutations; a brand-new default was memory-only.
- **Fix:** `Game` now writes the normalized save during construction. Invalid old records are still normalized first.
- **Verified:** clearing the key, booting and reading localStorage immediately returns `{"gems":0,"unlockedHeroes":["knight"],"selectedHero":"knight"}`.

### 24. Skill name and cooldown seconds collided in the HUD
- **Symptom:** Battle Overdrive showed as `BATTLE OVERDRIV4.6S` because the full 15-character skill name and the right-aligned `4.6S` overlapped inside the 168px skill panel.
- **Root cause:** the panel reserved only a 2px gap for a 15-character label at the 5x7 font.
- **Fix:** the HUD uses the short label `OVERDRIVE` (full name remains on the hero card), and the timer is right-aligned at x=143.
- **Verified:** 1440x810 screenshot of the active and recharging skill bars.

### 25. Knight overdrive aura looked like a gold box
- **Symptom:** the first aura was two additive filled rectangles over the knight; at 3x it read as a glowing gold blob that obscured the sprite and the afterimages.
- **Root cause:** additive fillRect layers with 0.16–0.24 alpha over the whole body.
- **Fix:** replaced it with a soft radial gradient + a pixel ring + eight orbiting sparks. The sprite silhouette and the gold afterimages remain crisp.
- **Verified:** screenshot of Overdrive active while moving; aura reads as speed energy, not a box.

### 26. Gravity orb pop left a black dot after the core imploded
- **Symptom:** the singularity pop's imploding core never fully disappeared; a 1px dark dot lingered for the remainder of the 0.34s effect.
- **Root cause:** `coreR` was clamped to 0.5 and drawn unconditionally.
- **Fix:** only draw the black core while `coreR > 0.6`; after that only the expanding rings/sparks remain.
- **Verified:** visual review of repeated orb pops.

### 27. Home hero plate hid the wall props
- **Symptom:** the selected-hero panel at top-left covered the left bookshelf and weapon rack, so the sanctuary's upper-wall dressing was only visible on the right.
- **Root cause:** the 176x38 panel overlapped the room, which starts at screen x=64 in the centered 352px-wide hub.
- **Fix:** moved the selected-hero plate to the bottom-left wall margin and moved the hint to y=262. Both shelves and both racks are now visible.
- **Verified:** home screenshots with Knight and Gravito selected.

### 28. Debug unlock helper did not equip the hero
- **Symptom:** `window.DungeonSK.unlockHero('gravito')` added the hero and selected id but the live player stayed Knight until a reload.
- **Root cause:** the debug helper wrote save data without calling `switchHero`.
- **Fix:** when in home state, it now switches the live player. This is a debug-only path; the real pedestal flow already switched correctly.
- **Verified:** debug unlock + state inspection.

### 29. Test-harness false positives (not game bugs)
- **Home Gem test:** a Gem was spawned in the Home Room to test collection, but home intentionally does not tick dungeon pickups. Moved the test into a live run.
- **Room-lock test:** the auto-aim test had replaced the entire enemy array with one guard, so the "combat" room was legitimately empty and cleared instantly instead of locking. The test now loads a fresh floor first.
- **Ground-loot test:** `groundWeapons` keeps a picked-up weapon in the array until the next update filter, so `length === 0` was the wrong assertion; `groundWeapon.dead` is the correct immediate check.
- **Meteor screenshot:** the first capture caught the meteor above the screen/behind the minimap because the target was to the upper-right and the timed fall had not entered view. The test now targets left of the player and captures at 300ms + impact.
- **Lesson:** these were test-setup issues; the production paths were correct. They are recorded so future test edits do not repeat them.

### 30. Gravity Wells rework replaced the old timed skill contract
- **Symptom/expectation change:** the old suite asserted `active = 9.0`, `cooldown = 12.0`, three instantly spawned orbs, 210px/s homing, 9 single-target contact damage and 0.75s reform. The rework removes the 9s timed active window and replaces it with persistent passive orbs + a black-hole invocation. The passive homing/9-damage/reform orb behaviour was later restored at the user's request (see #35); the old 9s/12s cycle itself remains gone.
- **Fix:** rewrote `GravityOrb`/`GravityWells` and added `BlackHole`; updated the M3 test suite to assert the new contract.
- **Verified:** passive orb spawning/homing/9 damage, press-to-fill/collapse, black-hole 20 damage/pull and 20s cooldown.

### 31. An active black hole could leak into the next floor
- **Symptom:** if the player entered the exit portal while a black hole was active, the new floor could resume updating/drawing it at its old world coordinates. `loadFloor` cleared `game.effects`, but the black hole lives on the player's persistent `GravityWells` controller.
- **Root cause:** the reworked controller is persistent across the run (unlike the old timed `wells` object), and floor transition only cleared effect entities.
- **Fix:** `Game.loadFloor` now calls `this.player.wells.clearTransient()`, which drops `forming`/`blackHole` while keeping the orbiting orbs and their charge.
- **Verified:** portal advances with/without an active black hole now load the new floor cleanly.

### 32. “COLLAPSE” HUD label overlapped “GRAVITY WELLS”
- **Symptom:** the forming-state timer label `COLLAPSE` was right-aligned at x=143, starting around x=96 and colliding with the skill name ending around x=106.
- **Fix:** the forming status is rendered as `FORM`; longer descriptive text remains in the float/notice layer.
- **Verified:** 1440x810 screenshot of the forming state.

### 33. Accretion slash inside the core was washed out
- **Symptom:** the first black-hole slash drew the full band in white, then overlaid the core-clipped pink band. The white underlay made the inside read nearly white instead of `rgba(250,232,255,0.82)` over the black sphere.
- **Root cause:** clipping the pink overlay did not remove the white pixels already drawn inside the core.
- **Fix:** the white slash is clipped to the area outside the core with an even-odd clip; the pink slash is then clipped to the core. This gives pure white outside and pale pink over black inside.
- **Verified:** 3x zoom of the black-hole VFX.

### 34. Test setup after the rework
- **Old wells test:** expected the old 9s/12s timed skill and 9-damage orb contacts; replaced with the final contract: passive homing/9 damage/reform, press-to-collapse, 20s cooldown, 20 black-hole damage, pull and dissipation.
- **Black-hole pull test:** the test originally placed enemies after the anchored timer had nearly expired; it now waits for `state === "anchored"` and then measures the distance before/after a 650ms pull window.
- **Damage test:** because passive orbs can damage the target before invocation, the test records HP at invocation and compares it to HP after anchor; the delta must be exactly 20.
- **Lesson:** the skill has been iterated deliberately; the final tests encode the current contract rather than the historical 9s/12s one.

### 35. Gravity Wells final contract (passive attacks restored)
- **User revision:** passive orbs should once again seek/attack enemies; only invoking the skill should stop their attacks and collapse them. The skill should have a 20s cooldown and the black hole should deal 20 damage.
- **Implementation:** restored the `orbit/return/homing/reform` orb AI (9 single-target damage, 0.75s reform, 210 px/s homing, distributed visible targets) on top of the persistent 2.5s orb spawning. Invocation pauses orb attacks, recalls all orbs (including reforming ones) into the 0.42s formation, starts a 20.0s activation-to-ready cooldown, and the anchored black hole deals 20 damage to its tracked enemy before its 3s pull. Passive orb attacks resume during the remaining cooldown.
- **HUD/card:** the Gravito HUD shows the 20s cooldown with a refill wedge while orbs keep fighting, then the orb count/`READY`; the hero card now reads `ORBS HUNT FOES - F: BLACK HOLE` / `20.0S COOLDOWN - 20 DMG`.
- **Verified:** M3 suite — passive orbs seek and damage (9), invoke fills to 3 and sets cooldown 20, black hole deals exactly 20 to the tracked enemy, cooldown blocks re-use, pull still works, and the black hole dissipates after 3s.

## Notes
- Milestone 3 verification: 800-seed dungeon structure suite, M3 browser suite (including reworked Gravity Wells), Gem suite, M1/M2 regression suite, `file://` + HTTP boot, sprite edge audit, and visual review.
- All M3 runs finish with zero console/page errors.

## Milestone 4

### 36. No new game errors; one test-harness load-order requirement
- **Result:** the difficulty-scaling change produced no console or page errors in generator, browser or room-flow runs.
- **Test-harness note:** the standalone 800-seed Node script previously required only `dungeon.js`. Because `Dungeon` now reads `SK.Difficulty`, the script must load `difficulty.js` first or construction throws `Cannot read properties of undefined (reading 'normalizeDepth')`. The shipped `index.html` already loads `difficulty.js` before `dungeon.js`, so this affected only the external Node harness.
- **Verification-related docs fix:** the first draft of the memory files listed the depth-4 turret HP as 28. `18 × 1.6 = 28.8` rounds to **29**; `README.md`, `DECISIONS.md` and `TESTING.md` were corrected before final verification. No game code changed.
- **Determinism:** depth 1 still uses the exact old spawn ranges and consumes the same RNG draws, so the 800-seed content contract remains valid.

## Milestone 5

### 37. Kamui portal looked invisible in the first rift screenshots
- **Symptom:** the portal effect existed and drew, but screenshots taken ~0.75s after entry showed only a faint circular haze; a temporary red debug square appeared only while the player was mid-spin.
- **Root cause:** the entry portal's hold was only 0.62s, so the 0.26s close fade began well before the player finished entering the dimension. Screenshot timing plus the close ease-out (scale 0.53 at 0.05s into the fade, 0.24 at 0.1s) made the vortex nearly transparent by the time the player stood in the rift. The red square was also hidden behind the 24x28 player sprite when not spinning.
- **Fix:** the entry portal now opens 0.18s, holds 0.86s and closes 0.26s. It is fully closed exactly 0.5s after the 0.8s two-phase entry completes (close runs 1.04–1.30s), matching the brief, and remains visible throughout the player's first half-second in the dimension.
- **Verified:** frozen-frame screenshots at `riftTime` 0.27 show the full portal behind the player; the effect is removed at t≈1.30s.

### 38. The rift overlay washed the black vortex out
- **Symptom:** the no-overlay portal was dense and dark, but with the light-purple rift wash the black rings became low-contrast and the portal read as a faint grey circle.
- **Root cause:** the first overlay used a 0.17 lavender fill plus a radial edge up to 0.34, and several spiral ribbons used mid-grey (#4b4d4d) at partial alpha; those tones landed within a few RGB points of the tinted floor.
- **Fix:** the overlay was lightened (0.15 flat, 0.04–0.28 radial), all ribbon cores were moved to #000–#2f2f2f, ribbon widths increased, six heavy broken ink bands were added, and the grey haze was reduced so the black rings carry the contrast.
- **Verified:** portal is clearly readable inside the purple dimension both at 1x and 3x.

### 39. Sparse eye tendrils disappeared on the dungeon floor
- **Symptom:** the intangibility trails existed but were almost invisible against the dark slate floor; only the activation ring read.
- **Root cause:** every trail was black/charcoal at alpha 0.18–0.52 with no edge contrast, and the effect is intentionally sparse.
- **Fix:** kept the black/charcoal palette but added a faint pale-grey edge pass under each ribbon, raised main alphas to 0.30–0.66, widened strokes slightly and added a few longer far arcs. The effect remains broken, sparse and eye-anchored rather than becoming a dense portal.
- **Verified:** 3x phasing screenshots show tendrils curling up/forward from the eye.

### 40. Taller hero clipped the home selected plate, hero card and name plates
- **Symptom:** a 24x28 portrait overflowed the original 46x48 card frame and the 32px home selected plate; the Traveler name plate's `ACTIVE` label touched the sprite's hair.
- **Root cause:** every home/card portrait and plate offset assumed a 20x22 sprite, and name plates used a fixed `spot.y - 52`.
- **Fix:** card frames/portraits scale from `spriteW`/`spriteH`, the home plate grew to 176x44 at y=218 with a dynamic text x, and the name plate y is `spot.y - 10 - spriteH - 20`. The Player draw path, shadow, afterimages and `centerY` were likewise made size-aware.
- **Verified:** 3x screenshots of the Traveler card, selected plate and all three pedestal plates.

### 41. Hard-coded home unlock copy/VFX and Knight-only card side
- **Symptom:** with a third hero, unlock notices still said `GRAVITO UNLOCKED!`, prompts hard-coded `1 GEM`, and cards always sat to the left unless the hero id was exactly `knight`.
- **Root cause:** the M3 home code was written for exactly two heroes.
- **Fix:** unlock float/notice, ring/particle colours and prompt strings now use the hero's own `name`, `unlockCost`, `primary`/`glow` and skill name; card side is chosen from `screenX < VW/2`.
- **Verified:** Gravito still costs 1 Gem and shows the correct copy; Traveler shows `UNLOCK (0 GEM)` only if a corrupt save somehow lacks it; all cards anchor on the correct side.

### 42. Rift exit could return the player into a crate
- **Symptom:** `findFreeSpot` checked tiles and gates but not crates; exiting deep inside a crate lane could leave the player embedded in a crate.
- **Fix:** the free-spot predicate also rejects `crateAtRect`, matching `Game.isBlocked`.
- **Verified:** exit-from-wall tests in combat rooms with crates.

### 43. Direct `castKamuiGloves` did not set the 2s cooldown
- **Symptom:** the debug/test path (`DungeonSK.banishNearest()`) called `castKamuiGloves` directly, bypassing `tryAttack`, so the weapon cooldown stayed 0 and the HUD looked ready immediately.
- **Fix:** `castKamuiGloves` now sets the slot cooldown itself; the no-target branch still shortens it to 0.45s. Real LMB attacks were always correct because `tryAttack` set the cooldown before dispatch.
- **Verified:** direct-cast and real-input tests both show a 2.0s cooldown.

### 44. Test-harness timing around portal screenshots
- **Symptom:** a screenshot labelled "0.75s after entry" showed no portal even though the effect dump said `t≈0.75`, `scale=1`.
- **Root cause:** Playwright screenshots take time, the fixed-step accumulator advances during capture, and pausing the game draws the pause overlay over the world. The first tests also mistook a temporary red debug square at the player's feet for a missing effect (it was behind the player sprite).
- **Fix:** the harness now freezes updates at a known effect time and suppresses the pause overlay for visual checks, or asserts effect state before/after separately from screenshots. This is a test-tooling issue, not a game bug.

### 45. Sticky auto-aim stayed on a banishing enemy
- **Symptom:** after a Kamui Gloves cast, the player's `aimTarget` and reticle remained on the target for the full 0.9s spin, even though the target was already marked `banishing` and could no longer be damaged.
- **Root cause:** the sticky-target keep check in `Player.update` only tested `aimTarget.alive` + range + visibility. `findAimTarget` already skipped banishing enemies, but the existing target was never re-validated against that flag.
- **Fix:** added `!this.aimTarget.banishing` to the keep check and to `drawReticle`, so auto-aim immediately re-picks a valid enemy (or clears) when the current target starts its banish.
- **Verified:** F4 reproduction — `aimTarget` is no longer the banishing enemy at 0.17s/0.35s; the next cast targets another visible enemy. Full gloves suite then passes 46/46.

## Milestone 6

### 46. The mega portal was a projectile that could sail past its target (superseded design)
- **Symptom:** the first focused test placed three enemies 90–110px ahead and fired the third cast; the portal flew the full 180px, bloomed behind them and killed nothing. It only felt correct when the target happened to stand at the exact maximum range or against a wall.
- **Root cause:** the first implementation fired the portal along the aim angle as a projectile, with no enemy contact test and no relation to the normal cast's target acquisition. A projectile aimed by a coarse angle is not the same promise as "open a portal on an enemy".
- **Interim fix:** during flight it checked every living, non-banishing enemy inside its flight radius and snapped the bloom to the first one.
- **Final design (per follow-up request):** the mega was changed from a projectile to a target-spawned portal. `castKamuiGloves` now acquires a target once with the normal banish rules (sticky, then nearest visible within 280px with LOS), then branches: the first two casts banish, the third calls `game.kamuiMegaImpact` at the target and places a stationary `KamuiMegaPortal` bloom. The travel state, aim-angle sweep, wall-contact bloom and enemy-contact check were all removed. A no-target cast keeps the charge armed and uses the 0.45s retry.
- **Verified:** no target → `NO TARGET`, counter stays at 2, 0.45s retry, no portal; crate-blocked target → same; clear target → portal created at `(target.x, target.y-10)`, the target and a second enemy inside 76px die, no travel state.

### 47. The mega portal's close fade was computed backwards
- **Symptom:** the outer crimson rune ring stayed at full opacity through the close while the vortex shrank, then vanished abruptly.
- **Root cause:** `fade` was written as `1 - this.scale()`. `scale()` returns 1 at full size and falls to 0 during close, so "fade" went 0 → 1 instead of 1 → 0.
- **Fix:** the portal now computes an explicit `closing` fraction from `bloomT` against `growTime + holdTime + closeTime` and uses `fade = 1 - closing`.
- **Verified:** late-bloom screenshots show the ring dimming with the vortex; the effect is removed at the end of the close window.

### 48. Wave HUD rows overlapped on the half-size UI grid
- **Symptom:** at 480/552/640 virtual widths the `BEST` and `ENEMY HP` rows in the new ENDLESS panel collided, and the progress label sat under the bar; the panel's 82px height was too short for five rows plus a bar at a 7px font.
- **Root cause:** rows were first authored at 12px pitch but with values 50 and 57 (7px apart), and the label/bar overlapped after the wide-screen review.
- **Fix:** the panel grew to 96px, rows use an 11px pitch (`LEFT` 34, `BEST` 45, `ENEMY HP` 56), the progress label sits at 69 and the bar at 79. The layout was re-reviewed at 480, 552 and 640 virtual widths.
- **Verified:** screenshots at 800x600 and 2560x1080 show five separated rows and a visible progress bar.

### 49. `WaveArena.drawWalls` read a nonexistent `time` argument
- **Symptom:** the wall runes were static (or would have been `NaN`-timed) because the shared draw signature has no `time` parameter.
- **Root cause:** `drawWalls(ctx, camX, camY, viewW, viewH)` was copied from `Dungeon`, but the rune pulse was written as `arguments[5]`, which is always `undefined` at that call site.
- **Fix:** `drawFloor` caches `this._time = time`, and `drawWalls` reads it for the pulse.
- **Verified:** wall runes animate during the live wave screenshots; no console errors.

### 50. Harness-only false alarms (not game bugs)
- **Symptom A:** a real-key Shift test reported `phaseActive 0` — the harness pressed Shift while the game was in the **home** state, where skills are intentionally inert.
- **Symptom B:** the first "normal cast" assertion counted leftover `KamuiMegaPortal` effects from the previous test as if they belonged to the new cast.
- **Symptom C:** `window.DungeonSK.startWaves()` returned false from the dungeon, so `game.waves` was null in the next assertion.
- **Fix:** the harness now starts a dungeon before keyboard phase tests, counts each effect list delta per cast, and the debug `startWaves()` hook returns home first if needed. These were test-tooling mistakes, not gameplay defects; the underlying behaviour was correct.

## Notes
- Milestone 5 verification: seven-script syntax check, Traveler rift/phase suite, Kamui Gloves banish suite (46/46), M1–M4 regression suite (61/61), save migration, visual review, zero console/page errors.
- Milestone 6 verification: eight-script syntax check, focused wave/phase/mega suite (46/46), extra suite (15/15), M5 consolidated suite re-run (22/22), arena/sprite audit, 18s live bot run, wave 30 perf at 60fps, zero console/page errors in HTTP and `file://` boots.



