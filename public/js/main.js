// ============================================================
// main.js — Khởi chạy app, kết nối tất cả module
// ============================================================
import { S, setState, onStateChange, canPlace, getAttackSquares, getPlayerSide,
  canHaBai, offlinePlaceCard, offlineAttack, offlineDraw, offlineSteal,
  offlineAdvanceTurn, offlineEndGame } from './game.js';
import { renderAll, renderBotDifficultyRows, toast, openInspector,
  openCungTen, showResult, showScreen, pushFeed } from './ui.js';
import { initSocket, connectAndCreate, connectAndJoin, sendReady,
  sendSettings, sendStart, sendAction } from './socket.js';
import { botTakeTurn } from './bot.js';

// Import gameLogic qua dynamic để tránh lỗi module trên browser
// (gameLogic.js dùng module.exports, không phải ES module)
// → dùng lại hàm từ game.js đã mirror sẵn

// ── Khởi tạo game state offline ──────────────────────────────
function createOfflineState(numPlayers, numColors) {
// Dùng lại logic từ server nhưng tự implement ở client
// vì game.js đã có createDeck, shuffle, dealCards qua offlinePlaceCard etc.
// Thực ra ta cần tạo state ban đầu — dùng fetch nếu có server, hoặc inline
const COLORS = ['red','black','green','blue'];
function createDeck(n) {
const colors = COLORS.slice(0,n), d=[];
for (const c of colors) {
for (let i=1;i<=5;i++) d.push({id:`${c}_tot_${i}`,color:c,type:'tot',number:i});
for (const t of ['ma','tinh','xe','hau','vua'])
 for (let i=1;i<=3;i++) d.push({id:`${c}_${t}_${i}`,color:c,type:t,number:i});
d.push({id:`${c}_cung_ten`,color:c,type:'cung_ten',number:null});
d.push({id:`${c}_phong_hau`,color:c,type:'phong_hau',number:null});
}
return d;
}
function shuffle(a) {
const arr=[...a];
for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
return arr;
}
const deck = shuffle(createDeck(numColors));
const hands = Array.from({length:numPlayers},()=>deck.splice(0,9));
const board = Array.from({length:3},()=>Array.from({length:3},()=>[deck.splice(0,1)[0]]));
return { hands, board, drawPile: deck };
}

// ── Offline: bắt đầu ─────────────────────────────────────────
function startOfflineGame() {
const numBots   = S.offlineBots;
const numColors = S._offlineColors || 4;
const numPlayers = 1 + numBots;
const myIndex   = 0;

const { hands, board, drawPile } = createOfflineState(numPlayers, numColors);

const players = [
{ name: document.getElementById('input-name')?.value.trim() || 'Bạn', isBot: false }
];
for (let i = 0; i < numBots; i++) {
players.push({ name: `Bot ${i+1}`, isBot: true, difficulty: S.offlineDifficulty[i] || 'easy' });
}

setState({
mode: 'offline', myIndex, numPlayers, players,
board, hands, _drawPile: drawPile, drawPileCount: drawPile.length,
currentTurn: 0, phase: 'select-card',
selCardIdx:null, selCard:null, selSlot:null, attackSquares:[],
result: null, _offlineColors: numColors,
});

document.getElementById('lobby-overlay').classList.add('hidden');
document.getElementById('game-screen').classList.remove('hidden');
renderAll(onCardClick, onSlotClick);
toast('Ván mới bắt đầu!');
}

// ── Kiểm tra lượt bot ────────────────────────────────────────
function checkBotTurn() {
if (S.mode !== 'offline') return;
if (S.phase !== 'select-card') return;
const player = S.players[S.currentTurn];
if (!player?.isBot) return;
setState({ phase: 'waiting' });
renderAll(onCardClick, onSlotClick);
// Delay đủ để render xong trước khi bot bắt đầu
setTimeout(() => botTakeTurn(S.currentTurn, player.difficulty || 'easy'), 50);
}

// ── Handler: click lá bài ────────────────────────────────────
function onCardClick(i) {
if (S.phase !== 'select-card') return;
if (S.currentTurn !== S.myIndex) return toast('Chưa đến lượt bạn!');
const card = S.hands[S.myIndex][i];
if (!card || !card.type) return;
setState({ selCardIdx: i, selCard: card, phase: 'select-slot' });
renderAll(onCardClick, onSlotClick);
toast(`Đã chọn ${card.type} — chọn ô để đặt`);
}

// ── Handler: click ô bàn cờ ──────────────────────────────────
function onSlotClick(r, c) {
// Bất kỳ phase nào cũng cho inspect
if (S.phase === 'waiting' || (S.phase !== 'select-slot' && S.phase !== 'select-action')) {
openInspector(r, c); return;
}

// select-action: ăn quân
if (S.phase === 'select-action') {
const isAttack = S.attackSquares.some(([ar,ac]) => ar===r && ac===c);
if (!isAttack) { openInspector(r, c); return; }
doAttack(r, c); return;
}

// select-slot: đặt bài
if (S.phase === 'select-slot') {
if (S.selCard === null) return;
doPlaceCard(r, c); return;
}
}

