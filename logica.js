(function(){
"use strict";

/* ===================== utilities ===================== */
const SVGNS = "http://www.w3.org/2000/svg";
function el(tag, attrs, kids){
  const n = document.createElementNS(SVGNS, tag);
  if(attrs) for(const k in attrs) n.setAttribute(k, attrs[k]);
  if(kids) kids.forEach(c=>n.appendChild(c));
  return n;
}
function randInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }
function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function fmtCap(c){ return (c===Infinity) ? "∞" : String(c); }
function letterFor(idx){ return String.fromCharCode(65+idx); } // A..Z, idx<16 -> A..P

/* ===================== state ===================== */
const S = {
  n:null, mode:null,
  nodes:[], edges:[],
  nextNodeSeq:0, nextEdgeId:1,
  addNodeMode:false, addEdgeMode:false, pendingFrom:null,
  dragId:null,
  sourceId:null, sinkId:null,
  originalSources:[], originalSinks:[],
  dummySourceId:null, dummySinkId:null,
  history:[],
  lastSearch:null, // {found, pathNodes, edgesUsed, delta, visited}
  finalCut:null
};

function resetAll(){
  S.n=null; S.mode=null; S.nodes=[]; S.edges=[]; S.nextNodeSeq=0; S.nextEdgeId=1;
  S.addNodeMode=false; S.addEdgeMode=false; S.pendingFrom=null; S.dragId=null;
  S.sourceId=null; S.sinkId=null; S.originalSources=[]; S.originalSinks=[];
  S.dummySourceId=null; S.dummySinkId=null; S.history=[]; S.lastSearch=null; S.finalCut=null;
  document.getElementById("nInput").value = 9;
  document.getElementById("nError").textContent = "";
  showScreen("setup");
}

function findNode(id){ return S.nodes.find(x=>x.id===id); }
function findEdge(id){ return S.edges.find(x=>x.id===id); }
function outEdges(id){ return S.edges.filter(e=>e.u===id); }
function inEdges(id){ return S.edges.filter(e=>e.v===id); }

/* ===================== screen switching ===================== */
function showScreen(name){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById("screen-"+name).classList.add("active");
  document.querySelectorAll("#stageTrack span").forEach(s=>{
    s.classList.toggle("on", s.dataset.s===name);
  });
}

/* ===================== cycle detection ===================== */
function canReach(from,to,edges){
  if(from===to) return true;
  const visited = new Set([from]);
  const stack=[from];
  while(stack.length){
    const x = stack.pop();
    for(const e of edges){
      if(e.u===x && !visited.has(e.v)){
        if(e.v===to) return true;
        visited.add(e.v); stack.push(e.v);
      }
    }
  }
  return false;
}
function wouldCreateCycle(u,v,edges){
  if(u===v) return true;
  return canReach(v,u,edges);
}

/* ===================== layered layout ===================== */
function computeRanks(nodes, edges){
  const indeg = {}; nodes.forEach(nd=>indeg[nd.id]=0);
  edges.forEach(e=>{ indeg[e.v] = (indeg[e.v]||0)+1; });
  const rank = {}; nodes.forEach(nd=>rank[nd.id]=0);
  const queue = nodes.filter(nd=>indeg[nd.id]===0).map(nd=>nd.id);
  const indegCopy = Object.assign({}, indeg);
  const order=[];
  const q = queue.slice();
  while(q.length){
    const u = q.shift(); order.push(u);
    edges.filter(e=>e.u===u).forEach(e=>{
      rank[e.v] = Math.max(rank[e.v], rank[u]+1);
      indegCopy[e.v]--;
      if(indegCopy[e.v]===0) q.push(e.v);
    });
  }
  return rank;
}
function autoLayout(nodes, edges, width, height){
  if(nodes.length===0) return;
  const rank = computeRanks(nodes, edges);
  const maxRank = Math.max(0, ...nodes.map(n=>rank[n.id]||0));
  const byRank = {};
  nodes.forEach(nd=>{
    const r = rank[nd.id]||0;
    (byRank[r] = byRank[r]||[]).push(nd);
  });
  const marginX = 70, marginY = 55;
  const colGap = maxRank>0 ? (width-2*marginX)/maxRank : 0;
  Object.keys(byRank).forEach(rk=>{
    const list = byRank[rk];
    const gap = (height-2*marginY)/(Math.max(list.length,1));
    list.forEach((nd,i)=>{
      nd.x = marginX + Number(rk)*colGap;
      nd.y = marginY + gap*i + gap/2 - (list.length===1? (0):0);
      if(list.length===1) nd.y = height/2;
    });
  });
}

/* ===================== rendering ===================== */
const NODE_R = 19;
function nodeColor(nd){
  if(nd.role==="dummy-source"||nd.role==="dummy-sink") return "#b39cf2";
  if(nd.role==="source") return "#f2b134";
  if(nd.role==="sink") return "#ef6461";
  return "#2a3f52";
}
function nodeStroke(nd){
  if(nd.role==="dummy-source"||nd.role==="dummy-sink") return "#8a6fe0";
  if(nd.role==="source") return "#c98d17";
  if(nd.role==="sink") return "#c94643";
  return "#4fd1c5";
}

function renderGraph(svg, opts){
  opts = opts || {};
  svg.innerHTML = "";
  // defs (arrowheads)
  const defs = el("defs");
  ["arrow-def","arrow-active","arrow-cut"].forEach((id,i)=>{
    const color = i===0? "#5c7186" : (i===1? "#4fd1c5" : "#ef6461");
    const marker = el("marker",{id:id, markerWidth:"8", markerHeight:"8", refX:"7", refY:"4", orient:"auto"});
    marker.appendChild(el("path",{d:"M0,0 L8,4 L0,8 Z", fill:color}));
    defs.appendChild(marker);
  });
  svg.appendChild(defs);

  // background capture rect for add-node clicks
  const bg = el("rect",{x:0,y:0,width:1000,height:560,fill:"transparent"});
  bg.addEventListener("click", onCanvasBgClick);
  svg.appendChild(bg);

  const highlightEdgeIds = new Set((opts.pathEdges||[]).map(x=>x.edgeId));
  const cutEdgeIds = new Set((opts.cutEdges||[]).map(e=>e.id));

  // edges
  S.edges.forEach(e=>{
    const a = findNode(e.u), b = findNode(e.v);
    if(!a||!b) return;
    const dx=b.x-a.x, dy=b.y-a.y; const dist=Math.hypot(dx,dy)||1;
    const ux=dx/dist, uy=dy/dist;
    const x1=a.x+ux*NODE_R, y1=a.y+uy*NODE_R;
    const x2=b.x-ux*NODE_R, y2=b.y-uy*NODE_R;
    let stroke="#3c5164", width="1.6", marker="url(#arrow-def)", dash="";
    let isCut=false;
    if(cutEdgeIds.has(e.id)){ stroke="#ef6461"; width="3"; marker="url(#arrow-cut)"; isCut=true; }
    else if(highlightEdgeIds.has(e.id)){ stroke="#4fd1c5"; width="3"; marker="url(#arrow-active)"; }
    else if(opts.showFlow && e.flow>0){ stroke="#5c8aa8"; width="2"; }
    const line = el("line",{x1,y1,x2,y2,stroke,"stroke-width":width,"marker-end":marker});
    if(isCut) line.setAttribute("stroke-dasharray","6,4");
    svg.appendChild(line);

    // label
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    const perpx=-uy*13, perpy=ux*13;
    let text = opts.showFlow ? (fmtCap(e.cap)+","+e.flow) : fmtCap(e.cap);
    let labelColor = "#c7d5e0";
    if(opts.showFlow && e.flow===e.cap && e.cap!==0) labelColor="#f2b134";
    if(highlightEdgeIds.has(e.id)) labelColor="#4fd1c5";
    const tW = 9*text.length + 8;
    svg.appendChild(el("rect",{x:mx+perpx-tW/2, y:my+perpy-9, width:tW, height:16, fill:"#0e1620", opacity:"0.92", rx:"2"}));
    const t = el("text",{x:mx+perpx, y:my+perpy+3, "text-anchor":"middle","font-size":"11.5","font-family":"IBM Plex Mono, monospace", fill:labelColor});
    t.textContent = text;
    svg.appendChild(t);
  });

  // nodes
  S.nodes.forEach(nd=>{
    const g = el("g",{transform:`translate(${nd.x},${nd.y})`, style:"cursor:grab"});
    let fill = nodeColor(nd), stroke = nodeStroke(nd), swidth="2";
    if(opts.setColorS && opts.setColorS.has(nd.id)){ fill="#f2b134"; stroke="#c98d17"; }
    if(opts.setColorT && opts.setColorT.has(nd.id)){ fill="#ef6461"; stroke="#c94643"; }
    if(opts.visitedSet && opts.visitedSet.has(nd.id) && !opts.setColorS && !opts.setColorT){
      stroke="#4fd1c5"; swidth="3";
    }
    if(opts.pathNodeSet && opts.pathNodeSet.has(nd.id)){ swidth="3.5"; stroke="#4fd1c5"; }
    const circle = el("circle",{r:NODE_R, fill, stroke, "stroke-width":swidth});
    g.appendChild(circle);
    const t = el("text",{x:0,y:5,"text-anchor":"middle","font-size":"13","font-family":"Space Grotesk, sans-serif","font-weight":"600", fill:"#0d1620"});
    t.textContent = nd.label;
    g.appendChild(t);
    if(opts.interactive!==false){
      g.addEventListener("mousedown", (ev)=>onNodeMouseDown(ev, nd, svg));
      g.addEventListener("touchstart", (ev)=>onNodeMouseDown(ev, nd, svg, true), {passive:false});
    }
    svg.appendChild(g);
  });
}

function svgPoint(svg, clientX, clientY){
  const pt = svg.createSVGPoint();
  pt.x=clientX; pt.y=clientY;
  const ctm = svg.getScreenCTM().inverse();
  return pt.matrixTransform(ctm);
}

/* ---- editor interactions ---- */
function onCanvasBgClick(ev){
  if(!S.addNodeMode) return;
  const svg = ev.target.ownerSVGElement || ev.target;
  const pt = svgPoint(svg, ev.clientX, ev.clientY);
  if(S.nodes.length >= S.n){
    showMsg("editorMsg","Ya se colocaron los "+S.n+" nodos requeridos.","info");
    return;
  }
  const x = Math.min(Math.max(pt.x, 40), 960);
  const y = Math.min(Math.max(pt.y, 40), 520);
  const nd = {id:"n"+(S.nextNodeSeq), label:letterFor(S.nextNodeSeq), x, y, role:"normal"};
  S.nextNodeSeq++;
  S.nodes.push(nd);
  refreshEditor();
}

async function onNodeMouseDown(ev, nd, svg, isTouch){
  ev.stopPropagation();
  if(S.addEdgeMode){
    if(S.pendingFrom===null){
      S.pendingFrom = nd.id;
      showMsg("editorMsg","Origen elegido: "+nd.label+". Ahora haz clic en el nodo destino.","info");
      refreshEditor();
    } else if(S.pendingFrom===nd.id){
      S.pendingFrom=null; refreshEditor();
    } else {
      const u = S.pendingFrom, v = nd.id;
      if(wouldCreateCycle(u,v,S.edges)){
        showMsg("editorMsg","⚠ Esa arista formaría un ciclo ("+findNode(u).label+"→"+nd.label+"). El grafo debe ser acíclico. Elige otro destino.","err");
        S.pendingFrom=null; refreshEditor();
        return;
      }
      const dup = S.edges.find(e=>e.u===u&&e.v===v);
      if(dup){
        showMsg("editorMsg","Ya existe una arista "+findNode(u).label+"→"+nd.label+".","err");
        S.pendingFrom=null; refreshEditor();
        return;
      }
      const cap = await askCapacity(findNode(u).label+" → "+nd.label);
      S.pendingFrom=null;
      if(cap===null){ refreshEditor(); return; }
      S.edges.push({id:S.nextEdgeId++, u, v, cap, flow:0});
      showMsg("editorMsg","Arista agregada: "+findNode(u).label+" → "+nd.label+" (cap "+cap+")","ok");
      refreshEditor();
    }
    return;
  }
  // drag mode
  S.dragId = nd.id;
  const move = (mv)=>{
    const point = isTouch ? mv.touches[0] : mv;
    const pt = svgPoint(svg, point.clientX, point.clientY);
    nd.x = Math.min(Math.max(pt.x,40),960);
    nd.y = Math.min(Math.max(pt.y,40),520);
    refreshEditor(true);
  };
  const up = ()=>{
    S.dragId=null;
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    window.removeEventListener("touchmove", move);
    window.removeEventListener("touchend", up);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
  window.addEventListener("touchmove", move, {passive:false});
  window.addEventListener("touchend", up);
}

function showMsg(id, text, type){
  const box = document.getElementById(id);
  box.textContent = text;
  box.className = "msgbar show "+(type||"info");
  clearTimeout(box._t);
  box._t = setTimeout(()=>{ box.classList.remove("show"); }, 4200);
}

/* ---- capacity modal ---- */
function askCapacity(labelText){
  return new Promise(resolve=>{
    const overlay = document.getElementById("capModalOverlay");
    const sub = document.getElementById("capModalSub");
    const input = document.getElementById("capModalInput");
    sub.textContent = "Arco "+labelText+" — ingresa un entero positivo.";
    input.value = 10;
    overlay.classList.add("show");
    input.focus(); input.select();
    function cleanup(){
      overlay.classList.remove("show");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKey);
    }
    function onOk(){
      const v = parseInt(input.value,10);
      if(!Number.isInteger(v) || v<=0){ input.style.borderColor="#ef6461"; return; }
      cleanup(); resolve(v);
    }
    function onCancel(){ cleanup(); resolve(null); }
    function onKey(e){ if(e.key==="Enter") onOk(); if(e.key==="Escape") onCancel(); }
    const okBtn = document.getElementById("capModalOk");
    const cancelBtn = document.getElementById("capModalCancel");
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    input.addEventListener("keydown", onKey);
  });
}

/* ===================== editor refresh ===================== */
function refreshEditor(skipTable){
  document.getElementById("nodeCount").textContent = S.nodes.length;
  document.getElementById("nodeTarget").textContent = S.n;
  renderGraph(document.getElementById("editorSvg"), {showFlow:false, interactive:true,
    pathNodeSet: S.pendingFrom? new Set([S.pendingFrom]) : null});
  document.getElementById("btnToEndpoints").disabled = !(S.nodes.length===S.n && S.edges.length>=1);
  if(skipTable) return;
  // edge table
  const tbody = document.getElementById("edgeTableBody");
  tbody.innerHTML="";
  document.getElementById("edgeEmptyMsg").style.display = S.edges.length? "none":"block";
  S.edges.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${findNode(e.u).label}</td><td>${findNode(e.v).label}</td><td>${e.cap}</td><td><button class="rm" data-id="${e.id}" title="Eliminar">✕</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".rm").forEach(b=>{
    b.addEventListener("click", ()=>{
      const id = Number(b.dataset.id);
      S.edges = S.edges.filter(e=>e.id!==id);
      refreshEditor();
    });
  });
  // form selects
  const from = document.getElementById("formFrom"), to = document.getElementById("formTo");
  const cur1=from.value, cur2=to.value;
  from.innerHTML=""; to.innerHTML="";
  S.nodes.forEach(nd=>{
    from.appendChild(new Option(nd.label, nd.id));
    to.appendChild(new Option(nd.label, nd.id));
  });
  if(cur1) from.value=cur1; if(cur2) to.value=cur2;
}

