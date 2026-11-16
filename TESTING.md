# Dungeon SK — Testing

Verification performed for Milestones 1, 2, 3, 4, 5 and 6. The game has no test-runner dependency; tests are external Playwright/Node scripts kept outside the shipped project (scratch folder), so the build stays dependency-free.

## Environment
- macOS, Chromium headless shell build 1254 (Playwright 1.65.1).
- Game under test served at `http://127.0.0.1:8799` and also opened as `file:///Users/terryagent/Documents/projects/dungeonSK/index.html`.
- Console and page errors captured for every run.
- Test scripts live in `/private/var/folders/3m/1p80p8cn62g425vsxln5w9yw0000gn/T/opencode/dsk-test` and are not shipped.

## Syntax
```bash
cd ~/Documents/Projects/dungeonSK
for f in sprites.js kamui.js difficulty.js dungeon.js home.js waves.js entities.js main.js; do node --check "$f"; done
```
Result: pass on all eight scripts.

## Milestone 6 — cancellable phase, mega portal, endless waves

### Focused suite (`final_waves.js`) — 46/46 PASS, 0 console/page errors
- **Boot/save:** fresh save has `bestWave: 0`; the `waves.js` module, `SK.WaveArena`, `SK.WaveDirector` and all four new arena sprites load; the home room has `waveGate` and its proximity check; 64 sprites total.
- **Intangibility cancel:** real `ShiftLeft` starts 3.83s of phase (4.0s minus 0.17s), invulnerable and unable to attack; a second real `ShiftLeft` zeroes `phaseActive`, restores `canAttack`, leaves the cooldown at 8.73s, emits `SOLID!` and a collapsing eye ring; `takeDamage(1)` then removes one armor; the next Shift is denied with `PHASE COOLDOWN`.
- **Wave entry:** standing at the gate sets `homeWaveNear`; real `E` starts wave mode in a `WaveArena` with zero rooms and no portal; wave 1 spawns 5 enemies (guards, shamans and exactly one turret) at base HP 9/12/18 with a `WAVE 1` notice.
- **Mega portal:** setting the counter to 2 and casting fires exactly one `KamuiMegaPortal`, resets the counter to 0 and shows `MEGA KAMUI!`; at 0.33s the portal is blooming at the first enemy, the nearby group is dead (`MEGA BANISH x3`), a hostile bullet inside the radius is consumed, and the room stays locked until the survivors are dealt with.
- **Normal casts:** the first and second successful casts each banish one target, advance the counter to 1 then 2, and create no mega portal.
- **Scaling:** wave 5 fields 7 enemies at +46% HP (guard 18 / shaman 13 / turret 26); wave 6 auto-spawns 8; wave 30 fields the 40-enemy cap at +1486% HP (guard 190 / shaman 143 / turret 286; max 286/min 143 observed across the roster).
- **Clear/reward:** clearing wave 5 sets `rest`, `cleared = 5`, awards one Gem and one armor, writes `bestWave: 5` to `localStorage` immediately, shows `WAVE 5 CLEARED` and starts the 2.4s intermission; the next wave spawns automatically.
- **Death/meta:** death at wave 30 sets `gameover` and stores `bestWave: 30`; real `R` returns to `HomeRoom` with the best wave and unlock list intact.
- **Regression:** real portal E enters the unchanged 6-room/3-combat dungeon; the Traveler rift still enters/exits with the 6s cooldown; Knight Overdrive is still 5.0s; Gravito still builds its wells; F3 debug opens; zero console/page errors.

### Extra suite (`waves_extra.js`) — 15/15 PASS, 0 console/page errors
- Firing the mega at a wall blooms it immediately at the wall face (travelled 19px).
- `setHero`/`switchHero` reset the mega charge.
- Pause `Esc`, HOME confirm `H`, cancel `N` and confirm `Y` all work in wave mode; confirming mid-run records the current wave as best (7) and returns home.
- The wave HUD survives live resizes: 800x600 → 480x270 view / 960x540 backing, 2560x1080 → 640x270 view / 1280x540 backing, both with `mode === "waves"`.
- Pressing E away from the rift does not start waves.
- A hand-written save with `bestWave: 33`, 4 gems and the Traveler selected reloads to home with all values intact and the gate prompt in range.
- `file://` launch loads 8 scripts, `SK.Waves`/`SK.WaveArena`, 64 sprites and boots to home with zero errors.

