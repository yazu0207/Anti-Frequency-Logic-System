// ---- DOM ----
const csvFileEl = document.getElementById('csvFile');
const btnLoadCsv = document.getElementById('btnLoadCsv');
const csvInfo = document.getElementById('csvInfo');
const btnGenM = document.getElementById('btnGenM');
const btnCompare = document.getElementById('btnCompare');
const resultArea = document.getElementById('resultArea');
const logBox = document.getElementById('log');

let pastData = [];
let worker = null;
let lastGenerated = [];

// ---- ログ ----
function log(msg){
  const t = new Date().toLocaleTimeString();
  logBox.textContent = `[${t}] ${msg}\n` + logBox.textContent;
}

// ---- Worker ----
function initWorker(){
  worker = new Worker('compare_worker.js');

  worker.onmessage = e=>{
    if(e.data.type==='ready'){
      log("Worker準備完了");
    }
    if(e.data.type==='evaluated'){
      render(e.data.payload);
      log("評価完了");
    }
  };

  worker.postMessage({cmd:'init'});
}

// ---- CSV ----
btnLoadCsv.onclick = ()=>{
  const f = csvFileEl.files[0];
  if(!f){alert("CSV選択");return;}

  const r = new FileReader();
  r.onload = e=>{
    const lines = e.target.result.split(/\n/);
    pastData = [];

    for(const l of lines){
      const nums = l.split(',').slice(-7).map(n=>Number(n)).filter(n=>!isNaN(n));
      if(nums.length===7) pastData.push(nums);
    }

    csvInfo.textContent = `読込：${pastData.length}件`;
    log("CSV読込完了");

    worker.postMessage({cmd:'setPastData',payload:pastData});
  };
  r.readAsText(f);
};

// ---- M生成 ----
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function generateM(){
  const nums = shuffle([...Array(37)].map((_,i)=>i+1));
  const res = [];
  for(let i=0;i<5;i++){
    res.push(nums.slice(i*7,i*7+7).sort((a,b)=>a-b));
  }
  lastGenerated = res;
  return res;
}

btnGenM.onclick = ()=>{
  const g = generateM();
  log("M生成");
  console.log(g);
};

// ---- 照合 ----
btnCompare.onclick = ()=>{
  if(!lastGenerated.length){
    alert("先に生成してください");
    return;
  }

  const range = document.getElementById('manualRange').value;

  const candidates = lastGenerated.map((g,i)=>({
    type:'M',
    index:i+1,
    numbers:g
  }));

  worker.postMessage({
    cmd:'evaluate',
    payload:{candidates,compareRange:range}
  });

  log("照合実行");
};

// ---- 表示 ----
function render(res){
  let html="<table><tr><th>No</th><th>数字</th><th>直近一致</th><th>全一致</th></tr>";

  res.forEach(r=>{
    html+=`<tr>
      <td>${r.index}</td>
      <td>${r.numbers.join(',')}</td>
      <td>${r.recentMax}</td>
      <td>${r.fullMax}</td>
    </tr>`;
  });

  html+="</table>";
  resultArea.innerHTML=html;
}

// ---- 初期化 ----
initWorker();
