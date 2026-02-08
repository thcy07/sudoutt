import { useEffect, useState, useRef } from "react";
import "./App.css";
import logo from "./assets/sudoku_grid.png";

/*
  App.jsx

  Frontend React component for the SudoUTT game UI.
  Responsibilities:
  - Load the current game state from the backend on mount.
  - Render the 9×9 board and basic player info (scores, hand).
  - Provide a minimal form UI for submitting moves (row/col/value).
  - Expose a Reset button to restart the game (delegates to backend).

  Note: This file only contains presentation and lightweight validation.
  The authoritative game rules and validation live on the server.
*/

// Base URL for backend API calls. Keep in sync with the server port.
const API_BASE = "http://localhost:3001";

export default function App() {
  // `game` holds the entire game state received from the backend.
  // It is null while the initial state is being fetched.
  const [game, setGame] = useState(null);

  // `form` stores the user's move input in UI-friendly form:
  // - `row`: letter A-I
  // - `col`: number 1-9 (as string while typing)
  // - `value`: number 1-9 (as string while typing)
  const [form, setForm] = useState({ row: "", col: "", value: "" });

  // `error` displays any UI-level or backend validation messages.
  const [error, setError] = useState("");
  // Beginner-mode: allow clicking a cell and typing 1-9 to play
  const [beginnerMode, setBeginnerMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null); // {r,c} or null
  const valueInputRef = useRef(null);

  // Load initial game state when the component mounts.
  useEffect(() => {
    fetch(`${API_BASE}/api/state`)
      .then((r) => r.json())
      .then(setGame)
      .catch(() => setError("Could not connect to backend server."));
  }, []);

  // Focus the value input when a cell is selected in beginner mode
  useEffect(() => {
    if (selectedCell && valueInputRef.current) {
      valueInputRef.current.focus();
    }
  }, [selectedCell]);

  // Keyboard handler: when a cell is selected, typing 1-9 will play that value
  useEffect(() => {
    if (!selectedCell) return;
    function onKey(e) {
      if (/^[1-9]$/.test(e.key)) {
        const v = Number(e.key);
        playMove(selectedCell.r, selectedCell.c, v);
      } else if (e.key === "Escape") {
        setSelectedCell(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedCell]);

  // when beginnerMode is turned off, clear manual form and selection
  useEffect(() => {
    if (!beginnerMode) {
      setSelectedCell(null);
      setForm({ row: "", col: "", value: "" });
    }
  }, [beginnerMode]);

  // Helper: Convert a UI row letter (A-I) to a zero-based index (0-8).
  // Returns `null` for invalid values so callers can detect bad input.
  function rowLetterToIndex(letter) {
    if (!letter || typeof letter !== "string") return null;
    const ch = letter.trim().toUpperCase();
    if (ch.length !== 1) return null;
    const code = ch.charCodeAt(0);
    const idx = code - 65; // 'A' = 65
    return idx >= 0 && idx <= 8 ? idx : null;
  }

  // Helper: Convert a zero-based row index back to a letter A-I.
  function indexToRowLetter(idx) {
    return String.fromCharCode(65 + idx);
  }

  // Helper: Convert a UI column number (1-9) to zero-based index (0-8).
  function colNumberToIndex(n) {
    const num = Number(n);
    if (!Number.isInteger(num)) return null;
    const idx = num - 1;
    return idx >= 0 && idx <= 8 ? idx : null;
  }

  /*
    submitMove
    - Performs lightweight frontend validation of the user's typed move.
    - Sends the move to the backend POST `/api/move` which performs
      authoritative validation and returns the updated game state.
  */
  // Send a move to the server given zero-based row/col and numeric value
  async function playMove(row, col, value) {
    setError("");

    if (!Number.isInteger(row) || row < 0 || row > 8) {
      setError("Row must be A–I.");
      return;
    }
    if (!Number.isInteger(col) || col < 0 || col > 8) {
      setError("Col must be 1–9.");
      return;
    }
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      setError("Value must be an integer 1–9.");
      return;
    }

    const res = await fetch(`${API_BASE}/api/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ row, col, value }),
    });

    const data = await res.json();

    if (!data.ok) {
      setError(data.error || "Move rejected.");
      setGame(data.game);
      return;
    }

    setGame(data.game);
    setForm({ row: "", col: "", value: "" });
    setSelectedCell(null);
  }

  // Form submit now delegates to playMove using translated indices
  async function submitMove(e) {
    e.preventDefault();
    const row = rowLetterToIndex(form.row);
    const col = colNumberToIndex(form.col);
    const value = Number(form.value);
    await playMove(row, col, value);
  }

  // resetGame: request the backend to generate/reset a new game state
  async function resetGame() {
    setError("");
    const res = await fetch(`${API_BASE}/api/reset`, { method: "POST" });
    const data = await res.json();
    setGame(data.game);
  }

  // Compute numbers used so far from the game object (convenience)
  function getNumbersUsedFromGame(g) {
    if (!g) return 0;
    if (typeof g.numbersUsed === "number") return g.numbersUsed;
    if (g.poolCounts) {
      const totalLeft = Object.values(g.poolCounts || {}).reduce((s, v) => s + (v || 0), 0);
      return 81 - totalLeft;
    }
    return 0;
  }

  // Regenerate the current player's hand by calling server endpoint.
  async function regenerate() {
    setError("");
    const res = await fetch(`${API_BASE}/api/regenerate`, { method: "POST" });
    const data = await res.json();
    if (!data.ok) {
      setError(data.error || "Could not regenerate numbers.");
      if (data.game) setGame(data.game);
      return;
    }
    setGame(data.game);
  }

  // While initial game state is loading show a friendly placeholder.
  if (!game) {
    return (
      <div className="page">
        <h1>SudoUTT</h1>
        <p>Loading game state...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  // Forced board display (big board is 0–2). We show (A–C, 1–3).
  const forced = game.forcedBoard
    ? `(${indexToRowLetter(game.forcedBoard.br)}, ${game.forcedBoard.bc + 1})`
    : "Any board";

  const hand = game.hands[game.currentPlayer];
  const numbersUsed = getNumbersUsedFromGame(game);
  const showRegenerate = numbersUsed >= 45;

  return (
    <div className="page">
      <header className="header">
        <img src={logo} alt="Game logo" className="logo" />

        <div>
          <h1>SudoUTT</h1>
          <p className="sub">
            Current Player: <b>{game.currentPlayer}</b> | Forced Board: <b>{forced}</b>
          </p>
          <p className="sub">
            Player A Score: <b>{game.scores.A}</b> | Player B Score: <b>{game.scores.B}</b>
          </p>
        </div>

        <button className="btn" onClick={resetGame} title="Reset game" aria-label="Reset game">
          Reset
        </button>
      </header>

      {/* panel moved next to board below */}

      <section className="boardWrap">
        {/* <h2>Board (9×9)</h2> */}

        {/* Header row + play area below */}
    {/* left panel + board grid */}
    <div className="boardGrid">
  <div className="corner" />

  {Array.from({ length: 9 }, (_, c) => (
    <div key={`colhdr-${c}`} className="colHeader">{c + 1}</div>
  ))}

  <div className="playAreaWrap">
    <div className="rowHeaders">
      {Array.from({ length: 9 }, (_, r) => (
        <div key={`rowhdr-${r}`} className="rowHeader">
          {indexToRowLetter(r)}
        </div>
      ))}
    </div>

    {/* ONE container for all 81 cells */}
    <div className="grid9">
      {game.board.map((rowArr, r) =>
        rowArr.map((cell, c) => {
          const hoverCoords = `${indexToRowLetter(r)}${c + 1}`;
          const isSelected = selectedCell && selectedCell.r === r && selectedCell.c === c;
          return (
            <div
              key={`cell-${r}-${c}`}
              className={[
                "cell",
                cell?.player === "A" ? "pA" : "",
                cell?.player === "B" ? "pB" : "",
                isSelected ? "selected" : "",
              ].join(" ")}
              title={hoverCoords}
                  onClick={() => {
                    // always allow selecting a cell (for advanced keyboard entry)
                    setSelectedCell({ r, c });
                    // populate the manual form only when beginner mode is enabled
                    if (beginnerMode) {
                      setForm({ row: indexToRowLetter(r), col: String(c + 1), value: "" });
                    }
                  }}
            >
              {cell ? cell.value : ""}
            </div>
          );
        })
      )}
    </div>
  </div>
    </div>

    {/* move the existing panel here so it sits to the left of the board */}
    <section className="panel">
      <h2>Available Numbers (Player {game.currentPlayer})</h2>
      <div className="hand">
        {hand.map((n, i) => (
          <span key={i} className="chip">
            {n}
          </span>
        ))}
      </div>

      {showRegenerate && (
        <button
          className="btn"
          onClick={regenerate}
          title="Regenerate your hand"
          aria-label="Regenerate your numbers"
        >
          Regenerate numbers
        </button>
      )}

      <label style={{ display: "block", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={beginnerMode}
          onChange={(e) => setBeginnerMode(e.target.checked)}
        />{' '}
        Beginner mode (click a cell, then press 1–9)
      </label>

      {beginnerMode && (
        <form onSubmit={submitMove} className="moveForm">
          <label>
            Row (A–I)
            <input
              value={form.row}
              onChange={(e) => setForm({ ...form, row: e.target.value })}
              placeholder="e.g. A"
              maxLength={1}
            />
          </label>

          <label>
            Col (1–9)
            <input
              value={form.col}
              onChange={(e) => setForm({ ...form, col: e.target.value })}
              placeholder="e.g. 9"
            />
          </label>

          <label>
            Value (1–9)
            <input
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              ref={valueInputRef}
              placeholder="e.g. 5"
            />
          </label>

          <button className="btn" type="submit" title="Play move" aria-label="Play move">
            Play Move
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}

      {game.lastMove && (
        <p className="info">
          Last move: Player <b>{game.lastMove.player}</b> placed <b>{game.lastMove.value}</b> at (<b>
            {indexToRowLetter(game.lastMove.row)}
          </b>, <b>{game.lastMove.col + 1}</b>)
        </p>
      )}
    </section>

        {/* <p className="note">
          Tip: Right now you enter moves via the form. Next step can be “click a cell to autofill row/col”.
        </p> */}
      </section>
    </div>
  );
}