### Other verification
- **Phase/mega edge cases:** cancelling the phase while inside the Kamui Rift works (`phaseActive` 3.03 → 0, `SOLID!`); Shift while exiting the rift is denied with `EXIT RIFT FIRST`; a no-target cast leaves `kamuiCasts` unchanged and sets the 0.45s retry; a crate between the player and a sticky target keeps `targetVisible` false, so the cast shows `NO TARGET`, does not advance the counter and does not start a banish.
- **Hero coverage in waves:** Knight runs the arena with the single-row skill panel and location readout; Gravito runs it with the Gravity Greatsword, orbs and a black hole (cooldown 19.45s after activation), all without errors.
- **M5 consolidated suite re-run:** 22/22 PASS after updating its expected sprite count from 60 to 64 (rift timing, banish at depth 10, phase, save/reload, real F/Shift keys); zero errors.
- **Arena/sprite audit:** `arenaFloor0/1/2` are 16x16 with 256/256 opaque pixels; `arenaWall` is 16x24 with 384/384 opaque pixels; the arena has 528 floor tiles, solid borders/pillars, a 544x304 content bounds, no portal and no rooms; all 64 sprite names resolve.
- **Live bot run:** 18 seconds of real held LMB, mouse sweeps, WASD, Shift and F in a wave 12 arena — kills, banishes, a mega cast, phase and rift all executed, zero console/page errors.
- **Performance:** 40 live enemies at wave 30 hold 60.1–60.6 fps at 1280x800; particles stayed under ~30 per sample.
- **Visual review:** home rift gate + `[E] ENDLESS WAVES` / `BEST WAVE 33` prompt; wave 1, 3, 6, 12 and 30 arenas at 800x600 and 2560x1080; mega travel, bloom and late fade in the arena and in a dungeon room; MEGA badge and cast pips; wave panel rows; pause/confirm overlays; wave death overlay; debug overlay.

### Known limitations (Milestone 6)
- The wave roster caps at 40 enemies from wave 23 while HP keeps compounding. This is deliberate; see `DECISIONS.md`.
- A mega charge can be fired into empty space if the player casts with no enemies; the armed pips/`MEGA` badge are the only warning.
- The spawn-vortex visual is a ground effect and does not delay the enemy; a spawn can shoot shortly after it appears (its first shot waits for the 0.9–2.0s fire cooldown, plus the turret charge).


## Milestone 5 — Dimensional Traveler suite

### Rift / intangibility mechanics (browser)
- **Clean save:** `traveler` is unlocked at boot; home has three pedestals; selecting it equips 6 HP / 5 Armor / 220 EN and Kamui Gloves; the card lists both abilities.
- **Rift entry:** F runs `entering → rift`; a radius-54 `KamuiVortex` exists on the ground layer; the player plays a 0.8s two-phase spin (0.36s shrink-spin, a brief dot-sized pause, 0.36s grow-spin); the overlay reaches alpha 1; the portal is fully open at 0.75s and 1.0s and is fully closed at ~1.30s (0.5s after the 0.8s entry).
- **Rift movement:** the player can occupy solid wall tiles and pass gates/crates; no attack is created; `NO ATTACK IN RIFT` appears.
- **Enemy blindness:** active enemies stop moving/firing; hostile bullets pass through; `takeDamage(5)` does nothing.
- **Safe exit:** F again spins out, returns to `normal`, places the player on a non-solid/gate-free/crate-free tile (including when exiting deep inside a wall), and starts the 6.0s rift cooldown.
- **Intangibility:** Shift sets phase 4.0s / cooldown 9.0s; the player is invulnerable, cannot attack, still collides with walls; enemies still chase and shoot; bullets and contact do not damage; sparse eye tendrils render; Shift in the rift is denied.
- **Cooldown/denial:** F during cooldown/entering/exiting behaves correctly; Shift during phase cooldown is denied; the player cannot die while invulnerable.
- **Persistence:** selected traveler, unlock state and loadout survive reload.

