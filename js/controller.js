/**
 * CONTROLLER
 * Wires DOM events to Model mutations and View updates.
 * Runs the async DFS backtracking algorithm.
 * Exposes commands on `window` for HTML onclick attributes.
 */
'use strict';

const Controller = (() => {

  let isMouseDown = false;

  // ── Tool selection ────────────────────────────────────────────────
  function setTool(t) {
    Model.state.tool = t;
    View.setActiveTool(t);
    // Auto-close the mobile drawer after a tool is picked
    if (window.innerWidth <= 680) View.closeDrawer();
  }

  // ── Canvas pointer handling (mouse + touch) ───────────────────────
  function handlePointer(e, isDrag = false) {
    if (Model.state.solving) return;

    const { r, c } = View.cellAt(e);
    const t = Model.state.tool;

    // Dragging only paints wall / erase, not start / end placement
    if (isDrag && t !== 'wall' && t !== 'erase') return;

    const changed = Model.applyTool(r, c);
    if (!changed) return;

    // Snap back to wall after placing a start or end marker
    if (t === 'start' || t === 'end') {
      Model.state.tool = 'wall';
      View.setActiveTool('wall');
    }

    View.render();
  }

  // Mouse
  View.canvas.addEventListener('mousedown', e => {
    isMouseDown = true;
    handlePointer(e);
  });
  View.canvas.addEventListener('mousemove', e => {
    if (isMouseDown) handlePointer(e, true);
  });
  View.canvas.addEventListener('mouseup',    () => { isMouseDown = false; });
  View.canvas.addEventListener('mouseleave', () => { isMouseDown = false; });

  // Touch
  View.canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    isMouseDown = true;
    handlePointer(e);
  }, { passive: false });

  View.canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (isMouseDown) handlePointer(e, true);
  }, { passive: false });

  View.canvas.addEventListener('touchend', () => { isMouseDown = false; });

  // ── Grid size slider ──────────────────────────────────────────────
  function onResize(n) {
    if (Model.state.solving) return;
    Model.setSize(n);
    View.resizeCanvas();
    generateMaze();
  }

  // ── Clear grid ────────────────────────────────────────────────────
  function clearGrid() {
    if (Model.state.solving) return;
    Model.initGrid();
    View.render();
    View.setStatus('READY — DRAW YOUR MAZE');
  }

  // ── Generate random maze ──────────────────────────────────────────
  function generateMaze() {
    if (Model.state.solving) return;
    Model.generateMaze();
    View.render();
    View.setStatus('RANDOM MAZE GENERATED — PRESS SOLVE');
  }

  // ── Solve: async DFS backtracking ─────────────────────────────────
  async function solve() {
    if (Model.state.solving) return;

    Model.cleanSolveState();
    View.render();

    Model.state.solving = true;
    View.setControlsLocked(true);
    View.setStatus('SCANNING...', 'solving');

    // Reads the speed slider live on every frame so mid-solve adjustments work
    const delay = () => new Promise(res =>
      setTimeout(res, +document.getElementById('speed').value)
    );

    const { grid, ROWS, COLS } = Model.state;
    const visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    const DR = [-1,  1,  0, 0];
    const DC = [ 0,  0, -1, 1];
    let found = false;
    let steps = 0;

    async function dfs(r, c) {
      if (found) return true;
      if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
      if (grid[r][c] === Model.WALL)  return false;
      if (visited[r][c])              return false;

      visited[r][c] = true;
      steps++;

      const { startR, startC, endR, endC } = Model.state;

      // Reached the end
      if (r === endR && c === endC) { found = true; return true; }

      const isStart = (r === startR && c === startC);
      grid[r][c] = isStart ? Model.S_START : Model.S_VISITING;
      View.render();
      View.setStatus(`EXPLORING (${steps} steps)`, 'solving');
      await delay();

      // Recurse into each neighbour
      for (let d = 0; d < 4; d++) {
        if (await dfs(r + DR[d], c + DC[d])) {
          // Tracing the successful path back up the call stack
          if (!isStart) grid[r][c] = Model.S_PATH;
          View.render();
          await delay();
          return true;
        }
      }

      // Dead end — backtrack
      if (!isStart) grid[r][c] = Model.S_DEAD;
      View.render();
      return false;
    }

    const ok = await dfs(Model.state.startR, Model.state.startC);

    Model.state.solving = false;
    View.setControlsLocked(false);

    if (ok) View.setStatus(`✓ PATH FOUND IN ${steps} STEPS`, 'success');
    else    View.setStatus('✗ NO PATH EXISTS', 'fail');
  }

  // ── Window resize / orientation change ───────────────────────────
  window.addEventListener('resize', () => {
    if (Model.state.solving) return;
    Model.setSize(Model.state.COLS);
    View.resizeCanvas();
    View.render();
  });

  // ── Bootstrap ────────────────────────────────────────────────────
  function init() {
    Model.setSize(20);
    View.resizeCanvas();
    generateMaze();
  }

  // ── Expose commands to HTML onclick / oninput attributes ─────────
  window.setTool       = setTool;
  window.onResize      = onResize;
  window.clearGrid     = clearGrid;
  window.generateMaze  = generateMaze;
  window.solve         = solve;
  window.toggleDrawer  = View.toggleDrawer;
  window.closeDrawer   = View.closeDrawer;

  return { init };

})();
