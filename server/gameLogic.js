// ============================================================
// gameLogic.js — Toàn bộ luật chơi Chess Card Game
// KHÔNG phụ thuộc socket, express, hay UI
// Test: node server/gameLogic.js
// ============================================================

const COLORS      = ['red', 'black', 'green', 'blue'];
const PIECE_TYPES = ['tot', 'ma', 'tinh', 'xe', 'hau', 'vua'];
const FUNC_TYPES  = ['cung_ten', 'phong_hau'];

// ── Tạo bộ bài ───────────────────────────────────────────────
function createDeck(numColors = 4) {
  const colors = COLORS.slice(0, numColors);
  const deck = [];
  for (const color of colors) {
    for (let n = 1; n <= 5; n++)
      deck.push({ id: `${color}_tot_${n}`, color, type: 'tot', number: n });
    for (const type of ['ma', 'tinh', 'xe', 'hau', 'vua'])
      for (let n = 1; n <= 3; n++)
        deck.push({ id: `${color}_${type}_${n}`, color, type, number: n });
    deck.push({ id: `${color}_cung_ten`,  color, type: 'cung_ten',  number: null });
    deck.push({ id: `${color}_phong_hau`, color, type: 'phong_hau', number: null });
  }
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealCards(deck, numPlayers) {
  const d = [...deck];
  const hands = Array.from({ length: numPlayers }, () => d.splice(0, 9));
  const board  = Array.from({ length: 3 }, () =>
    Array.from({ length: 3 }, () => [d.splice(0, 1)[0]])
  );
  return { hands, board, drawPile: d };
}

function createGameState(numPlayers, numColors = 4, firstTurn = 0) {
  const deck = shuffle(createDeck(numColors));
  const { hands, board, drawPile } = dealCards(deck, numPlayers);
  return { hands, board, drawPile, currentTurn: firstTurn, numPlayers, numColors };
}

// ── Đặt bài ──────────────────────────────────────────────────
// Phong Hậu + lá thường: cùng màu HOẶC cùng loại
function canPlace(card, topCard) {
  if (!card || !topCard) return false;
  return card.color === topCard.color || card.type === topCard.type;
}

// ── Ô có thể ăn ──────────────────────────────────────────────
function getAttackSquares(card, fr, fc, board, playerSide = 'bottom') {
  if (card.type === 'cung_ten' || card.type === 'phong_hau') return [];
  const inB     = (r, c) => r >= 0 && r < 3 && c >= 0 && c < 3;
  const hasCard = (r, c) => board[r]?.[c]?.length > 0;
  const sq = [];
  switch (card.type) {
    case 'tot': {
      const dirs = { bottom:[[-1,-1],[-1,1]], top:[[1,-1],[1,1]], left:[[-1,1],[1,1]], right:[[-1,-1],[1,-1]] };
      for (const [dr,dc] of (dirs[playerSide]||dirs.bottom)) {
        const r=fr+dr, c=fc+dc;
        if (inB(r,c) && hasCard(r,c)) sq.push([r,c]);
      }
      break;
    }
    case 'ma':
      for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const r=fr+dr, c=fc+dc; if (inB(r,c)&&hasCard(r,c)) sq.push([r,c]);
      }
      break;
    case 'tinh':
      for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let r=fr+dr, c=fc+dc;
        while (inB(r,c)) { if (hasCard(r,c)) sq.push([r,c]); r+=dr; c+=dc; }
      }
      break;
    case 'xe':
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        let r=fr+dr, c=fc+dc;
        while (inB(r,c)) { if (hasCard(r,c)) sq.push([r,c]); r+=dr; c+=dc; }
      }
      break;
    case 'hau':
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
        let r=fr+dr, c=fc+dc;
        while (inB(r,c)) { if (hasCard(r,c)) sq.push([r,c]); r+=dr; c+=dc; }
      }
      break;
    case 'vua':
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) {
        const r=fr+dr, c=fc+dc; if (inB(r,c)&&hasCard(r,c)) sq.push([r,c]);
      }
      break;
  }
  return sq;
}