/* form add edge */
document.getElementById("formAddBtn").addEventListener("click", ()=>{
  const u = document.getElementById("formFrom").value;
  const v = document.getElementById("formTo").value;
  const cap = parseInt(document.getElementById("formCap").value,10);
  if(!u||!v){ showMsg("editorMsg","Selecciona ambos nodos.","err"); return; }
  if(u===v){ showMsg("editorMsg","Un nodo no puede conectarse consigo mismo.","err"); return; }
  if(!Number.isInteger(cap)||cap<=0){ showMsg("editorMsg","La capacidad debe ser un entero positivo.","err"); return; }
  if(S.edges.find(e=>e.u===u&&e.v===v)){ showMsg("editorMsg","Esa arista ya existe.","err"); return; }
  if(wouldCreateCycle(u,v,S.edges)){
    showMsg("editorMsg","⚠ Esa arista formaría un ciclo ("+findNode(u).label+"→"+findNode(v).label+"). Corrige la estructura antes de continuar.","err");
    return;
  }
  S.edges.push({id:S.nextEdgeId++, u, v, cap, flow:0});
  document.getElementById("formCap").value="";
  showMsg("editorMsg","Arista agregada: "+findNode(u).label+" → "+findNode(v).label,"ok");
  refreshEditor();
});

