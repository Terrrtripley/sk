/* =========================================================================
   DUNGEON SK — dungeon.js
   Procedural 6-room dungeon (spawn + 3 combat + portal + treasure branch),
   3-wide corridors, tile collision, minimap data, room-locking laser gates
   and the animated exit portal.
   ========================================================================= */
(function () {
  "use strict";

  const SK = (window.SK = window.SK || {});

  const TILE = 16;
  const T_VOID = 0;
  const T_FLOOR = 1;
  const T_WALL = 2;

  const MAP_W = 96;
  const MAP_H = 64;

  const SIDE_VECTORS = {
    E: { x: 1, y: 0 },
    W: { x: -1, y: 0 },
    N: { x: 0, y: -1 },
    S: { x: 0, y: 1 },
  };

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

  function hash2(x, y, seed) {
    let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function easeOutCubic(t) {
    const u = 1 - t;
    return 1 - u * u * u;
  }

  class Dungeon {
    constructor(depth, seed) {
      this.depth = SK.Difficulty.normalizeDepth(depth);
      this.seed = (seed == null ? (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) : seed) >>> 0;
      this.rng = mulberry32(this.seed);
      this.tiles = new Uint8Array(MAP_W * MAP_H);
      this.rooms = [];
      this.connections = [];
      this.gates = [];
      this._nextRoomId = 0;
      this.spawnPoint = { x: 0, y: 0 };
      this.portal = null;
      this.contentBounds = { minX: 0, minY: 0, maxX: MAP_W - 1, maxY: MAP_H - 1 };
      this.build();
    }

    rint(min, max) {
      return min + Math.floor(this.rng() * (max - min + 1));
    }

    pick(arr) {
      return arr[Math.floor(this.rng() * arr.length)];
    }

    build() {
      let layout = null;
      for (let attempt = 0; attempt < 60 && !layout; attempt++) {
        layout = this.tryLayout();
      }
      if (!layout) layout = this.fallbackLayout();

      this.rooms = layout.rooms;
      this.connections = layout.connections;

      this.carveFloors();
      this.computeWalls();
      this.designateRooms();
      this.buildGates();
      this.computeContentBounds();
      this.buildContents();
      this.markInitialExploration();
    }

    // ---------------------------------------------------------------------
    // Layout
    // ---------------------------------------------------------------------
    tryLayout() {
      const rooms = [];
      const connections = [];
      const spawnW = this.rint(16, 19);
      const spawnH = this.rint(10, 12);
      const spawn = this.makeRoom(
        "spawn",
        4 + this.rint(0, 5),
        Math.floor((MAP_H - spawnH) / 2) + this.rint(-5, 5),
        spawnW,
        spawnH
      );
      if (spawn.x < 3 || spawn.y < 3 || spawn.x + spawn.w > MAP_W - 4 || spawn.y + spawn.h > MAP_H - 4) return null;
      rooms.push(spawn);

      let guard = 0;
      while (rooms.length < 6 && guard++ < 800) {
        const parent = this.pick(rooms);
        const freeSides = ["E", "W", "N", "S"].filter((s) => !parent.usedSides[s]);
        if (freeSides.length === 0) continue;
        const side = this.pick(freeSides);
        const gap = this.rint(4, 7);
        const w = this.rint(16, 20);
        const h = this.rint(10, 13);
        let x;
        let y;

        if (side === "E" || side === "W") {
          x = side === "E" ? parent.x + parent.w + gap : parent.x - gap - w;
          const minY = Math.max(3, parent.y - 4);
          const maxY = Math.min(MAP_H - h - 4, parent.y + parent.h + 4 - h);
          if (minY > maxY) continue;
          y = this.rint(minY, maxY);
          if (!this.rangeOverlap(parent.y, parent.h, y, h, 4)) continue;
        } else {
          y = side === "S" ? parent.y + parent.h + gap : parent.y - gap - h;
          const minX = Math.max(3, parent.x - 4);
          const maxX = Math.min(MAP_W - w - 4, parent.x + parent.w + 4 - w);
          if (minX > maxX) continue;
          x = this.rint(minX, maxX);
          if (!this.rangeOverlap(parent.x, parent.w, x, w, 4)) continue;
        }

        if (x < 3 || y < 3 || x + w > MAP_W - 4 || y + h > MAP_H - 4) continue;

        // Keep rooms comfortably separated.
        let bad = false;
        for (const r of rooms) {
          if (rectsOverlap(x - 3, y - 3, w + 6, h + 6, r.x, r.y, r.w, r.h)) {
            bad = true;
            break;
          }
        }
        if (bad) continue;

        // Work out a shared 3-tile corridor centre that is safely inside both rooms.
        let corridor;
        let center;
        if (side === "E" || side === "W") {
          const lo = Math.max(parent.y, y) + 2;
          const hi = Math.min(parent.y + parent.h, y + h) - 3;
          if (hi < lo) continue;
          center = this.rint(lo, hi);
          const cx = side === "E" ? parent.x + parent.w : x + w;
          const len = side === "E" ? x - (parent.x + parent.w) : parent.x - (x + w);
          if (len < 2) continue;
          corridor = { x: cx, y: center - 1, w: len, h: 3 };
        } else {
          const lo = Math.max(parent.x, x) + 2;
          const hi = Math.min(parent.x + parent.w, x + w) - 3;
          if (hi < lo) continue;
          center = this.rint(lo, hi);
          const cy = side === "S" ? parent.y + parent.h : y + h;
          const len = side === "S" ? y - (parent.y + parent.h) : parent.y - (y + h);
          if (len < 2) continue;
          corridor = { x: center - 1, y: cy, w: 3, h: len };
        }

        // The corridor must not cut through any other room.
        for (const r of rooms) {
          if (r === parent) continue;
          if (rectsOverlap(corridor.x - 1, corridor.y - 1, corridor.w + 2, corridor.h + 2, r.x, r.y, r.w, r.h)) {
            bad = true;
            break;
          }
        }
        if (bad) continue;

        // Don't merge corridors.
        for (const c of connections) {
          if (
            rectsOverlap(
              corridor.x - 1,
              corridor.y - 1,
              corridor.w + 2,
              corridor.h + 2,
              c.corridor.x,
              c.corridor.y,
              c.corridor.w,
              c.corridor.h
            )
          ) {
            bad = true;
            break;
          }
        }
        if (bad) continue;

        const room = this.makeRoom("combat", x, y, w, h);
        // New room must not swallow an existing corridor.
        for (const c of connections) {
          if (rectsOverlap(room.x - 1, room.y - 1, room.w + 2, room.h + 2, c.corridor.x, c.corridor.y, c.corridor.w, c.corridor.h)) {
            bad = true;
            break;
          }
        }
        if (bad) continue;

        const conn = {
          id: connections.length,
          a: parent,
          b: room,
          side: side,
          corridor: corridor,
          center: center,
          gates: [],
        };
        rooms.push(room);
        connections.push(conn);
        parent.connections.push(conn);
        room.connections.push(conn);
        parent.usedSides[side] = true;
        room.usedSides[{ E: "W", W: "E", N: "S", S: "N" }[side]] = true;
      }

      if (rooms.length !== 6) return null;
      return { rooms: rooms, connections: connections };
    }

    rangeOverlap(a0, alen, b0, blen, min) {
      return Math.min(a0 + alen, b0 + blen) - Math.max(a0, b0) >= min;
    }

    makeRoom(type, x, y, w, h) {
      return {
        id: this._nextRoomId++,
        type: type,
        x: x,
        y: y,
        w: w,
        h: h,
        usedSides: { E: false, W: false, N: false, S: false },
        connections: [],
        gates: [],
        explored: false,
        locked: false,
        cleared: type !== "combat",
        gateT: 0,
        content: { crates: [], enemies: [], chest: null },
      };
    }

    fallbackLayout() {
      // Guaranteed-correct cross-shaped fallback. Rooms use interior coordinates.
      const rooms = [];
      const connections = [];
      const spawn = this.makeRoom("spawn", 5, 22, 18, 11);
      const hub = this.makeRoom("combat", 34, 22, 18, 11);
      const north = this.makeRoom("combat", 34, 5, 18, 11);
      const south = this.makeRoom("combat", 34, 39, 18, 11);
      const portal = this.makeRoom("portal", 63, 22, 18, 11);
      const treasure = this.makeRoom("treasure", 56, 5, 16, 10);
      rooms.push(spawn, hub, north, south, portal, treasure);

      const add = (a, b, side, xc, yc) => {
        const corridor =
          side === "E"
            ? { x: a.x + a.w, y: yc - 1, w: b.x - (a.x + a.w), h: 3 }
            : side === "S"
            ? { x: xc - 1, y: a.y + a.h, w: 3, h: b.y - (a.y + a.h) }
            : side === "N"
            ? { x: xc - 1, y: b.y + b.h, w: 3, h: a.y - (b.y + b.h) }
            : { x: b.x + b.w, y: yc - 1, w: a.x - (b.x + b.w), h: 3 };
        const conn = { id: connections.length, a: a, b: b, side: side, corridor: corridor, center: xc || yc, gates: [] };
        a.connections.push(conn);
        b.connections.push(conn);
        connections.push(conn);
      };
      add(spawn, hub, "E", 0, 27);
      add(hub, north, "N", 43, 0);
      add(hub, south, "S", 43, 0);
      add(hub, portal, "E", 0, 27);
      add(north, treasure, "E", 0, 10);
      return { rooms: rooms, connections: connections };
    }

    // ---------------------------------------------------------------------
    // Carving & walls
    // ---------------------------------------------------------------------
    setTile(tx, ty, v) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return;
      this.tiles[ty * MAP_W + tx] = v;
    }

    getTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T_VOID;
      return this.tiles[ty * MAP_W + tx];
    }

    carveFloors() {
      for (const r of this.rooms) {
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) this.setTile(x, y, T_FLOOR);
        }
      }
      for (const c of this.connections) {
        for (let y = c.corridor.y; y < c.corridor.y + c.corridor.h; y++) {
          for (let x = c.corridor.x; x < c.corridor.x + c.corridor.w; x++) this.setTile(x, y, T_FLOOR);
        }
      }
    }

    computeWalls() {
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (this.getTile(x, y) !== T_VOID) continue;
          let nearFloor = false;
          for (let dy = -1; dy <= 1 && !nearFloor; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (this.getTile(x + dx, y + dy) === T_FLOOR) {
                nearFloor = true;
                break;
              }
            }
          }
          if (nearFloor) this.setTile(x, y, T_WALL);
        }
      }
    }

    designateRooms() {
      const spawn = this.rooms[0];
      const dist = new Map();
      const queue = [spawn];
      dist.set(spawn, 0);
      while (queue.length) {
        const r = queue.shift();
        for (const c of r.connections) {
          const other = c.a === r ? c.b : c.a;
          if (!dist.has(other)) {
            dist.set(other, dist.get(r) + 1);
            queue.push(other);
          }
        }
      }

      const otherRoom = (conn, room) => (conn.a === room ? conn.b : conn.a);

      // Treasure room: a leaf branch off a room that will become combat.
      let treasure = this.rooms.find((r) => r.type === "treasure" && r !== spawn) || null;
      if (!treasure) {
        const leaves = this.rooms
          .filter((r) => r !== spawn && r.connections.length === 1)
          .sort((a, b) => b.id - a.id);
        for (const r of leaves) {
          const parent = otherRoom(r.connections[0], r);
          if (parent && parent !== spawn) {
            treasure = r;
            break;
          }
        }
        if (!treasure && leaves.length) treasure = leaves[0];
      }
      if (!treasure) {
        // Extremely defensive fallback: any room attached to a non-spawn room.
        for (const r of this.rooms) {
          if (r === spawn) continue;
          for (const c of r.connections) {
            const parent = otherRoom(c, r);
            if (parent !== spawn) {
              treasure = r;
              break;
            }
          }
          if (treasure) break;
        }
      }
      let treasureParent = null;
      if (treasure && treasure.connections.length) {
        treasureParent = otherRoom(treasure.connections[0], treasure);
      }

      // Portal: farthest room from spawn, never the treasure or its parent.
      let candidates = this.rooms.filter(
        (r) => r !== spawn && r !== treasure && r !== treasureParent
      );
      if (candidates.length === 0) candidates = this.rooms.filter((r) => r !== spawn && r !== treasure);
      if (candidates.length === 0) candidates = this.rooms.filter((r) => r !== spawn);
      let portal = spawn;
      let best = -1;
      for (const r of candidates) {
        const d = dist.get(r) || 0;
        const geo = Math.hypot(r.x + r.w / 2 - spawn.x - spawn.w / 2, r.y + r.h / 2 - spawn.y - spawn.h / 2);
        const score = d * 1000 + geo;
        if (score > best) {
          best = score;
          portal = r;
        }
      }

      for (const r of this.rooms) {
        if (r === spawn) r.type = "spawn";
        else if (r === portal) r.type = "portal";
        else if (r === treasure) r.type = "treasure";
        else r.type = "combat";
        r.cleared = r.type !== "combat";
      }
      this.portalRoom = portal;
      this.treasureRoom = treasure;

      // Player spawn at the middle of the spawn room.
      this.spawnPoint = {
        x: (spawn.x + spawn.w / 2) * TILE,
        y: (spawn.y + spawn.h / 2 + 1) * TILE,
      };
      this.portal = {
        x: (portal.x + portal.w / 2) * TILE,
        y: (portal.y + portal.h / 2) * TILE,
        room: portal,
      };
    }

    buildGates() {
      for (const c of this.connections) {
        const pair = [
          { room: c.a, other: c.b, side: c.side },
          { room: c.b, other: c.a, side: { E: "W", W: "E", N: "S", S: "N" }[c.side] },
        ];
        for (const p of pair) {
          if (p.room.type !== "combat") continue;
          let gate;
          if (p.side === "E") {
            gate = {
              x: (p.room.x + p.room.w) * TILE,
              y: (c.corridor.y) * TILE,
              w: TILE,
              h: 3 * TILE,
              vertical: true,
            };
          } else if (p.side === "W") {
            gate = {
              x: (p.room.x - 1) * TILE,
              y: (c.corridor.y) * TILE,
              w: TILE,
              h: 3 * TILE,
              vertical: true,
            };
          } else if (p.side === "S") {
            gate = {
              x: (c.corridor.x) * TILE,
              y: (p.room.y + p.room.h) * TILE,
              w: 3 * TILE,
              h: TILE,
              vertical: false,
            };
          } else {
            gate = {
              x: (c.corridor.x) * TILE,
              y: (p.room.y - 1) * TILE,
              w: 3 * TILE,
              h: TILE,
              vertical: false,
            };
          }
          gate.roomId = p.room.id;
          gate.connId = c.id;
          p.room.gates.push(gate);
          c.gates.push(gate);
          this.gates.push(gate);
        }
      }
    }

    computeContentBounds() {
      let minX = MAP_W;
      let minY = MAP_H;
      let maxX = 0;
      let maxY = 0;
      for (let y = 0; y < MAP_H; y++) {
        for (let x = 0; x < MAP_W; x++) {
          if (this.getTile(x, y) !== T_VOID) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }
      this.contentBounds = {
        minX: minX,
        minY: minY,
        maxX: maxX,
        maxY: maxY,
        px: minX * TILE,
        py: minY * TILE,
        pw: (maxX - minX + 1) * TILE,
        ph: (maxY - minY + 1) * TILE,
      };
    }

    // ---------------------------------------------------------------------
    // Room contents
    // ---------------------------------------------------------------------
    buildContents() {
      for (const room of this.rooms) {
        room.content = { crates: [], enemies: [], chest: null };
        if (room.type === "combat") {
          this.populateCombatRoom(room);
          const c = { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
          room.content.chest = { x: c.x, y: c.y, gold: false };
        } else if (room.type === "treasure") {
          const c = { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
          room.content.chest = { x: c.x, y: c.y, gold: true };
        }
      }
    }

    populateCombatRoom(room) {
      const occupied = new Set();
      const key = (x, y) => x + "," + y;
      const isFree = (x, y, avoidDoor) => {
        if (x < room.x + 2 || y < room.y + 2 || x >= room.x + room.w - 2 || y >= room.y + room.h - 2) return false;
        if (occupied.has(key(x, y))) return false;
        if (this.nearDoorway(room, x, y, avoidDoor)) return false;
        return true;
      };

      const centerX = Math.floor(room.x + room.w / 2);
      const centerY = Math.floor(room.y + room.h / 2);

      const placeEnemy = (type) => {
        let spot = null;
        for (let tries = 0; tries < 90; tries++) {
          const x = this.rint(room.x + 2, room.x + room.w - 3);
          const y = this.rint(room.y + 2, room.y + room.h - 3);
          if (Math.abs(x - centerX) <= 1 && Math.abs(y - centerY) <= 1) continue;
          if (!isFree(x, y, 2)) continue;
          let close = false;
          for (const e of room.content.enemies) {
            if (Math.abs(e.tx - x) <= 1 && Math.abs(e.ty - y) <= 1) {
              close = true;
              break;
            }
          }
          if (close) continue;
          spot = { tx: x, ty: y };
          break;
        }
        if (!spot) {
          for (let y = room.y + 2; y < room.y + room.h - 2 && !spot; y++) {
            for (let x = room.x + 2; x < room.x + room.w - 2; x++) {
              if (Math.abs(x - centerX) <= 1 && Math.abs(y - centerY) <= 1) continue;
              if (isFree(x, y, 2)) {
                spot = { tx: x, ty: y };
                break;
              }
            }
          }
        }
        if (!spot) return false;
        occupied.add(key(spot.tx, spot.ty));
        room.content.enemies.push({
          type: type,
          tx: spot.tx,
          ty: spot.ty,
          x: spot.tx * TILE + TILE / 2,
          y: (spot.ty + 1) * TILE,
        });
        return true;
      };

      // Goblins: 3-4 on the first floors, +1 per two floors (capped at +4).
      // At least one Guard and one Shaman are always present.
      const goblinRange = SK.Difficulty.goblinRange(this.depth);
      const goblinCount = this.rint(goblinRange.min, goblinRange.max);
      const types = ["guard", "shaman"];
      while (types.length < goblinCount) types.push(this.rng() < 0.58 ? "guard" : "shaman");
      for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        const tmp = types[i];
        types[i] = types[j];
        types[j] = tmp;
      }
      for (const type of types) placeEnemy(type);

      // Crystal turrets: 1-2 at the start, +1 per three floors (capped at 4).
      const turretRange = SK.Difficulty.turretRange(this.depth);
      const turretCount = this.rint(turretRange.min, turretRange.max);
      for (let i = 0; i < turretCount; i++) placeEnemy("turret");

      // Crates: 2-4, never on the reserved chest centre.
      const crateCount = this.rint(2, 4);
      for (let i = 0; i < crateCount; i++) {
        let spot = null;
        for (let tries = 0; tries < 70; tries++) {
          const x = this.rint(room.x + 1, room.x + room.w - 2);
          const y = this.rint(room.y + 1, room.y + room.h - 2);
          if (Math.abs(x - centerX) <= 1 && Math.abs(y - centerY) <= 1) continue;
          if (!isFree(x, y, 1)) continue;
          spot = { x: x, y: y };
          break;
        }
        if (!spot) continue;
        occupied.add(key(spot.x, spot.y));
        room.content.crates.push({ x: spot.x, y: spot.y });
      }
    }

    nearDoorway(room, tx, ty, dist) {
      for (const c of room.connections) {
        if (c.a !== room && c.b !== room) continue;
        const cxy = c.corridor;
        const cx0 = cxy.x;
        const cy0 = cxy.y;
        const cx1 = cxy.x + cxy.w - 1;
        const cy1 = cxy.y + cxy.h - 1;
        // Distance from candidate tile to the corridor mouth bounding box.
        const dx = Math.max(cx0 - tx, 0, tx - cx1);
        const dy = Math.max(cy0 - ty, 0, ty - cy1);
        if (Math.max(dx, dy) <= dist) return true;
      }
      return false;
    }

    markInitialExploration() {
      const spawn = this.rooms[0];
      spawn.explored = true;
    }

    // ---------------------------------------------------------------------
    // Queries & collision
    // ---------------------------------------------------------------------
    tileAt(tx, ty) {
      return this.getTile(tx, ty);
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

    rectFullyInsideRoom(x, y, w, h, room) {
      const rx = room.x * TILE;
      const ry = room.y * TILE;
      const rw = room.w * TILE;
      const rh = room.h * TILE;
      return x >= rx && y >= ry && x + w <= rx + rw && y + h <= ry + rh;
    }

    roomAtPixel(x, y) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      for (const room of this.rooms) {
        if (tx >= room.x && tx < room.x + room.w && ty >= room.y && ty < room.y + room.h) return room;
      }
      return null;
    }

    visibleRoomAt(x, y) {
      return this.roomAtPixel(x, y);
    }

    activeGates() {
      const out = [];
      for (const room of this.rooms) {
        if (!room.locked) continue;
        for (const g of room.gates) out.push(g);
      }
      return out;
    }

    // Segment intersection test for gates blocking line of sight / bullets.
    segmentHitsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
      // Liang-Barsky
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

    lineOfSight(x1, y1, x2, y2, includeGates) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return true;
      const steps = Math.ceil(dist / 5);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        if (this.isSolidPixel(x1 + dx * t, y1 + dy * t)) return false;
      }
      if (includeGates !== false) {
        for (const room of this.rooms) {
          if (!room.locked) continue;
          for (const g of room.gates) {
            if (this.segmentHitsRect(x1, y1, x2, y2, g.x + 2, g.y + 2, g.w - 4, g.h - 4)) return false;
          }
        }
      }
      return true;
    }

    getRoomCenter(room) {
      return { x: (room.x + room.w / 2) * TILE, y: (room.y + room.h / 2) * TILE };
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------
    drawFloor(ctx, camX, camY, viewW, viewH, time) {
      const startX = Math.max(0, Math.floor(camX / TILE) - 1);
      const endX = Math.min(MAP_W - 1, Math.ceil((camX + viewW) / TILE) + 1);
      const startY = Math.max(0, Math.floor(camY / TILE) - 1);
      const endY = Math.min(MAP_H - 1, Math.ceil((camY + viewH) / TILE) + 1);
      const Sprites = SK.Sprites;

      // Build the dark bedrock backdrop for void tiles first.
      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
          if (this.getTile(tx, ty) === T_VOID) {
            ctx.drawImage(Sprites.get("rock"), tx * TILE, ty * TILE);
          }
        }
      }

      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
          if (this.getTile(tx, ty) !== T_FLOOR) continue;
          const hash = hash2(tx, ty, this.seed);
          let sprite = "floor0";
          if (hash % 100 < 6) sprite = "floor1";
          else if (hash % 100 < 13) sprite = "floor2";
          ctx.drawImage(Sprites.get(sprite), tx * TILE, ty * TILE);
        }
      }

      // Spawn-room floor sigil (subtle).
      const spawn = this.rooms[0];
      if (spawn) {
        const sx = this.spawnPoint.x;
        const sy = this.spawnPoint.y;
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = "#e8b04e";
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.2);
        const r = 12 + pulse * 2;
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          const px = Math.round(sx + Math.cos(a) * r);
          const py = Math.round(sy - 5 + Math.sin(a) * r * 0.55);
          ctx.fillRect(px, py, 1, 1);
        }
        ctx.restore();
      }
    }

    drawWalls(ctx, camX, camY, viewW, viewH) {
      const startX = Math.max(0, Math.floor(camX / TILE) - 1);
      const endX = Math.min(MAP_W - 1, Math.ceil((camX + viewW) / TILE) + 1);
      const startY = Math.max(0, Math.floor(camY / TILE) - 2);
      const endY = Math.min(MAP_H - 1, Math.ceil((camY + viewH) / TILE) + 1);
      const wall = SK.Sprites.get("wall");
      for (let ty = startY; ty <= endY; ty++) {
        for (let tx = startX; tx <= endX; tx++) {
          if (this.getTile(tx, ty) !== T_WALL) continue;
          ctx.drawImage(wall, tx * TILE, ty * TILE);
        }
      }
    }

    drawGates(ctx, time) {
      for (const room of this.rooms) {
        const t = room.gateT;
        if (t <= 0.015) continue;
        const eased = easeOutCubic(Math.min(1, t));
        for (const g of room.gates) {
          this.drawGate(ctx, g, eased, time, room);
        }
      }
    }

    drawGate(ctx, g, amount, time, room) {
      const cx = g.x + g.w / 2;
      const cy = g.y + g.h / 2;
      const flicker = 0.82 + 0.18 * Math.sin(time * 23 + g.x * 0.21);
      const red = room.cleared ? "#5ce8ff" : "#ff465c";
      const hot = room.cleared ? "#d6fbff" : "#ffd0d6";

      ctx.save();
      // Dark mounting frame around the door plane.
      if (g.vertical) {
        ctx.fillStyle = "rgba(8,10,16,0.85)";
        ctx.fillRect(g.x - 2, g.y - 2, g.w + 4, 4);
        ctx.fillRect(g.x - 2, g.y + g.h - 2, g.w + 4, 4);
      } else {
        ctx.fillStyle = "rgba(8,10,16,0.85)";
        ctx.fillRect(g.x - 2, g.y - 2, 4, g.h + 4);
        ctx.fillRect(g.x + g.w - 2, g.y - 2, 4, g.h + 4);
      }

      // Field tint.
      ctx.globalAlpha = 0.28 * amount;
      ctx.fillStyle = red;
      ctx.fillRect(g.x + 2, g.y + 2, g.w - 4, g.h - 4);

      ctx.globalCompositeOperation = "lighter";
      const bars = 3;
      for (let i = 0; i < bars; i++) {
        const frac = (i + 0.5) / bars;
        ctx.globalAlpha = (0.6 + 0.4 * Math.sin(time * 11 + i * 2.1)) * amount * flicker;
        const main = room.cleared || i === 1 ? "#5ce8ff" : "#ff465c";
        const core = room.cleared || i === 1 ? "#e6feff" : "#ffd0d6";
        if (g.vertical) {
          const by = Math.round(g.y + g.h * frac + Math.sin(time * 5 + i) * 1.5);
          ctx.fillStyle = main;
          ctx.fillRect(g.x + 2, by - 1, g.w - 4, 3);
          ctx.fillStyle = core;
          ctx.fillRect(g.x + 3, by, g.w - 6, 1);
          // sparks
          if (Math.floor(time * 20 + i * 3) % 7 === 0) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(g.x + 2 + ((i * 7) % (g.w - 4)), by - 2, 1, 1);
          }
        } else {
          const bx = Math.round(g.x + g.w * frac + Math.sin(time * 5 + i) * 1.5);
          ctx.fillStyle = main;
          ctx.fillRect(bx - 1, g.y + 2, 3, g.h - 4);
          ctx.fillStyle = core;
          ctx.fillRect(bx, g.y + 3, 1, g.h - 6);
          if (Math.floor(time * 20 + i * 3) % 7 === 0) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(bx - 2, g.y + 2 + ((i * 9) % (g.h - 4)), 1, 1);
          }
        }
      }

      // Emitter caps.
      ctx.globalAlpha = amount;
      ctx.fillStyle = "#242b38";
      if (g.vertical) {
        ctx.fillRect(g.x - 1, g.y - 1, g.w + 2, 3);
        ctx.fillRect(g.x - 1, g.y + g.h - 2, g.w + 2, 3);
        ctx.fillStyle = hot;
        ctx.globalAlpha = amount * 0.8;
        ctx.fillRect(cx - 2, g.y, 4, 1);
        ctx.fillRect(cx - 2, g.y + g.h - 1, 4, 1);
      } else {
        ctx.fillRect(g.x - 1, g.y - 1, 3, g.h + 2);
        ctx.fillRect(g.x + g.w - 2, g.y - 1, 3, g.h + 2);
        ctx.fillStyle = hot;
        ctx.globalAlpha = amount * 0.8;
        ctx.fillRect(g.x, cy - 2, 1, 4);
        ctx.fillRect(g.x + g.w - 1, cy - 2, 1, 4);
      }
      ctx.restore();
    }

    drawPortal(ctx, time) {
      if (!this.portal) return;
      SK.drawPortalAt(ctx, this.portal.x, this.portal.y, time);
    }

    drawDoorThresholds(ctx, time) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#5b6a83";
      for (const c of this.connections) {
        const r = c.corridor;
        if (r.w > r.h) {
          // horizontal corridor: threshold marks at each end
          ctx.fillRect(r.x * TILE, r.y * TILE, 1, r.h * TILE);
          ctx.fillRect((r.x + r.w) * TILE - 1, r.y * TILE, 1, r.h * TILE);
        } else {
          ctx.fillRect(r.x * TILE, r.y * TILE, r.w * TILE, 1);
          ctx.fillRect(r.x * TILE, (r.y + r.h) * TILE - 1, r.w * TILE, 1);
        }
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Shared animated portal (used by dungeon exit and home entrance)
  // -------------------------------------------------------------------------
  function drawPortalAt(ctx, x, y, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.1);

    const pixelEllipse = (cy, rx, ry, color, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      for (let dy = -ry; dy <= ry; dy++) {
        const t = 1 - (dy * dy) / (ry * ry);
        if (t <= 0) continue;
        const w = Math.round(rx * Math.sqrt(t));
        ctx.fillRect(x - w, cy + dy, w * 2, 1);
      }
    };

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // Large ambient light pool.
    const glow = ctx.createRadialGradient(x, y - 6, 2, x, y - 6, 74);
    glow.addColorStop(0, "rgba(130,235,255,0.42)");
    glow.addColorStop(0.3, "rgba(55,170,255,0.2)");
    glow.addColorStop(0.62, "rgba(25,90,190,0.1)");
    glow.addColorStop(1, "rgba(10,40,90,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(x - 80, y - 80, 160, 160);

    // Light plume rising from the dais.
    ctx.globalAlpha = 0.08 + pulse * 0.05;
    ctx.fillStyle = "#5fd8ff";
    ctx.fillRect(x - 18, y - 42, 36, 42);
    ctx.globalAlpha = 0.1 + pulse * 0.06;
    ctx.fillRect(x - 10, y - 55, 20, 55);
    ctx.globalAlpha = 0.18 + pulse * 0.08;
    ctx.fillRect(x - 4, y - 34, 8, 34);

    // Ritual ring on the floor.
    for (let ring = 0; ring < 2; ring++) {
      const rad = 40 + ring * 7;
      const n = 46 + ring * 10;
      ctx.globalAlpha = 0.14 + (ring === 0 ? 0.1 : 0);
      ctx.fillStyle = ring === 0 ? "#67dfff" : "#2e6d9b";
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + time * (ring === 0 ? 0.12 : -0.08);
        if (i % 5 === 0) continue;
        ctx.fillRect(Math.round(x + Math.cos(a) * rad), Math.round(y + Math.sin(a) * rad * 0.45), 1, 1);
      }
    }

    // Pixel dais: dark stone with a cyan-lit rim.
    ctx.globalCompositeOperation = "source-over";
    pixelEllipse(y + 5, 31, 11, "#0a0e15", 0.9);
    pixelEllipse(y + 4, 29, 10, "#1a2634", 0.95);
    pixelEllipse(y + 4, 24, 8, "#0c1722", 0.95);
    pixelEllipse(y + 3, 22, 7, "#122334", 1);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = "#38688c";
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (i % 3 === 0) continue;
      ctx.fillRect(Math.round(x + Math.cos(a) * 28), Math.round(y + 4 + Math.sin(a) * 9.5), 1, 1);
    }

    // Rune ticks around the rim.
    ctx.globalCompositeOperation = "lighter";
    const runeAlpha = 0.35 + pulse * 0.35;
    ctx.globalAlpha = runeAlpha;
    ctx.fillStyle = "#9beeff";
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + time * 0.25;
      const rx = Math.round(x + Math.cos(a) * 25);
      const ry = Math.round(y + 2 + Math.sin(a) * 6);
      ctx.fillRect(rx, ry, 2, 2);
      ctx.fillStyle = "#dffcff";
      ctx.fillRect(rx + (i % 2), ry, 1, 1);
      ctx.fillStyle = "#9beeff";
    }

    // Rotating pixel rings.
    const ringCols = ["#1c4e86", "#2c8ed2", "#5fd8ff", "#c8f7ff"];
    for (let ring = 0; ring < 4; ring++) {
      const radius = 8 + ring * 4;
      const speed = (ring % 2 ? -1 : 1) * (1.15 + ring * 0.35);
      const count = 22 + ring * 11;
      ctx.globalAlpha = (0.4 + ring * 0.14) * (0.8 + pulse * 0.2);
      ctx.fillStyle = ringCols[ring];
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + time * speed;
        const wobble = 1 + Math.sin(time * 2.5 + i * 1.7) * 0.07;
        const px = Math.round(x + Math.cos(ang) * radius * wobble);
        const py = Math.round(y + Math.sin(ang) * radius * 0.52 * wobble - 2);
        const size = ring >= 2 ? 2 : 1;
        ctx.fillRect(px, py, size, size);
      }
    }

    // Three inward spiral arms.
    for (let arm = 0; arm < 3; arm++) {
      const base = time * 2.7 + (arm * Math.PI * 2) / 3;
      for (let i = 0; i < 15; i++) {
        const r = 20 - i * 1.25;
        const ang = base + i * 0.19;
        const px = Math.round(x + Math.cos(ang) * r);
        const py = Math.round(y + Math.sin(ang) * r * 0.55 - 2);
        ctx.globalAlpha = 0.18 + (i / 15) * 0.8;
        ctx.fillStyle = i < 4 ? "#f2ffff" : "#7ce8ff";
        ctx.fillRect(px, py, i < 5 ? 2 : 1, i < 5 ? 2 : 1);
      }
    }

    // Bright core.
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#efffff";
    ctx.fillRect(x - 3, y - 7, 6, 8);
    ctx.fillRect(x - 1, y - 10, 2, 14);
    ctx.globalAlpha = 0.45 + pulse * 0.25;
    ctx.fillStyle = "#8ceaff";
    ctx.fillRect(x - 6, y - 11, 12, 16);

    // Rising motes.
    for (let i = 0; i < 16; i++) {
      const a = time * 0.9 + i * 2.399;
      const rr = 10 + (i % 5) * 4;
      const rise = ((time * 16 + i * 13) % 46);
      ctx.globalAlpha = Math.max(0.1, 0.75 - rise / 60) * (0.6 + 0.4 * Math.sin(time * 4 + i));
      ctx.fillStyle = i % 4 === 0 ? "#ffffff" : i % 3 === 0 ? "#9beeff" : "#54cfff";
      ctx.fillRect(
        Math.round(x + Math.cos(a) * rr * (1 - rise / 120)),
        Math.round(y - rise + Math.sin(a * 1.3) * 3),
        i % 5 === 0 ? 2 : 1,
        i % 5 === 0 ? 2 : 1
      );
    }
    ctx.restore();
  }

  Dungeon.TILE = TILE;
  Dungeon.T_FLOOR = T_FLOOR;
  Dungeon.T_WALL = T_WALL;
  Dungeon.T_VOID = T_VOID;
  Dungeon.MAP_W = MAP_W;
  Dungeon.MAP_H = MAP_H;

  SK.Dungeon = Dungeon;
  SK.TILE = TILE;
  SK.Hash2 = hash2;
  SK.drawPortalAt = drawPortalAt;
})();