// ── Hành động game ───────────────────────────────────────────
function applyPlaceCard(gs, playerIdx, cardIdx, row, col) {
  const hand = gs.hands[playerIdx];
  if (cardIdx < 0 || cardIdx >= hand.length)
    return { ok: false, error: 'Lá bài không hợp lệ' };
  const card = hand[cardIdx];
  const pile = gs.board[row][col];
  if (pile.length === 0) {
    if (gs.drawPile.length > 0) pile.push(gs.drawPile.shift());
    else return { ok: false, error: 'Ô trống và chồng bài đã hết' };
  }
  if (!canPlace(card, pile[pile.length-1]))
    return { ok: false, error: 'Không thể đặt lá này lên ô đó' };
  hand.splice(cardIdx, 1);
  pile.push(card);
  if (card.type === 'phong_hau') {
    if (gs.drawPile.length > 0) hand.push(gs.drawPile.shift());
    return { ok: true, endTurn: true };
  }
  if (card.type === 'cung_ten') return { ok: true, waitForChoice: true };
  return { ok: true, waitForAction: true };
}

function applyAttack(gs, playerIdx, row, col) {
  const pile = gs.board[row][col];
  if (!pile || pile.length === 0) return { ok: false, error: 'Ô trống' };
  const taken = pile.pop();
  gs.hands[playerIdx].push(taken);
  // Chỉ bù khi ô hoàn toàn trống
  if (pile.length === 0 && gs.drawPile.length > 0)
    pile.push(gs.drawPile.shift());
  return { ok: true, endTurn: true, taken };
}

function applyDraw(gs, playerIdx) {
  if (gs.drawPile.length === 0) return { ok: false, error: 'Chồng bài đã hết' };
  gs.hands[playerIdx].push(gs.drawPile.shift());
  return { ok: true, endTurn: true };
}

function applyCungTenSteal(gs, playerIdx, targetIdx) {
  const target = gs.hands[targetIdx];
  if (!target || target.length === 0) return { ok: false, error: 'Người đó không còn bài' };
  const stolen = target.splice(Math.floor(Math.random()*target.length), 1)[0];
  gs.hands[playerIdx].push(stolen);
  // Người bị cướp KHÔNG bù ngay — đến lượt họ mới bốc
  return { ok: true, endTurn: true, stolen };
}

function advanceTurn(gs, players) {
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      if (gs.board[r][c].length === 0 && gs.drawPile.length > 0)
        gs.board[r][c].push(gs.drawPile.shift());
  if (gs.drawPile.length === 0) return { gameOver: true };
  let tries = 0;
  do {
    gs.currentTurn = (gs.currentTurn + 1) % gs.numPlayers;
    tries++;
  } while (players[gs.currentTurn]?.disconnected && tries < gs.numPlayers);
  return { gameOver: false };
}

// ═══════════════════════════════════════════════════════════════
// COMBO & ĐIỂM SỐ
// ═══════════════════════════════════════════════════════════════

const PENALTY = {
  vua: n => 5+n, hau: n => 4+n, xe: n => 3+n,
  ma:  n => 2+n, tinh: n => 2+n, tot: n => 1+n,
  cung_ten: () => 5, phong_hau: () => 5,
};
function penaltyCard(c) { return (PENALTY[c.type]||(() => 2))(c.number||0); }

