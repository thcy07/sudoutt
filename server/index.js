/**
 * SudoUTT Backend
 * - MongoDB via Mongoose (games + users collections)
 * - JWT authentication (signup / login)
 * - Multiplayer: create a game, share link, second player joins
 * - Polling endpoint for real-time sync (stretch: change streams)
 */

const express  = require("express");
const cors     = require("cors");
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const { z }    = require("zod");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// ─── Env / config ────────────────────────────────────────────────
const PORT       = process.env.PORT       || 3001;
const MONGO_URI  = process.env.MONGO_URI  || "mongodb://localhost:27017/sudoutt";
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_in_prod";

// ─── MongoDB connection ───────────────────────────────────────────
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch(err => { console.error("MongoDB error:", err); process.exit(1); });

// ─── Schemas ─────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  username:     { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  createdAt:    { type: Date, default: Date.now },
});
const User = mongoose.model("User", userSchema);

const gameSchema = new mongoose.Schema({
  // Players: playerA is the creator, playerB joins via link (null until joined)
  playerA:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  playerB:       { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  playerAName:   { type: String, required: true },
  playerBName:   { type: String, default: null },

  // Game state (mirrors the in-memory structure)
  board:         { type: [[mongoose.Schema.Types.Mixed]], required: true },
  currentPlayer: { type: String, enum: ["A", "B"], default: "A" },
  forcedBoard:   { type: mongoose.Schema.Types.Mixed, default: null },
  hands:         { type: mongoose.Schema.Types.Mixed, required: true },
  poolCounts:    { type: mongoose.Schema.Types.Mixed, required: true },
  scores:        { type: mongoose.Schema.Types.Mixed, default: { A: 0, B: 0 } },
  lastMove:      { type: mongoose.Schema.Types.Mixed, default: null },
  numbersUsed:   { type: Number, default: 0 },

  // Status: "waiting" (no playerB yet), "active", "finished"
  status:        { type: String, enum: ["waiting", "active", "finished"], default: "waiting" },
  winner:        { type: String, default: null },

  createdAt:     { type: Date, default: Date.now },
  updatedAt:     { type: Date, default: Date.now },
});
const Game = mongoose.model("Game", gameSchema);

// ─── Middleware: verify JWT ───────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "No token provided." });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid or expired token." });
  }
}

