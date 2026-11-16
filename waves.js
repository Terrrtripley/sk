/* =========================================================================
   DUNGEON SK — waves.js
   Endless wave mode. A single handcrafted obsidian arena plus a wave
   director that keeps spawning enemies forever:
     - enemy HP grows by +10% of its base value, compounding every wave
     - the number of enemies grows by +10%, compounding every wave
     - each cleared wave awards one Gem, and every 4th wave drops a weapon
   The arena exposes the same query/draw surface the dungeon does, so the
   existing player, enemy, bullet, camera and effect systems need no forks.
   ========================================================================= */
(function () {
  "use strict";

  const SK = (window.SK = window.SK || {});
  const TILE = SK.TILE || 16;

  const T_VOID = 0;
  const T_FLOOR = 1;
  const T_WALL = 2;

  // 34x19 tiles = 544x304 px: slightly larger than the 480x270 design view,
  // so the camera follows the fight without ever losing the arena shape.
  const W = 34;
  const H = 19;

  const BASE_ENEMIES = 5;
  const HP_GROWTH = 0.1;
  const COUNT_GROWTH = 0.1;
  const MAX_ENEMIES = 40;
  const TURRET_MAX = 4;
  const INTERMISSION = 2.4;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // -------------------------------------------------------------------------
  // Arena
  // -------------------------------------------------------------------------
  class WaveArena {
    constructor(seed) {
      this.seed = (seed == null ? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) : seed) >>> 0;
      this.w = W;
      this.h = H;
      this.depth = 1;
      this.tiles = new Uint8Array(W * H);

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
          this.tiles[y * W + x] = border ? T_WALL : T_FLOOR;
        }
      }
      // Four two-by-two basalt pillars provide cover without choking the rune.
      for (const p of [
        [7, 5],
        [25, 5],
        [7, 12],
        [25, 12],
      ]) {
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            this.tiles[(p[1] + dy) * W + (p[0] + dx)] = T_WALL;
          }
        }
      }

      this.intensity = 0.35;
      this.rooms = [];
      this.connections = [];
      this.gates = [];
      this.portal = null;
      this.portalRoom = null;
      this.treasureRoom = null;
      this.spawnPoint = { x: (W * TILE) / 2, y: (H * TILE) / 2 + 6 };
      this.contentBounds = {
        minX: 0,
        minY: 0,
        maxX: W - 1,
        maxY: H - 1,
        px: 0,
        py: 0,
        pw: W * TILE,
        ph: H * TILE,
      };
    }

    getTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return T_WALL;
      return this.tiles[ty * W + tx];
    }

    isSolidTile(tx, ty) {
      return this.getTile(tx, ty) !== T_FLOOR;
    }

    isSolidPixel(px, py) {
      return this.isSolidTile(Math.floor(px / TILE), Math.floor(py / TILE));
    }

    rectHitsTiles(x, y, w, h) {
      const x0 = Math.floor(x / TILE);
      const y0 = Math.floor(y / TILE);
      const x1 = Math.floor((x + w - 0.001) / TILE);
      const y1 = Math.floor((y + h - 0.001) / TILE);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.isSolidTile(tx, ty)) return true;
        }
      }
      return false;
    }

    rectFullyInsideRoom() {
      return false;
    }

    roomAtPixel() {
      return null;
    }

    activeGates() {
      return [];
    }

    lineOfSight(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return true;
      const steps = Math.ceil(dist / 5);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (this.isSolidPixel(x1 + dx * t, y1 + dy * t)) return false;
      }
      return true;
    }

    // Liang-Barsky segment/rect test, kept for API parity with Dungeon.
    segmentHitsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
      let t0 = 0;
      let t1 = 1;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const p = [-dx, dx, -dy, dy];
      const q = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
      for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
          if (q[i] < 0) return false;
        } else {
          const r = q[i] / p[i];
          if (p[i] < 0) {
            if (r > t1) return false;
            if (r > t0) t0 = r;
          } else {
            if (r < t0) return false;
            if (r < t1) t1 = r;
          }
        }
      }
      return true;
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------
    drawFloor(ctx, camX, camY, viewW, viewH, time) {
      this._time = time || 0;
      const Sprites = SK.Sprites;
      const startX = Math.floor(camX / TILE) - 1;
      const endX = Math.ceil((camX + viewW) / TILE) + 1;
      const startY = Math.floor(camY / TILE) - 1;
      const endY = Math.ceil((camY + viewH) / TILE) + 1;

      // Bedrock behind everything so the arena never floats in pure black.
      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
          if (this.getTile(tx, ty) === T_FLOOR) continue;
          ctx.drawImage(Sprites.get("rock"), tx * TILE, ty * TILE);
        }
      }

      for (let ty = 1; ty < H - 1; ty++) {
        for (let tx = 1; tx < W - 1; tx++) {
          if (this.getTile(tx, ty) !== T_FLOOR) continue;
          const hash = SK.Hash2(tx, ty, this.seed ^ 0x2f6a);
          let sprite = "arenaFloor0";
          if (hash % 100 < 14) sprite = "arenaFloor1";
          else if (hash % 100 < 23) sprite = "arenaFloor2";
          ctx.drawImage(Sprites.get(sprite), tx * TILE, ty * TILE);
        }
      }

      // Central crimson ritual rift. Intensity rises with the wave number.
      const cx = (W * TILE) / 2;
      const cy = (H * TILE) / 2;
      const heat = clamp(this.intensity == null ? 0.35 : this.intensity, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(time * (1.7 + heat * 1.4));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(cx, cy, 4, cx, cy, 92 + heat * 26);
      glow.addColorStop(0, "rgba(150,22,40," + (0.16 + heat * 0.13).toFixed(3) + ")");
      glow.addColorStop(0.45, "rgba(104,14,30," + (0.09 + heat * 0.08).toFixed(3) + ")");
      glow.addColorStop(1, "rgba(60,6,16,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 140, cy - 100, 280, 200);

      // Two broken counter-rotating tick rings.
      for (let ring = 0; ring < 2; ring++) {
        const rr = 40 + ring * 15 + Math.sin(time * 1.3 + ring) * 1.5;
        const n = 52 + ring * 16;
        const spin = time * (ring ? -0.18 : 0.24);
        ctx.globalAlpha = (0.16 + heat * 0.16) * (0.7 + pulse * 0.3);
        ctx.fillStyle = ring ? "#7f1620" : "#b32336";
        for (let i = 0; i < n; i++) {
          if (i % 4 === 0) continue;
          const a = (i / n) * Math.PI * 2 + spin;
          ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.52), 1, 1);
        }
      }

      // Radial fissures reaching outward from the rift.
      ctx.globalAlpha = 0.12 + heat * 0.12;
      ctx.strokeStyle = "#9d1b2d";
      ctx.lineWidth = 1;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        const outer = 62 + (i % 3) * 18;
        ctx.beginPath();
        for (let s = 0; s <= 6; s++) {
          const u = s / 6;
          const rr = 16 + (outer - 16) * u;
          const wob = Math.sin(u * 9 + i * 2.1 + time * 0.8) * 2.4;
          const px = cx + Math.cos(a) * rr + wob;
          const py = cy + Math.sin(a) * rr * 0.52 + wob * 0.5;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Hot core seam.
      ctx.globalAlpha = 0.22 + heat * 0.2 + pulse * 0.08;
      ctx.fillStyle = "#ff4658";
      ctx.fillRect(cx - 1, cy - 10, 2, 20);
      ctx.fillRect(cx - 10, cy - 1, 20, 2);
      ctx.globalAlpha = 0.14 + heat * 0.12;
      ctx.fillStyle = "#ffd0d6";
      ctx.fillRect(cx - 22, cy, 4, 1);
      ctx.fillRect(cx + 19, cy, 4, 1);
      ctx.fillRect(cx, cy - 22, 1, 4);
      ctx.fillRect(cx, cy + 19, 1, 4);
      ctx.restore();

      // Slow crimson embers drifting up through the arena.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 16; i++) {
        const base = SK.Hash2(i, 3, this.seed) % 1000;
        const px = cx - 250 + ((base * 7 + time * (4 + (i % 4) * 2)) % 500);
        const rise = (time * (9 + (i % 5) * 3) + base) % 190;
        const py = cy + 60 - rise;
        ctx.globalAlpha = Math.max(0, 0.34 - rise / 620) * (0.6 + 0.4 * Math.sin(time * 2 + i));
        ctx.fillStyle = i % 4 === 0 ? "#ff8a96" : i % 3 === 0 ? "#ff4658" : "#7f1620";
        ctx.fillRect(Math.round(px), Math.round(py), i % 6 === 0 ? 2 : 1, 1);
      }
      ctx.restore();
    }

    drawWalls(ctx, camX, camY, viewW, viewH) {
      const wall = SK.Sprites.get("arenaWall");
      for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
          if (this.getTile(tx, ty) !== T_WALL) continue;
          const px = tx * TILE;
          const py = ty * TILE;
          if (px + TILE < camX - 8 || py + 24 < camY - 8 || px > camX + viewW + 8 || py > camY + viewH + 24) continue;
          ctx.drawImage(wall, px, py);
        }
      }
      // Sparse glowing runes on the inner face of the border walls.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const tt = this._time || 0;
      const pulse = 0.5 + 0.5 * Math.sin(this.intensity * 8 + tt * 2.2);
      ctx.globalAlpha = 0.28 + pulse * 0.22;
      ctx.fillStyle = "#ff4658";
      for (let tx = 2; tx < W - 2; tx += 5) {
        if (SK.Hash2(tx, 7, this.seed) % 3 !== 0) continue;
        ctx.fillRect(tx * TILE + 7, 8, 1, 4);
        ctx.fillRect(tx * TILE + 9, 10, 1, 2);
      }
      ctx.restore();
    }

    drawGates() {}
    drawDoorThresholds() {}
    drawPortal() {}
  }

  // -------------------------------------------------------------------------
  // Wave director
  // -------------------------------------------------------------------------
  class WaveDirector {
    constructor() {
      this.wave = 0;
      this.cleared = 0;
      this.state = "idle"; // idle | intro | fighting | rest
      this.t = 0;
      this.lastCount = 0;
      this.seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      this.rng = mulberry32(this.seed);
      this.room = {
        id: 9001,
        type: "combat",
        x: 0,
        y: 0,
        w: W,
        h: H,
        locked: true,
        cleared: false,
        explored: true,
        gateT: 0,
        gates: [],
        connections: [],
        content: { enemies: [], crates: [], chest: null },
      };
    }

    /** Compounding +10% HP per wave on the base stat. */
    hpMultiplier(wave) {
      const w = Math.max(1, Math.floor(wave || 1));
      return Math.pow(1 + HP_GROWTH, w - 1);
    }

    hpPercent(wave) {
      return Math.round((this.hpMultiplier(wave) - 1) * 100);
    }

    /** Compounding +10% enemy count per wave, capped so the arena stays playable. */
    enemyCount(wave) {
      const w = Math.max(1, Math.floor(wave || 1));
      return Math.min(MAX_ENEMIES, Math.max(1, Math.round(BASE_ENEMIES * Math.pow(1 + COUNT_GROWTH, w - 1))));
    }

    turretCount(wave) {
      return Math.min(TURRET_MAX, 1 + Math.floor((Math.max(1, wave) - 1) / 5));
    }

    begin(game, best) {
      this.wave = 0;
      this.cleared = 0;
      this.state = "intro";
      this.t = 1.0;
      this.lastCount = 0;
      this.best = Math.max(0, best || 0);
      this.seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      this.rng = mulberry32(this.seed);
      if (game.dungeon) game.dungeon.intensity = 0.32;
      game.showNotice("ENDLESS WAVES", "SURVIVE AS LONG AS YOU CAN", "#ff5b68", 2.2);
      game.sfx("waveStart");
    }

    update(dt, game) {
      if (this.state === "intro") {
        this.t -= dt;
        if (this.t <= 0) this.startWave(game);
        return;
      }
      if (this.state === "fighting") {
        if (!this.anyAlive(game)) this.finishWave(game);
        return;
      }
      if (this.state === "rest") {
        this.t -= dt;
        if (this.t <= 0) this.startWave(game);
      }
    }

    anyAlive(game) {
      for (const e of game.enemies) {
        if (e.alive) return true;
      }
      return false;
    }

    aliveCount(game) {
      let n = 0;
      for (const e of game.enemies) {
        if (e.alive) n++;
      }
      return n;
    }

    startWave(game) {
      this.wave += 1;
      const arena = game.dungeon;
      const total = this.enemyCount(this.wave);
      const turrets = this.turretCount(this.wave);
      const goblins = Math.max(1, total - turrets);
      const types = [];
      for (let i = 0; i < turrets; i++) types.push("turret");
      for (let i = 0; i < goblins; i++) {
        if (i === 0) types.push("guard");
        else if (i === 1) types.push("shaman");
        else types.push(this.rng() < 0.58 ? "guard" : "shaman");
      }
      // Fisher-Yates with the wave RNG.
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        const tmp = types[i];
        types[i] = types[j];
        types[j] = tmp;
      }

      const spots = this.pickSpots(game, total);
      const mult = this.hpMultiplier(this.wave);
      for (let i = 0; i < types.length; i++) {
        const s = spots[Math.min(i, spots.length - 1)];
        const enemy = new SK.Enemy(types[i], s.x, s.y, this.room, 1, { hpMultiplier: mult });
        enemy.active = true;
        enemy.alert = 0.35;
        enemy.fireCd = 0.9 + this.rng() * 1.1;
        game.enemies.push(enemy);
        if (SK.KamuiVortex) {
          game.effects.push(
            new SK.KamuiVortex(s.x, s.y - 10, {
              radius: 23,
              open: 0.14,
              hold: 0.3,
              close: 0.3,
              squash: 0.9,
              alpha: 0.82,
              seed: this.rng() * 100,
              layer: "ground",
              red: true,
            })
          );
        }
      }

      if (arena) arena.intensity = clamp(0.32 + this.wave * 0.035, 0, 1);
      this.state = "fighting";
      this.t = 0;
      this.lastCount = types.length;
      game.showNotice(
        "WAVE " + this.wave,
        types.length + " ENEMIES  -  ENEMY HP +" + this.hpPercent(this.wave) + "%",
        "#ff5b68",
        1.9
      );
      game.sfx("waveStart");
      game.shake(1.8, 0.2);
    }

    /** Evenly spread spawn points, never within 104px of the player. */
    pickSpots(game, count) {
      const p = game.player;
      const px = p ? p.x : (W * TILE) / 2;
      const py = p ? p.y : (H * TILE) / 2;
      const pool = [];
      for (let ty = 2; ty < H - 2; ty += 2) {
        for (let tx = 2; tx < W - 2; tx += 2) {
          const x = tx * TILE + TILE / 2;
          const y = (ty + 1) * TILE;
          if (game.dungeon.isSolidPixel(x, y - 2) || game.dungeon.isSolidPixel(x, y - 9)) continue;
          const d = Math.hypot(x - px, y - py);
          if (d < 104) continue;
          pool.push({ x: x, y: y, d: d });
        }
      }
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        const tmp = pool[i];
        pool[i] = pool[j];
        pool[j] = tmp;
      }
      const chosen = [];
      const spacing = 26;
      for (const c of pool) {
        if (chosen.length >= count) break;
        let ok = true;
        for (const s of chosen) {
          if (Math.hypot(c.x - s.x, c.y - s.y) < spacing) {
            ok = false;
            break;
          }
        }
        if (ok) chosen.push(c);
      }
      // Defensive fallback: any free far tile, even if spacing is tight.
      if (chosen.length < count) {
        for (const c of pool) {
          if (chosen.length >= count) break;
          if (chosen.indexOf(c) < 0) chosen.push(c);
        }
      }
      while (chosen.length < count) {
        const a = (chosen.length / Math.max(1, count)) * Math.PI * 2;
        chosen.push({ x: (W * TILE) / 2 + Math.cos(a) * 150, y: (H * TILE) / 2 + Math.sin(a) * 90 });
      }
      return chosen;
    }

    finishWave(game) {
      this.cleared = this.wave;
      this.state = "rest";
      this.t = INTERMISSION;

      const p = game.player;
      game.addGems(1, { silent: true });
      game.runGems += 1;
      game.sfx("gem");
      if (p) {
        game.addFloatText(p.x, p.y - 38, "+1 GEM!", "#7dd3fc", { scale: 1, rise: 20, life: 1.0 });
        game.spawnParticles(p.x, p.y - 14, 14, {
          color: "#22d3ee",
          speed: 100,
          life: 0.5,
          size: 1,
          spread: 2.8,
          glow: true,
          drag: 2.4,
        });
        // Between-wave recovery: armor first, then HP. Endless waves need a
        // trickle because the arena has no chests or crates to loot.
        if (p.armor < p.maxArmor) {
          p.armor += 1;
          game.addFloatText(p.x, p.y - 52, "+1 AR", "#9fdcff", { scale: 1, rise: 18, life: 1.0 });
          game.spawnParticles(p.x, p.y - 12, 8, {
            color: "#66c8ff",
            speed: 70,
            life: 0.35,
            size: 1,
            spread: 2.8,
            glow: true,
            drag: 3,
          });
        } else if (p.hp < p.maxHp) {
          p.heal(1);
          game.addFloatText(p.x, p.y - 52, "+1 HP", "#ff7b86", { scale: 1, rise: 18, life: 1.0 });
          game.spawnParticles(p.x, p.y - 12, 8, {
            color: "#ff8888",
            speed: 70,
            life: 0.35,
            size: 1,
            spread: 2.8,
            glow: true,
            drag: 3,
          });
        }
      }

      if (game.saveData && this.wave > (game.saveData.bestWave || 0)) {
        game.saveData.bestWave = this.wave;
        game.writeSave();
      }

      let sub = "+1 GEM  -  NEXT WAVE INCOMING";
      if (this.wave % 4 === 0 && SK.Weapons && game.dropWeapon) {
        const def = SK.Weapons.random("gold");
        const cx = (W * TILE) / 2;
        const cy = (H * TILE) / 2;
        game.dropWeapon(def, cx + this.rng() * 40 - 20, cy, { toss: true });
        game.spawnPickups(cx - 14, cy - 4, "hp", 1, 18);
        game.addFloatText(cx, cy - 30, "WEAPON DROP!", "#ffd86b", { scale: 1, rise: 18, life: 1.2 });
        sub = "+1 GEM  -  WEAPON DROP!";
      }
      game.showNotice("WAVE " + this.wave + " CLEARED", sub, "#ffb86b", 2.0);
      game.sfx("waveClear");
      game.shake(1.6, 0.18);
    }

    recordBest(game) {
      if (!game || !game.saveData) return this.wave;
      if (this.wave > (game.saveData.bestWave || 0)) {
        game.saveData.bestWave = this.wave;
        game.writeSave();
      }
      return game.saveData.bestWave || 0;
    }
  }

  // -------------------------------------------------------------------------
  // Home-room rift gate (visual only; interaction lives in main.js)
  // -------------------------------------------------------------------------
  function drawRiftGate(ctx, x, y, time, opts) {
    opts = opts || {};
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.4);

    // Warm crimson floor pool.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 38);
    glow.addColorStop(0, "rgba(190,32,52,0.26)");
    glow.addColorStop(0.5, "rgba(120,16,34,0.12)");
    glow.addColorStop(1, "rgba(70,6,18,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 42, y - 46, 84, 70);
    ctx.restore();

    // Pixel dais.
    const ellipse = (cy, rx, ry, color, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      for (let dy = -ry; dy <= ry; dy++) {
        const t = 1 - (dy * dy) / (ry * ry);
        if (t <= 0) continue;
        const w = Math.round(rx * Math.sqrt(t));
        ctx.fillRect(x - w, cy + dy, w * 2, 1);
      }
      ctx.restore();
    };
    ellipse(y + 5, 27, 9, "#070409", 0.92);
    ellipse(y + 4, 25, 8, "#2a0a12", 0.98);
    ellipse(y + 3, 20, 6, "#48101c", 1);
    ellipse(y + 2, 15, 4, "#1a0509", 1);

    // Broken crimson rune ticks around the rim.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45 + pulse * 0.3;
    ctx.fillStyle = "#ff4658";
    for (let i = 0; i < 22; i++) {
      if (i % 3 === 0) continue;
      const a = (i / 22) * Math.PI * 2 + time * 0.22;
      ctx.fillRect(Math.round(x + Math.cos(a) * 23), Math.round(y + 3 + Math.sin(a) * 8), 1, 1);
    }
    ctx.restore();

    // Floating rift vortex above the dais.
    if (SK.Kamui && SK.Kamui.drawVortex) {
      SK.Kamui.drawVortex(ctx, x, y - 22, 19, time, {
        alpha: 0.9,
        seed: 11.3,
        squash: 0.92,
        haze: 0.9,
        red: true,
      });
    } else {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#ff4658";
      ctx.beginPath();
      ctx.ellipse(x, y - 22, 16, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Rising red motes.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 10; i++) {
      const a = time * 0.8 + i * 2.399;
      const rise = (time * 15 + i * 11) % 34;
      ctx.globalAlpha = Math.max(0.08, 0.6 - rise / 52) * (0.6 + 0.4 * Math.sin(time * 4 + i));
      ctx.fillStyle = i % 3 === 0 ? "#ffd0d6" : i % 2 === 0 ? "#ff4658" : "#7f1620";
      ctx.fillRect(
        Math.round(x + Math.cos(a) * (8 + (i % 4) * 4) * (1 - rise / 80)),
        Math.round(y - 12 - rise + Math.sin(a * 1.4) * 2),
        i % 5 === 0 ? 2 : 1,
        1
      );
    }
    ctx.restore();

    // Floating crimson crown rune.
    const rx = x + Math.cos(time * 1.1) * 11;
    const ry = y - 48 + Math.sin(time * 1.7) * 3;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#ff7a88";
    ctx.fillRect(Math.round(rx), Math.round(ry), 2, 2);
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = "#b32336";
    ctx.fillRect(Math.round(rx) - 3, Math.round(ry) + 1, 8, 1);
    ctx.fillRect(Math.round(rx) + 1, Math.round(ry) - 3, 1, 8);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  SK.WaveArena = WaveArena;
  SK.WaveDirector = WaveDirector;
  SK.Waves = {
    WaveArena: WaveArena,
    WaveDirector: WaveDirector,
    drawRiftGate: drawRiftGate,
    TILE: TILE,
    BASE_ENEMIES: BASE_ENEMIES,
    HP_GROWTH: HP_GROWTH,
    COUNT_GROWTH: COUNT_GROWTH,
    MAX_ENEMIES: MAX_ENEMIES,
    INTERMISSION: INTERMISSION,
  };
})();