// Tìm tất cả combo có thể từ tập lá (cùng màu)
function findAllCombos(cards) {
  const combos = [];

  // Nhóm theo màu
  const byColor = {};
  for (const c of cards) {
    if (!byColor[c.color]) byColor[c.color] = [];
    byColor[c.color].push(c);
  }

  for (const [color, group] of Object.entries(byColor)) {
    const jokers  = group.filter(c => c.type === 'phong_hau');
    const normals = group.filter(c => c.type !== 'phong_hau');
    const byType  = {};
    for (const c of normals) {
      if (!byType[c.type]) byType[c.type] = [];
      byType[c.type].push(c);
    }
    for (const t of PIECE_TYPES)
      if (byType[t]) byType[t].sort((a,b) => a.number - b.number);

    // Bộ hoàng gia hoàn hảo (cùng số N)
    for (let N = 1; N <= 3; N++) {
      const matched = []; let jLeft = [...jokers]; let ok = true;
      for (const t of PIECE_TYPES) {
        if (t === 'tot' && N > 5) { ok=false; break; }
        const found = (byType[t]||[]).find(c => c.number === N);
        if (found) matched.push(found);
        else if (jLeft.length > 0) matched.push(jLeft.shift());
        else { ok=false; break; }
      }
      if (ok && matched.length === 6)
        combos.push({ name:`Bộ hoàng gia hoàn hảo ${color} #${N}`, score:20*N, cardIds:matched.map(c=>c.id) });
    }
    // Thêm N=4,5 cho Tốt — tot có thể dùng số 4,5 nhưng các loại khác max 3
    // → bỏ qua vì tot_4, tot_5 không thể ghép với ma/tinh/xe/hau/vua số 4,5

    // Bộ hoàng gia (đủ 6 loại, khác số)
    {
      const matched = []; let jLeft = [...jokers];
      for (const t of PIECE_TYPES) {
        const found = (byType[t]||[])[0];
        if (found) matched.push(found);
        else if (jLeft.length > 0) matched.push(jLeft.shift());
      }
      if (matched.length === 6)
        combos.push({ name:`Bộ hoàng gia ${color}`, score:20, cardIds:matched.map(c=>c.id) });
    }

    // Ngũ Tốt
    {
      const tots = byType['tot']||[]; let jLeft=[...jokers]; const used=[...tots];
      while (used.length < 5 && jLeft.length > 0) used.push(jLeft.shift());
      if (used.length >= 5)
        combos.push({ name:`Ngũ Tốt ${color}`, score:15, cardIds:used.slice(0,5).map(c=>c.id) });
    }

    // Ba cùng loại
    const triScore = { vua:10, hau:9, xe:5, ma:3, tinh:3 };
    for (const [t, sc] of Object.entries(triScore)) {
      const arr = byType[t]||[]; let jLeft=[...jokers]; const used=[...arr];
      while (used.length < 3 && jLeft.length > 0) used.push(jLeft.shift());
      if (used.length >= 3)
        combos.push({ name:`Ba ${t} ${color}`, score:sc, cardIds:used.slice(0,3).map(c=>c.id) });
    }

    // Ba Tốt liên tiếp
    {
      const tots = byType['tot']||[];
      for (let i=0; i<=tots.length-3; i++) {
        const [a,b,c2] = tots.slice(i, i+3);
        if (b.number===a.number+1 && c2.number===a.number+2)
          combos.push({ name:`Ba Tốt liên tiếp ${color} ${a.number}-${c2.number}`, score:2, cardIds:[a.id,b.id,c2.id] });
      }
    }

    // Đôi số liên tiếp
    const pairScore = { vua:5, hau:4, xe:3, ma:2, tinh:2, tot:1 };
    for (const [t, sc] of Object.entries(pairScore)) {
      const arr = byType[t]||[];
      // Đôi thật
      for (let i=0; i<arr.length-1; i++)
        if (arr[i+1].number === arr[i].number+1)
          combos.push({ name:`Đôi ${t} ${color} ${arr[i].number}-${arr[i+1].number}`, score:sc, cardIds:[arr[i].id,arr[i+1].id] });
      // Đôi + Phong Hậu (joker)
      if (arr.length >= 1 && jokers.length > 0)
        combos.push({ name:`Đôi ${t}+joker ${color}`, score:sc, cardIds:[arr[0].id, jokers[0].id] });
    }
  }

  return combos;
}

// Tìm cách phân combo tối ưu bằng greedy (sắp theo điểm giảm dần)
// Mỗi lá chỉ vào 1 combo
function findBestAssignment(hand) {
  if (!hand || hand.length === 0) return { chosen:[], leftover:[], score:0 };
  const allCombos = findAllCombos(hand);
  allCombos.sort((a,b) => b.score - a.score);

  const used = new Set();
  const chosen = [];
  for (const combo of allCombos) {
    if (combo.cardIds.every(id => !used.has(id))) {
      combo.cardIds.forEach(id => used.add(id));
      chosen.push(combo);
    }
  }

  const leftover = hand.filter(c => !used.has(c.id));
  const score = chosen.reduce((s,c) => s+c.score, 0)
              - leftover.reduce((s,c) => s+penaltyCard(c), 0);
  return { chosen, leftover, score };
}

