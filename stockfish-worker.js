/*
 * Stockfish Web Worker
 *
 * This worker lazily loads the Stockfish chess engine compiled to WebAssembly
 * and proxies messages between the main thread and the engine.  It expects
 * the engine to expose a global `Stockfish` constructor when imported from
 * a CDN.  When the worker starts it loads the script via importScripts,
 * creates an instance of the engine, wires up message forwarding and
 * notifies the main thread via a "ready" message.
 *
 * NOTE: The engine bundle is pulled from the public CDN on demand.  This
 * avoids having to ship large binaries in the repository.  If you wish to
 * host the engine locally, drop `stockfish.js` and `stockfish.wasm` into
 * your `/public/stockfish` directory and update the importScripts URL to
 * reference your copy instead.
 */

// URL of the Stockfish WASM loader.  You can change this to point to a
// different CDN or to a local copy under public/stockfish if desired.
const ENGINE_SRC =
  'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js';

let engine = null;

// Load the engine script.  If importScripts fails the worker will throw,
// terminating execution and surfacing an error to the main thread.
try {
  importScripts(ENGINE_SRC);
} catch (err) {
  // Relay a descriptive error back to the UI and bail out.
  postMessage({ type: 'error', value: 'Failed to load Stockfish: ' + err.message });
  throw err;
}

// Helper that waits for the Stockfish constructor to appear.  Some
// distributions of the library load asynchronously.
function waitForStockfish(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (typeof Stockfish === 'function') {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error('Stockfish constructor did not load in time'));
      }
    }, 50);
  });
}

// Initialise the engine instance and set up message forwarding.
async function initEngine() {
  try {
    await waitForStockfish();
    // In some builds Stockfish() returns a Promise instead of the instance.
    const maybePromise = Stockfish();
    engine = maybePromise instanceof Promise ? await maybePromise : maybePromise;
    // Relay messages from the engine back to the main thread.  Messages
    // returned from engine.onmessage may be strings or objects with a
    // `.data` property depending on the build.
    engine.onmessage = (event) => {
      const data = typeof event === 'string' ? event : event.data;
      postMessage(data);
    };
    // Notify the main thread that the engine is ready.
    postMessage('ready');
  } catch (err) {
    postMessage({ type: 'error', value: 'Error initialising Stockfish: ' + err.message });
  }
}

initEngine();

// Handle commands from the main thread.  We simply forward them to the
// underlying Stockfish instance.  If the engine is not ready yet we
// quietly ignore the message.
self.onmessage = function (event) {
  if (!engine) {
    // Optionally buffer commands here if you want to queue messages until
    // initialisation completes.  For now we just drop them.
    return;
  }
  engine.postMessage(event.data);
};