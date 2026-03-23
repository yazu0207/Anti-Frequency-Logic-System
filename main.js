/* main.js
   - Mode M 生成 / UI / Worker連携（ハイブリッドC）
*/

// ---- SECTION 1 : DOM 取得 ----
const csvFileEl = document.getElementById('csvFile');
const btnLoadCsv = document.getElementById('btnLoadCsv');
const btnClearCsv = document.getElementById('btnClearCsv');
const csvInfo = document.getElementById('csvInfo');

const presetBtns = document.querySelectorAll('.preset');
const manualRange = document.getElementById('manualRange');
const currentRange = document.getElementById('currentRange');

const btnGenM = document.getElementById('btnGenM');
const btnRegenerate = document.getElementById('btnRegenerate');
const btnGenB = document.getElementById('btnGenB');
const btnGenC = document.getElementById('btnGenC');
const btnGenAll = document.getElementById('btnGenAll');
const btnCompare = document.getElementById('btnCompare');
const btnExport = document.getElementById('btnExport');

const btnFormatList = document.querySelectorAll('.btnFormat');
const statusText = document.getElementById('statusText');
const resultArea = document.getElementById('resultArea');
const logBox = document.getElementById('log');

// ---- SECTION 2 : 状態 ----
let pastData = [];         // [[n1..n7], ...]
let worker = null;
let lastResults = [];
let lastGeneratedM = null;
let regenAttempts = 0;

// ---- SECTION 3 : ログ / ステータス ----
function log(msg){
  const t = new Date().toLocaleTimeString();
  logBox.textContent = `[${t}] ${msg}\n` + logBox.textContent;
}
function setStatus(s){ statusText.textContent = s; }

// ---- SECTION 4 : CSV 読込 ----
btnLoadCsv.addEventListener('click', ()=> {
  const f = csvFileEl.files[0];
  if (!f) { alert('CSVを選択してください'); return; }
  const r = new FileReader();
  r.onload = e => {
    const txt = e.target.result;
    const lines = txt.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
    const parsed = [];
    for (const ln of lines){
      const toks = ln.split(',');
      // 末尾7項を取り数値化
      const tail = toks.slice(-7).map(t => {
        const m = (''+t).match(/\d+/);
        return m ? Number(m[0]) : NaN;
      }).filter(n => !isNaN(n));
      if (tail.length === 7) parsed.push(tail);
    }
    pastData = parsed;
    csvInfo.textContent = `読込完了：${pastData.length} 回`;
    log(`CSV読込：${pastData.length} 件`);
    // worker があれば過去データを渡す
    if (ensureWorker()) {
      worker.postMessage({ cmd:'setPastData', payload: pastData });
    }
  };
  r.readAsText(f,'utf-8');
});
btnClearCsv.addEventListener('click', ()=> { pastData = []; csvInfo.textContent='CSV未ロード'; log('CSVクリア'); });

// ---- SECTION 5 : プリセット範囲 ----
presetBtns.forEach(b => b.addEventListener('click', ()=> {
  const v = b.dataset.val;
  manualRange.value = v;
  currentRange.textContent = (v==='all' ? 'ALL' : v);
}));
manualRange.addEventListener('input', ()=> {
  currentRange.textContent = manualRange.value || 'ALL';
});

// ---- SECTION 6 : Worker 初期化 ----
function ensureWorker(){
  if (worker) return worker;
  try {
    worker = new Worker('compare_worker.js');
  } catch (err){
    alert('Worker 起動失敗: ' + err.message);
    return null;
  }
  worker.onmessage = (e) => {
    const d = e.data;
    if (!d) return;
    if (d.type === 'ready') {
      log('Worker 準備完了');
      return;
    }
    if (d.type === 'evaluated') {
      lastResults = d.payload;
      renderResults(lastResults);
      setStatus('照合完了');
      btnExport.disabled = false;
      log('評価結果受信');
      return;
    }
    if (d.type === 'log') {
      log('[Worker] ' + d.message);
    }
    if (d.type === 'error') {
      log('[Worker-ERR] ' + d.message);
      setStatus('Workerエラー');
    }
  };
  worker.onerror = (err) => { log('Worker onerror: ' + err.message); };
  worker.postMessage({ cmd:'init' });
  if (pastData.length) worker.postMessage({ cmd:'setPastData', payload: pastData });
  return worker;
}