/* ===================== random generation ===================== */
function generateRandomGraph(n){
  S.nodes=[]; S.edges=[]; S.nextNodeSeq=0; S.nextEdgeId=1;
  for(let i=0;i<n;i++){
    S.nodes.push({id:"n"+i, label:letterFor(i), x:0,y:0, role:"normal"});
  }
  S.nextNodeSeq = n;
  const order = shuffle(S.nodes.map(nd=>nd.id));
  const p = Math.min(0.55, 3.2/(n-1));
  for(let i=0;i<order.length;i++){
    for(let j=i+1;j<order.length;j++){
      if(Math.random()<p){
        S.edges.push({id:S.nextEdgeId++, u:order[i], v:order[j], cap:randInt(1,20), flow:0});
      }
    }
  }
  // ensure no isolated nodes
  order.forEach((id,idx)=>{
    const has = S.edges.some(e=>e.u===id||e.v===id);
    if(!has){
      if(idx>0){ S.edges.push({id:S.nextEdgeId++, u:order[idx-1], v:id, cap:randInt(1,20), flow:0}); }
      else if(order.length>1){ S.edges.push({id:S.nextEdgeId++, u:id, v:order[1], cap:randInt(1,20), flow:0}); }
    }
  });
  autoLayout(S.nodes, S.edges, 1000, 560);
}

