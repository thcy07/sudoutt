import { useEffect, useState, useRef, useCallback } from "react";
import "./App.css";
import logo from "./assets/sudoku_grid.png";

const API_BASE = "http://localhost:3001";

// ─────────────────────────────────────────────
//  GRID CONSTANTS
// ─────────────────────────────────────────────
const S = 52;
const GAP_THIN  = 1;
const GAP_BOX   = 3;
const GAP_OUTER = 3;

function buildLines() {
  const lineW = (i) => (i===0||i===9) ? GAP_OUTER : i%3===0 ? GAP_BOX : GAP_THIN;
  const lineX = [];
  let x = 0;
  for (let i = 0; i <= 9; i++) { lineX.push(x); x += lineW(i); if (i < 9) x += S; }
  return { lineW, lineX, totalW: x };
}
const { lineW, lineX, totalW: BOARD_W } = buildLines();
const BOARD_H = BOARD_W;

function cellOrigin(r, c) {
  return { cx: lineX[c] + lineW(c), cy: lineX[r] + lineW(r) };
}

const COL = {
  bg: "#161b27", outerBorder: "#8090b0", boxLine: "#5a6580", thinLine: "#252d40",
  cellBg: "#1c2235", forcedFill: "#26271a",
  playerABg: "#1a2640", playerAText: "#6aabff",
  playerBBg: "#281825", playerBText: "#ff7aaa",
};

function draw(canvas, { board, forcedBoard, hoverCell, currentPlayer, selectedCell }) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = BOARD_W*dpr; canvas.height = BOARD_H*dpr;
  canvas.style.width = BOARD_W+"px"; canvas.style.height = BOARD_H+"px";
  ctx.setTransform(dpr,0,0,dpr,0,0);

  ctx.fillStyle = COL.bg;
  ctx.fillRect(0,0,BOARD_W,BOARD_H);

  const selFill = currentPlayer==="A" ? "rgba(74,140,255,0.28)" : "rgba(255,90,126,0.28)";
  const hovFill = currentPlayer==="A" ? "rgba(74,140,255,0.22)" : "rgba(255,90,126,0.22)";

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = board[r][c];
      const { cx, cy } = cellOrigin(r, c);
      const inForced = forcedBoard
        ? r>=forcedBoard.br*3 && r<forcedBoard.br*3+3 && c>=forcedBoard.bc*3 && c<forcedBoard.bc*3+3
        : true;
      const isHover    = hoverCell    && hoverCell.r===r    && hoverCell.c===c;
      const isSelected = selectedCell && selectedCell.r===r && selectedCell.c===c;
      const isForced   = !cell && inForced && !!forcedBoard;

      let bg = COL.cellBg;
      if (cell) bg = cell.player==="A" ? COL.playerABg : COL.playerBBg;
      else if (isSelected) bg = selFill;
      else if (isForced)   bg = COL.forcedFill;

      if (isHover) {
        bg = cell
          ? (cell.player==="A" ? "rgba(74,140,255,0.30)" : "rgba(255,90,126,0.30)")
          : isSelected ? selFill : hovFill;
      }

      ctx.fillStyle = bg;
      ctx.fillRect(cx, cy, S, S);

      if (cell) {
        ctx.fillStyle    = cell.player==="A" ? COL.playerAText : COL.playerBText;
        ctx.font         = `700 ${Math.round(S*0.40)}px 'JetBrains Mono',monospace`;
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(cell.value), cx+S/2, cy+S/2+1);
      }
    }
  }

  const drawLines = (w, color) => {
    ctx.fillStyle = color;
    for (let i=0;i<=9;i++) {
      if (lineW(i)!==w) continue;
      ctx.fillRect(lineX[i],0,w,BOARD_H);
      ctx.fillRect(0,lineX[i],BOARD_W,w);
    }
  };
  drawLines(GAP_THIN,  COL.thinLine);
  drawLines(GAP_BOX,   COL.boxLine);
  drawLines(GAP_OUTER, COL.outerBorder);
}

