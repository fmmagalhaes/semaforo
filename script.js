(() => {
  const ROWS = 3;
  const COLS = 4;
  const STATES = ['empty', 'green', 'yellow', 'red'];

  const board       = document.getElementById('board');
  const statusText  = document.getElementById('turn-text');
  const turnDot     = document.getElementById('turn-dot');
  const resetBtn    = document.getElementById('reset');

  let grid;
  let player;
  let over;
  let cells;

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

  function reset() {
    grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    player = 1;
    over = false;

    for (const row of cells) {
      for (const c of row) {
        c.classList.remove('green', 'yellow', 'red', 'win');
        c.disabled = false;
      }
    }

    updateStatus();
  }

  function updateStatus(winnerLine) {
    turnDot.classList.remove('p2', 'win');

    if (over) {
      if (winnerLine) {
        turnDot.classList.add('win');
        statusText.textContent = `Player ${player} wins!`;
      } else {
        statusText.textContent = 'Draw';
      }
      return;
    }

    if (player === 2) turnDot.classList.add('p2');
    statusText.textContent = `Player ${player}'s turn`;
  }

  function play(r, c) {
    if (over) return;
    if (grid[r][c] >= 3) return;

    grid[r][c] += 1;
    const cell = cells[r][c];
    cell.classList.remove('green', 'yellow', 'red');
    cell.classList.add(STATES[grid[r][c]]);
    if (grid[r][c] === 3) cell.disabled = true;

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

  resetBtn.addEventListener('click', reset);
  build();
  reset();
})();
