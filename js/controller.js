/**
 * CONTROLLER
 * Wires DOM events to Model mutations and View updates.
 * Runs the async iterative DFS backtracking algorithm.
 * Exposes commands on `window` for HTML onclick attributes.
 *
 * Key improvements over the recursive version:
 *  1. Iterative DFS — explicit stack avoids call-stack overflow on large grids.
 *  2. Animated path sweep — final route is traced cell-by-cell after solving.
 *  3. Keyboard shortcuts — Space, R, C, Esc, 1–4.
 */
'use strict';

const Controller = (() => {

  let isMouseDown = false;

  // ── Tool selection ────────────────────────────────────────────────
  function setTool(t) {
    if (Model.state.solving && !Model.state.paused) return;
    Model.state.tool = t;
    View.setActiveTool(t);
    if (window.innerWidth <= 680) View.closeDrawer();
  }

  // ── Canvas pointer handling (mouse + touch) ───────────────────────
  function handlePointer(e, isDrag = false) {
    if (Model.state.solving && !Model.state.paused) return;

    const { r, c } = View.cellAt(e);
    const t = Model.state.tool;

    if (isDrag && t !== 'wall' && t !== 'erase') return;

    const changed = Model.applyTool(r, c);
    if (!changed) return;

    if (t === 'start' || t === 'end') {
      // If a solve was paused, cancel it — the captured start/end coords
      // inside the async loop are now stale and can't be patched in-flight.
      // Cancel, clean the trail, and let the user press Solve again.
      if (Model.state.solving) {
        Model.state.cancelled = true;
        Model.state.paused    = false;
        // Give the async catch-block ~100 ms to finish resetting solving/UI,
        // then clean the leftover trail and re-stamp the new start/end cells.
        setTimeout(() => {
          Model.cleanSolveState();   // clears visiting/dead/path, re-stamps S/E
          View.render();
          View.setStatus('START/END MOVED — PRESS SOLVE AGAIN');
          View.resetStats();
        }, 150);
      }
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
  function cancelSolve() {
    if (!Model.state.solving) return;
    Model.state.cancelled = true;
    Model.state.paused    = false;
  }

  // ── Grid size slider ──────────────────────────────────────────────
  function onResize(n) {
    if (Model.state.solving) cancelSolve();

    const doResize = () => {
      Model.state.solving   = false;
      Model.state.paused    = false;
      Model.state.cancelled = false;

      View.setSolveButtonState('solve');
      View.setControlsLocked(false);

      Model.setSize(n);
      View.resizeCanvas();
      Model.generateMaze();
      View.render();
      View.setStatus('GRID RESIZED — PRESS SOLVE');
      View.resetStats();
    };

    if (Model.state.solving) setTimeout(doResize, 60);
    else                     doResize();
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
      View.resetStats();
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
      View.resetStats();
    };

    if (Model.state.solving) setTimeout(doGen, 60);
    else                     doGen();
  }

  // ── Pause / Resume toggle ─────────────────────────────────────────
  function pauseSolve() {
    if (!Model.state.solving) return;

    if (Model.state.paused) {
      Model.state.paused = false;
      View.setSolveButtonState('pause');
      View.setControlsLocked(true);
      View.setStatus('RESUMING...', 'solving');
    } else {
      Model.state.paused = true;
      View.setSolveButtonState('resume');
      View.setControlsLocked(false);
      View.setStatus('PAUSED — ADJUST OR RESUME', 'paused');
    }
  }

  // ── Shared delay helper ───────────────────────────────────────────
  // Spins while paused, rejects immediately if cancelled.
  // `mult` scales the user's speed setting (e.g. 0.35 for faster path sweep).
  function makeDelay(mult = 1) {
    return new Promise(async (res, rej) => {
      while (Model.state.paused) {
        if (Model.state.cancelled) { rej(new Error('cancelled')); return; }
        await new Promise(r => setTimeout(r, 50));
      }
      if (Model.state.cancelled) { rej(new Error('cancelled')); return; }
      setTimeout(res, Math.max(5, Math.round(+document.getElementById('speed').value * mult)));
    });
  }

  // ── Solve: iterative DFS backtracking ────────────────────────────
  // Uses an explicit stack of { r, c, dir } frames so deep grids
  // never overflow the JS call stack (replaces recursive version).
  async function solve() {
    if (Model.state.solving) {
      pauseSolve();
      return;
    }

    Model.state.cancelled = false;
    Model.state.paused    = false;
    Model.cleanSolveState();

    const { grid, startR, startC, endR, endC, ROWS, COLS } = Model.state;

    View.render();
    View.resetStats();

    Model.state.solving = true;
    View.setSolveButtonState('pause');
    View.setControlsLocked(true);
    View.setStatus('SCANNING...', 'solving');

    const startTime = Date.now();

    const DR = [-1, 1,  0, 0];
    const DC = [ 0, 0, -1, 1];

    // Per-cell visited flags
    const visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    visited[startR][startC] = true;

    // Stack frames: { r, c, dir }
    // `dir` is the index of the next neighbour direction to try (0–3).
    const stack = [{ r: startR, c: startC, dir: 0 }];

    let steps    = 1;   // cells explored (start counts)
    let deadEnds = 0;
    let found    = false;

    try {
      // ── Main DFS loop ──────────────────────────────────────────────
      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const { r, c } = frame;
        const isStart = r === startR && c === startC;
        const isEnd   = r === endR   && c === endC;

        // Render cell as "currently visiting"
        if (!isStart && !isEnd) grid[r][c] = Model.S_VISITING;
        View.render();
        View.setStatus(`EXPLORING (${steps} CELLS)`, 'solving');
        View.updateStats({ steps, deadEnds, pathLen: null, elapsed: Date.now() - startTime });
        await makeDelay();

        // Reached the goal?
        if (isEnd) { found = true; break; }

        // Try the next unvisited, passable neighbour
        let pushed = false;
        while (frame.dir < 4) {
          const nr = r + DR[frame.dir];
          const nc = c + DC[frame.dir];
          frame.dir++;

          if (
            nr >= 0 && nr < ROWS &&
            nc >= 0 && nc < COLS &&
            grid[nr][nc] !== Model.WALL &&
            !visited[nr][nc]
          ) {
            visited[nr][nc] = true;
            stack.push({ r: nr, c: nc, dir: 0 });
            steps++;
            pushed = true;
            break;
          }
        }

        if (!pushed) {
          // All neighbours exhausted — this cell is a dead end
          if (!isStart) grid[r][c] = Model.S_DEAD;
          stack.pop();
          deadEnds++;
        }
      }

      // ── Animated path sweep ────────────────────────────────────────
      // When found, `stack` holds exactly the solution path (start → end).
      // We trace it with a faster animation to distinguish it from exploration.
      const pathLen = found ? stack.length : 0;

      if (found) {
        for (const { r, c } of stack) {
          const isSt = r === startR && c === startC;
          const isEn = r === endR   && c === endC;
          if (!isSt && !isEn) grid[r][c] = Model.S_PATH;
          View.render();
          await makeDelay(0.35);   // ~35 % of exploration speed
        }
      }

      // ── Finish ────────────────────────────────────────────────────
      const elapsed = Date.now() - startTime;
      View.updateStats({ steps, deadEnds, pathLen, elapsed, solved: true });

      Model.state.solving   = false;
      Model.state.paused    = false;
      Model.state.cancelled = false;
      View.setSolveButtonState('solve');
      View.setControlsLocked(false);

      if (found) {
        View.setStatus(
          `✓ PATH FOUND · ${pathLen} CELLS · ${steps} EXPLORED · ${elapsed}ms`,
          'success'
        );
      } else {
        View.setStatus('✗ NO PATH EXISTS', 'fail');
      }

    } catch (err) {
      // Cancelled mid-solve — reset state immediately
      Model.state.solving   = false;
      Model.state.paused    = false;
      Model.state.cancelled = false;
      View.setSolveButtonState('solve');
      View.setControlsLocked(false);

      if (err.message === 'cancelled') {
        View.setStatus('SOLVE CANCELLED', 'fail');
      }
    }
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Never steal focus from text inputs (range sliders are fine)
    if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();  // stop page scroll
        solve();
        break;

      case 'r':
      case 'R':
        generateMaze();
        break;

      case 'c':
      case 'C':
        clearGrid();
        break;

      case 'Escape':
        if (Model.state.solving) {
          cancelSolve();
          // After cancelling, we want to reset the UI state immediately
          // clearGrid() or generateMaze() usually do this via timeout, 
          // but for Esc we can just let the solve loop catch the error.
        }
        break;

      // Tool shortcuts: 1 = wall, 2 = erase, 3 = start, 4 = end
      case '1': setTool('wall');  break;
      case '2': setTool('erase'); break;
      case '3': setTool('start'); break;
      case '4': setTool('end');   break;
    }
  });

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