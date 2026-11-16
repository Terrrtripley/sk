/* =========================================================================
   DUNGEON SK — sprites.js
   Pixel-matrix sprite baker, palette definitions, baked art and pixel font.
   Classic script (IIFE) so the game works from file:// with zero build step.
   ========================================================================= */
(function () {
  "use strict";

  const SK = (window.SK = window.SK || {});

  const OUTLINE_COLOR = "#0a0c12";
  const BAKED = Object.create(null);

  const colorCache = new Map();
  function hexToRgb(hex) {
    let c = colorCache.get(hex);
    if (c) return c;
    const h = hex.charAt(0) === "#" ? hex.slice(1) : hex;
    const v = h.length === 3
      ? h.split("").map((ch) => parseInt(ch + ch, 16))
      : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    c = [v[0], v[1], v[2], 255];
    colorCache.set(hex, c);
    return c;
  }

  /**
   * Bake an ASCII pixel matrix into an offscreen canvas at 1x resolution.
   * "." = transparent; every other character maps to a palette color.
   * A 1px outer/inner dark outline is generated around opaque silhouettes.
   *
   * @param {Object<string,string>} palette
   * @param {string[]} rows
   * @param {{outline?: boolean, flash?: boolean, name?: string}} [opts]
   * @returns {{canvas: HTMLCanvasElement, flash: HTMLCanvasElement|null, width: number, height: number}}
   */
  function bakeSprite(palette, rows, opts) {
    opts = opts || {};
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("bakeSprite: empty rows");
    const w = rows[0].length;
    const h = rows.length;
    for (let y = 0; y < h; y++) {
      if (rows[y].length !== w) {
        throw new Error(
          "bakeSprite(" + (opts.name || "?") + "): row " + y + " is " + rows[y].length + " wide, expected " + w
        );
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(w, h);
    const data = img.data;
    const filled = new Uint8Array(w * h);

    const outlineRgb = hexToRgb(opts.outlineColor || OUTLINE_COLOR);

    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row.charAt(x);
        if (ch === ".") continue;
        const hex = palette[ch];
        if (!hex) {
          throw new Error("bakeSprite(" + (opts.name || "?") + "): unknown palette char '" + ch + "' at " + x + "," + y);
        }
        const rgb = hexToRgb(hex);
        const i = (y * w + x) * 4;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
        data[i + 3] = 255;
        filled[y * w + x] = 1;
      }
    }

    if (opts.outline !== false) {
      // 8-way neighbour outline, written only into transparent cells so it can
      // never eat into the sprite's fill. This guarantees an unbroken border.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (filled[idx]) continue;
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
              if (filled[ny * w + nx]) {
                near = true;
                break;
              }
            }
          }
          if (near) {
            const i = idx * 4;
            data[i] = outlineRgb[0];
            data[i + 1] = outlineRgb[1];
            data[i + 2] = outlineRgb[2];
            data[i + 3] = 255;
          }
        }
      }
    }

    ctx.putImageData(img, 0, 0);

    let flash = null;
    if (opts.flash) {
      flash = document.createElement("canvas");
      flash.width = w;
      flash.height = h;
      const fctx = flash.getContext("2d");
      const fimg = fctx.createImageData(w, h);
      const fdata = fimg.data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        const isOutline = data[i] === outlineRgb[0] && data[i + 1] === outlineRgb[1] && data[i + 2] === outlineRgb[2];
        if (isOutline) {
          fdata[i] = outlineRgb[0];
          fdata[i + 1] = outlineRgb[1];
          fdata[i + 2] = outlineRgb[2];
        } else {
          fdata[i] = 255;
          fdata[i + 1] = 255;
          fdata[i + 2] = 255;
        }
        fdata[i + 3] = 255;
      }
      fctx.putImageData(fimg, 0, 0);
    }

    return { canvas: canvas, flash: flash, width: w, height: h };
  }

  function register(name, palette, rows, opts) {
    const baked = bakeSprite(palette, rows, Object.assign({ name: name }, opts || {}));
    BAKED[name] = baked;
    return baked;
  }

  // Right-pad ASCII art rows to an exact width so hand-authored silhouettes can
  // be written compactly without counting trailing dots.
  function padRows(width, rows) {
    return rows.map(function (row, i) {
      if (row.length > width) {
        throw new Error("padRows: row " + i + " is " + row.length + " wide, expected at most " + width);
      }
      return row + ".".repeat(width - row.length);
    });
  }

  // -------------------------------------------------------------------------
  // Palettes (single-character keys only)
  // -------------------------------------------------------------------------
  const PLAYER_PAL = {
    W: "#f2f5fb", w: "#cbd3e2", s: "#8e98ac",
    f: "#d8c1a3", F: "#b79a7a", c: "#5ce8ff",
    g: "#e8b04e", G: "#a06d24",
    d: "#3b3b55", e: "#26263a",
    B: "#6b4a32", b: "#3f2b1e",
  };

  const GOBLIN_PAL = {
    "1": "#7fc45a", "2": "#4d8a36", "3": "#a9e07c", "4": "#2e5c25",
    "6": "#e13b3b", "8": "#e8e0cf",
    v: "#7a5135", V: "#55371f", "5": "#3a2e26",
  };

  const SHAMAN_PAL = {
    p: "#8b3a63", P: "#5c2144", q: "#b65b86", "9": "#3b142c",
    y: "#ffd84a", r: "#8a5a2c", R: "#5b3a1c", m: "#5ee0a0",
  };

  const WEAPON_PAL = {
    S: "#aeb9ca", T: "#7f8a9d", U: "#3d4553", H: "#eef3fb",
    J: "#7a4a2a", K: "#4e2f1a", g: "#e8b04e", G: "#a06d24",
  };

  const WOOD_PAL = {
    h: "#a97d4e", o: "#8a613c", O: "#5e3f26",
    g: "#e8b04e", G: "#a06d24", d: "#2c1c12", D: "#17100b",
  };

  const ORB_PAL = { C: "#64e6ff", D: "#2c9fe0", E: "#133f86" };
  const POTION_PAL = {
    L: "#c9d2e0", a: "#ef4b4b", A: "#a8262e", z: "#ff9a9a",
  };

  // Milestone 2 weapon / enemy palettes. Three tones per material, no dithering.
  const SHOTGUN_PAL = {
    H: "#eef4fc", S: "#b7c3d4", T: "#838fa2", U: "#414a59",
    J: "#9a6638", j: "#7a4a2a", K: "#4e2f1a", L: "#c08a52",
  };

  const RAIL_PAL = {
    W: "#f4f7fb", w: "#c8d1de", S: "#8e9aad", T: "#5b6678", U: "#333b48",
    C: "#6ff2ff", c: "#2ec8e8", D: "#0e6a86", H: "#eaffff",
    g: "#e8b04e", G: "#a06d24",
  };

  const SCYTHE_PAL = {
    S: "#e04a5f", s: "#b02f47", d: "#701a2c", H: "#ffb3bc",
    h: "#a97d4e", o: "#8a613c", O: "#5e3f26",
    g: "#e8b04e", G: "#a06d24", D: "#2c1c12",
  };

  const GREATSWORD_PAL = {
    B: "#7ef08a", b: "#3fbf61", d: "#1d6b3a", H: "#e6ffe6",
    g: "#e8b04e", G: "#a06d24", J: "#4a3020", j: "#6b4a32",
  };

  const TURRET_PAL = {
    T: "#6b7284", t: "#4b5263", D: "#2a2f3a", L: "#8b95a8",
    M: "#e879f9", m: "#a838d8", P: "#5b1a86", H: "#ffe6ff",
  };

  const GOLD_CHEST_PAL = {
    h: "#f6c85c", o: "#c8902e", O: "#6b4416", g: "#fff3c4", G: "#a06d24", d: "#3b2a14",
  };

  const HEART_PAL = { H: "#ffb3ba", R: "#ff4b5c" };
  const SHIELD_PAL = { H: "#b9e6ff", B: "#55b9ff", S: "#2a6fd6" };
  const BOLT_PAL = { H: "#fff2a8", Y: "#ffd84a", O: "#d69a1e" };

  // Milestone 3 hero + meta palettes. All M3 entities use a pure-black outline.
  const KNIGHT_PAL = {
    K: "#e6ecf5", k: "#b7c1d1", s: "#7c8798",
    R: "#e8404e", r: "#a32138",
    V: "#0d0f16",
    G: "#e8b04e", g: "#a06d24",
  };

  const KNIGHT_GHOST_PAL = {
    K: "#fde68a", k: "#fbbf24", s: "#f59e0b",
    R: "#fde68a", r: "#f59e0b",
    V: "#fff7d6",
    G: "#fbbf24", g: "#f59e0b",
  };

  const GRAVITO_PAL = {
    C: "#1e1b4b", c: "#2e2a6b",
    T: "#a855f7", t: "#7c3aed",
    E: "#e879f9", e: "#f5d0fe",
    W: "#cbd5e1",
    H: "#090616",
  };

  const GRAV_WEAPON_PAL = {
    H: "#475569", h: "#1e293b", S: "#94a3b8",
    G: "#d97706", g: "#92400e", O: "#f59e0b",
    B: "#3b82f6", D: "#1e293b", F: "#93c5fd",
  };

  // Dimensional Traveler: charcoal cloak, crimson Kamui mask, rift violet.
  const TRAVELER_PAL = {
    H: "#0b0a10", h: "#2c263a",
    C: "#15121d", c: "#2e273d", D: "#070609",
    P: "#381d58", p: "#8050b4", V: "#8b5cf6", v: "#c4b5fd",
    R: "#9c1723", r: "#f97316", o: "#c2410c",
    K: "#040407", k: "#2e2e38",
    S: "#eecaa8", s: "#c49674",
    E: "#ff2d3f", W: "#fff5f5",
    G: "#3e3e4a", g: "#7d7d8c", T: "#d6dbe6",
    Y: "#eeb854", y: "#a27224",
  };

  const TRAVELER_GHOST_PAL = {
    H: "#140b24", h: "#2b1850",
    C: "#1d1033", c: "#35205c", D: "#0d0618",
    P: "#2e1652", p: "#6d3fb0", V: "#8b5cf6", v: "#c4b5fd",
    R: "#6d1b4a", r: "#b43a8a", o: "#8e2d6e",
    K: "#12081f", k: "#2a1747",
    S: "#6f4fa0", s: "#523a7d",
    E: "#ff86c8", W: "#ffffff",
    G: "#2b2540", g: "#574b7a", T: "#a99ad6",
    Y: "#a87bc4", y: "#6d4b8e",
  };

  const KAMUI_GLOVE_PAL = {
    K: "#040407", k: "#2c2c35",
    R: "#b01a20", r: "#ec4040",
    Y: "#eeb854", g: "#7d7d8c",
    V: "#8b5cf6", v: "#c4b5fd",
  };

  const KAMUI_ICON_PAL = {
    K: "#040407", k: "#363640", G: "#54545f", g: "#7d7d8c",
    V: "#8b5cf6", v: "#c4b5fd", W: "#ffffff",
    R: "#ff2d3f", r: "#7f1620", E: "#ff7a88",
  };

  const GEM_PAL = {
    C: "#22d3ee", c: "#0891b2", M: "#e879f9", m: "#a21caf",
    W: "#ffffff", H: "#a5f3fc",
  };

  const METEOR_PAL = {
    D: "#090514", c: "#2e1065", v: "#4c1d95",
    M: "#e879f9", O: "#fb923c", H: "#f5d0fe",
  };

  const SKILL_PAL = {
    H: "#fff7d6", Y: "#fbbf24", O: "#f97316", D: "#7c2d12",
    P: "#a855f7", p: "#6b21a8", M: "#e879f9", K: "#030108",
    L: "#d8b4fe", W: "#ffffff",
  };

  const HOME_FLOOR_PAL = {
    t: "#4a3d33", u: "#5c4c3f", d: "#332a23", m: "#3f342c", g: "#6d5a49",
  };
  const HOME_WALL_PAL = {
    T: "#6b5a49", U: "#7f6c58", N: "#574839", V: "#635140",
    D: "#3a3129", F: "#2f2822", W: "#241e19", X: "#1a1512",
  };
  const CARPET_PAL = {
    r: "#7f1d1d", R: "#991b1b", A: "#b91c1c",
    G: "#e8b04e", g: "#a06d24", d: "#5b1414",
  };
  const HOME_WOOD_PAL = {
    h: "#8a613c", o: "#6b4a2e", O: "#432c1a", D: "#24170e",
    L: "#a97d4e", d: "#17100b",
  };
  const BOOK_PAL = {
    r: "#d94a5c", b: "#3b82f6", y: "#e8b04e", g: "#4ade80",
    p: "#c084fc", w: "#e8e0cf", o: "#b45309", d: "#2c1c12",
    h: "#8a613c", O: "#432c1a", L: "#a97d4e", D: "#24170e",
  };
  const PILLAR_PAL = {
    L: "#8d7963", M: "#6b5a49", D: "#4a3d33", d: "#332a23",
    G: "#e8b04e", g: "#a06d24", H: "#a4907a",
  };
  const PEDESTAL_PAL = {
    L: "#7f6c58", M: "#5e4e3f", D: "#3a3129", d: "#241e19",
    G: "#e8b04e", g: "#a06d24", H: "#9b8770",
  };

  const TILE_PAL = { t: "#343946", m: "#2c303c", u: "#3b4150", d: "#2a2e39" };
  const ROCK_PAL = { r: "#0b0f17", s: "#11161f", d: "#070a10", u: "#0d121a" };
  const WALL_PAL = {
    T: "#52596b", U: "#697186", N: "#454c5d", V: "#5b6376",
    D: "#363c4c", F: "#252934", W: "#1d202a", X: "#12141c",
  };
  // Endless arena: obsidian floor and basalt walls veined with crimson.
  const ARENA_FLOOR_PAL = {
    t: "#1a1520", m: "#120e18", u: "#2b2133", d: "#241a2c",
    r: "#5e1622", R: "#8c1f2e",
  };
  const ARENA_WALL_PAL = {
    T: "#2a2334", U: "#3b3149", N: "#211b2b", V: "#332a3f",
    D: "#191420", F: "#141019", W: "#0f0b13", X: "#08060b",
    R: "#8c1f2e", r: "#4a1119",
  };

  // -------------------------------------------------------------------------
  // Art
  // -------------------------------------------------------------------------
  const PLAYER_BASE = [
    "....................",
    "......WWWWWWWW......",
    "....WWWWWWWWWWWW....",
    "...WWWWwwwwwwWWWW...",
    "..WWWWwwwwwwwwWWWW..",
    "..WWggggggggggggWW..",
    "..WwwwwFFFFFFwwwwW..",
    "..WwwwffffffffwwwW..",
    "..WwwwfcffffcfwwwW..",
    "..WwwwfcffffcfwwwW..",
    "..WwwwffffffffwwwW..",
    "..WwwwwffffffwwwwW..",
    "..WWgwwwwwwwwwwgWW..",
    "...WWGGGGGGGGGGWW...",
    "....dddddddddddd....",
    "....ddeddddddeed....",
    "....ddeddddddeed....",
    "....ddddggggdddd....",
    "...eeeeeeeeeeeeee...",
  ];

  const PLAYER_LEGS = [
    [".....BBBB..BBBB.....", ".....bbbb..bbbb.....", "...................."],
    ["....BBBB....BBBB....", "....bbbb....bbbb....", "...................."],
    [".....BBBB..BBBB.....", "......BBBB.BBBB.....", "...................."],
    ["....BBBB....BBBB....", ".....BBBB..BBBB.....", "...................."],
  ];

  const GUARD_ROWS = [
    "....................",
    "..3..............3..",
    "..33....111111...33.",
    ".3311..11111111.113.",
    ".31111.11111111.113.",
    ".311111111111111113.",
    ".311111.6....6.1113.",
    ".311111.6....6.1113.",
    "..3111111111111113..",
    "...111118888821113..",
    "....vvvvvvvvvvvv....",
    "...vvvvVVVVVVvvvv...",
    "..1vvvvvvvvvvvvvv1..",
    "..1vvvvvVVVVvvvvv1..",
    "..11vvvvvvvvvvvv11..",
    "...1.vvvvvvvvvv.1...",
    "....55555555555.....",
    "....5555..5555......",
    "....5555..5555......",
    "....................",
  ];

  const SHAMAN_ROWS = [
    "....................",
    ".............mrm....",
    "......ppppp...r.....",
    "....ppppppppp.r.....",
    "...ppqqqqqqqppr.....",
    "..ppqqqqqqqqqpr.....",
    "..pqq99999999qpr....",
    "..pqq99y999y9qpr....",
    "..pqq99y999y9qpr....",
    "..pqq99999999qpr....",
    "..ppqq9999999qpr....",
    "...ppqqqqqqqqpr.....",
    "....pppppppppr......",
    "...p9ppppppp9pr.....",
    "..pp9ppppppp9pr.....",
    "..ppp999999pppr.....",
    "..ppppppppppr.......",
    "..ppppppppppr.......",
    "...PP..PP...r.......",
    "....................",
  ];

  const PISTOL_ROWS = [
    "..................",
    "..........S.......",
    "....UUUUUUUUUUU...",
    "...UTTTTTTTTTTU...",
    "...UTSSSSSSSTUU...",
    "...JJJJUU.........",
    "...JJJJ...........",
    "..KJJJ............",
    "..................",
    "..................",
  ];

  function makeSwordRows() {
    const rows = [];
    for (let y = 0; y < 11; y++) {
      let row = "";
      for (let x = 0; x < 28; x++) {
        let ch = ".";
        if (y >= 4 && y <= 6 && x >= 1 && x <= 5) ch = "J";
        if (x === 1 && y === 5) ch = "g";
        if (x === 2 && y >= 4 && y <= 6) ch = "K";
        if ((x === 6 || x === 7) && y >= 1 && y <= 9) {
          ch = x === 7 || y === 1 || y === 9 ? "g" : "G";
        }
        if (x >= 8 && x <= 20 && y >= 2 && y <= 8) ch = y === 2 ? "H" : y === 8 ? "T" : "S";
        else if (x >= 21 && x <= 23 && y >= 3 && y <= 7) ch = y === 3 ? "H" : y === 7 ? "T" : "S";
        else if (x >= 24 && x <= 25 && y >= 4 && y <= 6) ch = y === 4 ? "H" : y === 6 ? "T" : "S";
        else if (x === 26 && y === 5) ch = "S";
        if (x >= 9 && x <= 20 && y === 6) ch = "T";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  const CRATE_ROWS = [];
  for (let y = 0; y < 16; y++) {
    let row = "";
    for (let x = 0; x < 16; x++) {
      if (x < 1 || x > 14 || y < 1 || y > 14) row += ".";
      else if (x <= 2 || x >= 13 || y <= 2 || y >= 13) row += "h";
      else if (Math.abs(x - 7.5) === Math.abs(y - 7.5) || Math.abs(Math.abs(x - 7.5) - Math.abs(y - 7.5)) === 1) row += "O";
      else if (x >= 7 && x <= 8 && y >= 7 && y <= 8) row += "h";
      else row += "o";
    }
    CRATE_ROWS.push(row);
  }

  const CHEST_ROWS = [
    "................",
    "...OOOOOOOOOO...",
    "..OhhhhhhhhhhO..",
    "..OooooooooooO..",
    "..OhhhhhhhhhhO..",
    "..OOOOOOOOOOOO..",
    "..OhhhgggghhhO..",
    "..OhhhgGGghhhO..",
    "..OhhhgGGghhhO..",
    "..OhhhgggghhhO..",
    "..OhhhhhhhhhhO..",
    "...OOOOOOOOOO...",
    "................",
    "................",
  ];

  const CHEST_OPEN_ROWS = [
    "................",
    "..OOOOOOOOOOOO..",
    "..OhhhhhhhhhhO..",
    "..OooooooooooO..",
    "..OOOOOOOOOOOO..",
    "..OddddddddddO..",
    "..OddgddddgddO..",
    "..OhhgggggghhO..",
    "..OhhhhhhhhhhO..",
    "..OhhhhhhhhhhO..",
    "..OhhhhhhhhhhO..",
    "...OOOOOOOOOO...",
    "................",
    "................",
  ];

  const ORB_ROWS = [
    "........",
    "..EEC...",
    ".ECCCC..",
    ".ECCCCD.",
    ".ECCCCD.",
    ".ECCCDD.",
    "..EDDD..",
    "........",
  ];

  const POTION_ROWS = [
    ".........",
    "...LLL...",
    "...L.L...",
    "..LL.LL..",
    "..aaaaa..",
    ".azaaaaA.",
    ".aAaaaAa.",
    ".aAaaaAa.",
    "..aAAAa..",
    "...aaa...",
    ".........",
  ];

  const HEART_ROWS = [
    "........",
    ".HH..HH.",
    "HRRRRRRH",
    "HRRRRRRH",
    ".HRRRRH.",
    "..HRRH..",
    "...RR...",
    "........",
  ];

  const SHIELD_ROWS = [
    "........",
    "..BBBB..",
    ".BHHHHB.",
    ".BHBBBB.",
    ".BHBBBB.",
    "..BBSB..",
    "..BSSB..",
    "...SS...",
  ];

  const BOLT_ROWS = [
    "...HH.",
    "..HYYH",
    ".HYYYH",
    "HYYYH.",
    ".YYY..",
    "..YY..",
    ".OY...",
    ".O....",
  ];

  // -------------------------------------------------------------------------
  // Milestone 2 weapon / enemy art
  // -------------------------------------------------------------------------

  const SHOTGUN_ROWS = padRows(22, [
    "",
    "..........HHSSSSSSSS",
    "...JJJ...SSSSSSSSSSSS",
    "..JJJJJ..STTTTTTTTSTT",
    "..JJJJJ..UUUUUUUUUUUU",
    "...JJJJK..JJJJJ",
    "....JJK...JJJJ",
    "....JK",
    "",
  ]);

  const RAIL_ROWS = padRows(24, [
    "",
    "........WWWWWWWW",
    ".....WWWWWWWWWWWWW",
    "....WWSSSSSSSSSSSSWW",
    "...WWSSCCCCCCCCCCTSSWW",
    "...WWSSCHHCCCCCCCTSSSSS",
    "...WWSSCCCCCCCCCCTSSSSS",
    "....WWSSSSSSTTTTTTSSSW",
    "....WWUUUUTTTTUU",
    "",
  ]);

  function makeScytheRows() {
    const W = 30;
    const H = 14;
    const rows = [];
    // A long shaft runs to the right; the crescent blade sweeps up and back
    // from a gold mount at the shaft tip. Concave side faces down-left.
    const cx = 19;
    const cy = 10;
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const inBlade = ang >= -1.78 && ang <= -0.05 && dist >= 4.6 && dist <= 8.6;
        if (inBlade) {
          if (dist >= 7.9) ch = "g";
          else if (dist <= 5.35) ch = "G";
          else if (dist >= 7.05 && ang < -0.9) ch = "H";
          else if (dist >= 6.5) ch = "S";
          else ch = "s";
        }
        // Dark wooden shaft, long enough to reach the blade mount.
        if (y >= 11 && y <= 12 && x >= 1 && x <= 27) {
          ch = y === 11 ? "h" : "o";
        }
        if (y === 12 && x >= 1 && x <= 27) ch = "O";
        // Gold mounting collar at the shaft tip.
        if (y >= 9 && y <= 12 && x >= 24 && x <= 27) {
          ch = x === 24 || x === 27 || y === 9 || y === 12 ? "G" : "g";
        }
        // Grip wrap near the hand.
        if (y >= 10 && y <= 12 && x >= 4 && x <= 7) {
          ch = x % 2 === 0 ? "D" : "O";
        }
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makeGreatswordRows() {
    const W = 32;
    const H = 12;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        // Grip and pommel.
        if (x >= 2 && x <= 6 && y >= 4 && y <= 8) {
          ch = y === 4 || y === 8 ? "J" : y === 6 ? "j" : "J";
        }
        if (x === 1 && y >= 5 && y <= 7) ch = "g";
        // Gold crossguard.
        if (x >= 7 && x <= 9 && y >= 1 && y <= 10) {
          ch = x === 9 ? "G" : y === 1 || y === 10 ? "G" : "g";
        }
        // Crystalline broad blade with stepped taper.
        let top = -1;
        let bottom = -1;
        if (x >= 10 && x <= 20) {
          top = 2;
          bottom = 9;
        } else if (x >= 21 && x <= 25) {
          top = 3;
          bottom = 8;
        } else if (x >= 26 && x <= 29) {
          top = 4;
          bottom = 7;
        } else if (x === 30) {
          top = 5;
          bottom = 6;
        }
        if (top >= 0 && y >= top && y <= bottom) {
          if (y === top) ch = "H";
          else if (y === bottom) ch = "d";
          else if (y === top + 1) ch = "B";
          else ch = "b";
          // Central crystalline ridge, a clean cel-shaded band.
          if (x >= 12 && x <= 28 && y === Math.round((top + bottom) / 2)) ch = "B";
        }
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  // -------------------------------------------------------------------------
  // Milestone 3 — heroes, gravity greatsword, gem, home sanctuary, FX icons
  // -------------------------------------------------------------------------
  function mirrorHalf(halfRows, name) {
    return halfRows.map(function (h, i) {
      if (h.length !== 10) {
        throw new Error((name || "mirrorHalf") + ": half-row " + i + " is " + h.length + " wide, expected 10");
      }
      return h + h.split("").reverse().join("");
    });
  }

  // Knight: silver helm, red plume, steel chestplate, dark 1x2 visor eyes.
  const KNIGHT_BASE = mirrorHalf([
    "..........",
    "........RR",
    ".......RRR",
    "......RRrr",
    "......Rrrr",
    "....KKKKKK",
    "...KKKKkkk",
    "..KKKKkkkk",
    "..KKKkkkkk",
    "..KKssssss",
    "..KKsssVss",
    "..KKsssVss",
    "..KKssssss",
    "..KKKkkkkk",
    "...KKKKKKK",
    "..KKKKKggg",
    "..KKKKKKKK",
    "..Kkkkkkkk",
    "..KKKKKggg",
  ], "knight");

  const KNIGHT_LEGS = [
    [".....KKKK..KKKK.....", ".....ssss..ssss.....", "...................."],
    ["....KKKK....KKKK....", "....ssss....ssss....", "...................."],
    [".....KKKK..KKKK.....", "......KKK..KKKK.....", "...................."],
    ["...KKKK......KKKK...", "...ssss......ssss...", "...................."],
  ];

  // Gravito: obsidian-indigo hood, violet trim, neon-purple 1x2 eyes.
  const GRAVITO_BASE = mirrorHalf([
    "..........",
    "........CC",
    "......CCCC",
    ".....CCCCC",
    "....CCCCCC",
    "....CCCHHH",
    "...CCCHHHH",
    "...CCCHHEH",
    "...CCCHHEH",
    "...CCCHHHH",
    "...CCCCCCC",
    "..CCCCCCtT",
    ".CCCCCCCtT",
    ".CCWWWWWTt",
    ".CCWWWWWCC",
    "..CCCCCCCC",
    "..CCCCtTTT",
    "..CCCtTTTT",
    "..CCCCCCCC",
  ], "gravito");

  const GRAVITO_LEGS = [
    [".....CCCC..CCCC.....", ".....cccc..cccc.....", "...................."],
    ["....CCCC....CCCC....", "....cccc....cccc....", "...................."],
    [".....CCCC..CCCC.....", "......CCC..CCCC.....", "...................."],
    ["...CCCC......CCCC...", "...cccc......cccc...", "...................."],
  ];

  // Dimensional Traveler: 24x28 masked rift walker with a crimson Kamui mask,
  // charcoal tattered cloak, violet lining and red/black gloves.
  const TRAVELER_BASE = [
    ".........HH...HH........",
    "........HhhH.HHHH.......",
    ".......HHHHhhHHHHH......",
    "......HHhhHHHHHhhhH.....",
    ".....HHHrrrRRRRRRHHH....",
    ".....HHrRRRRRRRRRRHH....",
    "...HhhhrRRKKKRRRRRRhHH..",
    "...HHHrRRKKRRKKKKKKHHH..",
    "...hHHrRKKRRRRKWEEKRhH..",
    "..HHHHrRKRRRRRKEKEKRHHH.",
    "..HHHHRrKKRRKRKEERKRHHH.",
    "...hHHRrRKKKKRKKKKKRhH..",
    "...HHHHRRRRRRRRKRRRHHH..",
    "...HHHHoKRRRRRKRRRRHHH..",
    "...hHHH.oKKKKKrrKoHHhH..",
    "...HHHH..oKooooKo.HHHH..",
    "...HH...CPpRrRRrRPPCH...",
    "........cCRRRRKRRCCD....",
    "....TggGgggpVvDCCGgTg...",
    "..cCCGGGTGGpPVDCRGGCCD..",
    "..cCCkkGGGGpPpDCRRkCCD..",
    "..RRRKCkGykpPVDCRRRRRK..",
    ".rrKKKkkkkYWWYkkkkKKKr..",
  ];

  const TRAVELER_LEGS = [
    [
      "......CCCC..CCCC........",
      "......CCCC..CCCC........",
      "......RRRR..RRRR........",
      "......RRRR..RRRR........",
      ".....KKKK....KKKK.......",
    ],
    [
      "......CCCC..CCCC........",
      ".....CCCC....CCCC.......",
      ".....RRRR....RRRR.......",
      ".....RRRR....RRRR.......",
      "....KKKK......KKKK......",
    ],
    [
      "......CCCC..CCCC........",
      "......CCCC..CCCC........",
      "......RRRR..RRRR........",
      "......RRRR..RRRR........",
      "......KKKK..KKKK........",
    ],
    [
      "......CCCC..CCCC........",
      ".......CCCCCCCC.........",
      ".......RRRRRRRR.........",
      ".......RRRRRRRR.........",
      "......KKKK..KKKK........",
    ],
  ];

  // 18x12 red-and-black Kamui glove: wrist cuff, spiral backplate, four claws.
  const KAMUI_GLOVE_ROWS = [
    "..................",
    "..................",
    "....rrrrrrrK......",
    "KRRRRYRRYRRKKKKk..",
    "KkkKRRKKKKVVR.....",
    "KkkYRRKKKKvKKKKk..",
    "KkkKRKKKKKRKR.....",
    "KkkYRKRKKKRKKKKk..",
    "KkkKRRRRRRRKR.....",
    "KKKKKKKKKKKKKKKk..",
    ".....KKKKk.K......",
    "......R...........",
    "..................",
  ];

  /** 14x14 rift icon: layered grey spiral with a white vanishing point. */
  function makeSkillRiftRows() {
    const W = 14;
    const H = 14;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        const dx = x - 6.5;
        const dy = y - 6.5;
        const d = Math.hypot(dx, dy);
        if (d <= 6.3) {
          const ang = Math.atan2(dy, dx);
          const s = (ang + d * 1.15) % Math.PI;
          if (d < 1.2) ch = "K";
          else if (s < 0.9) ch = d > 2.2 ? "K" : "k";
          else if (s < 1.3) ch = "k";
          else ch = "G";
          if (d > 5.2 && (x + y) % 3 === 0) ch = "g";
          if (d > 5.6) ch = "K";
        }
        if (d <= 1.0) ch = "W";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  /** 14x14 intangibility icon: a red eye unravelling into sparse grey trails. */
  const SKILL_PHASE_ROWS = [
    "..............",
    "........gg....",
    "..gg....gg....",
    "...g....g.....",
    "....g..g......",
    ".....gg.......",
    "....KKKK......",
    "...KRRRRK.....",
    "..KRWERRRK....",
    "...KRRRRK.....",
    "....KKKK...gg.",
    ".....g..g.g...",
    "......g.g.....",
    "..............",
  ];

  /** 34x13 Starscourge-inspired meteoric greatsword. */
  function makeGravityGreatswordRows() {
    const W = 34;
    const H = 13;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";

        // Flared T-pommel at the far left.
        if ((y === 3 || y === 9) && x >= 1 && x <= 3) ch = "H";
        if (x === 1 && y >= 4 && y <= 8) ch = "H";
        if (x === 2 && y >= 4 && y <= 8) ch = "h";
        if (x === 3 && y >= 4 && y <= 8) ch = "H";

        // Long ribbed / beaded two-handed hilt.
        if (x >= 4 && x <= 10 && y >= 4 && y <= 8) {
          if (y === 4 || y === 8) ch = x % 2 === 0 ? "h" : "H";
          else if (y === 6) ch = x % 2 === 0 ? "S" : "h";
          else ch = x % 2 === 0 ? "H" : "h";
        }

        // Compact engraved bronze-gold crossguard.
        if (x >= 11 && x <= 13 && y >= 1 && y <= 11) {
          const edge = x === 11 || x === 13 || y === 1 || y === 11;
          ch = edge ? "G" : "g";
          if (x === 12 && (y === 4 || y === 6 || y === 8)) ch = "O";
          if (x === 12 && (y === 2 || y === 10)) ch = "G";
        }

        // Tapered meteoric blade with a bright fuller and metallic bevels.
        let top = -1;
        let bottom = -1;
        if (x >= 14 && x <= 18) { top = 3; bottom = 9; }
        else if (x >= 19 && x <= 23) { top = 3; bottom = 9; }
        else if (x >= 24 && x <= 28) { top = 4; bottom = 8; }
        else if (x >= 29 && x <= 31) { top = 5; bottom = 7; }
        else if (x === 32) { top = 6; bottom = 6; }
        if (top >= 0 && y >= top && y <= bottom) {
          if (y === 6) ch = "F";
          else if (y === top || y === bottom) ch = "B";
          else ch = "D";
          // Metallic highlight along the upper bevel.
          if (x >= 20 && y === top) ch = "B";
        }

        // Two backward-hooked jagged barbs near the crossguard.
        if (x >= 14 && x <= 16 && y === 1) ch = "B";
        if (x === 16 && y === 2) ch = "B";
        if (x === 14 && y === 2) ch = "D";
        if (x >= 14 && x <= 16 && y === 11) ch = "B";
        if (x === 16 && y === 10) ch = "B";
        if (x === 14 && y === 10) ch = "D";

        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  const GEM_ROWS = padRows(10, [
    "",
    "..CCMMM",
    ".CCWWCMM",
    ".CCCWCCMM",
    ".CCCCCCMM",
    ".CCCCCCMM",
    "..CCCCMM",
    "..CCMMM",
    "",
    "",
  ]);

  /** 18x18 jagged cosmic-obsidian meteor rock with glowing fissures. */
  function makeMeteorRows() {
    const W = 18;
    const H = 18;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        const dx = x - 8.5;
        const dy = y - 8.5;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const jag = ((Math.floor(ang * 5.7 + 40) * 1103515245) >>> 28) % 3;
        const radius = 7.0 + jag * 0.35;
        if (dist <= radius) {
          if (dist > radius - 1.9) ch = "v";
          else if (dist > radius - 3.2) ch = "c";
          else ch = "D";
          // Mottled cosmic stone so the meteor reads as a solid rock.
          const speck = (x * 5 + y * 11 + Math.floor(ang * 7) + 90) % 9;
          if (dist <= radius - 3.2 && speck === 0) ch = "c";
          if (dist <= radius - 3.2 && speck === 4) ch = "v";
          if (dist < 2.4) ch = (x + y) % 2 === 0 ? "c" : "D";
          // Molten fissures radiate out from the core.
          const fissure = Math.abs(((ang + Math.PI * 3) % (Math.PI / 3)) - Math.PI / 6);
          if (dist > 1.4 && dist < radius - 1.2 && fissure < 0.18) {
            ch = (Math.floor(dist * 3) % 2 === 0) ? "M" : "O";
          }
        }
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  /** 14x14 gold overdrive icon: a sword bursting with speed chevrons. */
  function makeSkillKnightRows() {
    const W = 14;
    const H = 14;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        // Upright blade.
        if (x >= 6 && x <= 7 && y >= 1 && y <= 8) ch = y === 1 ? "H" : "Y";
        if ((x === 5 || x === 8) && y >= 2 && y <= 7) ch = "O";
        if (x >= 4 && x <= 9 && y === 9) ch = "O";
        if (x === 6 && y >= 10 && y <= 11) ch = "D";
        if (x >= 5 && x <= 7 && y === 12) ch = "O";
        // Speed chevrons.
        if ((y === 4 || y === 8) && (x === 1 || x === 12)) ch = "O";
        if ((y === 5 || y === 7) && (x === 2 || x === 11)) ch = "Y";
        if (y === 6 && (x === 1 || x === 2 || x === 11 || x === 12)) ch = "H";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  /** 14x14 gravity icon: layered violet singularity with lightning. */
  function makeSkillGravitoRows() {
    const W = 14;
    const H = 14;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        const dx = x - 6.5;
        const dy = y - 6.5;
        const d = Math.hypot(dx, dy);
        if (d <= 6.0) {
          if (d > 4.6) ch = "p";
          else if (d > 3.2) ch = "P";
          else if (d > 1.9) ch = "L";
          else ch = "K";
        }
        if (d > 4.6 && d <= 6.0 && (x + y) % 3 === 0) ch = "M";
        if (d <= 3.2 && d > 1.9 && (x + y) % 4 === 0) ch = "M";
        // Crackling arc accents.
        if ((x === 6 && y === 1) || (x === 7 && y === 2) || (x === 3 && y === 9) || (x === 10 && y === 11)) ch = "W";
        if ((x === 5 && y === 1) || (x === 8 && y === 12)) ch = "M";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makeHomeFloorRows(variant) {
    const rows = [];
    for (let y = 0; y < 16; y++) {
      let row = "";
      for (let x = 0; x < 16; x++) {
        let ch = "t";
        if (x === 0 || x === 15 || y === 0 || y === 15) ch = "d";
        else if (y === 2 || x === 2) ch = "u";
        else if (y === 13 || x === 13) ch = "m";
        else if (variant === 1 && ((x === 6 && y >= 4 && y <= 8) || (y === 9 && x >= 6 && x <= 10))) ch = "g";
        else if (variant === 2 && ((x + y) % 7 === 0 && x > 3 && x < 12)) ch = "u";
        else if (variant === 1 && (x === 5 || y === 8)) ch = "m";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makeHomeWallRows() {
    const rows = [];
    for (let y = 0; y < 24; y++) {
      let row = "";
      for (let x = 0; x < 16; x++) {
        if (y < 16) {
          if (y === 0) row += "U";
          else if (y === 15) row += "N";
          else if (y === 5 || y === 10) row += "N";
          else if (x === 0 || x === 15) row += "N";
          else if ((x === 4 && y < 5) || (x === 11 && y > 5 && y < 10)) row += "V";
          else if ((x + (y < 5 ? 0 : y < 10 ? 5 : 10)) % 8 === 0) row += "V";
          else row += "T";
        } else {
          if (y === 16) row += "D";
          else if (y === 23) row += "X";
          else if (x === 0 || x === 15) row += "X";
          else if ((x + Math.floor(y / 4) * 3) % 8 === 0) row += "W";
          else row += "F";
        }
      }
      rows.push(row);
    }
    return rows;
  }

  function makeCarpetRows() {
    const rows = [];
    for (let y = 0; y < 16; y++) {
      let row = "";
      for (let x = 0; x < 16; x++) {
        let ch = "r";
        if ((x + y) % 8 === 0 || (x - y + 16) % 8 === 0) ch = "R";
        if ((x + y) % 16 === 0) ch = "A";
        if (x % 8 === 3 && y % 8 === 3) ch = "G";
        if (x % 8 === 7 && y % 8 === 7) ch = "g";
        if (x === 0 || x === 15) ch = "d";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makeShelfRows() {
    const W = 40;
    const H = 26;
    const rows = [];
    const bookCols = ["r", "b", "y", "g", "p", "w", "o"];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        if (x >= 1 && x <= 38 && y >= 1 && y <= 24) {
          const frame = x <= 2 || x >= 37 || y <= 2 || y >= 23;
          const shelf = y === 9 || y === 17;
          if (frame) ch = y <= 2 ? "L" : "h";
          else if (shelf) ch = y === 9 ? "L" : "O";
          else {
            const band = y >= 3 && y <= 8 ? 0 : y >= 10 && y <= 16 ? 1 : 2;
            const bx = (x - 3) % 8;
            const by = band === 0 ? y - 3 : band === 1 ? y - 10 : y - 18;
            if (bx >= 1 && bx <= 5 && by <= 5) {
              ch = bookCols[(Math.floor((x - 3) / 8) * 3 + band) % bookCols.length];
              if (bx === 1) ch = "d";
            } else ch = "D";
          }
        }
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makeRackRows() {
    const W = 34;
    const H = 24;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        if (x >= 1 && x <= 32 && y >= 1 && y <= 22) {
          const frame = x <= 2 || x >= 31 || y <= 2 || y >= 21;
          if (frame) ch = y <= 2 ? "L" : "h";
          else ch = "D";
          // Two crossed weapon silhouettes on the rack.
          if (x === 9 && y >= 5 && y <= 17) ch = "o";
          if (x === 10 && y >= 4 && y <= 18) ch = "h";
          if (y === 6 && x >= 7 && x <= 12) ch = "h";
          if (x === 23 && y >= 4 && y <= 18) ch = "o";
          if (x === 24 && y >= 5 && y <= 17) ch = "h";
          if (y === 16 && x >= 21 && x <= 26) ch = "h";
          if ((x === 9 || x === 24) && (y === 4 || y === 18)) ch = "L";
          if (y === 10 && x >= 15 && x <= 19) ch = "o";
          if (y === 11 && x >= 15 && x <= 19) ch = "h";
        }
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makePillarRows() {
    const W = 18;
    const H = 32;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        if (y >= 1 && y <= 30) {
          if (y <= 3) {
            if (x >= 1 && x <= 16) {
              ch = y === 1 ? "H" : y === 3 ? "G" : "L";
              if (x === 1 || x === 16) ch = y === 3 ? "g" : "D";
            }
          } else if (y >= 27) {
            if (x >= 1 && x <= 16) {
              ch = y === 27 ? "G" : y === 30 ? "d" : "M";
              if (x === 1 || x === 16) ch = y === 27 ? "g" : "D";
            }
          } else if (x >= 3 && x <= 14) {
            ch = "M";
            if (x === 3 || x === 14) ch = "D";
            else if (x === 5 || x === 8 || x === 11) ch = "D";
            else if (x === 4 || x === 7 || x === 10 || x === 13) ch = "L";
            if (y === 4) ch = "H";
          }
        }
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makePedestalRows() {
    const W = 24;
    const H = 14;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        // Three stacked stone steps, widest at the base.
        if (y >= 2 && y <= 4 && x >= 7 && x <= 16) ch = y === 2 ? "G" : "L";
        if (y >= 5 && y <= 8 && x >= 4 && x <= 19) ch = y === 5 ? "H" : "M";
        if (y >= 9 && y <= 11 && x >= 2 && x <= 21) ch = y === 9 ? "L" : "M";
        if (y === 8 && x >= 9 && x <= 14) ch = "G";
        if (y === 11 && x >= 1 && x <= 22) ch = "D";
        if (ch !== "." && (x === 4 || x === 19 || x === 2 || x === 21)) ch = "d";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  function makeTorchRows() {
    const W = 10;
    const H = 16;
    const rows = [];
    for (let y = 0; y < H; y++) {
      let row = "";
      for (let x = 0; x < W; x++) {
        let ch = ".";
        if (y >= 8 && y <= 13 && x >= 3 && x <= 6) {
          ch = x === 3 || x === 6 ? "D" : "h";
        }
        if (y === 7 && x >= 2 && x <= 7) ch = "L";
        if (y === 6 && x >= 4 && x <= 5) ch = "D";
        if (y === 13 && x >= 2 && x <= 7) ch = "D";
        row += ch;
      }
      rows.push(row);
    }
    return rows;
  }

  const TURRET_ROWS = padRows(18, [
    "",
    ".......HH",
    "......HMMM",
    ".....MMmMM",
    "....MMmmmMM",
    "...MMmmmmmMM",
    "...MmmmPPmmmM",
    "....MmmPPmmM",
    ".....MmmmmM",
    "......MmmM",
    ".......MM",
    "....LLTTTTLL",
    "...LTTTTTTTTL",
    "...TTttttttTT",
    "...TttttttttT",
    "..LTTTTTTTTTTL",
    "..TTttttttttTT",
    "..TtttttttttTT",
    "..DDDDDDDDDDDD",
    "",
  ]);

  const FLOOR_PLAIN = [
    "mmmmmmmmmmmmmmmm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mtttttttuttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttuttuttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mtttttttttttttum",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttuttttttuttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mmmmmmmmmmmmmmmm",
  ];

  const FLOOR_CRACK = [
    "mmmmmmmmmmmmmmmm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mtttttuttttttttm",
    "mttttmtttttttttm",
    "mtttmmtttttttttm",
    "mtttmttttttttttm",
    "mtttmmtttttttttm",
    "mtttttmttttttttm",
    "mttttttmtttttttm",
    "mttttttttttttttm",
    "mtttttttttuttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mmmmmmmmmmmmmmmm",
  ];

  const FLOOR_RUBBLE = [
    "mmmmmmmmmmmmmmmm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttuuttttttttttm",
    "mttutttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttuuttm",
    "mtttttttttttuttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mtttttttttttttum",
    "mttttttttttttttm",
    "mmmmmmmmmmmmmmmm",
  ];

  // Endless arena floor: dark obsidian slabs with sparse crimson fissures.
  const ARENA_FLOOR_PLAIN = [
    "mmmmmmmmmmmmmmmm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mtttttttdttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mtttttttttttttum",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mmmmmmmmmmmmmmmm",
  ];

  const ARENA_FLOOR_CRACK = [
    "mmmmmmmmmmmmmmmm",
    "mttttttttttttttm",
    "mtttttttrttttttm",
    "mtttttttrttttttm",
    "mtttttttrRtttttm",
    "mtttttttrttttttm",
    "mttttttrtttttttm",
    "mttttttrtttttttm",
    "mttttttrtttttttm",
    "mtttttrttttttttm",
    "mtttttrttttttttm",
    "mttttrtttttttttm",
    "mttttrtttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mmmmmmmmmmmmmmmm",
  ];

  const ARENA_FLOOR_RUBBLE = [
    "mmmmmmmmmmmmmmmm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttuuttttttttttm",
    "mttudttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttuuttm",
    "mttttttttttudttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttttttttttttttm",
    "mttdtttttttttttm",
    "mtttttttttttttum",
    "mttttttttttttttm",
    "mmmmmmmmmmmmmmmm",
  ];

  const WALL_ROWS = [];
  for (let y = 0; y < 24; y++) {
    let row = "";
    for (let x = 0; x < 16; x++) {
      if (y < 16) {
        if (y === 0) row += "U";
        else if (y === 15) row += "N";
        else if ((y === 5 || y === 10) && x !== 0 && x !== 15) row += "N";
        else if (x === 0 || x === 15) row += "N";
        else if ((x === 4 && y < 5) || (x === 11 && y > 5 && y < 10)) row += "N";
        else row += "T";
      } else {
        if (y === 16) row += "D";
        else if (y === 23) row += "X";
        else if (x === 0 || x === 15) row += "X";
        else if ((x + Math.floor(y / 4) * 3) % 8 === 0) row += "W";
        else row += "F";
      }
    }
    WALL_ROWS.push(row);
  }

  // Endless arena wall: the same masonry silhouette in cold basalt, with a
  // few crimson rune seams so the arena reads as a Kamui-adjacent space.
  const ARENA_WALL_ROWS = [];
  for (let y = 0; y < 24; y++) {
    let row = "";
    for (let x = 0; x < 16; x++) {
      if (y < 16) {
        if (y === 0) row += "U";
        else if (y === 15) row += "N";
        else if ((y === 5 || y === 10) && x !== 0 && x !== 15) row += "N";
        else if (x === 0 || x === 15) row += "N";
        else if ((x === 4 && y < 5) || (x === 11 && y > 5 && y < 10)) row += "N";
        else if ((y === 3 && x === 7) || (y === 8 && x === 13) || (y === 12 && x === 2)) row += "R";
        else if ((y === 4 && x === 7) || (y === 9 && x === 13) || (y === 13 && x === 2)) row += "r";
        else row += "T";
      } else {
        if (y === 16) row += "D";
        else if (y === 23) row += "X";
        else if (x === 0 || x === 15) row += "X";
        else if ((x + Math.floor(y / 4) * 3) % 8 === 0) row += "W";
        else row += "F";
      }
    }
    ARENA_WALL_ROWS.push(row);
  }

  // Very dark bedrock drawn behind rooms so the map doesn't float in pure black.
  const ROCK_ROWS = [
    "rrrrrrrrrrrrrrrr",
    "rrsrrrrrrrrrrrrr",
    "rrrrrrrrrrsrrrrr",
    "rrrdrrrrrrrrrrrr",
    "rrrrrrrrdrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrsrrrrrrrrrrsrr",
    "rrrrrrrdrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrsrrrrrrrrrr",
    "rrrdrrrrrrrrdrrr",
    "rrrrrrrrrrrrrrrr",
    "rsrrrrrrrsrrrrrr",
    "rrrrrrrrrrrrrrrr",
    "rrrrrdrrrrrrrrrr",
    "rrrrrrrrrrrrrrrr",
  ];

  // -------------------------------------------------------------------------
  // Bake registry
  // -------------------------------------------------------------------------
  for (let i = 0; i < 4; i++) {
    register("player" + i, PLAYER_PAL, PLAYER_BASE.concat(PLAYER_LEGS[i]), { flash: true });
  }
  register("guard", GOBLIN_PAL, GUARD_ROWS, { flash: true });
  register("shaman", SHAMAN_PAL, SHAMAN_ROWS, { flash: true });
  register("crate", WOOD_PAL, CRATE_ROWS, { flash: true });
  register("chest", WOOD_PAL, CHEST_ROWS);
  register("chestOpen", WOOD_PAL, CHEST_OPEN_ROWS);
  register("orb", ORB_PAL, ORB_ROWS);
  register("potion", POTION_PAL, POTION_ROWS);
  register("heart", HEART_PAL, HEART_ROWS);
  register("shield", SHIELD_PAL, SHIELD_ROWS);
  register("bolt", BOLT_PAL, BOLT_ROWS);
  register("pistol", WEAPON_PAL, PISTOL_ROWS);
  register("sword", WEAPON_PAL, makeSwordRows());
  register("shotgun", SHOTGUN_PAL, SHOTGUN_ROWS);
  register("railgun", RAIL_PAL, RAIL_ROWS);
  register("scythe", SCYTHE_PAL, makeScytheRows());
  register("greatsword", GREATSWORD_PAL, makeGreatswordRows());
  register("turret", TURRET_PAL, TURRET_ROWS, { flash: true });
  register("chestGold", GOLD_CHEST_PAL, CHEST_ROWS);
  register("chestGoldOpen", GOLD_CHEST_PAL, CHEST_OPEN_ROWS);
  register("floor0", TILE_PAL, FLOOR_PLAIN, { outline: false });
  register("floor1", TILE_PAL, FLOOR_CRACK, { outline: false });
  register("floor2", TILE_PAL, FLOOR_RUBBLE, { outline: false });
  register("rock", ROCK_PAL, ROCK_ROWS, { outline: false });
  register("wall", WALL_PAL, WALL_ROWS, { outline: false });
  register("arenaFloor0", ARENA_FLOOR_PAL, ARENA_FLOOR_PLAIN, { outline: false });
  register("arenaFloor1", ARENA_FLOOR_PAL, ARENA_FLOOR_CRACK, { outline: false });
  register("arenaFloor2", ARENA_FLOOR_PAL, ARENA_FLOOR_RUBBLE, { outline: false });
  register("arenaWall", ARENA_WALL_PAL, ARENA_WALL_ROWS, { outline: false });

  // Milestone 3 — heroes, gravity blade, gem, meteor, icons and home props.
  for (let i = 0; i < 4; i++) {
    register("knight" + i, KNIGHT_PAL, KNIGHT_BASE.concat(KNIGHT_LEGS[i]), {
      flash: true,
      outlineColor: "#000000",
      name: "knight" + i,
    });
    register("gravito" + i, GRAVITO_PAL, GRAVITO_BASE.concat(GRAVITO_LEGS[i]), {
      flash: true,
      outlineColor: "#000000",
      name: "gravito" + i,
    });
    register("traveler" + i, TRAVELER_PAL, TRAVELER_BASE.concat(TRAVELER_LEGS[i]), {
      flash: true,
      outlineColor: "#000000",
      name: "traveler" + i,
    });
  }
  register("knightGhost", KNIGHT_GHOST_PAL, KNIGHT_BASE.concat(KNIGHT_LEGS[0]), {
    outlineColor: "#000000",
    name: "knightGhost",
  });
  register("travelerGhost", TRAVELER_GHOST_PAL, TRAVELER_BASE.concat(TRAVELER_LEGS[0]), {
    outlineColor: "#000000",
    name: "travelerGhost",
  });
  register("kamuiGloves", KAMUI_GLOVE_PAL, KAMUI_GLOVE_ROWS, {
    outlineColor: "#000000",
    name: "kamuiGloves",
  });
  register("skillRift", KAMUI_ICON_PAL, makeSkillRiftRows(), {
    outlineColor: "#000000",
    name: "skillRift",
  });
  register("skillPhase", KAMUI_ICON_PAL, SKILL_PHASE_ROWS, {
    outlineColor: "#000000",
    name: "skillPhase",
  });
  register("gravityGreatsword", GRAV_WEAPON_PAL, makeGravityGreatswordRows(), {
    outlineColor: "#000000",
    name: "gravityGreatsword",
  });
  register("gem", GEM_PAL, GEM_ROWS, { outlineColor: "#000000", name: "gem" });
  register("meteorRock", METEOR_PAL, makeMeteorRows(), { outlineColor: "#000000", name: "meteorRock" });
  register("skillKnight", SKILL_PAL, makeSkillKnightRows(), { outlineColor: "#000000", name: "skillKnight" });
  register("skillGravito", SKILL_PAL, makeSkillGravitoRows(), { outlineColor: "#000000", name: "skillGravito" });
  register("homeFloor0", HOME_FLOOR_PAL, makeHomeFloorRows(0), { outline: false });
  register("homeFloor1", HOME_FLOOR_PAL, makeHomeFloorRows(1), { outline: false });
  register("homeFloor2", HOME_FLOOR_PAL, makeHomeFloorRows(2), { outline: false });
  register("homeWall", HOME_WALL_PAL, makeHomeWallRows(), { outline: false });
  register("carpet", CARPET_PAL, makeCarpetRows(), { outline: false });
  register("shelf", BOOK_PAL, makeShelfRows(), { name: "shelf" });
  register("rack", HOME_WOOD_PAL, makeRackRows(), { name: "rack" });
  register("pillar", PILLAR_PAL, makePillarRows(), { outlineColor: "#000000", name: "pillar" });
  register("pedestal", PEDESTAL_PAL, makePedestalRows(), { outlineColor: "#000000", name: "pedestal" });
  register("torch", HOME_WOOD_PAL, makeTorchRows(), { name: "torch" });


  // -------------------------------------------------------------------------
  // 5x7 pixel font (rows are 5-bit masks)
  // -------------------------------------------------------------------------
  const GLYPHS = {
    A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
    C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
    D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
    E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
    F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
    G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0e],
    H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
    I: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x1f],
    J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
    K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
    M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
    N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
    O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
    Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
    R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
    S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
    T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
    V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
    W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
    X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
    Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
    Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
    0: [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
    1: [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
    2: [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
    3: [0x1e, 0x01, 0x01, 0x0e, 0x01, 0x01, 0x1e],
    4: [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
    5: [0x1f, 0x10, 0x10, 0x1e, 0x01, 0x01, 0x1e],
    6: [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
    7: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    8: [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
    9: [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
    " ": [0, 0, 0, 0, 0, 0, 0],
    "-": [0, 0, 0, 0x1f, 0, 0, 0],
    "/": [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
    ":": [0, 0x04, 0x04, 0, 0x04, 0x04, 0],
    ".": [0, 0, 0, 0, 0, 0, 0x04],
    ",": [0, 0, 0, 0, 0, 0x04, 0x08],
    "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
    "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0, 0x04],
    "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
    "'": [0x04, 0x04, 0, 0, 0, 0, 0],
    "<": [0x01, 0x02, 0x04, 0x08, 0x04, 0x02, 0x01],
    ">": [0x10, 0x08, 0x04, 0x02, 0x04, 0x08, 0x10],
    "[": [0x0e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x0e],
    "]": [0x0e, 0x02, 0x02, 0x02, 0x02, 0x02, 0x0e],
    "*": [0, 0x15, 0x0e, 0x1f, 0x0e, 0x15, 0],
    "_": [0, 0, 0, 0, 0, 0, 0x1f],
    "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
    ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
    "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
    "%": [0x11, 0x12, 0x04, 0x04, 0x04, 0x09, 0x11],
  };

  const FONT_W = 5;
  const FONT_H = 7;

  const PixelFont = {
    height: FONT_H,
    width: FONT_W,
    measure(text, opts) {
      opts = opts || {};
      const scale = opts.scale || 1;
      const tracking = opts.tracking == null ? 1 : opts.tracking;
      const n = String(text).length;
      if (n === 0) return 0;
      return (n * (FONT_W + tracking) - tracking) * scale;
    },
    draw(ctx, text, x, y, opts) {
      opts = opts || {};
      const scale = opts.scale || 1;
      const tracking = opts.tracking == null ? 1 : opts.tracking;
      const color = opts.color || "#eef2f8";
      const shadow = opts.shadow || null;
      const alpha = opts.alpha == null ? 1 : opts.alpha;
      if (alpha <= 0) return;
      const str = String(text).toUpperCase();
      const total = this.measure(str, opts);
      let startX = x;
      if (opts.align === "center") startX = Math.round(x - total / 2);
      else if (opts.align === "right") startX = Math.round(x - total);
      startX = Math.round(startX);
      y = Math.round(y);

      ctx.save();
      ctx.globalAlpha = alpha;
      if (shadow) {
        ctx.fillStyle = shadow;
        const sx = opts.shadowX == null ? scale : opts.shadowX;
        const sy = opts.shadowY == null ? scale : opts.shadowY;
        this._drawRaw(ctx, str, startX + sx, y + sy, scale, tracking, shadow, alpha);
      }
      this._drawRaw(ctx, str, startX, y, scale, tracking, color, alpha);
      ctx.restore();
    },
    _drawRaw(ctx, str, x, y, scale, tracking, color, alpha) {
      ctx.fillStyle = color;
      let cx = x;
      for (let i = 0; i < str.length; i++) {
        const ch = str.charAt(i);
        const glyph = GLYPHS[ch];
        if (glyph) {
          for (let gy = 0; gy < FONT_H; gy++) {
            const bits = glyph[gy];
            if (!bits) continue;
            for (let gx = 0; gx < FONT_W; gx++) {
              if (bits & (1 << (FONT_W - 1 - gx))) {
                ctx.fillRect(cx + gx * scale, y + gy * scale, scale, scale);
              }
            }
          }
        }
        cx += (FONT_W + tracking) * scale;
      }
    },
  };

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  SK.Sprites = {
    get(name) {
      const s = BAKED[name];
      if (!s) throw new Error("Unknown sprite: " + name);
      return s.canvas;
    },
    getFlash(name) {
      const s = BAKED[name];
      return s ? s.flash : null;
    },
    size(name) {
      const s = BAKED[name];
      if (!s) throw new Error("Unknown sprite: " + name);
      return { width: s.width, height: s.height };
    },
    has(name) {
      return !!BAKED[name];
    },
    names() {
      return Object.keys(BAKED);
    },
  };

  SK.bakeSprite = bakeSprite;
  SK.PixelFont = PixelFont;
  SK.PALETTES = {
    player: PLAYER_PAL,
    goblin: GOBLIN_PAL,
    shaman: SHAMAN_PAL,
    weapon: WEAPON_PAL,
    shotgun: SHOTGUN_PAL,
    railgun: RAIL_PAL,
    scythe: SCYTHE_PAL,
    greatsword: GREATSWORD_PAL,
    turret: TURRET_PAL,
    wood: WOOD_PAL,
    tile: TILE_PAL,
    wall: WALL_PAL,
    arenaTile: ARENA_FLOOR_PAL,
    arenaWall: ARENA_WALL_PAL,
  };
})();
