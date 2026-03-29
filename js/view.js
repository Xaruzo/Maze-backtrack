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

  // ── Stats panel update ────────────────────────────────────────────
  // stats: { steps, deadEnds, pathLen, elapsed }
  //   pathLen === null  → still solving (show —)
  //   pathLen === 0     → no path found (show ✗)
  //   pathLen >  0      → found (show number)
  function updateStats({ steps, deadEnds, pathLen, elapsed, solved = false }) {
    const set = (id, text, cls = '') => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = text;
      el.className = 'stat-value' + (cls ? ' ' + cls : '');
    };

    // Mark stat items as "live" while solving
    document.querySelectorAll('.stat-item').forEach(el => {
      el.classList.toggle('live', Model.state.solving);
    });

    set('stat-steps',
      steps != null ? String(steps) : '—',
      solved ? 'success' : ''
    );

    set('stat-deadends',
      deadEnds != null ? String(deadEnds) : '—'
    );

    if (pathLen === null) {
      set('stat-pathlen', '—');
    } else if (pathLen === 0) {
      set('stat-pathlen', '✗', 'fail');
    } else {
      set('stat-pathlen', String(pathLen), 'success');
    }

    if (elapsed > 0) {
      const display = elapsed >= 1000
        ? (elapsed / 1000).toFixed(2) + 's'
        : elapsed + 'ms';
      set('stat-time', display, solved && pathLen > 0 ? 'success' : '');
    } else {
      set('stat-time', '—');
    }
  }

  // ── Reset stats to initial dashes ────────────────────────────────
  function resetStats() {
    document.querySelectorAll('.stat-item').forEach(el => el.classList.remove('live'));
    ['stat-steps', 'stat-deadends', 'stat-pathlen', 'stat-time'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = '—'; el.className = 'stat-value'; }
    });
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
  // Speed slider and ☰ TOOLS button stay unlocked mid-solve.
  function setControlsLocked(locked) {
    const ids = [
      'gridsize',
      'tool-wall', 'tool-erase', 'tool-start', 'tool-end',
    ];

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = locked;
      if (el.type === 'range') el.style.opacity = locked ? '0.35' : '1';
    });

    // Solve, Random, and Clear buttons should generally stay enabled
    // so the user can pause or cancel the current operation.
    ['btn-solve', 'mb-solve', 'btn-random', 'mb-random', 'btn-clear', 'mb-clear'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });
  }

  // ── Solve button state toggle ─────────────────────────────────────
  function setSolveButtonState(state) {
    const desktop = document.getElementById('btn-solve');
    const mobile  = document.getElementById('mb-solve');

    const states = {
      solve:  { text: '▶ SOLVE',   cls: 'btn-solve'  },
      pause:  { text: '⏸ PAUSE',   cls: 'btn-pause'  },
      resume: { text: '▶ RESUME',  cls: 'btn-resume' },
    };

    const s = states[state];
    if (!s) return;

    [desktop, mobile].forEach(btn => {
      if (!btn) return;
      btn.textContent = s.text;
      btn.className = (btn === mobile)
        ? `mb-btn primary ${s.cls}`
        : `action-btn ${s.cls}`;
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
    updateStats,
    resetStats,
    setActiveTool,
    setControlsLocked,
    setSolveButtonState,
    cellAt,
    openDrawer,
    closeDrawer,
    toggleDrawer,
  };

})();