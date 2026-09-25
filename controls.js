/* StadiumView — mobile-friendly camera controls */
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

    const F = SV.fieldY || 0;
    const target = new THREE.Vector3(0, F + 10, 0);
    let theta = Math.PI * 0.25;
    let phi   = Math.PI * 0.32;
    let radius = window.IS_MOBILE ? 120 : 160;

    const PHI_MIN = 0.10;
    const PHI_MAX = Math.PI * 0.48;
    const R_MIN = 5;
    const R_MAX = window.IS_MOBILE ? 180 : 200;
    const FLOOR_Y = F + 0.5;

    function clampPhi(v){ return Math.max(PHI_MIN, Math.min(PHI_MAX, v)); }
    function clampR(v){ return Math.max(R_MIN, Math.min(R_MAX, v)); }

    function updateCamera(){
      phi = clampPhi(phi);
      radius = clampR(radius);
      const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      let   y = target.y + radius * Math.cos(phi);
      const z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      if (y < FLOOR_Y) y = FLOOR_Y;
      camera.position.set(x, y, z);
      camera.lookAt(target);
    }
    updateCamera();

    // ─── Pointer drag ─────────────────────────────────────
    let dragging = false, lastX = 0, lastY = 0, touchCount = 0;
    const canvas = renderer.domElement;

    canvas.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener('pointermove', function(e){
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      theta -= dx * 0.006;
      phi   -= dy * 0.006;
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });
    canvas.addEventListener('pointerup',    function(){ dragging = false; });
    canvas.addEventListener('pointerleave', function(){ dragging = false; });
    canvas.addEventListener('pointercancel',function(){ dragging = false; });

    // ─── Wheel ────────────────────────────────────────────
    canvas.addEventListener('wheel', function(e){
      e.preventDefault();
      radius = clampR(radius + e.deltaY * 0.5);
      updateCamera();
    }, { passive: false });

    // ─── Pinch-to-zoom ────────────────────────────────────
    let pinchDist = 0;
    canvas.addEventListener('touchstart', function(e){
      if (e.touches.length === 2){
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchDist = Math.hypot(dx, dy);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function(e){
      if (e.touches.length === 2 && pinchDist > 0){
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        radius = clampR(radius - (dist - pinchDist) * 1.1);
        pinchDist = dist;
        updateCamera();
      }
    }, { passive: true });
    canvas.addEventListener('touchend', function(){ pinchDist = 0; });

    // ─── Tween ────────────────────────────────────────────
    function smoothTo(nT, nTh, nP, nR, dur){
      const sT = target.clone();
      const sTh = theta, sP = phi, sR = radius;
      const tP = clampPhi(nP), tR = clampR(nR);
      const t0 = performance.now();
      dur = dur || 700;
      (function step(){
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
        target.lerpVectors(sT, nT, e);
        theta  = sTh + (nTh - sTh) * e;
        phi    = sP  + (tP  - sP)  * e;
        radius = sR  + (tR  - sR)  * e;
        updateCamera();
        if (t < 1) requestAnimationFrame(step);
      })();
    }

    // ─── Views (compact) ─────────────────────────────────
    const V = THREE.Vector3;
    function v(x,y,z){ return new V(x, F + y, z); }

    const VIEWS = {
      overview:{ t:v(0,10,0),  th:Math.PI*0.25, ph:Math.PI*0.30, r:150 },
      tv:      { t:v(0, 4,0),  th:0,            ph:Math.PI*0.42, r:60  },
      bowler:  { t:v(0, 2,8.6),th:-Math.PI*0.5, ph:Math.PI*0.42, r:28  },
      batsman: { t:v(0, 2,8.6),th:Math.PI*0.5,  ph:Math.PI*0.42, r:12  },
      closeup: { t:v(0.4,1.4,8.6), th:-Math.PI*0.35, ph:Math.PI*0.42, r:5 },
      stumps:  { t:v(0.4,1,8.6),  th:Math.PI*0.5, ph:Math.PI*0.42, r:3 },
      aerial:  { t:v(0, 0,0),  th:Math.PI*0.25, ph:0.14,         r:170 },
      sideOn:  { t:v(0, 2,0),  th:0,            ph:Math.PI*0.45, r:30  }
    };

    function applyView(name){
      const v = VIEWS[name];
      if (!v) return;
      smoothTo(v.t, v.th, v.ph, v.r, 700);
      document.querySelectorAll('#viewRow button').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-view') === name);
      });
    }

    // ─── Time of day ─────────────────────────────────────
    const setFloods = SV.setFloodlights || function(){};

    function setTime(mode){
      const sun = SV.sun, hemi = SV.hemi, ambient = SV.ambient;
      const bg = mode==='day' ? 0x87b8e0 : mode==='sunset' ? 0x4a1f16 : 0x01040a;
      if (scene.background && scene.background.setHex) scene.background.setHex(bg);

      if (mode === 'day'){
        if (ambient) ambient.intensity = 0.8;
        if (hemi) hemi.intensity = 0.6;
        if (sun){ sun.intensity = 1.5; sun.color.setHex(0xffffff); }
        setFloods(0);
        renderer.toneMappingExposure = 1.0;
      } else if (mode === 'sunset'){
        if (ambient) ambient.intensity = 0.4;
        if (hemi) hemi.intensity = 0.35;
        if (sun){ sun.intensity = 0.9; sun.color.setHex(0xff8855); }
        setFloods(0.4);
        renderer.toneMappingExposure = 0.95;
      } else {
        if (ambient) ambient.intensity = 0.05;
        if (hemi) hemi.intensity = 0.08;
        if (sun) sun.intensity = 0;
        setFloods(1);
        renderer.toneMappingExposure = 0.95;
      }
    }

    // ─── Menu wiring ─────────────────────────────────────
    function injectMenu(){
      const viewRow = document.getElementById('viewRow');
      if (viewRow && !viewRow.dataset.filled){
        viewRow.dataset.filled = '1';
        ['overview','tv','bowler','batsman','closeup','stumps','aerial','sideOn'].forEach(function(k){
          const b = document.createElement('button');
          b.setAttribute('data-view', k);
          b.textContent = k.charAt(0).toUpperCase() + k.slice(1);
          viewRow.appendChild(b);
        });
        viewRow.querySelectorAll('button').forEach(function(b){
          b.addEventListener('click', function(){ applyView(b.getAttribute('data-view')); });
        });
      }

      document.querySelectorAll('#timeRow button').forEach(function(b){
        b.addEventListener('click', function(){
          setTime(b.getAttribute('data-time'));
          document.querySelectorAll('#timeRow button').forEach(function(x){ x.classList.remove('on'); });
          b.classList.add('on');
        });
      });

      const autoBtn = document.getElementById('btn-auto');
      if (autoBtn){
        autoBtn.addEventListener('click', function(){
          if (autoBtn.classList.contains('on')){
            autoBtn.classList.remove('on');
            autoBtn.textContent = '▶ Director';
            if (directorTimer) clearTimeout(directorTimer);
          } else {
            autoBtn.classList.add('on');
            autoBtn.textContent = '⏸ Director';
            runDirector();
          }
        });
      }

      const resetBtn = document.getElementById('btn-reset');
      if (resetBtn){
        resetBtn.addEventListener('click', function(){
          if (window.PlayerControl) window.PlayerControl.resetAll();
        });
      }
    }

    let directorTimer = null;
    const directorOrder = ['tv','bowler','closeup','sideOn','batsman','stumps','tv','overview'];
    let directorIndex = 0;
    function runDirector(){
      if (directorTimer) clearTimeout(directorTimer);
      applyView(directorOrder[directorIndex % directorOrder.length]);
      directorIndex++;
      directorTimer = setTimeout(runDirector, 5000);
    }

    injectMenu();

    document.addEventListener('keydown', function(e){
      if (e.code === 'Space'){
        e.preventDefault();
        const autoBtn = document.getElementById('btn-auto');
        if (autoBtn) autoBtn.click();
      }
    });

    console.log('[Camera] F=' + F.toFixed(2) + ' · mobile=' + window.IS_MOBILE);
  }

})();
