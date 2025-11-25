// app.js
//
// Client‑side logic for ChessBaku Online.  This script manages the
// interactive chessboard, communicates with the Stockfish worker for
// analysis and AI play, and orchestrates real‑time multiplayer and
// chat through Socket.IO.  On initial load the client joins or
// creates a room.  If a second player joins the same room the game
// switches from AI mode to multiplayer mode.

(function () {
  // Generate a pseudorandom username for chat.  In a production
  // application you would use authenticated user accounts.
  const username = 'Player-' + Math.floor(Math.random() * 10000);

  // Elements used throughout the UI
  const statusEl = document.getElementById('status');
  const moveHistoryEl = document.getElementById('moveHistory');
  const evalEl = document.getElementById('eval');
  const depthEl = document.getElementById('depth');
  const nodesEl = document.getElementById('nodes');
  const npsEl = document.getElementById('nps');
  const bestMoveEl = document.getElementById('bestMove');
  const pvEl = document.getElementById('pv');
  const chatMessagesEl = document.getElementById('chatMessages');
  const chatInputEl = document.getElementById('chatInput');

  // Game state
  let game = new Chess();
  let board;
  let worker;
  let socket;
  let roomId = '';
  let isVsAI = true;
  let isMyTurn = true;

  // Initialise Socket.IO connection
  function initSocket() {
    socket = io();
    // Determine room ID from URL (/play/:id) if present
    const parts = window.location.pathname.split('/').filter(Boolean);
    let requestedRoom = '';
    if (parts[0] === 'play' && parts[1]) {
      requestedRoom = parts[1];
    }
    socket.emit('join-room', { roomId: requestedRoom, username });

    socket.on('room-joined', (data) => {
      roomId = data.roomId;
      // Display share link if no room requested
      if (!requestedRoom) {
        const shareUrl = `${window.location.origin}/play/${roomId}`;
        statusEl.innerHTML =
          `<span>Waiting for opponent…</span><br/><small>Share link: <a href="${shareUrl}">${shareUrl}</a></small>`;
      }
      // Determine if there is an opponent already
      if (data.players && data.players.length > 1) {
        isVsAI = false;
        statusEl.textContent = 'Opponent connected – White to move';
      }
      // Restore FEN and history if room existed
      if (data.fen) {
        game.load(data.fen);
        board.position(data.fen);
        updateMoveHistory();
      }
      // Load chat history
      if (data.chat) {
        data.chat.forEach(addChatMessage);
      }
    });

    socket.on('start-game', () => {
      // Second player joined; switch to multiplayer mode
      isVsAI = false;
      isMyTurn = game.turn() === 'w';
      statusEl.textContent = 'Opponent connected – ' + (isMyTurn ? 'White' : 'Black') + ' to move';
    });

    socket.on('move', ({ move, fen }) => {
      // Apply opponent move and update board
      game.move(move, { sloppy: true });
      board.position(fen);
      updateMoveHistory();
      isMyTurn = true;
      updateStatus();
      // Analyse position
      requestAnalysis();
    });

    socket.on('chat-message', (message) => {
      addChatMessage(message);
    });

    socket.on('opponent-left', () => {
      isVsAI = true;
      isMyTurn = true;
      statusEl.textContent = 'Opponent disconnected – switched to AI mode';
    });
  }

  // Initialise Stockfish worker for analysis and AI moves
  function initWorker() {
    worker = new Worker('/stockfish-worker.js');
    worker.onmessage = (event) => {
      const msg = event.data;
      if (msg === 'ready') {
        // Engine ready
        return;
      }
      if (typeof msg === 'object') {
        // Error messages
        console.warn(msg);
        return;
      }
      if (msg.startsWith('info')) {
        parseEngineInfo(msg);
      } else if (msg.startsWith('bestmove')) {
        const parts = msg.split(' ');
        const move = parts[1];
        bestMoveEl.textContent = move;
        // If playing against AI and it's the engine's turn, execute the move
        if (isVsAI && !isMyTurn) {
          game.move(move, { sloppy: true });
          board.position(game.fen());
          updateMoveHistory();
          isMyTurn = true;
          updateStatus();
          // After AI move, request new analysis
          requestAnalysis();
        }
      }
    };
  }

  // Initialise the interactive chessboard
  function initBoard() {
    board = Chessboard('board', {
      position: 'start',
      draggable: true,
      onDragStart: (source, piece) => {
        // Disallow move if game over or not player's turn
        if (game.game_over() || !isMyTurn) return false;
        // Disallow moving opponent's pieces when vs AI
        if (isVsAI && piece.search(/^b/) !== -1) return false;
        // Disallow moving opponent's pieces in multiplayer based on turn
        if (!isVsAI) {
          const turn = game.turn();
          if ((turn === 'w' && piece.search(/^b/) !== -1) || (turn === 'b' && piece.search(/^w/) !== -1)) {
            return false;
          }
        }
      },
      onDrop: handleDrop,
      onSnapEnd: () => {
        board.position(game.fen());
      },
    });
  }

  // Handle piece drop
  function handleDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: 'q' });
    if (move === null) return 'snapback';
    updateMoveHistory();
    isMyTurn = false;
    updateStatus();
    const fen = game.fen();
    // If vs AI, send position to engine and let it respond
    if (isVsAI) {
      requestAnalysis();
    } else {
      // Emit move to server
      socket.emit('make-move', { roomId, move: move.san, fen });
    }
    return undefined;
  }

  // Update status text based on whose turn it is
  function updateStatus() {
    const turn = game.turn() === 'w' ? 'White' : 'Black';
    if (game.in_checkmate()) {
      statusEl.textContent = `Checkmate! ${turn === 'White' ? 'Black' : 'White'} wins.`;
    } else if (game.in_stalemate()) {
      statusEl.textContent = 'Stalemate!';
    } else if (game.in_draw()) {
      statusEl.textContent = 'Draw!';
    } else {
      if (isVsAI) {
        statusEl.textContent = `${turn} to move`;
      } else {
        statusEl.textContent = `${turn} to move${isMyTurn ? '' : ' – waiting for opponent'}`;
      }
    }
  }

  // Update move history panel
  function updateMoveHistory() {
    const history = game.history();
    moveHistoryEl.innerHTML = '';
    for (let i = 0; i < history.length; i += 2) {
      const white = history[i] || '';
      const black = history[i + 1] || '';
      const moveNum = i / 2 + 1;
      const row = document.createElement('div');
      row.textContent = `${moveNum}. ${white} ${black}`;
      moveHistoryEl.appendChild(row);
    }
  }

  // Request analysis from Stockfish for the current position
  function requestAnalysis() {
    if (!worker) return;
    // Reset analysis display
    depthEl.textContent = '0';
    nodesEl.textContent = '0';
    npsEl.textContent = '0';
    bestMoveEl.textContent = '–';
    pvEl.textContent = '';
    evalEl.textContent = '0.0';
    worker.postMessage('position fen ' + game.fen());
    // Adjust depth based on mode; deeper analysis for AI but shallower for multiplayer
    const depth = isVsAI ? 12 : 10;
    worker.postMessage('go depth ' + depth);
  }

  // Parse an "info" line from the engine and update the UI
  function parseEngineInfo(line) {
    // Example: info depth 15 seldepth 22 score cp 34 nodes 1234 nps 999 pv e2e4 e7e5
    const depthMatch = line.match(/depth\s+(\d+)/);
    const nodesMatch = line.match(/nodes\s+(\d+)/);
    const npsMatch = line.match(/nps\s+(\d+)/);
    const scoreCpMatch = line.match(/score cp ([\-\d]+)/);
    const scoreMateMatch = line.match(/score mate ([\-\d]+)/);
    const pvIndex = line.indexOf(' pv ');
    if (depthMatch) depthEl.textContent = depthMatch[1];
    if (nodesMatch) nodesEl.textContent = nodesMatch[1];
    if (npsMatch) npsEl.textContent = npsMatch[1];
    if (pvIndex !== -1) {
      const pvMoves = line.substring(pvIndex + 4).trim();
      pvEl.textContent = pvMoves;
    }
    if (scoreCpMatch) {
      const cp = parseInt(scoreCpMatch[1], 10);
      // Convert centipawn to pawns
      evalEl.textContent = (cp / 100).toFixed(2);
    } else if (scoreMateMatch) {
      const mate = parseInt(scoreMateMatch[1], 10);
      evalEl.textContent = mate > 0 ? `Mate in ${mate}` : `Mated in ${-mate}`;
    }
  }

  // Append a chat message to the chat panel
  function addChatMessage(msg) {
    const msgEl = document.createElement('div');
    msgEl.className = 'msg';
    const time = new Date(msg.timestamp || Date.now());
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    msgEl.innerHTML = `<span class="time">${timeStr}</span><span class="user">${msg.user}:</span> <span class="text">${msg.text}</span>`;
    chatMessagesEl.appendChild(msgEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  // Set up UI event listeners
  function initUI() {
    document.getElementById('chatSendBtn').addEventListener('click', () => {
      sendChat();
    });
    chatInputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendChat();
      }
    });
    document.getElementById('newGameBtn').addEventListener('click', () => {
      // Reset game and start vs AI again
      game.reset();
      board.position('start');
      isVsAI = true;
      isMyTurn = true;
      updateMoveHistory();
      updateStatus();
      requestAnalysis();
    });
    document.getElementById('undoBtn').addEventListener('click', () => {
      // Undo last two moves in vs AI mode, or one move in multiplayer
      if (game.history().length === 0) return;
      if (isVsAI) {
        // Undo player's move and engine's reply
        game.undo();
        game.undo();
      } else {
        // Only allow undo for local move; multiplayer undo is not supported
        game.undo();
        socket.emit('make-move', { roomId, move: '', fen: game.fen() });
      }
      board.position(game.fen());
      updateMoveHistory();
      isMyTurn = true;
      updateStatus();
      requestAnalysis();
    });
    document.getElementById('flipBtn').addEventListener('click', () => {
      board.flip();
    });
  }

  // Send a chat message to the server
  function sendChat() {
    const text = chatInputEl.value.trim();
    if (!text) return;
    const message = { user: username, text, timestamp: Date.now() };
    chatInputEl.value = '';
    addChatMessage(message);
    if (socket && roomId) {
      socket.emit('chat-message', { roomId, message });
    }
  }

  // Kick off everything
  function init() {
    initSocket();
    initWorker();
    initBoard();
    initUI();
    updateStatus();
    requestAnalysis();
  }

  init();
})();