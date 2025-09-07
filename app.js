// Traffic Sketcher App (module)
(() => {
  const stage = document.getElementById('stage');
  const world = document.getElementById('world');
  const selectionLayer = document.getElementById('selectionLayer');
  const palette = document.getElementById('palette');
  const drawer = document.getElementById('drawer');
  const btnDrawer = document.getElementById('btn-drawer');
  const toast = document.getElementById('toast');
  const snapChk = document.getElementById('snap');
  const gridToggle = document.getElementById('gridToggle');
  const vehicleColor = document.getElementById('vehicleColor');
  const helpDialog = document.getElementById('helpDialog');

  // Modes
  let mode = 'select'; // select | pan | draw
  const btnModeSelect = document.getElementById('mode-select');
  const btnModePan = document.getElementById('mode-pan');
  const btnModeDraw = document.getElementById('mode-draw');
  let drawCanvas = document.getElementById('drawCanvas');
  let drawCtx = null;
  let isDrawing = false;

  btnModeSelect.onclick = () => setMode('select');
  btnModePan.onclick = () => setMode('pan');
  btnModeDraw.onclick = () => setMode('draw');

  function setMode(m){
    mode = m; 
    btnModeSelect.classList.toggle('active', m==='select'); 
    btnModePan.classList.toggle('active', m==='pan');
    btnModeDraw.classList.toggle('active', m==='draw');
    
    // Toggle draw canvas visibility and interaction
    if(m === 'draw') {
      drawCanvas.style.display = 'block';
      drawCanvas.style.pointerEvents = 'auto';
      setupDrawCanvas();
      console.log('Draw mode activated, canvas display:', drawCanvas.style.display);
    } else {
      drawCanvas.style.display = 'none';
      drawCanvas.style.pointerEvents = 'none';
      console.log('Draw mode deactivated');
    }
  }

  // Drawing event handlers
  function handlePointerDown(e) {
    if (mode !== 'draw') return;
    isDrawing = true;
    drawCanvas.setPointerCapture(e.pointerId);
    const rect = drawCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawCtx.strokeStyle = '#ff0000';
    drawCtx.lineWidth = 5;
    drawCtx.lineCap = 'round';
    drawCtx.beginPath();
    drawCtx.moveTo(x, y);
  }

  function handlePointerMove(e) {
    if (!isDrawing || mode !== 'draw') return;
    const rect = drawCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    drawCtx.lineTo(x, y);
    drawCtx.stroke();
  }

  function handlePointerUp(e) {
    if (!isDrawing) return;
    isDrawing = false;
    drawCanvas.releasePointerCapture(e.pointerId);
  }

  // Function to set up the canvas dimensions
  function setupDrawCanvas() {
    const stageWrap = document.getElementById('stageWrap');
    drawCanvas.width = stageWrap.offsetWidth;
    drawCanvas.height = stageWrap.offsetHeight;
    drawCtx = drawCanvas.getContext('2d');
  }

  // Camera (zoom/pan via viewBox)
  let view = {x:0, y:0, w:1200, h:800};
  function applyView(){ stage.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`); }
  function zoomAt(factor, cx, cy){
    const nx = view.x + (cx - view.x) * (1 - 1/factor);
    const ny = view.y + (cy - view.y) * (1 - 1/factor);
    view.x = nx; view.y = ny; view.w /= factor; view.h /= factor; applyView();
  }
  // Use pointer events for zoom buttons (works on both desktop and mobile)
  document.getElementById('zoom-in').addEventListener('pointerdown', (e)=> {
    e.preventDefault();
    e.stopPropagation();
    zoomAt(1.2, view.x+view.w/2, view.y+view.h/2);
    console.log('Zoom in clicked');
  });
  document.getElementById('zoom-out').addEventListener('pointerdown', (e)=> {
    e.preventDefault();
    e.stopPropagation();
    zoomAt(1/1.2, view.x+view.w/2, view.y+view.h/2);
    console.log('Zoom out clicked');
  });
  document.getElementById('zoom-reset').addEventListener('pointerdown', (e)=> {
    e.preventDefault();
    e.stopPropagation();
    view={x:0,y:0,w:1200,h:800}; 
    applyView();
    console.log('Zoom reset clicked');
  });


  // Utilities
  const GRID=40;
  const uid = ()=> 'id'+Math.random().toString(36).slice(2,9);
  const snap = v => snapChk.checked ? Math.round(v/GRID)*GRID : v;
  const showToast = (msg)=>{ toast.textContent=msg; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'), 1200); }

  function svgEl(tag, attrs={}){ const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for(const k in attrs){ el.setAttribute(k, attrs[k]); } return el; }

  function getSVGPoint(evt){
    const pt = stage.createSVGPoint();
    const isTouch = evt.touches && evt.touches[0];
    if(isTouch){ pt.x = evt.touches[0].clientX; pt.y = evt.touches[0].clientY; }
    else { pt.x = evt.clientX; pt.y = evt.clientY; }
    const ctm = stage.getScreenCTM().inverse();
    return pt.matrixTransform(ctm);
  }

  // State
  let selected = null; // <g> element
  let data = []; // array of scene items
  let undoStack = [], redoStack = [];
  const pushHistory = ()=>{ undoStack.push(JSON.stringify(data)); if(undoStack.length>60) undoStack.shift(); redoStack.length=0; }

  function restoreFrom(serial){ data = JSON.parse(serial); redraw(); }

  function saveLocal(){ localStorage.setItem('trafficSketcher.v1', JSON.stringify(data)); showToast('Saved to device'); }
  function loadLocal(){ const raw = localStorage.getItem('trafficSketcher.v1'); if(raw){ data = JSON.parse(raw); redraw(); showToast('Loaded'); } else showToast('No save found'); }

  document.getElementById('btn-save').onclick=()=>{saveLocal()};
  document.getElementById('btn-load').onclick=()=>{loadLocal()};
  const clearBtn = document.getElementById('btn-clear');
  if (clearBtn) {
    clearBtn.onclick = () => { 
      console.log('Clear button clicked'); // Debug log
      if(confirm('Clear the canvas?')){ 
        console.log('User confirmed clear'); // Debug log
        pushHistory(); 
        data=[]; 
        redraw(); 
        selected=null; 
        console.log('Traffic Sketcher loaded - VERSION 2.0 - JS IS UPDATING!'); // Debug log
      } 
    };
  } else {
    console.error('Clear button not found');
  }

  // Export PNG (serialize SVG -> Image -> Canvas)
  document.getElementById('btn-export').onclick=()=>{
    const clone = stage.cloneNode(true);
    // hide selection visuals
    const sel = clone.getElementById('selectionLayer'); if(sel) sel.innerHTML='';
    const svgStr = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = ()=>{
      const scale = 2; // HiDPI
      const canvas = document.createElement('canvas');
      canvas.width = 1200*scale; canvas.height = 800*scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a'); a.href=url; a.download='traffic-sketch.png'; a.click();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  };

  // Palette interactions (tap to add centered)
  palette.addEventListener('click', (e)=>{
    const pill = e.target.closest('.pill'); if(!pill) return;
    // Templates
    if(pill.dataset.template){
      applyTemplate(pill.dataset.template);
      return;
    }
    const type = pill.dataset.type; const subtype = pill.dataset.subtype;
    let item = null; const center = {x: snap(view.x+view.w/2), y: snap(view.y+view.h/2)};
    if(type==='tile') item = makeTile(subtype, center.x, center.y);
    else if(type==='vehicle') item = makeVehicle(subtype, center.x, center.y, vehicleColor.value);
    else if(type==='sign') item = makeSign(subtype, center.x, center.y);
    else if(type==='label') item = (subtype==='text')? makeText('Note', center.x, center.y) : makeArrow(center.x-80, center.y-40, center.x+40, center.y+20);
    if(item){ pushHistory(); data.push(item); redraw(); selectById(item.id); }
  });

  // Builders
  function makeBase(id,x,y,rot=0){ return {id, x, y, rot}; }

  function makeTile(subtype,x,y){
    return { kind:'tile', subtype, ...makeBase(uid(),x,y,0) };
  }

  function makeSign(subtype,x,y){
    return { kind:'sign', subtype, ...makeBase(uid(),x,y,0) };
  }

  function makeVehicle(subtype,x,y,color){
    return { kind:'vehicle', subtype, color, ...makeBase(uid(),x,y,0) };
  }

  function makeText(text,x,y){
    return { kind:'text', text, ...makeBase(uid(),x,y,0) };
  }

  function makeArrow(x1,y1,x2,y2){
    return { kind:'arrow', x1, y1, x2, y2, id:uid() };
  }

  // Renderers
  function draw(){
    world.innerHTML=''; selectionLayer.innerHTML='';
    const selectedId = selected ? selected.getAttribute('data-id') : null;
    
    // Sort data by kind to ensure consistent layering: tiles first, then vehicles/labels
    const sortedData = [...data].sort((a, b) => {
      const order = { 'tile': 0, 'vehicle': 1, 'text': 2, 'arrow': 3 };
      return (order[a.kind] || 0) - (order[b.kind] || 0);
    });
    
    for(const it of sortedData){ world.appendChild(renderItem(it)); }
    // Re-select and move to top if there was a selection
    if(selectedId) {
      const newSelected = world.querySelector(`[data-id="${selectedId}"]`);
      if(newSelected) {
        selected = newSelected;
        selected.classList.add('selected');
        world.appendChild(selected); // Keep selected on top
      }
    }
    drawSelection();
  }
  function redraw(){ draw(); }

  function renderItem(it){
    if(it.kind==='tile') return renderTile(it);
    if(it.kind==='vehicle') return renderVehicle(it);
    if(it.kind==='sign') return renderSign(it);
    if(it.kind==='text') return renderText(it);
    if(it.kind==='arrow') return renderArrow(it);
  }

  function renderTile(it){
    const g = svgEl('g', { 'data-id':it.id, 'data-kind':'tile', transform:`translate(${it.x},${it.y}) rotate(${it.rot})`});
    const roadColor = '#2b2f3f';
    const lane = '#dfe6ff';
    const size = 200; // tile base size
    if(it.subtype==='straight'){
      const r = svgEl('rect',{x:-size/2, y:-40, width:size, height:80, rx:10, fill:roadColor});
      const center = svgEl('rect',{x:-size/2, y:-3, width:size, height:6, fill:'url(#laneDash)'});
      g.append(r, center);
    }
    if(it.subtype==='curve'){
      const path = svgEl('path',{ d:`M 0 0 m -140 0 a 140 140 0 0 1 140 -140`, fill:'none', stroke:roadColor, 'stroke-width':80, 'stroke-linecap':'round'});
      const laneP = svgEl('path',{ d:`M 0 0 m -120 0 a 120 120 0 0 1 120 -120`, fill:'none', stroke:lane, 'stroke-width':4, 'stroke-dasharray':'8 8'});
      g.append(path, laneP);
    }
    if(it.subtype==='t'){
      g.append(svgEl('rect',{x:-100, y:-40, width:200, height:80, rx:10, fill:roadColor}));
      g.append(svgEl('rect',{x:-40, y:-140, width:80, height:140, rx:10, fill:roadColor}));
      g.append(svgEl('rect',{x:-3, y:-120, width:6, height:120, fill:'url(#laneDash)'}));
      g.append(svgEl('rect',{x:-100, y:-3, width:200, height:6, fill:'url(#laneDash)'}));
    }
    if(it.subtype==='cross'){
      g.append(svgEl('rect',{x:-120, y:-40, width:240, height:80, rx:10, fill:roadColor}));
      g.append(svgEl('rect',{x:-40, y:-120, width:80, height:240, rx:10, fill:roadColor}));
      g.append(svgEl('rect',{x:-3, y:-120, width:6, height:240, fill:'url(#laneDash)'}));
      g.append(svgEl('rect',{x:-120, y:-3, width:240, height:6, fill:'url(#laneDash)'}));
    }
    if(it.subtype==='merge'){
      g.append(svgEl('rect',{x:-160, y:-40, width:240, height:80, rx:10, fill:roadColor}));
      const merge = svgEl('path',{ d:`M -40 -40 L 120 0 L -40 40 Z`, fill:roadColor, opacity:.95});
      const lane1 = svgEl('rect',{x:-160, y:-3, width:240, height:6, fill:'url(#laneDash)'});
      const lane2 = svgEl('path',{ d:`M -20 -20 L 80 -2`, stroke:'#dfe6ff', 'stroke-width':4, 'stroke-dasharray':'8 8', fill:'none' });
      g.append(merge, lane1, lane2);
    }
    if(it.subtype==='freeway'){
      g.append(svgEl('rect',{x:-200, y:-70, width:400, height:140, rx:14, fill:roadColor}));
      // 3 lanes each side
      for(let i=-40;i<=40;i+=40){ g.append(svgEl('rect',{x:-200, y:i-3, width:400, height:6, fill:'url(#laneDash)'})); }
    }
    if(it.subtype==='roundabout'){
      g.append(svgEl('circle',{cx:0, cy:0, r:90, fill:roadColor}));
      g.append(svgEl('circle',{cx:0, cy:0, r:40, fill:'#0b0d14'}));
      for(let i=0;i<4;i++){
        const arm = svgEl('rect',{x:-20, y:-160, width:40, height:90, rx:10, fill:roadColor});
        arm.setAttribute('transform', `rotate(${i*90})`); g.append(arm);
      }
    }
    if(it.subtype==='signals'){
      // intersection with simple traffic lights dots
      g.append(svgEl('rect',{x:-120, y:-40, width:240, height:80, rx:10, fill:roadColor}));
      g.append(svgEl('rect',{x:-40, y:-120, width:80, height:240, rx:10, fill:roadColor}));
      // lights
      const dot=(x,y,c)=> svgEl('circle',{cx:x, cy:y, r:6, fill:c, stroke:'#111', 'stroke-width':'1'});
      g.append(dot(-70,-70,'#22c55e'), dot(-50,-70,'#f59e0b'), dot(-30,-70,'#ef4444'));
      g.append(dot(70,70,'#22c55e'), dot(50,70,'#f59e0b'), dot(30,70,'#ef4444'));
    }
    if(it.subtype==='stops'){
      // 4-way with STOP octagons
      g.append(svgEl('rect',{x:-120, y:-40, width:240, height:80, rx:10, fill:roadColor}));
      g.append(svgEl('rect',{x:-40, y:-120, width:80, height:240, rx:10, fill:roadColor}));
      const stop=(x,y)=>{ const s = svgEl('polygon',{ points:"-10,-30 10,-30 30,-10 30,10 10,30 -10,30 -30,10 -30,-10", fill:'#ef4444', stroke:'#fff', 'stroke-width':'2'}); const g2=svgEl('g',{transform:`translate(${x},${y})`}); g2.appendChild(s); return g2; };
      g.append(stop(-140,0), stop(140,0), stop(0,-140), stop(0,140));
    }
    if(it.subtype==='crosswalk'){
      g.append(svgEl('rect',{x:-160, y:-40, width:320, height:80, rx:10, fill:roadColor}));
      for(let i=-70;i<=70;i+=20){ g.append(svgEl('rect',{x:i-10,y:-40,width:12,height:80,fill:'#edf2ff',opacity:.95})); }
    }
    if(it.subtype==='multilane-signals'){
      // Multi-lane intersection with traffic lights - wider like freeway
      g.append(svgEl('rect',{x:-200, y:-70, width:400, height:140, rx:14, fill:roadColor}));
      g.append(svgEl('rect',{x:-70, y:-200, width:140, height:400, rx:14, fill:roadColor}));
      // Lane markings
      for(let i=-40;i<=40;i+=40){ 
        g.append(svgEl('rect',{x:-200, y:i-3, width:400, height:6, fill:'url(#laneDash)'})); 
        g.append(svgEl('rect',{x:i-3, y:-200, width:6, height:400, fill:'url(#laneDash)'})); 
      }
      // Traffic lights at corners
      const dot=(x,y,c)=> svgEl('circle',{cx:x, cy:y, r:8, fill:c, stroke:'#111', 'stroke-width':'2'});
      g.append(dot(-120,-120,'#22c55e'), dot(-100,-120,'#f59e0b'), dot(-80,-120,'#ef4444'));
      g.append(dot(120,120,'#22c55e'), dot(100,120,'#f59e0b'), dot(80,120,'#ef4444'));
      g.append(dot(120,-120,'#22c55e'), dot(120,-100,'#f59e0b'), dot(120,-80,'#ef4444'));
      g.append(dot(-120,120,'#22c55e'), dot(-120,100,'#f59e0b'), dot(-120,80,'#ef4444'));
    }
    if(it.subtype==='multilane-4way'){
      // Multi-lane 4-way intersection - wider roads
      g.append(svgEl('rect',{x:-200, y:-70, width:400, height:140, rx:14, fill:roadColor}));
      g.append(svgEl('rect',{x:-70, y:-200, width:140, height:400, rx:14, fill:roadColor}));
      // Lane markings for multiple lanes
      for(let i=-40;i<=40;i+=40){ 
        g.append(svgEl('rect',{x:-200, y:i-3, width:400, height:6, fill:'url(#laneDash)'})); 
        g.append(svgEl('rect',{x:i-3, y:-200, width:6, height:400, fill:'url(#laneDash)'})); 
      }
    }
    if(it.subtype==='two-way-straight'){
      // Two-way road with yellow center line
      const r = svgEl('rect',{x:-size/2, y:-40, width:size, height:80, rx:10, fill:roadColor});
      const yellowLine = svgEl('rect',{x:-size/2, y:-2, width:size, height:4, fill:'#fbbf24'});
      g.append(r, yellowLine);
    }
    if(it.subtype==='two-way-curve'){
      // Two-way curve with yellow center line
      const outerPath = svgEl('path',{ d:`M 0 0 m -140 0 a 140 140 0 0 1 140 -140`, fill:'none', stroke:roadColor, 'stroke-width':80, 'stroke-linecap':'round'});
      const yellowPath = svgEl('path',{ d:`M 0 0 m -140 0 a 140 140 0 0 1 140 -140`, fill:'none', stroke:'#fbbf24', 'stroke-width':4});
      g.append(outerPath, yellowPath);
    }
    if(it.subtype==='two-way-cross'){
      // Two-way 4-way intersection with yellow center lines
      g.append(svgEl('rect',{x:-120, y:-40, width:240, height:80, rx:10, fill:roadColor}));
      g.append(svgEl('rect',{x:-40, y:-120, width:80, height:240, rx:10, fill:roadColor}));
      // Yellow center lines
      g.append(svgEl('rect',{x:-2, y:-120, width:4, height:240, fill:'#fbbf24'}));
      g.append(svgEl('rect',{x:-120, y:-2, width:240, height:4, fill:'#fbbf24'}));
    }
    return g;
  }

  function renderVehicle(it){
    const g = svgEl('g', {'data-id':it.id, 'data-kind':'vehicle', transform:`translate(${it.x},${it.y}) rotate(${it.rot})`});
    let w=60, h=32, r=6; // car default
    if(it.subtype==='suv'){ w=66; h=36; r=7; }
    if(it.subtype==='truck'){ w=90; h=36; r=6; }
    if(it.subtype==='semi'){ w=130; h=38; r=6; }
    const body = svgEl('rect',{x:-w/2,y:-h/2,width:w,height:h,rx:r,fill:it.color||'#1f9cf0', stroke:'#0a0a0a', 'stroke-width':'2'});
    const win = svgEl('rect',{x:-w/4,y:-h/4,width:w/2,height:h/2,rx:4, fill:'#e0f2ff', opacity:.8});
    g.append(body, win);
    return g;
  }

  function renderText(it){
    const g = svgEl('g', {'data-id':it.id, 'data-kind':'text', transform:`translate(${it.x},${it.y}) rotate(${it.rot})`});
    const bg = svgEl('rect',{x:-60, y:-22, width:120, height:32, rx:6, fill:'#0e1322', stroke:'#2a3045'});
    const t = svgEl('text',{x:0, y:0, 'text-anchor':'middle', 'dominant-baseline':'middle', fill:'#e8ebff', 'font-size':'14'});
    t.textContent = it.text || 'Note';
    g.append(bg, t);
    g.addEventListener('dblclick', (e)=>{
      e.stopPropagation();
      const v = prompt('Edit label', it.text||''); if(v!=null){ pushHistory(); it.text = v; redraw(); }
    });
    return g;
  }

  function renderSign(it){
    const g = svgEl('g', {'data-id':it.id, 'data-kind':'sign', transform:`translate(${it.x},${it.y}) rotate(${it.rot})`});
    
    if(it.subtype==='stop'){
      // Standalone stop sign - smaller scale
      const stop = svgEl('polygon',{ 
        points:"-8,-24 8,-24 24,-8 24,8 8,24 -8,24 -24,8 -24,-8", 
        fill:'#ef4444', 
        stroke:'#fff', 
        'stroke-width':'2'
      });
      const text = svgEl('text',{
        x:0, y:4, 
        'text-anchor':'middle', 
        fill:'white', 
        'font-family':'Arial, sans-serif', 
        'font-size':'10', 
        'font-weight':'bold'
      });
      text.textContent = 'STOP';
      g.append(stop, text);
    }
    
    if(it.subtype==='traffic-light'){
      // Standalone traffic light pole - smaller scale
      const pole = svgEl('rect',{x:-2, y:-5, width:4, height:40, fill:'#4a5568'});
      const box = svgEl('rect',{x:-12, y:-35, width:24, height:30, rx:4, fill:'#2d3748', stroke:'#4a5568', 'stroke-width':'1'});
      
      // Traffic light colors - smaller
      const red = svgEl('circle',{cx:0, cy:-27, r:4, fill:'#ef4444', stroke:'#111', 'stroke-width':'1'});
      const yellow = svgEl('circle',{cx:0, cy:-20, r:4, fill:'#f59e0b', stroke:'#111', 'stroke-width':'1'});
      const green = svgEl('circle',{cx:0, cy:-13, r:4, fill:'#22c55e', stroke:'#111', 'stroke-width':'1'});
      
      g.append(pole, box, red, yellow, green);
    }
    
    return g;
  }

  function renderArrow(it){
    const g = svgEl('g', {'data-id':it.id, 'data-kind':'arrow'});
    const line = svgEl('line',{x1:it.x1, y1:it.y1, x2:it.x2, y2:it.y2, stroke:'#f59e0b', 'stroke-width':'4', 'marker-end':'url(#arrowHead)'});
    g.appendChild(line);
    return g;
  }

  // Selection visuals
  function selectById(id){
    // remove previous selected class
    world.querySelectorAll('g.selected').forEach(el=>el.classList.remove('selected'));
    selected = world.querySelector(`[data-id="${id}"]`)||null; 
    if(selected) {
      selected.classList.add('selected');
      // Move selected element to top layer
      world.appendChild(selected);
    }
    drawSelection();
    // update vehicle color picker if vehicle
    if(selected && selected.dataset.kind==='vehicle'){
      const it = data.find(d=>d.id===id); if(it) vehicleColor.value = it.color || '#1f9cf0';
    }
  }
  function drawSelection(){
    selectionLayer.innerHTML=''; if(!selected) return;
    const bbox = selected.getBBox();
    const rect = svgEl('rect',{x:bbox.x-8, y:bbox.y-8, width:bbox.width+16, height:bbox.height+16, rx:10, fill:'none', stroke: '#a78bfa', 'stroke-width':3, 'stroke-dasharray':'8 4'});
    const outerRect = svgEl('rect',{x:bbox.x-10, y:bbox.y-10, width:bbox.width+20, height:bbox.height+20, rx:12, fill:'none', stroke: '#6ee7ff', 'stroke-width':1, opacity:'0.8'});
    selectionLayer.append(outerRect, rect);
  }




  let dragging = null;

  world.addEventListener('pointerdown', (e) => {
    if (mode === 'draw') return;
    const target = e.target.closest('g[data-id]');
    if (!target) {
      if (mode === 'select') {
        selectById(null); // Deselect
      }
      return;
    }

    const id = target.getAttribute('data-id');
    selectById(id);

    if (mode === 'select') {
      const it = data.find(d => d.id === id);
      if (!it) return;
      const pt = getSVGPoint(e);
      dragging = { type: 'move', id, item: it, dx: pt.x - (it.x || 0), dy: pt.y - (it.y || 0) };
    }
  });

  stage.addEventListener('pointerdown', (e) => {
    if (mode === 'pan' && (e.target === stage || e.target.id === 'gridRect')) {
      const pt = getSVGPoint(e);
      dragging = { type: 'pan', sx: pt.x, sy: pt.y, vx: view.x, vy: view.y };
    }
  });

  stage.addEventListener('pointermove', (e) => {
    if (!dragging || mode === 'draw') return;
    const pt = getSVGPoint(e);
    if (dragging.type === 'move') {
      dragging.item.x = snap(pt.x - dragging.dx);
      dragging.item.y = snap(pt.y - dragging.dy);
      redraw();
    } else if (dragging.type === 'pan') {
      view.x = dragging.vx - (pt.x - dragging.sx);
      view.y = dragging.vy - (pt.y - dragging.sy);
      applyView();
    }
  });

  stage.addEventListener('pointerup', () => {
    if (dragging) {
      pushHistory();
      dragging = null;
    }
  });

  // Hover effects (keyboard/mouse only; pointer events on touch won't always fire mouseenter)
  world.addEventListener('mouseover', (e)=>{
    const g = e.target.closest('g[data-id]');
    if(!g) return; g.classList.add('hovered');
  });
  world.addEventListener('mouseout', (e)=>{
    const g = e.target.closest('g[data-id]');
    if(!g) return; g.classList.remove('hovered');
  });

  // Vehicle color changes
  vehicleColor.addEventListener('input', ()=>{
    if(!selected || selected.dataset.kind!=='vehicle') return;
    const id = selected.getAttribute('data-id'); const it = data.find(d=>d.id===id);
    if(it){ it.color = vehicleColor.value; redraw(); }
  });

  // Rotate / Duplicate / Delete
  document.getElementById('btn-rotate').onclick=()=>{
    if(!selected) return; const id = selected.getAttribute('data-id'); const it = data.find(d=>d.id===id); if(!it) return;
    if(it.kind==='arrow'){
      // swap direction 180
      const cx=(it.x1+it.x2)/2, cy=(it.y1+it.y2)/2; const nx1 = cx - (it.x1-cx), ny1 = cy - (it.y1-cy); const nx2 = cx - (it.x2-cx), ny2 = cy - (it.y2-cy);
      it.x1=nx2; it.y1=ny2; it.x2=nx1; it.y2=ny1;
    } else { it.rot = (Math.round((it.rot||0)/90)*90 + 90) % 360; }
    pushHistory(); redraw(); selectById(id);
  };

  document.getElementById('btn-dup').onclick=()=>{
    if(!selected) return; const id = selected.getAttribute('data-id'); const it = data.find(d=>d.id===id); if(!it) return;
    const copy = JSON.parse(JSON.stringify(it)); copy.id = uid();
    if(copy.kind==='arrow'){
      const dx = GRID, dy = GRID; copy.x1 = snap(copy.x1 + dx); copy.y1 = snap(copy.y1 + dy); copy.x2 = snap(copy.x2 + dx); copy.y2 = snap(copy.y2 + dy);
    } else {
      copy.x = snap((it.x||0)+GRID); copy.y = snap((it.y||0)+GRID);
    }
    pushHistory(); data.push(copy); redraw(); selectById(copy.id);
  };

  document.getElementById('btn-delete').onclick=()=>{
    if(!selected) return; const id = selected.getAttribute('data-id'); pushHistory(); data = data.filter(d=>d.id!==id); selected=null; redraw();
  };

  // Undo/Redo
  document.getElementById('btn-undo').onclick=()=>{
    if(!undoStack.length) return; const cur = JSON.stringify(data); redoStack.push(cur); const prev = undoStack.pop(); restoreFrom(prev);
  };
  document.getElementById('btn-redo').onclick=()=>{
    if(!redoStack.length) return; const cur = JSON.stringify(data); undoStack.push(cur); const next = redoStack.pop(); restoreFrom(next);
  };

  // Keyboard (desktop niceties)
  window.addEventListener('keydown', (e)=>{
    if(e.key==='Delete' || e.key==='Backspace'){ if(selected){ e.preventDefault(); document.getElementById('btn-delete').click(); } }
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); if(e.shiftKey) document.getElementById('btn-redo').click(); else document.getElementById('btn-undo').click(); }
    if(e.key.toLowerCase()==='v') setMode('select');
    if(e.key.toLowerCase()==='h') setMode('pan');
    if(e.key.toLowerCase()==='r') document.getElementById('btn-rotate').click();
    if(e.key.toLowerCase()==='d') document.getElementById('btn-dup').click();
    if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); saveLocal(); }
    if(e.key==='?' || (e.shiftKey && e.key.toLowerCase()==='/')){ openHelp(); }
  });

  // Grid toggle
  gridToggle.addEventListener('change', ()=>{
    document.getElementById('gridRect').setAttribute('fill', gridToggle.checked? 'url(#grid)' : 'none');
  });

  // Share/Import via URL hash
  const btnShare = document.getElementById('btn-share');
  btnShare.onclick = async () => {
    const payload = encodeSceneToHash();
    const url = `${location.origin}${location.pathname}#${payload}`;
    try{
      await navigator.clipboard.writeText(url);
      showToast('URL copied to clipboard');
    }catch{
      prompt('Copy URL', url);
    }
  };

  function encodeSceneToHash(){
    const json = JSON.stringify(data);
    const b64 = btoa(unescape(encodeURIComponent(json))); // URL-safe-ish
    return 's=' + b64;
  }

  function tryImportFromHash(){
    if(location.hash.startsWith('#s=')){
      const b64 = location.hash.slice(3);
      try{
        const json = decodeURIComponent(escape(atob(b64)));
        const arr = JSON.parse(json);
        if(Array.isArray(arr)) { data = arr; redraw(); showToast('Scene loaded from URL'); }
      }catch(e){ console.warn('Failed to import scene from URL', e); }
    }
  }

  window.addEventListener('hashchange', tryImportFromHash);

  // Templates
  function applyTemplate(name){
    pushHistory();
    if(name==='4way'){
      data = [
        makeTile('cross', 600, 400),
        makeVehicle('car', 560, 360, '#1f9cf0'),
        makeVehicle('truck', 640, 440, '#f59e0b'),
        makeArrow(520, 360, 600, 360),
        makeText('Yield to right', 600, 300)
      ];
    } else if(name==='tjunction'){
      data = [
        makeTile('t', 600, 420),
        makeVehicle('suv', 600, 520, '#10b981'),
        makeText('Stop then proceed when clear', 600, 300),
        makeArrow(600, 500, 600, 460)
      ];
    } else if(name==='merge'){
      data = [
        makeTile('merge', 600, 400),
        makeVehicle('semi', 520, 400, '#ef4444'),
        makeVehicle('car', 660, 400, '#1f9cf0'),
        makeText('Zipper merge', 600, 300)
      ];
    }
    redraw();
  }

  // Help modal
  document.getElementById('btn-help').onclick = openHelp;
  function openHelp(){ helpDialog.showModal(); }

  // (Install prompt removed by request; Safari "Add to Home Screen" can be used.)

  // Initialize with a couple tiles to hint at usage, unless importing from URL
  function bootstrap(){
    tryImportFromHash();
    if(!location.hash){
      data = [
        makeTile('cross', 600, 400),
        makeVehicle('car', 560, 360, '#1f9cf0'),
        makeVehicle('truck', 640, 440, '#f59e0b'),
      ];
    }
    draw();
    showToast('Tip: Tap a pill to add items. Drag to move. Use Snap!');
  }

  bootstrap();

  // Drawer toggle and tabs
  btnDrawer?.addEventListener('click', ()=>{
    const open = drawer.getAttribute('data-open') !== 'false';
    drawer.setAttribute('data-open', String(!open));
  });
  
  // Prevent scroll conflicts between drawer and stage
  const tabPanels = document.querySelector('.drawer .tab-panels');
  if (tabPanels) {
    tabPanels.addEventListener('touchstart', (e) => {
      // Allow scrolling within drawer
      e.stopPropagation();
    }, { passive: true });
    
    tabPanels.addEventListener('touchmove', (e) => {
      // Prevent stage scrolling when scrolling drawer content
      const scrollTop = tabPanels.scrollTop;
      const scrollHeight = tabPanels.scrollHeight;
      const height = tabPanels.clientHeight;
      const deltaY = e.touches[0].clientY - (e.touches[0].startY || e.touches[0].clientY);
      
      if ((scrollTop === 0 && deltaY > 0) || (scrollTop === scrollHeight - height && deltaY < 0)) {
        // At scroll boundary, allow stage to handle
        return;
      }
      e.stopPropagation();
    }, { passive: false });
  }
  
  document.querySelectorAll('.drawer .tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.drawer .tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const name = tab.getAttribute('data-tab');
      // panels
      document.getElementById('tab-tiles').classList.toggle('hide', name!=='tiles');
      document.getElementById('tab-vehicles').classList.toggle('hide', name!=='vehicles');
      document.getElementById('tab-templates').classList.toggle('hide', name!=='templates');
      document.getElementById('tab-actions').classList.toggle('hide', name!=='actions');
    })
  })


  // Attach drawing listeners once
  drawCanvas.addEventListener('pointerdown', handlePointerDown);
  drawCanvas.addEventListener('pointermove', handlePointerMove);
  drawCanvas.addEventListener('pointerup', handlePointerUp);
  drawCanvas.addEventListener('pointercancel', handlePointerUp);

  // Initialize after all variables are declared
  console.log('Traffic Sketcher loaded - VERSION 2.0 - JS IS UPDATING!');
  setMode('select');
  applyView();
  redraw();
})();
