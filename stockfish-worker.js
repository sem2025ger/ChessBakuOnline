// Stockfish Web Worker loader

let engine = null;

// Load official Stockfish WASM build
self.importScripts("https://cdn.jsdelivr.net/gh/niklasf/stockfish.wasm/stockfish.js");

self.onmessage = function (event) {
    if (!engine) {
        engine = STOCKFISH();
        engine.onmessage = function (msg) {
            postMessage(msg);
        };
    }

    engine.postMessage(event.data);
};
