importScripts("https://cdn.jsdelivr.net/gh/niklasf/stockfish.wasm/stockfish.js");

let engine = STOCKFISH();

onmessage = function (event) {
    engine.postMessage(event.data);
};

engine.onmessage = function (line) {
    postMessage(line);
};
