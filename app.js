// ChessBakuOnline – Black & Gold Premium Frontend
// Требования:
//  - файл stockfish/stockfish.js должен существовать (Web Worker UCI движка)
//  - chess.js загружен в index.html (через CDN)
//  - фронтенд полностью статический, подходит для GitHub Pages

// ---------------------- CONFIG ----------------------

const BOARD_ELEMENT_ID = "board";
const LOG_ELEMENT_ID = "log";
const STATUS_TEXT_ID = "statusText";
const TURN_TEXT_ID = "turnText";
const ENGINE_STATUS_ID = "engineStatus";
const EVAL_WHITE_ID = "evalWhite";
const EVAL_BLACK_ID = "evalBlack";
const EVAL_TEXT_ID = "evalText";

const ENGINE_WORKER_PATH = "stockfish/stockfish.js";

// ---------------------- STATE -----------------------

const boardEl = document.getElementById(BOARD_ELEMENT_ID);
const logEl = document.getElementById(LOG_ELEMENT_ID);
const statusTextEl = document.getElementById(STATUS_TEXT_ID);
const turnTextEl = document.getElementById(TURN_TEXT_ID);
const engineStatusEl = document.getElementById(ENGINE_STATUS_ID);
const evalWhiteEl = document.getElementById(EVAL_WHITE_ID);
const evalBlackEl = document.getElementById(EVAL_BLACK_ID);
const evalTextEl = document.getElementById(EVAL_TEXT_ID);

const newGameBtn = document.getElementById("newGameBtn");
const switchSideBtn = document.getElementById("switchSideBtn");
const depthInput = document.getElementById("depthInput");
const depthValue = document.getElementById("depthValue");
const timeInput = document.getElementById("timeInput");
const timeValue = document.getElementById("timeValue");

let chess = new Chess();
let engine = null;
let engineReady = false;
let engineThinking = false;

let humanPlaysWhite = true;
let selectedSquare = null;
let legalMovesFromSelected = [];

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

// Unicode фигур
const PIECE_UNICODE = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  P: "♙",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
};

// ---------------------- INIT ------------------------

// построить HTML-борд
function buildBoard() {
  boardEl.innerHTML = "";
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const file = FILES[fileIndex];
      const rank = RANKS[rankIndex];
      const squareName = file + rank;

      const squareDiv = document.createElement("div");
      squareDiv.classList.add("square");

      const isLight = (fileIndex + rankIndex) % 2 === 0;
      squareDiv.classList.add(isLight ? "light" : "dark");

      squareDiv.dataset.square = squareName;
      squareDiv.addEventListener("click", () => onSquareClick(squareName));

      boardEl.appendChild(squareDiv);
    }
  }
}

// отрисовать фигуры
function renderPosition() {
  const squares = boardEl.querySelectorAll(".square");
  squares.forEach((sq) => {
    sq.classList.remove(
      "selected",
      "highlight",
      "move-target",
      "capture-target"
    );
    sq.innerHTML = "";
    const squareName = sq.dataset.square;
    const piece = chess.get(squareName); // { type: 'p', color: 'w' } или null
    if (piece) {
      const span = document.createElement("span");
      span.classList.add("piece");
      const key = piece.color === "w" ? piece.type.toUpperCase() : piece.type;
      span.textContent = PIECE_UNICODE[key] || "?";
      sq.appendChild(span);
    }
  });

  // обновить текст чей ход
  const turn = chess.turn() === "w" ? "White" : "Black";
  turnTextEl.textContent = turn;
}

// ---------------------- LOG -------------------------

