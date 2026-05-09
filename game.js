const BOARD_SIZE = 19;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

// ─── Evaluation tables ───────────────────────────────────────────────────────
const SEQ_SCORE = [0, 0, 10, 100, 1000, 10000, 100000];

// ─── Board utilities ──────────────────────────────────────────────────────────
function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => new Int8Array(BOARD_SIZE));
}

function copyBoard(b) {
  return b.map(row => row.slice());
}

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

function countDir(board, r, c, dr, dc, player) {
  let n = 0;
  for (let i = 1; i <= 5; i++) {
    const nr = r + dr * i, nc = c + dc * i;
    if (nr < 0 || nr >= BOARD_SIZE || nc < 0 || nc >= BOARD_SIZE) break;
    if (board[nr][nc] !== player) break;
    n++;
  }
  return n;
}

function checkWinAt(board, r, c) {
  const p = board[r][c];
  if (!p) return false;
  for (const [dr, dc] of DIRS) {
    const len = 1 + countDir(board, r, c, dr, dc, p) + countDir(board, r, c, -dr, -dc, p);
    if (len >= 6) return p;
  }
  return false;
}

function checkWinBoard(board) {
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++)
      if (board[r][c] && checkWinAt(board, r, c)) return board[r][c];
  return 0;
}

// ─── Candidate generation ────────────────────────────────────────────────────
function getCandidates(board, radius = 2, maxN = 20) {
  const seen = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  const out = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!board[r][c]) continue;
      const r0 = Math.max(0, r - radius), r1 = Math.min(BOARD_SIZE - 1, r + radius);
      const c0 = Math.max(0, c - radius), c1 = Math.min(BOARD_SIZE - 1, c + radius);
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          if (!board[rr][cc] && !seen[rr * BOARD_SIZE + cc]) {
            seen[rr * BOARD_SIZE + cc] = 1;
            out.push([rr, cc]);
          }
        }
      }
    }
  }
  if (!out.length) {
    const mid = (BOARD_SIZE - 1) >> 1;
    return [[mid, mid]];
  }
  return out;
}

// ─── Static evaluation ────────────────────────────────────────────────────────
function scoreCell(board, r, c, player) {
  let s = 0;
  for (const [dr, dc] of DIRS) {
    const fwd = countDir(board, r, c, dr, dc, player);
    const bwd = countDir(board, r, c, -dr, -dc, player);
    const len = 1 + fwd + bwd;
    const bR = r - dr * (bwd + 1), bC = c - dc * (bwd + 1);
    const eR = r + dr * (fwd + 1), eC = c + dc * (fwd + 1);
    const openB = bR >= 0 && bR < BOARD_SIZE && bC >= 0 && bC < BOARD_SIZE && !board[bR][bC];
    const openE = eR >= 0 && eR < BOARD_SIZE && eC >= 0 && eC < BOARD_SIZE && !board[eR][eC];
    const opens = (openB ? 1 : 0) + (openE ? 1 : 0);
    if (len >= 6) s += 100000;
    else if (opens === 0) continue;
    else s += SEQ_SCORE[len] * opens;
  }
  return s;
}

function evaluate(board) {
  let ai = 0, hu = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!board[r][c]) continue;
      const p = board[r][c];
      const sc = scoreCell(board, r, c, p);
      if (p === WHITE) ai += sc;
      else hu += sc;
    }
  }
  return ai - hu;
}

