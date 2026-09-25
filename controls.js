/* ══════════════════════════════════════════════════════════════
   StadiumView — Camera Controls & Lighting (Angles Fixed v2)
   • Camera spawns in TV Broadcast view
   • Radius locked to 3…120 (never leaves stadium)
   • Hard Y floor: camera never dips below fieldY + 0.5 m
   • phi clamped in drag, wheel, AND tween
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const wait = setInterval(function(){
    if (!window.StadiumView) return;
    clearInterval(wait);
    init();
  }, 50);

  function init(){
    const SV = window.StadiumView;
    const scene    = SV.scene;
    const camera   = SV.camera;
    const renderer = SV.renderer;

    const V = THREE.Vector3;
    const F = SV.fieldY || 0;

    // ─── Safety bounds ───────────────────────────────────────
    const PHI_MIN    = 0.02;
    const PHI_MAX    = Math.PI * 0.47;   // never reaches horizontal
    const RADIUS_MIN = 3;
    const RADIUS_MAX = 120;
    const HARD_MIN_Y = F + 0.5;          // camera floor: grass + 0.5 m

    function clampPhi(v){ return Math.max(PHI_MIN, Math.min(PHI_MAX, v)); }
    function clampRadius(v){ return Math.max(RADIUS_MIN, Math.min(RADIUS_MAX, v)); }

    // ─── Broadcast camera angles ─────────────────────────────
    const VIEWS = {
      overview: { t: new V(0, 5, 0),     th: Math.PI * 0.25, ph: Math.PI * 0.35, r: 85 },
      pitch:    { t: new V(0, 2, 0),     th: Math.PI * 0.5,  ph: Math.PI * 0.42, r: 40 },
      batting:  { t: new V(0, 2, 8),     th: Math.PI * 0.5,  ph: Math.PI * 0.44, r: 15 },
      aerial:   { t: new V(0, 0, 0),     th: Math.PI * 0.25, ph: 0.01,           r: 110 },
      tv:       { t: new V(0, 2, 9),     th: Math.PI * 0.5,  ph: Math.PI * 0.44, r: 35 },
      tvlong:   { t: new V(0, 2, 9),     th: Math.PI * 0.5,  ph: Math.PI * 0.42, r: 60 },
      tvhigh:   { t: new V(0, 5, 9),     th: Math.PI * 0.5,  ph: Math.PI * 0.36, r: 45 },
      bowler:   { t: new V(0, 2, -10),   th: 0,              ph: Math.PI * 0.42, r: 25 },
      batsman:  { t: new V(0, 2, 10),    th: Math.PI,        ph: Math.PI * 0.42, r: 25 },
      closeup:  { t: new V(0, 1.5, 8.6), th: Math.PI * 1.15, ph: Math.PI * 0.40, r: 6 },
      stumps:   { t: new V(0, 1, 10),    th: 0,              ph: Math.PI * 0.42, r: 4 },
      sideon:   { t: new V(0, 2, 0),     th: Math.PI * 0.5,  ph: Math.PI * 0.42, r: 40 }
    };

    // Spawn in TV view
    const startView = VIEWS.tv;
    const target = startView.t.clone();
    let theta  = startView.th;
    let phi    = startView.ph;
    let radius = startView.r;

    function updateCamera(){
      // Clamp inputs (catches tween overshoot + manual drag)
      phi    = clampPhi(phi);
      radius = clampRadius(radius);

      const currentFieldY = window.StadiumView.fieldY || 0;
      const actualTarget = new THREE.Vector3(target.x, target.y + currentFieldY, target.z);

      const x = actualTarget.x + radius * Math.sin(phi) * Math.cos(theta);
      let   y = actualTarget.y + radius * Math.cos(phi);
      const z = actualTarget.z + radius * Math.sin(phi) * Math.sin(theta);

      // ⬇⬇⬇ THE FIX — hard floor, never underground ⬇⬇⬇
      if (y < HARD_MIN_Y) y = HARD_MIN_Y;

      camera.position.set(x, y, z);
      camera.lookAt(actualTarget);
    }
    updateCamera();

    // ─── Drag ────────────────────────────────────────────────
    let dragging = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    renderer.domElement.addEventListener('pointermove', function(e){
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      phi   -= (e.clientY - lastY) * 0.005;
      phi = clampPhi(phi);
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });
    renderer.domElement.addEventListener('pointerup',    function(){ dragging = false; });
    renderer.domElement.addEventListener('pointerleave', function(){ dragging = false; });

    // ─── Wheel zoom ──────────────────────────────────────────
    renderer.domElement.addEventListener('wheel', function(e){
      e.preventDefault();
      radius = clampRadius(radius + e.deltaY * 0.05);
      updateCamera();
    }, { passive: false });

    // ─── Tween ───────────────────────────────────────────────
    function smoothTo(newTarget, newTheta, newPhi, newRadius, duration){
      const sT  = target.clone();
      const sTh = theta, sP = phi, sR = radius;
      const tP  = clampPhi(newPhi);        // ⬅ clamp the destination
      const tR  = clampRadius(newRadius);
      const t0  = performance.now();
      const dur = duration || 900;

      function step(){
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        target.lerpVectors(sT, newTarget, e);
        theta  = sTh + (newTheta - sTh) * e;
        phi    = sP  + (tP      - sP)  * e;
        radius = sR  + (tR      - sR)  * e;
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

    // ─── Time of day + physical flood lights ─────────────────
    function setTime(mode){
      const sun     = SV.sun     || null;
      const hemi    = SV.hemi    || null;
      const ambient = SV.ambient || null;

      const bg = mode === 'day'    ? 0x87b8e0
               : mode === 'sunset' ? 0xd97742
               :                     0x01050a;

      if (scene.background && scene.background.setHex) scene.background.setHex(bg);
      if (scene.fog && scene.fog.color && scene.fog.color.setHex) scene.fog.color.setHex(bg);

      // Build physical lights once
      if (!SV.physicalLights){
        SV.physicalLights = [];
        const topY = F + 46;
        const rad  = 82;
        const corners = [
          [-rad, topY, -rad], [rad, topY, -rad],
          [-rad, topY,  rad], [rad, topY,  rad]
        ];
        corners.forEach(function(pos){
          const spot = new THREE.SpotLight(0xfff5e6, 0, 800, Math.PI * 0.26, 0.55, 0);
          spot.position.set(pos[0], pos[1], pos[2]);
          spot.target.position.set(0, F, 0);
          scene.add(spot);
          scene.add(spot.target);
          SV.physicalLights.push(spot);
        });
        console.log('[Floodlights] 4 physical spotlights attached to towers');
      }

      if (mode === 'day'){
        if (ambient) ambient.intensity = 0.8;
        if (hemi)    hemi.intensity    = 0.6;
        if (sun){ sun.intensity = 1.5; sun.color.setHex(0xffffff); sun.position.set(80, 400, 80); }
        SV.physicalLights.forEach(function(l){ l.intensity = 0; });
        if (SV.setFloodlights) SV.setFloodlights(0);
        renderer.toneMappingExposure = 1.0;
      } else if (mode === 'sunset'){
        if (ambient) ambient.intensity = 0.4;
        if (hemi)    hemi.intensity    = 0.3;
        if (sun){ sun.intensity = 1.2; sun.color.setHex(0xff8855); sun.position.set(300, 60, -200); }
        SV.physicalLights.forEach(function(l){ l.intensity = 0; });
        if (SV.setFloodlights) SV.setFloodlights(0);
        renderer.toneMappingExposure = 0.85;
      } else {
        if (ambient) ambient.intensity = 0.05;
        if (hemi)    hemi.intensity    = 0.08;
        if (sun)     sun.intensity     = 0;
        SV.physicalLights.forEach(function(l){ l.intensity = 1.2; });
        if (SV.setFloodlights) SV.setFloodlights(1);
        renderer.toneMappingExposure = 0.9;
      }
      console.log('[Time] ' + mode);
    }

    // ─── Inject controls ─────────────────────────────────────
    function injectControls(){
      const bar = document.getElementById('controls');
      if (!bar) return;

      const viewBtnRow = document.createElement('div');
      viewBtnRow.style.cssText =
        'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;padding-top:6px;' +
        'border-top:1px solid rgba(255,255,255,.1);width:100%;justify-content:center;';

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

      // Auto-highlight TV on spawn
      setTimeout(function(){ applyView('tv'); }, 100);
    }
    injectControls();

    console.log('[Camera] F = y ' + F.toFixed(2) + ' · floor = y ' + HARD_MIN_Y.toFixed(2) +
                ' · phi [' + PHI_MIN + '…' + PHI_MAX.toFixed(2) + ']' +
                ' · radius [' + RADIUS_MIN + '…' + RADIUS_MAX + ']');
  }

})();