// ---- SECTION 7 : 手入力整形 ----
btnFormatList.forEach(btn => btn.addEventListener('click', ()=> {
  const row = Number(btn.dataset.row);
  const arr = [];
  for (let i=1;i<=7;i++){
    const el = document.getElementById(`a_${row}_${i}`);
    if (!el) continue;
    const v = (''+el.value).replace(/[^\d]/g,'').trim();
    if (v) arr.push(Number(v));
  }
  const filtered = Array.from(new Set(arr.filter(n => n>=1 && n<=37))).sort((a,b)=>a-b);
  for (let i=1;i<=7;i++){
    const el = document.getElementById(`a_${row}_${i}`);
    if (el) el.value = filtered[i-1] || '';
  }
  log(`手入力整形 M${row} -> ${filtered.join(',')}`);
}));

// ---- SECTION 8 : 周波数計算 / 35個選択 ----
function computeFreqs(range){
  const countsRecent = new Array(38).fill(0);
  const countsAll = new Array(38).fill(0);
  if (!pastData || pastData.length===0) return { countsRecent, countsAll, totalRecent:0 };
  for (const row of pastData) for (const n of row) countsAll[n]++;
  const slice = (range==='all') ? pastData.slice() : pastData.slice(-Number(range));
  for (const row of slice) for (const n of row) countsRecent[n]++;
  return { countsRecent, countsAll, totalRecent: slice.length };
}
function pick35(range){
  const { countsRecent, countsAll } = computeFreqs(range);
  const arr = [];
  for (let i=1;i<=37;i++) arr.push({n:i,recent:countsRecent[i],all:countsAll[i]});
  arr.sort((a,b)=>{
    if (a.recent !== b.recent) return a.recent - b.recent;
    if (a.all !== b.all) return a.all - b.all;
    return a.n - b.n;
  });
  return arr.slice(0,35).map(x=>x.n);
}

// ---- SECTION 9 : M群生成ロジック（35個->5通り）----

function shuffle(array){
  for(let i=array.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [array[i],array[j]]=[array[j],array[i]];
  }
  return array;
}

function generateMgroup(range){
  if (!pastData || pastData.length===0){
    alert('まずCSVを読み込んでください');
    return null;
  }

  const chosen35 = pick35(range);

  // --- M1：逆張り強度高（上位14からランダム） ---
  const poolTop = shuffle([...chosen35.slice(0,14)]);
  const m1 = poolTop.slice(0,7).sort((a,b)=>a-b);

  // --- 残り28個 ---
  const remaining = chosen35.filter(x => !m1.includes(x));

  // ★ ここが変更点：大小混在の完全ランダム化
  const mixed = shuffle([...remaining]);

  const groups = [];

  for(let i=0;i<4;i++){
    let seg = mixed.slice(i*7, i*7+7);

    // 念のため7個保証
    while(seg.length < 7){
      const unused = [...Array(37).keys()]
        .map(k=>k+1)
        .filter(x =>
          !m1.includes(x) &&
          !seg.includes(x) &&
          !groups.flat().includes(x)
        );
      seg.push(unused[Math.floor(Math.random()*unused.length)]);
    }

    // 表示用に昇順整列
    seg.sort((a,b)=>a-b);
    groups.push(seg);
  }

  const all5 = [m1, ...groups];
  lastGeneratedM = all5;
  regenAttempts = 0;

  log('M群生成（35個→5通り｜大小混在ランダム）完了');
  return all5;
}

