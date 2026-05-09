// ─── Constants ───────────────────────────────────────────────────────────────
const BOARD_SIZE = 19;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

// ─── Board utilities ────────────────────────────────────────────────────────
function createBoard() {
  return Array.from({ length: BOARD_SIZE }, () => new Int8Array(BOARD_SIZE));
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
  if (!p) return 0;
  for (const [dr, dc] of DIRS) {
    const len = 1 + countDir(board, r, c, dr, dc, p) + countDir(board, r, c, -dr, -dc, p);
    if (len >= 6) return p;
  }
  return 0;
}

// ─── Candidate generation ────────────────────────────────────────────────────
function getCandidates(board, radius = 2) {
  const seen = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  const out = [];
  let any = false;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!board[r][c]) continue;
      any = true;
      const r0 = Math.max(0, r - radius), r1 = Math.min(BOARD_SIZE - 1, r + radius);
      const c0 = Math.max(0, c - radius), c1 = Math.min(BOARD_SIZE - 1, c + radius);
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          const k = rr * BOARD_SIZE + cc;
          if (!board[rr][cc] && !seen[k]) {
            seen[k] = 1;
            out.push([rr, cc]);
          }
        }
      }
    }
  }
  if (!any) {
    const mid = (BOARD_SIZE - 1) >> 1;
    return [[mid, mid]];
  }
  return out;
}

// ─── Pattern scoring ────────────────────────────────────────────────────────
function patternScore(len, opens) {
  if (len >= 6) return 1_000_000;
  if (opens === 0) return 0;
  if (len === 5) return opens === 2 ? 200_000 : 80_000;
  if (len === 4) return opens === 2 ? 30_000  : 800;
  if (len === 3) return opens === 2 ? 500    : 60;
  if (len === 2) return opens === 2 ? 50     : 8;
  return opens === 2 ? 5 : 1;
}

function scoreCell(board, r, c, player) {
  let s = 0;
  for (const [dr, dc] of DIRS) {
    const fwd = countDir(board, r, c, dr, dc, player);
    const bwd = countDir(board, r, c, -dr, -dc, player);
    const len = 1 + fwd + bwd;
    if (len >= 6) { s += 1_000_000; continue; }
    const bR = r - dr * (bwd + 1), bC = c - dc * (bwd + 1);
    const eR = r + dr * (fwd + 1), eC = c + dc * (fwd + 1);
    const openB = bR >= 0 && bR < BOARD_SIZE && bC >= 0 && bC < BOARD_SIZE && !board[bR][bC];
    const openE = eR >= 0 && eR < BOARD_SIZE && eC >= 0 && eC < BOARD_SIZE && !board[eR][eC];
    s += patternScore(len, (openB ? 1 : 0) + (openE ? 1 : 0));
  }
  return s;
}

function evaluate(board) {
  // From WHITE's perspective: positive = white good
  let w = 0, b = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const p = board[r][c];
      if (!p) continue;
      const s = scoreCell(board, r, c, p);
      if (p === WHITE) w += s; else b += s;
    }
  }
  return w - b;
}

