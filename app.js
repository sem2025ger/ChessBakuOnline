// Global game
const chess = new Chess();
let board = null;

// Stockfish Worker
const engine = new Worker("stockfish-worker.js");

// UI elements
const logBox = document.getElementById("log");
const evalBar = document.getElementById("evalBar");
const depthSlider = document.getElementById("depthSlider");
const moveTimeSlider = document.getElementById("moveTimeSlider");

// Log helper
function addLog(text) {
    logBox.innerHTML += text + "<br>";
    logBox.scrollTop = logBox.scrollHeight;
}

addLog("New game started.");

engine.onmessage = function (event) {
    const msg = event.data;

    if (msg.includes("score cp")) {
        const match = msg.match(/score cp (-?\d+)/);
        if (match) {
            const cp = parseInt(match[1]);
            const evalValue = Math.max(0, Math.min(100, (cp + 1000) / 20));
            evalBar.style.width = evalValue + "%";
        }
    }

    if (msg.startsWith("bestmove")) {
        const best = msg.split(" ")[1];
        if (best && best !== "(none)") {
            chess.move({ from: best.substring(0, 2), to: best.substring(2, 4) });
            board.position(chess.fen());
            addLog("Engine played: " + best);
        }
    }
};

function requestEngineMove() {
    engine.postMessage("ucinewgame");
    engine.postMessage("position fen " + chess.fen());
    engine.postMessage("go depth " + depthSlider.value);
}

function onDrop(source, target) {
    const move = chess.move({ from: source, to: target });

    if (move === null) return "snapback";

    addLog("Player moved: " + move.san);

    requestEngineMove();
}

board = Chessboard("board", {
    draggable: true,
    position: "start",
    onDrop: onDrop
});

document.getElementById("newGameBtn").onclick = () => {
    chess.reset();
    board.start();
    addLog("New game started.");
};

document.getElementById("switchSideBtn").onclick = () => {
    board.flip();
    addLog("Board flipped.");
};
