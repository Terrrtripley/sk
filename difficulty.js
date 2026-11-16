/* =========================================================================
   DUNGEON SK — difficulty.js
   Single source of truth for per-floor difficulty scaling. Depth is the
   1-based floor number shown in the HUD as FLOOR 1-<depth>.

   The curve is deliberately linear and readable so it can be asserted in
   tests and surfaced in the floor-advance notice:
     - HP: +20% of the base value per floor (depth 1 = 100%).
     - Goblins: one extra per two floors (capped at +4 => 7-8 per room).
     - Turrets: one extra per three floors (capped at +2 => 3-4 per room).
   Room sizes stay unchanged; caps keep placements comfortable and avoid
   bullet-hell pile-ups on very deep runs.
   ========================================================================= */
(function () {
  "use strict";

  const SK = (window.SK = window.SK || {});

  const HP_GROWTH = 0.2;
  const GOBLIN_BASE_MIN = 3;
  const GOBLIN_BASE_MAX = 4;
  const GOBLIN_EXTRA_EVERY = 2;
  const GOBLIN_EXTRA_MAX = 4;
  const TURRET_BASE_MIN = 1;
  const TURRET_BASE_MAX = 2;
  const TURRET_EXTRA_EVERY = 3;
  const TURRET_EXTRA_MAX = 2;
  const TURRET_MAX = 4;

  function normalizeDepth(depth) {
    return Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
  }

  /** Linear HP multiplier: 1.0 at depth 1, +0.2 per floor after that. */
  function hpMultiplier(depth) {
    return 1 + HP_GROWTH * (normalizeDepth(depth) - 1);
  }

  /** Whole-number percentage for notices/UI: depth 2 => 20. */
  function hpPercent(depth) {
    return Math.round((hpMultiplier(depth) - 1) * 100);
  }

  /** Scale a base enemy HP value, rounding to a whole number, minimum 1. */
  function scaleHp(baseHp, depth) {
    return Math.max(1, Math.round(baseHp * hpMultiplier(depth)));
  }

  /** Inclusive goblin count range for one combat room at this depth. */
  function goblinRange(depth) {
    const extra = Math.min(
      GOBLIN_EXTRA_MAX,
      Math.floor((normalizeDepth(depth) - 1) / GOBLIN_EXTRA_EVERY)
    );
    return { min: GOBLIN_BASE_MIN + extra, max: GOBLIN_BASE_MAX + extra };
  }

  /** Inclusive crystal turret count range for one combat room at this depth. */
  function turretRange(depth) {
    const extra = Math.min(
      TURRET_EXTRA_MAX,
      Math.floor((normalizeDepth(depth) - 1) / TURRET_EXTRA_EVERY)
    );
    return {
      min: Math.min(TURRET_MAX, TURRET_BASE_MIN + extra),
      max: Math.min(TURRET_MAX, TURRET_BASE_MAX + extra),
    };
  }

  SK.Difficulty = {
    normalizeDepth: normalizeDepth,
    hpMultiplier: hpMultiplier,
    hpPercent: hpPercent,
    scaleHp: scaleHp,
    goblinRange: goblinRange,
    turretRange: turretRange,
    hpGrowthPerFloor: HP_GROWTH,
    goblinExtraMax: GOBLIN_EXTRA_MAX,
    turretMax: TURRET_MAX,
  };
})();