function sortedCandidates(board, player, n = 14) {
  const cands = getCandidates(board);
  const opp = 3 - player;
  const scored = cands.map(([r, c]) => {
    board[r][c] = player;
    const own = scoreCell(board, r, c, player);
    board[r][c] = opp;
    const def = scoreCell(board, r, c, opp);
    board[r][c] = EMPTY;
    return { r, c, s: own + def * 0.95 };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(x => [x.r, x.c]);
}

// ─── Negamax (1 stone per ply) ──────────────────────────────────────────────
// stonesLeft = how many more stones `player` places this turn (1 or 2)
function negamax(board, depth, alpha, beta, player, stonesLeft) {
  if (depth <= 0) {
    const e = evaluate(board);
    return player === WHITE ? e : -e;
  }
  const branchN = depth >= 4 ? 7 : depth >= 2 ? 9 : 11;
  const cands = sortedCandidates(board, player, branchN);
  let best = -Infinity;

  for (const [r, c] of cands) {
    board[r][c] = player;
    const won = checkWinAt(board, r, c);
    let score;
    if (won) {
      score = 900_000 + depth * 1000;
    } else if (stonesLeft > 1) {
      score = negamax(board, depth - 1, alpha, beta, player, stonesLeft - 1);
    } else {
      score = -negamax(board, depth - 1, -beta, -alpha, 3 - player, 2);
    }
    board[r][c] = EMPTY;

    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best === -Infinity ? 0 : best;
}

// Returns array of [r,c] stones to place this turn
function getAIMove(board, aiPlayer, difficulty, stonesToPlace) {
  if (stonesToPlace === 1) {
    // First move of game — center (天元)
    const mid = (BOARD_SIZE - 1) >> 1;
    if (!board[mid][mid]) return [[mid, mid]];
    return [sortedCandidates(board, aiPlayer, 1)[0]];
  }

  const opp = 3 - aiPlayer;
  const plyDepth = { easy: 2, medium: 4, hard: 6 }[difficulty] ?? 4;
  const cands = sortedCandidates(board, aiPlayer, 18);

  // 1. Immediate one-stone win for AI
  for (const [r, c] of cands) {
    board[r][c] = aiPlayer;
    if (checkWinAt(board, r, c)) {
      board[r][c] = EMPTY;
      const second = cands.find(([rr, cc]) => rr !== r || cc !== c) || [r, c];
      return [[r, c], second];
    }
    board[r][c] = EMPTY;
  }

  // 2. Block opponent's immediate one-stone win
  const oppWins = [];
  for (const [r, c] of cands) {
    board[r][c] = opp;
    if (checkWinAt(board, r, c)) oppWins.push([r, c]);
    board[r][c] = EMPTY;
  }
  if (oppWins.length >= 2) {
    // can only block 2; if opponent has >2, we lose; just block first 2
    return [oppWins[0], oppWins[1]];
  }
  if (oppWins.length === 1) {
    // Block + best secondary move
    const [br, bc] = oppWins[0];
    board[br][bc] = aiPlayer;
    // Pick best second move
    let bestS = -Infinity, bestM = null;
    const secCands = sortedCandidates(board, aiPlayer, 14);
    for (const [r, c] of secCands) {
      if (r === br && c === bc) continue;
      board[r][c] = aiPlayer;
      const sc = (aiPlayer === WHITE ? 1 : -1) * evaluate(board);
      if (sc > bestS) { bestS = sc; bestM = [r, c]; }
      board[r][c] = EMPTY;
    }
    board[br][bc] = EMPTY;
    return [[br, bc], bestM || secCands[0]];
  }

  // 3. Two-stone winning combo for AI
  for (let i = 0; i < cands.length; i++) {
    const [r1, c1] = cands[i];
    board[r1][c1] = aiPlayer;
    if (checkWinAt(board, r1, c1)) {
      board[r1][c1] = EMPTY;
      const second = cands.find(([rr, cc]) => rr !== r1 || cc !== c1) || [r1, c1];
      return [[r1, c1], second];
    }
    for (let j = i + 1; j < cands.length; j++) {
      const [r2, c2] = cands[j];
      if (board[r2][c2]) continue;
      board[r2][c2] = aiPlayer;
      if (checkWinAt(board, r2, c2) || checkWinAt(board, r1, c1)) {
        board[r1][c1] = EMPTY;
        board[r2][c2] = EMPTY;
        return [[r1, c1], [r2, c2]];
      }
      board[r2][c2] = EMPTY;
    }
    board[r1][c1] = EMPTY;
  }

  // 4. Search for best pair via negamax
  const top = cands.slice(0, plyDepth >= 6 ? 9 : plyDepth >= 4 ? 11 : 13);
  let bestScore = -Infinity;
  let bestPair = top.length >= 2 ? [top[0], top[1]] : [top[0], top[0]];

  for (let i = 0; i < top.length; i++) {
    const [r1, c1] = top[i];
    board[r1][c1] = aiPlayer;
    for (let j = 0; j < top.length; j++) {
      if (i === j) continue;
      const [r2, c2] = top[j];
      if (board[r2][c2]) continue;
      board[r2][c2] = aiPlayer;
      const score = -negamax(board, plyDepth - 2, -Infinity, Infinity, opp, 2);
      board[r2][c2] = EMPTY;
      if (score > bestScore) {
        bestScore = score;
        bestPair = [[r1, c1], [r2, c2]];
      }
    }
    board[r1][c1] = EMPTY;
  }
  return bestPair;
}

// ─── Game state machine ─────────────────────────────────────────────────────
class Connect6Game {
  constructor() { this.reset(); }

  reset() {
    this.board = createBoard();
    this.currentPlayer = BLACK;
    this.moveCount = 0;        // completed turns
    this.stonesThisTurn = 0;
    this.gameOver = false;
    this.winner = 0;
    this.history = [];
    this.swapAvailable = false;
    this.swapUsed = false;
  }

  getStonesRequired() {
    return this.moveCount === 0 ? 1 : 2;  // 黑方第一回合 1 子，之后均为 2 子
  }

  getStonesLeft() {
    return this.getStonesRequired() - this.stonesThisTurn;
  }

  countStones() {
    let b = 0, w = 0;
    for (let r = 0; r < BOARD_SIZE; r++)
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (this.board[r][c] === BLACK) b++;
        else if (this.board[r][c] === WHITE) w++;
      }
    return { black: b, white: w };
  }

  // returns { ok, win, turnEnded, needSwap }
  place(r, c) {
    if (this.gameOver) return { ok: false };
    if (this.swapAvailable) return { ok: false };  // must resolve swap first
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return { ok: false };
    if (this.board[r][c]) return { ok: false };

    this.board[r][c] = this.currentPlayer;
    this.history.push({ r, c, player: this.currentPlayer });
    this.stonesThisTurn++;

    const win = checkWinAt(this.board, r, c);
    if (win) {
      this.gameOver = true;
      this.winner = win;
      return { ok: true, win };
    }

    if (this.stonesThisTurn >= this.getStonesRequired()) {
      this.moveCount++;
      this.stonesThisTurn = 0;
      this.currentPlayer = 3 - this.currentPlayer;
      const res = { ok: true, turnEnded: true };
      // 三手换色: after move 3 (黑1+白2+黑3)
      if (this.moveCount === 3 && !this.swapUsed) {
        this.swapAvailable = true;
        res.needSwap = true;
      }
      return res;
    }
    return { ok: true };
  }

  swap() {
    if (!this.swapAvailable) return false;
    this.swapAvailable = false;
    this.swapUsed = true;
    return true;
  }

  declineSwap() {
    if (!this.swapAvailable) return false;
    this.swapAvailable = false;
    this.swapUsed = true;
    return true;
  }
}

// ─── Renderer ───────────────────────────────────────────────────────────────
class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cellSize = 0;
    this.padding = 0;
  }

  resize(w, h) {
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(w, h);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const usable = size * 0.92;
    this.cellSize = usable / (BOARD_SIZE - 1);
    this.padding = (size - usable) / 2;
    this._cssSize = size;
  }

  toPixel(idx) { return this.padding + idx * this.cellSize; }
  toCell(px)   { return Math.round((px - this.padding) / this.cellSize); }

  draw(board, lastMoves = [], hoverCell = null, currentPlayer = BLACK) {
    const { ctx } = this;
    const S = this._cssSize;
    ctx.clearRect(0, 0, S, S);
    this._drawBoard(S);
    this._drawStars();
    this._drawStones(board, lastMoves);
    if (hoverCell && !board[hoverCell[0]][hoverCell[1]]) {
      this._drawHover(hoverCell[0], hoverCell[1], currentPlayer);
    }
  }

  _drawBoard(S) {
    const { ctx } = this;
    const grad = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.75);
    grad.addColorStop(0, '#dcb066');
    grad.addColorStop(1, '#b8832a');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, S, S, 12); else ctx.rect(0, 0, S, S);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < BOARD_SIZE; i++) {
      const p = this.toPixel(i);
      ctx.beginPath(); ctx.moveTo(this.toPixel(0), p); ctx.lineTo(this.toPixel(BOARD_SIZE - 1), p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, this.toPixel(0)); ctx.lineTo(p, this.toPixel(BOARD_SIZE - 1)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    const a = this.toPixel(0), b = this.toPixel(BOARD_SIZE - 1);
    ctx.strokeRect(a, a, b - a, b - a);
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
        this._drawStone(r, c, board[r][c], lastSet.has(r * BOARD_SIZE + c));
      }
    }
  }

  _drawStone(r, c, player, highlight = false) {
    const { ctx } = this;
    const x = this.toPixel(c), y = this.toPixel(r);
    const rad = this.cellSize * 0.46;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = rad * 0.5;
    ctx.shadowOffsetX = rad * 0.12;
    ctx.shadowOffsetY = rad * 0.18;

    const isBlack = player === BLACK;
    const grad = ctx.createRadialGradient(
      x - rad * 0.3, y - rad * 0.35, rad * 0.08,
      x, y, rad
    );
    if (isBlack) {
      grad.addColorStop(0, '#666');
      grad.addColorStop(0.35, '#2a2a2a');
      grad.addColorStop(1, '#000');
    } else {
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.55, '#e8e8e8');
      grad.addColorStop(1, '#bdbdbd');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (highlight) {
      ctx.strokeStyle = isBlack ? '#ff4d4d' : '#cc0000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, rad * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  _drawHover(r, c, player) {
    const { ctx } = this;
    const x = this.toPixel(c), y = this.toPixel(r);
    const rad = this.cellSize * 0.46;
    ctx.save();
    ctx.globalAlpha = 0.42;
    const isBlack = player === BLACK;
    ctx.fillStyle = isBlack ? '#222' : '#f0f0f0';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  coordFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const c = this.toCell(px);
    const r = this.toCell(py);
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return null;
    return [r, c];
  }
}

