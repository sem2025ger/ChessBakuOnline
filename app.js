let chess = new Chess();
let boardElement = document.getElementById("board");
let logContainer = document.getElementById("gameLog");

function log(text) {
    logContainer.innerHTML += text + "<br>";
}

document.getElementById("newGameBtn").onclick = () => {
    chess.reset();
    updateBoard();
    log("New game started.");
};

function updateBoard() {
    boardElement.innerHTML = "";

    let board = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            let sq = document.createElement("div");
            sq.className = "sq";

            let piece = board[r][c];
            if (piece) {
                let img = document.createElement("span");
                img.textContent = piece.type.toUpperCase();
                sq.appendChild(img);
            }

            boardElement.appendChild(sq);
        }
    }
}

// STOCKFISH ENGINE
let engine = STOCKFISH();

engine.onmessage = function (msg) {
    if (typeof msg === "string" && msg.includes("bestmove")) {
        let move = msg.split(" ")[1];
        chess.move({ from: move.substring(0, 2), to: move.substring(2, 4) });
        updateBoard();
        log("Engine plays: " + move);
    }
};

function engineMove() {
    engine.postMessage("ucinewgame");
    engine.postMessage("position fen " + chess.fen());
    engine.postMessage("go depth 12");
}

// first render
updateBoard();