**Independent traveler suite: 63/63 PASS after the revised animation, 0 console/page errors.** The two-phase spin measured `riftDur=0.8` (entry 0.798s): scaleY 0.954→0.02 over ~0.36s, a dot-sized pause (samples at 0.02), then spin+grow back to 0.954 by 0.781s; spinX crosses zero and recovers. Portal radius 54, layer ground, life 1.30s, full at 0.750s and 1.033s, last visible 1.198s, fully removed at 1.281s = **exactly 0.500s after entry**. Exit also 0.8s; deep-geometry exit relocated to a free spot (blocked=false, cooldown 6.0), overlay 1→0.5→0, normal collision restored. Movement/no-attack, 6 frozen enemies, bullet pass-through, `takeDamage` no-op, phase 3.93s/8.93s with walls blocking, 1,622 changed eye-region pixels + red glint, cooldown denials and save/reload all pass. One cosmetic note: an open hero card overlays the world-space pedestal name plates (the card itself shows the hero); plates never overlap each other.

### Kamui Gloves (browser)
- **Loadout:** legendary KAMUI GLOVES with 0 energy, glove sprite in hand and HUD, included in loot pools.
- **Attack path:** holding LMB produces at most 3 banishes in 5s (2.0s rate), exactly one vortex per cast, no bullets and no swing.
- **Banish:** the target spins on the sagittal axis and shrinks over 0.9s, is immune to other damage during the spin, dies once, drops orbs/Gems, and keeps the room locked until the pop.
- **One-shot:** guard/shaman/turret at depths 1 and 10 all die in one cast regardless of HP.
- **No target:** no portal is created, `NO TARGET` appears, cooldown is 0.45s, and LOS/cover rules prevent firing through walls/crates.
- **Targeting:** sticky aim target first, nearest visible within 280px otherwise; banishing targets are skipped by auto-aim and other weapons.
- **Rift interaction:** LMB in the rift creates no portal and banishes nothing.
- **HUD:** the weapon slot cooldown drains over 2s; no muzzle flash; no console/page errors.

**Kamui Gloves result: PASS — 46/46 checks after the auto-aim fix.**
- Loadout: `kamuiGloves` slot 0, summon/legendary/0 energy/2.0s/9999 damage/execute; 18x13 sprite with 35 red + 118 near-black pixels; in hand and slot HUD both show the glove; legendary gold-chest pool contains it (3,000 rolls ~78–97 hits; gold legendary rate 0.078–0.081).
- Attack: one press = one vortex at `(target.x, target.y-10)`, `banishing=true` after one update, bullets 0, swing null, muzzle 0, cooldown exactly 2.0; 5s hold = 3 casts at 2017ms intervals.
- Animation: draw scale X spans negative→positive (sagittal flip) while scale Y falls 0.968→0.156 over 52 frames; portal outlives the 0.85s pop by 0.333s; `BANISHED!`, kills +1, orbs/Gem drop.
- One-shot: depth-1 guard 12 / shaman 9 / turret 18 and depth-10 guard 34 / shaman 25 / turret 50 all die in one cast with no damage numbers.
- No target/LOS: empty room → `NO TARGET`, 0 vortexes, cooldown exactly 0.45; crate cover and a wall both block targeting.
- Targeting: sticky target preferred, nearest visible otherwise, subsequent casts skip the banishing target; the auto-aim keep-check now also skips `banishing` (fixed from a real defect found by this suite). Focused F4/F6 repro: aimTarget is null (single enemy) or hands off to B (two enemies) at 0.17s/0.5s/0.83s; reticle pixels 45 live vs 0 while banishing.
- Rift: LMB in the rift shows `NO ATTACK IN RIFT`, 0 casts, 0 vortices, no enemy damage.
- HUD: cooldown 2.0→1.0→0; slot drain bar 0→9→34 orange pixels; name orange; zero console/page errors.

