// ============================================================
// bot.js — AI cho chế độ offline
// 3 độ khó: easy | medium | hard
// ============================================================
import { S, canPlace, getAttackSquares, getPlayerSide, scoreHand, findBestAssignment, offlinePlaceCard, offlineAttack, offlineDraw, offlineSteal, offlineAdvanceTurn, offlineEndGame, canHaBai, setState } from './game.js';

// Delay giả lập bot "suy nghĩ" (ms)
const THINK_DELAY = { easy: 600, medium: 900, hard: 1200 };

// ── Entry point ───────────────────────────────────────────────
// Gọi khi đến lượt bot
export function botTakeTurn(playerIdx, difficulty = 'easy') {
  const delay = THINK_DELAY[difficulty] || 800;
  setTimeout(() => {
    try {
      _doTurn(playerIdx, difficulty);
    } catch(e) {
      console.error('Bot error:', e);
      // Fallback: bốc bài
      offlineDraw(playerIdx);
      _afterAction(playerIdx);
    }
  }, delay);
}

function _doTurn(playerIdx, difficulty) {
  const hand = S.hands[playerIdx];
  if (!hand || hand.length === 0) { offlineAdvanceTurn(); return; }

  // Kiểm tra có thể hạ bài không
  if (canHaBai(hand)) {
    offlineEndGame(playerIdx);
    return;
  }

  switch (difficulty) {
    case 'easy':   _easyTurn(playerIdx); break;
    case 'medium': _mediumTurn(playerIdx); break;
    case 'hard':   _hardTurn(playerIdx); break;
    default:       _easyTurn(playerIdx);
  }
}

// ── Dễ: hoàn toàn ngẫu nhiên ─────────────────────────────────
function _easyTurn(playerIdx) {
  const hand  = S.hands[playerIdx];
  const board = S.board;

  // Tìm tất cả nước đặt hợp lệ
  const validMoves = _allValidMoves(hand, board);
  if (validMoves.length === 0) { offlineDraw(playerIdx); _afterAction(playerIdx); return; }

  // Chọn ngẫu nhiên
  const move = validMoves[Math.floor(Math.random() * validMoves.length)];
  const result = offlinePlaceCard(playerIdx, move.cardIdx, move.row, move.col);
  if (!result.ok) { offlineDraw(playerIdx); _afterAction(playerIdx); return; }

  if (result.endTurn) { _afterAction(playerIdx); return; }
  if (result.waitForChoice) {
    // Cung Tên: random cướp hoặc bốc
    setTimeout(() => {
      if (Math.random() < 0.5 && S.numPlayers > 1) {
        const targets = S.players.map((_,i)=>i).filter(i=>i!==playerIdx&&S.hands[i]?.length>0);
        if (targets.length > 0) {
          offlineSteal(playerIdx, targets[Math.floor(Math.random()*targets.length)]);
        } else offlineDraw(playerIdx);
      } else offlineDraw(playerIdx);
      _afterAction(playerIdx);
    }, 400);
    return;
  }
  if (result.waitForAction) {
    setTimeout(() => {
      // Random: ăn hoặc bốc
      if (result.attackSquares.length > 0 && Math.random() < 0.5) {
        const sq = result.attackSquares[Math.floor(Math.random()*result.attackSquares.length)];
        offlineAttack(playerIdx, sq[0], sq[1]);
      } else {
        offlineDraw(playerIdx);
      }
      _afterAction(playerIdx);
    }, 400);
  }
}

// ── Trung bình: ưu tiên combo, đôi khi ngẫu nhiên ────────────
function _mediumTurn(playerIdx) {
  // 20% xác suất chơi ngẫu nhiên
  if (Math.random() < 0.2) { _easyTurn(playerIdx); return; }

  const hand  = S.hands[playerIdx];
  const board = S.board;
  const validMoves = _allValidMoves(hand, board);
  if (validMoves.length === 0) { offlineDraw(playerIdx); _afterAction(playerIdx); return; }

  // Chọn nước đặt tốt nhất cho điểm combo
  const bestMove = _bestMoveForCombo(playerIdx, hand, board, validMoves);
  const result   = offlinePlaceCard(playerIdx, bestMove.cardIdx, bestMove.row, bestMove.col);
  if (!result.ok) { offlineDraw(playerIdx); _afterAction(playerIdx); return; }

  if (result.endTurn) { _afterAction(playerIdx); return; }
  if (result.waitForChoice) {
    setTimeout(() => { offlineDraw(playerIdx); _afterAction(playerIdx); }, 400);
    return;
  }
  if (result.waitForAction) {
    setTimeout(() => {
      // Ưu tiên ăn nếu có lợi cho combo
      if (result.attackSquares.length > 0) {
        const bestSq = _bestAttackForCombo(playerIdx, result.attackSquares);
        offlineAttack(playerIdx, bestSq[0], bestSq[1]);
      } else offlineDraw(playerIdx);
      _afterAction(playerIdx);
    }, 400);
  }
}

