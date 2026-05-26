(() => {
  const ROWS = 3;
  const COLS = 4;
  const STATES = ['empty', 'green', 'yellow', 'red'];

  const board      = document.getElementById('board');
  const statusText = document.getElementById('turn-text');
  const turnDot    = document.getElementById('turn-dot');
  const resetBtn   = document.getElementById('reset');

  let grid;
  let player;
  let over;
  let cells;
  let startingPlayer = 1;

  let localPlayer = null;
  let connected   = false;
  const handlers  = { onLocalMove: null, onLocalReset: null };

  function build() {
    board.innerHTML = '';
    cells = [];

    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      const rowCells = [];

      for (let c = 0; c < COLS; c++) {
        const btn = document.createElement('button');
        btn.className = 'cell';
        btn.setAttribute('role', 'gridcell');
        btn.setAttribute('aria-label', `Row ${r + 1} column ${c + 1}`);

        const piece = document.createElement('span');
        piece.className = 'piece';
        btn.appendChild(piece);

        btn.addEventListener('click', () => play(r, c));

        row.appendChild(btn);
        rowCells.push(btn);
      }

      board.appendChild(row);
      cells.push(rowCells);
    }
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
  }

  function updateStatus(winnerLine) {
    turnDot.classList.remove('p2', 'win', 'loss');
    resetBtn.disabled = !over;

    if (over) {
      if (winnerLine) {
        const opponentWon = localPlayer && player !== localPlayer;
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
    return isWin ? `Player ${p} wins!` : `Player ${p}'s turn`;
  }

  function play(r, c, fromRemote) {
    if (over) return;
    if (grid[r][c] >= 3) return;
    // online mode: ignore clicks on the opponent's turn
    if (!fromRemote && localPlayer && player !== localPlayer) return;
    // online mode: ignore clicks before the data channel is ready (would desync)
    if (!fromRemote && localPlayer && !connected) return;

    grid[r][c] += 1;
    const cell = cells[r][c];
    cell.classList.remove('green', 'yellow', 'red');
    cell.classList.add(STATES[grid[r][c]]);
    if (grid[r][c] === 3) cell.disabled = true;

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

  resetBtn.addEventListener('click', () => reset(false));

  build();
  reset(true);

  window.Game = {
    applyRemoteMove:  (r, c) => play(r, c, true),
    applyRemoteReset: ()     => reset(true),
    // Fresh online match: host (player 1) always starts
    startMatch:       ()     => { startingPlayer = 1; reset(true); },
    setLocalPlayer:   (p)    => { localPlayer = p; updateStatus(); },
    setConnected:     (b)    => { connected = b; },
    setHandlers:      (h)    => { Object.assign(handlers, h); },
  };
})();