function scoreHand(hand) { return findBestAssignment(hand).score; }
function canHaBai(hand) {
  if (!hand || hand.length < 9) return false;
  return findBestAssignment(hand).leftover.length === 0;
}

module.exports = {
  COLORS, PIECE_TYPES, FUNC_TYPES,
  createDeck, shuffle, dealCards, createGameState,
  canPlace, getAttackSquares,
  applyPlaceCard, applyAttack, applyDraw, applyCungTenSteal,
  advanceTurn,
  scoreHand, canHaBai, findBestAssignment, findAllCombos,
};

// ── Self-test ────────────────────────────────────────────────
if (require.main === module) {
  let pass = 0, fail = 0;
  function check(desc, got, expected) {
    if (got === expected) { console.log(`  ✓ ${desc}`); pass++; }
    else { console.log(`  ✗ ${desc}: got ${got}, expected ${expected}`); fail++; }
  }

  console.log('=== Test gameLogic.js ===\n');

  // Bộ bài
  check('Deck 88 lá', createDeck(4).length, 88);
  check('Deck 3 màu = 66 lá', createDeck(3).length, 66);

  // Chia bài
  const gs = createGameState(4);
  check('Tay bài 9 lá', gs.hands[0].length, 9);
  check('DrawPile đúng', gs.drawPile.length, 88 - 4*9 - 9);

  // canPlace
  const red_tot1 = { id:'rt1', color:'red',   type:'tot', number:1 };
  const red_ma1  = { id:'rm1', color:'red',   type:'ma',  number:1 };
  const blk_tot2 = { id:'bt2', color:'black', type:'tot', number:2 };
  const blk_xe1  = { id:'bx1', color:'black', type:'xe',  number:1 };
  const red_ph   = { id:'rph', color:'red',   type:'phong_hau', number:null };
  check('Cùng màu được đặt',       canPlace(red_tot1, red_ma1),  true);
  check('Cùng loại được đặt',      canPlace(red_tot1, blk_tot2), true);
  check('Khác màu khác loại',      canPlace(red_tot1, blk_xe1),  false);
  check('Phong Hậu cùng màu',      canPlace(red_ph,   red_tot1), true);
  check('Phong Hậu chồng Phong Hậu', canPlace(red_ph, red_ph),  true);
  check('Phong Hậu khác màu',      canPlace(red_ph,   blk_xe1),  false);

  // Combo scores
  const baVua = [
    {id:'v1',color:'red',type:'vua',number:1},
    {id:'v2',color:'red',type:'vua',number:2},
    {id:'v3',color:'red',type:'vua',number:3},
  ];
  check('Ba Vua = 10', scoreHand(baVua), 10);

  const doiHau = [
    {id:'h1',color:'blue',type:'hau',number:1},
    {id:'h2',color:'blue',type:'hau',number:2},
  ];
  check('Đôi Hậu = 4', scoreHand(doiHau), 4);

  const vuaLe = [{id:'v1',color:'red',type:'vua',number:2}];
  check('Vua lẻ = -7', scoreHand(vuaLe), -(5+2));

  // canHaBai
  const good9 = [
    {id:'a1',color:'red',type:'vua',number:1},{id:'a2',color:'red',type:'vua',number:2},{id:'a3',color:'red',type:'vua',number:3},
    {id:'a4',color:'red',type:'hau',number:1},{id:'a5',color:'red',type:'hau',number:2},{id:'a6',color:'red',type:'hau',number:3},
    {id:'a7',color:'red',type:'xe', number:1},{id:'a8',color:'red',type:'xe', number:2},{id:'a9',color:'red',type:'xe', number:3},
  ];
  check('Ba Vua+Ba Hậu+Ba Xe hạ được', canHaBai(good9), true);

  const bad9 = [...good9.slice(0,8), {id:'z1',color:'black',type:'ma',number:1}];
  check('Có lá lẻ không hạ được', canHaBai(bad9), false);

  console.log(`\n${pass} passed, ${fail} failed`);
}
