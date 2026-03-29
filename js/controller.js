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
    if (window.innerWidth <= 680) View.closeDrawer();
  }

  // ── Canvas pointer handling (mouse + touch) ───────────────────────
  function handlePointer(e, isDrag = false) {
    // Allow drawing when paused (solve is suspended) but not while actively running
    if (Model.state.solving && !Model.state.paused) return;

    const { r, c } = View.cellAt(e);
    const t = Model.state.tool;

    if (isDrag && t !== 'wall' && t !== 'erase') return;

    const changed = Model.applyTool(r, c);
    if (!changed) return;

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

  // ── Cancel a running / paused solve ──────────────────────────────
  // Sets the cancelled flag so the next delay() rejects, unwinding DFS.
  function cancelSolve() {
    if (!Model.state.solving) return;
    Model.state.cancelled = true;
    Model.state.paused    = false;   // unblock any waiting delay()
  }

  // ── Grid size slider ──────────────────────────────────────────────
  function onResize(n) {
    // If solving, we MUST cancel it first.
    if (Model.state.solving) cancelSolve();

    // Debounce to ensure the cancel flag is picked up by the async DFS
    // before we stomp on the grid state and start a new maze.
    const doResize = () => {
      // 1. Reset state
      Model.state.solving   = false;
      Model.state.paused    = false;
      Model.state.cancelled = false;

      // 2. Update UI
      View.setSolveButtonState('solve');
      View.setControlsLocked(false);

      // 3. Resize and Regenerate
      Model.setSize(n);
      View.resizeCanvas();
      Model.generateMaze(); // Direct call to Model logic
      View.render();
      View.setStatus('GRID RESIZED — PRESS SOLVE');
    };

    if (Model.state.solving) {
      setTimeout(doResize, 60);
    } else {
      doResize();
    }
  }

  // ── Clear grid ────────────────────────────────────────────────────
  function clearGrid() {
    if (Model.state.solving) cancelSolve();
    
    const doClear = () => {
      Model.state.solving   = false;
      Model.state.paused    = false;
      Model.state.cancelled = false;
      View.setSolveButtonState('solve');
      View.setControlsLocked(false);
      Model.initGrid();
      View.render();
      View.setStatus('READY — DRAW YOUR MAZE');
    };

    if (Model.state.solving) setTimeout(doClear, 60);
    else                     doClear();
  }

  // ── Generate random maze ──────────────────────────────────────────
  function generateMaze() {
    if (Model.state.solving) cancelSolve();

    const doGen = () => {
      Model.state.solving   = false;
      Model.state.paused    = false;
      Model.state.cancelled = false;
      View.setSolveButtonState('solve');
      View.setControlsLocked(false);
      Model.generateMaze();
      View.render();
      View.setStatus('RANDOM MAZE GENERATED — PRESS SOLVE');
    };

    if (Model.state.solving) setTimeout(doGen, 60);
    else                     doGen();
  }

  // ── Pause / Resume toggle ─────────────────────────────────────────
  function pauseSolve() {
    if (!Model.state.solving) return;

    if (Model.state.paused) {
      // ── Resume ──
      Model.state.paused = false;
      View.setSolveButtonState('pause');   // back to showing PAUSE
      View.setControlsLocked(true);        // re-lock everything except speed
      View.setStatus('RESUMING...', 'solving');
    } else {
      // ── Pause ──
      Model.state.paused = true;
      View.setSolveButtonState('resume');  // show RESUME
      View.setControlsLocked(false);       // unlock all controls
      View.setStatus('PAUSED — ADJUST OR RESUME', 'paused');
    }
  }

  // ── Solve: async DFS backtracking ─────────────────────────────────
  async function solve() {
    // If already solving, we toggle pause/resume instead
    if (Model.state.solving) {
      pauseSolve();
      return;
    }

    Model.state.cancelled = false;
    Model.state.paused    = false;
    Model.cleanSolveState();
    View.render();

    Model.state.solving = true;
    View.setSolveButtonState('pause');   // Solve button → PAUSE
    View.setControlsLocked(true);
    View.setStatus('SCANNING...', 'solving');

    // delay() pauses mid-wait when state.paused is true,
    // and rejects (throws) when state.cancelled is true.
    const delay = () => new Promise(async (res, rej) => {
      // Spin while paused
      while (Model.state.paused) {
        if (Model.state.cancelled) { rej(new Error('cancelled')); return; }
        await new Promise(r => setTimeout(r, 50));
      }
      if (Model.state.cancelled) { rej(new Error('cancelled')); return; }
      setTimeout(res, +document.getElementById('speed').value);
    });

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

      if (r === endR && c === endC) { found = true; return true; }

      const isStart = (r === startR && c === startC);
      grid[r][c] = isStart ? Model.S_START : Model.S_VISITING;
      View.render();
      View.setStatus(`EXPLORING (${steps} steps)`, 'solving');
      await delay();   // ← throws if cancelled

      for (let d = 0; d < 4; d++) {
        if (await dfs(r + DR[d], c + DC[d])) {
          if (!isStart) grid[r][c] = Model.S_PATH;
          View.render();
          await delay();
          return true;
        }
      }

      if (!isStart) grid[r][c] = Model.S_DEAD;
      View.render();
      return false;
    }

    let ok = false;
    try {
      ok = await dfs(Model.state.startR, Model.state.startC);
    } catch (err) {
      // Solve was cancelled — caller already reset state
      return;
    }

    Model.state.solving   = false;
    Model.state.paused    = false;
    Model.state.cancelled = false;
    View.setSolveButtonState('solve');
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
  window.pauseSolve    = pauseSolve;
  window.toggleDrawer  = View.toggleDrawer;
  window.closeDrawer   = View.closeDrawer;

  return { init };

})();