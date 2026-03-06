// ============================================================
// game.js — State management + logic client-side
// ES Module — import/export
// ============================================================

// ── State tập trung ──────────────────────────────────────────
export const S = {
  mode: 'menu',        // 'menu' | 'offline' | 'online'
  roomId: null,
  myIndex: 0,
  isHost: false,
  phase: 'idle',
  // 'idle'|'lobby'|'waiting-room'
  // |'select-card'|'select-slot'|'select-action'
  // |'select-steal'|'waiting'|'result'
  board: null,
  hands: [],
  _drawPile: [],       // chỉ dùng offline
  drawPileCount: 0,
  currentTurn: 0,
  numPlayers: 0,
  players: [],         // [{name, isBot, difficulty, cardCount, disconnected}]
  selCardIdx: null,
  selCard: null,
  selSlot: null,       // [r,c] ô vừa đặt
  attackSquares: [],
  result: null,
  lastAction: null,
  offlineBots: 1,
  offlineDifficulty: ['easy'],
  _listeners: [],
};

let _pending = false;
export function setState(patch) {
  Object.assign(S, patch);
  if (!_pending) {
    _pending = true;
    Promise.resolve().then(() => { _pending = false; S._listeners.forEach(fn => fn(S)); });
  }
}
export function onStateChange(fn) {
  S._listeners.push(fn);
  return () => { S._listeners = S._listeners.filter(f => f !== fn); };
}

// ── Logic (mirror từ gameLogic.js để dùng trên browser) ─────

export function canPlace(card, topCard) {
  if (!card || !topCard) return false;
  return card.color === topCard.color || card.type === topCard.type;
}

export function getAttackSquares(card, fr, fc, board, playerSide = 'bottom') {
  if (!card || card.type === 'cung_ten' || card.type === 'phong_hau') return [];
  const inB     = (r,c) => r>=0&&r<3&&c>=0&&c<3;
  const hasCard = (r,c) => board[r]?.[c]?.length > 0;
  const sq = [];
  switch (card.type) {
    case 'tot': {
      const dirs = { bottom:[[-1,-1],[-1,1]], top:[[1,-1],[1,1]], left:[[-1,1],[1,1]], right:[[-1,-1],[1,-1]] };
      for (const [dr,dc] of (dirs[playerSide]||dirs.bottom)) { const r=fr+dr,c=fc+dc; if(inB(r,c)&&hasCard(r,c))sq.push([r,c]); }
      break;
    }
    case 'ma':
      for (const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const r=fr+dr,c=fc+dc; if(inB(r,c)&&hasCard(r,c))sq.push([r,c]); }
      break;
    case 'tinh':
      for (const [dr,dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) { let r=fr+dr,c=fc+dc; while(inB(r,c)){if(hasCard(r,c))sq.push([r,c]);r+=dr;c+=dc;} }
      break;
    case 'xe':
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) { let r=fr+dr,c=fc+dc; while(inB(r,c)){if(hasCard(r,c))sq.push([r,c]);r+=dr;c+=dc;} }
      break;
    case 'hau':
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) { let r=fr+dr,c=fc+dc; while(inB(r,c)){if(hasCard(r,c))sq.push([r,c]);r+=dr;c+=dc;} }
      break;
    case 'vua':
      for (const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]]) { const r=fr+dr,c=fc+dc; if(inB(r,c)&&hasCard(r,c))sq.push([r,c]); }
      break;
  }
  return sq;
}

const PENALTY = { vua:n=>5+n, hau:n=>4+n, xe:n=>3+n, ma:n=>2+n, tinh:n=>2+n, tot:n=>1+n, cung_ten:()=>5, phong_hau:()=>5 };
function penaltyCard(c) { return (PENALTY[c.type]||(() =>2))(c.number||0); }

