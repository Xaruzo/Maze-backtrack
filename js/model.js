/**
 * MODEL
 * Pure state and maze logic — no DOM access whatsoever.
 * Exposes a single global `Model` object consumed by View and Controller.
 */
'use strict';

const Model = (() => {

  // ── Cell state constants ──────────────────────────────────────────
  const EMPTY     = 0;
  const WALL      = 1;
  const S_START   = 2;
  const S_END     = 3;
  const S_VISITING = 4;
  const S_DEAD    = 5;
  const S_PATH    = 6;

  // ── Application state ─────────────────────────────────────────────
  const state = {
    COLS:    20,
    ROWS:    20,
    CELL:    28,
    grid:    [],
    startR:  1,
    startC:  1,
    endR:    18,
    endC:    18,
    tool:    'wall',
    solving: false,
    paused:  false,
  };

  // ── Grid initialisation ───────────────────────────────────────────
  function initGrid() {
    state.grid = Array.from(
      { length: state.ROWS },
      () => new Array(state.COLS).fill(EMPTY)
    );
    // Border walls
    for (let r = 0; r < state.ROWS; r++) {
      for (let c = 0; c < state.COLS; c++) {
        if (r === 0 || r === state.ROWS - 1 || c === 0 || c === state.COLS - 1) {
          state.grid[r][c] = WALL;
        }
      }
    }
    state.startR = 1;
    state.startC = 1;
    state.endR   = state.ROWS - 2;
    state.endC   = state.COLS - 2;
  }

  // ── Resize — recalculates cell pixel size ─────────────────────────
  function setSize(n) {
    state.COLS = state.ROWS = n;
    const isMobile  = window.innerWidth <= 680;
    const available = isMobile
      ? window.innerWidth - 16         // full width minus small padding
      : window.innerWidth - 220 - 48;  // minus sidebar + gaps
    state.CELL = Math.max(8, Math.min(40, Math.floor(available / n)));
  }

  // ── Apply the active drawing tool at (r, c) ───────────────────────
  // Returns true if something changed, false if the action was blocked.
  function applyTool(r, c) {
    const { grid, startR, startC, endR, endC } = state;
    if (r < 0 || r >= state.ROWS || c < 0 || c >= state.COLS) return false;

    switch (state.tool) {
      case 'wall':
        if ((r === startR && c === startC) || (r === endR && c === endC)) return false;
        grid[r][c] = WALL;
        break;
      case 'erase':
        grid[r][c] = EMPTY;
        break;
      case 'start':
        grid[startR][startC] = EMPTY;
        if (grid[r][c] === WALL) grid[r][c] = EMPTY;
        state.startR = r;
        state.startC = c;
        break;
      case 'end':
        grid[endR][endC] = EMPTY;
        if (grid[r][c] === WALL) grid[r][c] = EMPTY;
        state.endR = r;
        state.endC = c;
        break;
      default:
        return false;
    }
    return true;
  }

  // ── Strip solve-state colours before a new solve run ─────────────
  function cleanSolveState() {
    const solveStates = [S_VISITING, S_DEAD, S_PATH, S_START];
    for (let r = 0; r < state.ROWS; r++) {
      for (let c = 0; c < state.COLS; c++) {
        if (solveStates.includes(state.grid[r][c])) state.grid[r][c] = EMPTY;
      }
    }
    if (state.grid[state.endR][state.endC] !== WALL) {
      state.grid[state.endR][state.endC] = S_END;
    }
  }

  // ── Randomised DFS perfect-maze generator ─────────────────────────
  function generateMaze() {
    initGrid();

    // Fill all interior cells with walls
    for (let r = 1; r < state.ROWS - 1; r++) {
      for (let c = 1; c < state.COLS - 1; c++) {
        state.grid[r][c] = WALL;
      }
    }

    const visited = Array.from(
      { length: state.ROWS },
      () => new Array(state.COLS).fill(false)
    );

    function shuffle(a) {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    function carve(r, c) {
      visited[r][c]    = true;
      state.grid[r][c] = EMPTY;
      for (const [dr, dc] of shuffle([[-2,0],[2,0],[0,-2],[0,2]])) {
        const nr = r + dr, nc = c + dc;
        if (
          nr > 0 && nr < state.ROWS - 1 &&
          nc > 0 && nc < state.COLS - 1 &&
          !visited[nr][nc]
        ) {
          state.grid[r + dr / 2][c + dc / 2] = EMPTY;
          carve(nr, nc);
        }
      }
    }

    carve(1, 1);

    // Place start / end
    state.startR = 1;
    state.startC = 1;
    state.endR   = state.ROWS - 2;
    state.endC   = state.COLS - 2;
    state.grid[state.endR][state.endC] = EMPTY;

    // Ensure end cell is reachable
    if (
      state.grid[state.endR - 1][state.endC] === WALL &&
      state.grid[state.endR][state.endC - 1] === WALL
    ) {
      state.grid[state.endR - 1][state.endC] = EMPTY;
    }
  }

  // ── Public API ────────────────────────────────────────────────────
  return {
    state,
    EMPTY, WALL,
    S_START, S_END, S_VISITING, S_DEAD, S_PATH,
    initGrid,
    setSize,
    applyTool,
    cleanSolveState,
    generateMaze,
  };

})();