// ── Khó: luôn tối ưu combo + ăn quân có lợi nhất ─────────────
function _hardTurn(playerIdx) {
  const hand  = S.hands[playerIdx];
  const board = S.board;
  const validMoves = _allValidMoves(hand, board);
  if (validMoves.length === 0) { offlineDraw(playerIdx); _afterAction(playerIdx); return; }

  const bestMove = _bestMoveForCombo(playerIdx, hand, board, validMoves);
  const result   = offlinePlaceCard(playerIdx, bestMove.cardIdx, bestMove.row, bestMove.col);
  if (!result.ok) { offlineDraw(playerIdx); _afterAction(playerIdx); return; }

  if (result.endTurn) { _afterAction(playerIdx); return; }
  if (result.waitForChoice) {
    setTimeout(() => {
      // Cung Tên: cướp từ người có điểm cao nhất
      const targets = S.players
        .map((_,i) => i)
        .filter(i => i!==playerIdx && S.hands[i]?.length>0)
        .sort((a,b) => scoreHand(S.hands[b]) - scoreHand(S.hands[a]));
      if (targets.length > 0) offlineSteal(playerIdx, targets[0]);
      else offlineDraw(playerIdx);
      _afterAction(playerIdx);
    }, 400);
    return;
  }
  if (result.waitForAction) {
    setTimeout(() => {
      if (result.attackSquares.length > 0) {
        const bestSq = _bestAttackForCombo(playerIdx, result.attackSquares);
        offlineAttack(playerIdx, bestSq[0], bestSq[1]);
      } else offlineDraw(playerIdx);
      _afterAction(playerIdx);
    }, 400);
  }
}

// ── Helpers ───────────────────────────────────────────────────

function _allValidMoves(hand, board) {
  const moves = [];
  for (let cardIdx = 0; cardIdx < hand.length; cardIdx++) {
    const card = hand[cardIdx];
    if (!card || !card.type) continue;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const pile = board[r][c];
      const top  = pile[pile.length - 1];
      if (!top) continue; // ô hoàn toàn trống (không có trong bàn bình thường)
      if (canPlace(card, top)) moves.push({ cardIdx, row: r, col: c });
    }
  }
  return moves;
}

// Chọn nước đặt tăng điểm combo nhiều nhất
function _bestMoveForCombo(playerIdx, hand, board, validMoves) {
  let bestScore = -Infinity, bestMove = validMoves[0];
  const currentScore = scoreHand(hand);

  for (const move of validMoves) {
    // Giả lập: bỏ lá này khỏi tay
    const simHand = hand.filter((_,i) => i !== move.cardIdx);
    const simScore = scoreHand(simHand);
    // Đánh giá: điểm tay sau khi đặt (ít lá lẻ hơn = tốt hơn)
    if (simScore > bestScore) { bestScore = simScore; bestMove = move; }
  }
  return bestMove;
}

// Chọn ô ăn tăng điểm combo nhiều nhất
function _bestAttackForCombo(playerIdx, attackSquares) {
  const hand = S.hands[playerIdx];
  let bestScore = -Infinity, bestSq = attackSquares[0];

  for (const [r, c] of attackSquares) {
    const pile = S.board[r][c];
    if (!pile || pile.length === 0) continue;
    const card     = pile[pile.length - 1];
    const simHand  = [...hand, card];
    const simScore = scoreHand(simHand);
    if (simScore > bestScore) { bestScore = simScore; bestSq = [r, c]; }
  }
  return bestSq;
}

// Sau mỗi action của bot → kiểm tra hạ bài hoặc chuyển lượt
function _afterAction(playerIdx) {
  const hand = S.hands[playerIdx];
  if (canHaBai(hand)) {
    setTimeout(() => offlineEndGame(playerIdx), 300);
    return;
  }
  setTimeout(() => offlineAdvanceTurn(), 200);
}
