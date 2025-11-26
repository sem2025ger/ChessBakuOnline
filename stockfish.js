var Module = typeof Module !== "undefined" ? Module : {};

Module["print"] = function (text) {
  postMessage({ type: "stdout", data: text });
};

Module["printErr"] = function (text) {
  postMessage({ type: "stderr", data: text });
};

importScripts("https://cdn.jsdelivr.net/gh/niklasf/stockfish.wasm/stockfish.js");
