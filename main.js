const logBox = document.getElementById('log');
const resultArea = document.getElementById('resultArea');

let pastData = [];
let worker = new Worker('compare_worker.js');
let lastGenerated = [];
let candidateFromCsv = [];

// ---- ログ ----
function log(msg){
  logBox.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logBox.textContent;
}

// ---- 初期化 ----
worker.postMessage({cmd:'init'});
worker.onmessage = e=>{
  if(e.data.type==='evaluated'){
    render(e.data.payload);
    log("評価完了");
  }
};

// ---- 手入力UI生成（5行固定）----
const manualArea = document.getElementById('manualArea');
for(let r=0;r<5;r++){
  const row = document.createElement('div');
  for(let i=0;i<7;i++){
    const input = document.createElement('input');
    input.className = 'manual';
    row.appendChild(input);
  }
  manualArea.appendChild(row);
}

// ---- 共通バリデーション（最重要）----
function validateSets(sets){

  if(sets.length !== 5){
    alert("5行必要です");
    return false;
  }

  let all = [];

  for(const s of sets){
    if(s.length !== 7){
      alert("各行7個必要");
      return false;
    }
    all = all.concat(s);
  }

  const unique = new Set(all);

  if(unique.size !== 35){
    alert("35個ユニークになっていません（重複あり）");
    return false;
  }

  return true;
}

// ---- 手入力取得 ----
function getManual(){

  const inputs = document.querySelectorAll('.manual');
  const sets = [];

  for(let i=0;i<5;i++){
    const row = [];
    for(let j=0;j<7;j++){
      const v = Number(inputs[i*7+j].value);
      if(isNaN(v)) return [];
      row.push(v);
    }
    sets.push(row.sort((a,b)=>a-b));
  }

  return validateSets(sets) ? sets : [];
}

// ---- CSV（候補）----
document.getElementById('btnLoadCandidate').onclick = ()=>{
  const f = document.getElementById('candidateCsv').files[0];
  const r = new FileReader();

  r.onload = e=>{
    const lines = e.target.result.split(/\n/);
    const sets = [];

    for(const l of lines){
      const nums = l.split(',').map(n=>Number(n)).filter(n=>!isNaN(n));
      if(nums.length===7) sets.push(nums.sort((a,b)=>a-b));
    }

    if(validateSets(sets)){
      candidateFromCsv = sets;
      log("候補CSV OK");
    }
  };

  r.readAsText(f);
};

// ---- CSV（過去）----
document.getElementById('btnLoadCsv').onclick = ()=>{
  const f = document.getElementById('csvFile').files[0];
  const r = new FileReader();

  r.onload = e=>{
    const lines = e.target.result.split(/\n/);
    pastData = [];

    for(const l of lines){
      const nums = l.split(',').slice(-7).map(n=>Number(n)).filter(n=>!isNaN(n));
      if(nums.length===7) pastData.push(nums);
    }

    worker.postMessage({cmd:'setPastData',payload:pastData});
    log("過去データ読込："+pastData.length);
  };

  r.readAsText(f);
};

// ---- 自動生成（35ユニーク保証）----
function generate(){
  const nums = [...Array(37)].map((_,i)=>i+1);

  while(true){
    const shuffled = nums.sort(()=>Math.random()-0.5);
    const sets = [];

    for(let i=0;i<5;i++){
      sets.push(shuffled.slice(i*7,i*7+7).sort((a,b)=>a-b));
    }

    if(validateSets(sets)){
      lastGenerated = sets;
      return sets;
    }
  }
}

document.getElementById('btnGenM').onclick = ()=>{
  generate();
  log("自動生成完了");
};

// ---- 照合 ----
document.getElementById('btnCompare').onclick = ()=>{

  const range = document.getElementById('manualRange').value;

  let sets = getManual();

  if(sets.length){
    log("手入力使用");
  }
  else if(candidateFromCsv.length){
    sets = candidateFromCsv;
    log("CSV使用");
  }
  else if(lastGenerated.length){
    sets = lastGenerated;
    log("自動生成使用");
  }
  else{
    alert("候補なし");
    return;
  }

  const candidates = sets.map((s,i)=>({
    index:i+1,
    numbers:s
  }));

  worker.postMessage({
    cmd:'evaluate',
    payload:{candidates,compareRange:range}
  });
};

// ---- 表示 ----
function render(res){
  let html="<table><tr><th>No</th><th>数字</th><th>直近</th><th>全体</th></tr>";

  res.forEach(r=>{
    html+=`<tr>
      <td>${r.index}</td>
      <td>${r.numbers.join(',')}</td>
      <td>${r.recentMax}</td>
      <td>${r.fullMax}</td>
    </tr>`;
  });

  html+="</table>";
  resultArea.innerHTML = html;
}