// ─── Helper: attach numbersUsed to a plain game object ───────────
function withNumbersUsed(g) {
  const totalLeft = Object.values(g.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
  return { ...g, numbersUsed: 81 - totalLeft };
}

// Serialize a Mongoose game doc to plain JSON for the client
function serializeGame(doc) {
  const g = doc.toObject({ versionKey: false });
  g.id = g._id.toString();
  delete g._id;
  const totalLeft = Object.values(g.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
  g.numbersUsed = 81 - totalLeft;
  return g;
}

// ─── Auth routes ─────────────────────────────────────────────────

// POST /api/auth/signup
app.post("/api/auth/signup", async (req, res) => {
  const schema = z.object({
    username: z.string().min(2).max(30),
    password: z.string().min(4),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: parsed.error.issues[0].message });
  }
  const { username, password } = parsed.data;

  try {
    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ ok: false, error: "Username already taken." });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash });

    const token = jwt.sign({ userId: user._id.toString(), username }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({ ok: true, token, username });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: "Username and password required." });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) return res.status(401).json({ ok: false, error: "Invalid username or password." });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ ok: false, error: "Invalid username or password." });

    const token = jwt.sign({ userId: user._id.toString(), username }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({ ok: true, token, username });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// ─── Game routes ─────────────────────────────────────────────────

// POST /api/games — create a new game (creator = playerA)
app.post("/api/games", authMiddleware, async (req, res) => {
  try {
    const state = createNewGameState();
    const doc = await Game.create({
      playerA:     req.user.userId,
      playerAName: req.user.username,
      ...state,
    });
    return res.json({ ok: true, game: serializeGame(doc) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Could not create game." });
  }
});

// POST /api/games/:id/join — second player joins
app.post("/api/games/:id/join", authMiddleware, async (req, res) => {
  try {
    const doc = await Game.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Game not found." });
    if (doc.status !== "waiting") return res.status(400).json({ ok: false, error: "Game already started." });
    if (doc.playerA.toString() === req.user.userId) {
      return res.status(400).json({ ok: false, error: "You created this game — share the link with a friend." });
    }

    doc.playerB     = req.user.userId;
    doc.playerBName = req.user.username;
    doc.status      = "active";
    doc.updatedAt   = new Date();
    await doc.save();

    return res.json({ ok: true, game: serializeGame(doc) });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// GET /api/games/:id — get game state (polling endpoint)
app.get("/api/games/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Game.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Game not found." });
    return res.json({ ok: true, game: serializeGame(doc) });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// GET /api/games — list games for the logged-in user
app.get("/api/games", authMiddleware, async (req, res) => {
  try {
    const docs = await Game.find({
      $or: [{ playerA: req.user.userId }, { playerB: req.user.userId }],
    }).sort({ updatedAt: -1 }).limit(20);
    return res.json({ ok: true, games: docs.map(serializeGame) });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// POST /api/games/:id/move — make a move
const moveSchema = z.object({
  row:   z.number().int().min(0).max(8),
  col:   z.number().int().min(0).max(8),
  value: z.number().int().min(1).max(9),
});

app.post("/api/games/:id/move", authMiddleware, async (req, res) => {
  const parsed = moveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "Invalid move payload." });
  }
  const { row, col, value } = parsed.data;

  try {
    const doc = await Game.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Game not found." });
    if (doc.status !== "active") {
      return res.status(400).json({ ok: false, error: "Game is not active." });
    }

    // Verify it's this user's turn
    const isPlayerA = doc.playerA.toString() === req.user.userId;
    const isPlayerB = doc.playerB?.toString() === req.user.userId;
    if (!isPlayerA && !isPlayerB) {
      return res.status(403).json({ ok: false, error: "You are not in this game." });
    }
    const myLetter = isPlayerA ? "A" : "B";
    if (doc.currentPlayer !== myLetter) {
      return res.status(400).json({ ok: false, error: "It is not your turn." });
    }

    // Apply move to plain game state
    const state = {
      board: doc.board,
      currentPlayer: doc.currentPlayer,
      forcedBoard: doc.forcedBoard,
      hands: doc.hands,
      poolCounts: doc.poolCounts,
      scores: doc.scores,
      lastMove: doc.lastMove,
    };

    const result = tryApplyMove(state, row, col, value);
    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error, game: serializeGame(doc) });
    }

    // Write new state back
    const g = result.game;
    doc.board         = g.board;
    doc.currentPlayer = g.currentPlayer;
    doc.forcedBoard   = g.forcedBoard;
    doc.hands         = g.hands;
    doc.poolCounts    = g.poolCounts;
    doc.scores        = g.scores;
    doc.lastMove      = g.lastMove;
    doc.updatedAt     = new Date();

    // Check win condition (all 81 cells filled)
    const filled = g.board.flat().filter(Boolean).length;
    if (filled === 81) {
      doc.status = "finished";
      if (g.scores.A > g.scores.B) doc.winner = "A";
      else if (g.scores.B > g.scores.A) doc.winner = "B";
      else doc.winner = "draw";
    }

    await doc.save();
    return res.json({ ok: true, game: serializeGame(doc) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// POST /api/games/:id/regenerate
app.post("/api/games/:id/regenerate", authMiddleware, async (req, res) => {
  try {
    const doc = await Game.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Game not found." });

    const totalLeft = Object.values(doc.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
    const used = 81 - totalLeft;
    if (used < 45) {
      return res.status(400).json({ ok: false, error: "Regenerate allowed after 45 numbers used." });
    }

    const isA = doc.playerA.toString() === req.user.userId;
    const isB = doc.playerB?.toString() === req.user.userId;
    if (!isA && !isB) return res.status(403).json({ ok: false, error: "Not in this game." });

    const player = isA ? "A" : "B";
    if (doc.currentPlayer !== player) {
      return res.status(400).json({ ok: false, error: "Not your turn." });
    }

    const pool = { ...doc.poolCounts };
    for (const v of doc.hands[player]) {
      if (v != null) pool[v] = (pool[v] || 0) + 1;
    }
    const newHand = drawHand(pool);
    doc.hands = { ...doc.hands, [player]: newHand };
    doc.poolCounts = pool;
    doc.updatedAt = new Date();
    await doc.save();

    return res.json({ ok: true, game: serializeGame(doc) });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// DELETE /api/games/:id — delete a game (only creator can)
app.delete("/api/games/:id", authMiddleware, async (req, res) => {
  try {
    const doc = await Game.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Game not found." });
    if (doc.playerA.toString() !== req.user.userId) {
      return res.status(403).json({ ok: false, error: "Only the game creator can delete it." });
    }
    await doc.deleteOne();
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ ok: false, error: "Server error." });
  }
});

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));

// ─── Game logic (unchanged from original) ────────────────────────

function createNewGameState() {
  const poolCounts = createPoolCounts();
  return {
    board: Array.from({ length: 9 }, () => Array(9).fill(null)),
    currentPlayer: "A",
    forcedBoard: null,
    hands: { A: drawHand(poolCounts), B: drawHand(poolCounts) },
    poolCounts,
    scores: { A: 0, B: 0 },
    lastMove: null,
  };
}

function createPoolCounts() {
  const p = {};
  for (let n = 1; n <= 9; n++) p[n] = 9;
  return p;
}

function drawFromPool(pool) {
  let total = 0;
  for (let n = 1; n <= 9; n++) total += pool[n] || 0;
  if (total <= 0) return null;
  let r = Math.floor(Math.random() * total) + 1;
  for (let n = 1; n <= 9; n++) {
    const cnt = pool[n] || 0;
    if (r <= cnt) { pool[n] = cnt - 1; return n; }
    r -= cnt;
  }
  return null;
}

function drawHand(pool) {
  return [drawFromPool(pool), drawFromPool(pool), drawFromPool(pool)];
}

function tryApplyMove(gameState, row, col, value) {
  const g = JSON.parse(JSON.stringify(gameState));

  if (g.forcedBoard) {
    const { br, bc } = g.forcedBoard;
    const inForced = row >= br*3 && row < br*3+3 && col >= bc*3 && col < bc*3+3;
    if (!inForced) return { ok: false, error: `Must play inside board (${br},${bc}).` };
  }
  if (g.board[row][col] !== null) return { ok: false, error: "Cell already filled." };

  const hand = g.hands[g.currentPlayer];
  const idx = hand.indexOf(value);
  if (idx === -1) return { ok: false, error: `Play one of your numbers: [${hand.join(", ")}].` };
  if (!isSudokuMoveLegal(g.board, row, col, value)) {
    return { ok: false, error: "Duplicate in row, column, or box." };
  }

  g.board[row][col] = { player: g.currentPlayer, value };
  g.lastMove = { player: g.currentPlayer, row, col, value };
  g.hands[g.currentPlayer][idx] = drawFromPool(g.poolCounts);
  g.forcedBoard = { br: row % 3, bc: col % 3 };
  g.currentPlayer = g.currentPlayer === "A" ? "B" : "A";
  g.scores = computeScores(g.board);
  return { ok: true, game: g };
}

function isSudokuMoveLegal(board, row, col, value) {
  for (let c = 0; c < 9; c++) if (board[row][c]?.value === value) return false;
  for (let r = 0; r < 9; r++) if (board[r][col]?.value === value) return false;
  const r0 = Math.floor(row/3)*3, c0 = Math.floor(col/3)*3;
  for (let r = r0; r < r0+3; r++)
    for (let c = c0; c < c0+3; c++)
      if (board[r][c]?.value === value) return false;
  return true;
}

function computeScores(board) {
  const s = { A: 0, B: 0 };
  for (let r = 0; r < 9; r++) { const w = winner(board[r]); if (w) s[w] += 2; }
  for (let c = 0; c < 9; c++) { const w = winner(board.map(r => r[c])); if (w) s[w] += 2; }
  for (let br = 0; br < 3; br++)
    for (let bc = 0; bc < 3; bc++) {
      const cells = [];
      for (let r = br*3; r < br*3+3; r++)
        for (let c = bc*3; c < bc*3+3; c++) cells.push(board[r][c]);
      const w = winner(cells); if (w) s[w] += 4;
    }
  return s;
}

function winner(cells) {
  let a = 0, b = 0;
  for (const c of cells) { if (!c) continue; if (c.player==="A") a++; else b++; }
  return a === b ? null : a > b ? "A" : "B";
}