### Regression (browser)
- **Save migration:** an old `{knight, gravito}` save auto-unlocks traveler, keeps gravito selected and gems intact.
- **Knight/Gravito:** Overdrive timings, gravity sword, orbs, black hole and single-skill Shift fallback unchanged.
- **Home:** three readable non-overlapping pedestal plates; all three hero cards fit (including the 24x28 portrait and two-ability card); selected plate fits the traveler; Gravito still costs 1 Gem.
- **HUD:** single-row panel remains at y=62 for Knight/Gravito with notices at y=92; two-row panel/notices at 116 for the traveler.
- **Core flow:** floor generation, room lock/clear/chest, portal advance (+1 Gem), death → home, pause/home confirm, mute, F3 debug.
- **Difficulty:** depth 1/5/10 HP and counts unchanged.
- **Errors:** zero console warnings/errors and zero page errors across all flows.

**Regression result: PASS — 61/61 assertions, 0 console events, 0 page errors.**
- Clean boot: `unlockedHeroes=["knight","traveler"]`, 3 pedestals, Knight 7/6/200 + Bad Pistol, save written on boot.
- Migration: `{gems:2, knight+gravito, selected gravito}` → traveler added, gravito still selected, gems 2, save rewritten.
- Knight: active 5.0 / cooldown 10.0; pistol cooldown 0.26 → 0.173333; 4 afterimages after 0.5s movement; Shift falls back.
- Gravito: unlock 5→4 gems; 5/5/240 + gravity sword; black hole 20 damage, 20s cooldown; orbs seek/reform; Shift falls back.
- Home plates: KNIGHT `82,100,45x11`, TRAVELER `156,94,57x11`, GRAVITO `239,100,51x11`; no pairwise overlap. Cards all in bounds (traveler 202x150 at 24,40; content bottom 152 above the prompt). Selected plate 176x44; traveler portrait bottom 250 within 262.
- HUD: Knight/Gravito panel 168x24 at y=62, notices y=92; traveler panel 184x48, notices y=116.
- Core flow: 6 rooms / 3 combat; room lock → clear → chest; portal → floor 2 with +1 Gem and loadout preserved; pause/H/N; mute; F3; death → R → home with meta kept.
- Difficulty: guards 12/22/34, shamans 9/16/25, turrets 18/32/50 at depths 1/5/10; counts in range.
- Persistence: traveler and Knight selections survive reload; save JSON valid.
- Visual note: a transient unlock/room notice banner can briefly overlap an open hero card because notices draw after cards; it clears after 2.4s and is not traveler-specific. The taller 150px traveler card is more exposed. No other regressions; all sprites (traveler, ghost, RIFT/PHASE icons, gloves) render.

### Final consolidated browser suite — 22/22 PASS, 0 console/page errors
- Clean save: `traveler` unlocked, 3 pedestals, 60 sprites, `SK.Kamui` present.
- Traveler equip: 6 HP / 5 Armor / 220 EN / KAMUI GLOVES, title `DIMENSIONAL TRAVELER`.
- Rift entry: `entering` at `riftDur=0.8`, entry portal effect `life=1.30`, overlay ramps; at t≈0.93 the state is `rift` with overlay 1 and the portal still full-scale.
- Enemy blindness: 5 active enemies froze (`moving=0`, no new bullets).
- Rift damage: `takeDamage(5)` left HP/armor unchanged.
- Wall phasing: holding east moved the player through a solid tile; the feet ended inside a solid tile.
- Safe exit: exiting inside the wall returned to `normal`, cooldown 5.83, and the final rect was not in a tile/gate/crate.
- Phase: 3.85s active, 8.85s cooldown, invulnerable, `canAttack=false`, eye trails visible; a hostile bullet passed through with HP/armor unchanged.
- Banish at depth 10: a 50 HP turret was banished in one cast, cooldown set to 2.0, exactly one vortex, target `banishing=true`; after 1.1s kills +1 and no banishing enemies remain.
- Reload: traveler remains selected/unlocked and boots home.
- Actual keyboard: real `F` enters/exits (0.8s spin), real `Shift` starts phase; zero errors.

## Milestone 4 difficulty suite — all pass

Node generator checks (depth passed to `new SK.Dungeon(depth, seed)`, 200+ seeds per depth):

