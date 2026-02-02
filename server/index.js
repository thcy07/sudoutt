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
  row: z.number().int().min(0).max(8),
  col: z.number().int().min(0).max(8),
  value: z.number().int().min(1).max(9),
});

/** Health endpoint (good for debugging) */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/** Get current game state */
app.get("/api/state", (req, res) => {
  res.json(game);
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
      error: "Invalid payload. row/col must be 0-8 and value must be 1-9.",
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
  return res.json({ ok: true, game });
});

/** Reset game (useful during dev/testing) */
app.post("/api/reset", (req, res) => {
  game = createNewGame();
  res.json({ ok: true, game });
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
  return {
    board: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => null)),
    currentPlayer: "A",
    forcedBoard: null, // null means you can play anywhere
    hands: {
      A: drawHand(),
      B: drawHand(),
    },
    scores: { A: 0, B: 0 },
    lastMove: null,
  };
}

function drawHand() {
  // returns 3 random numbers from 1..9 (duplicates allowed unless you want otherwise)
  return [rand1to9(), rand1to9(), rand1to9()];
}

function rand1to9() {
  return Math.floor(Math.random() * 9) + 1;
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
  g.hands[g.currentPlayer][idx] = rand1to9();

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