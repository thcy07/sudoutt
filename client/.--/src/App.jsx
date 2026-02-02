import { useEffect, useState } from "react";
import "./App.css";
import logo from "./assets/sudoku_grid.png";

const API_BASE = "http://localhost:3001";

export default function App() {
  const [game, setGame] = useState(null);
  const [form, setForm] = useState({ row: "", col: "", value: "" });
  const [error, setError] = useState("");

  // Load initial game state on page load
  useEffect(() => {
    fetch(`${API_BASE}/api/state`)
      .then((r) => r.json())
      .then(setGame)
      .catch(() => setError("Could not connect to backend server."));
  }, []);

  async function submitMove(e) {
    e.preventDefault();
    setError("");

    // Frontend sanity-check (backend is the “real” checker)
    const row = Number(form.row);
    const col = Number(form.col);
    const value = Number(form.value);

    if (!Number.isInteger(row) || row < 1 || row > 9) {
      setError("Row must be an integer 1–9.");
      return;
    }
    if (!Number.isInteger(col) || col < 1 || col > 9) {
      setError("Col must be an integer 1–9.");
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
      setGame(data.game); // keep UI synced
      return;
    }

    setGame(data.game);
    setForm({ row: "", col: "", value: "" });
  }

  async function resetGame() {
    setError("");
    const res = await fetch(`${API_BASE}/api/reset`, { method: "POST" });
    const data = await res.json();
    setGame(data.game);
  }

  if (!game) {
    return (
      <div className="page">
        <h1>SudokuTT</h1>
        <p>Loading game state...</p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  const forced = game.forcedBoard
    ? `(${game.forcedBoard.br}, ${game.forcedBoard.bc})`
    : "Any board";

  const hand = game.hands[game.currentPlayer];

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
        <button className="btn" onClick={resetGame}>Reset</button>
      </header>

      <section className="panel">
        <h2>Available Numbers (Player {game.currentPlayer})</h2>
        <div className="hand">
          {hand.map((n, i) => (
            <span key={i} className="chip">{n}</span>
          ))}
        </div>

        <form onSubmit={submitMove} className="moveForm">
          <label>
            Row (0–8)
            <input
              value={form.row}
              onChange={(e) => setForm({ ...form, row: e.target.value })}
              placeholder="e.g. 0"
            />
          </label>

          <label>
            Col (0–8)
            <input
              value={form.col}
              onChange={(e) => setForm({ ...form, col: e.target.value })}
              placeholder="e.g. 8"
            />
          </label>

          <label>
            Value (1–9)
            <input
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder="e.g. 5"
            />
          </label>

          <button className="btn" type="submit">Play Move</button>
        </form>

        {error && <p className="error">{error}</p>}
        {game.lastMove && (
          <p className="info">
            Last move: Player <b>{game.lastMove.player}</b> placed <b>{game.lastMove.value}</b> at
            {" "}({game.lastMove.row}, {game.lastMove.col})
          </p>
        )}
      </section>

      <section className="boardWrap">
        <h2>Board (9×9)</h2>
        <div className="board">
          {game.board.map((row, r) =>
            row.map((cell, c) => {
              const isBoxBorderR = r % 3 === 0;
              const isBoxBorderC = c % 3 === 0;

              return (
                <div
                  key={`${r}-${c}`}
                  className={[
                    "cell",
                    isBoxBorderR ? "thickTop" : "",
                    isBoxBorderC ? "thickLeft" : "",
                    cell?.player === "A" ? "pA" : "",
                    cell?.player === "B" ? "pB" : "",
                  ].join(" ")}
                  title={`(${r}, ${c})`}
                >
                  {cell ? cell.value : ""}
                </div>
              );
            })
          )}
        </div>

        <p className="note">
          Tip: right now you enter moves via the form. Next step can be “click a cell to autofill row/col”.
        </p>
      </section>
    </div>
  );
}
