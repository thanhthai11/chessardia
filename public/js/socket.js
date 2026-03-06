// ============================================================
// socket.js — Quản lý kết nối Socket.io
// ============================================================
import { applyServerState, setState, S } from './game.js';
import { renderWaitingRoom, showScreen, renderAll, pushFeed, showResult, toast, openCungTen } from './ui.js';

let socket = null;
let _onCardClick = null;
let _onSlotClick = null;
let _onPlayAgain = null;
let _onMenu      = null;

function ensureConnected(done) {
  if (!socket) return done?.(new Error('Socket chưa được khởi tạo'));
  if (socket.connected) return done?.(null);

  let settled = false;
  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    done?.(new Error('Kết nối server quá thời gian chờ'));
  }, 6000);

  function cleanup() {
    clearTimeout(timer);
    socket.off('connect', onConnect);
    socket.off('connect_error', onErr);
  }
  function onConnect() {
    if (settled) return;
    settled = true;
    cleanup();
    done?.(null);
  }
  function onErr(err) {
    if (settled) return;
    settled = true;
    cleanup();
    done?.(err || new Error('connect_error'));
  }

  socket.on('connect', onConnect);
  socket.on('connect_error', onErr);
  socket.connect();
}

export function initSocket(handlers) {
  _onCardClick = handlers.onCardClick;
  _onSlotClick = handlers.onSlotClick;
  _onPlayAgain = handlers.onPlayAgain;
  _onMenu      = handlers.onMenu;

  socket = io(window.location.origin, { autoConnect: false });

  socket.on('room:update', (view) => {
    if (view.phase === 'lobby') {
      showScreen('screen-waiting');
      renderWaitingRoom(view);
      setState({ phase: 'waiting-room', roomId: view.roomId, myIndex: view.myIndex,
                 isHost: view.players[view.myIndex]?.isHost || false });
    } else if (view.phase === 'playing') {
      document.getElementById('lobby-overlay').classList.add('hidden');
      document.getElementById('game-screen').classList.remove('hidden');
      if (view.lastAction) pushFeed(view.lastAction, view.players);
      applyServerState(view);
      if (S.phase === 'select-steal') {
        openCungTen(
          (targetIdx) => socket.emit('game:action', { type: 'cungten_steal', targetIdx }),
          () => socket.emit('game:action', { type: 'cungten_draw' })
        );
      }
      renderAll(_onCardClick, _onSlotClick);
    } else if (view.phase === 'result') {
      applyServerState(view);
      if (view.result) {
        setState({ result: view.result });
        showResult(_onPlayAgain, _onMenu);
      }
    }
  });

  socket.on('room:player_left', ({ name }) => toast(`${name} đã rời phòng`));
  socket.on('connect_error', () => toast('Không thể kết nối server'));

  return socket;
}

export function isConnected() {
  return socket && socket.connected;
}

export function connectAndCreate(name, cb) {
  if (!socket) return;
  ensureConnected((err) => {
    if (err) { toast('Không thể kết nối server'); cb(false); return; }
    socket.emit('room:create', { name }, (res) => {
      if (!res?.ok) { toast(res?.error || 'Lỗi tạo phòng'); cb(false); return; }
      setState({ roomId: res.roomId });
      cb(true, res.roomId);
    });
  });
}

export function connectAndJoin(name, roomId, cb) {
  if (!socket) return;
  ensureConnected((err) => {
    if (err) { toast('Không thể kết nối server'); cb(false); return; }
    socket.emit('room:join', { name, roomId }, (res) => {
      if (!res?.ok) { toast(res?.error || 'Không vào được phòng'); cb(false); return; }
      cb(true, res.roomId);
    });
  });
}

export function sendReady(ready) {
  socket?.emit('room:ready', { ready });
}

export function sendSettings(numColors) {
  socket?.emit('room:settings', { numColors });
}

export function sendStart() {
  socket?.emit('game:start');
}

let _sending = false;
export function sendAction(type, data, cb) {
  if (!socket?.connected) return;
  if (_sending) return; // chặn gửi 2 lần
  _sending = true;
  socket.emit('game:action', { type, ...data }, (res) => {
    _sending = false;
    if (!res?.ok) { toast(res?.error || `Lỗi: ${type}`); return; }
    if (cb) cb();
  });
}