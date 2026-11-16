# Dungeon SK

A compact 2D top-down roguelike dungeon shooter inspired by *Soul Knight*, built with pure HTML5 Canvas, CSS and modular vanilla ES6. **No frameworks, no build step, no external images, fonts, or audio files.**

The game boots into a handcrafted **Home Room / Sanctuary** hub, where you can enter the dungeon, spend persistent Gems to unlock **Gravito**, and choose between three playable heroes with distinct weapons and abilities: the Knight, Gravito, and the **Dimensional Traveler**. Every floor is harder than the last: enemies gain HP and spawn in greater numbers as you descend.

## Run it

Two supported ways:

1. **Double-click `index.html`** — the game is intentionally built with classic scripts (see [Technical notes](#technical-notes)) so it loads from `file://` without a server.
2. **Serve locally** (recommended for development):
   ```bash
   cd ~/Documents/projects/dungeonSK
   python3 -m http.server 8000
   # open http://localhost:8000
   ```
   Any static server works. There is no npm install and no build command.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / Arrow keys | Move |
| Left mouse / `Space` | Attack with the equipped weapon (hold to auto-fire at cooldown) |
| `F` / `Shift` | Activate the current hero's primary / secondary ability (`Shift` falls back to the primary on single-ability heroes) |
| `Q` / Right mouse | Swap between the two equipped weapons |
| `1` / `2` | Select weapon slot directly |
| `E` | Pick up nearby ground weapons in the dungeon; interact with the portal / hero pedestals at home |
| Walk into the home portal | Start Floor `1-1` |
| Click `[HOME]` / `H` | Open the “return to home room” confirmation from the dungeon |
| `Y` / `N` | Confirm / cancel return-home in the modal |
| `Esc` / `P` | Pause / resume; the pause panel also has a clickable `[H] RETURN HOME` button |
| `M` | Mute / unmute |
| `R` / `Enter` / click after death | Return to the Home Room (Gems and unlocks are kept) |
| `F3` or `` ` `` | Debug hitboxes + seed overlay |

## Display & interface (Milestones 5.1–5.2)

The canvas fills the browser window instead of sitting inside integer-scaled black bars. The 270px virtual height is fixed; the virtual width widens from 480px up to 640px on wide windows, so the playfield reaches the window edges without stretching the art or hiding the HUD. On windows narrower than 16:9 it falls back to the 480x270 design view, scaled continuously to fit the width (only the unavoidable top/bottom bands remain). Rendering stays nearest-neighbour (`imageSmoothingEnabled = false`).

The interface now renders on its own pixel grid at **half the world's pixel size**, so every HUD panel, label, minimap, button and overlay is 50% of its previous on-screen size while the playfield keeps its exact scale. Panels stay glued to their screen edges, notices/hints stay centred, and all click targets are mapped through the same layer transforms. The backing store is doubled so the smaller UI pixels stay crisp.

## What is new in Milestone 5

- **Dimensional Traveler — a third hero.** A 24x28 masked rift walker in a tattered charcoal cloak, with a crimson Kamui mask, a single sharingan eye, violet coat lining, gold buckle and red/black gloves. Six HP, five armor, 220 energy, and the legendary **Kamui Gloves**. The Traveler is a free base hero and is auto-unlocked in older saves.
- **Ability 1 — Kamui Rift (`F`).** The Traveler spins on the sagittal axis twice — shrinking into the portal, then spinning again and growing back in the other dimension — and opens a large animated black/grey spiral vortex. Inside the alternate dimension the screen gains a light-purple wash, enemies cannot see or hit the Traveler, walls/gates/crates stop blocking movement, and attacking is disabled. Pressing `F` again spins them back into the normal dimension at the nearest safe floor spot. The portal closes about half a second after entry; the ability starts a 6-second cooldown on exit. The camera follows the Traveler outside the room bounds while rifting.
- **Ability 2 — Intangibility (`Shift`).** For 4 seconds the Traveler becomes translucent and unravelling Kamui tendrils spiral out of their eye. Enemies can still see, chase and shoot, but every hit passes through; the Traveler still collides with walls and cannot attack. 9-second activation-to-ready cycle; the effect fades over the final moments.
- **Kamui Gloves — a summon weapon.** Red-and-black gauntlets that never swing or fire a projectile. Every 2 seconds they open the same dense Kamui vortex on a visible enemy; the target rotates on its sagittal axis, shrinks into the portal and pops instead of arriving anywhere. Infinite damage: guards, shamans and crystal turrets all die in one cast at any floor depth. The banish animation keeps the room locked until the target actually dies.
- **Two-ability HUD.** The Traveler gets a 184x48 two-row skill panel with separate `F` and `SHIFT` keycaps, active timers, cooldown sweeps and fill bars; Knight and Gravito keep the original single-row panel. Notice banners drop to y=116 for the Traveler so they never overlap the second row.
- **Data-driven hero sizes and secondary skills.** Hero definitions can now declare `spriteW`/`spriteH`, a `ghost` afterimage sprite and a `skill2`; the Player, home pedestals, hero cards and HUD all read those fields instead of assuming a 20x22 sprite and one skill.

## What is new in Milestone 4

- **Per-floor enemy scaling.** A single `SK.Difficulty` curve in `difficulty.js` is now the source of truth for both combat-room population and live enemy HP:
  - **More HP every floor:** enemy HP is multiplied by `1 + 0.2 × (depth − 1)` and rounded to a whole number. Guards are `12 → 14 → 17 → 19 → 22` HP over floors 1–5, shamans `9 → 11 → 13 → 14 → 16`, turrets `18 → 22 → 25 → 29 → 32`; scaling continues indefinitely.
  - **More enemies as you descend:** goblins start at 3–4 per combat room and gain +1 (to both ends of the range) every two floors, capped at 7–8. Crystal turrets start at 1–2 and gain +1 every three floors, capped at 3–4. Both caps keep rooms placeable and readable rather than turning every deep floor into an unavoidable bullet wall.
  - **Visible feedback:** the floor-advance notice now reads `ENEMY HP +20%`, `+40%` and so on instead of `KEEP DESCENDING`. Floor 1-1 is untouched, so the opening difficulty (and all existing regression contracts) remain exactly as before.
  - The existing room-clear, gate, chest, minimap, drop and Gem rules are unchanged.

## What is new in Milestone 3

- **Persistent Gem economy.** `localStorage` stores `gems`, `unlockedHeroes` and `selectedHero` under `dungeonSK.save.v1`. New saves start with `0` Gems, `['knight','traveler']` and `knight`; older saves auto-migrate the free Traveler. Gems drop from an 8% enemy-death roll, a 45% chance from each combat-room reward chest, and a guaranteed `+1` on entering the exit portal. A crisp 10x10 cyan/magenta faceted Gem with a generated 1px black outline and a specular sparkle magnetises to the player, updates the HUD immediately and saves instantly.
- **Home Room sanctuary hub.** The game boots directly into a handcrafted 22x15-tile (352x240 px) warm stone sanctuary with a woven red/gold carpet runner, bookshelves, weapon racks, flickering wall torches, outlined pillars, braziers and the animated dungeon-entrance portal. A `[E] ENTER DUNGEON` prompt appears nearby; walking into the portal core starts Floor `1-1`.
- **Character pedestals and hero cards.** Knight stands at the left carpet edge, the Traveler at the centre and Gravito at the right. Any hero you are not controlling idles at its pedestal. Within 26px of a pedestal, a semi-transparent pixel card shows the hero's name, portrait, `HP/AR/EN`, starting weapon (in rarity colour), active skill and action prompt. Locked Gravito costs `1 Gem`; the prompt is green when affordable and shows `NEED 1 GEM!` otherwise. Unlocking or selecting a hero swaps the live character, stats, sprite, skill and starter weapon immediately and saves `selectedHero`.
- **Return-home run reset.** The dungeon HUD now has a clickable top-right `[HOME]` button, and the pause panel has a `[H] RETURN HOME` option. Both open a confirmation modal (`[Y]` confirm / `[N]` cancel). Confirming wipes the current floor, temporary weapons, backpack, HP/armour/energy and returns to the sanctuary at full base stats with the selected hero's starter weapon. Gems, unlocked heroes and the selected hero are preserved.
- **Two heroes with data-driven kits.** The player now loads stats, sprite set, starter weapon and skill from `SK.Heroes` (`knight`, `gravito`). The HUD gained a skill icon + `[F]` badge + active glow bar + cooldown sweep with seconds below the HP/AR/EN bars.
- **Knight — “Battle Overdrive”.** 7 HP / 6 Armor / 200 Energy, Bad Pistol, silver/red-plumed chibi knight with 4-frame walk. The skill increases attack speed by +50% for all weapon kinds for `5.0s` on a `10.0s` activation-to-ready cycle, with a golden-orange aura, translucent golden afterimages and a battle-cry ring pulse.
- **Gravito — “Gravity Wells”.** 5 HP / 5 Armor / 240 Energy, obsidian-indigo hooded cosmic mage with neon-violet eyes and a floating rune. Starts with the 0-energy, 12-damage, `0.56s` **Meteoric Gravity Greatsword** — a 34x13 Starscourge-style dark-iron greatsword with a violet gravity aura and a 5-pip swing counter. Every 5th swing calls a telegraphed Sky Meteor: an 18x18 rotating cosmic rock with a layered white/lavender/deep-purple plasma tail, 18-damage AoE within 48px, a 5px shake, dual-ring shockwave, 18 debris particles and a fading crater.
- **Gravity Wells skill.** Three multi-layer orbs (swirling halo, violet event-horizon ring, pulsing black core, white/purple crackling lightning) with 12-point purple ribbon trails spawn passively every `2.5s` up to 3. They break orbit to auto-track visible on-screen enemies, strike for **9 single-target damage**, and reform after `0.75s`. Pressing `F` with a visible target pauses their attacks, fills any missing orbs to 3, and collapses them into a black hole on a **20-second cooldown**. The black hole homes to the target, deals **20 damage** to it on impact, anchors for `3.0s`, pulls enemies, turrets and hostile bullets toward it within `1.5×` the outer aura ball, then dissipates. The six-layer cel-shaded VFX includes a soft periwinkle aura, white horizontal flares, upper energy wisps, lavender orbital bottom streaks, a pitch-black event-horizon core, an inner crescent rim and a rotating pink/white accretion slash.

## What was new in Milestone 2

- Six-weapon, data-driven arsenal with five rarity tiers: Bad Pistol, Broadsword, Sawed-Off Shotgun, Laser Railgun, Crimson Scythe and Emerald Greatsword.
- Energy costs, dry-fire feedback, weapon slots with rarity-coloured names and cost badges.
- Ground loot with `[E] Name` prompts and a two-slot swap flow; normal/gold chests.
- Six-room floors with a treasure branch and a guaranteed gold chest.
- Crystal Turret third enemy archetype with telegraphed radial bullet rings.

## Milestone 1 foundation

- Hand-baked pixel art compiled at runtime from ASCII matrices, generated 1px outlines, white flash variants and a 5x7 pixel font.
- Crisp virtual display with `imageSmoothingEnabled = false`, a 480x270 design view and a responsive presentation that fills the browser window.
- Three-stat survival HUD, soft sticky/predictive auto-aim, sliding AABB movement, room-locking laser gates, minimap and portal.
- Fixed 60 Hz simulation, procedural six-room dungeon, particles, floating damage, screen shake, vignettes and a tiny WebAudio synth.
- Full state flow: home hub → floor → portal/advance → death → return home, plus pause, audio unlock/mute and auto-pause on blur.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | Minimal full-window canvas host, script order. |
| `style.css` | Dark `#0d0f14` page, absolutely positioned full-window canvas, pixelated rendering. |
| `sprites.js` | `bakeSprite` matrix baker with optional pure-black outlines, all palettes/art (heroes, gravity greatsword, Kamui gloves, gem, meteor, home tiles/props, skill icons), 5x7 pixel font. |
| `kamui.js` | Dimensional Traveler visual engine: layered animated Kamui spiral vortex, eye-originating intangibility tendrils, light-purple rift screen overlay and the `KamuiVortex` effect entity. |
| `difficulty.js` | Per-floor difficulty curve: enemy HP multiplier and combat-room goblin/turret spawn ranges (single source of truth). |
| `dungeon.js` | Seeded six-room + treasure-branch generator, tile collision, environment rendering, laser gates, shared portal, turret placement, minimap data, LOS. |
| `home.js` | Handcrafted 22x15 sanctuary hub: floor/carpet, walls, shelves, racks, torches, pillars, pedestals, braziers, portal, collision, hero idle drawing. |
| `entities.js` | Hero registry, weapon registry/rarities, player + active skills, Dimensional Traveler rift/phase state machine and Kamui Gloves banish, all weapon behaviours, goblins/turrets, crates, chests, ground loot, pickups/gems, Sky Meteor, Gravity Wells, effects, particles and floating text. |
| `main.js` | Fixed 60 Hz loop, input, camera, save manager, home/dungeon state flow, rift overlay, half-size UI layers and HUD (stats, two-ability skill panel, gems, HOME), minimap, loot prompts, beam casting, screen shake/vignettes, synth audio. |
| `DECISIONS.md` | Durable design/architecture decisions and rationale. |
| `PROGRESS.md` | Milestone checklist and verification status. |
| `ERRORS.md` | Real bugs encountered, root causes, fixes. |
| `TESTING.md` | Test matrix and commands used for verification. |

## Technical notes

- **Display scaling is responsive, not integer-snapped.** The virtual height is fixed at 270px and the virtual width is 480px at up to 16:9, widening (even values, max 640px) on wider windows so the playfield covers the window. CSS scaling is continuous and the canvas is positioned on integer offsets; `image-rendering: pixelated` keeps nearest-neighbour sampling. Narrower windows keep 480x270 and letterbox vertically.
- **The HUD is its own half-size pixel grid.** `UI_SCALE = 2` doubles the backing store; the world draws through a 2× transform (visually unchanged) while the interface draws 1:1 in backing pixels, so one UI pixel is half a world pixel. `uiLayer`/`withUI` anchor each cluster (top-left, top-centre, top-right, bottom-left, bottom-centre, bottom-right, centre) so the original 480x270 HUD layout stays edge-glued at any virtual width, and `uiMouseIn` converts the mouse into the matching design space for clicks and hover. This gives a uniform 50% interface without re-authoring every HUD coordinate.
- **Fixed timestep:** simulation advances in `1/60 s` steps via an accumulator; rendering happens every `requestAnimationFrame`. A frame clamp prevents spiral-of-death after tab switches.
- **Difficulty is data, not branches:** `difficulty.js` is loaded before the dungeon and entity modules and exposes pure functions for HP scaling and spawn ranges. `Dungeon` uses it for room content, `Enemy` uses it for live stats, and the floor notice uses it for the percentage. Depth 1 resolves to the original tuning exactly.
- **Heroes are data, including their art size and ability count.** `HERO_DEFS` entries may declare `spriteW`/`spriteH`, a `ghost` afterimage and a `skill2`. Player drawing, `drawHeroIdle`, hero cards and the HUD read those fields, so the 24x28 Traveler sits in the same systems as the 20x22 Knight and Gravito without special cases. `F` triggers slot 0 and `Shift` slot 1; heroes without a `skill2` fall back to their primary.
- **The rift is a player-local phase, not a global mode.** Only the Traveler's movement predicate bypasses collision; `game.isBlocked` itself still applies to enemies, black-hole pull, bullets and the rest of the world. The camera unclamps only while `isInRift()` is true, and `findFreeSpot` returns the player to a non-solid tile after the exit spin.
- **No ES modules on purpose:** browser `type="module"` is blocked by CORS when opened from `file://`; each JS file is an IIFE registering into the `window.SK` namespace, preserving modular file boundaries while working in both modes.
- **All art is local and procedural.** `bakeSprite` validates row widths, maps palette letters to pixels, writes a 1px outline into transparent neighbours (pure black for Milestone 3 hero/weapon/gem/meteor art), and can generate a white flash copy. Home tiles/props are baked the same way.
- **Audio is optional.** The synthesizer is created only after a user gesture; every call is guarded, and mute state uses `localStorage` with try/catch.
- **Persistence is optional-safe.** The save manager is defensive and falls back to an in-memory default if `localStorage` is unavailable (e.g. some `file://` environments); the game remains playable.
- **No build artifacts or dependencies** are needed to play. Test-only Playwright scripts live outside the project.

## Design goals

Small, readable, launch-anywhere. Everything you see is generated from code: the sanctuary and dungeon are built from data, every sprite is baked from ASCII, and every sound is synthesized. The visual rules (dark outlines, muted floors, 2–3 cel shades, glowing threats) are chosen so bullets, heroes and enemies read instantly at 480x270.
