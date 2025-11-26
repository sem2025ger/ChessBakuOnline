import { AnalysisData } from '../types';

const CDN_BASE = "https://cdn.jsdelivr.net/gh/niklasf/stockfish.wasm@master";

class StockfishService {
  private worker: Worker | null = null;
  private onAnalysisUpdate: ((data: AnalysisData) => void) | null = null;
  private turn: 'w' | 'b' = 'w';
  private isReady: boolean = false;

  constructor() {
    this.initWorker();
  }

  private async initWorker() {
    try {
      // Fetch the stockfish.js code as text to embed it directly.
      // This circumvents "importScripts" network errors in some Blob worker environments.
      const response = await fetch(`${CDN_BASE}/stockfish.js`);
      if (!response.ok) {
        throw new Error(`Failed to fetch stockfish.js: ${response.statusText}`);
      }
      const scriptContent = await response.text();

      // We define the Module config *before* the stockfish script runs.
      // This tells the engine where to find the .wasm file.
      const workerCode = `
        var Module = {
          locateFile: function(path, prefix) {
            if (path.indexOf('stockfish.wasm') > -1) {
              return "${CDN_BASE}/stockfish.wasm";
            }
            return prefix + path;
          }
        };

        ${scriptContent}

        let engine = null;
        
        // The script content defines a global 'STOCKFISH' function.
        // We need to handle both synchronous and Promise-based initialization.
        function initializeEngine(data) {
          if (typeof STOCKFISH === 'function') {
            const result = STOCKFISH();
            // Some builds return a Promise, some return the instance
            if (result instanceof Promise) {
              result.then(instance => {
                engine = instance;
                engine.onmessage = function(msg) { postMessage(msg); };
                if (data) engine.postMessage(data);
              });
            } else {
              engine = result;
              engine.onmessage = function(msg) { postMessage(msg); };
              if (data) engine.postMessage(data);
            }
          }
        }

        self.onmessage = function (event) {
          if (!engine) {
            // Attempt to initialize the engine on the first message
            initializeEngine(event.data);
          } else {
            // Post message to the engine if it's already initialized
            engine.postMessage(event.data);
          }
        };
      `;

      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      
      this.worker = new Worker(url);

      this.worker.onmessage = (e) => {
        this.processMessage(e.data);
      };

      this.worker.onerror = (e) => {
        console.error("Stockfish Worker Error:", e);
      };

      // Send initial UCI commands
      this.worker.postMessage('uci');
      this.worker.postMessage('isready');
      // isReady will be set to true in processMessage when 'readyok' is received.

    } catch (err) {
      console.error('Failed to initialize Stockfish worker:', err);
    }
  }

  public setCallback(cb: (data: AnalysisData) => void) {
    this.onAnalysisUpdate = cb;
  }

  public analyze(fen: string, depth: number = 15) {
    if (!this.worker || !this.isReady) {
      console.warn('Stockfish worker not ready for analysis.');
      return;
    }
    
    const parts = fen.split(' ');
    // Safely extract the turn, defaulting to 'w' if the FEN is malformed or incomplete
    this.turn = (parts[1] === 'b' ? 'b' : 'w');

    this.worker.postMessage('stop');
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage(`go depth ${depth}`);
  }

  public stop() {
    this.worker?.postMessage('stop');
  }

  public terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false; // Reset state on termination
  }

  private processMessage(msg: string) {
    // Check for engine readiness confirmation
    if (msg === 'readyok') {
      this.isReady = true;
      console.info('Stockfish engine is ready.');
      return;
    }

    // Parse UCI info strings
    if (msg.startsWith('info depth')) {
      const depthMatch = msg.match(/depth (\d+)/);
      // Regex to capture score type (cp or mate) and value (signed integer)
      const scoreMatch = msg.match(/score (cp|mate) (-?\d+)/);
      const pvMatch = msg.match(/ pv (.+)/);

      if (depthMatch && scoreMatch && this.onAnalysisUpdate) {
        const depth = parseInt(depthMatch[1]);
        const type = scoreMatch[1];
        let score = parseInt(scoreMatch[2]);
        const pv = pvMatch ? pvMatch[1] : '';
        const bestMove = pv.split(' ')[0];

        // Normalizing score to be White-relative
        // UCI standard: score is relative to side-to-move.
        if (this.turn === 'b') {
            score = -score;
        }

        let evalDisplay = '';
        if (type === 'mate') {
          // If score is negative (e.g. -1), it means Black mates in 1.
          // From White's perspective: -M1.
          // If score is positive (e.g. 1), it means White mates in 1.
          const mateIn = Math.abs(score);
          // The sign of the score indicates who is mating.
          // If score is positive, it's a mate for the side whose perspective the score is relative to (White in this case).
          // If score is negative, it's a mate for the opponent (Black in this case).
          evalDisplay = score < 0 ? `-M${mateIn}` : `M${mateIn}`;
        } else {
          // Centipawns to pawn value (e.g., 150 cp = 1.50)
          evalDisplay = (score / 100).toFixed(2);
        }

        this.onAnalysisUpdate({
          depth,
          evaluation: evalDisplay,
          bestMove,
        });
      }
    }
  }
}

export const stockfish = new StockfishService();