function log(message, type = "info") {
  const line = document.createElement("div");
  line.classList.add("log-line");
  if (type === "engine") {
    line.innerHTML = `<strong>SF:</strong> ${message}`;
  } else if (type === "move") {
    line.innerHTML = `<strong>Move:</strong> ${message}`;
  } else {
    line.textContent = message;
  }
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

// ---------------------- ENGINE ----------------------

function initEngine() {
  try {
    engine = new Worker(ENGINE_WORKER_PATH);
  } catch (err) {
    console.error("Cannot load Stockfish worker:", err);
    statusTextEl.textContent = "Engine load error.";
    engineStatusEl.textContent = "Offline";
    engineStatusEl.classList.remove("online", "thinking");
    engineStatusEl.classList.add("offline");
    return;
  }

  engine.onmessage = (event) => {
    const text =
      typeof event.data === "string" ? event.data : event.data?.data ?? "";

    if (!text) return;

    if (text === "uciok") {
      engineReady = true;
      engineStatusEl.textContent = "Online";
      engineStatusEl.classList.remove("offline", "thinking");
      engineStatusEl.classList.add("online");
      log("Engine ready.", "engine");
    }

    if (text.startsWith("info")) {
      const parts = text.split(" ");
      const cpIndex = parts.indexOf("cp");
      if (cpIndex !== -1 && parts[cpIndex + 1]) {
        const centipawns = parseFloat(parts[cpIndex + 1]);
        updateEval(centipawns / 100);
      }
    }

    if (text.startsWith("bestmove")) {
      engineThinking = false;
      engineStatusEl.textContent = "Online";
      engineStatusEl.classList.remove("thinking");
      engineStatusEl.classList.add("online");

      const tokens = text.split(" ");
      const move = tokens[1];
      if (move && move !== "(none)") {
        applyEngineMove(move);
      } else {
        log("Engine: no move.", "engine");
      }
    }
  };

  engine.postMessage("uci");
}

function updateEval(score) {
  if (Number.isNaN(score)) return;

  let bounded = Math.max(-5, Math.min(5, score));
  evalTextEl.textContent = bounded.toFixed(2);

  const whiteRatio = 0.5 + bounded / 10; // -5..5 → 0..1
  const whiteWidth = Math.round(whiteRatio * 100);
  evalWhiteEl.style.width = `${whiteWidth}%`;
  evalBlackEl.style.width = `${100 - whiteWidth}%`;
}

function requestEngineMove() {
  if (!engine || !engineReady) return;
  if (chess.game_over()) return;

  const depth = parseInt(depthInput.value, 10) || 12;
  const movetime = parseInt(timeInput.value, 10) || 800;

  engineThinking = true;
  engineStatusEl.textContent = "Thinking...";
  engineStatusEl.classList.remove("offline", "online");
  engineStatusEl.classList.add("thinking");

  const fen = chess.fen();
  engine.postMessage("position fen " + fen);
  // Приоритет movetime, но оставляем глубину как hint
  engine.postMessage(`go depth ${depth} movetime ${movetime}`);
  log(`Engine thinking... (depth=${depth}, time=${movetime}ms)`, "engine");
}

function applyEngineMove(uciMove) {
  // пример: "e2e4" или "e7e8q"
  const from = uciMove.slice(0, 2);
  const to = uciMove.slice(2, 4);
  const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

  const moveObj = {
    from,
    to,
    promotion: promotion || "q",
  };

  const result = chess.move(moveObj);
  if (result) {
    renderPosition();
    highlightLastMove(from, to);
    log(`${uciMove}`, "move");
    updateGameStatus();
  } else {
    log(`Engine sent illegal move: ${uciMove}`, "engine");
  }
}

// ---------------------- GAME LOGIC ------------------

function onSquareClick(square) {
  // ходить можно только за свою сторону
  const playerColor = humanPlaysWhite ? "w" : "b";

  if (chess.game_over()) return;
  if (chess.turn() !== playerColor) return; // сейчас ход движка

  const piece = chess.get(square);

  // 1) если сейчас нет выбора и нажат свой фигура → выбрать
  if (!selectedSquare) {
    if (!piece || piece.color !== playerColor) {
      return;
    }
    selectSquare(square);
    return;
  }

  // 2) если кликнули на ту же клетку → снять выбор
  if (selectedSquare === square) {
    clearSelection();
    return;
  }

  // 3) если кликнули на свою другую фигуру → сменить выбор
  if (piece && piece.color === playerColor) {
    selectSquare(square);
    return;
  }

  // 4) попытка сделать ход
  attemptHumanMove(selectedSquare, square);
}

function selectSquare(square) {
  clearSelection();
  selectedSquare = square;
  const sqDiv = getSquareDiv(square);
  if (sqDiv) {
    sqDiv.classList.add("selected");
  }

  // собрать легальные ходы из этой клетки
  legalMovesFromSelected = chess
    .moves({ square, verbose: true })
    .map((m) => m.to);

  // подсветить цели
  for (const target of legalMovesFromSelected) {
    const targetDiv = getSquareDiv(target);
    if (!targetDiv) continue;
    const targetPiece = chess.get(target);
    if (targetPiece) {
      targetDiv.classList.add("capture-target");
    } else {
      targetDiv.classList.add("move-target");
    }
  }
}

function clearSelection() {
  selectedSquare = null;
  legalMovesFromSelected = [];
  const squares = boardEl.querySelectorAll(".square");
  squares.forEach((sq) =>
    sq.classList.remove("selected", "move-target", "capture-target", "highlight")
  );
}

function getSquareDiv(squareName) {
  return boardEl.querySelector(`[data-square="${squareName}"]`);
}

function attemptHumanMove(from, to) {
  const moveObj = {
    from,
    to,
    promotion: "q",
  };

  const move = chess.move(moveObj);
  if (move) {
    clearSelection();
    renderPosition();
    highlightLastMove(from, to);
    log(`${from}${to}${move.promotion ? move.promotion : ""}`, "move");
    updateGameStatus();

    if (!chess.game_over()) {
      // дать ход движку
      requestEngineMove();
    }
  } else {
    // нелегальный ход
    statusTextEl.textContent = "Illegal move.";
    setTimeout(updateGameStatus, 700);
  }
}

function highlightLastMove(from, to) {
  const fromDiv = getSquareDiv(from);
  const toDiv = getSquareDiv(to);
  if (fromDiv) fromDiv.classList.add("highlight");
  if (toDiv) toDiv.classList.add("highlight");
}

function updateGameStatus() {
  if (chess.in_checkmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White";
    statusTextEl.textContent = `Checkmate – ${winner} wins`;
    return;
  }
  if (chess.in_draw()) {
    statusTextEl.textContent = "Draw";
    return;
  }
  if (chess.in_check()) {
    const side = chess.turn() === "w" ? "White" : "Black";
    statusTextEl.textContent = `${side} is in check`;
    return;
  }
  statusTextEl.textContent = "Game in progress.";
}

// ---------------------- NEW GAME / SIDE SWITCH ------

function newGame() {
  chess.reset();
  clearSelection();
  renderPosition();
  updateEval(0);
  updateGameStatus();
  log("New game started.");
  // если человек играет чёрными — первым ходит движок
  if (!humanPlaysWhite) {
    requestEngineMove();
  }
}

function switchSide() {
  humanPlaysWhite = !humanPlaysWhite;
  switchSideBtn.textContent = humanPlaysWhite ? "Play as Black" : "Play as White";
  newGame();
}

// ---------------------- UI BINDINGS -----------------

newGameBtn.addEventListener("click", newGame);
switchSideBtn.addEventListener("click", switchSide);

depthInput.addEventListener("input", () => {
  depthValue.textContent = depthInput.value;
});

timeInput.addEventListener("input", () => {
  timeValue.textContent = timeInput.value;
});

// ---------------------- BOOTSTRAP -------------------

buildBoard();
renderPosition();
updateGameStatus();
initEngine();
log("ChessBakuOnline loaded. Welcome to the Black & Gold board.");