| Depth | HP multiplier | Guard HP | Shaman HP | Turret HP | Goblins / room | Turrets / room |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1.00 | 12 | 9 | 18 | 3–4 | 1–2 |
| 2 | 1.20 | 14 | 11 | 22 | 3–4 | 1–2 |
| 3 | 1.40 | 17 | 13 | 25 | 4–5 | 1–2 |
| 4 | 1.60 | 19 | 14 | 29 | 4–5 | 2–3 |
| 5 | 1.80 | 22 | 16 | 32 | 5–6 | 2–3 |
| 7 | 2.20 | 26 | 20 | 40 | 6–7 | 3–4 |
| 9 | 2.60 | 31 | 23 | 47 | 7–8 | 3–4 |
| 10 | 2.80 | 34 | 25 | 50 | 7–8 | 3–4 |
| 12 | 3.20 | 38 | 29 | 58 | 7–8 | 3–4 |
| 20 | 4.80 | 58 | 43 | 86 | 7–8 | 3–4 |

- **Range contract:** every combat room's observed goblin and turret counts matched the published ranges across all tested seeds; every room kept at least one Guard and one Shaman.
- **Structural contract:** 6 rooms / 3 combat / 1 treasure / 1 portal, treasure room empty with a gold chest, enemies on floor tiles inside their room, no content on the reserved centre tile.
- **Live stats:** `entities.js` also loads in Node (`global.window = {}`); 32 assertions across 10 depths × 3 types confirmed `new SK.Enemy(type, x, y, room, depth)` produced exactly `SK.Difficulty.scaleHp(base, depth)` for `hp` and `maxHp`, stored the normalized `depth`, and that omitted/zero depth normalizes to 1 (guards 12, shamans 9, turrets 18 base).
- **Depth-1 determinism:** the historical 800-seed suite still reports `FAILS 0 / 800 seeds + fallback` after loading `difficulty.js`, confirming floor 1 layout/content is unchanged.
- **Crowding:** across 9,000 additional generated rooms (depths 1/10/20 × 500 seeds), no enemy or crate overlapped the reserved 3×3 chest centre, and placement never starved below the declared ranges even at 12 combat objects per room.

Browser checks (Chromium, HTTP + clean save):
- `DungeonSK.gotoFloor(n)` for `n = 1, 2, 3, 5, 10`: floor-1 combat rooms had 3–4 goblins and 1–2 turrets; floor-10 rooms had 7–8 goblins and 3–4 turrets; all live enemy HP values matched the table above at their floor.
- Floor advance from depth 2 to 3 (both the forced overlay and the natural portal path) showed `FLOOR 1-3` with the subtitle `ENEMY HP +40%`; depth 20 rendered `FLOOR 1-20` / `ENEMY HP +380%` with the plate auto-sizing and no clipping at 3x.
- Room lock → kill-all → clear → gate retraction → chest spawn still worked on floor 5 (9 enemies, `gateT 1 → 0`, exactly one chest in the room).
- Boot, save, HUD and display scaling verified; zero console warnings/errors and zero page errors.

## Milestone 3 browser suite — all pass

A single script drove the game through the complete meta loop with `page.evaluate` state inspection and screenshots:

- **Boot & save:** boot state `home`; default save gems `0`, unlocked `['knight']`, selected `knight`, Knight 7 HP / 6 Armor / 200 Energy with Bad Pistol; home grid 22x15; `localStorage` record exists immediately with the same values.
- **Deny unlock:** walking to the Gravito pedestal with 0 Gems and pressing `E` left Gravito locked, did not spend Gems, floated `NEED 1 GEM!` and kept the Knight active.
- **Unlock:** adding 1 Gem and pressing `E` spent exactly 1, added `gravito`, selected it, equipped Gravito (5/5/240, Meteoric Gravity Greatsword) and wrote all three fields to localStorage.
- **Dungeon entry:** pressing `E` at the home portal loaded a 6-room Floor `1-1` with Gravito and the gravity greatsword.
- **Gravity sword:** exact 0.56s cooldown, 12 damage, 0 energy; swing counter 1→5; the 5th swing created exactly one `SkyMeteor` effect.
- **Gravity Wells passive orbs:** reset to zero, then exactly one orb after 2.5s and three after another 5.1s; the visible 100 HP test enemy lost HP from orb hits (9 single-target), proving passive seeking/attacking. Orb hits never started the skill cooldown.
- **Gravity Wells collapse/cooldown:** pressing `F` with a visible target filled any missing orbs to three (`0→3` in the zero-orb case), paused orb attacks, started `forming`, consumed the orbs, produced exactly one `BlackHole` and set a `20.0s` cooldown; pressing again while the black hole was active or while cooling was denied.
- **Black hole damage/pull:** the tracked enemy lost exactly 20 HP at anchor; an enemy placed 55px away was pulled to ~1.65px from the centre in 650ms; the HUD showed the anchored countdown; after the 3s anchor plus the 0.45s fade the black hole was removed and the remaining cooldown was still active.
- **HOME modal:** clicking the top-right `[HOME]` button paused the game and opened the confirmation modal; `N` cancelled and resumed; clicking HOME again + `Y` confirmed.
- **Return-home reset:** state `home`, enemies/floor wiped, depth 1, Gravito kept, gems/unlocks kept, HP/armour/energy 5/5/240, starter gravity greatsword restored.
- **Knight switch / overdrive:** selecting Knight at the pedestal changed the live hero; activating Battle Overdrive set active `5.0`, cooldown `10.0`, and a pistol attack cooldown to `0.26 / 1.5 = 0.173333...` exactly.
- **Reload persistence:** after reload the game boots home with `gravito` still unlocked and the selected hero (Knight in this run) restored.
- **Console:** zero errors.

