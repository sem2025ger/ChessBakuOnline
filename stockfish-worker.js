// ========== STOCKFISH WEB WORKER ==========
// Работает на GitHub Pages + Chrome + Safari

let engine_ready = false;
let engine = null;

// Загружаем Stockfish из CDN через importScripts (это работает только в Worker)
importScripts("https://cdn.jsdelivr.net/gh/niklasf/stockfish.wasm/stockfish.js");

// Stockfish создаётся как глобальная функция после загрузки файла
engine = STOCKFISH();

engine.onmessage = function (event) {
    const text = typeof event === "object" && event.data ? event.data : event;

    if (text.includes("uciok")) {
        engine_ready = true;
        postMessage({ type: "ready" });
    }

    if (text.startsWith("info")) {
        postMessage({ type: "info", data: text });
    }

    if (text.startsWith("bestmove")) {
        postMessage({ type: "bestmove", data: text });
    }
};

// Инициализация
engine.postMessage("uci");

// Обрабатываем сообщения из app.js
onmessage = function (msg) {
    if (!engine_ready) return;

    if (msg.data.type === "position") {
        engine.postMessage(`position fen ${msg.data.fen}`);
    }

    if (msg.data.type === "go") {
        let depth = msg.data.depth || 12;
        let movetime = msg.data.movetime || 800;

        engine.postMessage(`go movetime ${movetime} depth ${depth}`);
    }
};