function findAllCombos(cards) {
  const combos = [];
  const PIECE_TYPES = ['tot','ma','tinh','xe','hau','vua'];
  const byColor = {};
  for (const c of cards) { if(!byColor[c.color])byColor[c.color]=[]; byColor[c.color].push(c); }

  for (const [color, group] of Object.entries(byColor)) {
    const jokers  = group.filter(c=>c.type==='phong_hau');
    const normals = group.filter(c=>c.type!=='phong_hau');
    const byType  = {};
    for (const c of normals) { if(!byType[c.type])byType[c.type]=[]; byType[c.type].push(c); }
    for (const t of PIECE_TYPES) if(byType[t]) byType[t].sort((a,b)=>a.number-b.number);

    for (let N=1;N<=3;N++) {
      const matched=[]; let jLeft=[...jokers]; let ok=true;
      for (const t of PIECE_TYPES) {
        const found=(byType[t]||[]).find(c=>c.number===N);
        if(found)matched.push(found); else if(jLeft.length>0)matched.push(jLeft.shift()); else{ok=false;break;}
      }
      if(ok&&matched.length===6) combos.push({name:`Bộ hoàng gia hoàn hảo (${color} #${N})`,score:20*N,cardIds:matched.map(c=>c.id)});
    }
    { const matched=[]; let jLeft=[...jokers];
      for (const t of PIECE_TYPES) { const f=(byType[t]||[])[0]; if(f)matched.push(f); else if(jLeft.length>0)matched.push(jLeft.shift()); }
      if(matched.length===6) combos.push({name:`Bộ hoàng gia (${color})`,score:20,cardIds:matched.map(c=>c.id)}); }
    { const tots=byType['tot']||[]; let jLeft=[...jokers]; const used=[...tots];
      while(used.length<5&&jLeft.length>0)used.push(jLeft.shift());
      if(used.length>=5) combos.push({name:`Ngũ Tốt (${color})`,score:15,cardIds:used.slice(0,5).map(c=>c.id)}); }
    const triScore={vua:10,hau:9,xe:5,ma:3,tinh:3};
    for (const [t,sc] of Object.entries(triScore)) {
      const arr=byType[t]||[]; let jLeft=[...jokers]; const used=[...arr];
      while(used.length<3&&jLeft.length>0)used.push(jLeft.shift());
      if(used.length>=3) combos.push({name:`Ba ${t} (${color})`,score:sc,cardIds:used.slice(0,3).map(c=>c.id)});
    }
    { const tots=byType['tot']||[];
      for(let i=0;i<=tots.length-3;i++){const[a,b,c2]=tots.slice(i,i+3);if(b.number===a.number+1&&c2.number===a.number+2)combos.push({name:`Ba Tốt liên tiếp (${color})`,score:2,cardIds:[a.id,b.id,c2.id]});} }
    const pairScore={vua:5,hau:4,xe:3,ma:2,tinh:2,tot:1};
    for (const [t,sc] of Object.entries(pairScore)) {
      const arr=byType[t]||[];
      for(let i=0;i<arr.length-1;i++) if(arr[i+1].number===arr[i].number+1) combos.push({name:`Đôi ${t} (${color})`,score:sc,cardIds:[arr[i].id,arr[i+1].id]});
      if(arr.length>=1&&jokers.length>0) combos.push({name:`Đôi ${t}+joker (${color})`,score:sc,cardIds:[arr[0].id,jokers[0].id]});
    }
  }
  return combos;
}

export function findBestAssignment(hand) {
  if (!hand||hand.length===0) return {chosen:[],leftover:[],score:0};
  const allCombos=findAllCombos(hand);
  allCombos.sort((a,b)=>b.score-a.score);
  const used=new Set(), chosen=[];
  for (const combo of allCombos) {
    if(combo.cardIds.every(id=>!used.has(id))){ combo.cardIds.forEach(id=>used.add(id)); chosen.push(combo); }
  }
  const leftover=hand.filter(c=>!used.has(c.id));
  const score=chosen.reduce((s,c)=>s+c.score,0)-leftover.reduce((s,c)=>s+penaltyCard(c),0);
  return {chosen,leftover,score};
}
export const scoreHand = hand => findBestAssignment(hand).score;
export const canHaBai  = hand => !!(hand&&hand.length>=9&&findBestAssignment(hand).leftover.length===0);

// ── Vị trí ngồi ─────────────────────────────────────────────
export function getPlayerSide(playerIdx) {
  const rel = ((playerIdx - S.myIndex) + S.numPlayers) % S.numPlayers;
  return ['bottom','top','left','right'][rel] || 'bottom';
}

// ── Offline actions ──────────────────────────────────────────
export function offlinePlaceCard(playerIdx, cardIdx, row, col) {
  const hand      = [...S.hands[playerIdx]];
  const board     = S.board.map(r=>r.map(c=>[...c]));
  const drawPile  = [...S._drawPile];
  const card      = hand[cardIdx];
  const pile      = board[row][col];

  if (pile.length===0) {
    if (drawPile.length>0) pile.push(drawPile.shift());
    else return {ok:false,error:'Ô trống và hết bài'};
  }
  if (!canPlace(card, pile[pile.length-1])) return {ok:false,error:'Không thể đặt'};

  hand.splice(cardIdx,1);
  pile.push(card);
  const newHands=[...S.hands]; newHands[playerIdx]=hand;
  setState({board,hands:newHands,_drawPile:drawPile,drawPileCount:drawPile.length});

  if (card.type==='phong_hau') {
    offlineDraw(playerIdx);
    return {ok:true,endTurn:true};
  }
  if (card.type==='cung_ten') return {ok:true,waitForChoice:true,placedAt:[row,col]};

  const atk=getAttackSquares(card,row,col,board,getPlayerSide(playerIdx));
  return {ok:true,waitForAction:true,attackSquares:atk,placedAt:[row,col]};
}