## Gem economy suite — all pass

- **Collection:** a Gem spawned next to the player magnetised, was removed, raised `saveData.gems` by 1, wrote localStorage immediately and floated `+1 GEM!`.
- **Enemy 8% roll:** with a controlled `Math.random = 0.02`, `onEnemyKilled` produced exactly one Gem pickup; with `0.5` it produced none.
- **Combat chest 45% roll:** with a controlled `Math.random = 0.2`, clearing a combat room spawned a chest with `containsGem = true`; opening it produced exactly one Gem pickup.
- **Portal reward:** entering the exit portal changed state to `advancing`, added exactly 1 Gem and saved; after the transition Floor 2 loaded and depth was 2.
- **Pause overlay:** `Esc` then `H` opened the HOME confirmation; `Y` returned to the home room.
- **Reload:** the Gem count survived a reload and matched localStorage.
- **HUD:** the Gem counter rendered in both the home and dungeon HUDs and flashed on collection.
- **Console:** zero errors.

## M1/M2 regression suite — all pass

- **Movement:** 250ms east movement displaced ~24.5px; diagonal W+D displaced ~17.3px on each axis with the same total length (normalized 8-way movement).
- **Auto-aim & pistol:** a guard 90px away was acquired, aim pointed at it, and a pistol attack created exactly one friendly bullet.
- **Energy:** railgun at 3 energy dry-fired (0 beams, energy unchanged, cooldown 0, `NO ENERGY!` float); at exactly 4 energy it fired one beam, spent 4 and set 0.70s cooldown.
- **Melee clearing:** a swinging Broadsword destroyed a hostile bullet in its sector.
- **Ground loot:** `E` filled the empty second slot with a Shotgun and marked the ground weapon dead; the existing two-slot swap semantics are unchanged.
- **Room flow:** teleporting into a combat room locked it; killing its enemies cleared it, retracted the gates and spawned a chest.
- **Portal/floor:** entering the portal advanced to Floor 2, preserved HP and loadout and awarded +1 Gem.
- **Death:** death entered game-over; `R` returned to the home room with Gems kept and Knight full HP.
- **Console:** zero errors.

### Preserved older suites
The 800-seed dungeon generator stress test was rerun after the portal refactor and again after Milestone 4 (**0 failures**) using the same structural criteria: 6 rooms (1 spawn / 3 combat / 1 portal / 1 treasure), treasure is a leaf under a combat room, gold chest at its centre, depth-1 combat rooms have 3–4 goblins with both types, 1–2 turrets and 2–4 crates, gates only on combat rooms, all corridor tiles floor, spawn/portal on floor, and a connected graph. Milestone 4 keeps the depth-1 ranges identical and adds the separate depth-scaling suite above. The historical 30/30 M2 gameplay and 13/13 M1 suites were not rerun byte-for-byte; the M3 regression suite above re-exercises the movement, auto-aim, energy, melee, loot, room, portal and death paths most affected by the Player and state-flow refactor.

## M3 sprite audit