/* ===================== setup screen wiring ===================== */
document.getElementById("cardManual").addEventListener("click", ()=>startEditor("manual"));
document.getElementById("cardRandom").addEventListener("click", ()=>startEditor("random"));

function startEditor(mode){
  const n = parseInt(document.getElementById("nInput").value,10);
  if(!Number.isInteger(n) || n<7 || n>16){
    document.getElementById("nError").textContent = "Ingresa un entero entre 7 y 16.";
    document.getElementById("nError").style.color = "var(--coral)";
    return;
  }
  document.getElementById("nError").textContent = "";
  S.n = n; S.mode = mode;
  S.nodes=[]; S.edges=[]; S.nextNodeSeq=0; S.nextEdgeId=1; S.addNodeMode=false; S.addEdgeMode=false; S.pendingFrom=null;
  document.getElementById("btnRegen").style.display = mode==="random" ? "inline-block" : "none";
  if(mode==="random"){ generateRandomGraph(n); }
  showScreen("editor");
  refreshEditor();
  setToolMode(mode==="random" ? null : "node");
}

function setToolMode(which){
  S.addNodeMode = which==="node";
  S.addEdgeMode = which==="edge";
  S.pendingFrom=null;
  document.getElementById("btnAddNode").classList.toggle("toggled", S.addNodeMode);
  document.getElementById("btnAddEdge").classList.toggle("toggled", S.addEdgeMode);
  refreshEditor(true);
}
document.getElementById("btnAddNode").addEventListener("click", ()=>setToolMode(S.addNodeMode? null:"node"));
document.getElementById("btnAddEdge").addEventListener("click", ()=>setToolMode(S.addEdgeMode? null:"edge"));
document.getElementById("btnLayout").addEventListener("click", ()=>{ autoLayout(S.nodes,S.edges,1000,560); refreshEditor(true); });
document.getElementById("btnRegen").addEventListener("click", ()=>{ generateRandomGraph(S.n); refreshEditor(); });
document.getElementById("btnResetGraph").addEventListener("click", ()=>{
  if(S.mode==="random"){ generateRandomGraph(S.n); } else { S.nodes=[]; S.edges=[]; S.nextNodeSeq=0; S.nextEdgeId=1; }
  setToolMode(S.mode==="random"?null:"node");
  refreshEditor();
});
document.getElementById("btnToEndpoints").addEventListener("click", ()=>{
  setToolMode(null);
  buildEndpointsScreen();
  showScreen("endpoints");
});