// ─── AI (negamax α-β, places 2 stones per turn) ───────────────────────────────
function sortedCandidates(board, player, n = 15) {
  const cands = getCandidates(board);
  const scored = cands.map(([r, c]) => {
    board[r][c] = player;
    const own = scoreCell(board, r, c, player);
    board[r][c] = 3 - player;
    const opp = scoreCell(board, r, c, 3 - player);
    board[r][c] = EMPTY;
    return { r, c, s: own + opp };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(x => [x.r, x.c]);
}

// negamax: returns score from perspective of `player`
function negamax(board, depth, alpha, beta, player, stonesLeft) {
  // stonesLeft: how many more stones this player must place this turn
  // When stonesLeft reaches 0, switch player and reset to 2

  if (stonesLeft === 0) {
    // switch player
    player = 3 - player;
    stonesLeft = 2;
    depth--;
    if (depth < 0) return -evaluate(board) * (player === WHITE ? 1 : -1);
  }

  if (depth === 0 && stonesLeft === 2) {
    // leaf
    const sc = evaluate(board);
    return player === WHITE ? sc : -sc;
  }

  const cands = sortedCandidates(board, player, depth <= 1 ? 10 : 8);

  let best = -Infinity;
  for (const [r, c] of cands) {
    board[r][c] = player;
    const w = checkWinAt(board, r, c);
    let score;
    if (w) {
      score = 90000 + depth * 100 + stonesLeft * 10;
    } else {
      score = -negamax(board, depth, -beta, -alpha, player, stonesLeft - 1);
    }
    board[r][c] = EMPTY;

    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? 0 : best;
}

function getAIMove(board, isFirst, difficulty) {
  const player = WHITE;
  const depth = { easy: 1, medium: 2, hard: 3 }[difficulty] ?? 2;

  if (isFirst) {
    const mid = (BOARD_SIZE - 1) >> 1;
    return [[mid + 1, mid], [mid - 1, mid]];
  }

  const cands = sortedCandidates(board, player, 15);

  // immediate win or block check first
  for (const [r, c] of cands) {
    board[r][c] = player;
    if (checkWinAt(board, r, c)) {
      board[r][c] = EMPTY;
      // find second stone to seal it
      for (const [r2, c2] of cands) {
        if (r2 === r && c2 === c) continue;
        board[r][c] = player;
        board[r2][c2] = player;
        const w = checkWinAt(board, r, c) || checkWinAt(board, r2, c2);
        board[r][c] = EMPTY;
        board[r2][c2] = EMPTY;
        if (w) return [[r, c], [r2, c2]];
      }
      board[r][c] = EMPTY;
      return [[r, c], cands.find(([rr, cc]) => rr !== r || cc !== c) || [r, c]];
    }
    board[r][c] = EMPTY;
  }

  let bestScore = -Infinity;
  let bestPair = null;
  const top = cands.slice(0, depth <= 1 ? 12 : 10);

  for (let i = 0; i < top.length; i++) {
    const [r1, c1] = top[i];
    board[r1][c1] = player;
    if (checkWinAt(board, r1, c1)) {
      board[r1][c1] = EMPTY;
      const r2c2 = top.find(([r, c]) => r !== r1 || c !== c1);
      return [[r1, c1], r2c2 || [r1, c1]];
    }
    for (let j = 0; j < top.length; j++) {
      if (i === j) continue;
      const [r2, c2] = top[j];
      if (board[r2][c2]) continue;
      board[r2][c2] = player;
      if (checkWinAt(board, r2, c2)) {
        board[r1][c1] = EMPTY;
        board[r2][c2] = EMPTY;
        return [[r1, c1], [r2, c2]];
      }
      const score = -negamax(board, depth - 1, -Infinity, Infinity, BLACK, 2);
      if (score > bestScore) {
        bestScore = score;
        bestPair = [[r1, c1], [r2, c2]];
      }
      board[r2][c2] = EMPTY;
    }
    board[r1][c1] = EMPTY;
  }

  return bestPair || (top.length >= 2 ? [top[0], top[1]] : [top[0], top[0]]);
}

// ─── Game state machine ───────────────────────────────────────────────────────
class Connect6Game {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = createBoard();
    this.currentPlayer = BLACK;
    this.moveCount = 0;       // total half-turns
    this.stonesThisTurn = 0;  // stones placed in current half-turn
    this.stonesRequired = 1;  // first move: 1 stone, rest: 2
    this.gameOver = false;
    this.winner = 0;
    this.lastMoves = [];       // last stones placed
    this.swapAvailable = false;
    this.swapUsed = false;
    this.history = [];        // [{r,c,player}]
    this.pendingStones = [];  // stones placed this turn (for undo)
  }

  // Returns { ok, win, needSwap }
  place(r, c) {
    if (this.gameOver) return { ok: false };
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return { ok: false };
    if (this.board[r][c]) return { ok: false };

    this.board[r][c] = this.currentPlayer;
    this.history.push({ r, c, player: this.currentPlayer });
    this.pendingStones.push([r, c]);
    this.lastMoves.push([r, c]);
    this.stonesThisTurn++;

    const win = checkWinAt(this.board, r, c);
    if (win) {
      this.gameOver = true;
      this.winner = win;
      return { ok: true, win };
    }

    if (this.stonesThisTurn >= this.stonesRequired) {
      return this._endTurn();
    }
    return { ok: true };
  }

  _endTurn() {
    this.moveCount++;
    this.stonesThisTurn = 0;
    this.stonesRequired = 2;
    this.pendingStones = [];
    this.currentPlayer = 3 - this.currentPlayer;
    this.lastMoves = [...(this.pendingStones)];

    // Swap is available to WHITE on their 2nd turn (after 5 stones on board)
    // That is: after moveCount reaches 2 (black turn 0, white turn 1 → now black turn 2 complete...
    // Actually: move0=black1stone, move1=white2stones, move2=black2stones → now white's 2nd turn
    if (this.moveCount === 3 && this.currentPlayer === WHITE && !this.swapUsed) {
      this.swapAvailable = true;
      return { ok: true, needSwap: true };
    }
    return { ok: true };
  }

  swap() {
    if (!this.swapAvailable) return false;
    this.swapAvailable = false;
    this.swapUsed = true;
    // Swap all stones on board
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (this.board[r][c]) this.board[r][c] = this.board[r][c] === BLACK ? WHITE : BLACK;
    // Also swap history
    for (const h of this.history) h.player = h.player === BLACK ? WHITE : BLACK;
    // current player stays the same (white proceeds)
    return true;
  }

  declineSwap() {
    this.swapAvailable = false;
  }

  getStonesLeft() {
    return this.stonesRequired - this.stonesThisTurn;
  }

  isFirstMove() {
    return this.moveCount === 0 && this.stonesThisTurn === 0;
  }
}

// ─── Renderer (Canvas) ───────────────────────────────────────────────────────
class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cellSize = 0;
    this.padding = 0;
    this.animating = new Map(); // key -> {r,c,progress}
  }

  resize(w, h) {
    const size = Math.min(w, h);
    this.canvas.width = size;
    this.canvas.height = size;
    const usable = size * 0.92;
    this.cellSize = usable / (BOARD_SIZE - 1);
    this.padding = (size - usable) / 2;
  }

  toPixel(idx) {
    return this.padding + idx * this.cellSize;
  }

  toCell(px) {
    return Math.round((px - this.padding) / this.cellSize);
  }

  draw(board, lastMoves = [], hoverCell = null, currentPlayer = BLACK) {
    const { ctx, canvas } = this;
    const S = canvas.width;
    ctx.clearRect(0, 0, S, S);
    this._drawBoard(S);
    this._drawStars();
    this._drawStones(board, lastMoves);
    if (hoverCell) this._drawHover(...hoverCell, currentPlayer);
  }

  _drawBoard(S) {
    const { ctx } = this;
    // Wood background
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.75);
    grad.addColorStop(0, '#dcb066');
    grad.addColorStop(1, '#b8832a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(0, 0, S, S, 12);
    ctx.fill();

    // Grid lines
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < BOARD_SIZE; i++) {
      const p = this.toPixel(i);
      ctx.beginPath();
      ctx.moveTo(this.toPixel(0), p);
      ctx.lineTo(this.toPixel(BOARD_SIZE - 1), p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, this.toPixel(0));
      ctx.lineTo(p, this.toPixel(BOARD_SIZE - 1));
      ctx.stroke();
    }
    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.toPixel(0), this.toPixel(0),
      this.toPixel(BOARD_SIZE - 1) - this.toPixel(0),
      this.toPixel(BOARD_SIZE - 1) - this.toPixel(0));
  }

  _drawStars() {
    const { ctx } = this;
    const stars = [3, 9, 15];
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    const r = this.cellSize * 0.1;
    for (const sr of stars) for (const sc of stars) {
      ctx.beginPath();
      ctx.arc(this.toPixel(sc), this.toPixel(sr), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawStones(board, lastMoves) {
    const lastSet = new Set(lastMoves.map(([r, c]) => r * BOARD_SIZE + c));
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[r][c]) continue;
        const isLast = lastSet.has(r * BOARD_SIZE + c);
        this._drawStone(r, c, board[r][c], isLast);
      }
    }
  }

  _drawStone(r, c, player, highlight = false) {
    const { ctx } = this;
    const x = this.toPixel(c), y = this.toPixel(r);
    const rad = this.cellSize * 0.46;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = rad * 0.5;
    ctx.shadowOffsetX = rad * 0.15;
    ctx.shadowOffsetY = rad * 0.2;

    const isBlack = player === BLACK;
    const grad = ctx.createRadialGradient(
      x - rad * 0.25, y - rad * 0.3, rad * 0.05,
      x, y, rad
    );
    if (isBlack) {
      grad.addColorStop(0, '#666');
      grad.addColorStop(0.3, '#2a2a2a');
      grad.addColorStop(1, '#000');
    } else {
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.5, '#e8e8e8');
      grad.addColorStop(1, '#bbb');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (highlight) {
      ctx.strokeStyle = isBlack ? '#ff4444' : '#cc0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, rad * 0.45, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawHover(r, c, player) {
    const { ctx } = this;
    const x = this.toPixel(c), y = this.toPixel(r);
    const rad = this.cellSize * 0.46;
    ctx.globalAlpha = 0.45;
    const isBlack = player === BLACK;
    ctx.fillStyle = isBlack ? '#333' : '#eee';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  coordFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;
    const c = this.toCell(px);
    const r = this.toCell(py);
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
    return [r, c];
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────
class Connect6Controller {
  constructor() {
    this.game = new Connect6Game();
    this.canvas = document.getElementById('board');
    this.renderer = new BoardRenderer(this.canvas);
    this.humanPlayer = BLACK;
    this.aiPlayer = WHITE;
    this.difficulty = 'medium';
    this.thinking = false;
    this.hoverCell = null;
    this.swapPending = false;
    this.lastMoves = [];

    this._bindUI();
    this._bindCanvas();
    this.resizeAndDraw();
    window.addEventListener('resize', () => this.resizeAndDraw());
    this._updateStatus();
  }

  resizeAndDraw() {
    const cont = document.getElementById('board-container');
    const size = Math.min(cont.clientWidth, cont.clientHeight) || 600;
    this.renderer.resize(size, size);
    this._redraw();
  }

  _redraw() {
    this.renderer.draw(
      this.game.board,
      this.lastMoves,
      (!this.game.gameOver && !this.thinking && !this.swapPending &&
        this.game.currentPlayer === this.humanPlayer) ? this.hoverCell : null,
      this.game.currentPlayer
    );
  }

  _bindUI() {
    document.getElementById('btn-new').addEventListener('click', () => this.newGame());
    document.getElementById('btn-swap-yes').addEventListener('click', () => this._doSwap(true));
    document.getElementById('btn-swap-no').addEventListener('click', () => this._doSwap(false));

    document.querySelectorAll('.side-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.humanPlayer = btn.dataset.side === 'black' ? BLACK : WHITE;
        this.aiPlayer = 3 - this.humanPlayer;
        this.newGame();
      });
    });

    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff;
      });
    });
  }

  _bindCanvas() {
    this.canvas.addEventListener('mousemove', e => {
      const cell = this.renderer.coordFromEvent(e);
      const changed = JSON.stringify(cell) !== JSON.stringify(this.hoverCell);
      this.hoverCell = cell;
      if (changed) this._redraw();
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverCell = null;
      this._redraw();
    });
    this.canvas.addEventListener('click', e => {
      if (this.game.gameOver || this.thinking || this.swapPending) return;
      if (this.game.currentPlayer !== this.humanPlayer) return;
      const cell = this.renderer.coordFromEvent(e);
      if (!cell) return;
      this._humanPlace(...cell);
    });

    // Touch support
    this.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (this.game.gameOver || this.thinking || this.swapPending) return;
      if (this.game.currentPlayer !== this.humanPlayer) return;
      const touch = e.changedTouches[0];
      const cell = this.renderer.coordFromEvent(touch);
      if (!cell) return;
      this._humanPlace(...cell);
    });
  }

  _humanPlace(r, c) {
    const result = this.game.place(r, c);
    if (!result.ok) return;

    // Track last move highlights
    if (this.game.pendingStones.length > 0 || result.win || result.needSwap) {
      this.lastMoves = [...this.game.pendingStones, [r, c]];
    }
    this._updateStatus();
    this._redraw();

    if (result.win) {
      this._showResult(result.win === this.humanPlayer ? 'win' : 'lose');
      return;
    }

    if (result.needSwap) {
      this.swapPending = true;
      document.getElementById('swap-dialog').classList.remove('hidden');
      return;
    }

    if (this.game.currentPlayer === this.aiPlayer && !this.game.gameOver) {
      setTimeout(() => this._aiTurn(), 50);
    }
  }

  _doSwap(yes) {
    document.getElementById('swap-dialog').classList.add('hidden');
    this.swapPending = false;
    if (yes) {
      this.game.swap();
      // Swap sides
      [this.humanPlayer, this.aiPlayer] = [this.aiPlayer, this.humanPlayer];
    } else {
      this.game.declineSwap();
    }
    this._updateStatus();
    this._redraw();

    if (this.game.currentPlayer === this.aiPlayer && !this.game.gameOver) {
      setTimeout(() => this._aiTurn(), 50);
    }
  }

  _aiTurn() {
    if (this.game.gameOver || this.game.currentPlayer !== this.aiPlayer) return;
    this.thinking = true;
    this._updateStatus();
    this._redraw();

    setTimeout(() => {
      const isFirst = this.game.isFirstMove();
      const moves = getAIMove(this.game.board, isFirst, this.difficulty);
      this.lastMoves = [];

      for (const [r, c] of moves) {
        if (this.game.gameOver) break;
        const result = this.game.place(r, c);
        this.lastMoves.push([r, c]);
        if (result.win) {
          this.thinking = false;
          this._updateStatus();
          this._redraw();
          this._showResult(result.win === this.humanPlayer ? 'win' : 'lose');
          return;
        }
        if (result.needSwap) {
          // AI decides to swap if it's losing
          const sc = evaluate(this.game.board);
          const shouldSwap = (this.aiPlayer === WHITE && sc < -500) || (this.aiPlayer === BLACK && sc > 500);
          if (shouldSwap) {
            this.game.swap();
            [this.humanPlayer, this.aiPlayer] = [this.aiPlayer, this.humanPlayer];
          } else {
            this.game.declineSwap();
          }
        }
      }

      this.thinking = false;
      this._updateStatus();
      this._redraw();

      // Check if human needs to act (swap dialog) — already handled inside place()
    }, 20);
  }

  newGame() {
    this.game.reset();
    this.lastMoves = [];
    this.hoverCell = null;
    this.thinking = false;
    this.swapPending = false;
    document.getElementById('swap-dialog').classList.add('hidden');
    document.getElementById('result-banner').classList.add('hidden');
    this._updateStatus();
    this._redraw();

    if (this.humanPlayer === WHITE) {
      // AI (black) goes first
      setTimeout(() => this._aiTurn(), 100);
    }
  }

  _updateStatus() {
    const statusEl = document.getElementById('status-text');
    const dotEl = document.getElementById('status-dot');

    if (this.game.gameOver) {
      statusEl.textContent = this.game.winner === this.humanPlayer ? '你赢了！' : 'AI 获胜！';
      dotEl.className = 'status-dot ' + (this.game.winner === BLACK ? 'black' : 'white');
      return;
    }

    if (this.thinking) {
      statusEl.textContent = 'AI 思考中…';
      dotEl.className = 'status-dot thinking';
      return;
    }

    const isHuman = this.game.currentPlayer === this.humanPlayer;
    const left = this.game.getStonesLeft();
    const colorName = this.game.currentPlayer === BLACK ? '黑方' : '白方';

    if (isHuman) {
      statusEl.textContent = `你的回合（${colorName}），还需落 ${left} 子`;
    } else {
      statusEl.textContent = `AI 回合（${colorName}）`;
    }
    dotEl.className = 'status-dot ' + (this.game.currentPlayer === BLACK ? 'black' : 'white');

    // stone counters
    const stones = { [BLACK]: 0, [WHITE]: 0 };
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++)
        if (this.game.board[r][c]) stones[this.game.board[r][c]]++;
    document.getElementById('count-black').textContent = stones[BLACK];
    document.getElementById('count-white').textContent = stones[WHITE];
  }

  _showResult(outcome) {
    const banner = document.getElementById('result-banner');
    const title = document.getElementById('result-title');
    const sub = document.getElementById('result-sub');
    banner.classList.remove('hidden', 'win', 'lose');
    if (outcome === 'win') {
      banner.classList.add('win');
      title.textContent = '你赢了！🎉';
      sub.textContent = '恭喜，你击败了 AI！';
    } else {
      banner.classList.add('lose');
      title.textContent = 'AI 获胜 🤖';
      sub.textContent = '再接再厉，挑战更高难度！';
    }
    banner.classList.remove('hidden');
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._ctrl = new Connect6Controller();
});
