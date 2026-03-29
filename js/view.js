/**
 * VIEW
 * All DOM reads/writes and canvas rendering.
 * Knows about Model state but never mutates it.
 * Exposes a single global `View` object consumed by Controller.
 */
'use strict';

const View = (() => {

  // ── Canvas setup ──────────────────────────────────────────────────
  const canvas = document.getElementById('maze-canvas');
  const ctx    = canvas.getContext('2d');

  // ── Cell colour map (keyed by Model cell-state constants) ─────────
  const COLORS = {
    [Model.EMPTY]:      { fill: '#0a1520',              stroke: '#0d1c2d' },
    [Model.WALL]:       { fill: '#0f1e2e',              stroke: '#1a3a5c' },
    [Model.S_START]:    { fill: '#00ff9d',              stroke: '#00cc7a', glow: '#00ff9d' },
    [Model.S_END]:      { fill: '#ff2d6b',              stroke: '#cc1f52', glow: '#ff2d6b' },
    [Model.S_VISITING]: { fill: '#ffe566',              stroke: '#ccb944', glow: '#ffe566' },
    [Model.S_DEAD]:     { fill: 'rgba(192,57,43,0.55)', stroke: '#7b241c' },
    [Model.S_PATH]:     { fill: '#00ff9d',              stroke: '#00cc7a', glow: '#00ff9d' },
  };

  // ── Canvas resize ─────────────────────────────────────────────────
  function resizeCanvas() {
    const { COLS, ROWS, CELL } = Model.state;
    canvas.width  = COLS * CELL;
    canvas.height = ROWS * CELL;
    document.getElementById('maze-meta').textContent =
      `${COLS} × ${ROWS} GRID · CLICK TO DRAW WALLS`;
    document.getElementById('size-val').textContent = COLS;
  }

  // ── Draw a single cell ────────────────────────────────────────────
  function drawCell(r, c) {
    const { grid, CELL, startR, startC, endR, endC } = Model.state;
    const s   = grid[r][c];
    const col = COLORS[s];
    const x   = c * CELL;
    const y   = r * CELL;

    ctx.shadowColor = col.glow || 'transparent';
    ctx.shadowBlur  = col.glow ? CELL * 0.9 : 0;
    ctx.fillStyle   = col.fill;
    ctx.fillRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

    ctx.shadowBlur  = 0;
    ctx.strokeStyle = col.stroke;
    ctx.lineWidth   = 0.5;
    ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);

    // S / E labels
    if (s === Model.S_START || (s === Model.S_PATH && r === startR && c === startC)) {
      drawLabel(x, y, 'S', '#070b10');
    }
    if (s === Model.S_END) {
      drawLabel(x, y, 'E', '#fff');
    }
  }

  function drawLabel(x, y, txt, color) {
    const { CELL } = Model.state;
    ctx.shadowBlur   = 0;
    ctx.fillStyle    = color;
    ctx.font         = `bold ${Math.max(9, CELL * 0.45)}px Orbitron,monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x + CELL / 2, y + CELL / 2);
  }

  // ── Full grid render ──────────────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let r = 0; r < Model.state.ROWS; r++) {
      for (let c = 0; c < Model.state.COLS; c++) {
        drawCell(r, c);
      }
    }
  }

  // ── Status text (desktop panel + mobile strip) ────────────────────
  function setStatus(msg, cls = '') {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.className   = cls;

    const mob = document.getElementById('mobile-status');
    if (mob) {
      mob.textContent = msg;
      mob.className   = cls;
    }
  }

  // ── Active tool highlight ─────────────────────────────────────────
  function setActiveTool(t) {
    document.querySelectorAll('.tool-btn').forEach(b =>
      b.classList.remove('active', 'active-start', 'active-end')
    );
    const btn = document.getElementById('tool-' + t);
    if (!btn) return;
    if      (t === 'start') btn.classList.add('active-start');
    else if (t === 'end')   btn.classList.add('active-end');
    else                    btn.classList.add('active');
  }

  // ── Lock / unlock controls during solve ───────────────────────────
  // The speed slider and the ☰ TOOLS (drawer) button stay unlocked
  // so the user can adjust speed and open the drawer mid-solve.
  function setControlsLocked(locked) {
    const ids = [
      'btn-solve', 'btn-random', 'btn-clear',
      'gridsize',
      'tool-wall', 'tool-erase', 'tool-start', 'tool-end',
      'mb-solve',  'mb-random',  'mb-clear',
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = locked;
      if (el.type === 'range') el.style.opacity = locked ? '0.35' : '1';
    });

    // Handle pause button visibility and solve button hiding
    const solveBtns = ['btn-solve', 'mb-solve'];
    const pauseBtns = ['btn-pause', 'mb-pause'];

    if (locked) {
      solveBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      pauseBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = 'block';
          el.disabled = false;
        }
      });
    } else {
      solveBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
          el.style.display = 'block';
          el.disabled = false;
        }
      });
      pauseBtns.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
    }
  }

  // ── Pause state UI ────────────────────────────────────────────────
  function setPaused(paused) {
    const pauseBtns = ['btn-pause', 'mb-pause'];
    pauseBtns.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = paused ? '▶ RESUME' : '⏸ PAUSE';
    });

    // When paused, unlock grid size and other interfaces
    const idsToUnlock = [
      'gridsize',
      'tool-wall', 'tool-erase', 'tool-start', 'tool-end',
      'btn-random', 'btn-clear',
      'mb-random', 'mb-clear'
    ];

    idsToUnlock.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = !paused;
      if (el.type === 'range') el.style.opacity = paused ? '1' : '0.35';
    });
  }

  // ── Hit-test: canvas pixel → grid cell ───────────────────────────
  function cellAt(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY ?? e.touches?.[0]?.clientY) - rect.top;
    const { CELL } = Model.state;
    return { r: Math.floor(y / CELL), c: Math.floor(x / CELL) };
  }

  // ── Drawer helpers (mobile slide-in panel) ────────────────────────
  function openDrawer() {
    document.querySelector('.sidebar').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    const btn = document.getElementById('mb-menu');
    if (btn) btn.classList.add('menu-open');
  }

  function closeDrawer() {
    document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    const btn = document.getElementById('mb-menu');
    if (btn) btn.classList.remove('menu-open');
  }

  function toggleDrawer() {
    const isOpen = document.querySelector('.sidebar').classList.contains('open');
    isOpen ? closeDrawer() : openDrawer();
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    canvas,
    resizeCanvas,
    render,
    setStatus,
    setActiveTool,
    setControlsLocked,
    cellAt,
    openDrawer,
    closeDrawer,
    toggleDrawer,
    setPaused,
  };

})();