/* ===================== endpoints screen ===================== */
function buildEndpointsScreen(){
  const body = document.getElementById("endpointBody");
  body.innerHTML="";
  S.nodes.forEach(nd=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${nd.label}</td>
      <td><input type="checkbox" class="src-cb" data-id="${nd.id}"></td>
      <td><input type="checkbox" class="snk-cb" data-id="${nd.id}"></td>`;
    body.appendChild(tr);
  });
  document.getElementById("endpointPreviewPanel").style.display="none";
  document.getElementById("btnToAlgo").disabled = true;
  document.getElementById("endpointError").textContent="";

  body.querySelectorAll(".src-cb").forEach(cb=>cb.addEventListener("change", onEndpointCheck));
  body.querySelectorAll(".snk-cb").forEach(cb=>cb.addEventListener("change", onEndpointCheck));
}
function onEndpointCheck(ev){
  const id = ev.target.dataset.id;
  const isSrc = ev.target.classList.contains("src-cb");
  const body = document.getElementById("endpointBody");
  if(ev.target.checked){
    const other = body.querySelector((isSrc?".snk-cb":".src-cb")+`[data-id="${id}"]`);
    if(other.checked){ other.checked=false; }
  }
  validateEndpoints();
}
function validateEndpoints(){
  const body = document.getElementById("endpointBody");
  const srcs = Array.from(body.querySelectorAll(".src-cb:checked")).map(c=>c.dataset.id);
  const snks = Array.from(body.querySelectorAll(".snk-cb:checked")).map(c=>c.dataset.id);
  const err = document.getElementById("endpointError");
  if(srcs.length===0 || snks.length===0){
    err.textContent = "Selecciona al menos un nodo fuente y un nodo sumidero.";
    document.getElementById("btnToAlgo").disabled = true;
    document.getElementById("endpointPreviewPanel").style.display="none";
    return;
  }
  err.textContent="";
  document.getElementById("btnToAlgo").disabled = false;
  S.originalSources = srcs; S.originalSinks = snks;
  previewEndpoints();
}
function previewEndpoints(){
  // clone nodes/edges + potential dummies for preview only (not committed)
  const previewNodes = S.nodes.map(n=>Object.assign({},n,{role:"normal"}));
  S.originalSources.forEach(id=>{ previewNodes.find(n=>n.id===id).role="source"; });
  S.originalSinks.forEach(id=>{ previewNodes.find(n=>n.id===id).role="sink"; });
  const previewEdges = S.edges.map(e=>Object.assign({},e));
  if(S.originalSources.length>1){
    previewNodes.push({id:"__S__", label:"S", x:0,y:0, role:"dummy-source"});
    S.originalSources.forEach(id=> previewEdges.push({id:"pS_"+id, u:"__S__", v:id, cap:Infinity, flow:0}));
  }
  if(S.originalSinks.length>1){
    previewNodes.push({id:"__T__", label:"T", x:0,y:0, role:"dummy-sink"});
    S.originalSinks.forEach(id=> previewEdges.push({id:"pT_"+id, u:id, v:"__T__", cap:Infinity, flow:0}));
  }
  autoLayout(previewNodes, previewEdges, 1000, 560);
  const svg = document.getElementById("endpointSvg");
  const savedNodes=S.nodes, savedEdges=S.edges;
  S.nodes = previewNodes; S.edges = previewEdges;
  renderGraph(svg, {showFlow:false, interactive:false});
  S.nodes = savedNodes; S.edges = savedEdges;
  document.getElementById("endpointPreviewPanel").style.display="block";
}

document.getElementById("btnToAlgo").addEventListener("click", ()=>{
  commitEndpoints();
  showScreen("algo");
  refreshAlgoScreen();
});

function commitEndpoints(){
  S.originalSources.forEach(id=>{ findNode(id).role="source"; });
  S.originalSinks.forEach(id=>{ findNode(id).role="sink"; });
  if(S.originalSources.length>1){
    const dsId = "__S__";
    S.nodes.push({id:dsId, label:"S", x:0,y:0, role:"dummy-source"});
    S.originalSources.forEach(id=> S.edges.push({id:"pS_"+id, u:dsId, v:id, cap:Infinity, flow:0}));
    S.dummySourceId = dsId; S.sourceId = dsId;
  } else {
    S.sourceId = S.originalSources[0];
  }
  if(S.originalSinks.length>1){
    const dtId = "__T__";
    S.nodes.push({id:dtId, label:"T", x:0,y:0, role:"dummy-sink"});
    S.originalSinks.forEach(id=> S.edges.push({id:"pT_"+id, u:id, v:dtId, cap:Infinity, flow:0}));
    S.dummySinkId = dtId; S.sinkId = dtId;
  } else {
    S.sinkId = S.originalSinks[0];
  }
  autoLayout(S.nodes, S.edges, 1000, 560);
  S.history=[]; S.lastSearch=null;
}

/* ===================== Ford-Fulkerson engine ===================== */
function currentFlowValue(){
  return outEdges(S.sourceId).reduce((a,e)=>a+e.flow,0) - inEdges(S.sourceId).reduce((a,e)=>a+e.flow,0);
}
function findAugmentingPath(){
  const pred = {};
  const delta = {};
  const visited = new Set([S.sourceId]);
  delta[S.sourceId] = Infinity;
  const queue = [S.sourceId];
  while(queue.length){
    const u = queue.shift();
    if(u===S.sinkId) break;
    for(const e of S.edges){
      if(e.u===u && !visited.has(e.v)){
        const res = e.cap - e.flow;
        if(res>0){
          visited.add(e.v);
          pred[e.v] = {edgeId:e.id, dir:"+", prev:u};
          delta[e.v] = Math.min(delta[u], res);
          queue.push(e.v);
        }
      }
      if(e.v===u && !visited.has(e.u)){
        if(e.flow>0){
          visited.add(e.u);
          pred[e.u] = {edgeId:e.id, dir:"-", prev:u};
          delta[e.u] = Math.min(delta[u], e.flow);
          queue.push(e.u);
        }
      }
    }
  }
  if(!visited.has(S.sinkId)) return {found:false, visited};
  const pathNodes=[S.sinkId]; const edgesUsed=[];
  let cur=S.sinkId;
  while(cur!==S.sourceId){
    const p = pred[cur];
    edgesUsed.push({edgeId:p.edgeId, dir:p.dir, node:cur, from:p.prev});
    cur = p.prev;
    pathNodes.push(cur);
  }
  pathNodes.reverse(); edgesUsed.reverse();
  return {found:true, pathNodes, edgesUsed, delta: delta[S.sinkId], visited};
}
function applyAugmentation(search){
  search.edgesUsed.forEach(step=>{
    const e = findEdge(step.edgeId);
    if(step.dir==="+") e.flow += search.delta; else e.flow -= search.delta;
  });
  S.history.push({
    pathNodes: search.pathNodes.slice(),
    edgesUsed: search.edgesUsed.slice(),
    delta: search.delta,
    totalAfter: currentFlowValue()
  });
}

/* ===================== algorithm screen UI ===================== */
function refreshAlgoScreen(){
  document.getElementById("statFlow").textContent = currentFlowValue();
  document.getElementById("statIter").textContent = S.history.length;
  renderGraph(document.getElementById("algoSvg"), {
    showFlow:true, interactive:true,
    pathEdges: S.lastSearch && S.lastSearch.found ? S.lastSearch.edgesUsed : null,
    pathNodeSet: S.lastSearch && S.lastSearch.found ? new Set(S.lastSearch.pathNodes) : null,
    visitedSet: S.lastSearch && !S.lastSearch.found ? S.lastSearch.visited : null
  });
  renderHistory();
}
function renderHistory(){
  const box = document.getElementById("historyBox");
  if(S.history.length===0){ box.innerHTML = '<div class="empty">Sin iteraciones todavía.</div>'; return; }
  box.innerHTML="";
  S.history.forEach((h,i)=>{
    const div = document.createElement("div");
    div.className="h-item";
    const path = h.pathNodes.map(id=>findNode(id).label).join(" → ");
    div.innerHTML = `<span class="idx">#${i+1}</span>${path} &nbsp; <span class="d">Δ=${h.delta}</span> &nbsp; <span class="faint">|f|=${h.totalAfter}</span>`;
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
}
function pathLabelHTML(search){
  // build labeling notation matching the reading: s(-,∞) → b(s+,7) → ...
  let parts = [];
  parts.push(`<span class="lab">${findNode(S.sourceId).label}(−,∞)</span>`);
  let acc = Infinity;
  search.edgesUsed.forEach(step=>{
    const e = findEdge(step.edgeId);
    const res = step.dir==="+" ? (e.cap-e.flow) : e.flow;
    acc = Math.min(acc, res);
    const predLabel = findNode(step.from).label;
    const curLabel = findNode(step.node).label;
    parts.push(`<span class="lab">${curLabel}(${predLabel}${step.dir},${acc===Infinity?"∞":acc})</span>`);
  });
  return parts.join('<span class="arrow">→</span>');
}
document.getElementById("btnFindPath").addEventListener("click", ()=>{
  const search = findAugmentingPath();
  S.lastSearch = search;
  const stageBox = document.getElementById("algoStageBox");
  if(search.found){
    stageBox.innerHTML = `<p class="muted" style="margin-top:0;">Camino de aumento encontrado (Pasos 2 a 6):</p>
      <div class="pathline">${pathLabelHTML(search)}</div>
      <p>Incremento posible: <span class="deltabadge">Δ = ${search.delta}</span></p>`;
    document.getElementById("btnApplyPath").disabled = false;
  } else {
    const labeled = Array.from(search.visited).map(id=>findNode(id).label).join(", ");
    stageBox.innerHTML = `<p class="muted" style="margin-top:0;">El sumidero <b>${findNode(S.sinkId).label}</b> no pudo etiquetarse (Paso 9).</p>
      <div class="pathline">Vértices etiquetados: ${labeled}</div>
      <p>Según el Teorema del Flujo Máximo y Corte Mínimo, esto indica que <b>se alcanzó el flujo máximo</b>.</p>`;
    document.getElementById("btnApplyPath").disabled = true;
  }
  refreshAlgoScreen();
});
document.getElementById("btnApplyPath").addEventListener("click", ()=>{
  if(!S.lastSearch || !S.lastSearch.found) return;
  applyAugmentation(S.lastSearch);
  S.lastSearch = null;
  document.getElementById("btnApplyPath").disabled = true;
  document.getElementById("algoStageBox").innerHTML = '<p class="empty">Flujo actualizado. Presiona «Buscar camino aumentante» para la siguiente iteración.</p>';
  refreshAlgoScreen();
});
document.getElementById("btnAutoSolve").addEventListener("click", ()=>{
  let guard=0;
  while(guard++<5000){
    const search = findAugmentingPath();
    if(!search.found){ S.lastSearch = search; break; }
    applyAugmentation(search);
  }
  document.getElementById("btnApplyPath").disabled = true;
  document.getElementById("algoStageBox").innerHTML = '<p class="muted">Resuelto automáticamente. Revisa el historial y pasa al resultado final.</p>';
  refreshAlgoScreen();
  goToSummary();
});

/* when no path found, offer to go to summary via stage box button injection */
const algoObserver = new MutationObserver(()=>{
  if(S.lastSearch && S.lastSearch.found===false){
    const box = document.getElementById("algoStageBox");
    if(!box.querySelector(".to-summary-btn")){
      const btn = document.createElement("button");
      btn.className="btn primary to-summary-btn";
      btn.style.marginTop="10px";
      btn.textContent="Ver corte mínimo y resultado final →";
      btn.addEventListener("click", goToSummary);
      box.appendChild(btn);
    }
  }
});
algoObserver.observe(document.getElementById("algoStageBox"), {childList:true, subtree:false});

/* ===================== summary screen ===================== */
function goToSummary(){
  // ensure we have a "no path" search reflecting current state (in case user jumps here after manual finish)
  if(!S.lastSearch || S.lastSearch.found){
    const s = findAugmentingPath();
    if(!s.found) S.lastSearch = s;
  }
  const setS = S.lastSearch ? S.lastSearch.visited : new Set([S.sourceId]);
  const setT = new Set(S.nodes.map(n=>n.id).filter(id=>!setS.has(id)));
  const cutEdges = S.edges.filter(e=> setS.has(e.u) && setT.has(e.v));
  const cutCap = cutEdges.reduce((a,e)=>a+e.cap,0);
  const flowVal = currentFlowValue();
  S.finalCut = {setS,setT,cutEdges,cutCap};

  document.getElementById("finalFlowVal").textContent = flowVal;
  const verify = document.getElementById("verifyBox");
  const ok = (flowVal===cutCap);
  verify.className = "verify"+(ok?"":" bad");
  const cutFormula = cutEdges.map(e=>fmtCap(e.cap)).join(" + ") || "0";
  const cutNamesS = Array.from(setS).map(id=>findNode(id).label).join(", ");
  const cutNamesT = Array.from(setT).map(id=>findNode(id).label).join(", ");
  verify.innerHTML = `S = {${cutNamesS}} &nbsp;&nbsp; T = {${cutNamesT}}<br>
    c(S,T) = ${cutFormula} = <b>${cutCap}</b><br>
    |f| = <b>${flowVal}</b> ${ok? "= c(S,T) ✓" : "≠ c(S,T)"} — ${ok? "el flujo encontrado es <b>máximo</b> según el Teorema del Flujo Máximo y Corte Mínimo." : "revisa las iteraciones; algo no cuadra."}`;

  renderGraph(document.getElementById("summarySvg"), {
    showFlow:true, interactive:false,
    setColorS:setS, setColorT:setT, cutEdges:cutEdges
  });

  // final edge table
  const tbody = document.querySelector("#finalEdgeTable tbody");
  tbody.innerHTML="";
  S.edges.forEach(e=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${findNode(e.u).label} → ${findNode(e.v).label}</td><td>${fmtCap(e.cap)}</td><td>${e.flow}</td>`;
    tbody.appendChild(tr);
  });

  // history
  const hbox = document.getElementById("finalHistoryBox");
  if(S.history.length===0){ hbox.innerHTML='<div class="empty">No fue necesario aplicar incrementos.</div>'; }
  else {
    hbox.innerHTML="";
    S.history.forEach((h,i)=>{
      const div=document.createElement("div"); div.className="h-item";
      const path = h.pathNodes.map(id=>findNode(id).label).join(" → ");
      div.innerHTML = `<span class="idx">#${i+1}</span>${path} &nbsp; <span class="d">Δ=${h.delta}</span>`;
      hbox.appendChild(div);
    });
  }

  // contributions per original source/sink if dummies used
  const contribPanel = document.getElementById("contribPanel");
  if(S.dummySourceId || S.dummySinkId){
    contribPanel.style.display="block";
    let html = "";
    if(S.dummySourceId){
      html += "<h4 style='margin:6px 0;font-size:13px;'>Desde cada origen real</h4><table class='edgetable'><thead><tr><th>Origen</th><th>Flujo aportado</th></tr></thead><tbody>";
      S.originalSources.forEach(id=>{
        const e = S.edges.find(x=>x.u===S.dummySourceId && x.v===id);
        html += `<tr><td>${findNode(id).label}</td><td>${e?e.flow:0}</td></tr>`;
      });
      html += "</tbody></table>";
    }
    if(S.dummySinkId){
      html += "<h4 style='margin:14px 0 6px;font-size:13px;'>Hacia cada destino real</h4><table class='edgetable'><thead><tr><th>Destino</th><th>Flujo recibido</th></tr></thead><tbody>";
      S.originalSinks.forEach(id=>{
        const e = S.edges.find(x=>x.v===S.dummySinkId && x.u===id);
        html += `<tr><td>${findNode(id).label}</td><td>${e?e.flow:0}</td></tr>`;
      });
      html += "</tbody></table>";
    }
    document.getElementById("contribBox").innerHTML = html;
  } else {
    contribPanel.style.display="none";
  }

  showScreen("summary");
}

/* ===================== restart ===================== */
document.getElementById("restartBtn").addEventListener("click", ()=>{
  if(confirm("¿Reiniciar toda la aplicación? Se perderá el progreso actual.")) resetAll();
});

/* ===================== init ===================== */
resetAll();
})();