// ---- SECTION 10 : UI レンダリング ----
function determineRank(recentMax, fullMax){
  if (fullMax >= 6) return {rank:'NG', cls:'NG', comment:'全履歴で6〜7一致（警告）'};
  if (recentMax <= 1) return {rank:'S', cls:'S', comment:'期待値高め／逆張り優勢'};
  if (recentMax === 2) return {rank:'A', cls:'A', comment:'良好／逆張り傾向確認'};
  if (recentMax === 3) return {rank:'B', cls:'B', comment:'様子見／部分的に重複あり'};
  if (recentMax === 4) return {rank:'C', cls:'C', comment:'危険域／再抽選推奨'};
  if (recentMax === 5) return {rank:'D', cls:'D', comment:'再抽選強く推奨'};
  return {rank:'-', cls:'', comment:''};
}

function renderResults(results){
  let html = '<table><thead><tr><th>種別</th><th>No</th><th>数字</th><th>直近Max</th><th>全履歴Max</th><th>評価</th><th>再抽選回数</th></tr></thead><tbody>';
  for (const r of results){
    const rank = determineRank(r.recentMax, r.fullMax);
    const nums = (Array.isArray(r.numbers)? r.numbers.join(' ') : '');
    html += `<tr>
      <td>${r.type}</td>
      <td>${r.index}</td>
      <td>${nums}</td>
      <td>${r.recentMax}${r.recentRound?'<div class="small">'+r.recentRound+'</div>':''}</td>
      <td>${r.fullMax}${r.fullRound?'<div class="small">'+r.fullRound+'</div>':''}</td>
      <td><div class="badge ${rank.cls}">${rank.rank}</div><div class="small">${rank.comment}</div></td>
      <td>${r.retries||0}</td>
    </tr>`;
  }
  html += '</tbody></table>';
  resultArea.innerHTML = html;
}

// ---- SECTION 11 : Worker へ評価リクエスト（重要: 先に過去データを渡す） ----
function requestEvaluation(candidates, compareRange){
  if (!ensureWorker()) return;
  // pass pastData to worker (so worker has both recent slice & full history)
  worker.postMessage({ cmd:'setPastData', payload: pastData });
  // small delay to ensure worker stored data
  setStatus('照合中...');
  setTimeout(()=> {
    worker.postMessage({ cmd:'evaluate', payload:{ candidates, compareRange } });
    log('Worker に評価送信');
  }, 50);
}

// ---- SECTION 12 : ボタン処理 ----
btnGenM.addEventListener('click', ()=> {
  const range = manualRange.value || '30';
  const groups = generateMgroup(range);
  if (!groups) return;
  const candidates = groups.map((g,i)=>({ type:'M', index:i+1, numbers:g }));
  requestEvaluation(candidates, range);
  setStatus('M群生成→評価中');
});

btnRegenerate.addEventListener('click', ()=> {
  regenAttempts++;
  log(`再抽選 #${regenAttempts}`);
  const range = manualRange.value || '30';
  const groups = generateMgroup(range);
  const candidates = groups.map((g,i)=>({ type:'M', index:i+1, numbers:g, retries: regenAttempts }));
  requestEvaluation(candidates, range);
  setStatus('再抽選→評価中');
});

btnGenB.addEventListener('click', ()=> {
  const pool = [...Array(37).keys()].map(k=>k+1); shuffle(pool);
  const b = [];
  for (let i=0;i<5;i++) b.push(pool.slice(i*7, i*7+7));
  const cand = b.map((g,i)=>({ type:'B', index:i+1, numbers:g }));
  requestEvaluation(cand, manualRange.value || '30');
});
btnGenC.addEventListener('click', ()=> {
  const cand = [];
  for (let i=0;i<5;i++) cand.push({ type:'C', index:i+1, numbers: shuffle([...Array(37).keys()].map(k=>k+1)).slice(0,7).sort((a,b)=>a-b) });
  requestEvaluation(cand, manualRange.value || '30');
});

