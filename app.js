console.log("ChessBakuOnline loaded.");

const canvas = document.getElementById("boardCanvas");
const ctx = canvas.getContext("2d");

const logBox = document.getElementById("log");
const evalFill = document.getElementById("evalFill");

const depthSlider = document.getElementById("depthSlider");
const timeSlider = document.getElementById("timeSlider");

let chess = new Chess();

// Создаем Web Worker движка
const engine = new Worker("stockfish-worker.js");

function log(text) {
    logBox.innerHTML += text + "<br>";
    logBox.scrollTop = logBox.scrollHeight;
}

// Обработка ответов движка
engine.onmessage = (e) => {
    const msg = e.data;

    if (msg.type === "info") {
        if (msg.score) {
            updateEval(msg.score);
        }
    }

    if (msg.type === "bestmove") {
        chess.move(msg.move);
        drawBoard();
        log("Engine move: " + msg.move);
    }
};

function updateEval(score) {
    let scaled = 50 + score * 4;
    if (scaled < 0) scaled = 0;
    if (scaled > 100) scaled = 100;

    evalFill.style.width = scaled + "%";
}

// Нарисовать доску (простая визуализация)
function drawBoard() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, 600, 600);

    const board = chess.board();

    const size = 75;

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if ((r + c) % 2 === 0) {
                ctx.fillStyle = "#3d3d3d";
            } else {
                ctx.fillStyle = "#1e1e1e";
            }
            ctx.fillRect(c * size, r * size, size, size);

            const piece = board[r][c];
            if (piece) {
                ctx.fillStyle = piece.color === "w" ? "#fff" : "#000";
                ctx.font = "40px Arial";
                ctx.fillText(piece.type.toUpperCase(), c * size + 25, r * size + 50);
            }
        }
    }
}

// Отправить команду в движок
function sendToEngine(cmd) {
    engine.postMessage(cmd);
    console.log("ENGINE <<", cmd);
}

// Передать текущую позицию в движок
function analyzePosition() {
    sendToEngine("position fen " + chess.fen());
    sendToEngine("go depth " + depthSlider.value);
}

// Обработчик хода игрока
canvas.addEventListener("click", () => {
    // Тут позже добавим ввод хода
    log("Board clicked.");
});

// Новая игра
document.getElementById("newGameBtn").onclick = () => {
    chess.reset();
    drawBoard();
    log("New game started.");
    analyzePosition();
};

// Играть черными
document.getElementById("blackBtn").onclick = () => {
    chess.reset();
    drawBoard();
    analyzePosition();
};

drawBoard();
log("Ready.");