function SudokuGrid({ board, forcedBoard, currentPlayer, selectedCell, onCellClick }) {
  const canvasRef = useRef(null);
  const hoverRef  = useRef(null);
  const stateRef  = useRef({});
  stateRef.current = { board, forcedBoard, currentPlayer, selectedCell };

  const redraw = useCallback(() => {
    if (!canvasRef.current) return;
    draw(canvasRef.current, { ...stateRef.current, hoverCell: hoverRef.current });
  }, []);

  useEffect(() => { redraw(); }, [board, forcedBoard, currentPlayer, selectedCell, redraw]);

  function cellAt(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const px = (e.clientX-rect.left)*(BOARD_W/rect.width);
    const py = (e.clientY-rect.top)*(BOARD_H/rect.height);
    for (let c=0;c<9;c++) {
      const {cx} = cellOrigin(0,c);
      if (px>=cx && px<cx+S) {
        for (let r=0;r<9;r++) {
          const {cy} = cellOrigin(r,0);
          if (py>=cy && py<cy+S) return {r,c};
        }
      }
    }
    return null;
  }

  function onMouseMove(e) {
    const cell = cellAt(e);
    const prev = hoverRef.current;
    if (cell?.r!==prev?.r || cell?.c!==prev?.c) { hoverRef.current=cell; redraw(); }
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ display:"block", cursor:"pointer", borderRadius:2 }}
      onMouseMove={onMouseMove}
      onMouseLeave={() => { hoverRef.current=null; redraw(); }}
      onClick={e => { const cell=cellAt(e); if(cell) onCellClick(cell.r,cell.c); }}
    />
  );
}

// ─────────────────────────────────────────────
//  API helper
// ─────────────────────────────────────────────
function apiHeaders(token) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

