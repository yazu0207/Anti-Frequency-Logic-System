let pastData = [];

self.onmessage = function(e){
  const {cmd,payload} = e.data;

  if(cmd==='init'){
    self.postMessage({type:'ready'});
  }

  if(cmd==='setPastData'){
    pastData = payload || [];
  }

  if(cmd==='evaluate'){
    const result = evaluate(payload.candidates, payload.compareRange);
    self.postMessage({type:'evaluated',payload:result});
  }
};

function evaluate(candidates,range){

  const past = pastData;
  const fullSets = past.map(r=>new Set(r));

  let recent = past;
  if(range!=='all'){
    recent = past.slice(-Number(range));
  }

  const recentSets = recent.map(r=>new Set(r));

  const results=[];

  for(const c of candidates){

    let rMax=0;
    let fMax=0;

    for(const s of recentSets){
      let cnt=0;
      for(const n of c.numbers) if(s.has(n)) cnt++;
      if(cnt>rMax) rMax=cnt;
    }

    for(const s of fullSets){
      let cnt=0;
      for(const n of c.numbers) if(s.has(n)) cnt++;
      if(cnt>fMax) fMax=cnt;
    }

    results.push({
      index:c.index,
      numbers:c.numbers,
      recentMax:rMax,
      fullMax:fMax
    });
  }

  return results;
}