// ── Đặt bài ──────────────────────────────────────────────────
function doPlaceCard(r, c) {
if (S.mode === 'offline') {
const result = offlinePlaceCard(S.myIndex, S.selCardIdx, r, c);
if (!result.ok) { toast(result.error); return; }

if (result.endTurn) {
setState({ selCardIdx:null, selCard:null, selSlot:null, attackSquares:[], phase:'waiting' });
renderAll(onCardClick, onSlotClick);
pushFeed({ type:'place_card', player:S.myIndex, card:S.board[r][c].at(-1), row:r, col:c }, S.players);
setTimeout(() => offlineAdvanceTurn(), 200);
return;
}
if (result.waitForChoice) {
setState({ selSlot:[r,c], selCardIdx:null, selCard:null, phase:'select-steal' });
renderAll(onCardClick, onSlotClick);
openCungTen(
 (targetIdx) => { offlineSteal(S.myIndex, targetIdx); afterAction(); },
 () => { offlineDraw(S.myIndex); afterAction(); }
);
return;
}
if (result.waitForAction) {
setState({ selSlot:[r,c], selCardIdx:null, attackSquares: result.attackSquares, phase:'select-action' });
renderAll(onCardClick, onSlotClick);
pushFeed({ type:'place_card', player:S.myIndex, card:S.board[r][c].at(-1), row:r, col:c }, S.players);
if (result.attackSquares.length === 0) {
 toast('Không có ô nào để ăn — tự động bốc bài');
 setTimeout(() => { offlineDraw(S.myIndex); afterAction(); }, 600);
}
return;
}
} else {
// Online — lưu cardIdx trước, lock UI ngay, gửi server, chờ broadcast
const cardIdx = S.selCardIdx;
if (cardIdx === null) return;
setState({ selCardIdx:null, selCard:null, selSlot:null, attackSquares:[], phase:'waiting' });
renderAll(onCardClick, onSlotClick);
sendAction('place_card', { cardIdx, row: r, col: c });
}
}

// ── Ăn quân ─────────────────────────────────────────────────
function doAttack(r, c) {
if (S.mode === 'offline') {
const result = offlineAttack(S.myIndex, r, c);
if (!result.ok) { toast(result.error); return; }
pushFeed({ type:'attack', player:S.myIndex, taken:result.taken, row:r, col:c }, S.players);
afterAction();
} else {
setState({ attackSquares:[], selCard:null, selCardIdx:null, phase:'waiting' });
sendAction('attack', { row:r, col:c });
renderAll(onCardClick, onSlotClick);
}
}

// ── Sau action offline ───────────────────────────────────────
function afterAction() {
setState({ selCardIdx:null, selCard:null, selSlot:null, attackSquares:[], phase:'waiting' });
renderAll(onCardClick, onSlotClick);
if (canHaBai(S.hands[S.myIndex])) {
document.getElementById('btn-ha-bai')?.classList.remove('hidden');
}
// offlineAdvanceTurn sẽ set phase='select-card', listener sẽ trigger checkBotTurn
setTimeout(() => offlineAdvanceTurn(), 300);
}

// ── Bốc bài ─────────────────────────────────────────────────
document.getElementById('draw-pile-btn').addEventListener('click', () => {
if (S.phase !== 'select-action') return;
if (S.mode === 'offline') {
offlineDraw(S.myIndex);
pushFeed({ type:'draw', player:S.myIndex }, S.players);
afterAction();
} else {
setState({ attackSquares:[], selCard:null, selCardIdx:null, phase:'waiting' });
sendAction('draw', {});
renderAll(onCardClick, onSlotClick);
}
});

// ── Hạ bài ───────────────────────────────────────────────────
document.getElementById('btn-ha-bai').addEventListener('click', () => {
if (!canHaBai(S.hands[S.myIndex])) return;
if (S.mode === 'offline') {
offlineEndGame(S.myIndex);
} else {
sendAction('ha_bai', {});
}
});

// ── Sort bài ─────────────────────────────────────────────────
document.getElementById('btn-sort').addEventListener('click', () => {
const ORDER = ['vua','hau','xe','ma','tinh','tot','phong_hau','cung_ten'];
const COLORS = ['red','black','green','blue'];
const hand = [...S.hands[S.myIndex]].filter(c=>c&&c.type);
hand.sort((a,b) => {
const dc = COLORS.indexOf(a.color)-COLORS.indexOf(b.color);
if (dc!==0) return dc;
const dt = ORDER.indexOf(a.type)-ORDER.indexOf(b.type);
if (dt!==0) return dt;
return (a.number||0)-(b.number||0);
});
const newHands = [...S.hands]; newHands[S.myIndex] = hand;
setState({ hands: newHands });
renderAll(onCardClick, onSlotClick);
});