Baked pixel data was inspected through `SK.Sprites.get(name).getContext('2d').getImageData`:

| Sprite | Size | Edge-bad non-outline pixels |
| --- | --- | --- |
| knight0–3, knightGhost | 20x22 | 0 |
| gravito0–3 | 20x22 | 0 |
| gravityGreatsword | 34x13 | 0 |
| gem | 10x10 | 0 |
| meteorRock | 18x18 | 0 |
| skillKnight / skillGravito | 14x14 | 0 |
| pillar | 18x32 | 0 |
| pedestal | 24x14 | 0 |
| torch | 10x16 | 0 |

All M3 outlined sprites use pure `#000000` outer outlines; the older dungeon art keeps `#0a0c12`. Hero frames include a 4-frame walk cycle and a gold ghost silhouette for Overdrive afterimages.

## M3 visual checks
Screenshots reviewed at 3x:
- Home Room: stone floor, carpet runner with gold trim/fringe, two bookshelves, two weapon racks, four torches, four outlined pillars, braziers, Knight/Gravito pedestals and the animated portal.
- Hero cards: Knight `EQUIPPED`; locked Gravito with gray unlock prompt + red `NEED 1 GEM!`; affordable Gravito with green `[E] UNLOCK (1 GEM)`; unlocked non-active with `[E] SELECT HERO`.
- Portal proximity: `[E] ENTER DUNGEON` plate at the top-center portal.
- Dungeon HUD: HP 7 segments / AR 6 / EN 200; skill icon + `[F]` + Knight cooldown gauge or Gravito orb count/next-orb sweep; black-hole `FORM`/`SEEK`/countdown/`FADE`; Gem counter + `[HOME]`; minimap shifted down; long gravity-sword name and 0-cost badge.
- Knight Overdrive: gold aura ring, floating gold afterimages while moving, `OVERDRIVE 4.6S` HUD.
- Gravity sword in hand: dark/blue blade, gold guard, violet aura/motes, 5 violet charge pips at the feet.
- Sky Meteor: floor reticle, diagonal white-lavender-purple streak and 18x18 rock above the target; impact with `-18`, dual purple/white rings, debris, crater.
- Gravity Wells: passive attacking orbs 1→3 with white/purple lightning and orbit/attack trails; 20s cooldown HUD; `FORM` spiral-in; black hole travel/anchor with soft periwinkle aura + ring, white horizontal flares, upper shoulder wisps, lavender bottom streaks, solid black core, upper-left rim crescent and a rotating pink/white accretion slash; pulled enemies clearly converging.
- Confirmation modal: wording, Gem icon, green `[Y] CONFIRM RETURN HOME`, red `[N] CANCEL`.
- Advance overlay: `DESCENDING`, `FLOOR 1-1`, floating Gem icon + `+1 GEM!`.
- Game-over: floor/kills/time/Gems Collected/Gems Kept and return-home prompt.
- No visual regressions in the minimap, pause, armor/HP bars, ground-loot prompt, gates or chests.

## Responsive scaling (Milestones 5.1–5.2)

The canvas fills the browser window. The virtual height is fixed at 270px; the virtual width is 480px up to 16:9 and widens (even values, capped at 640px) on wider windows, so the playfield covers the window instead of sitting inside bars. CSS scaling is continuous; `imageSmoothingEnabled = false` and `image-rendering: pixelated` keep nearest-neighbour sampling, and the canvas is positioned on integer offsets.

The backing store is **2× the virtual view** and the interface draws on its own half-size pixel grid: one UI pixel covers half a world pixel, so the HUD, notices, overlays and hit boxes are all 50% of their pre-5.2 size while the world is pixel-identical. UI clusters are anchored by `uiTL/uiTC/uiTR/uiBL/uiBC/uiBR/uiC` layers; mouse hit tests are converted into each layer's design space (`uiMouseIn`).

Measured with Playwright (Chromium 1254, `file://`):

