/**
 * Backend server for the Sudoku + Ultimate TicTacToe mashup.
 *
 * Why a backend?
 * - Central authority for rules: prevents “cheating” by editing frontend code.
 * - Clean place to implement validation and game logic.
 * - Lets you add a database later (stretch option) without rewriting everything.
 */

const express = require("express");
const cors = require("cors");
const { z } = require("zod");

const app = express();
app.use(cors()); // allows React dev server (different port) to call this API
app.use(express.json()); // parse JSON request bodies

/**
 * We keep game state in memory for now.
 * Why: fastest way to get something working.
 * Later: you can move this to a DB (stretch) or file storage.
 */
let game = createNewGame();

/**
 * Zod schema = Stretch Challenge (JS library).
 * Why: It gives reliable, readable input validation with good error messages.
 */
const moveSchema = z.object({
  // row/col are zero-based indexes (0..8) used throughout server logic
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(8),
  // value is the Sudoku number 1..9
  value: z.number().int().min(1).max(9),
});

/** Health endpoint (good for debugging) */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/** Get current game state */
app.get("/api/state", (req, res) => {
  // include a convenience `numbersUsed` read-only value for clients
  const totalLeft = Object.values(game.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
  const numbersUsed = 81 - totalLeft;
  const out = structuredClone(game);
  out.numbersUsed = numbersUsed;
  res.json(out);
});

/**
 * Make a move.
 * Frontend sends {row, col, value}.
 * Backend validates and either:
 * - applies the move and returns updated state, or
 * - returns error + unchanged state
 */
app.post("/api/move", (req, res) => {
  // 1) Validate payload shape (row/col/value)
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      error: "Invalid payload. row/col must be A-I and value must be 1-9.",
      details: parsed.error.issues,
      game,
    });
  }

  const { row, col, value } = parsed.data;

  // 2) Apply game rules
  const result = tryApplyMove(game, row, col, value);

  if (!result.ok) {
    return res.status(400).json({
      ok: false,
      error: result.error,
      game, // return current state so UI stays in sync
    });
  }

  // 3) If move worked, update game and return it
  game = result.game;
  // include numbersUsed for convenience
  const totalLeft = Object.values(game.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
  game.numbersUsed = 81 - totalLeft;
  return res.json({ ok: true, game });
});

