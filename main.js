/* =========================================================================
   DUNGEON SK — main.js
   Fixed 60 Hz game loop, input, camera, HUD (rarity weapon name + energy
   badge), minimap, ground-loot prompts, floor/door state flow, screen
   effects and procedural WebAudio SFX.
   ========================================================================= */
(function () {
  "use strict";

  const SK = window.SK;
  // Wider-than-16:9 windows get a wider virtual playfield, which lets the
  // canvas fill the full window with no distortion and no letterboxing. VH
  // never changes, so every vertical HUD/world measurement is unaffected.
  const BASE_VW = 480;
  const MAX_VW = 640;
  let VW = BASE_VW;
  const VH = 270;
  // The interface has its own pixel grid at half the world's pixel size: the
  // HUD keeps its designed 480x270 layout, but every UI pixel is 0.5 world
  // pixels, so the whole interface renders at 50% of the old on-screen size.
  // The backing store is doubled so those smaller UI pixels stay crisp.
  const UI_SCALE = 2;
  const UI_DW = 480;
  const UI_DH = 270;
  const TILE = SK.TILE;
  const STEP = 1 / 60;
  const FONT = SK.PixelFont;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }

  // -------------------------------------------------------------------------
  // Persistent meta save (gems, unlocked heroes, selected hero)
  // -------------------------------------------------------------------------
  const SAVE_KEY = "dungeonSK.save.v1";

  function defaultSave() {
    return { gems: 0, unlockedHeroes: ["knight", "traveler"], selectedHero: "knight", bestWave: 0 };
  }

  function loadSave() {
    const fallback = defaultSave();
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      const heroIds = (SK.Heroes && SK.Heroes.ids) || ["knight", "gravito", "traveler"];
      const out = defaultSave();
      if (data && Number.isFinite(data.gems)) out.gems = Math.max(0, Math.floor(data.gems));
      if (data && Array.isArray(data.unlockedHeroes)) {
        out.unlockedHeroes = data.unlockedHeroes.filter((id) => heroIds.indexOf(id) >= 0);
      }
      if (out.unlockedHeroes.indexOf("knight") < 0) out.unlockedHeroes.unshift("knight");
      // The Traveler is a free base hero; migrate older saves automatically.
      if (heroIds.indexOf("traveler") >= 0 && out.unlockedHeroes.indexOf("traveler") < 0) {
        out.unlockedHeroes.push("traveler");
      }
      if (data && heroIds.indexOf(data.selectedHero) >= 0 && out.unlockedHeroes.indexOf(data.selectedHero) >= 0) {
        out.selectedHero = data.selectedHero;
      }
      if (data && Number.isFinite(data.bestWave)) out.bestWave = Math.max(0, Math.floor(data.bestWave));
      return out;
    } catch (e) {
      return fallback;
    }
  }

  function writeSave(data) {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          gems: data.gems,
          unlockedHeroes: data.unlockedHeroes,
          selectedHero: data.selectedHero,
          bestWave: data.bestWave || 0,
        })
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Keyboard & mouse
  // -------------------------------------------------------------------------
  class Input {
    constructor(canvas, onPress, onAnyInput) {
      this.canvas = canvas;
      this.onPress = onPress;
      this.onAnyInput = onAnyInput || function () {};
      this.keys = Object.create(null);
      this.mouseDown = false;
      this.mouseX = VW / 2;
      this.mouseY = VH / 2;
      this.onBlur = null;

      const updateMouse = (e) => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        this.mouseX = ((e.clientX - r.left) / r.width) * VW;
        this.mouseY = ((e.clientY - r.top) / r.height) * VH;
      };

      const blocked = new Set([
        "Space",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Tab",
      ]);

      window.addEventListener("keydown", (e) => {
        if (blocked.has(e.code)) e.preventDefault();
        this.keys[e.code] = true;
        this.onAnyInput();
        if (e.repeat) return;
        if (this.onPress) this.onPress(e.code);
      });

      window.addEventListener("keyup", (e) => {
        delete this.keys[e.code];
      });

      canvas.addEventListener("mousemove", updateMouse);

      canvas.addEventListener("mousedown", (e) => {
        e.preventDefault();
        updateMouse(e);
        this.onAnyInput();
        if (e.button === 0) {
          this.mouseDown = true;
          if (this.onPress) this.onPress("MouseLeft");
        } else if (e.button === 2) {
          if (this.onPress) this.onPress("MouseRight");
        }
      });

      window.addEventListener("mouseup", (e) => {
        if (e.button === 0) this.mouseDown = false;
      });

      canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      canvas.addEventListener("dragstart", (e) => e.preventDefault());

      window.addEventListener("blur", () => {
        this.clearAll();
        if (this.onBlur) this.onBlur();
      });

      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          this.clearAll();
          if (this.onBlur) this.onBlur();
        }
      });
    }

    get attack() {
      return this.mouseDown || !!this.keys["Space"];
    }

    key(name) {
      switch (name) {
        case "left":
          return !!(this.keys["KeyA"] || this.keys["ArrowLeft"]);
        case "right":
          return !!(this.keys["KeyD"] || this.keys["ArrowRight"]);
        case "up":
          return !!(this.keys["KeyW"] || this.keys["ArrowUp"]);
        case "down":
          return !!(this.keys["KeyS"] || this.keys["ArrowDown"]);
        default:
          return !!this.keys[name];
      }
    }

    clearAttack() {
      this.mouseDown = false;
      delete this.keys["Space"];
    }

    clearAll() {
      this.keys = Object.create(null);
      this.mouseDown = false;
    }
  }

  // -------------------------------------------------------------------------
  // Tiny procedural sound engine (no external assets)
  // -------------------------------------------------------------------------
  class Sfx {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.noiseBuffer = null;
      this.lastPlayed = Object.create(null);
      try {
        this.muted = localStorage.getItem("dungeonSK.muted") === "1";
      } catch (e) {
        this.muted = false;
      }
    }

    unlock() {
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
        }
        if (this.ctx.state === "suspended") {
          const p = this.ctx.resume();
          if (p && p.catch) p.catch(function () {});
        }
      } catch (e) {
        this.ctx = null;
      }
    }

    toggle() {
      this.muted = !this.muted;
      try {
        localStorage.setItem("dungeonSK.muted", this.muted ? "1" : "0");
      } catch (e) {
        /* ignore */
      }
      if (!this.muted) {
        this.unlock();
        this.play("ui");
      }
    }

    ensureNoise() {
      if (this.noiseBuffer || !this.ctx) return;
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }

    tone(f0, f1, dur, type, vol, when) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + (when || 0);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || "square";
      osc.frequency.setValueAtTime(Math.max(20, f0), t0);
      if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.012, dur * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    noise(dur, vol, freq, when, type) {
      if (!this.ctx) return;
      this.ensureNoise();
      if (!this.noiseBuffer) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + (when || 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = type || "bandpass";
      filter.frequency.setValueAtTime(freq || 1200, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(80, (freq || 1200) * 0.35), t0 + dur);
      filter.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.0002, vol), t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    play(name) {
      if (this.muted) return;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const gaps = {
        shoot: 0.035, hit: 0.03, enemyShoot: 0.06, shamanShoot: 0.06,
        crateHit: 0.04, pickup: 0.035, alert: 0.2, deflect: 0.04,
        dry: 0.1, shotgun: 0.06, railgun: 0.08, equip: 0.06,
        charge: 0.15, turretShoot: 0.08, wave: 0.05,
        blackHoleForm: 0.2, blackHoleFire: 0.3, blackHoleHit: 0.2,
        kamuiBanish: 0.12, kamuiPop: 0.1, phase: 0.2,
        phaseOff: 0.15, waveStart: 0.6, waveClear: 0.6, kamuiMega: 0.2,
      };
      if (gaps[name]) {
        if (this.lastPlayed[name] && now - this.lastPlayed[name] < gaps[name]) return;
        this.lastPlayed[name] = now;
      }
      try {
        switch (name) {
          case "shoot":
            this.tone(640, 210, 0.055, "square", 0.028);
            this.noise(0.03, 0.012, 2600);
            break;
          case "shotgun":
            this.tone(220, 70, 0.13, "sawtooth", 0.045);
            this.noise(0.11, 0.04, 1400);
            this.noise(0.05, 0.02, 3200, 0.02);
            break;
          case "railgun":
            this.tone(1400, 180, 0.18, "sawtooth", 0.04);
            this.tone(2200, 900, 0.1, "sine", 0.025);
            this.noise(0.09, 0.03, 4200);
            break;
          case "charge":
            this.tone(420, 900, 0.16, "sine", 0.018);
            break;
          case "turretShoot":
            this.tone(340, 130, 0.14, "triangle", 0.035);
            this.noise(0.08, 0.015, 900);
            break;
          case "wave":
            this.noise(0.12, 0.03, 900);
            this.tone(420, 180, 0.1, "triangle", 0.026);
            break;
          case "scythe":
            this.noise(0.14, 0.042, 1100, 0, "bandpass");
            this.tone(240, 95, 0.12, "triangle", 0.026);
            break;
          case "greatsword":
            this.noise(0.16, 0.05, 800, 0, "bandpass");
            this.tone(180, 70, 0.14, "sawtooth", 0.03);
            break;
          case "dry":
            this.tone(180, 120, 0.035, "square", 0.02);
            break;
          case "equip":
            this.tone(620, 880, 0.06, "square", 0.026);
            this.tone(920, 1240, 0.07, "sine", 0.02, 0.04);
            break;
          case "treasure":
            this.tone(523, 523, 0.09, "square", 0.026);
            this.tone(659, 659, 0.09, "square", 0.026, 0.08);
            this.tone(784, 784, 0.1, "square", 0.026, 0.16);
            this.tone(1046, 1318, 0.26, "triangle", 0.03, 0.24);
            break;
          case "sword":
            this.noise(0.1, 0.035, 1500, 0, "bandpass");
            this.tone(300, 120, 0.09, "triangle", 0.018);
            break;
          case "hit":
            this.tone(190, 110, 0.045, "square", 0.026);
            this.noise(0.04, 0.02, 1900);
            break;
          case "kill":
            this.tone(240, 55, 0.16, "sawtooth", 0.035);
            this.noise(0.14, 0.03, 900);
            break;
          case "hurt":
            this.tone(130, 62, 0.17, "sawtooth", 0.05);
            this.noise(0.1, 0.025, 500);
            break;
          case "armorHit":
            this.tone(760, 280, 0.1, "triangle", 0.035);
            this.noise(0.08, 0.02, 3200);
            break;
          case "pickup":
            this.tone(820, 1220, 0.07, "sine", 0.03);
            this.tone(1240, 1540, 0.05, "sine", 0.018, 0.035);
            break;
          case "potion":
            this.tone(520, 700, 0.08, "sine", 0.03);
            this.tone(780, 1040, 0.09, "sine", 0.02, 0.05);
            break;
          case "chest":
            this.tone(523, 523, 0.09, "square", 0.02);
            this.tone(659, 659, 0.09, "square", 0.02, 0.07);
            this.tone(784, 1046, 0.16, "square", 0.022, 0.14);
            break;
          case "crateHit":
            this.tone(150, 90, 0.04, "square", 0.02);
            this.noise(0.035, 0.02, 1200);
            break;
          case "crateBreak":
            this.noise(0.18, 0.045, 1000);
            this.tone(130, 50, 0.14, "triangle", 0.03);
            break;
          case "deflect":
            this.tone(1350, 700, 0.06, "triangle", 0.035);
            this.noise(0.04, 0.02, 3800);
            break;
          case "swap":
            this.tone(380, 500, 0.045, "square", 0.02);
            this.tone(560, 700, 0.05, "square", 0.018, 0.05);
            break;
          case "alert":
            this.tone(330, 440, 0.07, "square", 0.024);
            break;
          case "enemyShoot":
            this.tone(300, 150, 0.09, "sawtooth", 0.022);
            break;
          case "shamanShoot":
            this.tone(500, 240, 0.11, "triangle", 0.025);
            this.noise(0.06, 0.012, 1800);
            break;
          case "gate":
            this.tone(110, 45, 0.28, "sawtooth", 0.045);
            this.noise(0.22, 0.035, 600);
            break;
          case "clear":
            this.tone(523, 523, 0.09, "square", 0.024);
            this.tone(659, 659, 0.09, "square", 0.024, 0.09);
            this.tone(880, 880, 0.2, "square", 0.026, 0.18);
            break;
          case "portal":
            this.tone(260, 680, 0.45, "sine", 0.03);
            this.tone(390, 1040, 0.5, "sine", 0.018, 0.12);
            this.noise(0.4, 0.02, 900);
            break;
          case "floor":
            this.tone(392, 523, 0.12, "triangle", 0.026);
            this.tone(523, 784, 0.22, "triangle", 0.024, 0.1);
            break;
          case "start":
            this.tone(262, 262, 0.12, "triangle", 0.03);
            this.tone(392, 392, 0.12, "triangle", 0.028, 0.1);
            this.tone(523, 784, 0.3, "triangle", 0.03, 0.2);
            break;
          case "death":
            this.tone(330, 55, 0.55, "sawtooth", 0.05);
            this.noise(0.4, 0.04, 700);
            break;
          case "ui":
            this.tone(660, 880, 0.05, "square", 0.018);
            break;
          case "pause":
            this.tone(440, 330, 0.08, "triangle", 0.022);
            break;
          case "gem":
            this.tone(1046, 1568, 0.08, "sine", 0.034);
            this.tone(1318, 2093, 0.1, "sine", 0.024, 0.05);
            this.tone(1568, 2637, 0.14, "triangle", 0.02, 0.1);
            break;
          case "unlock":
            this.tone(523, 523, 0.1, "square", 0.028);
            this.tone(659, 659, 0.1, "square", 0.028, 0.09);
            this.tone(784, 784, 0.1, "square", 0.028, 0.18);
            this.tone(1046, 1568, 0.32, "triangle", 0.034, 0.27);
            this.noise(0.3, 0.02, 2400, 0.12);
            break;
          case "overdrive":
            this.tone(180, 620, 0.2, "sawtooth", 0.04);
            this.tone(360, 1240, 0.24, "square", 0.025, 0.04);
            this.noise(0.18, 0.035, 1800, 0, "bandpass");
            break;
          case "gravity":
            this.tone(90, 240, 0.35, "sine", 0.04);
            this.tone(180, 480, 0.3, "triangle", 0.022, 0.05);
            this.noise(0.24, 0.018, 700);
            break;
          case "gravitySword":
            this.noise(0.18, 0.05, 650, 0, "bandpass");
            this.tone(150, 60, 0.18, "sawtooth", 0.032);
            break;
          case "gravityPop":
            this.tone(520, 90, 0.1, "triangle", 0.032);
            this.tone(880, 220, 0.08, "sine", 0.02, 0.02);
            this.noise(0.08, 0.02, 2200);
            break;
          case "blackHoleForm":
            this.tone(65, 240, 0.34, "sine", 0.045);
            this.tone(120, 520, 0.28, "triangle", 0.02, 0.05);
            this.noise(0.24, 0.02, 600);
            break;
          case "blackHoleFire":
            this.tone(180, 35, 0.36, "sawtooth", 0.06);
            this.noise(0.3, 0.045, 900, 0, "bandpass");
            this.tone(900, 120, 0.18, "sine", 0.026, 0.02);
            break;
          case "blackHoleHit":
            this.tone(110, 45, 0.4, "triangle", 0.05);
            this.tone(55, 30, 0.5, "sine", 0.04, 0.04);
            this.noise(0.18, 0.025, 700, 0.02);
            break;
          case "meteorFall":
            this.tone(1200, 180, 0.4, "sine", 0.026);
            this.noise(0.34, 0.025, 1600, 0.06);
            break;
          case "meteorHit":
            this.tone(120, 32, 0.42, "sawtooth", 0.075);
            this.noise(0.38, 0.06, 700);
            this.noise(0.16, 0.035, 2400, 0.02);
            break;
          case "home":
            this.tone(392, 392, 0.12, "triangle", 0.024);
            this.tone(523, 523, 0.12, "triangle", 0.022, 0.1);
            this.tone(659, 784, 0.28, "triangle", 0.026, 0.2);
            break;
          case "deny":
            this.tone(180, 120, 0.1, "square", 0.026);
            this.tone(140, 90, 0.12, "square", 0.02, 0.08);
            break;
          case "kamuiOpen":
            this.tone(120, 620, 0.5, "sine", 0.04);
            this.tone(240, 960, 0.42, "triangle", 0.022, 0.06);
            this.noise(0.4, 0.028, 700);
            this.noise(0.22, 0.018, 2600, 0.18);
            break;
          case "kamuiExit":
            this.tone(720, 140, 0.42, "sine", 0.035);
            this.tone(480, 90, 0.34, "triangle", 0.02, 0.04);
            this.noise(0.3, 0.022, 1200);
            break;
          case "kamuiReturn":
            this.tone(160, 520, 0.2, "triangle", 0.03);
            this.noise(0.18, 0.02, 1600);
            break;
          case "kamuiBanish":
            this.tone(90, 440, 0.28, "sine", 0.038);
            this.tone(300, 70, 0.3, "triangle", 0.022, 0.06);
            this.noise(0.22, 0.026, 650);
            break;
          case "kamuiPop":
            this.tone(640, 90, 0.12, "triangle", 0.036);
            this.tone(920, 260, 0.09, "sine", 0.022, 0.02);
            this.noise(0.1, 0.022, 2400);
            break;
          case "phase":
            this.tone(260, 520, 0.16, "sine", 0.03);
            this.tone(520, 1040, 0.2, "triangle", 0.02, 0.06);
            this.noise(0.2, 0.016, 1800);
            break;
          case "phaseOff":
            this.tone(520, 170, 0.16, "triangle", 0.028);
            this.noise(0.15, 0.018, 2400);
            break;
          case "waveStart":
            this.tone(120, 58, 0.34, "sawtooth", 0.042);
            this.tone(240, 120, 0.28, "triangle", 0.022, 0.05);
            this.noise(0.26, 0.024, 520);
            break;
          case "waveClear":
            this.tone(392, 392, 0.1, "square", 0.024);
            this.tone(523, 523, 0.1, "square", 0.024, 0.09);
            this.tone(659, 880, 0.3, "triangle", 0.028, 0.18);
            break;
          case "kamuiMega":
            this.tone(70, 430, 0.42, "sine", 0.052);
            this.tone(150, 40, 0.52, "sawtooth", 0.046, 0.04);
            this.noise(0.42, 0.05, 520);
            this.noise(0.2, 0.03, 2800, 0.07);
            break;
          default:
            break;
        }
      } catch (e) {
        /* Never let optional audio break the game. */
      }
    }
  }

  // -------------------------------------------------------------------------
  // Game
  // -------------------------------------------------------------------------
  class Game {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.ctx.imageSmoothingEnabled = false;

      this.audio = new Sfx();
      this.input = new Input(
        canvas,
        (code) => this.onPress(code),
        () => this.audio.unlock()
      );
      this.input.onBlur = () => {
        if (this.state === "playing" && !this.paused) {
          this.paused = true;
          this.audio.play("pause");
        }
      };

      this.state = "home";
      this.mode = "home"; // home | dungeon | waves
      this.waves = null;
      this.arena = null;
      this.paused = false;
      this.homeConfirm = false;
      this.stateT = 0;
      this.gameoverT = 0;
      this.time = 0;
      this.depth = 1;
      this.kills = 0;
      this.runTime = 0;
      this.runGems = 0;
      this.hintT = 0;
      this.homeHintT = 10;
      this.fireSuppressT = 0;
      this.notice = null;
      this.advance = null;
      this.currentRoom = null;
      this.homeNear = null;
      this.homePortalNear = false;
      this.homeWaveNear = false;
      this.homeDenyT = 0;
      this.gemFlash = 0;

      this.enemies = [];
      this.crates = [];
      this.chests = [];
      this.bullets = [];
      this.beams = [];
      this.pickups = [];
      this.groundWeapons = [];
      this.particles = [];
      this.floats = [];
      this.effects = [];
      this.energyFlash = 0;

      this.camX = 0;
      this.camY = 0;
      this.shakeAmp = 0;
      this.hurtVignette = 0;
      this.hurtTint = "red";

      this.debug = false;
      this.accumulator = 0;
      this.lastFrame = performance.now();

      this.buildScreenEffects();
      this.resize();
      window.addEventListener("resize", () => this.resize());
      window.addEventListener("orientationchange", () => this.resize());
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", () => this.resize());
      }

      this.saveData = loadSave();
      this.writeSave();
      this.homeRoom = new SK.HomeRoom();
      this.dungeon = this.homeRoom;
      this.player = new SK.Player(
        this.homeRoom.spawnPoint.x,
        this.homeRoom.spawnPoint.y,
        this.selectedHeroId()
      );
      this.player.iframes = 0;
      this.player.bob = 0;
      this.updateCamera(0, true);
      this.exposeDebug();

      window.__dungeonSK = this;
      requestAnimationFrame((t) => this.loop(t));
    }

    // ---------------------------------------------------------------------
    // Presentation helpers
    // ---------------------------------------------------------------------
    buildScreenEffects() {
      this.vignette = makeCanvas(VW, VH);
      let c = this.vignette.getContext("2d");
      let g = c.createRadialGradient(VW / 2, VH / 2, 82, VW / 2, VH / 2, 292);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.62, "rgba(2,4,8,0.18)");
      g.addColorStop(1, "rgba(1,2,5,0.62)");
      c.fillStyle = g;
      c.fillRect(0, 0, VW, VH);

      const makeTint = (rgb) => {
        const cc = makeCanvas(VW, VH);
        const ctx = cc.getContext("2d");
        const gg = ctx.createRadialGradient(VW / 2, VH / 2, 60, VW / 2, VH / 2, 290);
        gg.addColorStop(0, "rgba(" + rgb + ",0)");
        gg.addColorStop(0.6, "rgba(" + rgb + ",0.08)");
        gg.addColorStop(1, "rgba(" + rgb + ",0.62)");
        ctx.fillStyle = gg;
        ctx.fillRect(0, 0, VW, VH);
        return cc;
      };
      this.redVignette = makeTint("150,24,38");
      this.blueVignette = makeTint("30,108,180");
    }

    resize() {
      const availW = Math.max(1, window.innerWidth || BASE_VW);
      const availH = Math.max(1, window.innerHeight || VH);
      const aspect = availW / availH;
      const wide = aspect > BASE_VW / VH;
      // Wider-than-16:9 windows get a wider virtual playfield, which lets the
      // canvas fill the full window with no distortion and no letterboxing.
      // Narrower windows keep the 480px design width and letterbox vertically.
      const idealVW = wide ? VH * aspect : BASE_VW;
      const nextVW = wide
        ? clamp(Math.round(idealVW / 2) * 2, BASE_VW, MAX_VW)
        : BASE_VW;
      if (nextVW !== VW) {
        VW = nextVW;
        this.buildScreenEffects();
      }
      this.viewW = VW;
      this.viewH = VH;
      const backingW = VW * UI_SCALE;
      const backingH = VH * UI_SCALE;
      if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
        this.canvas.width = backingW;
        this.canvas.height = backingH;
      }
      // Continuous (non-integer) scaling so the canvas reaches the window
      // edges; nearest-neighbour sampling keeps the pixel art crisp.
      const scale = Math.max(0.2, Math.min(availW / VW, availH / VH));
      const exact = wide && idealVW <= MAX_VW;
      const w = exact ? availW : Math.max(1, Math.round(VW * scale));
      const h = exact ? availH : Math.max(1, Math.round(VH * scale));
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      // Integer offsets keep the upscaled pixel grid on whole device pixels.
      this.canvas.style.left = Math.floor((availW - w) / 2) + "px";
      this.canvas.style.top = Math.floor((availH - h) / 2) + "px";
      if (this.player) this.updateCamera(0, true);
    }

    exposeDebug() {
      // Small hooks for automated verification / curious players.
      window.DungeonSK = {
        game: this,
        start: () => this.startRun(),
        home: () => this.returnHome(),
        startFromHome: () => this.startRun(),
        startWaves: () => {
          if (this.state !== "home") this.returnHome();
          return this.startWaveRun();
        },
        waveState: () =>
          this.waves
            ? {
                mode: this.mode,
                wave: this.waves.wave,
                state: this.waves.state,
                left: this.waves.aliveCount(this),
                best: this.bestWave(),
              }
            : null,
        bestWave: () => this.bestWave(),
        setKamuiCasts: (n) => {
          this.player.kamuiCasts = ((Math.floor(n) || 0) % 3 + 3) % 3;
          return this.player.kamuiCasts;
        },
        gotoFloor: (n) => {
          this.depth = Math.max(1, n | 0);
          this.loadFloor(this.depth);
          this.state = "playing";
          this.paused = false;
          this.homeConfirm = false;
        },
        teleportToRoom: (id) => {
          const room = this.dungeon.rooms.find((r) => r.id === id) || this.dungeon.rooms[0];
          this.player.placeAt((room.x + room.w / 2) * TILE, (room.y + room.h / 2 + 1) * TILE);
          this.updateCamera(0, true);
        },
        giveWeapon: (id) => {
          const def = SK.Weapons.defs[id];
          if (!def) return false;
          this.player.weapons[this.player.weapon] = def;
          this.player.cooldowns[this.player.weapon] = 0;
          this.player.swing = null;
          return true;
        },
        dropWeaponAt: (id, x, y) => {
          const def = SK.Weapons.defs[id];
          if (!def) return null;
          return this.dropWeapon(def, x == null ? this.player.x + 14 : x, y == null ? this.player.y : y, {});
        },
        weaponIds: () => SK.Weapons.list.map((w) => w.id),
        heroIds: () => SK.Heroes.ids.slice(),
        save: () => this.saveData,
        gems: () => this.saveData.gems,
        addGems: (n) => this.addGems(n == null ? 1 : n),
        setGems: (n) => {
          this.saveData.gems = Math.max(0, Math.floor(n || 0));
          this.writeSave();
          return this.saveData.gems;
        },
        unlockHero: (id) => this.unlockHeroDebug(id),
        selectHero: (id) => this.selectHero(id),
        placeHeroNear: (id) => {
          const p = this.homeRoom && this.homeRoom.pedestals[id];
          if (!p) return false;
          this.player.placeAt(p.x, p.y + 18);
          this.player.iframes = 0;
          this.updateCamera(0, true);
          return true;
        },
        openHomeConfirm: () => this.openHomeConfirm(),
        confirmHome: () => this.confirmReturnHome(),
        triggerSkill: (slot) => this.player.activateSkill(this, slot || 0),
        triggerPhase: () => this.player.activateSkill(this, 1),
        banishNearest: () => {
          const t = this.findAimTarget(this.player.x, this.player.centerY(), 300);
          if (!t) return false;
          this.player.weapon = 0;
          this.player.cooldowns[0] = 0;
          return this.player.castKamuiGloves(this, this.player.currentWeapon());
        },
        riftState: () => ({
          rift: this.player.rift,
          riftCooldown: this.player.riftCooldown,
          riftTime: this.player.riftTime,
          phaseActive: this.player.phaseActive,
          phaseCooldown: this.player.phaseCooldown,
          phaseFx: this.player.phaseFx,
        }),
        spawnGemAt: (x, y) => this.spawnGem(x == null ? this.player.x : x, y == null ? this.player.y : y),
        effectCount: () => this.effects.length,
        resetSave: () => {
          this.saveData = defaultSave();
          this.writeSave();
          this.player.setHero("knight", true);
          return this.saveData;
        },
      };
    }

    // ---------------------------------------------------------------------
    // State flow
    // ---------------------------------------------------------------------
    loadFloor(depth) {
      depth = SK.Difficulty.normalizeDepth(depth);
      this.depth = depth;
      this.dungeon = new SK.Dungeon(depth);
      this.enemies = [];
      this.crates = [];
      this.chests = [];
      this.bullets = [];
      this.beams = [];
      this.pickups = [];
      this.groundWeapons = [];
      this.particles = [];
      this.floats = [];
      this.effects = [];
      this.notice = null;
      this.advance = null;
      this.hurtVignette = 0;
      this.energyFlash = 0;
      this.shakeAmp = 0;
      this.homeNear = null;
      this.homePortalNear = false;

      for (const room of this.dungeon.rooms) {
        room.locked = false;
        room.cleared = room.type !== "combat";
        room.gateT = 0;
        room.chestSpawned = false;
        for (const c of room.content.crates) this.crates.push(new SK.Crate(c.x, c.y));
        for (const e of room.content.enemies) this.enemies.push(new SK.Enemy(e.type, e.x, e.y, room, depth));
        if (room.type === "treasure" && room.content.chest) {
          // Treasure chests exist from the moment the floor loads; no combat required.
          const c = room.content.chest;
          this.chests.push(new SK.Chest(c.x * TILE + 8, (c.y + 1) * TILE, { gold: true }));
          room.chestSpawned = true;
        }
      }

      const spawn = this.dungeon.spawnPoint;
      this.player.placeAt(spawn.x, spawn.y);
      if (this.player.wells) this.player.wells.clearTransient();
      if (this.player.resetRiftState) this.player.resetRiftState();
      this.player.iframes = 0;
      this.player.cooldowns = [0, 0];
      this.player.swing = null;
      this.player.noEnergyCd = 0;
      this.player.kx = 0;
      this.player.ky = 0;
      this.player.alive = true;
      this.player.deathTimer = 0;
      this.player.hp = Math.max(1, this.player.hp);
      this.currentRoom = this.dungeon.rooms[0];
      this.currentRoom.explored = true;
      this.fireSuppressT = 0.2;
      this.updateCamera(0, true);
    }

    startRun() {
      this.audio.unlock();
      const heroId = this.selectedHeroId();
      this.player = new SK.Player(0, 0, heroId);
      this.mode = "dungeon";
      this.waves = null;
      this.arena = null;
      this.kills = 0;
      this.runTime = 0;
      this.runGems = 0;
      this.depth = 1;
      this.loadFloor(1);
      this.state = "playing";
      this.paused = false;
      this.homeConfirm = false;
      this.stateT = 0;
      this.gameoverT = 0;
      this.hintT = 12;
      this.homeHintT = 0;
      this.input.clearAttack();
      this.fireSuppressT = 0.28;
      this.notice = null;
      this.player.bob = 0;
      this.audio.play("start");
      this.showNotice("FLOOR 1-1", "DEFEAT THE ENEMIES", "#9fefff", 1.8);
    }

    /** Enter the endless wave arena from the sanctuary rift gate. */
    startWaveRun() {
      if (this.state !== "home" || !this.player) return false;
      if (!SK.WaveArena || !SK.WaveDirector) return false;
      this.audio.unlock();
      const heroId = this.selectedHeroId();
      this.player = new SK.Player(0, 0, heroId);
      this.mode = "waves";
      this.depth = 1;
      this.kills = 0;
      this.runTime = 0;
      this.runGems = 0;
      this.hintT = 12;
      this.homeHintT = 0;
      this.homeWaveNear = false;
      this.currentRoom = null;

      this.arena = new SK.WaveArena();
      this.dungeon = this.arena;
      this.enemies = [];
      this.crates = [];
      this.chests = [];
      this.bullets = [];
      this.beams = [];
      this.pickups = [];
      this.groundWeapons = [];
      this.particles = [];
      this.floats = [];
      this.effects = [];
      this.notice = null;
      this.advance = null;
      this.hurtVignette = 0;
      this.energyFlash = 0;
      this.shakeAmp = 0;
      this.homeNear = null;
      this.homePortalNear = false;

      const spawn = this.arena.spawnPoint;
      this.player.placeAt(spawn.x, spawn.y);
      this.player.iframes = 0;
      this.player.cooldowns = [0, 0];
      this.player.swing = null;
      this.player.noEnergyCd = 0;
      this.player.kx = 0;
      this.player.ky = 0;
      this.player.alive = true;
      this.player.deathTimer = 0;
      this.player.bob = 0;
      this.player.kamuiCasts = 0;
      if (this.player.wells) this.player.wells.clearTransient();
      if (this.player.resetRiftState) this.player.resetRiftState();

      this.waves = new SK.WaveDirector();
      this.state = "playing";
      this.paused = false;
      this.homeConfirm = false;
      this.stateT = 0;
      this.gameoverT = 0;
      this.input.clearAttack();
      this.fireSuppressT = 0.28;
      this.updateCamera(0, true);
      this.waves.begin(this, this.bestWave());
      return true;
    }

    /** Return to the sanctuary, wiping run progress but keeping meta save data. */
    returnHome(opts) {
      opts = opts || {};
      if (this.mode === "waves" && this.waves) this.waves.recordBest(this);
      this.state = "home";
      this.mode = "home";
      this.waves = null;
      this.arena = null;
      this.paused = false;
      this.homeConfirm = false;
      this.depth = 1;
      this.kills = 0;
      this.runTime = 0;
      this.runGems = 0;
      this.hintT = 0;
      this.homeHintT = 6;
      this.homeDenyT = 0;
      this.homeWaveNear = false;
      this.gemFlash = 0;
      this.notice = null;
      this.advance = null;
      this.currentRoom = null;

      this.enemies = [];
      this.crates = [];
      this.chests = [];
      this.bullets = [];
      this.beams = [];
      this.pickups = [];
      this.groundWeapons = [];
      this.particles = [];
      this.floats = [];
      this.effects = [];
      this.energyFlash = 0;
      this.hurtVignette = 0;
      this.shakeAmp = 0;

      this.dungeon = this.homeRoom;
      const spawn = this.homeRoom.spawnPoint;
      const heroId = this.selectedHeroId();
      this.player = new SK.Player(spawn.x, spawn.y, heroId);
      this.player.iframes = 0;
      this.player.bob = 0;
      this.input.clearAttack();
      this.fireSuppressT = 0.3;
      this.updateCamera(0, true);
      this.audio.play("home");
      if (!opts.fromDeath) {
        this.showNotice("SANCTUARY", "GEMS ARE KEPT", "#e8b04e", 1.8);
      }
    }

    writeSave() {
      return writeSave(this.saveData);
    }

    selectedHeroId() {
      let id = this.saveData.selectedHero;
      const def = SK.Heroes.defs[id];
      if (!def || this.saveData.unlockedHeroes.indexOf(id) < 0) {
        id = "knight";
        this.saveData.selectedHero = "knight";
      }
      return id;
    }

    /** Highest endless-wave reached, persisted in the meta save. */
    bestWave() {
      const n = this.saveData && Number.isFinite(this.saveData.bestWave) ? this.saveData.bestWave : 0;
      return Math.max(0, Math.floor(n));
    }

    addGems(amount, opts) {
      opts = opts || {};
      const n = Math.floor(amount);
      if (!n) return this.saveData.gems;
      this.saveData.gems = Math.max(0, this.saveData.gems + n);
      this.writeSave();
      if (n > 0) {
        this.gemFlash = 0.9;
        if (!opts.silent) this.audio.play("gem");
      }
      return this.saveData.gems;
    }

    spendGems(amount) {
      const n = Math.max(0, Math.floor(amount));
      if (this.saveData.gems < n) return false;
      this.saveData.gems -= n;
      this.writeSave();
      return true;
    }

    /** Collect a Gem pickup: persistent, saved immediately. */
    collectGem(gem) {
      this.addGems(1);
      this.runGems += 1;
      this.addFloatText(this.player.x, this.player.y - 34, "+1 GEM!", "#7dd3fc", {
        scale: 1,
        rise: 20,
        life: 1.0,
      });
      this.spawnParticles(this.player.x, this.player.y - 14, 12, {
        color: "#22d3ee",
        speed: 95,
        life: 0.45,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.6,
      });
      this.spawnParticles(this.player.x, this.player.y - 14, 8, {
        color: "#e879f9",
        speed: 70,
        life: 0.4,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.8,
      });
      this.shake(1.2, 0.1);
    }

    spawnGem(x, y, opts) {
      opts = opts || {};
      let gx = x;
      let gy = y;
      if (opts.toss) {
        gx += Math.random() * 14 - 7;
        gy += Math.random() * 8 - 4;
      }
      if (this.dungeon.isSolidPixel(gx, gy - 3)) {
        gx = x;
        gy = y;
      }
      const gem = new SK.Pickup("gem", gx, gy, 1, 0, 0);
      if (opts.toss) {
        gem.vx = (Math.random() * 2 - 1) * 26;
        gem.vy = (Math.random() * 2 - 1) * 14 - 8;
      }
      gem.bob = Math.random() * Math.PI * 2;
      this.pickups.push(gem);
      this.spawnParticles(gx, gy - 4, 5, {
        color: "#22d3ee",
        speed: 55,
        life: 0.3,
        size: 1,
        spread: 2,
        glow: true,
        drag: 3,
      });
      return gem;
    }

    /** Every 5th gravity greatsword swing calls down a Sky Meteor. */
    summonSkyMeteor(player, cfg) {
      let target = null;
      let best = cfg.targetRange || 230;
      for (const e of this.enemies) {
        if (!e.alive || e.banishing) continue;
        const d = Math.hypot(e.x - player.x, e.y - 10 - (player.y - 10));
        if (d < best) {
          best = d;
          target = e;
        }
      }
      let tx;
      let ty;
      if (target) {
        tx = target.x;
        ty = target.y;
      } else {
        const fb = cfg.fallback || 120;
        tx = player.x + player.aim.x * fb;
        ty = player.y + player.aim.y * fb;
      }
      const meteor = new SK.SkyMeteor(tx, ty, cfg);
      this.effects.push(meteor);
      this.audio.play("meteorFall");
      this.addFloatText(player.x, player.y - 50, "SKY METEOR!", "#c084fc", {
        scale: 1,
        rise: 16,
        life: 0.8,
      });
      return meteor;
    }

    meteorImpact(x, y, cfg) {
      const radius = cfg.radius || 48;
      const damage = cfg.damage || 18;
      const cy = y;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (Math.hypot(e.x - x, e.y - cy) <= radius) {
          e.takeDamage(damage, this, x, cy, 110);
        }
      }
      for (const crate of this.crates) {
        if (crate.dead) continue;
        if (Math.hypot(crate.x + 8 - x, crate.y + 8 - cy) <= radius + 6) {
          crate.hit(damage, this, Math.atan2(crate.y + 8 - cy, crate.x + 8 - x));
        }
      }
      this.shake(5, 0.42);
      this.audio.play("meteorHit");
      // Expanding dual-ring purple / white shockwave.
      this.effects.push(
        new SK.RingPulse(x, y, {
          life: 0.5,
          r0: 6,
          r1: 56,
          yScale: 0.58,
          colors: ["#a855f7", "#7e22ce", "#e879f9"],
          thickness: 2,
        })
      );
      this.effects.push(
        new SK.RingPulse(x, y, {
          life: 0.34,
          r0: 2,
          r1: 36,
          yScale: 0.58,
          colors: ["#ffffff", "#f5d0fe"],
          thickness: 2,
        })
      );
      this.effects.push(new SK.Crater(x, y));
      // Exactly 18 radial rock / spark debris particles.
      this.spawnParticles(x, y, 12, {
        color: "#4c1d95",
        speed: 170,
        life: 0.55,
        size: 2,
        spread: 2.8,
        gravity: 40,
        drag: 1.8,
      });
      this.spawnParticles(x, y, 6, {
        color: "#fb923c",
        speed: 135,
        life: 0.42,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.2,
      });
    }

    updateEffects(dt) {
      for (const fx of this.effects) fx.update(dt, this);
      this.effects = this.effects.filter((fx) => !fx.dead);
    }

    /** Massive Kamui portal splash: silences a whole area at once. */
    kamuiMegaImpact(x, y, opts) {
      opts = opts || {};
      const radius = opts.radius || 76;
      const damage = opts.damage || 9999;
      let hits = 0;
      for (const e of this.enemies) {
        if (!e.alive || e.banishing) continue;
        if (Math.hypot(e.x - x, e.y - 10 - y) > radius) continue;
        if (e.kamuiSplash) e.kamuiSplash(damage, this, x, y);
        else e.takeDamage(damage, this, x, y, 120);
        hits += 1;
      }
      for (const crate of this.crates) {
        if (crate.dead) continue;
        if (Math.hypot(crate.x + 8 - x, crate.y + 8 - y) <= radius + 6) {
          crate.hit(damage, this, Math.atan2(crate.y + 8 - y, crate.x + 8 - x));
        }
      }
      // The rift swallows hostile bullets caught inside it.
      for (const b of this.bullets) {
        if (b.friendly || b.dead) continue;
        if (Math.hypot(b.x - x, b.y - y) <= radius) {
          b.dead = true;
          b.burst(this, false);
        }
      }
      this.shake(6, 0.45);
      this.effects.push(
        new SK.RingPulse(x, y, {
          life: 0.52,
          r0: 8,
          r1: radius + 10,
          yScale: 0.62,
          colors: ["#ff2d3f", "#7f1620", "#ffd0d6"],
          thickness: 2,
        })
      );
      this.effects.push(
        new SK.RingPulse(x, y, {
          life: 0.36,
          r0: 4,
          r1: Math.round(radius * 0.7),
          yScale: 0.62,
          colors: ["#ffffff", "#ff7a88"],
          thickness: 2,
        })
      );
      this.spawnParticles(x, y, 20, {
        color: "#ff4658",
        speed: 175,
        life: 0.6,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2,
      });
      this.spawnParticles(x, y, 12, {
        color: "#050508",
        speed: 120,
        life: 0.5,
        size: 2,
        spread: 2.8,
        drag: 2.4,
      });
      this.addFloatText(x, y - 34, hits > 1 ? "MEGA BANISH x" + hits : "MEGA BANISH", "#ff4658", {
        scale: 1,
        rise: 18,
        life: 1.1,
      });
      return hits;
    }

    drawGroundEffects(ctx) {
      for (const fx of this.effects) {
        if (fx.layer === "ground") fx.draw(ctx, this);
      }
    }

    drawOverEffects(ctx) {
      for (const fx of this.effects) {
        if (fx.layer !== "ground") fx.draw(ctx, this);
      }
    }

    /** Hero unlock/select helper used by the home pedestal interaction. */
    selectHero(heroId) {
      return this.tryHeroPedestal({ id: heroId, spot: this.homeRoom.pedestals[heroId] }, false);
    }

    unlockHeroDebug(heroId) {
      if (this.saveData.unlockedHeroes.indexOf(heroId) < 0) {
        this.saveData.unlockedHeroes.push(heroId);
        this.saveData.selectedHero = heroId;
        this.writeSave();
        if (this.state === "home" && this.player) this.player.switchHero(heroId, this);
        return true;
      }
      return false;
    }

    onPlayerDeath() {
      if (this.mode === "waves" && this.waves) this.waves.recordBest(this);
      this.state = "gameover";
      this.gameoverT = 0;
      this.input.clearAttack();
      this.audio.play("death");
      this.spawnParticles(this.player.x, this.player.y - 10, 24, {
        color: "#ff5f6d",
        speed: 155,
        life: 0.85,
        size: 2,
        spread: 2.8,
        drag: 1.8,
      });
      this.spawnParticles(this.player.x, this.player.y - 10, 12, {
        color: "#ffe6a5",
        speed: 100,
        life: 0.65,
        size: 1,
        spread: 2.8,
        glow: true,
      });
      this.shake(4, 0.5);
      this.notice = null;
      this.beams = [];
    }

    beginAdvance() {
      if (this.state !== "playing") return;
      this.state = "advancing";
      this.advance = { phase: "out", t: 0 };
      this.input.clearAttack();
      this.notice = null;
      // Full-floor clear reward: entering the portal always grants one Gem.
      this.addGems(1, { silent: true });
      this.runGems += 1;
      this.audio.play("gem");
      this.addFloatText(this.player.x, this.player.y - 36, "+1 GEM!", "#7dd3fc", {
        scale: 1,
        rise: 22,
        life: 1.1,
      });
      this.spawnParticles(this.player.x, this.player.y - 14, 14, {
        color: "#22d3ee",
        speed: 110,
        life: 0.55,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.4,
      });
      const p = this.dungeon.portal;
      this.audio.play("portal");
      this.shake(2.5, 0.4);
      if (p) {
        this.spawnParticles(p.x, p.y, 26, {
          color: "#7fe8ff",
          speed: 130,
          life: 0.7,
          size: 2,
          spread: 2.8,
          glow: true,
          drag: 1.6,
        });
        this.spawnParticles(p.x, p.y, 12, {
          color: "#ffffff",
          speed: 80,
          life: 0.45,
          size: 1,
          spread: 2.8,
          glow: true,
        });
      }
    }

    updateAdvance(dt) {
      const a = this.advance;
      if (!a) {
        this.state = "playing";
        return;
      }
      a.t += dt;
      this.updateParticles(dt);
      this.updateFloats(dt);
      this.updateEffects(dt);
      this.shakeAmp = Math.max(0, this.shakeAmp - dt * 12);
      if (a.phase === "out") {
        if (a.t >= 0.55) {
          this.depth += 1;
          this.loadFloor(this.depth);
          this.advance = { phase: "in", t: 0 };
          this.fireSuppressT = 0.35;
          this.hintT = 0;
          this.updateCamera(0, true);
        }
      } else if (a.t >= 0.52) {
        this.state = "playing";
        this.advance = null;
        this.hintT = 0;
        this.showNotice("FLOOR 1-" + this.depth, "ENEMY HP +" + SK.Difficulty.hpPercent(this.depth) + "%", "#9fefff", 2.1);
        this.audio.play("floor");
      }
    }

    // ---------------------------------------------------------------------
    // Input routing
    // ---------------------------------------------------------------------
    homeButtonRect() {
      return { x: 410, y: 6, w: 64, h: 15 };
    }

    pauseHomeRect() {
      return { x: 160, y: 146, w: 160, h: 17 };
    }

    confirmButtons() {
      return {
        yes: { x: 74, y: 156, w: 166, h: 19 },
        no: { x: 252, y: 156, w: 154, h: 19 },
      };
    }

    pointInRect(px, py, r) {
      return px >= r.x && py >= r.y && px < r.x + r.w && py < r.y + r.h;
    }

    consumeUiClick() {
      this.input.mouseDown = false;
      this.input.clearAttack();
      this.fireSuppressT = 0.22;
    }

    openHomeConfirm() {
      if (this.state !== "playing" || this.homeConfirm) return false;
      this.paused = true;
      this.homeConfirm = true;
      this.consumeUiClick();
      this.audio.play("pause");
      return true;
    }

    cancelHomeConfirm() {
      this.homeConfirm = false;
      this.paused = false;
      this.consumeUiClick();
      this.audio.play("pause");
    }

    confirmReturnHome() {
      if (!this.homeConfirm) return false;
      this.homeConfirm = false;
      this.returnHome({ fromDeath: this.state === "gameover" });
      return true;
    }

    onPress(code) {
      this.audio.unlock();

      if (code === "KeyM") {
        this.audio.toggle();
        return;
      }

      if (this.homeConfirm) {
        if (code === "KeyY" || code === "Enter" || code === "NumpadEnter") {
          this.confirmReturnHome();
          return;
        }
        if (code === "MouseLeft") {
          const btns = this.confirmButtons();
          if (this.uiMouseIn(btns.yes, this.uiC())) {
            this.confirmReturnHome();
            return;
          }
          if (this.uiMouseIn(btns.no, this.uiC())) {
            this.cancelHomeConfirm();
            return;
          }
        }
        if (code === "KeyN" || code === "Escape" || code === "KeyP" || code === "MouseLeft") {
          this.cancelHomeConfirm();
        }
        return;
      }

      if (this.state === "home") {
        if (code === "KeyE" || code === "Enter" || code === "NumpadEnter") {
          this.tryHomeInteract();
          return;
        }
        if (code === "F3" || code === "Backquote") {
          this.debug = !this.debug;
        }
        return;
      }

      if (this.state === "gameover") {
        if (code === "KeyR" || code === "Enter" || code === "NumpadEnter" || code === "Space" || code === "MouseLeft") {
          this.returnHome({ fromDeath: true });
        }
        return;
      }

      if (this.state === "advancing") return;

      if (this.paused) {
        if (code === "KeyH" || (code === "MouseLeft" && this.uiMouseIn(this.pauseHomeRect(), this.uiC()))) {
          this.openHomeConfirm();
          return;
        }
        if (code === "Escape" || code === "KeyP" || code === "MouseLeft") {
          this.paused = false;
          this.input.clearAttack();
          this.fireSuppressT = 0.18;
          this.audio.play("pause");
        }
        return;
      }

      if (this.state === "playing") {
        if (code === "MouseLeft" && this.uiMouseIn(this.homeButtonRect(), this.uiTR())) {
          this.openHomeConfirm();
          return;
        }
        if (code === "Escape" || code === "KeyP") {
          this.paused = true;
          this.audio.play("pause");
          return;
        }
        if (code === "KeyH") {
          this.openHomeConfirm();
          return;
        }
        if (code === "KeyE") {
          this.tryPickupWeapon();
          return;
        }
        if (code === "KeyF") {
          this.player.activateSkill(this, 0);
          return;
        }
        if (code === "ShiftLeft" || code === "ShiftRight") {
          this.player.activateSkill(this, 1);
          return;
        }
        if (code === "KeyQ" || code === "MouseRight") {
          this.player.swapWeapon(this);
          return;
        }
        if (code === "Digit1" || code === "Digit2") {
          const idx = code === "Digit1" ? 0 : 1;
          if (this.player.weapons[idx] && this.player.weapon !== idx) {
            this.player.weapon = idx;
            this.player.swing = null;
            this.player.swapFlash = 0.22;
            this.audio.play("swap");
          }
          return;
        }
        if (code === "F3" || code === "Backquote") {
          this.debug = !this.debug;
          return;
        }
      }
    }

    /** E in the sanctuary: enter the portal, the wave rift, or use a pedestal. */
    tryHomeInteract() {
      if (this.state !== "home" || !this.player) return false;
      const gate = this.homeRoom.waveGate;
      if (gate && this.homeRoom.waveGateNear(this.player.x, this.player.y)) {
        return this.startWaveRun();
      }
      const portal = this.homeRoom.portal;
      const pd = Math.hypot(this.player.x - portal.x, this.player.y - 8 - portal.y);
      if (pd < 36) {
        this.startRun();
        return true;
      }
      const near = this.homeRoom.nearestPedestal(this.player.x, this.player.y);
      if (near) return this.tryHeroPedestal(near, true);
      return false;
    }

    /** Unlock or select a hero at its pedestal. */
    tryHeroPedestal(near, allowUnlock) {
      if (!near) return false;
      const hero = SK.Heroes.defs[near.id];
      if (!hero) return false;
      const selected = this.saveData.selectedHero;
      const unlocked = this.saveData.unlockedHeroes.indexOf(near.id) >= 0;
      const spot = near.spot || this.homeRoom.pedestals[near.id];

      if (!unlocked) {
        if (!allowUnlock) return false;
        if (this.saveData.gems >= hero.unlockCost) {
          this.spendGems(hero.unlockCost);
          this.saveData.unlockedHeroes.push(near.id);
          this.saveData.selectedHero = near.id;
          this.writeSave();
          this.player.switchHero(near.id, this);
          this.homeNear = null;
          this.homeDenyT = 0;
          this.audio.play("unlock");
          this.shake(2.4, 0.3);
          this.effects.push(
            new SK.RingPulse(spot.x, spot.y - 10, {
              life: 0.7,
              r0: 6,
              r1: 52,
              yScale: 0.7,
              colors: [hero.glow, hero.primary, "#f5d0fe"],
              thickness: 2,
            })
          );
          this.spawnParticles(spot.x, spot.y - 12, 34, {
            color: hero.primary,
            speed: 150,
            life: 0.7,
            size: 1,
            spread: 2.8,
            glow: true,
            drag: 2,
          });
          this.spawnParticles(spot.x, spot.y - 12, 14, {
            color: "#22d3ee",
            speed: 100,
            life: 0.55,
            size: 1,
            spread: 2.8,
            glow: true,
            drag: 2.4,
          });
          this.addFloatText(spot.x, spot.y - 44, hero.name + " UNLOCKED!", hero.primary, {
            scale: 1,
            rise: 20,
            life: 1.6,
          });
          this.showNotice(hero.name + " UNLOCKED!", hero.skill.name + " READY", hero.primary, 2.4);
          return true;
        }
        this.homeDenyT = 0.8;
        this.audio.play("deny");
        this.addFloatText(spot.x, spot.y - 40, "NEED " + (hero.unlockCost || 1) + " GEM!", "#ff6b6b", {
          scale: 1,
          rise: 18,
          life: 1.0,
        });
        return false;
      }

      if (selected === near.id) {
        this.audio.play("ui");
        return false;
      }

      this.saveData.selectedHero = near.id;
      this.writeSave();
      this.player.switchHero(near.id, this);
      this.homeNear = null;
      this.homeDenyT = 0;
      this.audio.play("equip");
      this.shake(1.2, 0.16);
      this.effects.push(
        new SK.RingPulse(spot.x, spot.y - 10, {
          life: 0.55,
          r0: 6,
          r1: 38,
          yScale: 0.7,
          colors: [hero.glow, hero.primary, "#ffffff"],
          thickness: 2,
        })
      );
      this.spawnParticles(spot.x, spot.y - 12, 20, {
        color: hero.primary,
        speed: 110,
        life: 0.5,
        size: 1,
        spread: 2.8,
        glow: true,
        drag: 2.4,
      });
      this.addFloatText(spot.x, spot.y - 42, hero.name + " EQUIPPED", hero.primary, {
        scale: 1,
        rise: 18,
        life: 1.2,
      });
      return true;
    }

    // ---------------------------------------------------------------------
    // Main loop
    // ---------------------------------------------------------------------
    loop(now) {
      const raw = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      const frame = Math.min(0.1, Math.max(0, raw));
      this.accumulator += frame;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 6) {
        this.update(STEP);
        this.accumulator -= STEP;
        steps++;
      }
      if (steps === 6) this.accumulator = 0;
      this.render();
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      this.time += dt;
      if (this.paused) return;
      this.stateT += dt;
      this.fireSuppressT = Math.max(0, this.fireSuppressT - dt);
      this.gemFlash = Math.max(0, this.gemFlash - dt);

      if (this.state === "home") {
        this.homeHintT = Math.max(0, this.homeHintT - dt);
        this.homeDenyT = Math.max(0, this.homeDenyT - dt);
        this.player.update(dt, this, { home: true });
        this.updateParticles(dt);
        this.updateFloats(dt);
        this.updateEffects(dt);

        this.homeNear = this.homeRoom.nearestPedestal(this.player.x, this.player.y);
        this.homeWaveNear = this.homeRoom.waveGateNear(this.player.x, this.player.y);
        const portal = this.homeRoom.portal;
        const pd = Math.hypot(this.player.x - portal.x, this.player.y - 8 - portal.y);
        this.homePortalNear = pd < 36;
        if (pd < 14) {
          this.startRun();
          return;
        }

        this.updateCamera(dt);
        this.shakeAmp = Math.max(0, this.shakeAmp - dt * 16);
        this.hurtVignette = Math.max(0, this.hurtVignette - dt * 1.9);
        if (this.notice) {
          this.notice.t += dt;
          if (this.notice.t >= this.notice.dur) this.notice = null;
        }
        return;
      }

      if (this.state === "gameover") {
        this.gameoverT += dt;
        this.updateParticles(dt);
        this.updateFloats(dt);
        this.updateEffects(dt);
        this.shakeAmp = Math.max(0, this.shakeAmp - dt * 9);
        this.hurtVignette = Math.max(0, this.hurtVignette - dt * 0.9);
        return;
      }

      if (this.state === "advancing") {
        this.updateAdvance(dt);
        return;
      }

      if (this.state !== "playing") return;

      this.runTime += dt;
      this.hintT = Math.max(0, this.hintT - dt);
      this.updateRoomGates(dt);

      this.player.update(dt, this);
      if (this.state !== "playing") return;

      for (const e of this.enemies) e.update(dt, this);
      for (const b of this.bullets) b.update(dt, this);
      for (const b of this.beams) b.update(dt);
      for (const c of this.crates) c.update(dt);
      for (const c of this.chests) c.update(dt, this);
      for (const p of this.pickups) p.update(dt, this);
      for (const g of this.groundWeapons) g.update(dt, this);
      this.updateParticles(dt);
      this.updateFloats(dt);
      this.updateEffects(dt);
      this.energyFlash = Math.max(0, this.energyFlash - dt);

      this.enemies = this.enemies.filter((e) => !e.dead);
      this.crates = this.crates.filter((c) => !c.dead);
      this.bullets = this.bullets.filter((b) => !b.dead);
      this.beams = this.beams.filter((b) => !b.dead);
      this.pickups = this.pickups.filter((p) => !p.dead);
      this.groundWeapons = this.groundWeapons.filter((g) => !g.dead);

      this.updateRooms(dt);
      if (this.mode === "waves") {
        if (this.waves) this.waves.update(dt, this);
      } else {
        this.updateExploration();
        this.checkPortal();
      }

      if (this.notice) {
        this.notice.t += dt;
        if (this.notice.t >= this.notice.dur) this.notice = null;
      }

      this.updateCamera(dt);
      this.shakeAmp = Math.max(0, this.shakeAmp - dt * 16);
      this.hurtVignette = Math.max(0, this.hurtVignette - dt * 1.9);
      this.player.swapFlash = Math.max(0, this.player.swapFlash - dt);
    }

    updateRoomGates(dt) {
      for (const room of this.dungeon.rooms) {
        const target = room.locked ? 1 : 0;
        const k = Math.min(1, dt * 15);
        room.gateT += (target - room.gateT) * k;
        if (Math.abs(room.gateT - target) < 0.01) room.gateT = target;
      }
    }

    updateRooms(dt) {
      const p = this.player;
      if (!p || !p.alive) return;
      const rect = p.getRect();
      for (const room of this.dungeon.rooms) {
        if (room.type !== "combat" || room.cleared) continue;
        const aliveInRoom = this.enemies.some((e) => e.alive && e.roomId === room.id);
        if (!room.locked) {
          if (this.dungeon.rectFullyInsideRoom(rect.x, rect.y, rect.w, rect.h, room)) {
            if (aliveInRoom) this.lockRoom(room);
            else this.clearRoom(room);
          }
        } else if (!aliveInRoom) {
          this.clearRoom(room);
        }
      }
    }

    lockRoom(room) {
      room.locked = true;
      room.gateT = Math.max(room.gateT, 0.02);
      for (const e of this.enemies) {
        if (e.roomId === room.id && e.alive) e.activate(this);
      }
      for (const g of room.gates) {
        this.spawnParticles(g.x + g.w / 2, g.y + g.h / 2, 6, {
          color: "#ff5066",
          speed: 65,
          life: 0.25,
          size: 1,
          spread: 2.4,
          glow: true,
        });
      }
      this.shake(2.4, 0.22);
      this.audio.play("gate");
      this.showNotice("ROOM SEALED", "DEFEAT THE ENEMIES", "#ff6977", 1.1);
    }

    clearRoom(room) {
      if (room.cleared) return;
      room.cleared = true;
      room.locked = false;
      if (!room.chestSpawned && room.content.chest) {
        const c = room.content.chest;
        const chest = new SK.Chest(c.x * TILE + 8, (c.y + 1) * TILE, {
          containsGem: Math.random() < 0.45,
        });
        this.chests.push(chest);
        room.chestSpawned = true;
        this.spawnParticles(chest.x, chest.y - 8, 18, {
          color: "#ffd86b",
          speed: 95,
          life: 0.55,
          size: 1,
          spread: 2.8,
          glow: true,
        });
      }
      this.shake(1.4, 0.15);
      this.audio.play("clear");
      this.showNotice("ROOM CLEARED", "A CHEST APPEARS", "#ffd86b", 2.0);
    }

    updateExploration() {
      const p = this.player;
      const room = this.dungeon.roomAtPixel(p.x, p.y - 4) || this.dungeon.roomAtPixel(p.x, p.y);
      if (room) {
        room.explored = true;
        this.currentRoom = room;
      }
    }

    checkPortal() {
      if (!this.dungeon.portal || !this.player.alive) return;
      if (this.player.isRifting && this.player.isRifting()) return;
      const p = this.dungeon.portal;
      const py = this.player.y - 7;
      if (Math.hypot(this.player.x - p.x, py - p.y) < 15) this.beginAdvance();
    }

    updateCamera(dt, snap) {
      if (!this.dungeon) return;
      const b = this.dungeon.contentBounds;
      const pad = 24;
      const viewW = VW;
      const viewH = VH;
      const riftFree = this.player && this.player.isInRift && this.player.isInRift();
      let targetX = this.player.x - viewW / 2;
      let targetY = this.player.centerY ? this.player.centerY() - viewH / 2 : this.player.y - 14 - viewH / 2;
      const minX = b.px - pad;
      const maxX = b.px + b.pw + pad - viewW;
      const minY = b.py - pad;
      const maxY = b.py + b.ph + pad - viewH;
      if (riftFree) {
        // The alternate dimension has no room bounds: keep the walker centered
        // while they pass through walls and beyond the generated floor.
        targetX = this.player.x - viewW / 2;
        targetY = this.player.centerY() - viewH / 2;
      } else {
        if (maxX <= minX) targetX = (minX + maxX) / 2;
        else targetX = clamp(targetX, minX, maxX);
        if (maxY <= minY) targetY = (minY + maxY) / 2;
        else targetY = clamp(targetY, minY, maxY);
      }
      if (snap || dt <= 0) {
        this.camX = targetX;
        this.camY = targetY;
      } else {
        const k = 1 - Math.exp(-8.5 * dt);
        this.camX += (targetX - this.camX) * k;
        this.camY += (targetY - this.camY) * k;
      }
    }

    /** Nearest walkable pixel for returning from the rift without clipping. */
    findFreeSpot(x, y, maxRadius) {
      const maxR = maxRadius || 96;
      const free = (px, py) =>
        !this.dungeon.rectHitsTiles(px - 5, py - 8, 10, 8) &&
        !this.dungeon.isSolidPixel(px, py - 1) &&
        !this.dungeon.isSolidPixel(px, py - 4) &&
        !this.gateAtRect(px - 5, py - 8, 10, 8) &&
        !this.crateAtRect(px - 5, py - 8, 10, 8);
      if (free(x, y)) return { x: x, y: y };
      for (let r = 8; r <= maxR; r += 8) {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (free(px, py)) return { x: px, y: py };
        }
      }
      const spawn = this.dungeon.spawnPoint || { x: x, y: y };
      return { x: spawn.x, y: spawn.y };
    }

    // ---------------------------------------------------------------------
    // Helpers used by entities
    // ---------------------------------------------------------------------
    isBlocked(x, y, w, h) {
      if (this.dungeon.rectHitsTiles(x, y, w, h)) return true;
      for (const c of this.crates) {
        if (c.dead) continue;
        const r = c.getRect();
        if (rectsOverlap(x, y, w, h, r.x, r.y, r.w, r.h)) return true;
      }
      if (this.gateAtRect(x, y, w, h)) return true;
      return false;
    }

    crateAtRect(x, y, w, h) {
      for (const c of this.crates) {
        if (c.dead) continue;
        const r = c.getHitRect();
        if (rectsOverlap(x, y, w, h, r.x, r.y, r.w, r.h)) return c;
      }
      return null;
    }

    gateAtRect(x, y, w, h) {
      for (const room of this.dungeon.rooms) {
        if (!room.locked) continue;
        for (const g of room.gates) {
          if (rectsOverlap(x, y, w, h, g.x, g.y, g.w, g.h)) return g;
        }
      }
      return null;
    }

    findAimTarget(x, y, range) {
      let best = null;
      let bestDist = range;
      for (const e of this.enemies) {
        if (!e.alive || e.banishing) continue;
        const dx = e.x - x;
        const dy = e.y - 10 - y;
        const d = Math.hypot(dx, dy);
        if (d > bestDist) continue;
        if (!this.targetVisible(x, y, e)) continue;
        best = e;
        bestDist = d;
      }
      return best;
    }

    targetVisible(x, y, e) {
      if (!e || !e.alive) return false;
      if (!this.dungeon.lineOfSight(x, y, e.x, e.y - 10)) return false;
      for (const c of this.crates) {
        if (c.dead) continue;
        const r = c.getHitRect();
        if (this.dungeon.segmentHitsRect(x, y, e.x, e.y - 10, r.x, r.y, r.w, r.h)) return false;
      }
      return true;
    }

    spawnParticles(x, y, count, opts) {
      opts = opts || {};
      for (let i = 0; i < count; i++) {
        let a;
        if (opts.angle == null) a = Math.random() * Math.PI * 2;
        else a = opts.angle + (Math.random() - 0.5) * (opts.spread == null ? Math.PI * 2 : opts.spread);
        const speed = (opts.speed || 50) * (0.35 + Math.random() * 0.85);
        this.particles.push(
          new SK.Particle(x, y, Math.cos(a) * speed, Math.sin(a) * speed, (opts.life || 0.3) * (0.7 + Math.random() * 0.6), opts.color || "#ffffff", opts.size || 1, {
            glow: opts.glow,
            drag: opts.drag,
            gravity: opts.gravity,
          })
        );
      }
      if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
    }

    spawnPickups(x, y, type, count, spread) {
      for (let i = 0; i < count; i++) {
        const a = count === 1 ? Math.random() * Math.PI * 2 : (i / count) * Math.PI * 2 + Math.random() * 0.7;
        const sp = (spread || 40) * (0.4 + Math.random() * 0.75);
        const vx = Math.cos(a) * sp;
        const vy = Math.sin(a) * sp - 15;
        this.pickups.push(
          new SK.Pickup(type, x + Math.cos(a) * 3, y + Math.sin(a) * 3, type === "hp" ? 2 : 12, vx, vy)
        );
      }
    }

    /** Pick up the nearest ground weapon within 22 px (E / F). */
    tryPickupWeapon() {
      const p = this.player;
      if (!p || !p.alive) return false;
      let best = null;
      let bestDist = 22.01;
      for (const g of this.groundWeapons) {
        if (g.dead) continue;
        const d = Math.hypot(p.x - g.x, p.y - 4 - g.y);
        if (d <= 22 && d < bestDist) {
          best = g;
          bestDist = d;
        }
      }
      if (!best) return false;
      return p.pickupWeapon(best, this);
    }

    /** Create a bobbing floor weapon, optionally with a small toss. */
    dropWeapon(def, x, y, opts) {
      opts = opts || {};
      if (!def) return null;
      let gx = x;
      let gy = y;
      if (opts.toss) {
        const a = Math.random() * Math.PI * 2;
        const dist = 10 + Math.random() * 10;
        gx += Math.cos(a) * dist;
        gy += Math.sin(a) * 4;
      }
      if (this.dungeon.isSolidPixel(gx, gy - 4) || this.dungeon.isSolidPixel(gx, gy - 1)) {
        gx = x;
        gy = y;
      }
      const gw = new SK.GroundWeapon(def, gx, gy, opts);
      if (opts.toss) {
        const sp = opts.tossSpeed || 24;
        gw.vx = (Math.random() * 2 - 1) * sp;
        gw.vy = (Math.random() * 2 - 1) * sp * 0.4;
      }
      this.groundWeapons.push(gw);
      const rarity = SK.RARITY[def.rarity] || SK.RARITY.common;
      this.spawnParticles(gx, gy - 6, 5, {
        color: rarity.color,
        speed: 60,
        life: 0.3,
        size: 1,
        spread: 2,
        glow: true,
        drag: 3,
      });
      return gw;
    }

    /** Ray-march a beam muzzle-to-wall (gates included) for the railgun. */
    castBeam(x, y, angle, maxDist) {
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      let d = 0;
      const step = 2;
      while (d < maxDist) {
        const nd = Math.min(maxDist, d + step);
        const px = x + dx * nd;
        const py = y + dy * nd;
        if (this.dungeon.isSolidPixel(px, py) || this.gateAtRect(px - 0.5, py - 0.5, 1, 1)) break;
        d = nd;
      }
      return { x: x + dx * d, y: y + dy * d, dist: d };
    }

    flashEnergy(amount) {
      this.energyFlash = Math.max(this.energyFlash, amount);
    }

    onEnergySpent(cost) {
      if (cost > 0) this.energyFlash = Math.max(this.energyFlash, 0.12);
    }

    updateParticles(dt) {
      for (const p of this.particles) p.update(dt);
      this.particles = this.particles.filter((p) => !p.dead);
    }

    updateFloats(dt) {
      for (const f of this.floats) f.update(dt);
      this.floats = this.floats.filter((f) => !f.dead);
      if (this.floats.length > 40) this.floats.splice(0, this.floats.length - 40);
    }

    addFloatText(x, y, text, color, opts) {
      this.floats.push(new SK.FloatText(x, y, text, color, opts));
    }

    shake(amount, duration) {
      this.shakeAmp = Math.max(this.shakeAmp, amount);
    }

    sfx(name) {
      this.audio.play(name);
    }

    showNotice(text, sub, color, dur) {
      this.notice = { text: text, sub: sub || "", color: color || "#eef2f8", t: 0, dur: dur || 2 };
    }

    onEnemyKilled(enemy) {
      this.kills += 1;
      const drops = enemy && enemy.type === "turret" ? 3 : Math.random() < 0.38 ? 2 : 1;
      this.spawnPickups(enemy.x, enemy.y - 8, "energy", drops, 55);
      // Small 8% chance for a persistent Gem on any enemy death.
      if (enemy && Math.random() < 0.08) {
        this.spawnGem(enemy.x, enemy.y - 6, { toss: true });
      }
    }

    onCrateBroken() {}

    onChestOpened(chest) {
      // Chest handles loot; add a little camera life.
      this.shake(1, 0.1);
    }

    // ---------------------------------------------------------------------
    // Rendering
    // ---------------------------------------------------------------------
    render() {
      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;
      // World pass: the backing store is 2x, so every world pixel keeps the
      // exact on-screen size it had before the UI was scaled down.
      ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
      ctx.fillStyle = "#07090d";
      ctx.fillRect(0, 0, VW, VH);

      if (this.state === "home") {
        this.drawHomeWorld(ctx);
        this.drawDust(ctx);
        this.drawVignettes(ctx);
        // Interface pass: half-sized UI pixels at double backing resolution.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.drawHomeHUD(ctx);
        this.drawNotice(ctx);
        ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
        this.drawHeroCards(ctx);
        if (this.debug) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          this.drawDebugOverlay(ctx);
        }
        return;
      }

      this.drawWorld(ctx);
      this.drawDust(ctx);
      this.drawVignettes(ctx);

      // Alternate dimension wash: light purple, world still readable beneath.
      if (this.player && this.player.riftOverlayAlpha) {
        const riftA = this.player.riftOverlayAlpha();
        if (riftA > 0.01 && SK.Kamui) {
          SK.Kamui.drawRiftOverlay(ctx, this.time, VW, VH, riftA);
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this.state === "playing") {
        this.drawHUD(ctx);
        if (this.paused) {
          this.drawPauseOverlay(ctx);
          if (this.homeConfirm) this.drawHomeConfirmModal(ctx);
        } else {
          this.drawNotice(ctx);
          this.drawHint(ctx);
        }
      } else if (this.state === "advancing") {
        this.drawAdvanceOverlay(ctx);
      } else if (this.state === "gameover") {
        this.drawGameOverOverlay(ctx);
      }

      if (this.debug) this.drawDebugOverlay(ctx);
    }

    drawWorld(ctx) {
      const shake = this.shakeAmp;
      let sx = 0;
      let sy = 0;
      if (shake > 0.1) {
        sx = Math.round((Math.random() * 2 - 1) * Math.min(5, shake));
        sy = Math.round((Math.random() * 2 - 1) * Math.min(5, shake));
      }
      const camX = Math.round(this.camX) + sx;
      const camY = Math.round(this.camY) + sy;

      ctx.save();
      ctx.translate(-camX, -camY);
      this.dungeon.drawFloor(ctx, camX, camY, VW, VH, this.time);
      this.dungeon.drawDoorThresholds(ctx, this.time);
      this.dungeon.drawWalls(ctx, camX, camY, VW, VH);
      this.dungeon.drawGates(ctx, this.time);
      this.dungeon.drawPortal(ctx, this.time);
      this.drawGroundEffects(ctx);

      for (const p of this.pickups) p.draw(ctx, this);
      for (const g of this.groundWeapons) g.draw(ctx, this);

      const list = [];
      for (const c of this.crates) if (!c.dead) list.push({ y: c.y + 16, kind: "crate", o: c });
      for (const c of this.chests) list.push({ y: c.y, kind: "chest", o: c });
      for (const e of this.enemies) if (e.alive) list.push({ y: e.y, kind: "enemy", o: e });
      if (this.player && this.player.alive) list.push({ y: this.player.y, kind: "player", o: this.player });
      list.sort((a, b) => a.y - b.y);
      for (const item of list) {
        if (item.kind === "crate") item.o.draw(ctx);
        else if (item.kind === "chest") item.o.draw(ctx, this);
        else if (item.kind === "enemy") item.o.draw(ctx, this);
        else if (item.kind === "player") item.o.draw(ctx, this);
      }

      for (const b of this.bullets) b.draw(ctx, this);
      for (const b of this.beams) b.draw(ctx);
      if (this.player && this.player.alive) {
        this.player.drawSlash(ctx, this);
        this.player.drawSkillWorld(ctx, this);
      }
      this.drawOverEffects(ctx);
      for (const p of this.particles) p.draw(ctx);
      for (const f of this.floats) f.draw(ctx);
      if (this.player && this.player.alive && this.state === "playing" && !this.paused) {
        for (const g of this.groundWeapons) {
          if (g.nearPlayer(this.player)) g.drawNameplate(ctx, this);
        }
        this.player.drawReticle(ctx, this);
      }

      if (this.debug) this.drawDebugWorld(ctx);
      ctx.restore();
    }

    drawDust(ctx) {
      ctx.save();
      ctx.fillStyle = "#cfd8e6";
      for (let i = 0; i < 22; i++) {
        const x = (i * 97 + this.time * (2.2 + (i % 4) * 0.7) + 31) % VW;
        const y = (i * 53 + Math.sin(this.time * 0.6 + i * 1.7) * 9 + 19) % VH;
        ctx.globalAlpha = 0.06 + (i % 3) * 0.025;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      ctx.restore();
    }

    drawVignettes(ctx) {
      ctx.drawImage(this.vignette, 0, 0);
      if (this.hurtVignette > 0.01) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, this.hurtVignette);
        ctx.drawImage(this.hurtTint === "blue" ? this.blueVignette : this.redVignette, 0, 0);
        ctx.restore();
      }
      if (this.state === "playing" && this.player && this.player.alive && this.player.hp <= 2) {
        const pulse = 0.12 + 0.07 * (0.5 + 0.5 * Math.sin(this.time * 5));
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.drawImage(this.redVignette, 0, 0);
        ctx.restore();
      }
    }

    // ---------------------------------------------------------------------
    // HUD
    // ---------------------------------------------------------------------
    /**
     * An interface layer anchored to a world-space point. Design coordinates
     * are the original 480x270 HUD layout; one design pixel covers half a
     * world pixel, so the UI renders at 50% of the world's size.
     */
    uiLayer(anchorX, anchorY, designX, designY) {
      return {
        tx: Math.round(anchorX * UI_SCALE - designX),
        ty: Math.round(anchorY * UI_SCALE - designY),
      };
    }

    uiTL() { return this.uiLayer(0, 0, 0, 0); }
    uiTC() { return this.uiLayer(VW / 2, 0, UI_DW / 2, 0); }
    uiTR() { return this.uiLayer(VW, 0, UI_DW, 0); }
    uiBL() { return this.uiLayer(0, VH, 0, UI_DH); }
    uiBC() { return this.uiLayer(VW / 2, VH, UI_DW / 2, UI_DH); }
    uiBR() { return this.uiLayer(VW, VH, UI_DW, UI_DH); }
    uiC() { return this.uiLayer(VW / 2, VH / 2, UI_DW / 2, UI_DH / 2); }

    withUI(ctx, layer, draw) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, layer.tx, layer.ty);
      draw();
      ctx.restore();
    }

    /** World-space mouse point converted into a layer's design space. */
    uiMouseIn(rect, layer) {
      const mx = this.input.mouseX * UI_SCALE - layer.tx;
      const my = this.input.mouseY * UI_SCALE - layer.ty;
      return this.pointInRect(mx, my, rect);
    }

    drawPanel(ctx, x, y, w, h, opts) {
      opts = opts || {};
      const border = opts.border || "#39445a";
      const alpha = opts.alpha == null ? 0.8 : opts.alpha;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = opts.fill || "#0a0d13";
      ctx.fillRect(x + 1, y, w - 2, h);
      ctx.fillRect(x, y + 1, w, h - 2);
      ctx.globalAlpha = alpha * 0.98;
      ctx.fillStyle = border;
      ctx.fillRect(x + 1, y, w - 2, 1);
      ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
      ctx.fillRect(x, y + 1, 1, h - 2);
      ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x + 2, y + 1, w - 4, 1);
      if (opts.gold) {
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle = "#e8b04e";
        ctx.fillRect(x + 2, y + 2, 3, 1);
        ctx.fillRect(x + 2, y + 2, 1, 3);
        ctx.fillRect(x + w - 5, y + 2, 3, 1);
        ctx.fillRect(x + w - 3, y + 2, 1, 3);
      }
      ctx.restore();
    }

    drawSegments(ctx, x, y, w, h, count, value, base, hot, dim) {
      ctx.save();
      ctx.fillStyle = "#070a10";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      const unit = w / count;
      for (let i = 0; i < count; i++) {
        const sx = Math.round(x + i * unit);
        const ex = Math.round(x + (i + 1) * unit) - 1;
        const sw = Math.max(1, ex - sx);
        if (i < value) {
          ctx.fillStyle = base;
          ctx.fillRect(sx, y, sw, h);
          ctx.fillStyle = hot;
          ctx.fillRect(sx, y, sw, 1);
          ctx.fillStyle = dim;
          ctx.fillRect(sx, y + h - 1, sw, 1);
        } else {
          ctx.fillStyle = "#171b25";
          ctx.fillRect(sx, y, sw, h);
          ctx.fillStyle = "#0d1017";
          ctx.fillRect(sx, y + h - 1, sw, 1);
        }
      }
      ctx.restore();
    }

    drawEnergyBar(ctx, x, y, w, h, value, max) {
      ctx.save();
      ctx.fillStyle = "#070a10";
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = "#171b25";
      ctx.fillRect(x, y, w, h);
      const fillW = Math.max(0, Math.min(w, Math.round((value / max) * w)));
      if (fillW > 0) {
        ctx.fillStyle = "#e7b62f";
        ctx.fillRect(x, y, fillW, h);
        ctx.fillStyle = "#ffe45c";
        ctx.fillRect(x, y, fillW, 2);
        ctx.fillStyle = "#a97713";
        ctx.fillRect(x, y + h - 1, fillW, 1);
      }
      ctx.fillStyle = "#0b0e14";
      for (let i = 1; i < 8; i++) {
        const nx = Math.round(x + (w * i) / 8);
        ctx.fillRect(nx, y + 1, 1, h - 2);
      }
      if (this.energyFlash > 0) {
        const current = this.player.currentWeapon();
        ctx.globalAlpha = Math.min(1, this.energyFlash * 2.6);
        ctx.fillStyle = current && this.player.energy < current.energyCost ? "#ff5a63" : "#ffe45c";
        ctx.fillRect(x - 2, y - 2, w + 4, 1);
        ctx.fillRect(x - 2, y + h + 1, w + 4, 1);
        ctx.fillRect(x - 2, y - 2, 1, h + 4);
        ctx.fillRect(x + w + 1, y - 2, 1, h + 4);
      }
      ctx.restore();
    }

    drawHUD(ctx) {
      const p = this.player;
      if (!p) return;

      // Left column: vitals + skill panel.
      this.withUI(ctx, this.uiTL(), () => {
        this.drawStatsPanel(ctx);
        this.drawSkillHUD(ctx);
      });

      // Floor / wave badge, top centre.
      this.withUI(ctx, this.uiTC(), () => {
        this.drawPanel(ctx, 208, 6, 64, 31, { border: "#3d4a60", alpha: 0.82, gold: true });
        if (this.mode === "waves") {
          FONT.draw(ctx, "WAVE", 240, 10, { color: "#ff9aa4", align: "center", alpha: 0.85 });
          FONT.draw(ctx, String(this.waves ? Math.max(1, this.waves.wave) : 1), 240, 18, {
            color: "#ffe09a",
            align: "center",
            scale: 2,
            shadow: "#0a0c12",
          });
        } else {
          FONT.draw(ctx, "FLOOR", 240, 10, { color: "#b7c6d8", align: "center", alpha: 0.8 });
          FONT.draw(ctx, "1-" + this.depth, 240, 18, { color: "#ffe09a", align: "center", scale: 2, shadow: "#0a0c12" });
        }
      });

      // Top-right cluster: gems, HOME and minimap / wave panel.
      this.withUI(ctx, this.uiTR(), () => {
        this.drawGemCounter(ctx, 346, 6, 62);
        this.drawHomeButton(ctx);
        if (this.mode === "waves") this.drawWavePanel(ctx);
        else this.drawMinimap(ctx);
      });

      this.withUI(ctx, this.uiBL(), () => this.drawWeaponSlots(ctx));

      if (this.audio.muted) {
        this.withUI(ctx, this.uiBR(), () => {
          FONT.draw(ctx, "MUTED [M]", 474, 262, { color: "#6c7a8e", align: "right", alpha: 0.75 });
        });
      }
    }

    drawStatsPanel(ctx) {
      const p = this.player;
      this.drawPanel(ctx, 6, 6, 168, 52, { border: "#3b475d", alpha: 0.84 });

      // Icons
      ctx.drawImage(SK.Sprites.get("heart"), 12, 10);
      ctx.drawImage(SK.Sprites.get("shield"), 12, 23);
      ctx.drawImage(SK.Sprites.get("bolt"), 13, 36);

      // Stat labels
      FONT.draw(ctx, "HP", 24, 11, { color: "#ff9aa2", alpha: 0.85 });
      FONT.draw(ctx, "AR", 24, 24, { color: "#9fdcff", alpha: 0.85 });
      FONT.draw(ctx, "EN", 24, 37, { color: "#ffe45c", alpha: 0.85 });

      // Bars
      this.drawSegments(ctx, 43, 11, 74, 7, p.maxHp, p.hp, "#e7424f", "#ff858e", "#9f2531");
      this.drawSegments(ctx, 43, 24, 74, 6, p.maxArmor, p.armor, "#2f8fdd", "#90e2ff", "#1a5594");
      this.drawEnergyBar(ctx, 43, 37, 74, 6, p.energy, p.maxEnergy);

      // Values
      FONT.draw(ctx, p.hp + "/" + p.maxHp, 166, 11, { color: "#ffc1c5", align: "right", shadow: "#0a0c12" });
      FONT.draw(ctx, p.armor + "/" + p.maxArmor, 166, 24, { color: "#b7e7ff", align: "right", shadow: "#0a0c12" });
      FONT.draw(ctx, p.energy + "/" + p.maxEnergy, 166, 37, { color: "#ffeaa0", align: "right", shadow: "#0a0c12" });
    }

    /** Skill icon, keybind badge, active glow and cooldown sweep. */
    drawSkillHUD(ctx) {
      const p = this.player;
      if (!p) return;
      const skills = [p.hero.skill];
      if (p.hero.skill2) skills.push(p.hero.skill2);
      const two = skills.length > 1;
      const x = 6;
      const y = 62;
      const w = two ? 184 : 168;
      const h = two ? 48 : 24;
      this.drawPanel(ctx, x, y, w, h, { border: "#3b475d", alpha: 0.84 });
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 6.5);

      for (let slot = 0; slot < skills.length; slot++) {
        const skill = skills[slot];
        const rowY = y + slot * 24;
        const iconX = x + 4;
        const iconY = rowY + 4;
        const col = skill.color;
        const col2 = skill.color2;
        let active = false;
        let cooling = false;
        let ready = true;
        let frac = 1;
        let barCol = col;
        let radialFrac = null;
        let timerLabel = "READY";
        let timerColor = "#7fe6a8";
        let iconAlpha = 0.8;

        if (skill.id === "gravityWells") {
          const wells = p.wells;
          const orbs = wells ? wells.orbs.length : 0;
          const bh = wells ? wells.blackHole : null;
          const forming = wells ? wells.forming : null;
          const bhDuration = skill.blackHoleDuration || 3.0;
          const orbInterval = skill.orbInterval || 2.5;

          if (bh) {
            active = true;
            iconAlpha = 0.95;
            timerColor = col;
            if (bh.state === "anchored") {
              const rem = Math.max(0, bhDuration - bh.stateT);
              timerLabel = rem.toFixed(1) + "S";
              frac = Math.max(0, rem / bhDuration);
            } else if (bh.state === "dissipating") {
              timerLabel = "FADE";
              frac = bh.alpha;
            } else {
              timerLabel = "SEEK";
              frac = 1;
            }
            barCol = col;
          } else if (forming) {
            active = true;
            iconAlpha = 0.95;
            timerLabel = "FORM";
            timerColor = col;
            frac = 1;
            barCol = col;
          } else if (wells && wells.cooldown > 0) {
            cooling = true;
            iconAlpha = 0.5;
            timerLabel = wells.cooldown.toFixed(1) + "S";
            timerColor = col;
            frac = 1 - wells.cooldown / (wells.cooldownMax || 20);
            barCol = col2;
            radialFrac = frac;
          } else {
            timerLabel = orbs >= 3 ? "READY" : orbs + "/3";
            timerColor = orbs >= 3 ? "#7fe6a8" : col;
            frac = orbs / 3;
            barCol = col;
            iconAlpha = 0.8;
            if (orbs < 3 && wells) {
              radialFrac = 1 - Math.max(0, wells.orbTimer) / orbInterval;
            }
          }
        } else if (skill.id === "kamuiRift") {
          timerColor = col;
          if (p.rift === "entering") {
            active = true;
            iconAlpha = 0.95;
            timerLabel = "ENTER";
            frac = clamp(p.riftT / p.riftDur, 0, 1);
            barCol = col;
          } else if (p.rift === "rift") {
            active = true;
            iconAlpha = 0.95;
            timerLabel = p.riftTime.toFixed(1) + "S";
            frac = 1;
            barCol = col;
          } else if (p.rift === "exiting") {
            active = true;
            iconAlpha = 0.95;
            timerLabel = "EXIT";
            frac = 1 - clamp(p.riftT / p.riftDur, 0, 1);
            barCol = col;
          } else if (p.riftCooldown > 0) {
            cooling = true;
            iconAlpha = 0.5;
            timerLabel = p.riftCooldown.toFixed(1) + "S";
            frac = 1 - p.riftCooldown / (skill.cooldown || 6);
            barCol = col2;
            radialFrac = frac;
          } else {
            timerLabel = "READY";
            timerColor = "#7fe6a8";
            frac = 1;
            barCol = col;
          }
        } else if (skill.id === "intangibility") {
          timerColor = col;
          if (p.phaseActive > 0) {
            active = true;
            iconAlpha = 0.95;
            timerLabel = p.phaseActive.toFixed(1) + "S";
            frac = p.phaseActive / (skill.duration || 4);
            barCol = col;
          } else if (p.phaseCooldown > 0) {
            cooling = true;
            iconAlpha = 0.5;
            timerLabel = p.phaseCooldown.toFixed(1) + "S";
            frac = 1 - p.phaseCooldown / (skill.cooldown || 9);
            barCol = col2;
            radialFrac = frac;
          } else {
            timerLabel = "READY";
            timerColor = "#7fe6a8";
            frac = 1;
            barCol = col;
          }
        } else {
          active = p.skillActive > 0;
          cooling = !active && p.skillCooldown > 0;
          ready = p.skillCooldown <= 0;
          if (active) {
            iconAlpha = 0.95;
            timerLabel = p.skillActive.toFixed(1) + "S";
            timerColor = col;
            frac = p.skillActive / skill.duration;
            barCol = col;
          } else if (cooling) {
            iconAlpha = 0.5;
            timerLabel = p.skillCooldown.toFixed(1) + "S";
            timerColor = col;
            frac = 1 - p.skillCooldown / skill.cooldown;
            barCol = col2;
            radialFrac = 1 - p.skillCooldown / skill.cooldown;
          } else {
            iconAlpha = 0.8;
            timerLabel = "READY";
            timerColor = "#7fe6a8";
            frac = 1;
            barCol = col;
          }
        }

        // Icon plate and icon.
        ready = !active && !cooling;
        ctx.save();
        ctx.fillStyle = "#080b11";
        ctx.fillRect(iconX - 1, iconY - 1, 16, 16);
        ctx.globalAlpha = iconAlpha;
        const icon = SK.Sprites.get(skill.icon);
        ctx.drawImage(icon, iconX, iconY);
        if (active) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.3 + pulse * 0.25;
          ctx.fillStyle = col;
          ctx.fillRect(iconX - 2, iconY - 2, 18, 18);
        }
        // Radial cooldown / charge sweep over the icon.
        if (radialFrac != null) {
          const lead = -Math.PI / 2 + radialFrac * Math.PI * 2;
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = "rgba(4,6,10,0.86)";
          ctx.beginPath();
          ctx.moveTo(iconX + 7, iconY + 7);
          ctx.arc(iconX + 7, iconY + 7, 9, lead, Math.PI * 1.5, false);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(iconX + 7, iconY + 7);
          ctx.lineTo(iconX + 7 + Math.cos(lead) * 9, iconY + 7 + Math.sin(lead) * 9);
          ctx.stroke();
        }
        ctx.restore();

        // Name, timer and the ability's keycap.
        const key = skill.key || (slot === 1 ? "SHIFT" : "F");
        const keyW = key.length > 1 ? 30 : 15;
        const keyX = x + w - keyW - 4;
        const timerX = keyX - 5;
        const shortName =
          skill.id === "overdrive" ? "OVERDRIVE" : skill.short || skill.name;
        FONT.draw(ctx, shortName, x + 23, rowY + 4, {
          color: active ? col : cooling ? "#9aa8bc" : "#d9e4f2",
          shadow: "#05070b",
        });
        FONT.draw(ctx, timerLabel, timerX, rowY + 4, {
          color: timerColor,
          align: "right",
          shadow: "#05070b",
        });
        this.drawKeycap(ctx, keyX, rowY + 2, key, keyW);

        // Smooth fill bar: active window, orb charge, or cooldown.
        const barX = x + 4;
        const barY = rowY + 17;
        const barW = w - 12;
        const barH = 4;
        ctx.save();
        ctx.fillStyle = "#070a10";
        ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = "#171b25";
        ctx.fillRect(barX, barY, barW, barH);
        const fillW = Math.max(0, Math.min(barW, Math.round(barW * frac)));
        if (fillW > 0) {
          ctx.fillStyle = barCol;
          ctx.fillRect(barX, barY, fillW, barH);
          ctx.fillStyle = active || ready ? "#ffffff" : col;
          ctx.globalAlpha = active ? 0.7 + pulse * 0.3 : 0.55;
          ctx.fillRect(barX, barY, fillW, 1);
          ctx.globalAlpha = 1;
        }
        if (active) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.18 + pulse * 0.18;
          ctx.fillStyle = col;
          ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
        }
        // Segment ticks.
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = "#070a10";
        for (let i = 1; i < 8; i++) ctx.fillRect(barX + Math.round((barW * i) / 8), barY, 1, barH);
        ctx.restore();
      }
    }

    drawGemCounter(ctx, x, y, w) {
      const flash = this.gemFlash > 0 ? Math.min(1, this.gemFlash / 0.9) : 0;
      this.drawPanel(ctx, x, y, w, 15, {
        border: flash > 0 ? "#22d3ee" : "#3b475d",
        alpha: 0.86,
        gold: false,
      });
      ctx.drawImage(SK.Sprites.get("gem"), x + 3, y + 3);
      const text = String(this.saveData.gems);
      FONT.draw(ctx, text, x + w - 5, y + 4, {
        color: flash > 0 ? "#a5f3fc" : "#7dd3fc",
        align: "right",
        shadow: "#05070b",
      });
      if (flash > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = flash * 0.35;
        ctx.fillStyle = "#22d3ee";
        ctx.fillRect(x + 1, y + 1, w - 2, 13);
        ctx.restore();
      }
    }

    drawHomeButton(ctx) {
      const r = this.homeButtonRect();
      const hover = this.uiMouseIn(r, this.uiTR()) && !this.paused;
      this.drawPanel(ctx, r.x, r.y, r.w, r.h, {
        border: hover ? "#f0c46a" : "#6b5a34",
        alpha: 0.88,
        gold: true,
      });
      FONT.draw(ctx, "[HOME]", r.x + r.w / 2, r.y + 4, {
        color: hover ? "#ffe09a" : "#d9b96a",
        align: "center",
        shadow: "#05070b",
      });
    }

    drawMinimap(ctx) {
      const px = 346;
      const py = 24;
      const pw = 128;
      const ph = 82;
      this.drawPanel(ctx, px, py, pw, ph, { border: "#3b475d", alpha: 0.8 });

      FONT.draw(ctx, "MAP", px + 6, py + 6, { color: "#8fa0b8", alpha: 0.9 });
      FONT.draw(ctx, "1-" + this.depth, px + pw - 6, py + 6, { color: "#6f7f96", align: "right", alpha: 0.8 });

      const d = this.dungeon;
      const b = d.contentBounds;
      const inner = { x: px + 7, y: py + 16, w: pw - 14, h: ph - 22 };
      const mapW = b.maxX - b.minX + 1;
      const mapH = b.maxY - b.minY + 1;
      const scale = Math.min(inner.w / mapW, inner.h / mapH);
      const ox = inner.x + (inner.w - mapW * scale) / 2 - b.minX * scale;
      const oy = inner.y + (inner.h - mapH * scale) / 2 - b.minY * scale;

      const tx = (x) => Math.round(ox + x * scale);
      const ty = (y) => Math.round(oy + y * scale);

      ctx.save();
      // corridors
      for (const c of d.connections) {
        const both = c.a.explored && c.b.explored;
        const one = c.a.explored || c.b.explored;
        const r = c.corridor;
        ctx.fillStyle = both ? "#6d7d95" : one ? "#465163" : "#2a3140";
        ctx.globalAlpha = both ? 0.9 : one ? 0.7 : 0.4;
        ctx.fillRect(tx(r.x), ty(r.y), Math.max(1, Math.round(r.w * scale)), Math.max(1, Math.round(r.h * scale)));
      }

      // rooms
      for (const room of d.rooms) {
        const x = tx(room.x);
        const y = ty(room.y);
        const w = Math.max(3, Math.round(room.w * scale));
        const h = Math.max(3, Math.round(room.h * scale));
        ctx.globalAlpha = room.explored ? 0.95 : 0.45;
        ctx.fillStyle = room.explored ? "#354052" : "#1b202b";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = room.explored ? "#7f8ea5" : "#343d4e";
        ctx.fillRect(x, y, w, 1);
        ctx.fillRect(x, y + h - 1, w, 1);
        ctx.fillRect(x, y, 1, h);
        ctx.fillRect(x + w - 1, y, 1, h);

        if (room.type === "combat" && !room.cleared) {
          ctx.globalAlpha = room.explored ? 0.95 : 0.6;
          ctx.fillStyle = "#ff5060";
          const cx = x + Math.floor(w / 2);
          const cy = y + Math.floor(h / 2);
          ctx.fillRect(cx - 1, cy - 1, 2, 2);
        }
        if (room.type === "portal") {
          const cx = x + Math.floor(w / 2);
          const cy = y + Math.floor(h / 2);
          ctx.globalAlpha = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(this.time * 4));
          ctx.fillStyle = "#58d8ff";
          ctx.fillRect(cx - 2, cy, 5, 1);
          ctx.fillRect(cx, cy - 2, 1, 5);
          ctx.fillStyle = "#d9fbff";
          ctx.fillRect(cx, cy, 1, 1);
        }
        if (room.type === "treasure") {
          // Gold chest pip: dark outline, gold lid and body, warm glint.
          const cx = x + Math.floor(w / 2);
          const cy = y + Math.floor(h / 2);
          ctx.globalAlpha = room.explored ? 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * 3.6)) : 0.55;
          ctx.fillStyle = "#0a0c12";
          ctx.fillRect(cx - 3, cy - 2, 7, 5);
          ctx.fillStyle = "#e8b04e";
          ctx.fillRect(cx - 2, cy - 1, 5, 3);
          ctx.fillStyle = "#fff3c4";
          ctx.fillRect(cx - 2, cy - 1, 5, 1);
          ctx.fillStyle = "#8a5a1c";
          ctx.fillRect(cx - 1, cy + 1, 2, 1);
        }
        if (room === this.currentRoom) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = "#eef7ff";
          // corner brackets
          const arm = 3;
          ctx.fillRect(x - 1, y - 1, arm, 1);
          ctx.fillRect(x - 1, y - 1, 1, arm);
          ctx.fillRect(x + w - arm + 1, y - 1, arm, 1);
          ctx.fillRect(x + w, y - 1, 1, arm);
          ctx.fillRect(x - 1, y + h - arm + 1, 1, arm);
          ctx.fillRect(x - 1, y + h, arm, 1);
          ctx.fillRect(x + w, y + h - arm + 1, 1, arm);
          ctx.fillRect(x + w - arm + 1, y + h, arm, 1);
        }
      }

      // player dot
      if (this.player) {
        const dotX = tx(this.player.x / TILE);
        const dotY = ty((this.player.y - 8) / TILE);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#0a0c12";
        ctx.fillRect(dotX - 2, dotY - 2, 4, 4);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(dotX - 1, dotY - 1, 2, 2);
      }
      ctx.restore();
    }

    /** Endless-mode replacement for the minimap: wave, countdown and record. */
    drawWavePanel(ctx) {
      const px = 346;
      const py = 24;
      const pw = 128;
      const ph = 96;
      this.drawPanel(ctx, px, py, pw, ph, { border: "#5a2a34", alpha: 0.82 });
      const w = this.waves;
      const wave = w ? Math.max(1, w.wave) : 1;
      const left = w ? w.aliveCount(this) : 0;
      const heat = w ? w.hpPercent(wave) : 0;
      const total = w ? Math.max(1, w.lastCount) : 1;

      FONT.draw(ctx, "ENDLESS", px + 7, py + 6, { color: "#ff8b96", alpha: 0.95 });
      FONT.draw(ctx, "WAVE", px + 7, py + 20, { color: "#8fa0b8", alpha: 0.9 });
      FONT.draw(ctx, String(wave), px + pw - 7, py + 16, {
        color: "#ffe09a",
        align: "right",
        scale: 2,
        shadow: "#05070b",
      });

      FONT.draw(ctx, "LEFT", px + 7, py + 34, { color: "#8fa0b8", alpha: 0.9 });
      FONT.draw(ctx, String(left), px + pw - 7, py + 34, {
        color: left > 0 ? "#ffd0d6" : "#7fe6a8",
        align: "right",
        shadow: "#05070b",
      });
      FONT.draw(ctx, "BEST", px + 7, py + 45, { color: "#8fa0b8", alpha: 0.9 });
      FONT.draw(ctx, String(this.bestWave()), px + pw - 7, py + 45, {
        color: "#7dd3fc",
        align: "right",
        shadow: "#05070b",
      });
      FONT.draw(ctx, "ENEMY HP", px + 7, py + 56, { color: "#8fa0b8", alpha: 0.9 });
      FONT.draw(ctx, "+" + heat + "%", px + pw - 7, py + 56, {
        color: heat >= 100 ? "#ff4658" : "#c4b5fd",
        align: "right",
        shadow: "#05070b",
      });

      // Wave progress / next-wave countdown.
      let frac = 0;
      let label = "CLEAR THE WAVE";
      if (w && (w.state === "rest" || w.state === "intro")) {
        const dur = w.state === "intro" ? 1.0 : SK.Waves.INTERMISSION;
        frac = 1 - clamp(w.t / dur, 0, 1);
        label = "NEXT IN " + Math.max(0, w.t).toFixed(1) + "S";
      } else {
        frac = clamp((total - left) / total, 0, 1);
      }
      const bx = px + 7;
      const by = py + 79;
      const bw = pw - 14;
      ctx.save();
      ctx.fillStyle = "#070a10";
      ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
      ctx.fillStyle = "#1a1118";
      ctx.fillRect(bx, by, bw, 4);
      ctx.fillStyle = "#b32336";
      ctx.fillRect(bx, by, Math.max(0, Math.round(bw * frac)), 4);
      ctx.fillStyle = "#ff8b96";
      ctx.globalAlpha = 0.75;
      ctx.fillRect(bx, by, Math.max(0, Math.round(bw * frac)), 1);
      ctx.restore();
      FONT.draw(ctx, label, px + pw / 2, py + 69, {
        color: "#b8a6b2",
        align: "center",
        alpha: 0.85,
      });
    }

    drawWeaponSlots(ctx) {
      const p = this.player;
      const y = 241;
      const selected = p.weapon;
      for (let i = 0; i < 2; i++) {
        const x = 6 + i * 42;
        const weapon = p.weapons[i];
        const rarity = weapon ? SK.RARITY[weapon.rarity] || SK.RARITY.common : null;
        const active = i === selected && !!weapon;
        this.drawPanel(ctx, x, y, 38, 23, {
          border: active ? rarity.color : "#39445a",
          alpha: 0.86,
          gold: active,
        });
        FONT.draw(ctx, String(i + 1), x + 3, y + 2, {
          color: active ? rarity.color : "#718096",
          alpha: 0.9,
        });
        if (weapon) {
          const spr = SK.Sprites.get(weapon.sprite);
          const ix = x + Math.round((38 - spr.width) / 2);
          const iy = y + Math.round((23 - spr.height) / 2);
          ctx.drawImage(spr, ix, iy);
          // Rarity tick in the slot corner.
          ctx.save();
          ctx.globalAlpha = active ? 0.95 : 0.5;
          ctx.fillStyle = rarity.color;
          ctx.fillRect(x + 34, y + 18, 3, 3);
          ctx.restore();
          const cd = p.cooldowns[i];
          const max = weapon.cooldown / (p.isOverdrive() ? 1.5 : 1);
          if (cd > 0) {
            const frac = Math.min(1, cd / max);
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = "#05070b";
            ctx.fillRect(x + 2, y + 2, Math.round((38 - 4) * frac), 23 - 4);
            ctx.restore();
          }
          if (active) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = rarity.color;
            ctx.fillRect(x + 2, y + 21, 34 - Math.round(34 * Math.min(1, cd / max)), 1);
            ctx.restore();
          }
          // Kamui Gloves: three cast pips; the third cast is a mega portal.
          if (weapon.id === "kamuiGloves") {
            const casts = ((p.kamuiCasts || 0) % 3 + 3) % 3;
            const megaReady = casts === 2;
            const pipY = y + 18;
            ctx.save();
            for (let s = 0; s < 3; s++) {
              const filled = s < casts;
              ctx.globalAlpha = 0.9;
              ctx.fillStyle = "#070a10";
              ctx.fillRect(x + 7 + s * 6, pipY, 5, 3);
              if (filled) {
                ctx.fillStyle = megaReady ? "#ff4658" : "#c4b5fd";
                ctx.globalAlpha = megaReady ? 0.75 + 0.25 * Math.sin(this.time * 8) : 0.95;
                ctx.fillRect(x + 8 + s * 6, pipY + 1, 3, 1);
              } else {
                ctx.fillStyle = "#3a3040";
                ctx.fillRect(x + 8 + s * 6, pipY + 1, 3, 1);
              }
            }
            ctx.restore();
          }
        } else {
          FONT.draw(ctx, "EMPTY", x + 19, y + 9, { color: "#4f5a6c", align: "center", alpha: 0.9 });
        }
      }

      const weapon = p.currentWeapon();
      if (!weapon) return;
      const rarity = SK.RARITY[weapon.rarity] || SK.RARITY.common;

      // Currently equipped rarity-coloured name.
      FONT.draw(ctx, weapon.name, 6, 229, {
        color: rarity.color,
        alpha: 0.96,
        shadow: "#0a0c12",
      });

      // Energy cost badge: bolt icon + cost, red when the shot is unaffordable.
      const nameW = FONT.measure(weapon.name, { scale: 1 });
      const bx = 6 + nameW + 6;
      const by = 226;
      const enough = p.energy >= weapon.energyCost;
      const badgeCol = enough ? "#ffe45c" : "#ff6b6b";
      const badgeBorder = enough ? "#5c4a20" : "#6e2a30";
      ctx.save();
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = "#080b11";
      ctx.fillRect(bx + 1, by, 27, 11);
      ctx.fillRect(bx, by + 1, 29, 9);
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = badgeBorder;
      ctx.fillRect(bx + 1, by, 27, 1);
      ctx.fillRect(bx + 1, by + 10, 27, 1);
      ctx.restore();
      ctx.drawImage(SK.Sprites.get("bolt"), bx + 2, by + 1);
      FONT.draw(ctx, String(weapon.energyCost), bx + 12, by + 2, {
        color: badgeCol,
        shadow: "#05070b",
      });

      // The third Kamui Gloves cast is the mega portal: flag it clearly.
      if (weapon.id === "kamuiGloves" && ((p.kamuiCasts || 0) % 3 + 3) % 3 === 2) {
        const mbx = bx + 34;
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 9);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#080b11";
        ctx.fillRect(mbx + 1, by, 29, 11);
        ctx.fillRect(mbx, by + 1, 31, 9);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "#6e2a30";
        ctx.fillRect(mbx + 1, by, 29, 1);
        ctx.fillRect(mbx + 1, by + 10, 29, 1);
        ctx.restore();
        FONT.draw(ctx, "MEGA", mbx + 4, by + 2, {
          color: pulse > 0.7 ? "#ffd0d6" : "#ff4658",
          shadow: "#05070b",
        });
      }
    }

    drawKeycap(ctx, x, y, label, w) {
      ctx.save();
      ctx.fillStyle = "#11151e";
      ctx.fillRect(x, y, w, 12);
      ctx.fillStyle = "#39445a";
      ctx.fillRect(x, y, w, 1);
      ctx.fillRect(x, y + 11, w, 1);
      ctx.fillRect(x, y, 1, 12);
      ctx.fillRect(x + w - 1, y, 1, 12);
      FONT.draw(ctx, label, x + w / 2, y + 3, { color: "#e8b04e", align: "center" });
      ctx.restore();
    }

    drawNotice(ctx) {
      if (!this.notice) return;
      const n = this.notice;
      const fadeIn = Math.min(1, n.t / 0.12);
      const fadeOut = Math.min(1, (n.dur - n.t) / 0.3);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const scale = n.text.length > 15 ? 1 : 2;
      const tw = FONT.measure(n.text, { scale: scale });
      const sw = FONT.measure(n.sub, { scale: 1 });
      const w = Math.max(tw, sw) + 34;
      const h = n.sub ? 35 : 25;
      const cx = UI_DW / 2;
      const x = Math.round(cx - w / 2);
      const y = this.player && this.player.hero && this.player.hero.skill2 ? 116 : 92;
      this.withUI(ctx, this.uiTC(), () => {
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillStyle = "#080b11";
        ctx.fillRect(x + 1, y, w - 2, h);
        ctx.fillRect(x, y + 1, w, h - 2);
        ctx.globalAlpha = alpha * 0.55;
        ctx.fillStyle = n.color;
        ctx.fillRect(x + 1, y, w - 2, 1);
        ctx.fillRect(x + 1, y + h - 1, w - 2, 1);
        ctx.restore();
        FONT.draw(ctx, n.text, cx, y + 7, {
          color: n.color,
          align: "center",
          scale: scale,
          shadow: "#05070b",
          alpha: alpha,
        });
        if (n.sub) {
          FONT.draw(ctx, n.sub, cx, y + 23, {
            color: "#b8c7db",
            align: "center",
            alpha: alpha * 0.9,
          });
        }
      });
    }

    drawHint(ctx) {
      if (this.hintT <= 0 || this.state !== "playing" || this.paused) return;
      const alpha = Math.min(1, this.hintT / 2) * 0.9;
      this.withUI(ctx, this.uiBC(), () => {
        FONT.draw(ctx, "WASD MOVE  -  LMB ATTACK  -  F / SHIFT SKILL  -  E LOOT  -  Q SWAP", UI_DW / 2, 259, {
          color: "#9fb0c6",
          align: "center",
          alpha: alpha,
          shadow: "#05070b",
        });
      });
    }

    // ---------------------------------------------------------------------
    // Home Room presentation
    // ---------------------------------------------------------------------
    drawHomeWorld(ctx) {
      const home = this.homeRoom;
      const shake = this.shakeAmp;
      let sx = 0;
      let sy = 0;
      if (shake > 0.1) {
        sx = Math.round((Math.random() * 2 - 1) * Math.min(3, shake));
        sy = Math.round((Math.random() * 2 - 1) * Math.min(3, shake));
      }
      const camX = Math.round(this.camX) + sx;
      const camY = Math.round(this.camY) + sy;

      const heroInfo = {};
      for (const id of SK.Heroes.ids) {
        const hero = SK.Heroes.defs[id];
        heroInfo[id] = {
          active: this.saveData.selectedHero === id,
          locked: this.saveData.unlockedHeroes.indexOf(id) < 0,
          color: hero.primary,
        };
      }

      ctx.save();
      ctx.translate(-camX, -camY);
      home.drawFloor(ctx, camX, camY, VW, VH, this.time);
      home.drawWalls(ctx, camX, camY, VW, VH);
      home.drawProps(ctx, this.time, heroInfo);
      if (SK.Waves && home.waveGate) {
        SK.Waves.drawRiftGate(ctx, home.waveGate.x, home.waveGate.y, this.time);
      }
      this.drawGroundEffects(ctx);

      // Idle non-selected heroes and the controlled hero, sorted by feet.
      const actors = [];
      for (const id of SK.Heroes.ids) {
        if (this.saveData.selectedHero === id) continue;
        const spot = home.pedestals[id];
        actors.push({
          y: spot.y - 10,
          draw: () => {
            SK.drawHeroIdle(
              ctx,
              id,
              spot.x,
              spot.y - 10,
              this.time,
              { locked: this.saveData.unlockedHeroes.indexOf(id) < 0 }
            );
          },
        });
      }
      if (this.player && this.player.alive) {
        actors.push({ y: this.player.y, draw: () => this.player.draw(ctx, this) });
      }
      actors.sort((a, b) => a.y - b.y);
      for (const a of actors) a.draw();

      // Pedestal name plates.
      for (const id of SK.Heroes.ids) {
        const hero = SK.Heroes.defs[id];
        const spot = home.pedestals[id];
        const active = this.saveData.selectedHero === id;
        const locked = this.saveData.unlockedHeroes.indexOf(id) < 0;
        const label = hero.name;
        const w = FONT.measure(label, { scale: 1 }) + 10;
        const lx = Math.round(spot.x - w / 2);
        const heroAh = hero.spriteH || 22;
        const ly = Math.round(spot.y - 10 - heroAh - 20);
        ctx.save();
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = "#080b11";
        ctx.fillRect(lx + 1, ly, w - 2, 11);
        ctx.fillRect(lx, ly + 1, w, 9);
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = hero.primary;
        ctx.fillRect(lx + 1, ly, w - 2, 1);
        ctx.restore();
        FONT.draw(ctx, label, spot.x, ly + 2, {
          color: active ? "#ffe09a" : hero.primary,
          align: "center",
          shadow: "#05070b",
        });
        if (locked) {
          FONT.draw(ctx, "LOCKED", spot.x, ly + 12, {
            color: "#c084fc",
            align: "center",
            alpha: 0.75,
            shadow: "#05070b",
          });
        } else if (active) {
          FONT.draw(ctx, "ACTIVE", spot.x, ly + 12, {
            color: "#7dd3fc",
            align: "center",
            alpha: 0.75,
            shadow: "#05070b",
          });
        }
      }

      // Dungeon entrance prompt.
      if (this.homePortalNear) {
        const label = "[E] ENTER DUNGEON";
        const w = FONT.measure(label, { scale: 1 }) + 14;
        const px = Math.round(home.portal.x - w / 2);
        const py = Math.round(home.portal.y + 26);
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 4);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#080b11";
        ctx.fillRect(px + 1, py, w - 2, 12);
        ctx.fillRect(px, py + 1, w, 10);
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = "#67dfff";
        ctx.fillRect(px + 1, py, w - 2, 1);
        ctx.fillRect(px + 1, py + 11, w - 2, 1);
        ctx.restore();
        FONT.draw(ctx, label, home.portal.x, py + 2, {
          color: "#bff4ff",
          align: "center",
          alpha: Math.max(0.55, pulse),
          shadow: "#05070b",
        });
      }

      // Endless rift prompt.
      if (this.homeWaveNear && home.waveGate) {
        const g = home.waveGate;
        const label = "[E] ENDLESS WAVES";
        const best = "BEST WAVE " + this.bestWave();
        const w = Math.max(FONT.measure(label, { scale: 1 }), FONT.measure(best, { scale: 1 })) + 16;
        const px = Math.round(g.x - w / 2);
        const py = Math.round(g.y - 56);
        const pulse = 0.55 + 0.45 * Math.sin(this.time * 4.2);
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "#080b11";
        ctx.fillRect(px + 1, py, w - 2, 20);
        ctx.fillRect(px, py + 1, w, 18);
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#ff4658";
        ctx.fillRect(px + 1, py, w - 2, 1);
        ctx.fillRect(px + 1, py + 19, w - 2, 1);
        ctx.restore();
        FONT.draw(ctx, label, g.x, py + 2, {
          color: "#ffc1c8",
          align: "center",
          alpha: Math.max(0.6, pulse),
          shadow: "#05070b",
        });
        FONT.draw(ctx, best, g.x, py + 12, {
          color: "#8e9db3",
          align: "center",
          shadow: "#05070b",
        });
      }

      this.drawOverEffects(ctx);
      for (const p of this.particles) p.draw(ctx);
      for (const f of this.floats) f.draw(ctx);
      ctx.restore();
    }

    drawHomeHUD(ctx) {
      const p = this.player;
      if (!p) return;

      // Selected hero plate (bottom-left, clear of the sanctuary wall art).
      this.withUI(ctx, this.uiBL(), () => {
        this.drawPanel(ctx, 6, 218, 176, 44, { border: "#5a4a32", alpha: 0.86, gold: true });
        const aw = p.hero.spriteW || 20;
        const ah = p.hero.spriteH || 22;
        const spr = SK.Sprites.get(p.hero.portrait || p.hero.sprite + "0");
        ctx.drawImage(spr, 12, 222);
        const tx = 12 + aw + 8;
        FONT.draw(ctx, p.hero.name, tx, 221, {
          color: p.hero.primary,
          scale: 1,
          shadow: "#05070b",
        });
        FONT.draw(ctx, p.hero.title, tx, 232, { color: "#9aa8bc", alpha: 0.9 });
        FONT.draw(ctx, "SELECTED HERO", tx, 246, { color: "#7dd3fc", alpha: 0.85 });
      });

      // Sanctuary title.
      this.withUI(ctx, this.uiTC(), () => {
        FONT.draw(ctx, "DUNGEON SK", UI_DW / 2, 8, {
          color: "#f3f7fd",
          align: "center",
          shadow: "#05070b",
        });
        FONT.draw(ctx, "SANCTUARY", UI_DW / 2, 18, {
          color: "#e8b04e",
          align: "center",
          alpha: 0.9,
        });
      });

      this.withUI(ctx, this.uiTR(), () => this.drawGemCounter(ctx, 410, 6, 64));

      if (this.homeHintT > 0) {
        const alpha = Math.min(1, this.homeHintT / 1.5) * 0.9;
        this.withUI(ctx, this.uiBC(), () => {
          FONT.draw(ctx, "WASD MOVE  -  E INTERACT  -  BLUE: DUNGEON  -  RED: ENDLESS WAVES", UI_DW / 2, 262, {
            color: "#9fb0c6",
            align: "center",
            alpha: alpha,
            shadow: "#05070b",
          });
        });
      }

      if (this.audio.muted) {
        this.withUI(ctx, this.uiBR(), () => {
          FONT.draw(ctx, "MUTED [M]", 474, 262, { color: "#6c7a8e", align: "right", alpha: 0.75 });
        });
      }
    }

    drawHeroCards(ctx) {
      if (this.state !== "home" || !this.homeNear) return;
      const id = this.homeNear.id;
      const hero = SK.Heroes.defs[id];
      const spot = this.homeRoom.pedestals[id];
      const unlocked = this.saveData.unlockedHeroes.indexOf(id) >= 0;
      const active = this.saveData.selectedHero === id;
      const weapon = SK.Weapons.defs[hero.starterWeapon];
      const rarity = SK.RARITY[weapon.rarity] || SK.RARITY.common;

      const twoSkills = !!hero.skill2;
      const w = 202;
      const h = twoSkills ? 150 : 136;
      const screenX = spot.x - this.camX;
      const screenY = spot.y - this.camY;
      // The card is interface, so it renders on the half-sized UI grid.
      const cardW = w / 2;
      const cardH = h / 2;
      const toRight = screenX < VW * 0.5;
      let x = toRight ? screenX + 11 : screenX - cardW - 11;
      x = clamp(x, 3, VW - cardW - 3);
      let y = clamp(screenY - 71, 20, VH - cardH - 4);
      x = Math.round(x);
      y = Math.round(y);

      // Connecting tick to the pedestal (world space).
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = hero.primary;
      const anchorX = toRight ? x : x + cardW;
      const anchorY = y + cardH - 10;
      const targetX = clamp(Math.round(screenX), x + 4, x + cardW - 4);
      const targetY = Math.round(screenY - 7);
      if (targetY > anchorY) {
        ctx.fillRect(targetX, anchorY, 1, targetY - anchorY);
      }
      ctx.restore();

      ctx.save();
      // Design space is shifted so the card's top-left lands on its world
      // position; one design pixel then covers half a world pixel.
      ctx.setTransform(1, 0, 0, 1, x, y);

      this.drawPanel(ctx, x, y, w, h, { border: hero.primary, alpha: 0.94, gold: true });

      // Portrait (2x hero sprite) with a dark, size-aware frame.
      const frameW = hero.spriteW ? 52 : 46;
      const frameH = hero.spriteH ? 58 : 48;
      const pw = hero.spriteW || 20;
      const ph = hero.spriteH || 22;
      ctx.save();
      ctx.fillStyle = "#080b11";
      ctx.fillRect(x + 6, y + 6, frameW, frameH);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = hero.secondary;
      ctx.fillRect(x + 6, y + 6, frameW, 1);
      ctx.fillRect(x + 6, y + 6 + frameH - 1, frameW, 1);
      ctx.globalAlpha = unlocked ? 1 : 0.55;
      ctx.translate(x + 6 + frameW / 2, y + 6 + frameH - 2);
      ctx.scale(2, 2);
      ctx.drawImage(SK.Sprites.get(hero.portrait || hero.sprite + "0"), -Math.round(pw / 2), -ph);
      ctx.restore();
      if (!unlocked) {
        const lx = x + 6 + Math.round(frameW / 2) - 8;
        const ly = y + 6 + Math.round(frameH / 2) - 7;
        ctx.save();
        ctx.fillStyle = "#0a0c12";
        ctx.fillRect(lx, ly, 16, 14);
        ctx.fillStyle = hero.primary;
        ctx.fillRect(lx + 1, ly + 1, 14, 12);
        ctx.fillStyle = "#1e1b4b";
        ctx.fillRect(lx + 4, ly + 5, 8, 6);
        ctx.fillStyle = hero.primary;
        ctx.fillRect(lx + 6, ly - 4, 2, 5);
        ctx.fillRect(lx + 10, ly - 4, 2, 5);
        ctx.fillRect(lx + 5, ly - 5, 8, 1);
        ctx.restore();
      }

      // Name, title, base stats.
      const textX = x + 6 + frameW + 8;
      FONT.draw(ctx, hero.name, textX, y + 8, {
        color: hero.primary,
        scale: 2,
        shadow: "#05070b",
      });
      FONT.draw(ctx, hero.title, textX, y + 25, { color: "#9aa8bc", alpha: 0.9 });
      const statY = y + 37;
      ctx.drawImage(SK.Sprites.get("heart"), textX, statY);
      FONT.draw(ctx, String(hero.maxHp), textX + 10, statY + 1, { color: "#ff9aa2", shadow: "#05070b" });
      ctx.drawImage(SK.Sprites.get("shield"), textX + 24, statY + 1);
      FONT.draw(ctx, String(hero.maxArmor), textX + 34, statY + 1, { color: "#9fdcff", shadow: "#05070b" });
      ctx.drawImage(SK.Sprites.get("bolt"), textX + 48, statY + 1);
      FONT.draw(ctx, String(hero.maxEnergy), textX + 58, statY + 1, { color: "#ffe45c", shadow: "#05070b" });

      // Divider.
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = hero.primary;
      ctx.fillRect(x + 8, y + 56, w - 16, 1);
      ctx.restore();

      // Starting weapon in its rarity colour.
      FONT.draw(ctx, "WPN", x + 8, y + 60, { color: "#7f8ea3", alpha: 0.9 });
      FONT.draw(ctx, weapon.name, x + 29, y + 60, {
        color: rarity.color,
        shadow: "#05070b",
      });

      // Active skill block(s).
      if (!twoSkills) {
        FONT.draw(ctx, hero.skill.name, x + 8, y + 74, {
          color: hero.skill.color,
          shadow: "#05070b",
        });
        FONT.draw(ctx, hero.skill.desc, x + 8, y + 84, { color: "#c7d4e5", alpha: 0.95 });
        FONT.draw(ctx, hero.skill.detail, x + 8, y + 94, { color: "#7f8ea3", alpha: 0.9 });
      } else {
        FONT.draw(ctx, "F  " + hero.skill.name, x + 8, y + 72, {
          color: hero.skill.color,
          shadow: "#05070b",
        });
        FONT.draw(ctx, hero.skill.desc, x + 8, y + 82, { color: "#c7d4e5", alpha: 0.95 });
        FONT.draw(ctx, "SHIFT  " + hero.skill2.name, x + 8, y + 94, {
          color: hero.skill2.color,
          shadow: "#05070b",
        });
        FONT.draw(ctx, hero.skill2.desc, x + 8, y + 104, { color: "#c7d4e5", alpha: 0.95 });
      }

      // Action prompt.
      const promptY = h - 34;
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = "#05070b";
      ctx.fillRect(x + 5, y + promptY, w - 10, 28);
      ctx.restore();
      const enough = this.saveData.gems >= hero.unlockCost;
      const deny = this.homeDenyT > 0 && !enough;
      if (active) {
        FONT.draw(ctx, "EQUIPPED", x + w / 2, y + promptY + 4, {
          color: "#ffe09a",
          align: "center",
          shadow: "#05070b",
        });
        FONT.draw(ctx, "READY TO DESCEND", x + w / 2, y + promptY + 14, {
          color: "#7f8ea3",
          align: "center",
          alpha: 0.9,
        });
      } else if (!unlocked) {
        FONT.draw(ctx, "[E] UNLOCK (" + hero.unlockCost + " GEM)", x + w / 2, y + promptY + 2, {
          color: enough ? "#4ade80" : "#6b7280",
          align: "center",
          shadow: "#05070b",
        });
        if (!enough) {
          FONT.draw(ctx, "NEED " + hero.unlockCost + " GEM!", x + w / 2, y + promptY + 14, {
            color: deny ? (Math.floor(this.time * 12) % 2 === 0 ? "#ff6b6b" : "#ffd0d0") : "#ff6b6b",
            align: "center",
            shadow: "#05070b",
          });
        } else {
          FONT.draw(ctx, "UNLOCK AND EQUIP", x + w / 2, y + promptY + 14, {
            color: "#7f8ea3",
            align: "center",
            alpha: 0.9,
          });
        }
      } else {
        FONT.draw(ctx, "[E] SELECT HERO", x + w / 2, y + promptY + 4, {
          color: "#7dd3fc",
          align: "center",
          shadow: "#05070b",
        });
      }
      ctx.restore();
    }

    // ---------------------------------------------------------------------
    // Overlays
    // ---------------------------------------------------------------------
    drawDim(ctx, alpha) {
      ctx.save();
      ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#06080c";
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();
    }

    drawPauseOverlay(ctx) {
      this.drawDim(ctx, 0.62);
      this.withUI(ctx, this.uiC(), () => {
        this.drawPanel(ctx, 124, 68, 232, 136, { border: "#4b5870", alpha: 0.92, gold: true });
        FONT.draw(ctx, "PAUSED", 240, 82, { color: "#ffe09a", scale: 3, align: "center", shadow: "#05070b" });
        FONT.draw(ctx, "WASD MOVE   -   LMB ATTACK", 240, 110, {
          color: "#c7d4e5",
          align: "center",
        });
        FONT.draw(ctx, "F/SHIFT SKILL   -   Q SWAP", 240, 122, {
          color: "#8293aa",
          align: "center",
        });
        FONT.draw(ctx, "E LOOT   -   M MUTE", 240, 134, {
          color: "#8293aa",
          align: "center",
        });

        const r = this.pauseHomeRect();
        const hover = this.uiMouseIn(r, this.uiC());
        this.drawPanel(ctx, r.x, r.y, r.w, r.h, {
          border: hover ? "#ffcf6a" : "#6b5a34",
          alpha: 0.95,
          gold: true,
        });
        FONT.draw(ctx, "[H] RETURN HOME", r.x + r.w / 2, r.y + 5, {
          color: hover ? "#ffe09a" : "#e8c981",
          align: "center",
          shadow: "#05070b",
        });

        FONT.draw(ctx, "ESC / P RESUME", 240, 176, { color: "#c7d4e5", align: "center" });
        FONT.draw(ctx, "CLICK OUTSIDE THE BUTTON TO RESUME", 240, 190, {
          color: "#6f8098",
          align: "center",
          alpha: 0.75,
        });
      });
    }

    drawHomeConfirmModal(ctx) {
      this.drawDim(ctx, 0.72);
      this.withUI(ctx, this.uiC(), () => {
        const px = 54;
        const py = 72;
        const pw = 372;
        const ph = 126;
        this.drawPanel(ctx, px, py, pw, ph, { border: "#8a6a3a", alpha: 0.97, gold: true });
        FONT.draw(ctx, "RETURN TO HOME ROOM?", 240, 86, {
          color: "#ffe09a",
          scale: 2,
          align: "center",
          shadow: "#05070b",
        });
        FONT.draw(ctx, "CURRENT RUN & WEAPONS", 240, 112, {
          color: "#e7b8b8",
          align: "center",
        });
        FONT.draw(ctx, "WILL BE LOST!", 240, 124, {
          color: "#ff8c8c",
          align: "center",
          shadow: "#05070b",
        });
        ctx.drawImage(SK.Sprites.get("gem"), 240 - 64, 137);
        FONT.draw(ctx, "(GEMS ARE KEPT)", 240 + 6, 139, {
          color: "#7dd3fc",
          align: "center",
        });

        const btns = this.confirmButtons();
        const yesHover = this.uiMouseIn(btns.yes, this.uiC());
        const noHover = this.uiMouseIn(btns.no, this.uiC());
        this.drawPanel(ctx, btns.yes.x, btns.yes.y, btns.yes.w, btns.yes.h, {
          border: yesHover ? "#8ef0a5" : "#3f7d52",
          alpha: 0.96,
          gold: false,
        });
        this.drawPanel(ctx, btns.no.x, btns.no.y, btns.no.w, btns.no.h, {
          border: noHover ? "#ff9a9a" : "#7a4450",
          alpha: 0.96,
          gold: false,
        });
        FONT.draw(ctx, "[Y] CONFIRM RETURN HOME", btns.yes.x + btns.yes.w / 2, btns.yes.y + 6, {
          color: yesHover ? "#b6ffc4" : "#8ef0a5",
          align: "center",
          shadow: "#05070b",
        });
        FONT.draw(ctx, "[N] CANCEL", btns.no.x + btns.no.w / 2, btns.no.y + 6, {
          color: noHover ? "#ffc1c1" : "#ff9a9a",
          align: "center",
          shadow: "#05070b",
        });
      });
    }

    drawGameOverOverlay(ctx) {
      const fade = clamp(this.gameoverT / 0.5, 0, 1);
      ctx.save();
      ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
      ctx.globalAlpha = 0.55 * fade;
      ctx.drawImage(this.redVignette, 0, 0);
      ctx.restore();
      this.drawDim(ctx, 0.76 * fade);

      this.withUI(ctx, this.uiC(), () => {
        const px = 88;
        const py = 52;
        const pw = 304;
        const ph = 170;
        ctx.save();
        ctx.globalAlpha = fade;
        this.drawPanel(ctx, px, py, pw, ph, { border: "#6b3540", alpha: 0.92, gold: false });
        FONT.draw(ctx, "YOU DIED", 240, 66, {
          color: "#ff5b68",
          scale: 4,
          align: "center",
          shadow: "#1a0508",
        });
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = "#ff5b68";
        ctx.fillRect(px + 56, 100, pw - 112, 1);
        ctx.restore();

        const stats =
          this.mode === "waves"
            ? [
                ["WAVE REACHED", String(this.waves ? this.waves.wave : 1)],
                ["BEST WAVE", String(this.bestWave())],
                ["ENEMIES SLAIN", String(this.kills)],
                ["TIME SURVIVED", formatTime(this.runTime)],
                ["GEMS COLLECTED", "+" + this.runGems],
                ["GEMS KEPT", String(this.saveData.gems)],
              ]
            : [
                ["FLOOR REACHED", "1-" + this.depth],
                ["ENEMIES SLAIN", String(this.kills)],
                ["TIME SURVIVED", formatTime(this.runTime)],
                ["GEMS COLLECTED", "+" + this.runGems],
                ["GEMS KEPT", String(this.saveData.gems)],
              ];
        const startY = stats.length > 5 ? 106 : 110;
        for (let i = 0; i < stats.length; i++) {
          const y = startY + i * 12;
          FONT.draw(ctx, stats[i][0], px + 44, y, { color: "#8e9db3", alpha: fade });
          FONT.draw(ctx, stats[i][1], px + 260, y, {
            color: i >= 3 ? "#7dd3fc" : "#e7edf7",
            align: "right",
            alpha: fade,
          });
        }

        const blink = 0.55 + 0.45 * Math.sin(this.time * 3.4);
        FONT.draw(ctx, "R / CLICK TO RETURN HOME", 240, 192, {
          color: "#ffe09a",
          align: "center",
          alpha: fade * Math.max(0.5, blink),
          shadow: "#05070b",
        });
        FONT.draw(ctx, "GEMS AND UNLOCKED HEROES ARE KEPT", 240, 207, {
          color: "#7d8ca1",
          align: "center",
          alpha: fade * 0.9,
        });
      });
    }

    drawAdvanceOverlay(ctx) {
      const a = this.advance;
      if (!a) return;
      let alpha;
      if (a.phase === "out") alpha = clamp(a.t / 0.55, 0, 1);
      else alpha = 1 - clamp(a.t / 0.52, 0, 1);
      ctx.save();
      ctx.setTransform(UI_SCALE, 0, 0, UI_SCALE, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#06080c";
      ctx.fillRect(0, 0, VW, VH);
      ctx.restore();

      this.withUI(ctx, this.uiC(), () => {
        const labelAlpha = a.phase === "out" ? Math.min(1, a.t / 0.3) : Math.min(1, (1 - a.t / 0.52) * 2);
        if (a.phase === "out") {
          FONT.draw(ctx, "DESCENDING", 240, 118, {
            color: "#8fe6ff",
            scale: 2,
            align: "center",
            alpha: labelAlpha,
            shadow: "#05070b",
          });
          FONT.draw(ctx, "FLOOR 1-" + this.depth, 240, 143, {
            color: "#6d8198",
            align: "center",
            alpha: labelAlpha * 0.9,
          });
          ctx.save();
          ctx.globalAlpha = labelAlpha;
          const gemPopY = 176 - Math.min(14, a.t * 32);
          ctx.drawImage(SK.Sprites.get("gem"), 240 - 34, gemPopY);
          ctx.restore();
          FONT.draw(ctx, "+1 GEM!", 240 + 4, gemPopY + 1, {
            color: "#7dd3fc",
            align: "center",
            alpha: labelAlpha,
            shadow: "#05070b",
          });
        } else {
          FONT.draw(ctx, "FLOOR", 240, 103, {
            color: "#8aa1ba",
            align: "center",
            alpha: labelAlpha,
          });
          FONT.draw(ctx, "1-" + this.depth, 240, 114, {
            color: "#ffe09a",
            scale: 4,
            align: "center",
            alpha: labelAlpha,
            shadow: "#05070b",
          });
          FONT.draw(ctx, "KEEP DESCENDING", 240, 152, {
            color: "#7f93aa",
            align: "center",
            alpha: labelAlpha * 0.9,
          });
        }
      });
    }

    // ---------------------------------------------------------------------
    // Debug
    // ---------------------------------------------------------------------
    drawDebugWorld(ctx) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = "#51ff9a";
      ctx.lineWidth = 1;
      const p = this.player;
      if (p) {
        ctx.strokeStyle = "#51ff9a";
        ctx.strokeRect(Math.round(p.x - p.w / 2) + 0.5, Math.round(p.y - p.h) + 0.5, p.w, p.h);
        ctx.fillStyle = "#51ff9a";
        ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 1);
      }
      ctx.strokeStyle = "#ff7f7f";
      for (const e of this.enemies) {
        if (!e.alive) continue;
        ctx.strokeRect(Math.round(e.x - e.w / 2) + 0.5, Math.round(e.y - e.h) + 0.5, e.w, e.h);
      }
      ctx.strokeStyle = "#ffd166";
      for (const c of this.crates) {
        if (c.dead) continue;
        const r = c.getRect();
        ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, r.w, r.h);
      }
      ctx.strokeStyle = "#ff4d6d";
      for (const room of this.dungeon.rooms) {
        if (!room.locked) continue;
        for (const g of room.gates) ctx.strokeRect(g.x + 0.5, g.y + 0.5, g.w - 1, g.h - 1);
      }
      ctx.strokeStyle = "rgba(90,200,255,0.7)";
      for (const room of this.dungeon.rooms) {
        ctx.strokeRect(room.x * TILE + 0.5, room.y * TILE + 0.5, room.w * TILE - 1, room.h * TILE - 1);
        ctx.fillStyle = "rgba(120,220,255,0.7)";
        ctx.fillRect(room.x * TILE + 2, room.y * TILE + 2, 1, 1);
      }
      ctx.restore();
    }

    drawDebugOverlay(ctx) {
      const dy = this.player && this.player.hero && this.player.hero.skill2 ? 118 : 94;
      this.withUI(ctx, this.uiTL(), () => {
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = "rgba(6,9,14,0.8)";
        ctx.fillRect(6, dy, 156, 56);
        FONT.draw(ctx, "DEBUG [F3]", 10, dy + 4, { color: "#7fffb2" });
        const seed = this.dungeon && this.dungeon.seed != null ? String(this.dungeon.seed % 99999) : "HOME";
        const rooms = this.dungeon && this.dungeon.rooms ? this.dungeon.rooms.length : 0;
        FONT.draw(ctx, "ROOMS " + rooms + "  SEED " + seed, 10, dy + 17, { color: "#9fd6ff" });
        FONT.draw(ctx, "T " + Math.floor(this.player.x / TILE) + "," + Math.floor(this.player.y / TILE), 10, dy + 29, { color: "#ffd166" });
        FONT.draw(ctx, this.player.heroId.toUpperCase() + "  GEMS " + this.saveData.gems, 10, dy + 41, { color: "#c084fc" });
        ctx.restore();
      });
    }
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------
  function boot() {
    const canvas = document.getElementById("game");
    if (!canvas) return;
    try {
      new Game(canvas);
    } catch (err) {
      console.error("Dungeon SK failed to boot:", err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