| Viewport | Virtual | Backing | Canvas | Scale | Notes |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | 480×270 | 960×540 | 1920×1080 | 4.00× | exact 16:9 fill |
| 1920×940 | 552×270 | 1104×540 | 1920×940 | 3.48× | exact full-bleed, widened field |
| 1600×900 | 480×270 | 960×540 | 1600×900 | 3.33× | exact 16:9 fill |
| 2560×1080 | 640×270 | 1280×540 | 2560×1080 | 4.00× | width cap reached, exact fill |
| 1512×892 | 480×270 | 960×540 | 1512×851 | 3.15× | fills width, 20px bars top/bottom |
| 1280×800 | 480×270 | 960×540 | 1280×720 | 2.67× | fills width, 40px bars top/bottom |
| 1024×768 | 480×270 | 960×540 | 1024×576 | 2.13× | fills width, 96px bars top/bottom |
| 800×600 | 480×270 | 960×540 | 800×450 | 1.67× | fills width, 75px bars top/bottom |
| 1920×300 | 640×270 | 1280×540 | 711×300 | 1.11× | cap + contain, side bars |
| 300×200 | 480×270 | 960×540 | 300×169 | 0.63× | fractional fallback |

UI scale (1920×940): world pixel 3.478 CSS px, UI pixel 1.739 CSS px — exactly half, as designed.

Automated checks (25/25 pass on the current build):
- Exact full-bleed at 1920×940, 1920×1080 and 2560×1080; no overflow anywhere.
- Virtual width is 480 on ≤16:9 windows and 552/640 on wide ones; `canvas.height` is always 270 and the backing is always 2× the virtual view.
- Mouse at the viewport centre maps to `(viewW/2, 135) ± 2`.
- `homeButtonRect()` (410,6,64,15), `pauseHomeRect()` (160,146,160,17) and `confirmButtons()` (74/252) stay in design space; `uiMouseIn` maps them through `uiTR`/`uiC`. Clicking HOME, CANCEL, YES and pause RETURN HOME all work at 1920×940, 2560×1080, 1280×800 and 800×600.
- The old full-size HOME position no longer triggers the button, confirming the half-size hit box.
- Live resize during play (1920×940 → 1280×800 → 2560×1080 → 800×600 → 1920×940) preserves state, position, HP, weapons and floor with the animation clock still advancing; retested clicks use the newly mapped layer positions.
- Gameplay smoke on the half-size UI: room lock → shooting/kills → cleared chest/gates → portal advance → Traveler two-row HUD and abilities, zero errors.
- 60.1 fps at 1920×940 with the 1104×540 backing.
- Zero console warnings/errors and zero page errors across every viewport and resize sequence.

## Launch modes
- `http://127.0.0.1:8765`: boot home, start, combat room lock, zero errors.
- `file:///Users/terryagent/Documents/projects/dungeonSK/index.html`: boot home, `localStorage` record written successfully, canvas 1280x720 at a 1280x800 viewport (2.67×, 480x270 virtual, 960x540 backing), `imageSmoothingEnabled = false`, combat room locks, zero errors.

## Known limitations / not tested
- The interface renders at a fixed 50% of the world's pixel size at every window size. On very small windows (under roughly 1000px wide) the HUD text becomes very small; a responsive minimum UI pixel size would be the next refinement if small-window play matters.
- Only Chromium was automated. Canvas/WebAudio usage is standard, and `file://` direct launch was specifically verified; Firefox/Safari manual smoke testing is recommended before shipping.
- No mobile/touch input was implemented, so responsive touch play is out of scope.
- No long-duration frame-rate profiler was run; a 2 s rAF sample at 1920×940 with the 1104×540 backing measured 60.1 fps. The heaviest new effect is the black hole VFX (layered gradients, tapered ribbons/arcs, clipped slash) plus three orbiting orbs with trails/lightning; the particle cap remains 420 and effects are short-lived.
- Long-duration memory profiling was not performed; particles are capped, dungeon content is rebuilt per floor, and the save record is three small fields.
- Rarity distribution tests are statistical for gold chests; the rules/caps are asserted structurally and over 4,000 direct rolls.
- No accessibility audit beyond keyboard-only playability and the existing HUD labels.

## Notes
- The first versions of several tests produced false positives (a Gem spawned in the home, a pre-cleared combat room, a dead-but-not-filtered ground weapon, and a meteor captured off-screen). Those were test-setup issues, documented in `ERRORS.md` #29; the game behaviour was correct.
- Test scripts live outside the project so the shipped game remains dependency-free and launch-anywhere.