export function offlineAttack(playerIdx, row, col) {
  const board    = S.board.map(r=>r.map(c=>[...c]));
  const drawPile = [...S._drawPile];
  const pile     = board[row][col];
  if (!pile||pile.length===0) return {ok:false,error:'Ô trống'};
  const taken=pile.pop();
  const newHands=S.hands.map((h,i)=>i===playerIdx?[...h,taken]:[...h]);
  if (pile.length===0&&drawPile.length>0) pile.push(drawPile.shift());
  setState({board,hands:newHands,_drawPile:drawPile,drawPileCount:drawPile.length});
  return {ok:true,endTurn:true,taken};
}

export function offlineDraw(playerIdx) {
  const drawPile=[...S._drawPile];
  if (drawPile.length===0) return {ok:false,error:'Hết bài'};
  const card=drawPile.shift();
  const newHands=S.hands.map((h,i)=>i===playerIdx?[...h,card]:[...h]);
  setState({hands:newHands,_drawPile:drawPile,drawPileCount:drawPile.length});
  return {ok:true,endTurn:true};
}

export function offlineSteal(playerIdx, targetIdx) {
  const targetHand=[...S.hands[targetIdx]];
  if (targetHand.length===0) return {ok:false,error:'Người đó không còn bài'};
  const stolen=targetHand.splice(Math.floor(Math.random()*targetHand.length),1)[0];
  const newHands=S.hands.map((h,i)=>i===playerIdx?[...h,stolen]:i===targetIdx?targetHand:[...h]);
  setState({hands:newHands});
  return {ok:true,endTurn:true,stolen};
}

export function offlineAdvanceTurn() {
  const board    = S.board.map(r=>r.map(c=>[...c]));
  const drawPile = [...S._drawPile];
  for (let r=0;r<3;r++) for (let c=0;c<3;c++) if(board[r][c].length===0&&drawPile.length>0) board[r][c].push(drawPile.shift());

  if (drawPile.length===0) {
    let winnerIdx=0, maxScore=-Infinity;
    S.hands.forEach((hand,i)=>{ const sc=scoreHand(hand); if(sc>maxScore){maxScore=sc;winnerIdx=i;} });
    offlineEndGame(winnerIdx); return;
  }
  const next=(S.currentTurn+1)%S.numPlayers;
  setState({board,_drawPile:drawPile,drawPileCount:drawPile.length,currentTurn:next,
    phase: 'select-card',
    selCardIdx:null,selCard:null,selSlot:null,attackSquares:[]});
}

export function offlineEndGame(winnerIdx) {
  const scores=S.hands.map((hand,i)=>{
    const {chosen,leftover,score}=findBestAssignment(hand);
    return {playerIdx:i,name:S.players[i]?.name,score,hand,chosen,leftover};
  });
  setState({phase:'result',result:{winnerIdx,winnerName:S.players[winnerIdx]?.name,scores}});
}

// ── Apply server state (online) ──────────────────────────────
export function applyServerState(view) {
  const numPlayers = view.players.length;
  const hands = view.players.map((p, i) =>
    i === view.myIndex ? view.myHand
    : Array(p.cardCount).fill({ id: 'back', type: 'back', color: 'back', number: null })
  );

  const pa = view.pendingAction; // chỉ có nếu đây là player cần hành động
  let phase, selSlot = null, attackSquares = [];

  if (pa) {
    if (pa.type === 'choose_steal') {
      phase = 'select-steal';
      selSlot = [pa.row, pa.col];
    } else if (pa.type === 'choose_action') {
      phase = 'select-action';
      selSlot = [pa.row, pa.col];
      attackSquares = pa.attackSquares || [];
    }
  } else {
    phase = view.currentTurn === view.myIndex ? 'select-card' : 'waiting';
  }

  setState({
    mode: 'online', roomId: view.roomId,
    myIndex: view.myIndex, isHost: view.players[view.myIndex]?.isHost || false,
    board: view.board, hands, drawPileCount: view.drawPileCount,
    currentTurn: view.currentTurn, numPlayers, players: view.players,
    lastAction: view.lastAction,
    selCardIdx: null, selCard: null, selSlot, attackSquares,
    phase,
  });
}
