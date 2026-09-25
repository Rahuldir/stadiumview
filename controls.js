/* ══════════════════════════════════════════════════════════════
   StadiumView — Camera Controls & Lighting (Angles Fixed)
   • Camera spawns directly in TV Broadcast view
   • Zoom is locked to a maximum of 120m (prevents leaving stadium)
   • Dynamic tracking to the pitch grass level
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const wait = setInterval(function(){
    if (!window.StadiumView) return;
    clearInterval(wait);
    init();
  }, 50);

  function init(){
    const { scene, camera } = window.StadiumView;
    const renderer = window.StadiumView.renderer;

    const V = THREE.Vector3;
    
    // Broadcast camera angles (Radii are kept tight so camera stays inside)
    const VIEWS = {
      overview: { t: new V(0, 5, 0),    th: Math.PI * 0.25, ph: Math.PI * 0.35, r: 85 },
      pitch:    { t: new V(0, 2, 0),    th: Math.PI * 0.5,  ph: Math.PI * 0.45, r: 40 },
      batting:  { t: new V(0, 2, 8),    th: Math.PI * 0.5,  ph: Math.PI * 0.48, r: 15 },
      aerial:   { t: new V(0, 0, 0),    th: Math.PI * 0.25, ph: 0.01,           r: 110 },
      tv:       { t: new V(0, 2, 9),    th: Math.PI * 0.5,  ph: Math.PI * 0.48, r: 35 },
      tvlong:   { t: new V(0, 2, 9),    th: Math.PI * 0.5,  ph: Math.PI * 0.46, r: 60 },
      tvhigh:   { t: new V(0, 5, 9),    th: Math.PI * 0.5,  ph: Math.PI * 0.38, r: 45 },
      bowler:   { t: new V(0, 2, -10),  th: 0,              ph: Math.PI * 0.45, r: 25 },
      batsman:  { t: new V(0, 2, 10),   th: Math.PI,        ph: Math.PI * 0.45, r: 25 },
      closeup:  { t: new V(0, 1.5, 8.6),th: Math.PI * 1.15, ph: Math.PI * 0.42, r: 6 },
      stumps:   { t: new V(0, 1, 10),   th: 0,              ph: Math.PI * 0.5,  r: 4 },
      sideon:   { t: new V(0, 2, 0),    th: Math.PI * 0.5,  ph: Math.PI * 0.45, r: 40 }
    };

    // SPAWN FIX: Start exactly at the TV Broadcast angle instead of 400m away
    const startView = VIEWS.tv;
    const target = startView.t.clone();
    let theta  = startView.th;
    let phi    = startView.ph;
    let radius = startView.r;

    function updateCamera(){
      const currentFieldY = window.StadiumView.fieldY || 0;
      const actualTarget = new THREE.Vector3(target.x, target.y + currentFieldY, target.z);
      
      const x = actualTarget.x + radius * Math.sin(phi) * Math.cos(theta);
      const y = actualTarget.y + radius * Math.cos(phi);
      const z = actualTarget.z + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.set(x, y, z);
      camera.lookAt(actualTarget);
    }
    updateCamera();

    let dragging = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    renderer.domElement.addEventListener('pointermove', function(e){
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      phi   -= (e.clientY - lastY) * 0.005;
      phi = Math.max(0.01, Math.min(Math.PI * 0.49, phi)); // Prevents clipping under the grass
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });
    renderer.domElement.addEventListener('pointerup', function(){ dragging = false; });
    renderer.domElement.addEventListener('pointerleave', function(){ dragging = false; });

    // ZOOM FIX: Hard-locked to max 120 meters so camera never clips outside the stadium
    renderer.domElement.addEventListener('wheel', function(e){
      e.preventDefault();
      radius = Math.max(3, Math.min(120, radius + e.deltaY * 0.05));
      updateCamera();
    }, { passive: false });

    function smoothTo(newTarget, newTheta, newPhi, newRadius, duration){
      const sT = target.clone();
      const sTh = theta, sP = phi, sR = radius;
      const t0 = performance.now();
      const dur = duration || 900;
      function step(){
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        target.lerpVectors(sT, newTarget, e);
        theta = sTh + (newTheta - sTh) * e;
        phi   = sP  + (newPhi   - sP)  * e;
        radius = sR + (newRadius - sR) * e;
        updateCamera();
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    function applyView(name){
      const v = VIEWS[name];
      if (!v) return;
      smoothTo(v.t, v.th, v.ph, v.r, 900);
      document.querySelectorAll('#controls button[data-view]').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-view') === name);
      });
    }

    // ─── STADIUM FLOODLIGHT LOGIC ─────────────────────────
    function setTime(mode){
      const { scene, sun, hemi, ambient, renderer } = window.StadiumView;
      const bg = mode === 'day' ? 0x87b8e0 : mode === 'sunset' ? 0xd97742 : 0x01050a;
               
      if (scene.background) scene.background.setHex(bg);
      if (scene.fog && scene.fog.color) scene.fog.color.setHex(bg);

      if (!window.StadiumView.physicalLights) {
        window.StadiumView.physicalLights = [];
        const topY = window.StadiumView.stadiumTopY || 50;
        const rad = window.StadiumView.stadiumRadius || 80;
        const corners = [[-rad, topY, -rad], [rad, topY, -rad], [-rad, topY, rad], [rad, topY, rad]];
        
        corners.forEach(pos => {
          const spot = new THREE.SpotLight(0xfff5e6, 0, 800, Math.PI * 0.25, 0.5, 0); 
          spot.position.set(pos[0], pos[1], pos[2]);
          spot.target.position.set(0, window.StadiumView.fieldY || 0, 0);
          scene.add(spot);
          scene.add(spot.target);
          window.StadiumView.physicalLights.push(spot);
        });
      }

      if (mode === 'day'){
        if (ambient) ambient.intensity = 0.8;
        hemi.intensity = 0.6;
        sun.intensity  = 1.5;
        sun.color.setHex(0xffffff);
        window.StadiumView.physicalLights.forEach(fl => fl.intensity = 0);
        window.StadiumView.setFloodlights(0); 
        renderer.toneMappingExposure = 1.0; 
        
      } else if (mode === 'sunset'){
        if (ambient) ambient.intensity = 0.4;
        hemi.intensity = 0.3;
        sun.intensity  = 1.2;
        sun.color.setHex(0xff8855);
        window.StadiumView.physicalLights.forEach(fl => fl.intensity = 0);
        window.StadiumView.setFloodlights(0);
        renderer.toneMappingExposure = 0.85; 
        
      } else {
        if (ambient) ambient.intensity = 0.05; 
        hemi.intensity = 0.08; 
        sun.intensity  = 0; 
        window.StadiumView.physicalLights.forEach(fl => fl.intensity = 1.2);
        window.StadiumView.setFloodlights(1); 
        renderer.toneMappingExposure = 0.9; 
      }
    }

    function injectControls(){
      const bar = document.getElementById('controls');
      if (!bar) return;

      const viewBtnRow = document.createElement('div');
      viewBtnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1);width:100%;justify-content:center;';

      Object.keys(VIEWS).forEach(function(key){
        const btn = document.createElement('button');
        btn.setAttribute('data-view', key);
        btn.textContent = key.charAt(0).toUpperCase() + key.slice(1);
        btn.style.padding = '6px 10px';
        btn.style.fontSize = '9.5px';
        viewBtnRow.appendChild(btn);
      });

      bar.appendChild(viewBtnRow);

      bar.querySelectorAll('button[data-view]').forEach(function(b){
        b.addEventListener('click', function(){ applyView(b.getAttribute('data-view')); });
      });

      bar.querySelectorAll('button[data-time]').forEach(function(b){
        b.addEventListener('click', function(){
          setTime(b.getAttribute('data-time'));
          bar.querySelectorAll('button[data-time]').forEach(function(x){ x.classList.remove('on'); });
          b.classList.add('on');
        });
      });
      
      // Auto-click TV view on spawn to light up the UI toggle
      setTimeout(() => applyView('tv'), 100);
    }
    injectControls();
  }

})();
