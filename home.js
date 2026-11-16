/* =========================================================================
   DUNGEON SK — home.js
   Handcrafted 22x15 sanctuary hub: polished stone floor, woven carpet,
   bookshelves, weapon racks, flickering torches, outlined pillars, hero
   pedestals and the animated dungeon-entrance portal.
   ========================================================================= */
(function () {
  "use strict";

  const SK = (window.SK = window.SK || {});
  const TILE = SK.TILE || 16;

  const W = 22;
  const H = 15;
  const T_FLOOR = 1;
  const T_WALL = 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  const HOME_HERO_SPOTS = {
    knight: { x: 6 * TILE + 8, y: 9 * TILE + 8, color: "#e8b04e", accent: "#fbbf24", rgb: "232,176,78" },
    traveler: { x: 11 * TILE + 8, y: 9 * TILE + 8, color: "#c4b5fd", accent: "#a78bfa", rgb: "196,181,253" },
    gravito: { x: 16 * TILE + 8, y: 9 * TILE + 8, color: "#a855f7", accent: "#e879f9", rgb: "168,85,247" },
  };

  class HomeRoom {
    constructor() {
      this.w = W;
      this.h = H;
      this.tiles = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
          this.tiles[y * W + x] = border ? T_WALL : T_FLOOR;
        }
      }

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
      this.rooms = [];
      this.connections = [];
      this.gates = [];
      this.portalRoom = null;
      this.treasureRoom = null;

      this.portal = { x: (W * TILE) / 2, y: 3 * TILE + 8 };
      this.spawnPoint = { x: (W * TILE) / 2, y: 12 * TILE + 8 };
      // Endless-wave rift gate: right of the entrance dais, above Gravito's
      // pedestal and clear of the brazier, pillar and hero name plates.
      this.waveGate = { x: 17 * TILE - 14, y: 5 * TILE + 4, radius: 30 };
      this.pedestals = HOME_HERO_SPOTS;

      // Decorative props. 'solid' entries also block movement.
      this.shelves = [
        { x: 34, y: 8 },
        { x: W * TILE - 74, y: 8 },
      ];
      this.racks = [
        { x: 84, y: 12 },
        { x: W * TILE - 118, y: 12 },
      ];
      this.pillars = [
        { x: 3 * TILE + 8, y: 5 * TILE + 16 },
        { x: 18 * TILE + 8, y: 5 * TILE + 16 },
        { x: 3 * TILE + 8, y: 11 * TILE + 16 },
        { x: 18 * TILE + 8, y: 11 * TILE + 16 },
      ];
      this.torches = [
        { x: 6 * TILE + 8, y: 1 * TILE + 13 },
        { x: 15 * TILE + 8, y: 1 * TILE + 13 },
        { x: 1 * TILE + 11, y: 7 * TILE + 8 },
        { x: 20 * TILE + 5, y: 7 * TILE + 8 },
      ];

      this.solids = [];
      for (const s of this.shelves) {
        this.solids.push({ x: s.x + 1, y: s.y + 14, w: 38, h: 12 });
      }
      for (const r of this.racks) {
        this.solids.push({ x: r.x + 1, y: r.y + 10, w: 32, h: 13 });
      }
      for (const p of this.pillars) {
        this.solids.push({ x: p.x - 7, y: p.y - 10, w: 14, h: 10 });
      }
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

    isBlocked(x, y, w, h) {
      if (this.rectHitsTiles(x, y, w, h)) return true;
      for (const s of this.solids) {
        if (x < s.x + s.w && x + w > s.x && y < s.y + s.h && y + h > s.y) return true;
      }
      return false;
    }

    lineOfSight() {
      return true;
    }

    roomAtPixel() {
      return null;
    }

    drawGates() {}
    drawDoorThresholds() {}

    /** Distance from a player position to the nearest hero pedestal. */
    nearestPedestal(px, py) {
      let best = null;
      let bestDist = 26.01;
      for (const id of Object.keys(this.pedestals)) {
        const p = this.pedestals[id];
        const d = Math.hypot(px - p.x, py - 6 - (p.y - 6));
        if (d <= 26 && d < bestDist) {
          best = { id: id, spot: p, dist: d };
          bestDist = d;
        }
      }
      return best;
    }

    /** True when the player is close enough to press E at the endless rift. */
    waveGateNear(px, py) {
      const g = this.waveGate;
      if (!g) return false;
      return Math.hypot(px - g.x, py - 8 - g.y) <= (g.radius || 30);
    }

    drawFloor(ctx, camX, camY, viewW, viewH, time) {
      const Sprites = SK.Sprites;
      // Cover the full visible area with bedrock: on wide windows the camera
      // reveals more than one tile outside the sanctuary, and a black band
      // would read like a letterbox.
      const startX = Math.floor(camX / TILE) - 1;
      const endX = Math.ceil((camX + viewW) / TILE) + 1;
      const startY = Math.floor(camY / TILE) - 1;
      const endY = Math.ceil((camY + viewH) / TILE) + 1;

      // Very dark warm bedrock outside the sanctuary.
      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
          if (this.getTile(tx, ty) === T_FLOOR) continue;
          if (tx >= 0 && ty >= 0 && tx < W && ty < H) continue;
          ctx.drawImage(Sprites.get("rock"), tx * TILE, ty * TILE);
        }
      }

      // Polished warm stone with sparse seams and glints.
      for (let ty = 1; ty < H - 1; ty++) {
        for (let tx = 1; tx < W - 1; tx++) {
          const hash = SK.Hash2(tx, ty, 0x51a7);
          let sprite = "homeFloor0";
          if (hash % 100 < 11) sprite = "homeFloor1";
          else if (hash % 100 < 20) sprite = "homeFloor2";
          ctx.drawImage(Sprites.get(sprite), tx * TILE, ty * TILE);
        }
      }

      // Woven red/gold carpet runner (6 tiles wide).
      for (let ty = 4; ty <= 12; ty++) {
        for (let tx = 8; tx <= 13; tx++) {
          ctx.drawImage(Sprites.get("carpet"), tx * TILE, ty * TILE);
        }
      }
      ctx.save();
      ctx.fillStyle = "#e8b04e";
      ctx.fillRect(8 * TILE, 4 * TILE, 1, 9 * TILE);
      ctx.fillRect(14 * TILE - 1, 4 * TILE, 1, 9 * TILE);
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#a06d24";
      ctx.fillRect(8 * TILE + 1, 4 * TILE, 1, 9 * TILE);
      ctx.fillRect(14 * TILE - 2, 4 * TILE, 1, 9 * TILE);
      // Gold end caps and woven fringe.
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#e8b04e";
      ctx.fillRect(8 * TILE, 4 * TILE, 6 * TILE, 1);
      ctx.fillRect(8 * TILE, 13 * TILE - 1, 6 * TILE, 1);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#fde68a";
      for (let i = 0; i < 12; i++) {
        const fx = 8 * TILE + 3 + i * 8;
        ctx.fillRect(fx, 13 * TILE, 2, 2);
      }
      ctx.restore();

      // Subtle gold sanctuary sigil at the spawn point.
      const sx = this.spawnPoint.x;
      const sy = this.spawnPoint.y;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.8);
      ctx.globalAlpha = 0.13 + pulse * 0.05;
      ctx.fillStyle = "#e8b04e";
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        ctx.fillRect(Math.round(sx + Math.cos(a) * 22), Math.round(sy - 9 + Math.sin(a) * 9), 1, 1);
      }
      ctx.globalAlpha = 0.08 + pulse * 0.04;
      ctx.fillRect(sx - 1, sy - 30, 2, 30);
      ctx.restore();
    }

    drawWalls(ctx, camX, camY, viewW, viewH) {
      const wall = SK.Sprites.get("homeWall");
      for (let ty = 0; ty < H; ty++) {
        for (let tx = 0; tx < W; tx++) {
          if (this.getTile(tx, ty) !== T_WALL) continue;
          // Cull off-screen wall tiles.
          const px = tx * TILE;
          const py = ty * TILE;
          if (px + TILE < camX - 8 || py + 24 < camY - 8 || px > camX + viewW + 8 || py > camY + viewH + 24) continue;
          ctx.drawImage(wall, px, py);
        }
      }
    }

    drawProps(ctx, time, heroInfo) {
      const Sprites = SK.Sprites;
      heroInfo = heroInfo || {};

      // Bookshelves and weapon racks along the upper wall.
      for (const s of this.shelves) {
        const bob = 0;
        ctx.drawImage(Sprites.get("shelf"), s.x, s.y + bob);
      }
      for (const r of this.racks) {
        ctx.drawImage(Sprites.get("rack"), r.x, r.y);
      }

      // Sanctuary pillars (solid, outlined).
      for (const p of this.pillars) {
        ctx.drawImage(Sprites.get("pillar"), p.x - 9, p.y - 32);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.12 + 0.05 * Math.sin(time * 2 + p.x);
        ctx.fillStyle = "#e8b04e";
        ctx.fillRect(p.x - 6, p.y - 30, 12, 1);
        ctx.restore();
      }

      // Flickering wall torches with warm light pools.
      for (let i = 0; i < this.torches.length; i++) {
        this.drawTorch(ctx, this.torches[i], time, i);
      }

      // Pedestals with hero-coloured rune glow.
      for (const id of Object.keys(this.pedestals)) {
        const p = this.pedestals[id];
        const info = heroInfo[id] || {};
        const color = info.color || p.color;
        this.drawPedestal(ctx, p, time, color, !!info.active, !!info.locked);
      }

      // The dungeon entrance.
      SK.drawPortalAt(ctx, this.portal.x, this.portal.y, time);

      // Two small braziers flanking the portal dais.
      this.drawBrazier(ctx, this.portal.x - 46, this.portal.y + 15, time, 0);
      this.drawBrazier(ctx, this.portal.x + 46, this.portal.y + 15, time, 1.6);
    }

    drawTorch(ctx, torch, time, index) {
      const Sprites = SK.Sprites;
      const flick = Math.sin(time * 12 + index * 2.1) * 0.55 + Math.sin(time * 7.3 + index * 4.7) * 0.35;
      const x = torch.x;
      const y = torch.y;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(x, y - 20, 2, x, y - 20, 34);
      glow.addColorStop(0, "rgba(255,190,90,0.30)");
      glow.addColorStop(0.45, "rgba(235,120,40,0.12)");
      glow.addColorStop(1, "rgba(180,60,20,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 38, y - 58, 76, 76);
      ctx.restore();

      ctx.drawImage(Sprites.get("torch"), x - 5, y - 16);

      // Layered pixel flame.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const h = 8 + Math.max(0, flick) * 3;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = "#f97316";
      ctx.fillRect(x - 2, y - 20 - h, 4, h);
      ctx.fillRect(x - 3, y - 18 - h, 6, h - 2);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x - 1, y - 19 - h, 2, h + 2);
      ctx.fillRect(x - 2, y - 17 - h, 4, h - 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff7d6";
      ctx.fillRect(x - 1, y - 17 - h, 2, Math.max(2, h - 3));
      if (flick > 0.25) {
        ctx.fillStyle = "#fde68a";
        ctx.fillRect(x + 1, y - 22 - h, 1, 2);
      }
      ctx.restore();
    }

    drawPedestal(ctx, p, time, color, active, locked) {
      const Sprites = SK.Sprites;
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + p.x * 0.03);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(p.x, p.y - 5, 2, p.x, p.y - 5, 26);
      glow.addColorStop(0, active ? "rgba(232,176,78,0.24)" : "rgba(" + (p.rgb || "168,85,247") + ",0.18)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - 28, p.y - 32, 56, 44);
      ctx.globalAlpha = 0.5 + pulse * 0.25;
      ctx.fillStyle = color;
      for (let i = 0; i < 20; i++) {
        if (i % 3 === 0) continue;
        const a = (i / 20) * Math.PI * 2 + time * 0.35;
        ctx.fillRect(Math.round(p.x + Math.cos(a) * 14), Math.round(p.y - 3 + Math.sin(a) * 5), 1, 1);
      }
      ctx.restore();

      ctx.drawImage(Sprites.get("pedestal"), p.x - 12, p.y - 14);

      if (active) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.5 + pulse * 0.3;
        ctx.fillStyle = "#ffe09a";
        ctx.fillRect(p.x - 4, p.y - 18, 8, 1);
        ctx.fillRect(p.x - 1, p.y - 21, 2, 7);
        ctx.restore();
      } else if (locked) {
        ctx.save();
        ctx.globalAlpha = 0.6 + pulse * 0.2;
        ctx.fillStyle = "#0a0c12";
        ctx.fillRect(p.x - 4, p.y - 9, 8, 7);
        ctx.fillStyle = "#c084fc";
        ctx.fillRect(p.x - 3, p.y - 8, 6, 5);
        ctx.fillStyle = "#1e1b4b";
        ctx.fillRect(p.x - 1, p.y - 7, 2, 2);
        ctx.fillStyle = "#c084fc";
        ctx.fillRect(p.x - 1, p.y - 12, 1, 3);
        ctx.fillRect(p.x + 1, p.y - 12, 1, 3);
        ctx.fillRect(p.x - 2, p.y - 10, 5, 1);
        ctx.restore();
      }
    }

    drawBrazier(ctx, x, y, time, phase) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 8 + phase);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(x, y - 8, 1, x, y - 8, 24);
      glow.addColorStop(0, "rgba(255,170,80,0.24)");
      glow.addColorStop(1, "rgba(200,80,20,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 26, y - 34, 52, 52);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "#241e19";
      ctx.fillRect(x - 5, y - 3, 10, 4);
      ctx.fillRect(x - 3, y - 6, 6, 3);
      ctx.fillStyle = "#5b4632";
      ctx.fillRect(x - 4, y - 6, 8, 1);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#f97316";
      ctx.fillRect(x - 2, y - 12 - pulse, 4, 6 + pulse);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x - 1, y - 14 - pulse, 2, 7);
      ctx.fillStyle = "#fff7d6";
      ctx.fillRect(x - 1, y - 12 - pulse, 1, 3);
      ctx.restore();
    }
  }

  /** Draw an idle hero standing at a pedestal (non-controlled heroes). */
  function drawHeroIdle(ctx, heroId, x, y, time, opts) {
    opts = opts || {};
    const hero = SK.Heroes && SK.Heroes.defs[heroId];
    const spriteName = (hero ? hero.sprite : heroId) + "0";
    const spr = SK.Sprites.get(spriteName);
    const aw = (hero && hero.spriteW) || 20;
    const ah = (hero && hero.spriteH) || 22;
    const phase = heroId === "gravito" ? 1.7 : heroId === "traveler" ? 0.9 : 0;
    const bob = Math.round(Math.sin(time * 3.1 + phase) * 0.9);
    const sway = Math.sin(time * 1.7 + (heroId === "gravito" ? 2.3 : 0)) * 1.2;

    ctx.save();
    if (opts.locked) ctx.globalAlpha = 0.72;
    // Contact shadow on the pedestal top.
    ctx.globalAlpha *= 0.9;
    ctx.fillStyle = "#000000";
    ctx.fillRect(Math.round(x - aw * 0.3), Math.round(y - 1), Math.round(aw * 0.6), 2);
    ctx.globalAlpha = opts.locked ? 0.72 : 1;
    ctx.translate(Math.round(x + sway), Math.round(y + bob));
    ctx.drawImage(spr, -Math.round(aw / 2), -ah);
    ctx.restore();

    if (heroId === "gravito") {
      // Floating cosmic rune accent.
      const t = time * 2.3;
      const rx = x + Math.cos(t) * 13;
      const ry = y - 19 + Math.sin(t * 1.4) * 4;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "#e879f9";
      ctx.fillRect(Math.round(rx), Math.round(ry), 2, 2);
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#a855f7";
      ctx.fillRect(Math.round(rx) - 2, Math.round(ry) + 1, 6, 1);
      ctx.fillRect(Math.round(rx) + 1, Math.round(ry) - 2, 1, 6);
      ctx.restore();
    }
    if (heroId === "traveler") {
      // One sharingan glint and a lazy violet rift wisp around the mask.
      const ex = x + 4;
      const ey = y - ah + 9;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(time * 5.2);
      ctx.fillStyle = "#ff4658";
      ctx.fillRect(ex, ey, 1, 1);
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = "#a78bfa";
      for (let i = 0; i < 7; i++) {
        const a = time * 0.9 + (i / 7) * Math.PI * 2;
        const rr = 9 + (i % 3) * 3;
        ctx.fillRect(Math.round(x + Math.cos(a) * rr), Math.round(ey + Math.sin(a) * rr * 0.7), 1, 1);
      }
      ctx.restore();
    }
  }

  SK.HomeRoom = HomeRoom;
  SK.HOME_TILE = TILE;
  SK.drawHeroIdle = drawHeroIdle;
})();
