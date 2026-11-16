/* =========================================================================
   DUNGEON SK — kamui.js
   Dimensional Traveler visual engine:
   - the dense black/grey Kamui spiral vortex (animated, layered, inked)
   - the sparse eye-originating intangibility tendrils
   - the light-purple rift dimension screen overlay
   Classic script (IIFE) so the game stays launchable from file://.
   ========================================================================= */
(function () {
  "use strict";

  const SK = (window.SK = window.SK || {});
  const TAU = Math.PI * 2;

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** Deterministic pseudo-random 0..1 for per-ring art variation. */
  function hash(n) {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function easeOut(t) {
    const p = clamp(t, 0, 1);
    return 1 - Math.pow(1 - p, 3);
  }

  // -------------------------------------------------------------------------
  // Dense Kamui vortex
  // -------------------------------------------------------------------------
  /**
   * Draw the reference-style Kamui vortex at (cx, cy).
   * Layers: soft grey dimensional haze -> outer broken smoke -> nine inked
   * spiral ribbons (outer slow, inner fast) -> inward-flow specks -> a tiny,
   * stable central vanishing point.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} R outer radius in world pixels
   * @param {number} time seconds
   * @param {{alpha?:number, seed?:number, squash?:number, rings?:number, haze?:number}} [opts]
   */
  function drawVortex(ctx, cx, cy, R, time, opts) {
    opts = opts || {};
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    if (alpha <= 0.002 || R <= 0.5) return;
    const seed = opts.seed || 0;
    const squash = opts.squash == null ? 0.98 : opts.squash;
    const ringCount = opts.rings || 10;
    const hazeAmt = opts.haze == null ? 1 : opts.haze;
    const red = !!opts.red;
    const breathe = 1 + Math.sin(time * 1.7 + seed) * 0.018 + Math.sin(time * 0.7 - seed * 1.3) * 0.012;
    const RR = R * breathe;

    ctx.save();
    ctx.globalAlpha = alpha;

    // --- 1. grey dimensional haze (environment stays visible through it) ----
    if (hazeAmt > 0) {
      const haze = ctx.createRadialGradient(cx, cy, RR * 0.08, cx, cy, RR * 1.34);
      if (red) {
        haze.addColorStop(0, "rgba(116,20,32," + (0.34 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(0.42, "rgba(86,14,26," + (0.26 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(0.72, "rgba(58,9,18," + (0.15 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(0.92, "rgba(34,4,10," + (0.06 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(1, "rgba(20,2,6,0)");
      } else {
        haze.addColorStop(0, "rgba(232,236,236," + (0.38 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(0.42, "rgba(198,203,203," + (0.29 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(0.72, "rgba(166,171,171," + (0.165 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(0.92, "rgba(138,142,142," + (0.06 * hazeAmt).toFixed(3) + ")");
        haze.addColorStop(1, "rgba(130,134,134,0)");
      }
      ctx.fillStyle = haze;
      ctx.beginPath();
      ctx.ellipse(cx, cy, RR * 1.34, RR * 1.34 * squash, 0, 0, TAU);
      ctx.fill();

      // Smoky outer wash: a few very soft lobes that rotate slowly.
      for (let i = 0; i < 5; i++) {
        const a = time * 0.11 + (i / 5) * TAU + seed;
        const lx = cx + Math.cos(a) * RR * (0.96 + hash(i + seed + 3) * 0.28);
        const ly = cy + Math.sin(a) * RR * (0.96 + hash(i + seed + 7) * 0.28) * squash;
        const lr = RR * (0.38 + hash(i + seed + 11) * 0.34);
        const lobe = ctx.createRadialGradient(lx, ly, 1, lx, ly, lr);
        if (red) {
          lobe.addColorStop(0, "rgba(150,24,38," + (0.06 * hazeAmt).toFixed(3) + ")");
          lobe.addColorStop(1, "rgba(90,10,20,0)");
        } else {
          lobe.addColorStop(0, "rgba(176,180,180," + (0.055 * hazeAmt).toFixed(3) + ")");
          lobe.addColorStop(1, "rgba(150,154,154,0)");
        }
        ctx.fillStyle = lobe;
        ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
      }
    }

    // --- 2. broken, warped outer boundary ----------------------------------
    for (let i = 0; i < 13; i++) {
      const a0 = time * (0.18 + hash(i + seed + 21) * 0.16) + (i / 13) * TAU + seed * 0.9;
      const span = 0.16 + hash(i + seed + 31) * 0.5;
      const rr = RR * (0.93 + hash(i + seed + 41) * 0.2);
      ctx.beginPath();
      ctx.ellipse(cx, cy, rr, rr * squash, 0, a0, a0 + span);
      ctx.lineWidth = 1 + Math.floor(hash(i + seed + 51) * 3);
      if (red) {
        ctx.strokeStyle =
          i % 3 === 0
            ? "rgba(6,0,2," + (0.42 + hash(i + seed + 61) * 0.34).toFixed(3) + ")"
            : "rgba(150,24,38," + (0.22 + hash(i + seed + 71) * 0.28).toFixed(3) + ")";
      } else {
        ctx.strokeStyle =
          i % 3 === 0
            ? "rgba(5,5,5," + (0.42 + hash(i + seed + 61) * 0.34).toFixed(3) + ")"
            : "rgba(74,76,76," + (0.18 + hash(i + seed + 71) * 0.26).toFixed(3) + ")";
      }
      ctx.stroke();
    }

    // --- 3. inked spiral ribbons -------------------------------------------
    // Outer ribbons are broad, pale charcoal and slow. Inner ribbons are thin,
    // black and fast, matching the dense layered look of the reference.
    for (let i = 0; i < ringCount; i++) {
      const tN = ringCount > 1 ? i / (ringCount - 1) : 0; // 0 outer .. 1 inner
      const sd = seed + i * 17.13;
      const speed = (0.28 + (1 - tN) * 2.35) * (hash(sd + 1) > 0.14 ? 1 : -1);
      const rot = time * speed + sd * 1.71;
      const rOuter = RR * (0.24 + 0.79 * (1 - tN));
      const rInner = RR * (0.018 + 0.2 * (1 - tN));
      const turns = 1.08 + hash(sd + 2) * 0.52;
      const wob = RR * (0.012 + hash(sd + 3) * 0.028);
      const baseW = Math.max(1.6, RR * (0.042 + (1 - tN) * 0.035 + hash(sd + 4) * 0.012));
      const tone = i % 5;
      const coreCol = red
        ? tone === 0
          ? "#3a0a10"
          : tone === 1
          ? "#180206"
          : tone === 2
          ? "#000000"
          : tone === 3
          ? "#26040a"
          : "#060001"
        : tone === 0
        ? "#2f2f2f"
        : tone === 1
        ? "#141414"
        : tone === 2
        ? "#000000"
        : tone === 3
        ? "#090909"
        : "#000000";
      const smokeCol = red ? (tone === 0 ? "rgba(120,18,30," : "rgba(58,8,16,") : tone === 0 ? "rgba(118,120,120," : "rgba(52,54,54,";
      const steps = 58;

      // (a) soft smoky underlay, offset so ring edges look blurred/organic.
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const a = rot + u * turns * Math.PI * 2;
        const rr = rOuter + (rInner - rOuter) * Math.pow(u, 0.86);
        const w1 = Math.sin(u * 7.1 + time * 2.2 + sd) * wob;
        const w2 = Math.sin(u * 15.7 - time * 3.1 + sd * 1.6) * wob * 0.52;
        const px = cx + Math.cos(a) * (rr + w1 + w2);
        const py = cy + Math.sin(a) * (rr + w1 + w2) * squash;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = baseW * 3.1;
      ctx.strokeStyle = smokeCol + "0.16)";
      ctx.stroke();

      // (b) inked ribbon body.
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const a = rot + u * turns * Math.PI * 2;
        const rr = rOuter + (rInner - rOuter) * Math.pow(u, 0.86);
        const w1 = Math.sin(u * 7.1 + time * 2.2 + sd) * wob;
        const w2 = Math.sin(u * 15.7 - time * 3.1 + sd * 1.6) * wob * 0.52;
        const px = cx + Math.cos(a) * (rr + w1 + w2);
        const py = cy + Math.sin(a) * (rr + w1 + w2) * squash;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.lineWidth = baseW;
      ctx.strokeStyle = coreCol;
      ctx.stroke();

      // (b2) an extra broad ink pass on every third ribbon gives the heavy,
      // uneven concentric-band look of the reference.
      if (i % 3 === 0) {
        ctx.globalAlpha = alpha * 0.45;
        ctx.lineWidth = baseW * 1.9;
        ctx.strokeStyle = "#000000";
        ctx.stroke();
        ctx.globalAlpha = alpha;
      }

      // (c) narrow highlight along one edge of some ribbons, keeping the ink
      // readable as separate overlapping rings.
      if (i % 2 === 0) {
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const a = rot + u * turns * Math.PI * 2 + 0.018;
          const rr = rOuter + (rInner - rOuter) * Math.pow(u, 0.86) + baseW * 0.7;
          const w1 = Math.sin(u * 7.1 + time * 2.2 + sd) * wob;
          const w2 = Math.sin(u * 15.7 - time * 3.1 + sd * 1.6) * wob * 0.52;
          const px = cx + Math.cos(a) * (rr + w1 + w2);
          const py = cy + Math.sin(a) * (rr + w1 + w2) * squash;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.lineWidth = Math.max(1, baseW * 0.34);
        ctx.strokeStyle = red ? "rgba(255,112,124,0.3)" : "rgba(150,153,153,0.25)";
        ctx.stroke();
      }
    }

    // --- 3b. heavy broken ink bands (the reference's thick layered rings) ---
    for (let b = 0; b < 6; b++) {
      const sd = seed + b * 23.7;
      const rr = RR * (0.22 + b * 0.135);
      const speed = 0.35 + (1 - b / 6) * 1.0;
      const rot = time * speed + sd;
      const thick = Math.max(1.4, RR * (0.026 + hash(sd + 1) * 0.032));
      const arcs = 2 + (b % 2);
      for (let k = 0; k < arcs; k++) {
        const a0 = rot + (k / arcs) * TAU + hash(sd + k + 2) * 0.6;
        const span = 0.7 + hash(sd + k + 3) * 1.2;
        ctx.beginPath();
        const steps = 26;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const a = a0 + span * u;
          const wobR =
            RR * (0.018 * Math.sin(u * 5 + time * 2 + b) + 0.01 * Math.sin(u * 11 - time * 3));
          const px = cx + Math.cos(a) * (rr + wobR);
          const py = cy + Math.sin(a) * (rr + wobR) * squash;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.lineWidth = thick;
        ctx.strokeStyle = red
          ? b % 2 === 0
            ? "rgba(70,6,14,0.72)"
            : "rgba(12,0,3,0.66)"
          : b % 2 === 0
          ? "rgba(4,4,4,0.72)"
          : "rgba(22,23,23,0.66)";
        ctx.stroke();
        if (k === 0 && b % 3 === 0) {
          ctx.lineWidth = Math.max(1, thick * 0.3);
          ctx.strokeStyle = red ? "rgba(255,90,104,0.34)" : "rgba(148,151,151,0.3)";
          ctx.stroke();
        }
      }
    }

    // --- 3c. crimson accents (mega portals only) ---------------------------
    if (red) {
      const hot = 0.55 + 0.45 * Math.sin(time * 5.2 + seed);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";

      // Outer crimson event-horizon rim.
      ctx.globalAlpha = alpha * (0.32 + hot * 0.2);
      ctx.strokeStyle = "#c31b2e";
      ctx.lineWidth = Math.max(1, RR * 0.022);
      ctx.beginPath();
      ctx.ellipse(cx, cy, RR * 0.94, RR * 0.94 * squash, 0, 0, TAU);
      ctx.stroke();

      // Broken hot arcs rotating the other way.
      ctx.globalAlpha = alpha * (0.4 + hot * 0.25);
      ctx.strokeStyle = "#ff4658";
      ctx.lineWidth = Math.max(1, RR * 0.014);
      for (let i = 0; i < 5; i++) {
        const a0 = -time * 0.5 + (i / 5) * TAU + hash(i + seed + 131) * 0.9;
        const span = 0.32 + hash(i + seed + 141) * 0.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, RR * (0.82 + i * 0.026), RR * (0.82 + i * 0.026) * squash, 0, a0, a0 + span);
        ctx.stroke();
      }

      // Jagged crimson lightning cracks stabbing toward the core.
      ctx.globalAlpha = alpha * 0.5;
      for (let i = 0; i < 6; i++) {
        const a = time * 0.6 + (i / 6) * TAU + hash(i + seed + 151) * 0.7;
        ctx.strokeStyle = i % 2 === 0 ? "#ff7a88" : "#ff2d3f";
        ctx.lineWidth = 1;
        ctx.beginPath();
        const steps = 4;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const rr = RR * (0.86 - u * 0.56);
          const jag = (hash(i * 9 + s + seed + 161) - 0.5) * RR * 0.12;
          const px = cx + Math.cos(a + u * 0.5) * rr + jag;
          const py = cy + Math.sin(a + u * 0.5) * rr * squash + jag * 0.5;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Fierce core flare.
      const flare = ctx.createRadialGradient(cx, cy, 0, cx, cy, RR * 0.34);
      flare.addColorStop(0, "rgba(255,190,196," + (0.42 + hot * 0.3).toFixed(3) + ")");
      flare.addColorStop(0.35, "rgba(255,70,88," + (0.26 + hot * 0.18).toFixed(3) + ")");
      flare.addColorStop(1, "rgba(160,16,34,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = flare;
      ctx.fillRect(cx - RR * 0.4, cy - RR * 0.4, RR * 0.8, RR * 0.8);
      ctx.restore();
    }

    // --- 4. fluid inward flow specks ---------------------------------------
    for (let i = 0; i < 16; i++) {
      const cycle = (time * (0.2 + hash(i + 81) * 0.16) + hash(i + 91)) % 1;
      const rr = RR * (1.0 - cycle * 0.94);
      const a = time * (0.8 + hash(i + 101) * 1.5) + hash(i + 111) * TAU + cycle * 5.4;
      const px = Math.round(cx + Math.cos(a) * rr);
      const py = Math.round(cy + Math.sin(a) * rr * squash);
      ctx.globalAlpha = alpha * Math.sin(cycle * Math.PI) * 0.55;
      ctx.fillStyle = red
        ? i % 4 === 0
          ? "#ffd0d6"
          : i % 3 === 0
          ? "#ff4658"
          : i % 2 === 0
          ? "#b32336"
          : "#0a0002"
        : i % 3 === 0
        ? "#6f7272"
        : "#050505";
      ctx.fillRect(px, py, i % 4 === 0 ? 2 : 1, 1);
    }
    ctx.globalAlpha = alpha;

    // --- 5. stable central vanishing point --------------------------------
    const coreR = Math.max(1, RR * 0.035);
    ctx.fillStyle = "#050505";
    ctx.beginPath();
    ctx.ellipse(cx, cy, coreR * 1.25, coreR, 0, 0, TAU);
    ctx.fill();
    // Tiny pinched inner loops.
    ctx.strokeStyle = red ? "rgba(60,4,10,0.75)" : "rgba(8,8,8,0.7)";
    ctx.lineWidth = Math.max(1, RR * 0.014);
    for (let i = 0; i < 3; i++) {
      const r0 = RR * (0.045 + i * 0.026);
      const a0 = time * (2.2 + i * 0.6) + i * 2.1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r0, r0 * 0.94, 0, a0, a0 + 2.9);
      ctx.stroke();
    }
    // One pale glint reads as the infinitely deep point without breaking the
    // dark palette.
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = red ? "#ffd0d6" : "#cfd2d2";
    ctx.fillRect(Math.round(cx - coreR * 0.35), Math.round(cy - coreR * 0.55), 1, 1);

    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Sparse eye-originating intangibility distortion
  // -------------------------------------------------------------------------
  /**
   * Sparse, broken black/grey spiral tendrils unravelling from a single eye.
   * Deliberately NOT a dense vortex and NOT a closed circular portal.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} ex eye world x
   * @param {number} ey eye world y
   * @param {number} facing -1 or 1
   * @param {number} time seconds
   * @param {number} power 0..1 fade/strength
   */
  function drawEyeTrails(ctx, ex, ey, facing, time, power) {
    const p = clamp(power, 0, 1);
    if (p <= 0.01) return;
    const dir = facing < 0 ? -1 : 1;
    const trails = 12;
    const TAU2 = Math.PI * 2;

    ctx.save();
    ctx.globalAlpha = p;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Tiny inward warp right at the eye: two or three incomplete arcs.
    ctx.globalAlpha = p * 0.5;
    ctx.strokeStyle = "#1a1a1c";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const r = 1.6 + i * 1.15;
      const a0 = time * (2.4 + i * 0.7) + i * 2.2;
      ctx.beginPath();
      ctx.ellipse(ex, ey, r, r * 0.82, 0, a0, a0 + 2.1);
      ctx.stroke();
    }

    // Sparse spiral ribbons.
    for (let j = 0; j < trails; j++) {
      const sd = j * 11.7 + 4.3;
      const r0 = 2.1 + hash(sd) * 2.4;
      const r1 = 11 + hash(sd + 1) * 16 + (j % 4 === 0 ? 7 : 0);
      const span = 0.72 + hash(sd + 2) * 1.05;
      const speed = (0.42 + hash(sd + 3) * 1.15) * (hash(sd + 4) > 0.22 ? 1 : -1);
      const rot = time * speed + hash(sd + 5) * TAU2;
      // Bias the trails up and outward around the head, never down over the
      // face; a subtle front bias makes the eye the clear origin.
      const bias = -Math.PI / 2 + dir * (0.55 + hash(sd + 6) * 0.7);
      const a0 = rot + bias * 0.18;
      const width = 0.9 + hash(sd + 7) * 1.8;
      const tone =
        j % 6 === 0 ? "#c3c6cc" : j % 6 === 1 ? "#6b6e75" : j % 6 === 2 ? "#2a2b2f" : j % 6 === 3 ? "#0b0b0d" : j % 6 === 4 ? "#4b4d52" : "#17181b";
      const segs = 16;
      // Each trail is broken into 2-3 arcs with real gaps.
      const breaks = [
        [0.0, 0.3 + hash(sd + 8) * 0.14],
        [0.48 + hash(sd + 9) * 0.08, 0.68 + hash(sd + 10) * 0.08],
        [0.82 + hash(sd + 11) * 0.07, 1.0],
      ];
      for (let b = 0; b < breaks.length; b++) {
        const [u0, u1] = breaks[b];
        if (u1 <= u0) continue;
        ctx.beginPath();
        let started = false;
        for (let s = 0; s <= segs; s++) {
          const u = u0 + ((u1 - u0) * s) / segs;
          const a = rot + bias + u * span + Math.sin(u * 5.2 + time * 2.1 + sd) * 0.18;
          const rr = r0 + (r1 - r0) * Math.pow(u, 0.78);
          const wave = Math.sin(u * 8.4 + time * 2.8 + sd * 1.9) * (1.1 + u * 2.2);
          const px = ex + Math.cos(a) * (rr + wave);
          const py = ey + Math.sin(a) * (rr + wave) * 0.78;
          if (!started) {
            ctx.moveTo(px, py);
            started = true;
          } else {
            ctx.lineTo(px, py);
          }
        }
        // Faint pale edge keeps the dark tendrils readable on dark floors.
        ctx.globalAlpha = p * 0.16;
        ctx.strokeStyle = "#a9adb6";
        ctx.lineWidth = Math.max(1.2, width * 2.3);
        ctx.stroke();
        ctx.globalAlpha = p * (0.3 + hash(sd + 12 + b) * 0.36);
        ctx.strokeStyle = tone;
        ctx.lineWidth = Math.max(0.8, width * (1 - b * 0.18));
        ctx.stroke();

        // Smoky edge pass on the longest arc only.
        if (b === 0 && j % 3 === 0) {
          ctx.globalAlpha = p * 0.1;
          ctx.strokeStyle = "#6b6e72";
          ctx.lineWidth = width * 3.4;
          ctx.stroke();
        }
      }
    }

    // A couple of far, thin arcs stretching off the head.
    for (let k = 0; k < 3; k++) {
      const sd = 47 + k * 9.1;
      const rr = 17 + k * 6 + hash(sd) * 5;
      const a0 = time * (0.5 + k * 0.22) + biasFor(k, facing) + hash(sd + 1) * TAU2;
      ctx.globalAlpha = p * (0.13 + k * 0.035);
      ctx.strokeStyle = "#202124";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(ex, ey, rr, rr * 0.72, 0, a0, a0 + 0.75 + hash(sd + 2) * 0.5);
      ctx.stroke();
    }

    // The sharingan-red origin glint.
    ctx.globalAlpha = p * (0.65 + 0.25 * Math.sin(time * 8));
    ctx.fillStyle = "#ff4658";
    ctx.fillRect(Math.round(ex), Math.round(ey), 1, 1);
    ctx.globalAlpha = p * 0.35;
    ctx.fillStyle = "#ffb3ba";
    ctx.fillRect(Math.round(ex) + 1, Math.round(ey) - 1, 1, 1);

    ctx.restore();
  }

  function biasFor(k, facing) {
    return -Math.PI / 2 + (facing < 0 ? -1 : 1) * (0.4 + k * 0.24);
  }

  // -------------------------------------------------------------------------
  // Rift dimension overlay
  // -------------------------------------------------------------------------
  /**
   * Light-purple dimensional wash over the whole screen. Kept translucent so
   * the normal dungeon stays readable beneath the alternate dimension.
   */
  function drawRiftOverlay(ctx, time, w, h, strength) {
    const s = strength == null ? 1 : clamp(strength, 0, 1);
    if (s <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = s;

    // Flat lavender wash.
    ctx.fillStyle = "rgba(206,190,255,0.15)";
    ctx.fillRect(0, 0, w, h);

    // Brighter at the edges, soft in the middle: a dimension pressing in.
    const g = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, 320);
    g.addColorStop(0, "rgba(222,208,255,0.04)");
    g.addColorStop(0.55, "rgba(178,150,255,0.09)");
    g.addColorStop(0.86, "rgba(139,110,235,0.17)");
    g.addColorStop(1, "rgba(120,86,220,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Slow drifting dark-violet smoke bands.
    for (let i = 0; i < 4; i++) {
      const y = h * (0.18 + i * 0.22) + Math.sin(time * 0.24 + i * 1.7) * 12;
      const x = ((time * (7 + i * 3) + i * 173) % (w + 220)) - 110;
      const band = ctx.createLinearGradient(x - 130, y, x + 130, y);
      band.addColorStop(0, "rgba(80,52,150,0)");
      band.addColorStop(0.5, "rgba(80,52,150,0.045)");
      band.addColorStop(1, "rgba(80,52,150,0)");
      ctx.fillStyle = band;
      ctx.fillRect(x - 140, y - 18, 280, 36);
    }

    // Suspended dimensional motes.
    for (let i = 0; i < 44; i++) {
      const px = (hash(i + 3) * w + time * (3 + hash(i + 7) * 8)) % w;
      const py = (hash(i + 11) * h + Math.sin(time * 0.5 + i) * 8 + h) % h;
      const tw = 0.08 + 0.16 * Math.abs(Math.sin(time * 1.4 + i * 1.9));
      ctx.globalAlpha = s * tw;
      ctx.fillStyle = i % 4 === 0 ? "#f3e8ff" : i % 4 === 1 ? "#c4b5fd" : "#8b5cf6";
      ctx.fillRect(Math.round(px), Math.round(py), 1, 1);
    }

    // Broken edge tears reinforce "another dimension" without a hard frame.
    ctx.globalAlpha = s * 0.35;
    ctx.strokeStyle = "#7c5bd6";
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const a0 = time * 0.1 + i * 0.63;
      const rr = 220 + (i % 3) * 18;
      ctx.beginPath();
      ctx.ellipse(w / 2, h / 2, rr, rr * 0.68, 0, a0, a0 + 0.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------
  // Vortex effect entity (portals in the world)
  // -------------------------------------------------------------------------
  class KamuiVortex {
    /**
     * @param {number} x
     * @param {number} y
     * @param {{radius?:number, open?:number, hold?:number, close?:number,
     *          alpha?:number, squash?:number, seed?:number, layer?:string,
     *          follow?:object}} [opts]
     */
    constructor(x, y, opts) {
      opts = opts || {};
      this.x = x;
      this.y = y;
      this.radius = opts.radius || 42;
      this.openTime = opts.open == null ? 0.18 : opts.open;
      this.holdTime = opts.hold == null ? 0.5 : opts.hold;
      this.closeTime = opts.close == null ? 0.26 : opts.close;
      this.t = 0;
      this.life = this.openTime + this.holdTime + this.closeTime;
      this.alpha = opts.alpha == null ? 1 : opts.alpha;
      this.squash = opts.squash == null ? 0.98 : opts.squash;
      this.seed = opts.seed == null ? Math.random() * 100 : opts.seed;
      this.layer = opts.layer || "ground";
      this.red = !!opts.red;
      this.follow = opts.follow || null;
      this.followY = opts.followY || 0;
      this.dead = false;
    }

    /** 0..1 open envelope. */
    scale() {
      if (this.t < this.openTime) return easeOut(this.t / this.openTime);
      if (this.t <= this.openTime + this.holdTime) return 1;
      const p = (this.t - this.openTime - this.holdTime) / this.closeTime;
      return 1 - easeOut(p);
    }

    update(dt) {
      this.t += dt;
      if (this.follow && this.follow.alive !== false) {
        this.x = this.follow.x;
        this.y = this.follow.y + this.followY;
      }
      if (this.t >= this.life) this.dead = true;
    }

    draw(ctx, game) {
      const k = this.scale();
      if (k <= 0.01) return;
      const rr = this.radius * (0.55 + 0.45 * k);
      drawVortex(ctx, this.x, this.y, rr, (game ? game.time : this.t) + this.seed, {
        alpha: this.alpha * k,
        seed: this.seed,
        squash: this.squash,
        haze: 0.55 + 0.45 * k,
        red: this.red,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Mega Kamui portal (every third Kamui Gloves cast)
  // -------------------------------------------------------------------------
  /**
   * A large red-tinged rift disc that is fired forward, then blooms into a
   * massive vortex. Travel/bloom visuals live here; the splash damage is
   * applied by `game.kamuiMegaImpact` at the moment of the bloom.
   */
  class KamuiMegaPortal {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} angle travel direction (radians)
     * @param {{speed?:number, radius?:number, bloomRadius?:number, range?:number,
     *          splash?:number, damage?:number, hold?:number, close?:number,
     *          seed?:number}} [opts]
     */
    constructor(x, y, angle, opts) {
      opts = opts || {};
      this.x = x;
      this.y = y;
      this.angle = angle == null ? 0 : angle;
      this.dirX = Math.cos(this.angle);
      this.dirY = Math.sin(this.angle);
      this.speed = opts.speed || 245;
      this.radius = opts.radius || 31;
      this.bloomRadius = opts.bloomRadius || 78;
      this.range = opts.range || 180;
      this.splash = opts.splash || 76;
      this.damage = opts.damage || 9999;
      this.holdTime = opts.hold == null ? 0.62 : opts.hold;
      this.closeTime = opts.close == null ? 0.3 : opts.close;
      this.growTime = 0.16;
      this.seed = opts.seed == null ? Math.random() * 100 : opts.seed;
      this.state = "travel";
      this.travelled = 0;
      this.bloomT = 0;
      this.trail = [];
      this.dead = false;
      this.layer = "ground";
    }

    update(dt, game) {
      if (this.dead) return;
      if (this.state === "travel") {
        const step = this.speed * dt;
        const nx = this.x + this.dirX * step;
        const ny = this.y + this.dirY * step;
        // The rift swallows the first enemy it touches, blooming on the spot
        // so a well-aimed mega cast cannot sail past its target.
        if (game && game.enemies) {
          for (const e of game.enemies) {
            if (!e.alive || e.banishing) continue;
            if (Math.hypot(e.x - nx, e.y - 10 - ny) <= this.radius * 0.85 + 9) {
              this.x = e.x;
              this.y = e.y - 10;
              this.bloom(game);
              return;
            }
          }
        }
        const blocked =
          game &&
          game.dungeon &&
          (game.dungeon.rectHitsTiles(nx - 5, ny - 5, 10, 10) ||
            (game.gateAtRect && game.gateAtRect(nx - 5, ny - 5, 10, 10)) ||
            (game.crateAtRect && game.crateAtRect(nx - 5, ny - 5, 10, 10)));
        if (blocked) {
          this.bloom(game);
          return;
        }
        this.trail.push({ x: this.x, y: this.y, a: 1 });
        if (this.trail.length > 9) this.trail.shift();
        this.x = nx;
        this.y = ny;
        this.travelled += step;
        if (this.travelled >= this.range) this.bloom(game);
        return;
      }
      for (const t of this.trail) t.a = Math.max(0, t.a - dt * 3.6);
      this.bloomT += dt;
      if (this.bloomT >= this.growTime + this.holdTime + this.closeTime) this.dead = true;
    }

    bloom(game) {
      if (this.state !== "travel") return;
      this.state = "bloom";
      this.bloomT = 0;
      if (game && game.kamuiMegaImpact) {
        game.kamuiMegaImpact(this.x, this.y, {
          radius: this.splash,
          damage: this.damage,
          angle: this.angle,
        });
      }
    }

    scale() {
      if (this.state === "travel") return 1;
      const grow = Math.min(1, this.bloomT / this.growTime);
      const eased = 1 - Math.pow(1 - grow, 2.2);
      let k = 0.44 + 0.56 * eased;
      const closeAt = this.growTime + this.holdTime;
      if (this.bloomT > closeAt) {
        k *= 1 - easeOut((this.bloomT - closeAt) / this.closeTime);
      }
      return Math.max(0, k);
    }

    draw(ctx, game) {
      const time = game ? game.time : this.bloomT;
      if (this.state === "travel") {
        const wob = 1 + Math.sin(time * 16 + this.seed) * 0.05;

        // Dark-red motion streak behind the disc.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < this.trail.length; i++) {
          const t = this.trail[i];
          const a = (i + 1) / this.trail.length;
          ctx.globalAlpha = 0.2 * a * t.a;
          ctx.fillStyle = i % 3 === 0 ? "#ff4658" : "#5e1622";
          const rr = this.radius * (0.35 + a * 0.45);
          ctx.beginPath();
          ctx.ellipse(t.x, t.y, rr, rr * 0.72, this.angle, 0, TAU);
          ctx.fill();
        }

        // Hot red aura around the disc.
        const aura = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 2.1);
        aura.addColorStop(0, "rgba(255,70,88,0.36)");
        aura.addColorStop(0.5, "rgba(160,16,34,0.2)");
        aura.addColorStop(1, "rgba(80,6,16,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = aura;
        ctx.fillRect(this.x - this.radius * 2.2, this.y - this.radius * 2.2, this.radius * 4.4, this.radius * 4.4);
        ctx.restore();

        drawVortex(ctx, this.x, this.y, this.radius * wob, time + this.seed, {
          alpha: 1,
          seed: this.seed,
          squash: 0.9,
          haze: 0.75,
          rings: 11,
          red: true,
        });

        // Bright leading edge: a crescent of hot red pixels.
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(time * 20);
        ctx.fillStyle = "#ffd0d6";
        for (let i = 0; i < 9; i++) {
          const a = this.angle + (i / 8 - 0.5) * 1.4;
          ctx.fillRect(
            Math.round(this.x + Math.cos(a) * this.radius * 1.02),
            Math.round(this.y + Math.sin(a) * this.radius * 0.92),
            1,
            1
          );
        }
        ctx.restore();

        // Black core keeps the disc readable against the crimson floor.
        ctx.save();
        ctx.fillStyle = "#050002";
        ctx.beginPath();
        ctx.ellipse(this.x, this.y, this.radius * 0.34, this.radius * 0.3, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
        return;
      }

      const k = this.scale();
      if (k <= 0.01) return;
      const rr = this.bloomRadius * k;
      const closing = clamp(
        (this.bloomT - (this.growTime + this.holdTime)) / Math.max(0.001, this.closeTime),
        0,
        1
      );
      const fade = 1 - closing;

      // Massive crimson halo.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const halo = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, rr * 1.5);
      halo.addColorStop(0, "rgba(255,60,80,0.3)");
      halo.addColorStop(0.55, "rgba(150,16,34,0.16)");
      halo.addColorStop(1, "rgba(70,4,14,0)");
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = halo;
      ctx.fillRect(this.x - rr * 1.6, this.y - rr * 1.6, rr * 3.2, rr * 3.2);
      ctx.restore();

      drawVortex(ctx, this.x, this.y, rr, time + this.seed, {
        alpha: 0.98 * Math.min(1, k * 1.35),
        seed: this.seed,
        squash: 0.88,
        haze: 1,
        rings: 12,
        red: true,
      });

      // Rotating crimson rune ring just outside the ink.
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const hot = 0.55 + 0.45 * Math.sin(time * 6.4 + this.seed);
      ctx.globalAlpha = 0.4 + hot * 0.3;
      ctx.fillStyle = "#ff4658";
      const spin = time * 0.9;
      for (let i = 0; i < 40; i++) {
        if (i % 4 === 0) continue;
        const a = (i / 40) * TAU + spin;
        ctx.fillRect(
          Math.round(this.x + Math.cos(a) * rr * 1.06),
          Math.round(this.y + Math.sin(a) * rr * 1.06 * 0.88),
          1,
          1
        );
      }
      ctx.globalAlpha = (0.25 + hot * 0.2) * fade;
      ctx.fillStyle = "#ffd0d6";
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU - spin * 1.6;
        ctx.fillRect(
          Math.round(this.x + Math.cos(a) * rr * 0.72),
          Math.round(this.y + Math.sin(a) * rr * 0.72 * 0.88),
          1,
          1
        );
      }
      ctx.restore();
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  SK.Kamui = {
    drawVortex: drawVortex,
    drawEyeTrails: drawEyeTrails,
    drawRiftOverlay: drawRiftOverlay,
    hash: hash,
    easeOut: easeOut,
  };
  SK.KamuiVortex = KamuiVortex;
  SK.KamuiMegaPortal = KamuiMegaPortal;
})();