btnGenAll.addEventListener('click', ()=> {
  const range = manualRange.value || '30';
  const m = generateMgroup(range);
  const pool = [...Array(37).keys()].map(k=>k+1); shuffle(pool);
  const b = []; for (let i=0;i<5;i++) b.push(pool.slice(i*7, i*7+7));
  const c = []; for (let i=0;i<5;i++) c.push(shuffle([...Array(37).keys()].map(k=>k+1)).slice(0,7).sort((a,b)=>a-b));
  const combined = [...m.map((g,i)=>({type:'M',index:i+1,numbers:g})), ...b.map((g,i)=>({type:'B',index:i+1,numbers:g})), ...c.map((g,i)=>({type:'C',index:i+1,numbers:g}))];
  requestEvaluation(combined, range);
});

btnCompare.addEventListener('click', ()=> {
  // build candidates from manual inputs + generated M
  const manualSets = [];
  for (let r=1;r<=5;r++){
    const arr = [];
    for (let i=1;i<=7;i++){
      const el = document.getElementById(`a_${r}_${i}`);
      if (el && el.value) arr.push(Number(String(el.value).replace(/[^\d]/g,'')));
    }
    manualSets.push((arr.length===7 && new Set(arr).size===7) ? arr.sort((a,b)=>a-b) : null);
  }
  const candidates = [];
  for (let i=0;i<manualSets.length;i++){
    if (manualSets[i]) candidates.push({ type:'M', index:i+1, numbers: manualSets[i] });
  }
  if (lastGeneratedM){
    for (let i=0;i<lastGeneratedM.length;i++){
      if (!candidates.find(c=>c.type==='M' && c.index===i+1)) candidates.push({ type:'M', index:i+1, numbers:lastGeneratedM[i] });
    }
  }
  if (candidates.length===0){ alert('手入力または生成で候補を作成してください'); return; }
  requestEvaluation(candidates, manualRange.value || '30');
});

btnExport.addEventListener('click', ()=> {
  if (!lastResults || lastResults.length===0){ alert('出力データがありません'); return; }
  // filename: date + time
  const now = new Date();
  const fn = `loto7_result_${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}.csv`;
  // build CSV rows
  const header = ['種別','No','n1','n2','n3','n4','n5','n6','n7','直近Max','直近回','全履歴Max','全履歴回','評価','コメント','再抽選回数','比較範囲'];
  const lines = [header.join(',')];
  for (const r of lastResults){
    const n = r.numbers || [];
    const rank = determineRankForExport(r.recentMax, r.fullMax);
    const row = [
      r.type, r.index,
      n[0]||'', n[1]||'', n[2]||'', n[3]||'', n[4]||'', n[5]||'', n[6]||'',
      r.recentMax||'', r.recentRound||'', r.fullMax||'', r.fullRound||'',
      rank.rank, `"${rank.comment.replace(/"/g,'""')}"`, r.retries||0, manualRange.value || '30'
    ];
    lines.push(row.join(','));
  }
  const blob = new Blob(['\uFEFF'+lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fn; a.click();
  log(`CSV 出力: ${fn}`);
});

function determineRankForExport(recentMax, fullMax){
  if (fullMax >= 6) return {rank:'NG', comment:'全履歴6〜7一致（警告）'};
  if (recentMax <= 1) return {rank:'S', comment:'期待値高め／逆張り優勢'};
  if (recentMax === 2) return {rank:'A', comment:'良好／逆張り傾向確認'};
  if (recentMax === 3) return {rank:'B', comment:'様子見／部分的に重複あり'};
  if (recentMax === 4) return {rank:'C', comment:'危険域／再抽選推奨'};
  if (recentMax === 5) return {rank:'D', comment:'再抽選強く推奨'};
  return {rank:'-', comment:''};
}

// ---- SECTION 13 : ユーティリティ / 終了処理 ----
window.addEventListener('beforeunload', ()=> { if (worker) worker.terminate(); });
window.addEventListener('load', ()=> {
  manualRange.value = '30'; currentRange.textContent = '30';
  setStatus('準備完了');
});

