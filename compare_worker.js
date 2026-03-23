// compare_worker.js

let pastData = [];

// 初期化
self.onmessage = function(e){
  const { cmd, payload } = e.data || {};

  try {

    if (cmd === 'init'){
      self.postMessage({ type:'ready' });
      return;
    }

    if (cmd === 'setPastData'){
      pastData = payload || [];
      return;
    }

    if (cmd === 'evaluate'){
      const result = evaluateCandidates(payload.candidates, payload.compareRange);
      self.postMessage({ type:'evaluated', payload: result });
      return;
    }

  } catch(err){
    self.postMessage({ type:'error', message: err.message });
  }
};


// ===== 評価ロジック =====
function evaluateCandidates(candidates, compareRange){

  const past = pastData.length > 0 ? pastData.slice(1) : [];

  const fullSets = past.map(r => new Set(r.slice(0,7)));

  let recentSlice = past;
  if (compareRange !== 'all'){
    const n = Number(compareRange) || 30;
    recentSlice = past.slice(Math.max(0, past.length - n));
  }

  const recentSets = recentSlice.map(r => new Set(r.slice(0,7)));

  const results = [];

  for (const cand of candidates){

    const nums = (cand.numbers || []).slice(0,7);
    const sNums = new Set(nums);

    let recentMax = 0;
    let recentRoundLabel = '';

    for (let i=0;i<recentSets.length;i++){
      let cnt = 0;
      for (const v of sNums) if (recentSets[i].has(v)) cnt++;

      if (cnt >= recentMax){
        recentMax = cnt;
        const idx = (past.length - recentSets.length) + i + 1;
        recentRoundLabel = `第${idx}回`;
      }
    }

    let fullMax = 0;
    let fullRoundLabel = '';

    for (let i=0;i<fullSets.length;i++){
      let cnt = 0;
      for (const v of sNums) if (fullSets[i].has(v)) cnt++;

      if (cnt >= fullMax){
        fullMax = cnt;
        fullRoundLabel = `第${i+1}回`;
      }
    }

    results.push({
      type: cand.type || 'M',
      index: cand.index || 0,
      numbers: nums,
      recentMax,
      recentRound: recentRoundLabel,
      fullMax,
      fullRound: fullRoundLabel,
      retries: cand.retries || 0
    });
  }

  return results;
}