// ── Inspector close ───────────────────────────────────────────
document.getElementById('btn-close-inspector').addEventListener('click', () => {
document.getElementById('inspector-overlay').classList.add('hidden');
});

// ── Lobby: Tạo phòng ─────────────────────────────────────────
document.getElementById('btn-create').addEventListener('click', () => {
const name = document.getElementById('input-name').value.trim() || 'Người chơi';
connectAndCreate(name, (ok, roomId) => {
if (!ok) return;
showScreen('screen-waiting');
});
});

// ── Lobby: Vào phòng ─────────────────────────────────────────
document.getElementById('btn-show-join').addEventListener('click', () => {
document.getElementById('join-row').classList.toggle('hidden');
});
document.getElementById('btn-join').addEventListener('click', () => {
const name   = document.getElementById('input-name').value.trim() || 'Người chơi';
const roomId = document.getElementById('input-roomid').value.trim().toUpperCase();
if (!roomId) return toast('Nhập mã phòng');
connectAndJoin(name, roomId, (ok) => {
if (!ok) return;
showScreen('screen-waiting');
});
});

// ── Lobby: Offline ────────────────────────────────────────────
document.getElementById('btn-show-offline').addEventListener('click', () => {
showScreen('screen-offline');
renderBotDifficultyRows(S.offlineBots);
});
document.getElementById('btn-back-menu').addEventListener('click', () => showScreen('screen-menu'));

// Chọn số bot
document.querySelectorAll('[data-bots]').forEach(btn => {
btn.addEventListener('click', () => {
document.querySelectorAll('[data-bots]').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
const n = parseInt(btn.dataset.bots);
const diffs = Array.from({length:n}, (_,i) => S.offlineDifficulty[i]||'easy');
setState({ offlineBots: n, offlineDifficulty: diffs });
renderBotDifficultyRows(n);
});
});

// Chọn số màu
document.querySelectorAll('[data-colors]').forEach(btn => {
btn.addEventListener('click', () => {
const parent = btn.closest('.btn-group-small');
parent?.querySelectorAll('[data-colors]').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
setState({ _offlineColors: parseInt(btn.dataset.colors) });
});
});

// Chọn độ khó bot (delegate)
document.getElementById('bot-difficulty-rows').addEventListener('click', (e) => {
const btn = e.target.closest('[data-diff]');
if (!btn) return;
const botIdx = parseInt(btn.dataset.bot);
const diff   = btn.dataset.diff;
btn.closest('.btn-group-small')?.querySelectorAll('[data-diff]').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
const diffs = [...S.offlineDifficulty];
diffs[botIdx] = diff;
setState({ offlineDifficulty: diffs });
});

document.getElementById('btn-start-offline').addEventListener('click', startOfflineGame);

// ── Waiting room ──────────────────────────────────────────────
document.getElementById('btn-ready').addEventListener('click', () => {
const btn = document.getElementById('btn-ready');
const newReady = !S._ready;
setState({ _ready: newReady });
btn.textContent = newReady ? '✓ Sẵn sàng' : 'Sẵn sàng';
btn.className = newReady ? 'btn btn-gold' : 'btn btn-ghost';
sendReady(newReady);
});

document.getElementById('btn-start-online').addEventListener('click', () => sendStart());
document.getElementById('btn-3colors').addEventListener('click', () => sendSettings(3));
document.getElementById('btn-4colors').addEventListener('click', () => sendSettings(4));

document.getElementById('btn-copy-link').addEventListener('click', () => {
const link = `${window.location.origin}${window.location.pathname}?room=${S.roomId}`;
navigator.clipboard.writeText(link).then(() => {
const btn = document.getElementById('btn-copy-link');
btn.textContent = '✓ Đã copy'; setTimeout(() => btn.textContent = '📋 Copy link', 2000);
});
});

// ── Play again / Menu ─────────────────────────────────────────
function onPlayAgain() {
if (S.mode === 'offline') {
startOfflineGame();
} else {
setState({ _ready: false });
document.getElementById('game-screen').classList.add('hidden');
document.getElementById('lobby-overlay').classList.remove('hidden');
showScreen('screen-waiting');
}
}
function onMenu() {
setState({ mode:'menu', phase:'idle', _ready:false });
document.getElementById('game-screen').classList.add('hidden');
document.getElementById('lobby-overlay').classList.remove('hidden');
showScreen('screen-menu');
}

// ── State change → re-render ──────────────────────────────────
onStateChange(() => {
if (S.phase === 'result') {
showResult(onPlayAgain, onMenu);
return;
}
if (document.getElementById('game-screen').classList.contains('hidden')) return;
renderAll(onCardClick, onSlotClick);
checkBotTurn();
});

// ── Init socket ───────────────────────────────────────────────
initSocket({ onCardClick, onSlotClick, onPlayAgain, onMenu });

// ── Auto-join từ URL ──────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
const inviteRoom = params.get('room');
if (inviteRoom) {
document.getElementById('input-roomid').value = inviteRoom.toUpperCase();
document.getElementById('join-row').classList.remove('hidden');
}