// ─────────────────────────────────────────────
//  Auth screen
// ─────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode]       = useState("login");
  const [username, setUser]   = useState("");
  const [password, setPass]   = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    const endpoint = mode==="login" ? "/api/auth/login" : "/api/auth/signup";
    try {
      const res  = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!data.ok) { setError(data.error); setLoading(false); return; }
      localStorage.setItem("token",    data.token);
      localStorage.setItem("username", data.username);
      onAuth(data.token, data.username);
    } catch {
      setError("Could not connect to server.");
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <img src={logo} alt="logo" style={{ width:52,height:52,borderRadius:10,marginBottom:14,filter:"sepia(0.3) hue-rotate(20deg) brightness(1.1)" }} />
          <h1 style={{ margin:0,fontFamily:"'Instrument Serif',serif",fontSize:"2.2rem",fontWeight:400,color:"var(--text)" }}>
            Sudo<span style={{ color:"var(--amber)" }}>UTT</span>
          </h1>
          <p style={{ margin:"6px 0 0",fontSize:"0.8rem",color:"var(--text-muted)" }}>
            Turn-based Sudoku · Ultimate Tic-Tac-Toe mashup
          </p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab${mode==="login"?" active":""}`} onClick={() => { setMode("login"); setError(""); }}>Log in</button>
          <button className={`auth-tab${mode==="signup"?" active":""}`} onClick={() => { setMode("signup"); setError(""); }}>Sign up</button>
        </div>

        <form onSubmit={submit} style={{ display:"flex",flexDirection:"column",gap:12 }}>
          <input className="auth-input" placeholder="Username" value={username} onChange={e=>setUser(e.target.value)} autoFocus />
          <input className="auth-input" type="password" placeholder="Password" value={password} onChange={e=>setPass(e.target.value)} />
          {error && <p className="error" style={{ margin:0 }}>{error}</p>}
          <button className="btn primary" type="submit" disabled={loading} style={{ marginTop:4 }}>
            {loading ? "…" : mode==="login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Lobby screen
// ─────────────────────────────────────────────
function LobbyScreen({ token, username, onJoinGame, onLogout }) {
  const [games, setGames]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [joinId, setJoinId]   = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/games`, { headers: apiHeaders(token) })
      .then(r=>r.json())
      .then(d => { if(d.ok) setGames(d.games); })
      .catch(()=>setError("Could not load games."))
      .finally(()=>setLoading(false));
  }, [token]);

  async function createGame() {
    setError("");
    const res  = await fetch(`${API_BASE}/api/games`, { method:"POST", headers:apiHeaders(token) });
    const data = await res.json();
    if (data.ok) onJoinGame(data.game);
    else setError(data.error);
  }

  async function joinByLink(e) {
    e.preventDefault();
    const id = joinId.trim().split("/").pop().split("=").pop();
    if (!id) return;
    const res  = await fetch(`${API_BASE}/api/games/${id}/join`, { method:"POST", headers:apiHeaders(token) });
    const data = await res.json();
    if (data.ok) { onJoinGame(data.game); return; }
    // Maybe already a participant — just open it
    const res2  = await fetch(`${API_BASE}/api/games/${id}`, { headers:apiHeaders(token) });
    const data2 = await res2.json();
    if (data2.ok) onJoinGame(data2.game);
    else setError(data.error);
  }

  async function deleteGame(id) {
    await fetch(`${API_BASE}/api/games/${id}`, { method:"DELETE", headers:apiHeaders(token) });
    setGames(g => g.filter(x => x.id!==id));
  }

  const statusLabel = (g) => {
    if (g.status==="waiting")  return <span style={{ color:"var(--amber)",fontSize:"0.74rem" }}>Waiting for opponent</span>;
    if (g.status==="finished") return <span style={{ color:"var(--text-dim)",fontSize:"0.74rem" }}>Finished{g.winner ? ` · ${g.winner==="draw"?"Draw":(g.winner==="A"?g.playerAName:g.playerBName)+" wins"}` : ""}</span>;
    const turn = g.currentPlayer==="A" ? g.playerAName : g.playerBName;
    return <span style={{ color:"#6aabff",fontSize:"0.74rem" }}>Active · {turn}'s turn</span>;
  };

  return (
    <div className="page">
      <header className="header">
        <img src={logo} alt="logo" className="logo" />
        <div style={{ flex:1,textAlign:"center" }}>
          <h1>Sudo<span>UTT</span></h1>
          <p style={{ margin:"4px 0 0",fontSize:"0.8rem",color:"var(--text-muted)" }}>
            Welcome, <b style={{ color:"var(--text)" }}>{username}</b>
          </p>
        </div>
        <button className="btn-reset" onClick={onLogout}>Log out</button>
      </header>

      <div style={{ width:"100%",maxWidth:580,display:"flex",flexDirection:"column",gap:16 }}>

        <div className="lobby-card">
          <div className="panel-label">New game</div>
          <p style={{ margin:"4px 0 12px",fontSize:"0.83rem",color:"var(--text-muted)" }}>
            Create a game and share the link with a friend.
          </p>
          <button className="btn primary" onClick={createGame}>+ Create game</button>
        </div>

        <div className="lobby-card">
          <div className="panel-label">Join a game</div>
          <form onSubmit={joinByLink} style={{ display:"flex",gap:8,marginTop:8 }}>
            <input className="auth-input" style={{ flex:1 }} placeholder="Paste game link or ID…"
              value={joinId} onChange={e=>setJoinId(e.target.value)} />
            <button className="btn" type="submit">Join</button>
          </form>
        </div>

        {error && <p className="error">{error}</p>}

        {!loading && games.length>0 && (
          <div className="lobby-card">
            <div className="panel-label" style={{ marginBottom:12 }}>Your games</div>
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {games.map(g => (
                <div key={g.id} className="game-row">
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:"0.83rem",fontWeight:600,color:"var(--text)",marginBottom:2 }}>
                      {g.playerAName} vs {g.playerBName ?? "?"}
                    </div>
                    {statusLabel(g)}
                  </div>
                  <div style={{ display:"flex",gap:8,flexShrink:0 }}>
                    <button className="btn" style={{ padding:"5px 12px",fontSize:"0.77rem" }} onClick={()=>onJoinGame(g)}>Open</button>
                    <button className="btn" style={{ padding:"5px 10px",fontSize:"0.77rem",color:"#ff6e6e",borderColor:"rgba(255,100,100,0.25)" }}
                      onClick={()=>deleteGame(g.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && <p style={{ color:"var(--text-muted)",textAlign:"center",fontSize:"0.84rem" }}>Loading games…</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Game screen
// ─────────────────────────────────────────────
function GameScreen({ token, username, initialGame, onBack }) {
  const [game, setGame]               = useState(initialGame);
  const [error, setError]             = useState("");
  const [selectedCell, setSelectedCell] = useState(null);
  const [copied, setCopied]           = useState(false);
  const pollRef = useRef(null);

  const gameId   = game.id;
  const myLetter = game.playerAName===username ? "A" : "B";
  const isMyTurn = game.status==="active" && game.currentPlayer===myLetter;
  const R        = (idx) => String.fromCharCode(65+idx);

  // Polling every 2s when it's not our turn — stretch goal: real-time sync
  useEffect(() => {
    async function poll() {
      try {
        const res  = await fetch(`${API_BASE}/api/games/${gameId}`, { headers:apiHeaders(token) });
        const data = await res.json();
        if (data.ok) setGame(data.game);
      } catch {}
    }
    if (game.status==="active" && !isMyTurn) pollRef.current = setInterval(poll, 2000);
    else if (game.status==="waiting") pollRef.current = setInterval(poll, 3000);
    return () => clearInterval(pollRef.current);
  }, [game.status, isMyTurn, gameId, token]);

  async function playMove(row, col, value) {
    setError("");
    const res  = await fetch(`${API_BASE}/api/games/${gameId}/move`, {
      method:"POST", headers:apiHeaders(token),
      body: JSON.stringify({ row, col, value }),
    });
    const data = await res.json();
    if (!data.ok) { setError(data.error); if(data.game) setGame(data.game); return; }
    setGame(data.game); setSelectedCell(null);
  }

  async function regenerate() {
    setError("");
    const res  = await fetch(`${API_BASE}/api/games/${gameId}/regenerate`, { method:"POST",headers:apiHeaders(token) });
    const data = await res.json();
    if (!data.ok) { setError(data.error); return; }
    setGame(data.game);
  }

  function handleCellClick(r, c) {
    if (!isMyTurn || game.board[r][c]!==null) return;
    setError("");
    setSelectedCell(prev => prev?.r===r&&prev?.c===c ? null : {r,c});
  }

  function handleChipClick(n) {
    if (!isMyTurn || n==null) return;
    setError("");
    if (selectedCell) playMove(selectedCell.r, selectedCell.c, n);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}?game=${gameId}`);
    setCopied(true); setTimeout(()=>setCopied(false), 2000);
  }

  const hand      = game.hands?.[myLetter] ?? [];
  const showRegen = (game.numbersUsed??0)>=45 && isMyTurn;
  const forced    = game.forcedBoard ? `(${R(game.forcedBoard.br)}, ${game.forcedBoard.bc+1})` : "Any";
  const pColor    = game.currentPlayer==="A" ? "var(--player-a)" : "var(--player-b)";
  const myColor   = myLetter==="A" ? "var(--player-a)" : "var(--player-b)";
  const turnName  = game.currentPlayer==="A" ? game.playerAName : (game.playerBName??"?");

  return (
    <div className="page">
      <header className="header">
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <button className="btn-reset" style={{ fontSize:"1.1rem",padding:"6px 10px" }} onClick={onBack}>←</button>
          <img src={logo} alt="logo" className="logo" />
        </div>
        <div style={{ textAlign:"center",flex:1 }}>
          <h1>Sudo<span>UTT</span></h1>
          <div className="turn-indicator">
            {game.status==="waiting" ? (
              <span style={{ color:"var(--amber)" }}>⏳ Waiting for opponent…</span>
            ) : game.status==="finished" ? (
              <span>
                Game over ·{" "}
                {game.winner==="draw"
                  ? <b>Draw!</b>
                  : <b style={{ color:game.winner===myLetter?"var(--amber)":"var(--text-muted)" }}>
                      {game.winner==="A"?game.playerAName:game.playerBName} wins!
                    </b>
                }
              </span>
            ) : (
              <>
                <span className={`turn-dot ${game.currentPlayer.toLowerCase()}`} />
                <span><b style={{ color:pColor }}>{turnName}</b>'s turn</span>
                <span style={{ color:"var(--text-dim)" }}>·</span>
                <span>Board: <span className={`board-badge${game.forcedBoard?" active":""}`}>{forced}</span></span>
              </>
            )}
          </div>
        </div>
        <div className="score-chips">
          <span className="score-chip a">{game.playerAName} · {game.scores?.A??0}</span>
          <span className="score-chip b">{game.playerBName??"?"} · {game.scores?.B??0}</span>
        </div>
      </header>

      <section className="boardWrap">
        <div style={{ flexShrink:0 }}>
          <div style={{ display:"flex",paddingLeft:28,marginBottom:5 }}>
            <div style={{ position:"relative",width:BOARD_W,height:16 }}>
              {Array.from({length:9},(_,c) => {
                const {cx}=cellOrigin(0,c);
                return <span key={c} style={{ position:"absolute",left:cx+S/2,transform:"translateX(-50%)",fontFamily:"'JetBrains Mono',monospace",fontSize:"0.62rem",fontWeight:700,color:"var(--text-dim)",whiteSpace:"nowrap" }}>{c+1}</span>;
              })}
            </div>
          </div>
          <div style={{ display:"flex" }}>
            <div style={{ width:28,flexShrink:0 }}>
              {Array.from({length:9},(_,r) => {
                const {cy}=cellOrigin(r,0);
                return <div key={r} style={{ position:"relative",height:0 }}>
                  <span style={{ position:"absolute",top:cy,height:S,display:"flex",alignItems:"center",justifyContent:"center",width:28,fontFamily:"'JetBrains Mono',monospace",fontSize:"0.62rem",fontWeight:700,color:"var(--text-dim)" }}>{R(r)}</span>
                </div>;
              })}
            </div>
            <SudokuGrid
              board={game.board}
              forcedBoard={game.forcedBoard}
              currentPlayer={myLetter}
              selectedCell={selectedCell}
              onCellClick={handleCellClick}
            />
          </div>
        </div>

        <section className="panel">
          <div>
            <div className="panel-label">You are</div>
            <div style={{ fontSize:"0.9rem",fontWeight:600,color:myColor }}>Player {myLetter} · {username}</div>
          </div>

          <div className="divider" />

          {game.status==="waiting" && (
            <div>
              <div className="panel-label">Invite opponent</div>
              <p style={{ fontSize:"0.79rem",color:"var(--text-muted)",margin:"0 0 10px" }}>Share this link:</p>
              <div style={{ display:"flex",gap:8 }}>
                <input readOnly className="auth-input" style={{ flex:1,fontSize:"0.7rem" }}
                  value={`${window.location.origin}?game=${gameId}`}
                  onClick={e=>e.target.select()} />
                <button className="btn" onClick={copyLink}>{copied?"✓":"Copy"}</button>
              </div>
            </div>
          )}

          {game.status==="active" && (
            <div>
              <div className="panel-label">{isMyTurn?"Your numbers":`${turnName}'s turn…`}</div>
              {isMyTurn ? (
                <>
                  <div className="hand" style={{ marginTop:8 }}>
                    {hand.map((n,i) => (
                      <span key={i} className="chip" style={{ opacity:n==null?0.3:1 }}
                        onClick={()=>handleChipClick(n)}>{n??"·"}</span>
                    ))}
                  </div>
                  <p className="hint" style={{ marginTop:8 }}>
                    {selectedCell
                      ? <span style={{ color:"var(--amber)" }}>✦ Click a number to place it</span>
                      : "Click a cell, then a number"}
                  </p>
                  {showRegen && <button className="btn" onClick={regenerate} style={{ marginTop:8 }}>↻ Regenerate</button>}
                </>
              ) : (
                <p className="hint" style={{ marginTop:8 }}>Waiting for {turnName}…</p>
              )}
            </div>
          )}

          {game.status==="finished" && (
            <div style={{ textAlign:"center",padding:"12px 0" }}>
              <div style={{ fontSize:"1.4rem",marginBottom:6 }}>🏆</div>
              <div style={{ fontFamily:"'Instrument Serif',serif",fontSize:"1.1rem",color:"var(--text)" }}>
                {game.winner==="draw" ? "It's a draw!" : `${game.winner==="A"?game.playerAName:game.playerBName} wins!`}
              </div>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          {game.lastMove && (
            <p className="info">
              Last: <b style={{ color:game.lastMove.player==="A"?"var(--player-a)":"var(--player-b)" }}>
                {game.lastMove.player==="A"?game.playerAName:game.playerBName}
              </b> → <b>{game.lastMove.value}</b> at (<b>{R(game.lastMove.row)}</b>, <b>{game.lastMove.col+1}</b>)
            </p>
          )}

          <div style={{ marginTop:"auto" }}>
            <div className="panel-label" style={{ marginBottom:6 }}>Scores</div>
            <div style={{ display:"flex",gap:8 }}>
              <span className="score-chip a" style={{ flex:1,justifyContent:"center",display:"flex" }}>{game.playerAName} · {game.scores?.A??0}</span>
              <span className="score-chip b" style={{ flex:1,justifyContent:"center",display:"flex" }}>{game.playerBName??"?"} · {game.scores?.B??0}</span>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Root — routing
// ─────────────────────────────────────────────
export default function App() {
  const [token,    setToken]    = useState(() => localStorage.getItem("token"));
  const [username, setUsername] = useState(() => localStorage.getItem("username"));
  const [game,     setGame]     = useState(null);

  const urlGameId = new URLSearchParams(window.location.search).get("game");

  // Auto-join from URL on load
  useEffect(() => {
    if (!token || !urlGameId || game) return;
    fetch(`${API_BASE}/api/games/${urlGameId}/join`, { method:"POST", headers:apiHeaders(token) })
      .then(r=>r.json())
      .then(data => {
        if (data.ok) { setGame(data.game); return; }
        return fetch(`${API_BASE}/api/games/${urlGameId}`, { headers:apiHeaders(token) })
          .then(r=>r.json()).then(d => { if(d.ok) setGame(d.game); });
      }).catch(()=>{});
  }, [token, urlGameId]);

  function handleAuth(t, u) { setToken(t); setUsername(u); }

  function handleLogout() {
    localStorage.removeItem("token"); localStorage.removeItem("username");
    setToken(null); setUsername(null); setGame(null);
    window.history.pushState({}, "", "/");
  }

  if (!token) return <AuthScreen onAuth={handleAuth} />;
  if (game) return (
    <GameScreen token={token} username={username} initialGame={game}
      onBack={() => { setGame(null); window.history.pushState({}, "", "/"); }} />
  );
  return (
    <LobbyScreen token={token} username={username}
      onJoinGame={g => { setGame(g); window.history.pushState({}, "", `?game=${g.id}`); }}
      onLogout={handleLogout} />
  );
}