(() => {
  const ROWS = 3;
  const COLS = 4;
  const STATES = ['empty', 'green', 'yellow', 'red'];

  const board      = document.getElementById('board');
  const statusText = document.getElementById('turn-text');
  const turnDot    = document.getElementById('turn-dot');
  const resetBtn   = document.getElementById('reset');
  const modeBtns   = document.querySelectorAll('.mode-btn');

  let grid, player, over, cells;
  let startingPlayer = 1;

  let localPlayer = null;
  let connected   = false;
  let mode        = 'pc'; // 'pvp' | 'pc' | 'online'
  const handlers  = { onLocalMove: null, onLocalReset: null, onModeChange: null };

  const PC_MOVE_DELAY_MS = 800;
  let pcStartupExtraDelayMs = 0;

  function build() {
    // cells are rendered in HTML so first paint has the correct layout;
    // here we just wire up the 2D array and click handlers.
    cells = [];
    const rows = board.querySelectorAll('.row');
    rows.forEach((row, r) => {
      const rowCells = [];
      row.querySelectorAll('.cell').forEach((btn, c) => {
        btn.addEventListener('click', () => play(r, c));
        rowCells.push(btn);
      });
      cells.push(rowCells);
    });
  }

  function reset(fromRemote) {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    player = startingPlayer;
    startingPlayer = startingPlayer === 1 ? 2 : 1;
    over = false;

    for (const row of cells) {
      for (const c of row) {
        c.classList.remove('green', 'yellow', 'red', 'win');
        c.disabled = false;
      }
    }

    if (!fromRemote) handlers.onLocalReset && handlers.onLocalReset();

    updateStatus();

    if (mode === 'pc' && player === 2) schedulePcMove();
  }

  function updateStatus(winnerLine) {
    turnDot.classList.remove('p2', 'win', 'loss');
    resetBtn.hidden = !over;

    if (over) {
      if (winnerLine) {
        const opponentWon = (mode === 'online' && player !== localPlayer)
                         || (mode === 'pc' && player === 2);
        turnDot.classList.add(opponentWon ? 'loss' : 'win');
        statusText.textContent = playerLabel(player, true);
      } else {
        statusText.textContent = 'Draw';
      }
      return;
    }

    if (player === 2) turnDot.classList.add('p2');
    statusText.textContent = playerLabel(player, false);
  }

  function playerLabel(p, isWin) {
    if (localPlayer) {
      const who = p === localPlayer ? 'Your' : "Opponent's";
      return isWin
        ? (p === localPlayer ? 'You win!' : 'Opponent wins')
        : `${who} turn`;
    }
    if (mode === 'pc') {
      const who = p === 1 ? 'Your' : "PC's";
      return isWin
        ? (p === 1 ? 'You win!' : 'PC wins!')
        : `${who} turn`;
    }
    return isWin ? `Player ${p} wins!` : `Player ${p}'s turn`;
  }

  function play(r, c, fromRemote, fromPc) {
    if (over) return;
    if (grid[r][c] >= 3) return;
    // local input guards (remote moves and PC scheduler bypass these)
    if (!fromRemote) {
      // online: block until the data channel is ready and only on your own turn
      if (mode === 'online' && (!connected || player !== localPlayer)) return;
      // PC: block human clicks on the PC's turn
      if (mode === 'pc' && !fromPc && player === 2) return;
    }

    // now that we've verified the move is valid, update the state and UI
    // this may be a local move, a remote move, or a scheduled PC move

    grid[r][c] += 1;
    const cell = cells[r][c];
    cell.classList.remove('green', 'yellow', 'red');
    cell.classList.add(STATES[grid[r][c]]);
    if (grid[r][c] === 3) cell.disabled = true;

    // online: forward local moves to the peer (no-op in pvp/pc)
    if (!fromRemote) handlers.onLocalMove && handlers.onLocalMove(r, c);

    const line = findWin();
    if (line) {
      over = true;
      for (const [wr, wc] of line) cells[wr][wc].classList.add('win');
      for (const row of cells) for (const c2 of row) c2.disabled = true;
      updateStatus(line);
      return;
    }

    if (isFull()) {
      over = true;
      updateStatus(null);
      return;
    }

    player = player === 1 ? 2 : 1;
    updateStatus();

    // once the human plays, schedule the PC move
    if (mode === 'pc' && player === 2 && !over) schedulePcMove();
  }

  function schedulePcMove() {
    const delay = PC_MOVE_DELAY_MS + pcStartupExtraDelayMs;
    pcStartupExtraDelayMs = 0;
    setTimeout(() => {
      // bail if state changed during the delay (reset, mode change, human took the turn)
      if (over || mode !== 'pc' || player !== 2) return;
      // pick a random non-red cell for the PC's move
      // any cell with state < 3 is non-red (0=empty, 1=green, 2=yellow, 3=red)
      const candidates = [];
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (grid[r][c] < 3) candidates.push([r, c]);
        }
      }
      if (!candidates.length) return;
      // a click always increments the cell regardless of player, so the same cell
      // that would let the human win next turn is the cell that wins for PC now —
      // one helper covers both attack and block
      const winning = findWinningMove(candidates);
      // otherwise avoid cells that would hand the human a winning move next turn
      const pool = winning ? [winning] : (safeCandidatesForPcMove(candidates) || candidates);
      const [r, c] = pool[Math.floor(Math.random() * pool.length)];
      // fromPc=true so play() bypasses the human-click guard for the PC's turn
      play(r, c, false, true);
    }, delay);
  }

  function findWinningMove(candidates) {
    for (const [r, c] of candidates) {
      grid[r][c] += 1;
      const win = findWin();
      grid[r][c] -= 1;
      if (win) return [r, c];
    }
    return null;
  }

  function safeCandidatesForPcMove(candidates) {
    // simulate each PC move and drop the ones that leave the human a winning move next turn
    const safe = candidates.filter(([r, c]) => {
      grid[r][c] += 1;
      const next = [];
      for (let rr = 0; rr < ROWS; rr++)
        for (let cc = 0; cc < COLS; cc++)
          if (grid[rr][cc] < 3) next.push([rr, cc]);
      const opponentWin = findWinningMove(next);
      grid[r][c] -= 1;
      return !opponentWin;
    });
    return safe.length ? safe : null;
  }

  function isFull() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c] < 3) return false;
      }
    }
    return true;
  }

  function findWin() {
    const lines = [];

    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c <= COLS - 3; c++)
        lines.push([[r, c], [r, c + 1], [r, c + 2]]);

    for (let c = 0; c < COLS; c++)
      for (let r = 0; r <= ROWS - 3; r++)
        lines.push([[r, c], [r + 1, c], [r + 2, c]]);

    for (let r = 0; r <= ROWS - 3; r++) {
      for (let c = 0; c <= COLS - 3; c++) {
        lines.push([[r, c],     [r + 1, c + 1], [r + 2, c + 2]]);
        lines.push([[r, c + 2], [r + 1, c + 1], [r + 2, c]]);
      }
    }

    for (const line of lines) {
      const [a, b, d] = line;
      const v = grid[a[0]][a[1]];
      if (v !== 0 && v === grid[b[0]][b[1]] && v === grid[d[0]][d[1]]) return line;
    }

    return null;
  }

  function setMode(newMode) {
    if (newMode === mode) return;
    const prev = mode;
    mode = newMode;
    for (const b of modeBtns) {
      const active = b.dataset.mode === newMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active);
    }
    handlers.onModeChange && handlers.onModeChange(newMode, prev);
  }

  resetBtn.addEventListener('click', () => reset(false));

  modeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      const newMode = b.dataset.mode;
      if (newMode === mode) return;
      setMode(newMode);
      // always clear local state on switch so a finished game doesn't leak its
      // status ("Draw"/winner) into the new mode's setup screen.
      // online.js calls startMatch() once paired, which resets again.
      startingPlayer = 1;
      reset(false);
    });
  });

  build();

  // embed mode (?embed=1): auto-switch to vs PC so the standalone widget is playable solo;
  // seed PC (player 2) as starter so the board isn't idle waiting for the visitor's first click.
  // setMode('pc') is a no-op since 'pc' is the default mode, but kept intentionally so embed
  // behavior stays correct if the default is ever changed.
  if (new URLSearchParams(location.search).get('embed') === '1') {
    setMode('pc');
    startingPlayer = 2;
    // give the visitor a moment to notice the embedded widget before PC plays
    pcStartupExtraDelayMs = 1000;
  }

  reset(true);

  window.Game = {
    applyRemoteMove:  (r, c) => play(r, c, true),
    applyRemoteReset: ()     => reset(true),
    // Fresh online match: host (player 1) always starts
    startMatch:       ()     => { startingPlayer = 1; reset(true); },
    setLocalPlayer:   (p)    => { localPlayer = p; updateStatus(); },
    setConnected:     (b)    => { connected = b; },
    setMode,
    setHandlers:      (h)    => { Object.assign(handlers, h); },
  };
})();
