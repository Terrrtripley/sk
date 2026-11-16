/* =========================================================================
   DUNGEON SK — entities.js
   Data-driven weapon registry with rarity tiers, two-slot player inventory,
   projectiles/beams/melee waves, goblins + crystal turrets, crates, chests,
   ground weapon loot, pickups, particles and floating damage text.
   ========================================================================= */
(function () {
  "use strict";

  const SK = (window.SK = window.SK || {});
  const TILE = SK.TILE || 16;

  // -------------------------------------------------------------------------
  // Small math / physics helpers
  // -------------------------------------------------------------------------
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y);
    if (len < 0.0001) return { x: 0, y: 0, len: 0 };
    return { x: x / len, y: y / len, len: len };
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function angleDelta(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function inSector(px, py, cx, cy, angle, range, halfAngle) {
    const dx = px - cx;
    const dy = py - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return false;
    if (dist < 1) return true;
    return Math.abs(angleDelta(Math.atan2(dy, dx), angle)) <= halfAngle;
  }

  function entityRect(e) {
    return { x: e.x - e.w / 2, y: e.y - e.h, w: e.w, h: e.h };
  }

  /**
   * Move an entity by (dx,dy) with axis-separated, sub-stepped AABB sliding.
   * blocked(x, y, w, h) must return true if the rect is not walkable.
   */
  function moveEntity(e, dx, dy, blocked) {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3));
    const sx = dx / steps;
    const sy = dy / steps;
    let hitX = false;
    let hitY = false;
    for (let i = 0; i < steps; i++) {
      if (sx) {
        const nx = e.x + sx;
        if (!blocked(nx - e.w / 2, e.y - e.h, e.w, e.h)) e.x = nx;
        else hitX = true;
      }
      if (sy) {
        const ny = e.y + sy;
        if (!blocked(e.x - e.w / 2, ny - e.h, e.w, e.h)) e.y = ny;
        else hitY = true;
      }
    }
    return { hitX: hitX, hitY: hitY };
  }

  function drawShadow(ctx, x, y, w) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#000000";
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - 2), w, 2);
    ctx.fillRect(Math.round(x - w / 2 + 2), Math.round(y - 3), w - 4, 1);
    ctx.restore();
  }

  function drawHealthBar(ctx, x, y, w, ratio) {
    const r = clamp(ratio, 0, 1);
    ctx.save();
    ctx.fillStyle = "#0a0c12";
    ctx.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, w + 2, 5);
    ctx.fillStyle = "#3a1b23";
    ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, 3);
    ctx.fillStyle = "#ff545f";
    ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w * r), 3);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    if (r > 0.05) ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.max(1, Math.round(w * r)), 1);
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Weapons (data-driven registry)
  // -------------------------------------------------------------------------
  const RARITY = {
    common: { id: "common", label: "COMMON", color: "#f8fafc", rgb: "248,250,252" },
    uncommon: { id: "uncommon", label: "UNCOMMON", color: "#4ade80", rgb: "74,222,128" },
    rare: { id: "rare", label: "RARE", color: "#38bdf8", rgb: "56,189,248" },
    epic: { id: "epic", label: "EPIC", color: "#c084fc", rgb: "192,132,252" },
    legendary: { id: "legendary", label: "LEGENDARY", color: "#fb923c", rgb: "251,146,60" },
  };

  const WEAPON_DEFS = {
    pistol: {
      id: "pistol",
      name: "BAD PISTOL",
      kind: "ranged",
      rarity: "common",
      energyCost: 0,
      cooldown: 0.26,
      damage: 3,
      sprite: "pistol",
      grip: { x: -4, y: -6 },
      muzzle: { x: 12, y: -2, time: 0.075, recoil: 2.5 },
      shot: {
        type: "pistol",
        speed: 300,
        life: 0.95,
        radius: 2.5,
        pellets: 1,
        spread: 0,
        knockback: 1,
        color: "#ffd84a",
        sfx: "shoot",
      },
    },
    sword: {
      id: "sword",
      name: "BROADSWORD",
      kind: "melee",
      rarity: "common",
      energyCost: 0,
      cooldown: 0.38,
      damage: 8,
      sprite: "sword",
      grip: { x: -5, y: -5 },
      range: 34,
      halfAngle: 1.08,
      swingDuration: 0.19,
      clearUntil: 0.17,
      sfx: "sword",
      slash: {
        outer: "rgba(120,215,255,0.38)",
        mid: "rgba(170,235,255,0.70)",
        core: "rgba(230,250,255,0.92)",
        hot: "#ffffff",
        tip: "#b8f4ff",
        r0: 23,
        r1: 32,
      },
    },
    shotgun: {
      id: "shotgun",
      name: "SAWED-OFF SHOTGUN",
      kind: "ranged",
      rarity: "uncommon",
      energyCost: 2,
      cooldown: 0.55,
      damage: 2,
      sprite: "shotgun",
      grip: { x: -5, y: -5 },
      muzzle: { x: 17, y: -2, time: 0.09, recoil: 4 },
      shot: {
        type: "pellet",
        speed: 265,
        life: 0.5,
        radius: 2.2,
        pellets: 5,
        spread: (28 * Math.PI) / 180,
        knockback: 1.5,
        color: "#ff9e4a",
        sfx: "shotgun",
      },
    },
    railgun: {
      id: "railgun",
      name: "LASER RAILGUN",
      kind: "beam",
      rarity: "rare",
      energyCost: 4,
      cooldown: 0.7,
      damage: 10,
      sprite: "railgun",
      grip: { x: -5, y: -5 },
      muzzle: { x: 20, y: -2, time: 0.12, recoil: 4.5 },
      sfx: "railgun",
      beam: { range: 260, width: 4, life: 0.18, color: "#6ff2ff", hot: "#f2ffff" },
    },
    scythe: {
      id: "scythe",
      name: "CRIMSON SCYTHE",
      kind: "melee",
      rarity: "epic",
      energyCost: 2,
      cooldown: 0.45,
      damage: 11,
      sprite: "scythe",
      grip: { x: -5, y: -11 },
      range: 42,
      halfAngle: 1.25,
      swingDuration: 0.22,
      clearUntil: 0.2,
      sfx: "scythe",
      slash: {
        outer: "rgba(190,45,70,0.40)",
        mid: "rgba(235,75,100,0.72)",
        core: "rgba(255,160,172,0.94)",
        hot: "#fff0f2",
        tip: "#ff97a8",
        r0: 31,
        r1: 41,
      },
      wave: {
        type: "wave",
        speed: 250,
        damage: 6,
        life: 0.8,
        radius: 5,
        pierce: true,
        color: "#ff4d6d",
        sfx: "wave",
      },
    },
    greatsword: {
      id: "greatsword",
      name: "EMERALD GREATSWORD",
      kind: "melee",
      rarity: "legendary",
      energyCost: 3,
      cooldown: 0.5,
      damage: 14,
      sprite: "greatsword",
      grip: { x: -6, y: -6 },
      range: 40,
      halfAngle: 1.18,
      swingDuration: 0.24,
      clearUntil: 0.22,
      sfx: "greatsword",
      slash: {
        outer: "rgba(55,170,95,0.40)",
        mid: "rgba(95,220,120,0.72)",
        core: "rgba(185,255,195,0.94)",
        hot: "#f0fff2",
        tip: "#a8ffb8",
        r0: 29,
        r1: 40,
      },
      fan: {
        type: "green",
        speed: 240,
        damage: 5,
        life: 0.85,
        radius: 3.2,
        pierce: false,
        angles: [-0.18, 0, 0.18],
        color: "#5fe07a",
        sfx: "wave",
      },
    },
    gravityGreatsword: {
      id: "gravityGreatsword",
      name: "METEORIC GRAVITY GREATSWORD",
      kind: "melee",
      rarity: "legendary",
      energyCost: 0,
      cooldown: 0.56,
      damage: 12,
      sprite: "gravityGreatsword",
      grip: { x: -6, y: -6 },
      range: 44,
      halfAngle: 1.22,
      swingDuration: 0.27,
      clearUntil: 0.25,
      sfx: "gravitySword",
      gravityAura: true,
      slash: {
        outer: "rgba(76,29,149,0.46)",
        mid: "rgba(124,58,237,0.76)",
        core: "rgba(196,181,253,0.96)",
        hot: "#f5d0fe",
        tip: "#a78bfa",
        r0: 32,
        r1: 45,
      },
      skyMeteor: {
        damage: 18,
        radius: 48,
        fallTime: 0.42,
        targetRange: 230,
        fallback: 120,
      },
    },
    kamuiGloves: {
      id: "kamuiGloves",
      name: "KAMUI GLOVES",
      kind: "summon",
      rarity: "legendary",
      energyCost: 0,
      cooldown: 2.0,
      damage: 9999,
      execute: true,
      sprite: "kamuiGloves",
      grip: { x: -4, y: -6 },
      kamuiAura: true,
      // The gloves never swing or fire a projectile. They open a full Kamui
      // vortex on a target and banish it, facing and all.
      summon: {
        range: 280,
        portalRadius: 34,
        spinTime: 0.9,
        popTime: 0.9,
        // Every third cast: a large red-tinged rift projectile that blooms
        // into a massive portal and splash-executes everything inside it.
        mega: {
          speed: 250,
          radius: 31,
          bloomRadius: 78,
          range: 180,
          splash: 76,
          damage: 9999,
          hold: 0.62,
          close: 0.3,
        },
      },
      sfx: "kamuiBanish",
      megaSfx: "kamuiMega",
    },
  };

  const WEAPON_LIST = Object.keys(WEAPON_DEFS).map((id) => WEAPON_DEFS[id]);

  // -------------------------------------------------------------------------
  // Playable hero registry
  // -------------------------------------------------------------------------
  const HERO_DEFS = {
    knight: {
      id: "knight",
      name: "KNIGHT",
      title: "THE OATHBOUND",
      sprite: "knight",
      portrait: "knight0",
      maxHp: 7,
      maxArmor: 6,
      maxEnergy: 200,
      starterWeapon: "pistol",
      unlockCost: 0,
      primary: "#e8b04e",
      secondary: "#f97316",
      glow: "#fbbf24",
      skill: {
        id: "overdrive",
        name: "BATTLE OVERDRIVE",
        desc: "+50% ATTACK SPEED FOR 5S",
        detail: "5.0S ACTIVE / 10.0S CYCLE",
        duration: 5.0,
        cooldown: 10.0,
        icon: "skillKnight",
        color: "#fbbf24",
        color2: "#f97316",
      },
    },
    gravito: {
      id: "gravito",
      name: "GRAVITO",
      title: "THE VOID ORBITER",
      sprite: "gravito",
      portrait: "gravito0",
      maxHp: 5,
      maxArmor: 5,
      maxEnergy: 240,
      starterWeapon: "gravityGreatsword",
      unlockCost: 1,
      primary: "#a855f7",
      secondary: "#6b21a8",
      glow: "#e879f9",
      skill: {
        id: "gravityWells",
        name: "GRAVITY WELLS",
        desc: "ORBS HUNT FOES - F: BLACK HOLE",
        detail: "20.0S COOLDOWN - 20 DMG",
        duration: 3.0,
        cooldown: 20.0,
        orbInterval: 2.5,
        maxOrbs: 3,
        blackHoleDuration: 3.0,
        blackHoleRadius: 22,
        pullScale: 1.5,
        icon: "skillGravito",
        color: "#c084fc",
        color2: "#7c3aed",
      },
    },
    traveler: {
      id: "traveler",
      name: "TRAVELER",
      title: "DIMENSIONAL TRAVELER",
      sprite: "traveler",
      portrait: "traveler0",
      ghost: "travelerGhost",
      spriteW: 24,
      spriteH: 28,
      maxHp: 6,
      maxArmor: 5,
      maxEnergy: 220,
      starterWeapon: "kamuiGloves",
      unlockCost: 0,
      primary: "#c4b5fd",
      secondary: "#6d28d9",
      glow: "#a78bfa",
      skill: {
        id: "kamuiRift",
        name: "KAMUI RIFT",
        short: "RIFT",
        desc: "PHASE OUT - WALK THROUGH WALLS",
        detail: "F: TOGGLE RIFT DIMENSION",
        cooldown: 6.0,
        icon: "skillRift",
        color: "#c4b5fd",
        color2: "#7c3aed",
        key: "F",
      },
      skill2: {
        id: "intangibility",
        name: "INTANGIBILITY",
        short: "PHASE",
        desc: "UNHITTABLE - SHIFT AGAIN: CANCEL",
        detail: "4.0S ACTIVE / 9.0S CYCLE",
        duration: 4.0,
        cooldown: 9.0,
        icon: "skillPhase",
        color: "#a78bfa",
        color2: "#4c1d95",
        key: "SHIFT",
      },
    },
  };

  const HERO_LIST = Object.keys(HERO_DEFS).map((id) => HERO_DEFS[id]);

  const DROP_TABLES = {
    // Room-clear chests lean toward the low rarities, with no epic/legendary.
    combat: [
      ["common", 52],
      ["uncommon", 30],
      ["rare", 18],
    ],
    // Gold treasure chests guarantee Uncommon through Legendary.
    gold: [
      ["uncommon", 38],
      ["rare", 34],
      ["epic", 20],
      ["legendary", 8],
    ],
  };

  function rollRarity(table) {
    const entries = DROP_TABLES[table] || DROP_TABLES.combat;
    let total = 0;
    for (const entry of entries) total += entry[1];
    let r = Math.random() * total;
    for (const entry of entries) {
      if (r < entry[1]) return entry[0];
      r -= entry[1];
    }
    return entries[entries.length - 1][0];
  }

  function weaponsOfRarity(rarity) {
    return WEAPON_LIST.filter((w) => w.rarity === rarity);
  }

  function randomWeapon(table) {
    const rarity = rollRarity(table);
    const pool = weaponsOfRarity(rarity);
    return pool[Math.floor(Math.random() * pool.length)] || WEAPON_DEFS.pistol;
  }

  // -------------------------------------------------------------------------
  // Player
  // -------------------------------------------------------------------------
  class Player {
    constructor(x, y, heroId) {
      this.x = x;
      this.y = y;
      this.w = 10;
      this.h = 8;
      this.speed = 98;
      this.aim = { x: 1, y: 0 };
      this.aimAngle = 0;
      this.aimTarget = null;
      this.facing = 1;
      this.lastMove = { x: 1, y: 0 };
      this.moveInput = { x: 0, y: 0 };
      this.moving = false;
      this.walkTime = 0;
      this.sinceDamage = 999;
      this.armorTick = 0;
      this.iframes = 0;
      this.hurtFlash = 0;
      this.swing = null;
      this.muzzle = 0;
      this.recoil = 0;
      this.swapFlash = 0;
      this.noEnergyCd = 0;
      this.alive = true;
      this.deathTimer = 0;
      this.kx = 0;
      this.ky = 0;
      this.aimCheck = 0;
      this.bob = 0;
      this.skillActive = 0;
      this.skillCooldown = 0;
      this.skillFxT = 0;
      // Dimensional Traveler state (harmless on other heroes).
      this.rift = "normal"; // normal | entering | rift | exiting
      this.riftT = 0;
      this.riftDur = 0.8;
      this.riftCooldown = 0;
      this.riftTime = 0;
      this.phaseActive = 0;
      this.phaseCooldown = 0;
      this.phaseFx = 0;
      this.noAttackNoticeT = 0;
      this.phaseBlockT = 0;
      // Kamui Gloves: every third successful cast is a mega portal.
      this.kamuiCasts = 0;
      this.wells = null;
      this.afterimages = [];
      this.afterimageT = 0;
      this.gravityCharge = 0;
      this.gravityChargeHold = 0;
      this.gravityMotesT = 0;
      this.hero = HERO_DEFS.knight;
      this.heroId = "knight";
      this.setHero(heroId || "knight", true);
    }

    /** Load stats, sprite set, starter weapon and skill from the hero registry. */
    setHero(heroId, reset) {
      const hero = HERO_DEFS[heroId] || HERO_DEFS.knight;
      this.hero = hero;
      this.heroId = hero.id;
      this.maxHp = hero.maxHp;
      this.maxArmor = hero.maxArmor;
      this.maxEnergy = hero.maxEnergy;
      if (reset) {
        this.hp = hero.maxHp;
        this.armor = hero.maxArmor;
        this.energy = hero.maxEnergy;
      } else {
        this.hp = Math.min(this.hp, hero.maxHp);
        this.armor = Math.min(this.armor, hero.maxArmor);
        this.energy = Math.min(this.energy, hero.maxEnergy);
      }
      this.weapons = [WEAPON_DEFS[hero.starterWeapon] || WEAPON_DEFS.pistol, null];
      this.weapon = 0;
      this.cooldowns = [0, 0];
      this.skillActive = 0;
      this.skillCooldown = 0;
      this.skillFxT = 0;
      this.rift = "normal";
      this.riftT = 0;
      this.riftCooldown = 0;
      this.riftTime = 0;
      this.phaseActive = 0;
      this.phaseCooldown = 0;
      this.phaseFx = 0;
      this.noAttackNoticeT = 0;
      this.phaseBlockT = 0;
      this.kamuiCasts = 0;
      this.wells = hero.id === "gravito" ? new GravityWells(this) : null;
      this.afterimages = [];
      this.afterimageT = 0;
      this.gravityCharge = 0;
      this.gravityChargeHold = 0;
      this.swing = null;
      this.muzzle = 0;
      this.recoil = 0;
      this.noEnergyCd = 0;
      this.target = null;
      this.aimTarget = null;
    }

    /** Swap the live character while keeping position/facing (home hub). */
    switchHero(heroId, game) {
      const oldX = this.x;
      const oldY = this.y;
      const oldFacing = this.facing;
      const oldWalk = this.walkTime;
      this.setHero(heroId, true);
      this.x = oldX;
      this.y = oldY;
      this.facing = oldFacing;
      this.walkTime = oldWalk;
      this.alive = true;
      this.deathTimer = 0;
      this.iframes = 0;
      this.hurtFlash = 0;
      this.kx = 0;
      this.ky = 0;
      if (game) {
        game.spawnParticles(this.x, this.y - 14, 22, {
          color: this.hero.glow,
          speed: 110,
          life: 0.5,
          size: 1,
          spread: 2.8,
          glow: true,
          drag: 2.4,
        });
        game.spawnParticles(this.x, this.y - 14, 10, {
          color: "#ffffff",
          speed: 70,
          life: 0.35,
          size: 1,
          spread: 2.8,
          glow: true,
        });
      }
    }

    isOverdrive() {
      return this.heroId === "knight" && this.skillActive > 0;
    }

    isInRift() {
      return this.heroId === "traveler" && this.rift === "rift";
    }

    /** True while the rift spin, the rift itself, or the return spin is active. */
    isRifting() {
      return this.heroId === "traveler" && this.rift !== "normal";
    }

    isPhasing() {
      return this.heroId === "traveler" && this.phaseActive > 0;
    }

    /** Enemies cannot see or hit a rift-walker at all. */
    isUntargetable() {
      return this.isRifting();
    }

    /** Damage is ignored in both alternate states. */
    isInvulnerable() {
      return this.isRifting() || this.isPhasing();
    }

    canAttack() {
      return !this.isRifting() && !this.isPhasing();
    }

    skillReady(slot) {
      if (this.heroId === "gravito") {
        return !!(this.wells && this.wells.cooldown <= 0 && !this.wells.forming && !this.wells.blackHole);
      }
      if (this.heroId === "traveler") {
        if (slot === 1) return this.rift === "normal" && this.phaseCooldown <= 0;
        return this.rift === "normal" && this.riftCooldown <= 0;
      }
      if (slot === 1) return false;
      return this.skillCooldown <= 0;
    }

    /** Trigger an active skill. slot 0 = F, slot 1 = Shift. */
    activateSkill(game, slot) {
      if (!this.alive) return false;
      slot = slot === 1 ? 1 : 0;
      const skill = slot === 1 ? this.hero.skill2 : this.hero.skill;
      if (!skill) {
        if (slot === 1) return this.activateSkill(game, 0);
        return false;
      }

      if (skill.id === "gravityWells") {
        if (!this.wells) this.wells = new GravityWells(this);
        return this.wells.tryActivate(game);
      }
      if (skill.id === "kamuiRift") return this.toggleRift(game);
      if (skill.id === "intangibility") return this.activatePhase(game);

      if (this.skillCooldown > 0) return false;
      this.skillActive = skill.duration;
      this.skillCooldown = skill.cooldown;
      this.skillFxT = 0;
      if (skill.id === "overdrive") {
        game.sfx("overdrive");
        game.shake(2.6, 0.22);
        game.effects.push(
          new RingPulse(this.x, this.y - 12, {
            life: 0.55,
            r0: 8,
            r1: 42,
            yScale: 0.68,
            colors: ["#fbbf24", "#f97316", "#fff7d6"],
            thickness: 2,
          })
        );
        game.spawnParticles(this.x, this.y - 14, 26, {
          color: "#fbbf24",
          speed: 130,
          life: 0.55,
          size: 1,
          spread: 2.8,
          glow: true,
          drag: 2.2,
        });
        game.spawnParticles(this.x, this.y - 14, 12, {
          color: "#f97316",
          speed: 90,
          life: 0.45,
          size: 2,
          spread: 2.8,
          glow: true,
          drag: 2.4,
        });
        game.addFloatText(this.x, this.y - 46, "OVERDRIVE!", "#fbbf24", { scale: 1, rise: 18, life: 1.0 });
        return true;
      }
      return false;
    }

    // ---------------------------------------------------------------------
    // Dimensional Traveler abilities
    // ---------------------------------------------------------------------
    /** Spawn the large dense Kamui portal at the traveler's feet. */
    spawnRiftPortal(game, radius, hold, close, seed) {
      if (!SK.KamuiVortex) return;
      game.effects.push(
        new SK.KamuiVortex(this.x, this.centerY(), {
          radius: radius,
          open: 0.18,
          hold: hold,
          close: close,
          squash: 0.94,
          alpha: 0.96,
          seed: seed == null ? Math.random() * 100 : seed,
          layer: "ground",
        })
      );
    }

    /** F: toggle the alternate dimension. */
    toggleRift(game) {
      if (this.heroId !== "traveler") return false;
      if (this.rift === "entering" || this.rift === "exiting") return false;

      if (this.rift === "rift") {
        this.rift = "exiting";
        this.riftT = 0;
        this.riftDur = 0.8;
        this.spawnRiftPortal(game, 42, 0.6, 0.26);
        game.sfx("kamuiExit");
        game.shake(2.4, 0.24);
        game.spawnParticles(this.x, this.y - 14, 14, {
          color: "#c4b5fd",
          speed: 95,
          life: 0.42,
          size: 1,
          spread: 2.8,
          glow: true,
          drag: 2.4,
        });
        return true;
      }

      if (this.riftCooldown > 0) {
        game.sfx("deny");
        game.addFloatText(this.x, this.y - 42, "RIFT COOLDOWN", "#c4b5fd", {
          scale: 1,
          rise: 16,
          life: 0.8,
        });
        return false;
      }

      this.rift = "entering";
      this.riftT = 0;
      this.riftDur = 0.8;
      this.riftTime = 0;
      this.spawnRiftPortal(game, 54, 0.86, 0.26);
      game.sfx("kamuiOpen");
      game.shake(3.4, 0.34);
      game.spawnParticles(this.x, this.y - 16, 26, {
        color: "#c4b5fd",
        speed: 125,
        life: 0.55,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.2,
      });
      game.spawnParticles(this.x, this.y - 16, 12, {
        color: "#050508",
        speed: 75,
        life: 0.45,
        size: 2,
        spread: 2.8,
        drag: 2.4,
      });
      game.addFloatText(this.x, this.y - 50, "KAMUI RIFT", "#c4b5fd", {
        scale: 1,
        rise: 18,
        life: 1.0,
      });
      return true;
    }

    /** Shift: become unhittable for a short window (enemies still see you). */
    activatePhase(game) {
      if (this.heroId !== "traveler") return false;
      const skill = this.hero.skill2;
      if (!skill) return false;
      // Pressing Shift again ends the phase early: the traveler turns solid
      // immediately (and can attack) but the activation cooldown keeps running.
      if (this.phaseActive > 0) return this.cancelPhase(game);
      if (this.rift !== "normal") {
        game.sfx("deny");
        game.addFloatText(this.x, this.y - 42, "EXIT RIFT FIRST", "#c4b5fd", {
          scale: 1,
          rise: 16,
          life: 0.8,
        });
        return false;
      }
      if (this.phaseCooldown > 0) {
        game.sfx("deny");
        game.addFloatText(this.x, this.y - 42, "PHASE COOLDOWN", "#c4b5fd", {
          scale: 1,
          rise: 16,
          life: 0.8,
        });
        return false;
      }
      this.phaseActive = skill.duration || 4.0;
      this.phaseCooldown = skill.cooldown || 9.0;
      this.phaseFx = 1;
      game.sfx("phase");
      game.shake(1.5, 0.18);
      const eyeX = this.x + this.facing * Math.round(this.artW() * 0.17);
      const eyeBob = this.moving ? 0 : Math.round(this.bob);
      const eyeY = this.y + eyeBob - this.artH() + Math.round(this.artH() * 0.335);
      game.effects.push(
        new RingPulse(eyeX, eyeY, {
          life: 0.38,
          r0: 2,
          r1: 12,
          yScale: 0.8,
          colors: ["#a78bfa", "#050308", "#c4b5fd"],
          thickness: 1,
          layer: "over",
        })
      );
      game.spawnParticles(this.x, this.centerY(), 14, {
        color: "#8b5cf6",
        speed: 70,
        life: 0.42,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.8,
      });
      game.addFloatText(this.x, this.y - 44, "INTANGIBLE!", "#a78bfa", {
        scale: 1,
        rise: 18,
        life: 1.0,
      });
      return true;
    }

    /** End an active Intangibility early (Shift pressed again). */
    cancelPhase(game) {
      if (this.phaseActive <= 0) return false;
      this.phaseActive = 0;
      this.phaseBlockT = 0;
      this.phaseFx = Math.min(1, this.phaseFx);
      game.sfx("phaseOff");
      game.shake(1.1, 0.12);
      const eyeX = this.x + this.facing * Math.round(this.artW() * 0.17);
      const eyeBob = this.moving ? 0 : Math.round(this.bob);
      const eyeY = this.y + eyeBob - this.artH() + Math.round(this.artH() * 0.335);
      game.effects.push(
        new RingPulse(eyeX, eyeY, {
          life: 0.34,
          r0: 13,
          r1: 2,
          yScale: 0.8,
          colors: ["#c4b5fd", "#050308"],
          thickness: 1,
          layer: "over",
        })
      );
      game.spawnParticles(this.x, this.centerY(), 10, {
        color: "#a78bfa",
        speed: 60,
        life: 0.32,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 3.2,
      });
      game.addFloatText(this.x, this.y - 44, "SOLID!", "#c4b5fd", {
        scale: 1,
        rise: 16,
        life: 0.8,
      });
      return true;
    }

    updateRift(dt, game) {
      this.riftCooldown = Math.max(0, this.riftCooldown - dt);
      if (this.rift === "entering") {
        this.riftT += dt;
        if (this.riftT >= this.riftDur) {
          this.rift = "rift";
          this.riftT = 0;
          this.riftTime = 0;
          game.shake(2.2, 0.24);
          game.addFloatText(this.x, this.y - 46, "OTHER DIMENSION", "#c4b5fd", {
            scale: 1,
            rise: 14,
            life: 1.1,
          });
        }
      } else if (this.rift === "rift") {
        this.riftTime += dt;
      } else if (this.rift === "exiting") {
        this.riftT += dt;
        if (this.riftT >= this.riftDur) {
          this.rift = "normal";
          this.riftT = 0;
          this.riftCooldown = (this.hero.skill && this.hero.skill.cooldown) || 6.0;
          const spot = game.findFreeSpot ? game.findFreeSpot(this.x, this.y, 96) : { x: this.x, y: this.y };
          this.placeAt(spot.x, spot.y);
          game.sfx("kamuiReturn");
          game.shake(2.2, 0.2);
          game.addFloatText(this.x, this.y - 44, "RETURNED", "#c4b5fd", {
            scale: 1,
            rise: 16,
            life: 0.9,
          });
        }
      }
    }

    updatePhase(dt) {
      this.phaseCooldown = Math.max(0, this.phaseCooldown - dt);
      if (this.phaseActive > 0) {
        this.phaseActive = Math.max(0, this.phaseActive - dt);
        this.phaseFx = 1;
      } else {
        this.phaseFx = Math.max(0, this.phaseFx - dt * 4.2);
      }
    }

    /** 0..1 light-purple screen wash strength for the rift dimension. */
    riftOverlayAlpha() {
      if (this.heroId !== "traveler") return 0;
      if (this.rift === "rift") return 1;
      if (this.rift === "entering") return clamp(this.riftT / this.riftDur, 0, 1);
      if (this.rift === "exiting") return 1 - clamp(this.riftT / this.riftDur, 0, 1);
      return 0;
    }

    resetRiftState() {
      this.rift = "normal";
      this.riftT = 0;
      this.riftCooldown = 0;
      this.riftTime = 0;
      this.phaseActive = 0;
      this.phaseCooldown = 0;
      this.phaseFx = 0;
      this.noAttackNoticeT = 0;
      this.phaseBlockT = 0;
      this.afterimages = [];
    }

    updateSkill(dt, game) {
      if (this.heroId === "traveler") {
        this.updateRift(dt, game);
        this.updatePhase(dt);
      } else if (this.heroId === "gravito") {
        // Persistent passive orb generation + black-hole lifecycle.
        if (this.wells) this.wells.update(dt, game);
      } else {
        if (this.skillCooldown > 0) {
          this.skillCooldown = Math.max(0, this.skillCooldown - dt);
        }
        if (this.skillActive > 0) {
          this.skillActive = Math.max(0, this.skillActive - dt);
          this.skillFxT += dt;
        }
      }
      if (this.gravityChargeHold > 0) {
        this.gravityChargeHold = Math.max(0, this.gravityChargeHold - dt);
        if (this.gravityChargeHold <= 0 && this.gravityCharge >= 5) this.gravityCharge = 0;
      }
    }

    updateAfterimages(dt, game) {
      for (const a of this.afterimages) {
        a.life -= dt;
      }
      this.afterimages = this.afterimages.filter((a) => a.life > 0);
      const riftTrail = this.isInRift();
      const overdrive = this.isOverdrive();
      if ((!overdrive && !riftTrail) || !this.moving) {
        this.afterimageT = 0;
        return;
      }
      this.afterimageT -= dt;
      if (this.afterimageT <= 0) {
        this.afterimageT = riftTrail ? 0.07 : 0.06;
        this.afterimages.push({
          x: this.x,
          y: this.y,
          bob: this.bob,
          facing: this.facing,
          life: riftTrail ? 0.32 : 0.26,
          maxLife: riftTrail ? 0.32 : 0.26,
          ghost: riftTrail ? this.hero.ghost || "travelerGhost" : "knightGhost",
          artW: this.artW(),
          artH: this.artH(),
          alpha: riftTrail ? 0.3 : 0.34,
        });
        if (this.afterimages.length > 12) this.afterimages.shift();
      }
    }

    getRect() {
      return entityRect(this);
    }

    centerX() {
      return this.x;
    }

    artW() {
      return (this.hero && this.hero.spriteW) || 20;
    }

    artH() {
      return (this.hero && this.hero.spriteH) || 22;
    }

    centerY() {
      return this.y - this.artH() / 2;
    }

    placeAt(x, y) {
      this.x = x;
      this.y = y;
      this.iframes = 0.8;
      this.swing = null;
      this.muzzle = 0;
      this.kx = 0;
      this.ky = 0;
    }

    currentWeapon() {
      return this.weapons[this.weapon] || null;
    }

    /** Add a weapon to an empty slot, or swap it into the active slot. */
    pickupWeapon(ground, game) {
      if (!ground || ground.dead || !ground.weapon) return false;
      const def = ground.weapon;
      let empty = this.weapons.indexOf(null);
      let swappedOld = null;
      if (empty >= 0) {
        this.weapons[empty] = def;
        this.weapon = empty;
        this.cooldowns[empty] = 0;
      } else {
        swappedOld = this.weapons[this.weapon];
        this.weapons[this.weapon] = def;
        this.cooldowns[this.weapon] = 0.12;
        if (swappedOld && game) {
          let dropX = this.x + this.facing * 8;
          let dropY = this.y;
          if (game.dungeon.isSolidPixel(dropX, dropY - 3)) {
            dropX = this.x;
            dropY = this.y;
          }
          game.dropWeapon(swappedOld, dropX, dropY, { toss: false });
        }
      }
      ground.dead = true;
      this.swing = null;
      this.noEnergyCd = 0;
      this.swapFlash = 0.26;
      if (game) {
        const rarity = RARITY[def.rarity] || RARITY.common;
        game.addFloatText(this.x, this.y - 48, def.name, rarity.color, { scale: 1, rise: 18, life: 1.0 });
        game.sfx("equip");
        game.spawnParticles(this.x, this.y - 12, 10, {
          color: rarity.color,
          speed: 75,
          life: 0.35,
          size: 1,
          spread: 2.4,
          glow: true,
          drag: 3,
        });
      }
      return true;
    }

    swapWeapon(game) {
      const other = this.weapon === 0 ? 1 : 0;
      if (!this.weapons[other]) return;
      this.weapon = other;
      this.swing = null;
      this.swapFlash = 0.22;
      if (game) game.sfx("swap");
    }

    update(dt, game, opts) {
      const home = !!(opts && opts.home);
      if (!this.alive) {
        this.deathTimer += dt;
        return;
      }

      this.iframes = Math.max(0, this.iframes - dt);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      this.muzzle = Math.max(0, this.muzzle - dt);
      this.recoil = Math.max(0, this.recoil - dt * 30);
      this.swapFlash = Math.max(0, this.swapFlash - dt);
      this.noEnergyCd = Math.max(0, this.noEnergyCd - dt);
      this.noAttackNoticeT = Math.max(0, this.noAttackNoticeT - dt);
      this.phaseBlockT = Math.max(0, this.phaseBlockT - dt);
      this.cooldowns[0] = Math.max(0, this.cooldowns[0] - dt);
      this.cooldowns[1] = Math.max(0, this.cooldowns[1] - dt);
      if (!home) this.updateSkill(dt, game);

      // Armor: after 3.5s without damage, regain 1 every 0.8s.
      this.sinceDamage += dt;
      if (this.sinceDamage >= 3.5 && this.armor < this.maxArmor) {
        this.armorTick += dt;
        while (this.armorTick >= 0.8 && this.armor < this.maxArmor) {
          this.armor++;
          this.armorTick -= 0.8;
        }
      } else {
        this.armorTick = 0;
      }

      // Movement input (normalized diagonals). The spin into/out of the rift
      // is a committed animation: movement and attacks are locked for it.
      const spinLock = this.rift === "entering" || this.rift === "exiting";
      const input = game.input;
      let ix = 0;
      let iy = 0;
      if (!spinLock) {
        if (input.key("left")) ix -= 1;
        if (input.key("right")) ix += 1;
        if (input.key("up")) iy -= 1;
        if (input.key("down")) iy += 1;
      }
      const norm = normalize(ix, iy);
      this.moveInput.x = norm.x;
      this.moveInput.y = norm.y;
      this.moving = norm.len > 0;
      if (this.moving) {
        this.lastMove.x = norm.x;
        this.lastMove.y = norm.y;
        this.walkTime += dt;
      } else {
        this.walkTime = 0;
      }

      // Aim: nearest visible enemy in range, else last movement direction.
      if (home) {
        this.aimTarget = null;
        this.aim.x = this.lastMove.x;
        this.aim.y = this.lastMove.y;
      } else if (!spinLock) {
        this.aimCheck -= dt;
        if (this.aimCheck <= 0) {
          this.aimCheck = 0.1;
          let keep = false;
          if (this.aimTarget && this.aimTarget.alive && !this.aimTarget.banishing) {
            const td = Math.hypot(this.aimTarget.x - this.x, this.aimTarget.y - 10 - this.centerY());
            if (td <= 172 && game.targetVisible(this.x, this.centerY(), this.aimTarget)) {
              keep = true;
            }
          }
          if (!keep) this.aimTarget = game.findAimTarget(this.x, this.centerY(), 160, this);
        }
        if (this.aimTarget && this.aimTarget.alive) {
          const t = this.aimTarget;
          const dist = Math.hypot(t.x - this.x, t.y - 10 - this.centerY());
          const lead = Math.min(0.16, (dist / 300) * 0.7);
          const tx = t.x + clamp(t.vx || 0, -70, 70) * lead;
          const ty = t.y - 10 + clamp(t.vy || 0, -70, 70) * lead;
          const d = normalize(tx - this.x, ty - this.centerY());
          if (d.len > 0) {
            this.aim.x = d.x;
            this.aim.y = d.y;
          }
        } else {
          this.aimTarget = null;
          this.aim.x = this.lastMove.x;
          this.aim.y = this.lastMove.y;
        }
      }
      this.aimAngle = Math.atan2(this.aim.y, this.aim.x);
      if (Math.abs(this.aim.x) > 0.15) this.facing = this.aim.x < 0 ? -1 : 1;

      // The rift dimension ignores walls, crates and gates; normal movement
      // keeps the usual sliding AABB collision. Enemy/black-hole movement still
      // uses game.isBlocked, so only the traveler is ever out of phase.
      const riftBlock = this.isInRift();
      const blocked = riftBlock ? () => false : (x, y, w, h) => game.isBlocked(x, y, w, h);

      // Knockback/momentum.
      if (Math.abs(this.kx) > 1 || Math.abs(this.ky) > 1) {
        moveEntity(this, this.kx * dt, this.ky * dt, blocked);
        this.kx *= Math.pow(0.0005, dt);
        this.ky *= Math.pow(0.0005, dt);
      }

      // Sliding AABB movement.
      if (this.moving) {
        moveEntity(this, this.moveInput.x * this.speed * dt, this.moveInput.y * this.speed * dt, blocked);
      }

      this.bob = this.moving ? 0 : Math.sin(game.time * 4.4) * 0.8;

      // Active skill visuals (golden afterimages while overdrive is running,
      // violet afterimages while rift-walking).
      if (!home) this.updateAfterimages(dt, game);

      // Attack. Both alternate states make the traveler unable to attack.
      if (!home && game.input.attack && (game.fireSuppressT || 0) <= 0) {
        if (this.canAttack()) {
          this.tryAttack(game);
        } else if (this.noAttackNoticeT <= 0) {
          this.noAttackNoticeT = 1.2;
          const label = this.isRifting() ? "NO ATTACK IN RIFT" : "NO ATTACK WHILE PHASED";
          game.addFloatText(this.x, this.y - 42, label, "#c4b5fd", {
            scale: 1,
            rise: 14,
            life: 0.8,
          });
          game.sfx("deny");
        }
      }

      // Gravitational blade motes in world space, in addition to the in-hand aura.
      const held = this.currentWeapon();
      if (held && held.gravityAura && !home) {
        this.gravityMotesT -= dt;
        if (this.gravityMotesT <= 0) {
          this.gravityMotesT = 0.11;
          const a = this.aimAngle;
          const len = 12 + Math.random() * 20;
          const mx = this.x + Math.cos(a) * len + Math.cos(a + Math.PI / 2) * (Math.random() * 8 - 4);
          const my = this.centerY() + Math.sin(a) * len + Math.sin(a + Math.PI / 2) * (Math.random() * 8 - 4);
          game.spawnParticles(mx, my, 1, {
            color: Math.random() < 0.5 ? "#a855f7" : "#6b21a8",
            speed: 14,
            life: 0.38,
            size: 1,
            spread: 2.4,
            glow: true,
            drag: 2,
          });
        }
      }

      if (this.swing) {
        const prev = this.swing.t;
        this.swing.t += dt;
        if (prev < 0.045 && this.swing.t >= 0.045) this.applyMeleeDamage(game);
        if (this.swing.t <= (this.swing.clearUntil || 0.17)) this.clearEnemyBullets(game);
        if (this.swing.t >= this.swing.duration) this.swing = null;
      }
    }

    tryAttack(game) {
      if (this.swing) return;
      if (!this.canAttack()) return;
      const weapon = this.currentWeapon();
      if (!weapon) return;
      if (this.cooldowns[this.weapon] > 0) return;
      if (this.noEnergyCd > 0) return;
      if (this.energy < weapon.energyCost) {
        this.dryFire(game, weapon);
        return;
      }
      this.energy = Math.max(0, this.energy - weapon.energyCost);
      if (weapon.energyCost > 0) game.onEnergySpent(weapon.energyCost);
      const speedMul = this.isOverdrive() ? 1.5 : 1;
      this.cooldowns[this.weapon] = weapon.cooldown / speedMul;
      if (weapon.kind === "ranged") {
        this.fireRanged(game, weapon);
      } else if (weapon.kind === "beam") {
        this.fireBeam(game, weapon);
      } else if (weapon.kind === "summon") {
        this.castKamuiGloves(game, weapon);
      } else {
        this.swing = {
          t: 0,
          duration: weapon.swingDuration || 0.19,
          clearUntil: weapon.clearUntil || 0.17,
          angle: this.aimAngle,
          hit: false,
          weapon: weapon,
        };
        if (weapon.skyMeteor) {
          // Every fifth swing calls down the Sky Meteor.
          this.gravityCharge = (this.gravityCharge % 5) + 1;
          if (this.gravityCharge >= 5) {
            this.gravityChargeHold = 0.5;
            game.summonSkyMeteor(this, weapon.skyMeteor);
          }
        }
        game.sfx(weapon.sfx || "sword");
      }
    }

    /**
     * Kamui Gloves: open a portal on a visible enemy and banish it. The enemy
     * spins on its sagittal axis and shrinks, then pops instead of arriving in
     * another dimension. Infinite damage: the target is executed at the end.
     */
    castKamuiGloves(game, weapon) {
      const summon = weapon.summon || {};
      const range = summon.range || 280;
      this.cooldowns[this.weapon] = weapon.cooldown || 2.0;

      // Every third successful cast fires the massive portal instead of the
      // single-target banish. It is a projectile, so it can be aimed at a
      // group (or at empty space if the player mistimes it).
      if (this.kamuiCasts % 3 === 2) {
        const mega = summon.mega || {};
        this.kamuiCasts = 0;
        const mx = this.x + Math.cos(this.aimAngle) * 11;
        const my = this.centerY() + Math.sin(this.aimAngle) * 7;
        if (SK.KamuiMegaPortal) {
          game.effects.push(
            new SK.KamuiMegaPortal(mx, my, this.aimAngle, {
              speed: mega.speed,
              radius: mega.radius,
              bloomRadius: mega.bloomRadius,
              range: mega.range,
              splash: mega.splash,
              damage: mega.damage,
              hold: mega.hold,
              close: mega.close,
              seed: Math.random() * 100,
            })
          );
        }
        game.sfx(weapon.megaSfx || "kamuiMega");
        game.shake(3.6, 0.3);
        game.spawnParticles(mx, my, 18, {
          color: "#ff2d3f",
          speed: 120,
          life: 0.45,
          size: 1,
          spread: 2.8,
          glow: true,
          drag: 2.4,
        });
        game.spawnParticles(mx, my, 8, {
          color: "#050508",
          speed: 80,
          life: 0.35,
          size: 2,
          spread: 2.8,
          drag: 2.8,
        });
        game.addFloatText(this.x, this.y - 64, "MEGA KAMUI!", "#ff4658", {
          scale: 1,
          rise: 20,
          life: 1.1,
        });
        return true;
      }

      let target = null;
      if (this.aimTarget && this.aimTarget.alive && !this.aimTarget.banishing) {
        const d = Math.hypot(this.aimTarget.x - this.x, this.aimTarget.y - 10 - this.centerY());
        if (d <= range && game.targetVisible(this.x, this.centerY(), this.aimTarget)) target = this.aimTarget;
      }
      if (!target) target = game.findAimTarget(this.x, this.centerY(), range, this);
      if (!target) {
        this.cooldowns[this.weapon] = 0.45;
        game.sfx("deny");
        game.addFloatText(this.x, this.y - 42, "NO TARGET", "#c4b5fd", {
          scale: 1,
          rise: 14,
          life: 0.7,
        });
        return false;
      }
      const dur = summon.spinTime || 0.9;
      const radius = summon.portalRadius || 30;
      if (SK.KamuiVortex) {
        game.effects.push(
          new SK.KamuiVortex(target.x, target.y - 10, {
            radius: radius,
            open: 0.16,
            hold: Math.max(0.4, dur - 0.06),
            close: 0.24,
            squash: 0.9,
            alpha: 0.98,
            seed: Math.random() * 100,
            layer: "ground",
          })
        );
      }
      target.beginBanish(game, { duration: dur, weapon: weapon });
      game.sfx("kamuiBanish");
      game.shake(1.8, 0.18);
      game.spawnParticles(target.x, target.y - 10, 10, {
        color: "#c4b5fd",
        speed: 85,
        life: 0.4,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.6,
      });
      // Two normal casts arm the next one.
      this.kamuiCasts = (this.kamuiCasts + 1) % 3;
      if (this.kamuiCasts === 2) {
        game.addFloatText(this.x, this.y - 50, "MEGA READY", "#ff4658", {
          scale: 1,
          rise: 16,
          life: 0.9,
        });
      }
      return true;
    }

    dryFire(game, weapon) {
      this.noEnergyCd = 0.4;
      game.sfx("dry");
      game.shake(0.9, 0.1);
      game.flashEnergy(0.4);
      game.addFloatText(this.x, this.y - 34, "NO ENERGY!", "#ff6b6b", { scale: 1, rise: 16, life: 0.75 });
      game.spawnParticles(this.x + this.facing * 6, this.centerY() - 2, 5, {
        color: "#ffcf5a",
        speed: 45,
        life: 0.22,
        size: 1,
        spread: 1.4,
        glow: true,
        drag: 4,
      });
    }

    fireRanged(game, weapon) {
      const shot = weapon.shot;
      const pellets = shot.pellets || 1;
      const spread = shot.spread || 0;
      const base = this.aimAngle;
      const mx = this.x + Math.cos(base) * 14;
      const my = this.centerY() + Math.sin(base) * 9;
      for (let i = 0; i < pellets; i++) {
        const a = pellets === 1 ? base : base - spread / 2 + (spread / (pellets - 1)) * i;
        game.bullets.push(
          new Bullet({
            x: mx + Math.cos(a) * (pellets > 1 ? 2 : 0),
            y: my + Math.sin(a) * (pellets > 1 ? 2 : 0),
            vx: Math.cos(a) * shot.speed,
            vy: Math.sin(a) * shot.speed,
            friendly: true,
            type: shot.type,
            damage: weapon.damage,
            radius: shot.radius,
            life: shot.life,
            knockback: shot.knockback,
            color: shot.color,
          })
        );
      }
      this.muzzle = weapon.muzzle.time;
      this.recoil = weapon.muzzle.recoil;
      game.sfx(shot.sfx || "shoot");
      game.spawnParticles(mx, my, pellets > 1 ? 4 : 2, {
        color: shot.color || "#ffe98a",
        speed: 42,
        life: 0.13,
        size: 1,
        angle: base,
        spread: 0.8,
        glow: true,
      });
      if (pellets > 1) game.shake(1.2, 0.08);
    }

    /** Instant piercing beam: damages every enemy in a line until it meets a wall. */
    fireBeam(game, weapon) {
      const angle = this.aimAngle;
      const dirx = Math.cos(angle);
      const diry = Math.sin(angle);
      const ox = this.x + dirx * 9;
      const oy = this.centerY() + diry * 5;
      const cast = game.castBeam(ox, oy, angle, weapon.beam.range);
      const dist = cast.dist;
      let hits = 0;
      for (const enemy of game.enemies) {
        if (!enemy.alive || enemy.banishing) continue;
        const ex = enemy.x - ox;
        const ey = enemy.y - 10 - oy;
        const t = ex * dirx + ey * diry;
        if (t < 0 || t > dist + 6) continue;
        const perp = Math.abs(ex * diry - ey * dirx);
        if (perp > enemy.w * 0.5 + 3) continue;
        enemy.takeDamage(weapon.damage, game, this.x, this.y - 10);
        game.spawnParticles(enemy.x, enemy.y - 10, 6, {
          color: "#8ff6ff",
          speed: 90,
          life: 0.26,
          size: 1,
          spread: 2.2,
          glow: true,
          drag: 3,
        });
        hits++;
      }
      // Crates do not stop the beam, but they do take the hit.
      for (const crate of game.crates) {
        if (crate.dead) continue;
        const cx = crate.x + 8 - ox;
        const cy = crate.y + 8 - oy;
        const t = cx * dirx + cy * diry;
        if (t < 0 || t > dist + 4) continue;
        const perp = Math.abs(cx * diry - cy * dirx);
        if (perp > 11) continue;
        crate.hit(weapon.damage, game, angle);
      }
      game.beams.push(new Beam(ox, oy, cast.x, cast.y, weapon.beam));
      this.muzzle = weapon.muzzle.time;
      this.recoil = weapon.muzzle.recoil;
      game.shake(hits > 0 ? 2.6 : 1.8, 0.14);
      game.sfx(weapon.sfx || "railgun");
      game.spawnParticles(cast.x, cast.y, 7, {
        color: "#b8f8ff",
        speed: 80,
        life: 0.24,
        size: 1,
        spread: 2.6,
        glow: true,
        drag: 3,
      });
    }

    applyMeleeDamage(game) {
      if (!this.swing || this.swing.hit) return;
      this.swing.hit = true;
      const weapon = this.swing.weapon || WEAPON_DEFS.sword;
      const cx = this.x;
      const cy = this.centerY();
      const range = weapon.range || 34;
      const half = weapon.halfAngle || 1.08;
      let hitAny = false;
      for (const enemy of game.enemies) {
        if (!enemy.alive || enemy.banishing) continue;
        if (
          inSector(enemy.x, enemy.y - 10, cx, cy, this.swing.angle, range, half) &&
          game.dungeon.lineOfSight(cx, cy, enemy.x, enemy.y - 10)
        ) {
          enemy.takeDamage(weapon.damage, game, this.x, this.y - 10);
          hitAny = true;
        }
      }
      for (const crate of game.crates) {
        if (crate.dead) continue;
        if (
          inSector(crate.x + 8, crate.y + 8, cx, cy, this.swing.angle, range + 4, half) &&
          game.dungeon.lineOfSight(cx, cy, crate.x + 8, crate.y + 8)
        ) {
          crate.hit(weapon.damage, game, this.swing.angle);
          hitAny = true;
        }
      }
      if (hitAny) game.shake(1.2, 0.09);
      if (weapon.wave) this.fireWeaponWave(game, weapon.wave, this.swing.angle);
      if (weapon.fan) this.fireWeaponFan(game, weapon.fan, this.swing.angle);
    }

    fireWeaponWave(game, wave, swingAngle) {
      const angle = swingAngle == null ? this.aimAngle : swingAngle;
      const ox = this.x + Math.cos(angle) * 16;
      const oy = this.centerY() + Math.sin(angle) * 9;
      game.bullets.push(
        new Bullet({
          x: ox,
          y: oy,
          vx: Math.cos(angle) * wave.speed,
          vy: Math.sin(angle) * wave.speed,
          friendly: true,
          type: wave.type,
          damage: wave.damage,
          radius: wave.radius,
          life: wave.life,
          pierce: !!wave.pierce,
          knockback: 1.2,
          color: wave.color,
        })
      );
      game.sfx(wave.sfx || "wave");
      game.spawnParticles(ox, oy, 8, {
        color: wave.color,
        speed: 90,
        life: 0.25,
        size: 1,
        angle: angle,
        spread: 1.5,
        glow: true,
        drag: 3,
      });
      game.shake(1.4, 0.1);
    }

    fireWeaponFan(game, fan, swingAngle) {
      const angle = swingAngle == null ? this.aimAngle : swingAngle;
      const ox = this.x + Math.cos(angle) * 15;
      const oy = this.centerY() + Math.sin(angle) * 9;
      for (const offset of fan.angles) {
        const a = angle + offset;
        game.bullets.push(
          new Bullet({
            x: ox,
            y: oy,
            vx: Math.cos(a) * fan.speed,
            vy: Math.sin(a) * fan.speed,
            friendly: true,
            type: fan.type,
            damage: fan.damage,
            radius: fan.radius,
            life: fan.life,
            pierce: !!fan.pierce,
            knockback: 1,
            color: fan.color,
          })
        );
      }
      game.sfx(fan.sfx || "wave");
      game.spawnParticles(ox, oy, 8, {
        color: fan.color,
        speed: 80,
        life: 0.24,
        size: 1,
        angle: angle,
        spread: 1.2,
        glow: true,
        drag: 3,
      });
      game.shake(1.2, 0.09);
    }

    clearEnemyBullets(game) {
      if (!this.swing) return;
      const weapon = this.swing.weapon || WEAPON_DEFS.sword;
      const cx = this.x;
      const cy = this.centerY();
      const range = (weapon.range || 34) + 4;
      const half = (weapon.halfAngle || 1.1) + 0.05;
      let cleared = 0;
      for (const b of game.bullets) {
        if (b.dead || b.friendly) continue;
        if (inSector(b.x, b.y, cx, cy, this.swing.angle, range + b.radius, half)) {
          b.dead = true;
          cleared++;
          game.spawnParticles(b.x, b.y, 4, {
            color: "#fff2b0",
            speed: 80,
            life: 0.22,
            size: 1,
            spread: 2.2,
            glow: true,
            drag: 3,
          });
          game.spawnParticles(b.x, b.y, 2, {
            color: "#8ae8ff",
            speed: 55,
            life: 0.18,
            size: 1,
            spread: 2,
            glow: true,
          });
        }
      }
      if (cleared > 0) {
        game.shake(2, 0.12);
        game.sfx("deflect");
      }
    }

    takeDamage(amount, game, fromX, fromY) {
      if (!this.alive || this.iframes > 0) return;
      if (this.isInvulnerable()) {
        if (this.phaseBlockT <= 0) {
          this.phaseBlockT = 0.6;
          game.addFloatText(this.x, this.y - 32, this.isInRift() ? "OTHER DIMENSION" : "PHASE", "#c4b5fd", {
            scale: 1,
            rise: 14,
            life: 0.6,
          });
        }
        return;
      }
      this.iframes = 0.85;
      this.hurtFlash = 0.25;
      this.sinceDamage = 0;
      this.armorTick = 0;
      let remaining = amount;
      const absorbed = Math.min(this.armor, remaining);
      this.armor -= absorbed;
      remaining -= absorbed;
      if (remaining > 0) {
        this.hp = Math.max(0, this.hp - remaining);
        game.addFloatText(this.x, this.y - 30, "-" + remaining, "#ff6e77", { scale: 2, rise: 22 });
      } else {
        game.addFloatText(this.x, this.y - 28, "BLOCK", "#7fdcff", { scale: 1, rise: 14 });
      }
      if (fromX != null) {
        const d = normalize(this.x - fromX, this.y - 8 - fromY);
        this.kx = d.x * 105;
        this.ky = d.y * 105;
      }
      game.shake(absorbed > 0 ? 1.6 : 3, 0.2);
      game.hurtVignette = Math.max(game.hurtVignette, absorbed > 0 ? 0.32 : 0.65);
      game.hurtTint = absorbed > 0 && remaining === 0 ? "blue" : "red";
      game.sfx(absorbed > 0 && remaining === 0 ? "armorHit" : "hurt");
      game.spawnParticles(
        this.x,
        this.y - 12,
        absorbed > 0 && remaining === 0 ? 6 : 8,
        {
          color: absorbed > 0 && remaining === 0 ? "#66c8ff" : "#ff5f6d",
          speed: 95,
          life: 0.3,
          size: 2,
          glow: true,
          spread: 2.4,
          drag: 3,
        }
      );
      if (this.hp <= 0) {
        this.alive = false;
        this.deathTimer = 0;
        game.shake(4, 0.5);
        game.onPlayerDeath();
      }
    }

    heal(amount) {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + amount);
      return this.hp - before;
    }

    addEnergy(amount) {
      const before = this.energy;
      this.energy = Math.min(this.maxEnergy, this.energy + amount);
      return this.energy - before;
    }

    // ---------------------------------------------------------------------
    draw(ctx, game) {
      if (!this.alive) return;
      const blink = this.iframes > 0 && Math.floor(this.iframes * 24) % 2 === 0;
      const frame = this.moving ? Math.floor(this.walkTime / 0.11) % 4 : 0;
      const spriteName = this.hero.sprite + frame;
      const sprite = SK.Sprites.get(spriteName);
      const bob = this.moving ? 0 : Math.round(this.bob);
      const x = Math.round(this.x);
      const y = Math.round(this.y);
      const aw = this.artW();
      const ah = this.artH();
      const ox = -Math.round(aw / 2);
      const oy = -ah;
      const cx = x;
      const cy = y - ah / 2;
      const riftActive = this.isInRift();
      const riftSpin = this.rift === "entering" || this.rift === "exiting";
      const phasing = this.phaseFx > 0.01;

      drawShadow(ctx, this.x, this.y, Math.round(aw * 0.65));

      // Motion afterimages: gold for Overdrive, violet for rift-walking.
      for (const a of this.afterimages) {
        const alpha = Math.max(0, a.life / a.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha * (a.alpha || 0.34);
        ctx.translate(Math.round(a.x), Math.round(a.y + a.bob));
        ctx.scale(a.facing, 1);
        const ghost = SK.Sprites.get(a.ghost || "knightGhost");
        ctx.drawImage(ghost, -Math.round((a.artW || 20) / 2), -(a.artH || 22));
        ctx.restore();
      }

      // Golden-orange speed aura (Knight overdrive).
      if (this.isOverdrive()) {
        const pulse = 0.5 + 0.5 * Math.sin(game.time * 14);
        ctx.save();
        const aura = ctx.createRadialGradient(x, y - 12, 2, x, y - 12, 22);
        aura.addColorStop(0, "rgba(251,191,36," + (0.24 + pulse * 0.1).toFixed(3) + ")");
        aura.addColorStop(0.55, "rgba(249,115,22," + (0.12 + pulse * 0.06).toFixed(3) + ")");
        aura.addColorStop(1, "rgba(249,115,22,0)");
        ctx.fillStyle = aura;
        ctx.fillRect(x - 24, y - 38, 48, 48);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.22 + pulse * 0.18;
        strokePixelCircle(ctx, x, y - 12, 14, "#fbbf24", 0.18 + pulse * 0.14, 1);
        ctx.globalAlpha = 0.55 + pulse * 0.3;
        ctx.fillStyle = "#fbbf24";
        for (let i = 0; i < 8; i++) {
          const a = game.time * 5 + (i * Math.PI) / 4;
          ctx.fillRect(Math.round(x + Math.cos(a) * 15), Math.round(y - 12 + Math.sin(a) * 15), 1, 1);
        }
        ctx.restore();
      }

      // Rift-walker aura: violet dimensional light wrapping the silhouette.
      if (riftActive || riftSpin) {
        const pulse = 0.5 + 0.5 * Math.sin(game.time * 6.2);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const aura = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34);
        aura.addColorStop(0, "rgba(139,92,246," + (0.26 + pulse * 0.1).toFixed(3) + ")");
        aura.addColorStop(0.5, "rgba(76,29,149,0.16)");
        aura.addColorStop(1, "rgba(3,2,10,0)");
        ctx.fillStyle = aura;
        ctx.fillRect(cx - 38, cy - 38, 76, 76);
        ctx.globalAlpha = 0.4 + pulse * 0.3;
        strokePixelCircle(ctx, cx, cy, 16, "#c4b5fd", 0.22 + pulse * 0.16, 1);
        ctx.globalAlpha = 0.5 + pulse * 0.3;
        ctx.fillStyle = "#a78bfa";
        for (let i = 0; i < 10; i++) {
          const a = -game.time * 1.6 + (i * Math.PI) / 5;
          ctx.fillRect(Math.round(cx + Math.cos(a) * 20), Math.round(cy + Math.sin(a) * 18), 1, 1);
        }
        ctx.restore();
      }

      // A faint warped halo at the eye while intangible; the tendrils
      // themselves are drawn in drawSkillWorld so they overlay nearby actors.
      if (phasing) {
        const eyeX = x + this.facing * Math.round(aw * 0.17);
        const eyeY = y + bob - ah + Math.round(ah * 0.335);
        ctx.save();
        const haze = ctx.createRadialGradient(eyeX, eyeY, 1, eyeX, eyeY, 15);
        haze.addColorStop(0, "rgba(48,22,78," + (0.4 * this.phaseFx).toFixed(3) + ")");
        haze.addColorStop(0.55, "rgba(30,12,52," + (0.18 * this.phaseFx).toFixed(3) + ")");
        haze.addColorStop(1, "rgba(20,6,36,0)");
        ctx.fillStyle = haze;
        ctx.fillRect(eyeX - 17, eyeY - 17, 34, 34);
        ctx.restore();
      }

      // Gravito's floating cosmic rune accent.
      if (this.heroId === "gravito") {
        const t = game.time * 2.6;
        const rx = x + Math.cos(t) * 12;
        const ry = y - ah - 1 + Math.sin(t * 1.35) * 3;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#e879f9";
        ctx.fillRect(Math.round(rx), Math.round(ry), 2, 2);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#a855f7";
        ctx.fillRect(Math.round(rx) - 2, Math.round(ry) + 1, 6, 1);
        ctx.fillRect(Math.round(rx) + 1, Math.round(ry) - 2, 1, 6);
        ctx.restore();
      }

      // Sagittal-axis spin while stepping into or out of the rift. Two spins:
      // the first shrinks the traveler into the portal, the second grows them
      // back in the destination dimension.
      let spinX = 1;
      let spinY = 1;
      if (riftSpin) {
        const p = clamp(this.riftT / this.riftDur, 0, 1);
        let turn;
        let scale;
        if (p < 0.45) {
          const q = p / 0.45;
          turn = Math.cos(q * Math.PI * 2);
          scale = 1 - q;
        } else if (p < 0.55) {
          // A brief dot-sized pause between the two spins.
          turn = 1;
          scale = 0.02;
        } else {
          const q = (p - 0.55) / 0.45;
          turn = Math.cos(q * Math.PI * 2);
          scale = q;
        }
        scale = Math.max(0.02, scale);
        spinX = turn * scale;
        spinY = scale;
        if (Math.abs(spinX) < 0.06) spinX = spinX < 0 ? -0.06 : 0.06;
      }
      let alpha = blink ? 0.55 : 1;
      if (riftActive) alpha *= 0.9;
      if (phasing) alpha *= 0.62 + 0.16 * Math.sin(game.time * 8.5);

      // While spinning, pivot around the body centre (the portal's centre)
      // so the traveler is drawn into the vortex rather than into the floor.
      const pivotY = riftSpin ? y - ah / 2 : y + bob;
      const spriteOY = riftSpin ? -Math.round(ah / 2) : oy;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, pivotY);
      ctx.scale(this.facing * spinX, spinY);
      ctx.drawImage(sprite, ox, spriteOY);
      if (this.hurtFlash > 0) {
        const flash = SK.Sprites.getFlash(this.hero.sprite + "0");
        if (flash) {
          ctx.globalAlpha = Math.min(0.65, this.hurtFlash * 2.8);
          ctx.drawImage(flash, ox, spriteOY);
        }
      }
      ctx.restore();

      // Translucent ghost overlay sells the "other dimension" body.
      if (riftActive) {
        const ghost = this.hero.ghost || "travelerGhost";
        if (SK.Sprites.has(ghost)) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.2 + 0.07 * Math.sin(game.time * 5.1);
          ctx.translate(x, y + bob);
          ctx.scale(this.facing, 1);
          ctx.drawImage(SK.Sprites.get(ghost), ox, oy);
          ctx.restore();
        }
      }

      // The held weapon is part of the body; hide it during the spin so it
      // cannot float beside the shrinking traveler, and fade it with the
      // alternate states so the whole silhouette reads as phased.
      if (!riftSpin) {
        const heldAlpha = riftActive ? 0.78 : phasing ? 0.62 : 1;
        ctx.save();
        ctx.globalAlpha = heldAlpha;
        this.drawGravityCharge(ctx, game);
        this.drawWeapon(ctx, game);
        ctx.restore();
      }
    }

    /** Five glowing charge pips beneath Gravito's feet. */
    drawGravityCharge(ctx, game) {
      if (game && game.state === "home") return;
      const weapon = this.currentWeapon();
      if (!weapon || weapon.id !== "gravityGreatsword") return;
      const n = 5;
      const gap = 4;
      const totalW = (n - 1) * gap + 2;
      const x0 = Math.round(this.x - totalW / 2);
      const y = Math.round(this.y + 4);
      const filled = this.gravityCharge;
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 6);
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = "#0a0614";
      ctx.fillRect(x0 - 3, y - 2, totalW + 6, 6);
      ctx.restore();
      for (let i = 0; i < n; i++) {
        const px = x0 + i * gap;
        if (i < filled) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.3 + pulse * 0.15;
          ctx.fillStyle = "#7c3aed";
          ctx.fillRect(px - 1, y - 1, 4, 4);
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = i === n - 1 ? "#e879f9" : "#a855f7";
          ctx.fillRect(px, y, 2, 2);
          ctx.globalAlpha = 1;
          ctx.fillStyle = i === n - 1 ? "#ffffff" : "#f5d0fe";
          ctx.fillRect(px, y, 1, 1);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = "#241040";
          ctx.fillRect(px, y, 2, 2);
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = "#3b0764";
          ctx.fillRect(px, y, 2, 1);
          ctx.restore();
        }
      }
    }

    drawWeapon(ctx, game) {
      const weapon = this.currentWeapon();
      if (!weapon) return;
      const angle = this.aimAngle;
      const handX = Math.round(this.x + Math.cos(angle) * 8);
      const handY = Math.round(this.centerY() + 1 + Math.sin(angle) * 5);
      let drawAngle = angle;

      if (weapon.kind === "melee") {
        if (this.swing) {
          const progress = clamp(this.swing.t / this.swing.duration, 0, 1);
          drawAngle = this.swing.angle - 1.15 + 2.3 * progress;
        } else {
          drawAngle = angle + Math.sin(game.time * 3.2) * 0.025;
        }
      }

      const kick = this.recoil;
      const jitter = this.noEnergyCd > 0 ? Math.round(Math.sin(game.time * 80)) : 0;
      ctx.save();
      ctx.translate(
        handX - Math.round(Math.cos(angle) * kick) + jitter,
        handY - Math.round(Math.sin(angle) * kick)
      );
      ctx.rotate(drawAngle);
      if (Math.abs(drawAngle) > Math.PI / 2) ctx.scale(1, -1);
      const wSpr = SK.Sprites.get(weapon.sprite);
      if (weapon.kamuiAura) {
        // Dark violet tear hugging the glove; it grows as the 2s cooldown
        // refills so the next banish is readable at a glance.
        const ready = 1 - clamp(this.cooldowns[this.weapon] / Math.max(0.001, weapon.cooldown), 0, 1);
        const pulse = 0.5 + 0.5 * Math.sin(game.time * 4.8);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const aura = ctx.createRadialGradient(0, 0, 1, 0, 0, 16 + ready * 5);
        aura.addColorStop(0, "rgba(196,181,253," + (0.18 + ready * 0.16 + pulse * 0.05).toFixed(3) + ")");
        aura.addColorStop(0.55, "rgba(124,58,237,0.12)");
        aura.addColorStop(1, "rgba(20,4,40,0)");
        ctx.fillStyle = aura;
        ctx.fillRect(-20, -20, 40, 40);
        ctx.globalAlpha = 0.45 + ready * 0.35;
        ctx.fillStyle = "#c4b5fd";
        for (let i = 0; i < 5; i++) {
          const a = game.time * 2.4 + (i * Math.PI * 2) / 5;
          const rr = 7 + ready * 3;
          ctx.fillRect(Math.round(Math.cos(a) * rr), Math.round(Math.sin(a) * rr), 1, 1);
        }
        ctx.restore();
      }
      if (weapon.gravityAura) {
        // Subtle translucent violet aura hugging the blade.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.12 + 0.05 * Math.sin(game.time * 5.2);
        ctx.fillStyle = "#7c3aed";
        ctx.fillRect(weapon.grip.x - 2, weapon.grip.y - 2, wSpr.width + 4, wSpr.height + 4);
        const aura = ctx.createLinearGradient(weapon.grip.x, 0, weapon.grip.x + wSpr.width, 0);
        aura.addColorStop(0, "rgba(107,33,168,0)");
        aura.addColorStop(0.35, "rgba(168,85,247,0.28)");
        aura.addColorStop(0.8, "rgba(232,121,249,0.20)");
        aura.addColorStop(1, "rgba(107,33,168,0)");
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = aura;
        ctx.fillRect(weapon.grip.x, weapon.grip.y - 1, wSpr.width, wSpr.height + 2);
        ctx.restore();
      }
      ctx.drawImage(wSpr, weapon.grip.x, weapon.grip.y);
      if (weapon.gravityAura) {
        // Animated gravitational motes drifting along both blade edges.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const cols = ["#6b21a8", "#a855f7", "#f3e8ff"];
        for (let i = 0; i < 7; i++) {
          const span = wSpr.width - 2;
          const mx = weapon.grip.x + 2 + ((game.time * 24 + i * 13) % span);
          const lane = i % 2 === 0 ? -1 : 1;
          const my =
            weapon.grip.y +
            wSpr.height / 2 +
            lane * (wSpr.height / 2 - 1) +
            Math.sin(game.time * 7 + i * 2.1) * 1.4;
          const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(game.time * 9 + i * 1.7));
          ctx.globalAlpha = twinkle * 0.8;
          ctx.fillStyle = cols[i % cols.length];
          ctx.fillRect(Math.round(mx), Math.round(my), i % 3 === 0 ? 2 : 1, 1);
        }
        ctx.restore();
      }
      if (weapon.kind !== "melee" && weapon.kind !== "summon") {
        // Small gripping hand pixel, readable at 1x.
        ctx.fillStyle = "#d8c1a3";
        ctx.fillRect(0, -1, 2, 2);
        if (this.muzzle > 0) this.drawMuzzleFlash(ctx, weapon);
      }
      ctx.restore();
    }

    drawMuzzleFlash(ctx, weapon) {
      const muzzle = weapon.muzzle || { x: 10, y: -2, time: 0.075 };
      const a = clamp(this.muzzle / (muzzle.time || 0.075), 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      if (weapon.id === "railgun") {
        ctx.fillStyle = "#8ff6ff";
        ctx.fillRect(muzzle.x - 2, -4, 10, 9);
        ctx.fillStyle = "#f2ffff";
        ctx.fillRect(muzzle.x, -2, 9, 4);
        ctx.fillRect(muzzle.x + 5, -5, 3, 10);
      } else if (weapon.id === "shotgun") {
        ctx.fillStyle = "#ffd08a";
        ctx.fillRect(muzzle.x - 2, -5, 6, 10);
        ctx.fillRect(muzzle.x, -7, 4, 14);
        ctx.fillStyle = "#fff3c0";
        ctx.fillRect(muzzle.x + 1, -3, 7, 3);
        ctx.fillRect(muzzle.x + 1, 1, 5, 2);
      } else {
        ctx.fillStyle = "#fff7c0";
        ctx.fillRect(muzzle.x - 2, -4, 6, 3);
        ctx.fillRect(muzzle.x, -6, 3, 7);
        ctx.fillStyle = "#ffd24a";
        ctx.globalAlpha = a * 0.8;
        ctx.fillRect(muzzle.x - 1, -3, 6, 1);
        ctx.fillRect(muzzle.x + 1, -5, 1, 6);
        ctx.fillRect(muzzle.x + 3, -3, 2, 2);
      }
      ctx.restore();
    }

    drawSlash(ctx, game) {
      if (!this.swing) return;
      const weapon = this.swing.weapon || WEAPON_DEFS.sword;
      const slash = weapon.slash || WEAPON_DEFS.sword.slash;
      const progress = clamp(this.swing.t / this.swing.duration, 0, 1);
      const start = this.swing.angle - 1.15;
      const lead = start + 2.3 * progress;
      const cx = this.x;
      const cy = this.centerY();
      const outer = slash.r1 || 32;
      const inner = slash.r0 || 23;

      // Four tapered radius bands in the weapon's rarity-neutral blade colour.
      const bands = [
        { r: outer, color: slash.outer, trail: 1.2, size: 2 },
        { r: outer - 3, color: slash.mid, trail: 1.12, size: 2 },
        { r: outer - 6, color: slash.core, trail: 1.04, size: 2 },
        { r: Math.max(inner, outer - 9), color: slash.hot, trail: 0.96, size: 1 },
      ];
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let b = 0; b < bands.length; b++) {
        const band = bands[b];
        const a0 = Math.max(start, lead - band.trail);
        if (lead <= a0) continue;
        const steps = Math.max(3, Math.ceil((lead - a0) * 30));
        ctx.fillStyle = band.color;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const ang = a0 + (lead - a0) * t;
          const taper = Math.sin(Math.min(1, t) * Math.PI);
          if (taper < 0.12) continue;
          const px = Math.round(cx + Math.cos(ang) * band.r);
          const py = Math.round(cy + Math.sin(ang) * band.r * 0.9);
          ctx.globalAlpha = (0.22 + 0.72 * t) * (0.35 + taper * 0.65);
          ctx.fillRect(px, py, band.size, band.size);
        }
      }

      // Bright leading tip with a little cross flash.
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = slash.hot || "#ffffff";
      const tipX = Math.round(cx + Math.cos(lead) * (outer - 1));
      const tipY = Math.round(cy + Math.sin(lead) * (outer - 1) * 0.9);
      ctx.fillRect(tipX - 2, tipY - 1, 5, 2);
      ctx.fillRect(tipX - 1, tipY - 2, 2, 5);
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = slash.tip || "#b8f4ff";
      ctx.fillRect(tipX - 3, tipY - 3, 7, 1);
      ctx.fillRect(tipX - 3, tipY + 3, 7, 1);
      ctx.restore();
    }

    drawReticle(ctx, game) {
      const target = this.aimTarget;
      if (!target || !target.alive || target.banishing) return;
      const p = 0.5 + 0.5 * Math.sin(game.time * 7);
      const x = Math.round(target.x);
      const y = Math.round(target.y - 2);
      ctx.save();
      ctx.globalAlpha = 0.62 + p * 0.2;
      ctx.fillStyle = "#aef4ff";
      const r = 10;
      const arm = 4;
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        ctx.fillRect(x + sx * r - (sx < 0 ? 0 : 1), y + sy * 3, arm, 1);
        ctx.fillRect(x + sx * r - 1, y + sy * 3 - (sy < 0 ? 0 : 1), 2, arm);
      }
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y - 11, 1, 2);
      ctx.fillRect(x, y + 4, 1, 1);
      ctx.restore();
    }

    drawSkillWorld(ctx, game) {
      if (this.wells) this.wells.draw(ctx, game);
      if (this.heroId === "traveler" && this.phaseFx > 0.01 && !this.isRifting() && SK.Kamui) {
        const x = Math.round(this.x);
        const y = Math.round(this.y);
        const aw = this.artW();
        const ah = this.artH();
        const eyeBob = this.moving ? 0 : Math.round(this.bob);
        const eyeX = x + this.facing * Math.round(aw * 0.17);
        const eyeY = y + eyeBob - ah + Math.round(ah * 0.335);
        SK.Kamui.drawEyeTrails(ctx, eyeX, eyeY, this.facing, game.time, this.phaseFx);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Projectiles
  // -------------------------------------------------------------------------
  class Bullet {
    constructor(opts) {
      this.x = opts.x;
      this.y = opts.y;
      this.vx = opts.vx;
      this.vy = opts.vy;
      this.friendly = !!opts.friendly;
      this.type = opts.type || "pistol";
      this.damage = opts.damage || 1;
      this.radius = opts.radius || 2;
      this.life = opts.life || 1;
      this.maxLife = this.life;
      this.dead = false;
      this.angle = Math.atan2(this.vy, this.vx);
      this.spawnPulse = 0.08;
      this.pierce = !!opts.pierce;
      this.knockback = opts.knockback || 1;
      this.color = opts.color || null;
      this.hits = this.pierce ? new Set() : null;
      this.phase = Math.random() * Math.PI * 2;
    }

    update(dt, game) {
      if (this.dead) return;
      this.life -= dt;
      this.spawnPulse = Math.max(0, this.spawnPulse - dt);
      if (this.life <= 0) {
        this.dead = true;
        return;
      }
      const dx = this.vx * dt;
      const dy = this.vy * dt;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 3.5));
      for (let i = 0; i < steps; i++) {
        this.x += dx / steps;
        this.y += dy / steps;

        // Walls (use the full projectile radius for fair hits).
        const br = this.radius;
        if (game.dungeon.rectHitsTiles(this.x - br, this.y - br, br * 2, br * 2)) {
          this.impact(game, true);
          return;
        }

        // Gates.
        const gate = game.gateAtRect(this.x - br, this.y - br, br * 2, br * 2);
        if (gate) {
          this.impact(game, true);
          return;
        }

        // Crates.
        const crate = game.crateAtRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        if (crate) {
          if (this.friendly) crate.hit(this.damage, game, this.angle);
          this.impact(game, false, crate);
          return;
        }

        // Targets.
        if (this.friendly) {
          for (const enemy of game.enemies) {
            if (!enemy.alive || enemy.banishing) continue;
            if (this.hits && this.hits.has(enemy)) continue;
            const r = entityRect(enemy);
            if (rectsOverlap(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2, r.x, r.y, r.w, r.h)) {
              enemy.takeDamage(this.damage, game, this.x - this.vx, this.y - this.vy, 60 * this.knockback);
              if (this.pierce) {
                this.hits.add(enemy);
                this.burst(game, false, null);
                continue;
              }
              this.impact(game, false);
              return;
            }
          }
        } else {
          const p = game.player;
          if (p && p.alive && !(p.isInvulnerable && p.isInvulnerable())) {
            const r = p.getRect();
            if (rectsOverlap(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2, r.x, r.y, r.w, r.h)) {
              p.takeDamage(this.damage, game, this.x - this.vx, this.y - this.vy);
              this.impact(game, false);
              return;
            }
          }
        }
      }
    }

    burst(game, wall, crate) {
      let color = this.color || "#ffe87a";
      if (!this.friendly && !this.color) color = this.type === "shaman" ? "#d08bff" : this.type === "turret" ? "#c879ff" : "#ff7a66";
      if (this.type === "pistol") color = "#ffe87a";
      if (this.type === "pellet") color = "#ff9e4a";
      if (this.type === "wave") color = "#ff4d6d";
      if (this.type === "green") color = "#5fe07a";
      const count = wall ? 4 : 3;
      game.spawnParticles(this.x, this.y, count, {
        color: color,
        speed: wall ? 55 : 85,
        life: wall ? 0.18 : 0.24,
        size: 1,
        spread: 2.2,
        glow: true,
        drag: 4,
      });
      if (crate) {
        game.spawnParticles(this.x, this.y, 2, {
          color: "#a97d4e",
          speed: 60,
          life: 0.3,
          size: 2,
          spread: 2,
          drag: 4,
        });
      }
    }

    impact(game, wall, crate) {
      this.dead = true;
      this.burst(game, wall, crate);
    }

    draw(ctx, game) {
      if (this.dead) return;
      const x = this.x;
      const y = this.y;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      if (this.type === "pistol") {
        // streak
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = "#ffd84a";
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle);
        ctx.fillRect(-14, -1, 13, 2);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#ffe88e";
        ctx.fillRect(-7, -1, 7, 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fffbe0";
        ctx.fillRect(-3, -1, 6, 2);
        ctx.fillStyle = "#ffe14a";
        ctx.fillRect(-2, -2, 4, 4);
        ctx.restore();
      } else if (this.type === "pellet") {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#ff6a1e";
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle);
        ctx.fillRect(-9, -1, 8, 2);
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = "#ff7a26";
        ctx.fillRect(-4, -2, 6, 4);
        ctx.fillStyle = "#ff9e4a";
        ctx.fillRect(-2, -1, 4, 2);
        ctx.fillStyle = "#ffc06a";
        ctx.fillRect(0, -1, 2, 2);
        ctx.restore();
      } else if (this.type === "wave") {
        // Fast crimson crescent energy wave: a curved band with a bright
        // leading core and a short fading tail.
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = "#ff3355";
        ctx.fillRect(-9, -7, 15, 14);
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = "#ff6b81";
        ctx.fillRect(-10, -1, 6, 2);
        for (let yy = -6; yy <= 6; yy += 2) {
          const xo = Math.round(3 - yy * yy * 0.1);
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = "#e63b58";
          ctx.fillRect(xo - 3, yy, 4, 2);
          ctx.fillStyle = "#ffb3c0";
          ctx.fillRect(xo - 1, yy, 2, 2);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff0f2";
        ctx.fillRect(2, -2, 3, 4);
        ctx.restore();
      } else if (this.type === "green") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(this.angle);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#2fae58";
        ctx.fillRect(-6, -2, 7, 4);
        ctx.fillStyle = "#5fe07a";
        ctx.fillRect(-4, -3, 6, 6);
        ctx.fillStyle = "#d8ffe2";
        ctx.fillRect(-1, -1, 4, 2);
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = "#54e07a";
        ctx.fillRect(-11, -1, 6, 2);
        ctx.restore();
      } else {
        const col = this.color || (this.type === "shaman" || this.type === "turret" ? "#c879ff" : "#ff5a4a");
        const hot = this.type === "shaman" || this.type === "turret" ? "#f0d4ff" : "#ffcf9a";
        const r = this.type === "turret" ? 7 : 6;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, r + Math.sin(game.time * 16 + this.phase) * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.fillRect(x - 2, y - 3, 4, 6);
        ctx.fillRect(x - 3, y - 2, 6, 4);
        ctx.fillStyle = hot;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Railgun beam trail (instant hit, purely visual, fades over 0.18 s)
  // -------------------------------------------------------------------------
  class Beam {
    constructor(x1, y1, x2, y2, opts) {
      opts = opts || {};
      this.x1 = x1;
      this.y1 = y1;
      this.x2 = x2;
      this.y2 = y2;
      this.life = opts.life || 0.18;
      this.maxLife = this.life;
      this.width = opts.width || 4;
      this.color = opts.color || "#6ff2ff";
      this.hot = opts.hot || "#f2ffff";
      this.dead = false;
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }

    draw(ctx) {
      const a = clamp(this.life / this.maxLife, 0, 1);
      const dx = this.x2 - this.x1;
      const dy = this.y2 - this.y1;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const ang = Math.atan2(dy, dx);
      const w = this.width;
      ctx.save();
      ctx.translate(Math.round(this.x1), Math.round(this.y1));
      ctx.rotate(ang);
      ctx.globalCompositeOperation = "lighter";

      ctx.globalAlpha = 0.2 * a;
      ctx.fillStyle = this.color;
      ctx.fillRect(-2, -(w + 4), len + 4, (w + 4) * 2);
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = this.color;
      ctx.fillRect(-1, -w, len + 2, w * 2);
      ctx.globalAlpha = 0.95 * a;
      ctx.fillStyle = this.hot;
      ctx.fillRect(0, -1, len, 2);

      // Impact bloom at the far end.
      ctx.globalAlpha = 0.9 * a;
      ctx.fillStyle = this.hot;
      ctx.fillRect(len - 3, -3, 6, 6);
      ctx.globalAlpha = 0.4 * a;
      ctx.fillStyle = this.color;
      ctx.fillRect(len - 5, -5, 10, 10);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Enemies
  // -------------------------------------------------------------------------
  const ENEMY_STATS = {
    guard: {
      sprite: "guard",
      hp: 12,
      speed: 43,
      fireCd: [1.35, 2.05],
      range: 195,
      bullet: { type: "guard", color: "#ff5a4a", speed: 78, damage: 1 },
      hitColor: "#b7ef8a",
      deathColor: "#8fd469",
    },
    shaman: {
      sprite: "shaman",
      hp: 9,
      speed: 34,
      fireCd: [2.05, 2.85],
      range: 225,
      bullet: { type: "shaman", color: "#c879ff", speed: 66, damage: 1 },
      hitColor: "#db9cff",
      deathColor: "#c879ff",
    },
    turret: {
      sprite: "turret",
      hp: 18,
      speed: 0,
      fireCd: [2.35, 3.0],
      range: 215,
      bullet: { type: "turret", color: "#c879ff", speed: 56, damage: 1 },
      stationary: true,
      hitColor: "#ffb3f5",
      deathColor: "#d06bff",
    },
  };

  class Enemy {
    constructor(type, x, y, room, depth, opts) {
      const stats = ENEMY_STATS[type] || ENEMY_STATS.guard;
      this.type = type;
      this.stats = stats;
      this.x = x;
      this.y = y;
      this.w = stats.stationary ? 14 : 12;
      this.h = stats.stationary ? 12 : 10;
      // Floor scaling: base HP grows linearly with depth (see difficulty.js).
      // Endless waves pass an explicit multiplier instead, so the same base
      // stats can scale by +10% per wave without a synthetic depth.
      this.depth = SK.Difficulty.normalizeDepth(depth);
      opts = opts || {};
      const scaled = Number.isFinite(opts.hpMultiplier) ? stats.hp * opts.hpMultiplier : null;
      this.maxHp = scaled == null ? SK.Difficulty.scaleHp(stats.hp, this.depth) : Math.max(1, Math.round(scaled));
      this.hp = this.maxHp;
      this.speed = stats.speed;
      this.room = room;
      this.roomId = room ? room.id : -1;
      this.alive = true;
      this.active = false;
      this.hitFlash = 0;
      this.alert = 0;
      this.fireCd = 0.8 + Math.random() * 1.2;
      this.charge = 0;
      this.chargeMax = 0.55;
      this.ringOffset = Math.random() * Math.PI * 2;
      this.contactCd = 0;
      this.facing = 1;
      this.bobT = Math.random() * 7;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.kx = 0;
      this.ky = 0;
      this.vx = 0;
      this.vy = 0;
      this.showHp = 0;
      this.dead = false;
      // Kamui banish animation state (the gloves' portal).
      this.banishing = false;
      this.banishT = 0;
      this.banishDur = 0;
      this.banishSeed = Math.random() * 100;
    }

    getRect() {
      return entityRect(this);
    }

    activate(game) {
      if (!this.active) {
        this.active = true;
        this.alert = 0.8;
        this.fireCd = Math.min(this.fireCd, 0.55);
        game.sfx("alert");
      }
    }

    /** Begin the Kamui banish spin. The enemy stops acting, shrinks and pops. */
    beginBanish(game, opts) {
      if (!this.alive || this.banishing) return false;
      opts = opts || {};
      this.banishing = true;
      this.banishT = 0;
      this.banishDur = opts.duration || 0.9;
      this.active = true;
      this.charge = 0;
      this.contactCd = 1.0;
      this.vx = 0;
      this.vy = 0;
      this.kx = 0;
      this.ky = 0;
      return true;
    }

    update(dt, game) {
      if (!this.alive) return;
      this.bobT += dt;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.alert = Math.max(0, this.alert - dt);
      this.showHp = Math.max(0, this.showHp - dt);
      this.contactCd = Math.max(0, this.contactCd - dt);

      // Banished: freeze the AI, spin/shrink in Enemy.draw, then pop.
      if (this.banishing) {
        this.banishT += dt;
        this.vx = 0;
        this.vy = 0;
        if (this.banishT >= this.banishDur) {
          this.banishing = false;
          game.addFloatText(this.x, this.y - 26, "BANISHED!", "#c4b5fd", {
            scale: 1,
            rise: 18,
            life: 1.0,
          });
          game.spawnParticles(this.x, this.y - 10, 18, {
            color: "#c4b5fd",
            speed: 135,
            life: 0.5,
            size: 1,
            spread: 2.8,
            glow: true,
            drag: 2.4,
          });
          game.spawnParticles(this.x, this.y - 10, 10, {
            color: "#050508",
            speed: 95,
            life: 0.4,
            size: 2,
            spread: 2.8,
            drag: 2.6,
          });
          game.effects.push(
            new RingPulse(this.x, this.y - 8, {
              life: 0.4,
              r0: 4,
              r1: 24,
              yScale: 0.7,
              colors: ["#c4b5fd", "#1a1030", "#ffffff"],
              thickness: 1,
              layer: "over",
            })
          );
          game.shake(1.4, 0.14);
          game.sfx("kamuiPop");
          this.die(game);
        }
        return;
      }

      if (!this.active) {
        this.vx = 0;
        this.vy = 0;
        return;
      }

      const p = game.player;
      if (!p || !p.alive) {
        this.vx = 0;
        this.vy = 0;
        return;
      }
      // A rift-walker is in another dimension: enemies cannot see or act.
      if (p.isUntargetable && p.isUntargetable()) {
        this.vx = 0;
        this.vy = 0;
        this.charge = 0;
        return;
      }
      const oldX = this.x;
      const oldY = this.y;
      const px = p.x;
      const py = p.y - 10;
      const dx = px - this.x;
      const dy = py - (this.y - 10);
      const dist = Math.hypot(dx, dy) || 1;
      const dirx = dx / dist;
      const diry = dy / dist;
      if (Math.abs(dx) > 2) this.facing = dx < 0 ? -1 : 1;

      const los = game.dungeon.lineOfSight(this.x, this.y - 10, px, py);

      // Stationary crystal turret: telegraph, then a six-bullet radial ring.
      if (this.stats.stationary) {
        this.vx = 0;
        this.vy = 0;
        this.fireCd -= dt;
        if (this.charge > 0) {
          this.charge -= dt;
          if (this.charge <= 0) {
            this.charge = 0;
            this.fireRing(game);
            this.fireCd = this.stats.fireCd[0] + Math.random() * (this.stats.fireCd[1] - this.stats.fireCd[0]);
          }
        } else if (dist < this.stats.range && this.fireCd <= 0) {
          this.charge = this.chargeMax;
          game.sfx("charge");
        }
        return;
      }

      let mvx = 0;
      let mvy = 0;

      if (this.type === "guard") {
        if (dist > 62) {
          mvx = dirx;
          mvy = diry;
        } else if (dist < 42) {
          mvx = -dirx;
          mvy = -diry;
        } else {
          mvx = -diry * this.strafeDir * 0.42;
          mvy = dirx * this.strafeDir * 0.42;
        }
        if (!los) {
          mvx = dirx;
          mvy = diry;
        }
      } else {
        const desired = 98;
        if (dist > desired + 32) {
          mvx += dirx;
          mvy += diry;
        } else if (dist < desired - 26) {
          mvx -= dirx;
          mvy -= diry;
        }
        mvx += -diry * this.strafeDir * 0.8;
        mvy += dirx * this.strafeDir * 0.8;
        if (!los) {
          mvx = dirx;
          mvy = diry;
        }
      }

      // small knockback
      if (Math.abs(this.kx) > 2) {
        mvx += this.kx / 60;
        mvy += this.ky / 60;
        this.kx *= Math.pow(0.02, dt);
        this.ky *= Math.pow(0.02, dt);
      }

      // Repel nearby goblins so the group doesn't stack into one sprite.
      let sepx = 0;
      let sepy = 0;
      for (const other of game.enemies) {
        if (other === this || !other.alive || other.roomId !== this.roomId) continue;
        let ddx = this.x - other.x;
        let ddy = this.y - other.y;
        let dd = Math.hypot(ddx, ddy);
        if (dd >= 20) continue;
        if (dd < 0.01) {
          ddx = this.roomId % 2 ? 1 : -1;
          ddy = 0.6;
          dd = Math.hypot(ddx, ddy);
        }
        const push = (20 - dd) / 20;
        sepx += (ddx / dd) * push;
        sepy += (ddy / dd) * push;
      }
      mvx += sepx * 1.4;
      mvy += sepy * 1.4;

      const mvn = normalize(mvx, mvy);
      if (mvn.len > 0) {
        const res = moveEntity(this, mvn.x * this.speed * dt, mvn.y * this.speed * dt, (x, y, w, h) =>
          game.isBlocked(x, y, w, h)
        );
        if (res.hitX || res.hitY) this.strafeDir *= -1;
      }

      // Firmer post-move separation.
      for (const other of game.enemies) {
        if (other === this || !other.alive || other.roomId !== this.roomId) continue;
        let ddx = this.x - other.x;
        let ddy = this.y - other.y;
        let dd = Math.hypot(ddx, ddy);
        if (dd > 0.01 && dd < 19) {
          const push = (19 - dd) * 0.6;
          moveEntity(this, (ddx / dd) * push, (ddy / dd) * push, (x, y, w, h) => game.isBlocked(x, y, w, h));
        }
      }

      this.vx = clamp((this.x - oldX) / Math.max(0.0001, dt), -90, 90);
      this.vy = clamp((this.y - oldY) / Math.max(0.0001, dt), -90, 90);

      // Contact damage.
      if (this.contactCd <= 0 && rectsOverlap(this.x - 7, this.y - 9, 14, 9, p.x - p.w / 2, p.y - p.h, p.w, p.h)) {
        if (p.iframes <= 0 && !(p.isInvulnerable && p.isInvulnerable())) {
          p.takeDamage(1, game, this.x, this.y - 10);
          this.contactCd = 1.1;
        }
      }

      // Ranged attacks.
      this.fireCd -= dt;
      if (los && dist < this.stats.range && this.fireCd <= 0) {
        this.fire(game, dirx, diry);
        this.fireCd = this.stats.fireCd[0] + Math.random() * (this.stats.fireCd[1] - this.stats.fireCd[0]);
      }
    }

    fire(game, dirx, diry) {
      const b = this.stats.bullet;
      const baseAngle = Math.atan2(diry, dirx);
      const mx = this.x + dirx * 11;
      const my = this.y - 10 + diry * 11;
      const shots = this.type === "shaman" ? [-0.2, 0, 0.2] : [0];
      for (const offset of shots) {
        const a = baseAngle + offset;
        game.bullets.push(
          new Bullet({
            x: mx,
            y: my,
            vx: Math.cos(a) * b.speed,
            vy: Math.sin(a) * b.speed,
            friendly: false,
            type: b.type,
            damage: b.damage,
            life: 4,
            radius: 2.5,
          })
        );
      }
      game.spawnParticles(mx, my, 3, {
        color: b.color,
        speed: 40,
        life: 0.18,
        size: 1,
        angle: baseAngle,
        spread: 0.9,
        glow: true,
      });
      game.sfx(this.type === "shaman" ? "shamanShoot" : "enemyShoot");
    }

    fireRing(game) {
      const b = this.stats.bullet;
      const count = 6;
      this.ringOffset += Math.PI / 6 + Math.random() * 0.12;
      for (let i = 0; i < count; i++) {
        const a = this.ringOffset + (i / count) * Math.PI * 2;
        game.bullets.push(
          new Bullet({
            x: this.x + Math.cos(a) * 12,
            y: this.y - 11 + Math.sin(a) * 12,
            vx: Math.cos(a) * b.speed,
            vy: Math.sin(a) * b.speed,
            friendly: false,
            type: "turret",
            damage: b.damage,
            life: 4.6,
            radius: 3,
            color: "#c879ff",
          })
        );
      }
      game.spawnParticles(this.x, this.y - 13, 10, {
        color: "#d98cff",
        speed: 70,
        life: 0.32,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 3,
      });
      game.shake(0.9, 0.12);
      game.sfx("turretShoot");
    }

    takeDamage(amount, game, fromX, fromY, knockback) {
      if (!this.alive || this.banishing) return;
      this.hp -= amount;
      this.hitFlash = 0.13;
      this.showHp = 1.8;
      if (this.room && this.room.locked) this.active = true;
      game.addFloatText(this.x, this.y - 25, String(amount), "#ffffff", { scale: 1, rise: 16 });
      game.spawnParticles(this.x, this.y - 10, 4, {
        color: this.stats.hitColor || "#b7ef8a",
        speed: 90,
        life: 0.22,
        size: 1,
        spread: 2.3,
        glow: false,
        drag: 3,
      });
      game.sfx("hit");
      if (fromX != null && !this.stats.stationary) {
        const d = normalize(this.x - fromX, this.y - fromY);
        const kb = knockback || 60;
        this.kx = d.x * kb;
        this.ky = d.y * kb;
      }
      if (this.hp <= 0) this.die(game);
    }

    /** Mega Kamui portal splash: a silent execute, no 9999 damage number. */
    kamuiSplash(amount, game, fromX, fromY) {
      if (!this.alive || this.banishing) return;
      if (amount >= this.hp) {
        this.hp = 0;
        this.hitFlash = 0.13;
        this.showHp = 1.8;
        this.die(game);
        return;
      }
      this.takeDamage(amount, game, fromX, fromY, 130);
    }

    die(game) {
      this.alive = false;
      this.dead = true;
      game.spawnParticles(this.x, this.y - 10, this.stats.stationary ? 16 : 12, {
        color: this.stats.deathColor || "#8fd469",
        speed: this.stats.stationary ? 140 : 120,
        life: 0.45,
        size: 2,
        spread: 2.8,
        drag: 2,
      });
      game.spawnParticles(this.x, this.y - 10, 6, {
        color: "#ffffff",
        speed: 80,
        life: 0.2,
        size: 1,
        spread: 2.4,
        glow: true,
      });
      game.shake(1.8, 0.16);
      game.sfx("kill");
      game.onEnemyKilled(this);
    }

    /** Sagittal-axis spin + shrink into the Kamui vortex, then a silent pop. */
    drawBanish(ctx, game) {
      const isTurret = !!this.stats.stationary;
      const p = clamp(this.banishT / Math.max(0.001, this.banishDur), 0, 1);
      const turn = Math.cos(p * Math.PI * 2);
      const shrink = 1 - p * 0.86;
      let sx = turn * shrink;
      if (Math.abs(sx) < 0.05) sx = sx < 0 ? -0.05 : 0.05;
      const sy = Math.max(0.08, shrink);
      const x = Math.round(this.x);
      const y = Math.round(this.y);
      const sprite = SK.Sprites.get(this.stats.sprite);
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 13);

      drawShadow(ctx, this.x, this.y, Math.round((isTurret ? 15 : 13) * Math.max(0.3, shrink)));

      // Violet event-horizon rim hugging the shrinking body.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = (0.24 + p * 0.4) * (0.7 + pulse * 0.3);
      ctx.strokeStyle = "#a78bfa";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y - 10 * sy, 9 + 8 * shrink, 12 + 10 * shrink, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (0.16 + p * 0.3) * (0.6 + pulse * 0.4);
      ctx.strokeStyle = "#050508";
      ctx.beginPath();
      ctx.ellipse(x, y - 10 * sy, 13 + 10 * shrink, 17 + 12 * shrink, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Four warped gravity ribbons orbiting the target.
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const a = game.time * (3.2 + i * 0.8) + (i * Math.PI) / 2;
        const rr = 12 + i * 4 + (1 - shrink) * 10;
        ctx.globalAlpha = 0.22 + 0.3 * shrink;
        ctx.fillStyle = i % 2 === 0 ? "#c4b5fd" : "#050508";
        ctx.fillRect(
          Math.round(x + Math.cos(a) * rr),
          Math.round(y - 10 * sy + Math.sin(a) * rr * 0.72),
          i % 2 === 0 ? 1 : 2,
          1
        );
      }
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 1 - p * 0.08;
      ctx.translate(x, y);
      ctx.scale(this.facing * sx, sy);
      if (isTurret) ctx.drawImage(sprite, -9, -20);
      else ctx.drawImage(sprite, -10, -20);
      ctx.restore();
    }

    draw(ctx, game) {
      if (!this.alive) return;
      if (this.banishing) {
        this.drawBanish(ctx, game);
        return;
      }
      const isTurret = !!this.stats.stationary;
      drawShadow(ctx, this.x, this.y, isTurret ? 15 : 13);
      const bob = isTurret ? 0 : Math.round(Math.sin(this.bobT * 3.4) * (this.active ? 0.9 : 0.35));
      const x = Math.round(this.x);
      const y = Math.round(this.y + bob);
      const sprite = SK.Sprites.get(this.stats.sprite);
      const flash = SK.Sprites.getFlash(this.stats.sprite);

      ctx.save();
      if (!this.active) ctx.globalAlpha = 0.86;
      ctx.translate(x, y);
      ctx.scale(this.facing, 1);
      if (isTurret) ctx.drawImage(sprite, -9, -20);
      else ctx.drawImage(sprite, -10, -20);
      if (this.hitFlash > 0 && flash) {
        ctx.globalAlpha = Math.min(0.9, this.hitFlash * 7);
        if (isTurret) ctx.drawImage(flash, -9, -20);
        else ctx.drawImage(flash, -10, -20);
      }
      ctx.restore();

      if (isTurret) {
        // Crystal core glow plus a readable expanding telegraph ring.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const charging = this.charge > 0;
        const pulse = 0.5 + 0.5 * Math.sin(game.time * 3.2 + this.bobT);
        ctx.globalAlpha = this.active ? (charging ? 0.75 : 0.32 + pulse * 0.18) : 0.15;
        ctx.fillStyle = charging ? "#ffc6fb" : "#d06bff";
        ctx.fillRect(x - 3, y - 17, 7, 6);
        ctx.fillRect(x - 2, y - 18, 5, 8);
        ctx.fillStyle = "#ffe6ff";
        ctx.fillRect(x - 1, y - 16, 2, 3);
        if (charging) {
          const p = clamp(1 - this.charge / this.chargeMax, 0, 1);
          const blink = 0.35 + 0.65 * Math.abs(Math.sin(game.time * 26 + this.bobT));
          const radius = 13 + p * 9;
          ctx.globalAlpha = 0.28 + p * 0.55;
          ctx.fillStyle = "#e879f9";
          for (let i = 0; i < 26; i++) {
            const a = (i / 26) * Math.PI * 2;
            if (i % 3 === 0) continue;
            ctx.fillRect(
              Math.round(x + Math.cos(a) * radius),
              Math.round(y - 10 + Math.sin(a) * radius * 0.55),
              1,
              1
            );
          }
          // Bright core flash: the clearest "about to fire" signal.
          ctx.globalAlpha = blink * 0.85;
          ctx.fillStyle = "#ffe6ff";
          ctx.fillRect(x - 3, y - 18, 7, 7);
          ctx.fillRect(x - 2, y - 19, 5, 9);
        }
        ctx.restore();
      } else if (this.active) {
        // Eye glow, kept to the exact 1x2 eye pixels in the baked art.
        const eyeColor = this.type === "shaman" ? "#ffe45c" : "#ff5a4a";
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(game.time * 8 + this.bobT);
        ctx.fillStyle = eyeColor;
        const dir = this.facing < 0 ? -1 : 1;
        const eyeY = this.type === "shaman" ? y - 13 : y - 14;
        const eyeXs = this.type === "shaman" ? [-3, 1] : [-2, 3];
        ctx.fillRect(x + eyeXs[0] * dir, eyeY, 1, 2);
        ctx.fillRect(x + eyeXs[1] * dir, eyeY, 1, 2);
        ctx.restore();
      }

      if (this.showHp > 0) {
        drawHealthBar(ctx, this.x, this.y - (isTurret ? 28 : 26), 16, this.hp / this.maxHp);
      }

      if (this.alert > 0) {
        const bounce = Math.abs(Math.sin(this.alert * 10)) * 3;
        SK.PixelFont.draw(ctx, "!", x, y - (isTurret ? 38 : 34) - bounce, {
          color: "#ff4f5e",
          scale: 2,
          shadow: "#0a0c12",
          align: "center",
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Crates
  // -------------------------------------------------------------------------
  class Crate {
    constructor(tileX, tileY) {
      this.tx = tileX;
      this.ty = tileY;
      this.x = tileX * TILE;
      this.y = tileY * TILE;
      this.w = 16;
      this.h = 16;
      this.hp = 6;
      this.maxHp = 6;
      this.dead = false;
      this.hitFlash = 0;
      this.shakeT = 0;
      this.offsetX = 0;
      this.offsetY = 0;
      this.dropRoll = Math.random();
    }

    getRect() {
      // Inset for player/enemy movement so corners feel forgiving.
      return { x: this.x + 1, y: this.y + 1, w: 14, h: 14 };
    }

    getHitRect() {
      // Projectiles use the full visual bounds so chest-height shots can hit.
      return { x: this.x, y: this.y, w: 16, h: 16 };
    }

    hit(amount, game, angle) {
      if (this.dead) return;
      this.hp -= amount;
      this.hitFlash = 0.1;
      this.shakeT = 0.12;
      const dir = angle == null ? Math.random() * Math.PI * 2 : angle + Math.PI;
      this.offsetX = Math.cos(dir) * 2;
      this.offsetY = Math.sin(dir) * 1;
      game.spawnParticles(this.x + 8, this.y + 8, 4, {
        color: "#c49a63",
        speed: 90,
        life: 0.35,
        size: 2,
        spread: 2.2,
        drag: 4,
      });
      game.spawnParticles(this.x + 8, this.y + 8, 2, {
        color: "#8a613c",
        speed: 55,
        life: 0.28,
        size: 2,
        spread: 2,
        drag: 4,
      });
      game.sfx("crateHit");
      if (this.hp <= 0) this.break(game);
    }

    break(game) {
      if (this.dead) return;
      this.dead = true;
      game.spawnParticles(this.x + 8, this.y + 8, 12, {
        color: "#a97d4e",
        speed: 120,
        life: 0.5,
        size: 2,
        spread: 2.8,
        drag: 2.5,
      });
      game.spawnParticles(this.x + 8, this.y + 8, 6, {
        color: "#5e3f26",
        speed: 85,
        life: 0.4,
        size: 3,
        spread: 2.4,
        drag: 3,
      });
      game.spawnParticles(this.x + 8, this.y + 8, 4, {
        color: "#d9b57f",
        speed: 100,
        life: 0.25,
        size: 1,
        spread: 2,
        glow: true,
      });
      game.shake(2, 0.14);
      game.sfx("crateBreak");
      // Crate drops.
      if (this.dropRoll < 0.55) game.spawnPickups(this.x + 8, this.y + 8, "energy", 1, 12);
      else if (this.dropRoll < 0.68) game.spawnPickups(this.x + 8, this.y + 8, "energy", 2, 8);
      game.onCrateBroken(this);
    }

    update(dt) {
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      if (this.shakeT > 0) {
        this.shakeT = Math.max(0, this.shakeT - dt);
        this.offsetX *= 0.82;
        this.offsetY *= 0.82;
      } else {
        this.offsetX = 0;
        this.offsetY = 0;
      }
    }

    draw(ctx) {
      if (this.dead) return;
      const x = Math.round(this.x + this.offsetX);
      const y = Math.round(this.y + this.offsetY);
      // contact shadow
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "#000000";
      ctx.fillRect(x + 2, y + 14, 12, 2);
      ctx.restore();
      ctx.drawImage(SK.Sprites.get("crate"), x, y);
      if (this.hitFlash > 0) {
        const flash = SK.Sprites.getFlash("crate");
        if (flash) {
          ctx.save();
          ctx.globalAlpha = Math.min(0.85, this.hitFlash * 8);
          ctx.drawImage(flash, x, y);
          ctx.restore();
        }
      }
      // Damage cracks.
      if (this.hp < this.maxHp) {
        ctx.save();
        ctx.fillStyle = "#3d2816";
        ctx.fillRect(x + 5, y + 5, 1, 3);
        ctx.fillRect(x + 4, y + 8, 2, 1);
        if (this.hp <= 3) {
          ctx.fillRect(x + 10, y + 10, 3, 1);
          ctx.fillRect(x + 11, y + 11, 1, 2);
        }
        ctx.restore();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Chest
  // -------------------------------------------------------------------------
  class Chest {
    constructor(centerX, centerY, opts) {
      opts = opts || {};
      this.x = centerX;
      this.y = centerY;
      this.opened = false;
      this.spawnT = 0;
      this.pulse = Math.random() * 7;
      this.dead = false;
      this.gold = !!opts.gold;
      this.containsGem = !!opts.containsGem;
    }

    update(dt, game) {
      this.spawnT += dt;
      this.pulse += dt;
      if (this.opened) return;
      const p = game.player;
      if (!p || !p.alive) return;
      const rect = p.getRect();
      if (rectsOverlap(rect.x, rect.y, rect.w, rect.h, this.x - 8, this.y - 12, 16, 14)) {
        this.open(game);
      }
    }

    open(game) {
      if (this.opened) return;
      this.opened = true;
      game.sfx(this.gold ? "treasure" : "chest");
      game.shake(this.gold ? 2.4 : 1.2, this.gold ? 0.24 : 0.14);

      const n = this.gold ? 6 + Math.floor(Math.random() * 2) : 4 + Math.floor(Math.random() * 3);
      game.spawnPickups(this.x, this.y - 6, "energy", n, 60);

      if (this.containsGem) {
        // Combat reward chests have a 45% chance to spill one persistent Gem.
        game.spawnGem(this.x, this.y - 8, { toss: true });
      }

      if (this.gold) {
        // Gold treasure chests always contain an Uncommon-Legendary weapon.
        const def = randomWeapon("gold");
        game.dropWeapon(def, this.x, this.y - 2, { toss: true, tossSpeed: 30 });
      } else if (Math.random() < 0.5) {
        game.spawnPickups(this.x + 2, this.y - 8, "hp", 1, 25);
      } else {
        // Combat chests can also drop a weapon weighted toward lower rarities.
        const def = randomWeapon("combat");
        game.dropWeapon(def, this.x, this.y - 2, { toss: true, tossSpeed: 24 });
      }

      game.spawnParticles(this.x, this.y - 8, this.gold ? 24 : 16, {
        color: this.gold ? "#ffe08a" : "#ffd86b",
        speed: this.gold ? 140 : 110,
        life: 0.55,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2,
      });
      game.onChestOpened(this);
    }

    draw(ctx, game) {
      const drop = clamp(this.spawnT / 0.36, 0, 1);
      const ease = 1 - Math.pow(1 - drop, 3);
      const offY = (1 - ease) * -16;
      const bounce = drop >= 1 ? 0 : Math.sin(drop * Math.PI) * 2;
      const x = Math.round(this.x - 8);
      const y = Math.round(this.y - 14 + offY - bounce);
      drawShadow(ctx, this.x, this.y, 14);
      if (!this.opened) {
        const pulse = 0.45 + 0.3 * Math.sin(this.pulse * 3);
        const glowCol = this.gold ? "255,224,120" : "255,205,90";
        const glowR = this.gold ? 26 : 20;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(this.x, this.y - 8, 2, this.x, this.y - 8, glowR);
        glow.addColorStop(0, "rgba(" + glowCol + "," + ((this.gold ? 0.34 : 0.22) * pulse).toFixed(3) + ")");
        glow.addColorStop(1, "rgba(" + glowCol + ",0)");
        ctx.fillStyle = glow;
        ctx.fillRect(this.x - glowR - 4, this.y - glowR - 10, (glowR + 4) * 2, (glowR + 4) * 2);
        ctx.restore();
        const glint = Math.floor(this.pulse * (this.gold ? 4 : 3)) % (this.gold ? 3 : 5);
        if (glint === 0) {
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = "#fff3b0";
          ctx.fillRect(x + 11, y + 2, 1, 1);
          ctx.fillRect(x + 10, y + 3, 3, 1);
          if (this.gold) {
            ctx.fillRect(x + 3, y + 8, 1, 1);
            ctx.fillRect(x + 2, y + 9, 3, 1);
          }
          ctx.restore();
        }
      }
      const sprite = this.gold
        ? this.opened
          ? "chestGoldOpen"
          : "chestGold"
        : this.opened
        ? "chestOpen"
        : "chest";
      ctx.drawImage(SK.Sprites.get(sprite), x, y);
    }
  }

  // -------------------------------------------------------------------------
  // Ground weapon loot (bobbing floor pickup with a rarity nameplate)
  // -------------------------------------------------------------------------
  class GroundWeapon {
    constructor(weapon, x, y, opts) {
      opts = opts || {};
      this.weapon = weapon;
      this.x = x;
      this.y = y;
      this.vx = opts.vx || 0;
      this.vy = opts.vy || 0;
      this.spawnT = 0;
      this.bobT = Math.random() * Math.PI * 2;
      this.dead = false;
    }

    update(dt, game) {
      if (this.dead) return;
      this.spawnT += dt;
      this.bobT += dt * 2.2;
      if (this.vx !== 0 || this.vy !== 0) {
        const nx = this.x + this.vx * dt;
        const ny = this.y + this.vy * dt;
        if (game.dungeon.isSolidPixel(nx, ny - 3)) {
          this.vx *= -0.35;
          this.vy *= -0.35;
        } else {
          this.x = nx;
          this.y = ny;
        }
        const damp = Math.pow(0.004, dt);
        this.vx *= damp;
        this.vy *= damp;
        if (Math.abs(this.vx) < 2) this.vx = 0;
        if (Math.abs(this.vy) < 2) this.vy = 0;
      }
    }

    nearPlayer(player, range) {
      if (!player || !player.alive) return false;
      const r = range == null ? 22 : range;
      return Math.hypot(player.x - this.x, player.y - 4 - this.y) <= r;
    }

    draw(ctx, game) {
      if (this.dead) return;
      const spr = SK.Sprites.get(this.weapon.sprite);
      const rarity = RARITY[this.weapon.rarity] || RARITY.common;
      const bob = Math.round(Math.sin(this.bobT) * 1.2);
      const cx = Math.round(this.x);
      const topY = Math.round(this.y - spr.height - 2 + bob);
      const midY = Math.round(this.y - spr.height / 2 + bob);

      // Contact shadow.
      drawShadow(ctx, this.x, this.y, Math.max(10, Math.round(spr.width * 0.45)));

      // Rarity floor glow + pixel ring.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const pulse = 0.5 + 0.5 * Math.sin(this.bobT * 1.4);
      const glowR = Math.max(18, Math.round(spr.width * 0.6));
      const glow = ctx.createRadialGradient(cx, this.y - 4, 1, cx, this.y - 4, glowR);
      glow.addColorStop(0, "rgba(" + rarity.rgb + "," + (0.28 + pulse * 0.1).toFixed(3) + ")");
      glow.addColorStop(1, "rgba(" + rarity.rgb + ",0)");
      ctx.fillStyle = glow;
      ctx.fillRect(cx - glowR, Math.round(this.y) - glowR, glowR * 2, glowR * 2);
      const ringR = Math.max(10, Math.round(spr.width * 0.32));
      ctx.globalAlpha = 0.3 + pulse * 0.22;
      ctx.fillStyle = rarity.color;
      for (let i = 0; i < 22; i++) {
        if (i % 4 === 0) continue;
        const a = (i / 22) * Math.PI * 2;
        ctx.fillRect(
          Math.round(cx + Math.cos(a) * ringR),
          Math.round(this.y - 1 + Math.sin(a) * ringR * 0.34),
          1,
          1
        );
      }
      ctx.restore();

      ctx.drawImage(spr, Math.round(this.x - spr.width / 2), topY);

      // Rare sparkle so loot reads even before the nameplate.
      if (Math.floor(this.bobT * 1.5) % 5 === 0) {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(cx + Math.round(spr.width * 0.33), midY - 3, 1, 1);
        ctx.fillRect(cx + Math.round(spr.width * 0.33) - 1, midY - 2, 3, 1);
        ctx.restore();
      }
    }

    drawNameplate(ctx, game) {
      if (this.dead) return;
      const spr = SK.Sprites.get(this.weapon.sprite);
      const rarity = RARITY[this.weapon.rarity] || RARITY.common;
      const bob = Math.round(Math.sin(this.bobT) * 1.2);
      const label = "[E] " + this.weapon.name;
      const w = SK.PixelFont.measure(label, { scale: 1 }) + 12;
      const h = 12;
      const x = Math.round(this.x - w / 2);
      const y = Math.round(this.y - spr.height - 2 + bob - h - 4);
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);

      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "#080b11";
      ctx.fillRect(x + 1, y, w - 2, h);
      ctx.fillRect(x, y + 1, w, h - 2);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = rarity.color;
      ctx.fillRect(x + 1, y, w - 2, 1);
      ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
      ctx.globalAlpha = 0.1 + pulse * 0.12;
      ctx.fillStyle = rarity.color;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.restore();

      SK.PixelFont.draw(ctx, label, Math.round(this.x), y + 2, {
        color: rarity.color,
        align: "center",
        shadow: "#05070b",
      });
    }
  }

  // -------------------------------------------------------------------------
  // Pickups
  // -------------------------------------------------------------------------
  class Pickup {
    constructor(type, x, y, value, vx, vy) {
      this.type = type; // 'energy' | 'hp' | 'gem'
      this.x = x;
      this.y = y;
      this.value = type === "gem" ? 1 : value;
      this.vx = vx || 0;
      this.vy = vy || 0;
      this.spawnT = 0;
      this.dead = false;
      this.magnet = false;
      this.bob = Math.random() * Math.PI * 2;
      this.collectFlash = 0;
    }

    update(dt, game) {
      if (this.dead) return;
      this.spawnT += dt;
      this.bob += dt * 3;
      const p = game.player;
      if (!p || !p.alive) return;

      // initial pop
      if (Math.hypot(this.vx, this.vy) > 2) {
        const nx = this.x + this.vx * dt;
        const ny = this.y + this.vy * dt;
        if (!game.dungeon.isSolidPixel(nx, ny)) {
          this.x = nx;
          this.y = ny;
        } else {
          this.vx *= -0.35;
          this.vy *= -0.35;
        }
        const damp = Math.pow(0.02, dt);
        this.vx *= damp;
        this.vy *= damp;
      }

      const dx = p.x - this.x;
      const dy = p.y - 10 - this.y;
      const dist = Math.hypot(dx, dy);
      const magnetRange = this.type === "hp" ? 42 : this.type === "gem" ? 88 : 74;
      if (this.spawnT > 0.28 && dist < magnetRange) {
        this.magnet = true;
        const accel = this.type === "hp" ? 380 : this.type === "gem" ? 560 : 520;
        const maxSpeed = this.type === "hp" ? 130 : this.type === "gem" ? 250 : 230;
        const speed = Math.min(maxSpeed, 60 + this.spawnT * accel);
        this.x += (dx / dist) * speed * dt;
        this.y += (dy / dist) * speed * dt;
        if (Math.random() < 0.3) {
          game.spawnParticles(this.x, this.y, 1, {
            color: this.type === "hp" ? "#ff8888" : this.type === "gem" ? "#22d3ee" : "#74e8ff",
            speed: 8,
            life: 0.18,
            size: 1,
            glow: true,
          });
        }
      }

      if (dist < 7 && this.spawnT > 0.2) {
        if (this.type === "energy") {
          const gained = p.addEnergy(this.value);
          if (gained > 0) {
            game.addFloatText(p.x, p.y - 30, "+" + gained + " EN", "#ffe45c", { scale: 1, rise: 16 });
          }
          game.sfx("pickup");
          this.dead = true;
        } else if (this.type === "gem") {
          game.collectGem(this);
          this.dead = true;
        } else {
          if (p.hp < p.maxHp) {
            const gained = p.heal(this.value);
            game.addFloatText(p.x, p.y - 30, "+" + gained + " HP", "#ff7b86", { scale: 1, rise: 16 });
            game.sfx("potion");
            game.spawnParticles(this.x, this.y, 8, {
              color: "#ff7b86",
              speed: 80,
              life: 0.35,
              size: 1,
              spread: 2.2,
              glow: true,
            });
            this.dead = true;
          }
        }
      }
    }

    draw(ctx, game) {
      if (this.dead) return;
      const bobY = Math.sin(this.bob) * 1.5;
      const x = Math.round(this.x);
      const y = Math.round(this.y + bobY);
      drawShadow(ctx, this.x, this.y + 3, this.type === "hp" ? 7 : this.type === "gem" ? 8 : 6);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const col =
        this.type === "hp"
          ? "rgba(255,70,90,0.2)"
          : this.type === "gem"
          ? "rgba(180,90,255,0.28)"
          : "rgba(80,210,255,0.24)";
      const glow = ctx.createRadialGradient(x, y - 4, 1, x, y - 4, this.type === "gem" ? 14 : 12);
      glow.addColorStop(0, col);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 15, y - 19, 30, 30);
      ctx.restore();

      if (this.type === "hp") {
        ctx.drawImage(SK.Sprites.get("potion"), x - 4, y - 12);
      } else if (this.type === "gem") {
        ctx.drawImage(SK.Sprites.get("gem"), x - 5, y - 10);
        // Bright animated specular sparkle.
        const sparkle = 0.5 + 0.5 * Math.sin(this.bob * 2.7 + 0.6);
        if (sparkle > 0.45) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (sparkle - 0.45) / 0.55;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x + 2, y - 9, 1, 1);
          ctx.fillRect(x + 1, y - 8, 3, 1);
          ctx.fillRect(x + 2, y - 7, 1, 1);
          ctx.fillStyle = "#e879f9";
          ctx.fillRect(x - 4, y - 4, 1, 1);
          ctx.fillStyle = "#a5f3fc";
          ctx.fillRect(x + 4, y - 4, 1, 1);
          ctx.restore();
        }
      } else {
        ctx.drawImage(SK.Sprites.get("orb"), x - 4, y - 8);
        const sparkle = Math.sin(this.bob * 2.1 + 1);
        if (sparkle > 0.75) {
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = "#e8feff";
          ctx.fillRect(x + 2, y - 10, 1, 1);
          ctx.restore();
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Particles / floating text
  // -------------------------------------------------------------------------
  class Particle {
    constructor(x, y, vx, vy, life, color, size, opts) {
      opts = opts || {};
      this.x = x;
      this.y = y;
      this.vx = vx;
      this.vy = vy;
      this.life = life;
      this.maxLife = life;
      this.color = color;
      this.size = size || 1;
      this.glow = !!opts.glow;
      this.drag = opts.drag == null ? 2 : opts.drag;
      this.gravity = opts.gravity || 0;
      this.dead = false;
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) {
        this.dead = true;
        return;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vy += this.gravity * dt;
      const damp = Math.pow(0.001, this.drag * dt);
      this.vx *= damp;
      this.vy *= damp;
    }

    draw(ctx) {
      const a = Math.max(0, this.life / this.maxLife);
      const s = Math.max(1, Math.round(this.size * (0.5 + a * 0.5)));
      ctx.save();
      if (this.glow) ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.fillRect(Math.round(this.x), Math.round(this.y), s, s);
      ctx.restore();
    }
  }

  class FloatText {
    constructor(x, y, text, color, opts) {
      opts = opts || {};
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color || "#ffffff";
      this.life = opts.life || 0.8;
      this.maxLife = this.life;
      this.vy = -(opts.rise || 18);
      this.scale = opts.scale || 1;
      this.dead = false;
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
      this.y += this.vy * dt;
      this.vy *= Math.pow(0.2, dt);
    }

    draw(ctx) {
      const a = clamp(this.life / this.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a < 0.25 ? a / 0.25 : 1;
      SK.PixelFont.draw(ctx, this.text, Math.round(this.x), Math.round(this.y), {
        color: this.color,
        scale: this.scale,
        shadow: "#0a0c12",
        align: "center",
      });
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Milestone 3 — skill effects, Sky Meteor and Gravity Wells
  // -------------------------------------------------------------------------
  function fillPixelCircle(ctx, cx, cy, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      const yy = r * r - dy * dy;
      if (yy < 0) continue;
      const half = Math.sqrt(yy);
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), Math.max(1, Math.round(half * 2)), 1);
    }
    ctx.restore();
  }

  function strokePixelCircle(ctx, cx, cy, r, color, alpha, thick) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    const ri = Math.ceil(r);
    const t = thick || 1;
    for (let dy = -ri; dy <= ri; dy++) {
      const yy = r * r - dy * dy;
      if (yy < 0) continue;
      const half = Math.sqrt(yy);
      if (Math.abs(dy) > r - t && Math.abs(dy) < r + t) {
        ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), Math.max(1, Math.round(half * 2)), 1);
      } else {
        ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), Math.max(1, Math.round(t)), 1);
        ctx.fillRect(Math.round(cx + half - t + 1), Math.round(cy + dy), Math.max(1, Math.round(t)), 1);
      }
    }
    ctx.restore();
  }

  class RingPulse {
    constructor(x, y, opts) {
      opts = opts || {};
      this.x = x;
      this.y = y;
      this.life = opts.life || 0.5;
      this.maxLife = this.life;
      this.r0 = opts.r0 == null ? 6 : opts.r0;
      this.r1 = opts.r1 == null ? 40 : opts.r1;
      this.yScale = opts.yScale == null ? 0.65 : opts.yScale;
      this.colors = opts.colors || ["#ffffff", "#a855f7"];
      this.thickness = opts.thickness || 1;
      this.layer = opts.layer || "over";
      this.dead = false;
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }

    draw(ctx) {
      const p = clamp(1 - this.life / this.maxLife, 0, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      const r = this.r0 + (this.r1 - this.r0) * ease;
      const alpha = (1 - p) * 0.9;
      const n = this.colors.length;
      for (let i = 0; i < n; i++) {
        const rr = Math.max(1, r - i * 2.2);
        const col = this.colors[i] || this.colors[0];
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1, this.yScale);
        strokePixelCircle(ctx, 0, 0, rr, col, alpha * (1 - i / (n + 1)), this.thickness);
        ctx.restore();
      }
    }
  }

  class SingularityPop {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.life = 0.34;
      this.maxLife = this.life;
      this.layer = "over";
      this.dead = false;
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }

    draw(ctx) {
      const p = clamp(1 - this.life / this.maxLife, 0, 1);
      const x = this.x;
      const y = this.y;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // Brief imploding black core.
      const coreR = 5 * (1 - p * 1.6);
      if (coreR > 0.6) fillPixelCircle(ctx, x, y, coreR, "#030108", 0.95);
      // Expanding purple-and-white shock pop.
      strokePixelCircle(ctx, x, y, 3 + p * 11, "#c084fc", (1 - p) * 0.9, 1);
      strokePixelCircle(ctx, x, y, 1 + p * 7, "#f5d0fe", (1 - p) * 0.8, 1);
      // Ten radial violet/white sparks.
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + p * 0.6;
        const dist = 4 + p * 13;
        ctx.globalAlpha = (1 - p) * 0.95;
        ctx.fillStyle = i % 2 === 0 ? "#e879f9" : "#ffffff";
        ctx.fillRect(Math.round(x + Math.cos(a) * dist), Math.round(y + Math.sin(a) * dist), i % 3 === 0 ? 2 : 1, 1);
      }
      ctx.restore();
    }
  }

  class Crater {
    constructor(x, y) {
      this.x = x;
      this.y = y;
      this.life = 2.6;
      this.maxLife = this.life;
      this.seed = Math.random() * 1000;
      this.layer = "ground";
      this.dead = false;
    }

    update(dt) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }

    draw(ctx) {
      const a = clamp(this.life / this.maxLife, 0, 1) * 0.72;
      const x = this.x;
      const y = this.y;
      const rx = 18;
      const ry = 7;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "#120a08";
      for (let dy = -ry; dy <= ry; dy++) {
        const t = 1 - (dy * dy) / (ry * ry);
        if (t <= 0) continue;
        const w = Math.round(rx * Math.sqrt(t));
        ctx.fillRect(x - w, y + dy, w * 2, 1);
      }
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = "#2a120e";
      for (let dy = -ry + 2; dy <= ry - 2; dy++) {
        const t = 1 - (dy * dy) / ((ry - 2) * (ry - 2));
        if (t <= 0) continue;
        const w = Math.round((rx - 4) * Math.sqrt(t));
        ctx.fillRect(x - w, y + dy, w * 2, 1);
      }
      // Jagged cooling cracks.
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = "#3b1a10";
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + this.seed;
        const len = 9 + (i % 3) * 4;
        for (let d = 4; d < len; d += 2) {
          ctx.fillRect(
            Math.round(x + Math.cos(ang) * d),
            Math.round(y + Math.sin(ang) * d * 0.42),
            d > len - 4 ? 2 : 1,
            1
          );
        }
      }
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = "#fb923c";
      ctx.fillRect(x - 2, y - 1, 2, 1);
      ctx.fillRect(x + 5, y + 2, 1, 1);
      ctx.restore();
    }
  }

  class SkyMeteor {
    constructor(targetX, targetY, cfg) {
      this.targetX = targetX;
      this.targetY = targetY;
      this.cfg = cfg;
      this.x0 = targetX + 75;
      this.y0 = targetY - 230;
      this.x = this.x0;
      this.y = this.y0;
      this.t = 0;
      this.duration = cfg.fallTime || 0.42;
      this.rotation = 0;
      this.emberT = 0;
      this.layer = "over";
      this.dead = false;
    }

    update(dt, game) {
      if (this.dead) return;
      this.t += dt;
      const p = clamp(this.t / this.duration, 0, 1);
      const ease = p * p * (1.15 - 0.15 * p);
      this.x = this.x0 + (this.targetX - this.x0) * ease;
      this.y = this.y0 + (this.targetY - this.y0) * ease;
      this.rotation += dt * 2.4;
      this.emberT -= dt;
      if (this.emberT <= 0) {
        this.emberT = 0.018;
        const col = Math.random() < 0.5 ? "#a855f7" : "#fb923c";
        game.spawnParticles(this.x + (Math.random() * 8 - 4), this.y + (Math.random() * 8 - 4), 1, {
          color: Math.random() < 0.25 ? "#f5d0fe" : col,
          speed: 24,
          life: 0.3,
          size: 1,
          spread: 2.4,
          glow: true,
          drag: 2,
        });
      }
      if (this.t >= this.duration) {
        game.meteorImpact(this.targetX, this.targetY, this.cfg);
        this.dead = true;
      }
    }

    drawTelegraph(ctx, game) {
      const x = this.targetX;
      const y = this.targetY;
      const p = clamp(this.t / this.duration, 0, 1);
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 18);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, 0.58);
      ctx.globalCompositeOperation = "lighter";
      // Dark target disc under the reticle.
      fillPixelCircle(ctx, 0, 0, 20, "#160b1e", 0.34 + p * 0.2);
      // Concentric purple/crimson rings.
      strokePixelCircle(ctx, 0, 0, 15 + pulse * 1.5, "#a855f7", 0.6 + pulse * 0.25, 1);
      strokePixelCircle(ctx, 0, 0, 10 + (1 - pulse) * 1.5, "#ff3b5c", 0.7, 1);
      strokePixelCircle(ctx, 0, 0, 5 + p * 2, "#f5d0fe", 0.55, 1);
      // Rotating target ticks.
      ctx.fillStyle = "#e879f9";
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) {
        const a = game.time * 1.8 + (i * Math.PI) / 2;
        ctx.fillRect(Math.round(Math.cos(a) * 18) - 1, Math.round(Math.sin(a) * 18), 3, 1);
        ctx.fillRect(Math.round(Math.cos(a) * 13), Math.round(Math.sin(a) * 13) - 1, 1, 3);
      }
      // Crosshair.
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-1, -21, 2, 4);
      ctx.fillRect(-1, 17, 2, 4);
      ctx.fillRect(-21, -1, 4, 2);
      ctx.fillRect(17, -1, 4, 2);
      ctx.restore();
    }

    draw(ctx, game) {
      this.drawTelegraph(ctx, game);

      const dx = this.targetX - this.x0;
      const dy = this.targetY - this.y0;
      const ang = Math.atan2(dy, dx);
      const x = Math.round(this.x);
      const y = Math.round(this.y);
      const flick = 0.82 + 0.18 * Math.sin(game.time * 31);

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      // Deep purple ambient glow around the falling star.
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 30);
      glow.addColorStop(0, "rgba(216,180,254,0.5)");
      glow.addColorStop(0.4, "rgba(126,34,206,0.25)");
      glow.addColorStop(1, "rgba(76,29,149,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 34, y - 34, 68, 68);

      // Multi-layer plasma / fire tail trailing opposite the fall vector.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + Math.PI);
      const layers = [
        { len: 56, w: 13, col: "rgba(126,34,206,0.55)" },
        { len: 42, w: 9, col: "rgba(216,180,254,0.72)" },
        { len: 27, w: 5, col: "rgba(255,255,255,0.95)" },
      ];
      for (let l = 0; l < layers.length; l++) {
        const L = layers[l];
        const segs = 16;
        for (let i = 0; i < segs; i++) {
          const t = i / segs;
          const w = Math.max(1, Math.round(L.w * (1 - t) * (1 - t * 0.35)));
          ctx.globalAlpha = (0.35 + 0.65 * (1 - t)) * flick * (l === 2 ? 0.95 : 0.8);
          ctx.fillStyle = L.col;
          ctx.fillRect(Math.round(4 + t * L.len), -Math.round(w / 2) + (Math.sin(game.time * 26 + i * 1.7 + l) > 0 ? 1 : 0), 4, w);
        }
      }
      // Ember pixels shedding off the tail.
      for (let i = 0; i < 9; i++) {
        const t = ((game.time * 2.6 + i * 0.19) % 1);
        const ex = 6 + t * 52;
        const ey = Math.sin(game.time * 17 + i * 2.3) * (3 + t * 5);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.fillStyle = i % 3 === 0 ? "#fb923c" : i % 3 === 1 ? "#e879f9" : "#f5d0fe";
        ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
      }
      ctx.restore();

      // Jagged cosmic-obsidian rock.
      ctx.globalAlpha = 1;
      ctx.translate(x, y);
      ctx.rotate(Math.sin(this.rotation) * 0.22);
      const rock = SK.Sprites.get("meteorRock");
      ctx.drawImage(rock, -9, -9);
      ctx.globalAlpha = 0.5 + 0.3 * flick;
      ctx.fillStyle = "#f5d0fe";
      ctx.fillRect(-2, -7, 1, 1);
      ctx.fillRect(3, 2, 1, 1);
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Gravity visual helpers (cel-shaded tapered ribbons / arcs)
  // -------------------------------------------------------------------------
  function drawTaperedRibbon(ctx, p0, cp, p1, wMax, fill) {
    const steps = 28;
    const left = [];
    const right = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const it = 1 - t;
      const x = it * it * p0.x + 2 * it * t * cp.x + t * t * p1.x;
      const y = it * it * p0.y + 2 * it * t * cp.y + t * t * p1.y;
      const dx = 2 * it * (cp.x - p0.x) + 2 * t * (p1.x - cp.x);
      const dy = 2 * it * (cp.y - p0.y) + 2 * t * (p1.y - cp.y);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const w = (wMax * Math.sin(Math.PI * t)) / 2;
      left.push({ x: x + nx * w, y: y + ny * w });
      right.push({ x: x - nx * w, y: y - ny * w });
    }
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawTaperedArc(ctx, cx, cy, radius, a0, a1, wMax, fill) {
    const steps = 24;
    const left = [];
    const right = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + (a1 - a0) * t;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const px = cx + ca * radius;
      const py = cy + sa * radius;
      const w = (wMax * Math.sin(Math.PI * t)) / 2;
      left.push({ x: px + ca * w, y: py + sa * w });
      right.push({ x: px - ca * w, y: py - sa * w });
    }
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawTaperedArcBand(ctx, cx, cy, radius, a0, a1, thickMax, fill) {
    const steps = 26;
    const outer = [];
    const inner = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = a0 + (a1 - a0) * t;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const thick = thickMax * Math.sin(Math.PI * t);
      outer.push({ x: cx + ca * radius, y: cy + sa * radius });
      inner.push({ x: cx + ca * (radius - thick), y: cy + sa * (radius - thick) });
    }
    ctx.beginPath();
    ctx.moveTo(outer[0].x, outer[0].y);
    for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i].x, outer[i].y);
    for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i].x, inner[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  // -------------------------------------------------------------------------
  // Gravity orb — passive orbit only; it never homes or deals damage.
  // -------------------------------------------------------------------------
  class GravityOrb {
    constructor(wells, slot) {
      this.wells = wells;
      this.slot = slot;
      this.phase = Math.random() * Math.PI * 2;
      this.trail = [];
      this.spawnT = 0;
      this.mode = "orbit";
      this.reform = 0;
      this.target = null;
      this.vx = 0;
      this.vy = 0;
      const pt = this.orbitPoint();
      this.x = pt.x;
      this.y = pt.y;
      this.trail.push({ x: this.x, y: this.y });
    }

    orbitPoint() {
      const p = this.wells.player;
      const a = this.wells.orbitAngle + (this.slot * Math.PI * 2) / 3;
      return { x: p.x + Math.cos(a) * 26, y: p.y - 12 + Math.sin(a) * 26 };
    }

    pickTarget(targets) {
      if (!targets.length) return null;
      const counts = new Map();
      for (const other of this.wells.orbs) {
        if (other === this) continue;
        if (other.target && other.target.alive) {
          counts.set(other.target, (counts.get(other.target) || 0) + 1);
        }
      }
      let best = null;
      let bestScore = Infinity;
      for (const e of targets) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - this.x, e.y - 10 - this.y);
        const score = (counts.get(e) || 0) * 1000 + d;
        if (score < bestScore) {
          bestScore = score;
          best = e;
        }
      }
      return best;
    }

    update(dt, game, targets) {
      this.spawnT += dt;

      // When the skill is invoked, every orb stops attacking and is recalled
      // into the formation spiral. No collision/damage checks run here.
      if (this.wells.forming) {
        this.mode = "orbit";
        this.reform = 0;
        this.target = null;
        const f = this.wells.forming;
        const t = clamp(f.t / f.duration, 0, 1);
        const a = this.wells.orbitAngle + (this.slot * Math.PI * 2) / 3 + t * 5.2;
        const radius = 26 * (1 - t);
        const tx = f.x + Math.cos(a) * radius;
        const ty = f.y + Math.sin(a) * radius;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 12) this.trail.shift();
        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.hypot(dx, dy);
        const step = 900 * dt;
        if (d <= step || d < 0.01) {
          this.x = tx;
          this.y = ty;
        } else {
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
        }
        return;
      }

      if (this.reform > 0) {
        this.reform -= dt;
        if (this.reform <= 0) {
          const ideal = this.orbitPoint();
          this.x = ideal.x;
          this.y = ideal.y;
          this.vx = 0;
          this.vy = 0;
          this.trail = [{ x: this.x, y: this.y }];
          this.mode = "orbit";
          game.effects.push(
            new RingPulse(this.x, this.y, {
              life: 0.28,
              r0: 2,
              r1: 13,
              yScale: 1,
              colors: ["#e879f9", "#7c3aed"],
              thickness: 1,
            })
          );
        }
        return;
      }

      this.trail.push({ x: this.x, y: this.y });
      if (this.trail.length > 12) this.trail.shift();

      if (this.mode === "orbit") {
        const ideal = this.orbitPoint();
        this.x = ideal.x;
        this.y = ideal.y;
        this.vx = 0;
        this.vy = 0;
        if (targets.length > 0) {
          this.mode = "homing";
          this.target = this.pickTarget(targets);
        }
        return;
      }

      if (this.mode === "return") {
        if (targets.length > 0) {
          this.mode = "homing";
          this.target = this.pickTarget(targets);
          return;
        }
        const ideal = this.orbitPoint();
        const dx = ideal.x - this.x;
        const dy = ideal.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 4) {
          this.mode = "orbit";
          this.x = ideal.x;
          this.y = ideal.y;
        } else {
          this.x += (dx / d) * 250 * dt;
          this.y += (dy / d) * 250 * dt;
        }
        return;
      }

      // Passive homing. If nothing is visible, return to the orbit ring.
      if (targets.length === 0) {
        this.mode = "return";
        this.target = null;
        return;
      }
      if (!this.target || !this.target.alive || this.target.banishing || targets.indexOf(this.target) < 0) {
        this.target = this.pickTarget(targets);
      }
      if (!this.target) {
        this.mode = "return";
        return;
      }

      const tx = this.target.x;
      const ty = this.target.y - 10;
      const dx = tx - this.x;
      const dy = ty - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const desiredVx = (dx / d) * 210;
      const desiredVy = (dy / d) * 210;
      const k = Math.min(1, dt * 7.5);
      this.vx += (desiredVx - this.vx) * k;
      this.vy += (desiredVy - this.vy) * k;
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      // Passive attack: exactly 9 damage to one target, then reform.
      if (Math.hypot(tx - this.x, ty - this.y) < 12) {
        this.target.takeDamage(9, game, this.x, this.y, 30);
        game.effects.push(new SingularityPop(this.x, this.y));
        game.spawnParticles(this.x, this.y, 8, {
          color: "#e879f9",
          speed: 95,
          life: 0.28,
          size: 1,
          spread: 2.8,
          glow: true,
          drag: 3,
        });
        game.spawnParticles(this.x, this.y, 4, {
          color: "#ffffff",
          speed: 70,
          life: 0.2,
          size: 1,
          spread: 2.8,
          glow: true,
        });
        game.shake(1.2, 0.1);
        game.sfx("gravityPop");
        this.target = null;
        this.mode = "reform";
        this.reform = 0.75;
        this.trail = [];
      }
    }

    draw(ctx, game) {
      if (this.reform > 0 && !this.wells.forming) return;
      const x = this.x;
      const y = this.y;
      const t = game.time + this.phase;
      const pop = clamp(this.spawnT / 0.24, 0, 1);
      const scale = 0.2 + 0.8 * (1 - Math.pow(1 - pop, 3));

      // Purple ribbon trail (#d8b4fe -> #9333ea -> #3b0764).
      if (this.trail.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < this.trail.length; i++) {
          const pt = this.trail[i];
          const f = i / this.trail.length;
          const col = f < 0.4 ? "#3b0764" : f < 0.75 ? "#9333ea" : "#d8b4fe";
          ctx.globalAlpha = 0.1 + f * 0.55;
          ctx.fillStyle = col;
          const size = f > 0.7 ? 3 : f > 0.4 ? 2 : 1;
          ctx.fillRect(Math.round(pt.x - size / 2), Math.round(pt.y - size / 2), size, size);
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalCompositeOperation = "lighter";

      // 1. Outer swirling distortion halo + inward stardust specks.
      const haloR = 10 + Math.sin(t * 3.1) * 1.0;
      fillPixelCircle(ctx, 0, 0, haloR, "rgba(168,85,247,0.28)", 1);
      fillPixelCircle(ctx, 0, 0, haloR * 0.78, "rgba(192,132,252,0.12)", 1);
      for (let i = 0; i < 3; i++) {
        const a = t * 2.2 + (i * Math.PI * 2) / 3;
        const rr = 10.2 - ((t * 3.4 + i * 1.9) % 5.2);
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 5 + i);
        ctx.fillStyle = "#d8b4fe";
        ctx.fillRect(Math.round(Math.cos(a) * rr), Math.round(Math.sin(a) * rr), 1, 1);
      }

      // 2. Bright event-horizon ring.
      strokePixelCircle(ctx, 0, 0, 6, "#c084fc", 0.95, 1);
      strokePixelCircle(ctx, 0, 0, 6.8, "#f5d0fe", 0.45, 1);

      // 3. Pitch-black singularity core with a subtle pulse.
      const coreR = 4 + Math.sin(t * 4.6) * 0.45;
      fillPixelCircle(ctx, 0, 0, coreR, "#030108", 1);
      strokePixelCircle(ctx, 0, 0, coreR + 0.6, "#6b21a8", 0.55, 1);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "#f5d0fe";
      ctx.fillRect(-1, Math.round(-coreR - 1), 1, 1);

      // 4. Crackling white-purple lightning arcs around the rim.
      for (let a = 0; a < 3; a++) {
        const base = t * 7.4 + a * 2.1 + Math.random() * 0.5;
        const r0 = 7.4 + Math.random() * 1.2;
        ctx.beginPath();
        ctx.strokeStyle = a % 2 === 0 ? "#ffffff" : "#e879f9";
        ctx.globalAlpha = 0.55 + Math.random() * 0.4;
        ctx.lineWidth = 1;
        let px = Math.cos(base) * r0;
        let py = Math.sin(base) * r0;
        ctx.moveTo(Math.round(px) + 0.5, Math.round(py) + 0.5);
        let rad = r0;
        let ang = base;
        for (let s = 0; s < 3; s++) {
          rad -= r0 / 3.4;
          ang += Math.random() * 0.9 - 0.45;
          px = Math.cos(ang) * rad;
          py = Math.sin(ang) * rad;
          ctx.lineTo(Math.round(px) + 0.5, Math.round(py) + 0.5);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Black hole — multi-layer cel-shaded gravity well VFX + pull field.
  // -------------------------------------------------------------------------
  class BlackHole {
    constructor(x, y, target, skill) {
      this.x = x;
      this.y = y;
      this.target = target || null;
      this.targetX = target ? target.x : x;
      this.targetY = target ? target.y - 10 : y;
      this.R = skill.blackHoleRadius || 22;
      this.duration = skill.blackHoleDuration || 3.0;
      this.pullScale = skill.pullScale || 1.5;
      this.pullRadius = this.R * 2.2 * this.pullScale;
      this.state = "travel";
      this.stateT = 0;
      this.time = 0;
      this.alpha = 1;
      this.dead = false;
      this.speed = 260;
      this.layer = "over";
    }

    update(dt, game) {
      this.time += dt;

      if (this.state === "travel") {
        if (this.target && this.target.alive) {
          this.targetX = this.target.x;
          this.targetY = this.target.y - 10;
        }
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const d = Math.hypot(dx, dy) || 1;
        const step = this.speed * dt;
        if (d <= Math.max(8, this.R * 0.7) || step >= d) {
          this.x = this.targetX;
          this.y = this.targetY;
          this.state = "anchored";
          this.stateT = 0;
          // The black hole's focused crush: 20 damage to the tracked enemy.
          if (this.target && this.target.alive) {
            this.target.takeDamage(20, game, this.x, this.y, 90);
          }
          game.shake(2.4, 0.24);
          game.sfx("blackHoleHit");
          game.effects.push(
            new RingPulse(this.x, this.y, {
              life: 0.5,
              r0: this.R * 0.8,
              r1: this.R * 2.5,
              yScale: 0.76,
              colors: ["#c7d2fe", "#6366f1", "#3b0764"],
              thickness: 2,
            })
          );
        } else {
          this.x += (dx / d) * step;
          this.y += (dy / d) * step;
        }
      } else if (this.state === "anchored") {
        this.stateT += dt;
        this.pull(game, dt);
        if (this.stateT >= this.duration) {
          this.state = "dissipating";
          this.stateT = 0;
        }
      } else if (this.state === "dissipating") {
        this.stateT += dt;
        this.alpha = Math.max(0, 1 - this.stateT / 0.45);
        if (this.alpha <= 0) this.dead = true;
      }
    }

    pull(game, dt) {
      const pr = this.pullRadius;
      // Enemies (and stationary turrets) are pulled toward the event horizon
      // with a small tangential swirl. Movement still respects walls/gates.
      for (const e of game.enemies) {
        if (!e.alive || e.banishing) continue;
        const ecx = e.x;
        const ecy = e.y - 10;
        const dx = this.x - ecx;
        const dy = this.y - ecy;
        const d = Math.hypot(dx, dy);
        if (d > pr || d < 0.5) continue;
        const t = Math.max(0, 1 - d / pr);
        const radial = 45 + 125 * t;
        const tangent = 20 + 55 * t;
        const ux = dx / d;
        const uy = dy / d;
        const px = -uy;
        const py = ux;
        moveEntity(
          e,
          (ux * radial + px * tangent) * dt,
          (uy * radial + py * tangent) * dt,
          (x, y, w, h) => game.isBlocked(x, y, w, h)
        );
      }
      // Hostile projectiles curve inward too.
      for (const b of game.bullets) {
        if (b.dead || b.friendly) continue;
        const dx = this.x - b.x;
        const dy = this.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > pr || d < 0.5) continue;
        const t = Math.max(0, 1 - d / pr);
        const acc = 230 * t;
        b.vx += (dx / d) * acc * dt;
        b.vy += (dy / d) * acc * dt;
      }
    }

    draw(ctx, game) {
      const R = this.R;
      const auraR = R * 2.2;
      const scale = this.state === "dissipating" ? 0.45 + 0.55 * this.alpha : 1;
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y);
      ctx.scale(scale, scale);

      // 1. Outer soft periwinkle aura, bounded by a faint 1px ring.
      const aura = ctx.createRadialGradient(0, 0, R * 0.15, 0, 0, auraR);
      aura.addColorStop(0, "rgba(129,140,248,0.35)");
      aura.addColorStop(0.45, "rgba(99,102,241,0.30)");
      aura.addColorStop(0.78, "rgba(59,7,100,0.20)");
      aura.addColorStop(1, "rgba(59,7,100,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, auraR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(199,210,254,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, auraR - 0.5, 0, Math.PI * 2);
      ctx.stroke();

      // 2a. Sharp pure-white horizontal crescent flares at 0 / 180 degrees.
      for (let side = 0; side < 2; side++) {
        ctx.save();
        ctx.scale(side === 0 ? 1 : -1, 1);
        drawTaperedRibbon(
          ctx,
          { x: R * 0.92, y: 0 },
          { x: R * 1.34, y: -R * 0.10 },
          { x: R * 1.75, y: 0 },
          R * 0.26,
          "#ffffff"
        );
        ctx.restore();
      }

      // 2b. White-to-periwinkle curved wisps from the upper shoulders.
      for (let side = 0; side < 2; side++) {
        const baseA = side === 0 ? (-130 * Math.PI) / 180 : (-50 * Math.PI) / 180;
        const tipA = side === 0 ? (-105 * Math.PI) / 180 : (-75 * Math.PI) / 180;
        const p0 = { x: Math.cos(baseA) * R * 0.82, y: Math.sin(baseA) * R * 0.82 };
        const p1 = { x: Math.cos(tipA) * R * 1.78, y: Math.sin(tipA) * R * 1.78 };
        const midA = (baseA + tipA) / 2;
        const cp = {
          x: Math.cos(midA) * R * 1.32 + Math.cos(baseA) * R * 0.06,
          y: Math.sin(midA) * R * 1.32 + Math.sin(baseA) * R * 0.06,
        };
        const grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        grad.addColorStop(0, "#ffffff");
        grad.addColorStop(0.55, "#e0e7ff");
        grad.addColorStop(1, "#a5b4fc");
        drawTaperedRibbon(ctx, p0, cp, p1, R * 0.20, grad);
      }

      // 3. Two tapered orbital bottom streaks (60..145 degrees).
      const arc0 = (60 * Math.PI) / 180;
      const arc1 = (145 * Math.PI) / 180;
      const span = 0.56;
      for (let i = 0; i < 2; i++) {
        const mid =
          (arc0 + arc1) / 2 +
          Math.sin(this.time * 0.9 + i * Math.PI) * ((arc1 - arc0 - span) / 2);
        const a0 = mid - span / 2;
        const a1 = mid + span / 2;
        drawTaperedArc(
          ctx,
          0,
          0,
          R * (i === 0 ? 1.02 : 1.14),
          a0,
          a1,
          R * (i === 0 ? 0.15 : 0.11),
          i === 0 ? "#ffffff" : "#e9d5ff"
        );
      }

      // 4. Pitch-black event horizon core — solid, sharp edge, no blur.
      ctx.fillStyle = "#05010a";
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();

      // 5. Tapered pale-lavender inner crescent rim (upper-left, 175..265).
      drawTaperedArcBand(
        ctx,
        0,
        0,
        R * 0.85,
        (175 * Math.PI) / 180,
        (265 * Math.PI) / 180,
        R * 0.13,
        "#d8b4fe"
      );

      // 6. Curved diagonal accretion slash, slowly rotating.
      ctx.save();
      ctx.rotate(-0.663 + this.time * 0.22);
      const s0 = { x: -R * 1.35, y: 0 };
      const sc = { x: 0, y: R * 0.16 };
      const s1 = { x: R * 1.35, y: 0 };
      // Outside the core: pure white.
      ctx.save();
      ctx.beginPath();
      ctx.rect(-R * 3, -R * 3, R * 6, R * 6);
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.clip("evenodd");
      drawTaperedRibbon(ctx, s0, sc, s1, R * 0.22, "#ffffff");
      ctx.restore();
      // Over the black core: pale pink accretion light.
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.clip();
      drawTaperedRibbon(ctx, s0, sc, s1, R * 0.22, "rgba(250,232,255,0.82)");
      ctx.restore();
      ctx.restore();

      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Gravity Wells controller — passive orbs + black-hole formation/launch.
  // -------------------------------------------------------------------------
  class GravityWells {
    constructor(player) {
      this.player = player;
      const skill = player.hero.skill;
      this.skill = skill;
      this.orbitAngle = Math.random() * Math.PI * 2;
      this.time = 0;
      this.orbs = [];
      this.orbInterval = skill.orbInterval || 2.5;
      this.maxOrbs = skill.maxOrbs || 3;
      this.orbTimer = this.orbInterval;
      this.forming = null;
      this.blackHole = null;
      this.cooldownMax = skill.cooldown || 20;
      this.cooldown = 0;
    }

    update(dt, game) {
      this.time += dt;
      this.orbitAngle += dt * 2.6;
      if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);

      // Passive orb generation: one every 2.5 s, up to three, even while a
      // black hole is on the field (so the next cast has a charge building).
      this.orbTimer -= dt;
      if (this.orbTimer <= 0) {
        if (this.orbs.length < this.maxOrbs) this.spawnOrb(game);
        this.orbTimer = this.orbInterval;
      }

      // Passive orbs pause their attacks while the invoked black hole is on
      // the field; new orbs still spawn and orbit, then resume hunting after.
      const targets = !this.forming && !this.blackHole ? this.visibleTargets(game) : [];
      for (const orb of this.orbs) orb.update(dt, game, targets);

      if (this.forming) {
        this.forming.t += dt;
        if (this.forming.t >= this.forming.duration) this.launchBlackHole(game);
      }

      if (this.blackHole) {
        this.blackHole.update(dt, game);
        if (this.blackHole.dead) this.blackHole = null;
      }
    }

    spawnOrb(game) {
      if (this.orbs.length >= this.maxOrbs) return null;
      const used = new Set(this.orbs.map((o) => o.slot));
      let slot = 0;
      while (used.has(slot) && slot < this.maxOrbs) slot++;
      if (slot >= this.maxOrbs) return null;
      const orb = new GravityOrb(this, slot);
      this.orbs.push(orb);
      if (game) {
        game.spawnParticles(orb.x, orb.y, 5, {
          color: "#c084fc",
          speed: 35,
          life: 0.28,
          size: 1,
          spread: 2.8,
          glow: true,
          drag: 3,
        });
        game.effects.push(
          new RingPulse(orb.x, orb.y, {
            life: 0.22,
            r0: 1,
            r1: 9,
            yScale: 1,
            colors: ["#e879f9", "#7c3aed"],
            thickness: 1,
          })
        );
      }
      return orb;
    }

    /** The orbs can see any alive enemy the player can see on screen (LOS). */
    visibleTargets(game) {
      const p = this.player;
      const width = game.viewW || (game.canvas ? game.canvas.width : 480);
      const height = game.viewH || (game.canvas ? game.canvas.height : 270);
      const left = game.camX - 10;
      const top = game.camY - 10;
      const right = game.camX + width + 10;
      const bottom = game.camY + height + 10;
      const out = [];
      for (const e of game.enemies) {
        if (!e.alive || e.banishing) continue;
        if (e.x < left || e.x > right || e.y - 10 < top || e.y - 10 > bottom) continue;
        if (!game.targetVisible(p.x, p.centerY(), e)) continue;
        out.push(e);
      }
      return out;
    }

    findTarget(game) {
      const targets = this.visibleTargets(game);
      if (this.player.aimTarget && targets.indexOf(this.player.aimTarget) >= 0) {
        return this.player.aimTarget;
      }
      let best = null;
      let bestDist = Infinity;
      for (const e of targets) {
        const d = Math.hypot(e.x - this.player.x, e.y - 10 - this.player.centerY());
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      return best;
    }

    tryActivate(game) {
      if (this.forming || this.blackHole) {
        game.addFloatText(this.player.x, this.player.y - 44, "BLACK HOLE ACTIVE", "#c7d2fe", {
          scale: 1,
          rise: 16,
          life: 0.8,
        });
        game.sfx("deny");
        return false;
      }

      if (this.cooldown > 0) {
        game.addFloatText(this.player.x, this.player.y - 44, "COOLDOWN", "#c7d2fe", {
          scale: 1,
          rise: 16,
          life: 0.8,
        });
        game.sfx("deny");
        return false;
      }

      const target = this.findTarget(game);
      if (!target) {
        game.addFloatText(this.player.x, this.player.y - 44, "NO TARGET", "#c7d2fe", {
          scale: 1,
          rise: 16,
          life: 0.8,
        });
        game.sfx("deny");
        return false;
      }

      // Visually spawn any missing orbs until there are three, then collapse.
      while (this.orbs.length < this.maxOrbs) this.spawnOrb(game);
      // Every orb stops attacking, including one currently reforming.
      for (const orb of this.orbs) {
        orb.mode = "orbit";
        orb.reform = 0;
        orb.target = null;
        orb.vx = 0;
        orb.vy = 0;
      }

      this.cooldown = this.cooldownMax;
      this.forming = {
        t: 0,
        duration: 0.42,
        x: this.player.x,
        y: this.player.y - 12,
        target: target,
      };
      game.sfx("blackHoleForm");
      game.shake(1.6, 0.2);
      game.effects.push(
        new RingPulse(this.forming.x, this.forming.y, {
          life: 0.45,
          r0: 6,
          r1: 42,
          yScale: 0.7,
          colors: ["#c7d2fe", "#6366f1", "#3b0764"],
          thickness: 2,
        })
      );
      game.spawnParticles(this.forming.x, this.forming.y, 18, {
        color: "#a5b4fc",
        speed: 105,
        life: 0.5,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.4,
      });
      game.addFloatText(this.player.x, this.player.y - 48, "COLLAPSE!", "#c7d2fe", {
        scale: 1,
        rise: 18,
        life: 0.9,
      });
      return true;
    }

    launchBlackHole(game) {
      const f = this.forming;
      if (!f) return;
      this.blackHole = new BlackHole(f.x, f.y, f.target, this.skill);
      this.orbs = [];
      this.forming = null;
      this.orbTimer = this.orbInterval;
      game.sfx("blackHoleFire");
      game.shake(2.2, 0.24);
      game.effects.push(
        new RingPulse(f.x, f.y, {
          life: 0.55,
          r0: 4,
          r1: this.skill.blackHoleRadius * 3,
          yScale: 0.74,
          colors: ["#ffffff", "#c7d2fe", "#6366f1"],
          thickness: 2,
        })
      );
      game.spawnParticles(f.x, f.y, 22, {
        color: "#818cf8",
        speed: 150,
        life: 0.55,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2,
      });
    }

    /** A floor transition should not carry a world-space black hole or stale orb trails along. */
    clearTransient() {
      this.forming = null;
      this.blackHole = null;
      for (const orb of this.orbs) {
        orb.mode = "orbit";
        orb.reform = 0;
        orb.target = null;
        orb.vx = 0;
        orb.vy = 0;
        const pt = orb.orbitPoint();
        orb.x = pt.x;
        orb.y = pt.y;
        orb.trail = [{ x: orb.x, y: orb.y }];
      }
    }

    draw(ctx, game) {
      for (const orb of this.orbs) orb.draw(ctx, game);
      if (this.blackHole) this.blackHole.draw(ctx, game);
    }
  }
  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------
  SK.Player = Player;
  SK.Bullet = Bullet;
  SK.Beam = Beam;
  SK.Enemy = Enemy;
  SK.Crate = Crate;
  SK.Chest = Chest;
  SK.GroundWeapon = GroundWeapon;
  SK.Pickup = Pickup;
  SK.Particle = Particle;
  SK.FloatText = FloatText;
  SK.RingPulse = RingPulse;
  SK.SingularityPop = SingularityPop;
  SK.Crater = Crater;
  SK.SkyMeteor = SkyMeteor;
  SK.GravityWells = GravityWells;
  SK.BlackHole = BlackHole;
  SK.WEAPONS = WEAPON_LIST;
  SK.RARITY = RARITY;
  SK.Heroes = {
    defs: HERO_DEFS,
    list: HERO_LIST,
    ids: Object.keys(HERO_DEFS),
  };
  SK.Weapons = {
    defs: WEAPON_DEFS,
    list: WEAPON_LIST,
    rarity: RARITY,
    byRarity: weaponsOfRarity,
    rollRarity: rollRarity,
    random: randomWeapon,
    tables: DROP_TABLES,
  };
  SK.Physics = {
    normalize: normalize,
    rectsOverlap: rectsOverlap,
    angleDelta: angleDelta,
    inSector: inSector,
    entityRect: entityRect,
    moveEntity: moveEntity,
    clamp: clamp,
  };
})();