/** Reset game (useful during dev/testing) */
app.post("/api/reset", (req, res) => {
  game = createNewGame();
  // attach numbersUsed
  const totalLeft = Object.values(game.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
  game.numbersUsed = 81 - totalLeft;
  res.json({ ok: true, game });
});

/** Regenerate current player's hand by returning old numbers to the pool and drawing new ones.
 * This is only allowed after 45 numbers have been used by both players combined.
 */
app.post("/api/regenerate", (req, res) => {
  const totalLeft = Object.values(game.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
  const numbersUsed = 81 - totalLeft;
  if (numbersUsed < 45) {
    return res.status(400).json({ ok: false, error: "Regenerate allowed after 45 numbers have been used.", game });
  }

  const player = game.currentPlayer;

  // Return current hand numbers back into the pool (only non-null slots)
  for (const v of game.hands[player]) {
    if (v != null) {
      game.poolCounts[v] = (game.poolCounts[v] || 0) + 1;
    }
  }

  // Draw a fresh hand for the player
  game.hands[player] = drawHand(game.poolCounts);

  // Recompute numbersUsed and attach for convenience
  const totalLeftAfter = Object.values(game.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
  game.numbersUsed = 81 - totalLeftAfter;

  return res.json({ ok: true, game });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

/* ------------------ Game Logic (starter version) ------------------ */

/**
 * Game state design (simple but expandable):
 * - board: 9x9 of cells; each cell is null or {player: "A"|"B", value: 1..9}
 * - currentPlayer: "A" or "B"
 * - forcedBoard: null or { br: 0..2, bc: 0..2 } meaning the next move must be inside that local 3x3
 * - hands: each player has 3 random numbers (1..9) they are allowed to play
 */
function createNewGame() {
  // Initialize a pool of available numbers (1..9 each available 9 times)
  const poolCounts = createPoolCounts();

  return {
    board: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null)),
    currentPlayer: "A",
    forcedBoard: null, // null means you can play anywhere
    // draw initial hands while consuming from the pool
    hands: {
      A: drawHand(poolCounts),
      B: drawHand(poolCounts),
    },
    // expose the pool on the game state so subsequent draws use it
    poolCounts,
    scores: { A: 0, B: 0 },
    lastMove: null,
  };
}

/** Create initial pool with 9 copies of each number 1..9 */
function createPoolCounts() {
  const p = {};
  for (let n = 1; n <= 9; n++) p[n] = 9;
  return p;
}

/** Draw a single number from the pool using weighted sampling by remaining counts.
 * Returns the number (1..9) or null if pool exhausted.
 * Decrements the pool count for the drawn number.
 */
function drawFromPool(pool) {
  let total = 0;
  for (let n = 1; n <= 9; n++) total += pool[n] || 0;
  if (total <= 0) return null;

  let r = Math.floor(Math.random() * total) + 1;
  for (let n = 1; n <= 9; n++) {
    const cnt = pool[n] || 0;
    if (r <= cnt) {
      pool[n] = cnt - 1;
      return n;
    }
    r -= cnt;
  }
  return null;
}

/** Draw a hand of up to 3 numbers from the pool. If pool runs out, hand slots may be null. */
function drawHand(pool) {
  const hand = [];
  for (let i = 0; i < 3; i++) {
    hand.push(drawFromPool(pool));
  }
  return hand;
}

/**
 * Try to apply a move. Returns {ok, error? , game?}
 */
function tryApplyMove(gameState, row, col, value) {
  const g = structuredClone(gameState);

  // Rule: must play in forced local board (if set)
  if (g.forcedBoard) {
    const { br, bc } = g.forcedBoard; // big-row/big-col (0..2)
    const rMin = br * 3;
    const cMin = bc * 3;
    const inForced =
      row >= rMin && row < rMin + 3 &&
      col >= cMin && col < cMin + 3;

    if (!inForced) {
      return { ok: false, error: `You must play inside forced board (${br}, ${bc}).` };
    }
  }

  // Rule: cell must be empty
  if (g.board[row][col] !== null) {
    return { ok: false, error: "That cell is already filled." };
  }

  // Rule: number must be in current player's hand (your “3 random numbers”)
  const hand = g.hands[g.currentPlayer];
  const idx = hand.indexOf(value);
  if (idx === -1) {
    return { ok: false, error: `You can only play one of your available numbers: [${hand.join(", ")}].` };
  }

  // Rule: Sudoku validity (no repeats in row/col/3x3)
  if (!isSudokuMoveLegal(g.board, row, col, value)) {
    return { ok: false, error: "Invalid Sudoku move (duplicate in row/column/box)." };
  }

  // Apply move
  g.board[row][col] = { player: g.currentPlayer, value };
  g.lastMove = { player: g.currentPlayer, row, col, value };

  // Replace used hand value with a new random number
  // draw replacement from the shared pool (may be null if pool exhausted)
  g.hands[g.currentPlayer][idx] = drawFromPool(g.poolCounts);

  // Forced-board update:
  // Your move inside local board (row%3, col%3) dictates next big board.
  const nextBr = row % 3;
  const nextBc = col % 3;

  // In your rules, there’s no “board won/closed” concept; forced board always applies.
  g.forcedBoard = { br: nextBr, bc: nextBc };

  // Switch turn
  g.currentPlayer = g.currentPlayer === "A" ? "B" : "A";

  // Update scores (starter: compute from scratch; later you can optimize)
  g.scores = computeScores(g.board);

  return { ok: true, game: g };
}

/**
 * Sudoku legality check:
 * - no same value in row
 * - no same value in col
 * - no same value in 3x3 box
 */
function isSudokuMoveLegal(board, row, col, value) {
  // check row
  for (let c = 0; c < 9; c++) {
    if (board[row][c]?.value === value) return false;
  }
  // check col
  for (let r = 0; r < 9; r++) {
    if (board[r][col]?.value === value) return false;
  }
  // check 3x3 box
  const r0 = Math.floor(row / 3) * 3;
  const c0 = Math.floor(col / 3) * 3;
  for (let r = r0; r < r0 + 3; r++) {
    for (let c = c0; c < c0 + 3; c++) {
      if (board[r][c]?.value === value) return false;
    }
  }
  return true;
}

/**
 * Scoring:
 * - Each row and column worth 2 points
 * - Each 3x3 box worth 4 points
 * Winner of a region is the player with MORE cells in that region.
 * Ties give 0.
 *
 * Note: This uses "ownership by count" not value-based; matches what you described.
 */
function computeScores(board) {
  const scores = { A: 0, B: 0 };

  // Rows (2 points each)
  for (let r = 0; r < 9; r++) {
    const winner = regionWinner(getRow(board, r));
    if (winner) scores[winner] += 2;
  }

  // Cols (2 points each)
  for (let c = 0; c < 9; c++) {
    const winner = regionWinner(getCol(board, c));
    if (winner) scores[winner] += 2;
  }

  // Boxes (4 points each)
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells = getBox(board, br, bc);
      const winner = regionWinner(cells);
      if (winner) scores[winner] += 4;
    }
  }

  return scores;
}

function getRow(board, r) {
  return board[r];
}
function getCol(board, c) {
  return board.map(row => row[c]);
}
function getBox(board, br, bc) {
  const r0 = br * 3;
  const c0 = bc * 3;
  const cells = [];
  for (let r = r0; r < r0 + 3; r++) {
    for (let c = c0; c < c0 + 3; c++) {
      cells.push(board[r][c]);
    }
  }
  return cells;
}

function regionWinner(cells) {
  let countA = 0, countB = 0;
  for (const cell of cells) {
    if (!cell) continue;
    if (cell.player === "A") countA++;
    if (cell.player === "B") countB++;
  }
  if (countA === countB) return null;
  return countA > countB ? "A" : "B";
}
// End of server/index.js