// ─── Controller ─────────────────────────────────────────────────────────────
class Connect6Controller {
  constructor() {
    this.game = new Connect6Game();
    this.canvas = document.getElementById('board');
    this.renderer = new BoardRenderer(this.canvas);
    this.humanPlayer = BLACK;
    this.aiPlayer = WHITE;
    this.difficulty = 'medium';
    this.thinking = false;
    this.swapDialogOpen = false;
    this.hoverCell = null;
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
    const showHover = !this.game.gameOver && !this.thinking && !this.swapDialogOpen
      && this.game.currentPlayer === this.humanPlayer;
    this.renderer.draw(
      this.game.board, this.lastMoves,
      showHover ? this.hoverCell : null,
      this.game.currentPlayer
    );
  }

  _bindUI() {
    document.getElementById('btn-new').addEventListener('click', () => this.newGame());
    document.getElementById('btn-swap-yes').addEventListener('click', () => this._onHumanSwapDecision(true));
    document.getElementById('btn-swap-no').addEventListener('click', () => this._onHumanSwapDecision(false));

    document.querySelectorAll('.side-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.humanPlayer = btn.dataset.side === 'black' ? BLACK : WHITE;
        this.aiPlayer = 3 - this.humanPlayer;
        this.newGame();
      });
    });
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff;
      });
    });
  }

  _bindCanvas() {
    this.canvas.addEventListener('mousemove', e => {
      const cell = this.renderer.coordFromEvent(e);
      const ja = JSON.stringify(cell), jb = JSON.stringify(this.hoverCell);
      this.hoverCell = cell;
      if (ja !== jb) this._redraw();
    });
    this.canvas.addEventListener('mouseleave', () => {
      this.hoverCell = null;
      this._redraw();
    });
    this.canvas.addEventListener('click', e => this._handleCanvasInput(e));
    this.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this._handleCanvasInput(t);
    });
  }

  _handleCanvasInput(e) {
    if (this.game.gameOver || this.thinking || this.swapDialogOpen) return;
    if (this.game.currentPlayer !== this.humanPlayer) return;
    const cell = this.renderer.coordFromEvent(e);
    if (cell) this._humanPlace(cell[0], cell[1]);
  }

  _humanPlace(r, c) {
    // Reset highlights at start of a new turn
    if (this.game.stonesThisTurn === 0) this.lastMoves = [];

    const result = this.game.place(r, c);
    if (!result.ok) return;

    this.lastMoves.push([r, c]);
    this._updateStatus();
    this._redraw();

    if (result.win) { this._showResult(result.win === this.humanPlayer); return; }

    if (result.needSwap) {
      // After move 3, white decides. Who is white?
      if (this.humanPlayer === WHITE) {
        this._showSwapDialog();
      } else {
        setTimeout(() => this._aiSwapDecision(), 600);
      }
      return;
    }

    if (result.turnEnded) {
      setTimeout(() => this._aiTurn(), 120);
    }
  }

  _aiTurn() {
    if (this.game.gameOver || this.swapDialogOpen) return;
    if (this.game.currentPlayer !== this.aiPlayer) return;

    this.thinking = true;
    this.lastMoves = [];
    this._updateStatus();
    this._redraw();

    setTimeout(() => {
      const stones = this.game.getStonesLeft();
      const moves = getAIMove(this.game.board, this.aiPlayer, this.difficulty, stones);
      this._placeAIStones(moves, 0);
    }, 60);
  }

  _placeAIStones(moves, idx) {
    if (idx >= moves.length) {
      this.thinking = false;
      this._updateStatus();
      this._redraw();
      // Safety: if AI still needs to place more (shouldn't normally happen)
      if (this.game.currentPlayer === this.aiPlayer && !this.game.gameOver) {
        setTimeout(() => this._aiTurn(), 80);
      }
      return;
    }

    const [r, c] = moves[idx];
    const result = this.game.place(r, c);
    if (!result.ok) {
      this.thinking = false;
      this._updateStatus();
      this._redraw();
      return;
    }

    this.lastMoves.push([r, c]);
    this._updateStatus();
    this._redraw();

    if (result.win) {
      this.thinking = false;
      setTimeout(() => this._showResult(result.win === this.humanPlayer), 250);
      return;
    }

    if (result.needSwap) {
      this.thinking = false;
      this._updateStatus();
      this._redraw();
      // White decides. AI just finished move 3 as black (means human is WHITE).
      if (this.humanPlayer === WHITE) {
        setTimeout(() => this._showSwapDialog(), 350);
      } else {
        setTimeout(() => this._aiSwapDecision(), 500);
      }
      return;
    }

    setTimeout(() => this._placeAIStones(moves, idx + 1), 280);
  }

  _showSwapDialog() {
    this.swapDialogOpen = true;
    document.getElementById('swap-dialog').classList.remove('hidden');
    this._updateStatus();
  }

  _onHumanSwapDecision(yes) {
    document.getElementById('swap-dialog').classList.add('hidden');
    this.swapDialogOpen = false;
    if (yes) {
      this.game.swap();
      [this.humanPlayer, this.aiPlayer] = [this.aiPlayer, this.humanPlayer];
      this._updateSideButtons();
    } else {
      this.game.declineSwap();
    }
    this._updateStatus();
    this._redraw();
    if (this.game.currentPlayer === this.aiPlayer && !this.game.gameOver) {
      setTimeout(() => this._aiTurn(), 250);
    }
  }

  _aiSwapDecision() {
    const sc = evaluate(this.game.board);
    const aiAdvantage = (this.aiPlayer === WHITE) ? sc : -sc;
    const shouldSwap = aiAdvantage < -300;

    if (shouldSwap) {
      this.game.swap();
      [this.humanPlayer, this.aiPlayer] = [this.aiPlayer, this.humanPlayer];
      this._updateSideButtons();
    } else {
      this.game.declineSwap();
    }
    this._updateStatus();
    this._redraw();

    this._showAINotice(shouldSwap ? '对方选择换色' : '对方选择不换色',
      shouldSwap ? '双方阵营互换，你已转为白方。' : 'AI 继续执白，请你继续行棋。',
      () => {
        if (this.game.currentPlayer === this.aiPlayer && !this.game.gameOver) {
          setTimeout(() => this._aiTurn(), 200);
        }
      });
  }

  _showAINotice(title, sub, onClose) {
    const dlg = document.getElementById('ai-notice-dialog');
    document.getElementById('ai-notice-title').textContent = title;
    document.getElementById('ai-notice-sub').textContent = sub;
    dlg.classList.remove('hidden');
    const btn = document.getElementById('btn-ai-notice-ok');
    const handler = () => {
      btn.removeEventListener('click', handler);
      dlg.classList.add('hidden');
      if (onClose) onClose();
    };
    btn.addEventListener('click', handler);
  }

  _updateSideButtons() {
    document.querySelectorAll('.side-btn').forEach(b => {
      b.classList.toggle('active',
        (b.dataset.side === 'black' && this.humanPlayer === BLACK) ||
        (b.dataset.side === 'white' && this.humanPlayer === WHITE));
    });
  }

  newGame() {
    this.game.reset();
    this.lastMoves = [];
    this.hoverCell = null;
    this.thinking = false;
    this.swapDialogOpen = false;
    document.getElementById('swap-dialog').classList.add('hidden');
    document.getElementById('result-banner').classList.add('hidden');
    this._updateSideButtons();
    this._updateStatus();
    this._redraw();
    if (this.game.currentPlayer === this.aiPlayer && !this.game.gameOver) {
      setTimeout(() => this._aiTurn(), 350);
    }
  }

  _updateStatus() {
    const statusEl = document.getElementById('status-text');
    const dotEl = document.getElementById('status-dot');

    if (this.game.gameOver) {
      statusEl.textContent = this.game.winner === this.humanPlayer ? '你赢了！' : 'AI 获胜！';
      dotEl.className = 'status-dot ' + (this.game.winner === BLACK ? 'black' : 'white');
    } else if (this.thinking) {
      statusEl.textContent = 'AI 思考中…';
      dotEl.className = 'status-dot thinking';
    } else if (this.swapDialogOpen) {
      statusEl.textContent = '请决定是否换色';
      dotEl.className = 'status-dot ' + (this.game.currentPlayer === BLACK ? 'black' : 'white');
    } else {
      const isHuman = this.game.currentPlayer === this.humanPlayer;
      const left = this.game.getStonesLeft();
      const colorName = this.game.currentPlayer === BLACK ? '黑方' : '白方';
      if (isHuman) {
        statusEl.textContent = `轮到你（${colorName}），还需落 ${left} 子`;
      } else {
        statusEl.textContent = `AI 回合（${colorName}）`;
      }
      dotEl.className = 'status-dot ' + (this.game.currentPlayer === BLACK ? 'black' : 'white');
    }

    const counts = this.game.countStones();
    document.getElementById('count-black').textContent = counts.black;
    document.getElementById('count-white').textContent = counts.white;

    // Indicate which side human is now (after possible swap)
    const sideHint = document.getElementById('side-hint');
    if (sideHint) {
      sideHint.textContent = this.humanPlayer === BLACK ? '你执黑' : '你执白';
    }
  }

  _showResult(humanWon) {
    const banner = document.getElementById('result-banner');
    const title = document.getElementById('result-title');
    const sub = document.getElementById('result-sub');
    banner.classList.remove('hidden', 'win', 'lose');
    if (humanWon) {
      banner.classList.add('win');
      title.textContent = '你赢了！🎉';
      sub.textContent = '恭喜，你击败了 AI！';
    } else {
      banner.classList.add('lose');
      title.textContent = 'AI 获胜 🤖';
      sub.textContent = '再接再厉，挑战更高难度！';
    }
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  window._ctrl = new Connect6Controller();
});
