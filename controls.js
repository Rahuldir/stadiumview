/* ══════════════════════════════════════════════════════════════
   StadiumView — camera controls + Auto Director + real flood lights
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const wait = setInterval(function(){
    if (!window.StadiumView) return;
    clearInterval(wait);
    init();
  }, 50);

  function init(){
    const { scene, camera, sun, hemi, ambient } = window.StadiumView;
    const renderer = window.StadiumView.renderer;

    const target = new THREE.Vector3(0, 25, 0);
    let theta  = Math.PI * 0.25;
    let phi    = Math.PI * 0.32;
    let radius = 400;

    function updateCamera(){
      const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      const y = target.y + radius * Math.cos(phi);
      const z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    }
    updateCamera();

    // ─── Mouse drag ──────────────────────────────────────────
    let dragging = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      if (autoDirector.active) stopAutoDirector();
    });
    renderer.domElement.addEventListener('pointermove', function(e){
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      phi   -= (e.clientY - lastY) * 0.005;
      phi = Math.max(0.05, Math.min(Math.PI * 0.49, phi));
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });
    renderer.domElement.addEventListener('pointerup', function(){ dragging = false; });
    renderer.domElement.addEventListener('pointerleave', function(){ dragging = false; });

    // ─── Wheel zoom ──────────────────────────────────────────
    renderer.domElement.addEventListener('wheel', function(e){
      e.preventDefault();
      if (autoDirector.active) stopAutoDirector();
      radius = Math.max(5, Math.min(1500, radius + e.deltaY * 0.5));
      updateCamera();
    }, { passive: false });

    // ─── Pinch ───────────────────────────────────────────────
    let lastPinch = 0;
    renderer.domElement.addEventListener('touchmove', function(e){
      if (e.touches.length === 2){
        if (autoDirector.active) stopAutoDirector();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (lastPinch > 0){
          radius = Math.max(5, Math.min(1500, radius - (dist - lastPinch) * 1.2));
          updateCamera();
        }
        lastPinch = dist;
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', function(){ lastPinch = 0; });

    // ─── Smooth tween ────────────────────────────────────────
    function smoothTo(newTarget, newTheta, newPhi, newRadius, duration){
      const sT = target.clone();
      const sTh = theta, sP = phi, sR = radius;
      const t0 = performance.now();
      const dur = duration || 900;
      function step(){
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        target.lerpVectors(sT, newTarget, e);
        theta  = sTh + (newTheta  - sTh) * e;
        phi    = sP  + (newPhi    - sP)  * e;
        radius = sR  + (newRadius - sR)  * e;
        updateCamera();
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    // ─── Camera views ────────────────────────────────────────
    const V = THREE.Vector3;
    const VIEWS = {
      overview: { t: new V(0, 25, 0),      th: Math.PI * 0.25,   ph: Math.PI * 0.32, r: 450 },
      pitch:    { t: new V(0, 3, 0),       th: Math.PI * 0.5,    ph: Math.PI * 0.42, r: 45  },
      batting:  { t: new V(0, 3, 9),       th: Math.PI * 0.5,    ph: Math.PI * 0.45, r: 18  },
      aerial:   { t: new V(0, 0, 0),       th: Math.PI * 0.25,   ph: 0.1,            r: 550 },
      spider:   { t: new V(0, 5, 0),       th: Math.PI * 0.75,   ph: Math.PI * 0.42, r: 80  },
      drone:    { t: new V(0, 10, 5),      th: Math.PI * 1.2,    ph: Math.PI * 0.25, r: 120 },
      tv:       { t: new V(0, 3, 9),       th: Math.PI * 0.5,    ph: Math.PI * 0.5,  r: 38  },
      tvlong:   { t: new V(0, 2, 9),       th: Math.PI * 0.5,    ph: Math.PI * 0.46, r: 55  },
      tvhigh:   { t: new V(0, 5, 9),       th: Math.PI * 0.5,    ph: Math.PI * 0.38, r: 40  },
      bowler:   { t: new V(0, 2, 9),       th: 0,                ph: Math.PI * 0.5,  r: 40  },
      batsman:  { t: new V(0, 2, -6),      th: Math.PI,          ph: Math.PI * 0.5,  r: 35  },
      closeup:  { t: new V(0.35, 1.5, 9),  th: Math.PI * 1.25,   ph: Math.PI * 0.35, r: 8   },
      stumps:   { t: new V(0, 1.5, 10),    th: 0,                ph: Math.PI * 0.55, r: 12  },
      sideOn:   { t: new V(0, 2, 0),       th: Math.PI * 0.5,    ph: Math.PI * 0.42, r: 30  }
    };

    function applyView(name){
      const v = VIEWS[name];
      if (!v) return;
      smoothTo(v.t, v.th, v.ph, v.r, 900);
      document.querySelectorAll('#controls button[data-view]').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-view') === name);
      });
    }

    // ─── Auto Director ───────────────────────────────────────
    const autoDirector = {
      active: false,
      order: ['tv', 'bowler', 'closeup', 'sideOn', 'tvhigh', 'spider', 'stumps', 'tvlong', 'aerial'],
      index: 0,
      timer: null,
      holdMs: 4500
    };

    function nextAutoView(){
      if (!autoDirector.active) return;
      const name = autoDirector.order[autoDirector.index % autoDirector.order.length];
      autoDirector.index++;
      applyView(name);
      autoDirector.timer = setTimeout(nextAutoView, autoDirector.holdMs);
    }

    function startAutoDirector(){
      if (autoDirector.active) return;
      autoDirector.active = true;
      autoDirector.index = 0;
      const b = document.getElementById('btn-auto');
      if (b){ b.classList.add('on'); b.textContent = '⏸ Stop Director'; }
      nextAutoView();
    }
    function stopAutoDirector(){
      autoDirector.active = false;
      if (autoDirector.timer) clearTimeout(autoDirector.timer);
      autoDirector.timer = null;
      const b = document.getElementById('btn-auto');
      if (b){ b.classList.remove('on'); b.textContent = '▶ Auto Director'; }
    }
    function toggleAutoDirector(){
      if (autoDirector.active) stopAutoDirector();
      else startAutoDirector();
    }

    // ─── Time of day ─────────────────────────────────────────
    const setFloods = window.StadiumView.setFloodlights || function(){};
    const floodCount = (window.StadiumView.floodLights || []).length;

    function setTime(mode){
      if (mode === 'day'){
        scene.background.setHex(0x87b8e0);
        if (ambient) ambient.intensity = 0.8;
        hemi.intensity = 0.6;
        sun.intensity  = 1.5;
        sun.color.setHex(0xffffff);
        sun.position.set(80, 400, 80);
        setFloods(0.0);
        renderer.toneMappingExposure = 1.0;
      } else if (mode === 'sunset'){
        scene.background.setHex(0x552a20);
        if (ambient) ambient.intensity = 0.4;
        hemi.intensity = 0.4;
        sun.intensity  = 0.9;
        sun.color.setHex(0xff8855);
        sun.position.set(300, 60, -200);
        setFloods(0.35);
        renderer.toneMappingExposure = 1.0;
      } else {  // night
        scene.background.setHex(0x020713);
        if (ambient) ambient.intensity = 0.05;
        hemi.intensity = 0.10;
        sun.intensity  = 0.0;
        sun.color.setHex(0x8899ff);
        setFloods(1.0);
        renderer.toneMappingExposure = 0.95;
      }
      if (scene.fog && scene.fog.color) scene.fog.color.copy(scene.background);
      console.log('[Time] ' + mode + ' — floods=' + floodCount + ' set=' +
                  (mode === 'night' ? 'FULL' : mode === 'sunset' ? '35%' : 'OFF'));
    }

    // ─── Inject controls ─────────────────────────────────────
    function injectControls(){
      const bar = document.getElementById('controls');
      if (!bar) return;

      const autoBtn = document.createElement('button');
      autoBtn.id = 'btn-auto';
      autoBtn.textContent = '▶ Auto Director';
      autoBtn.addEventListener('click', toggleAutoDirector);

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

      bar.appendChild(autoBtn);
      bar.appendChild(viewBtnRow);

      bar.querySelectorAll('button[data-view]').forEach(function(b){
        b.addEventListener('click', function(){
          if (autoDirector.active) stopAutoDirector();
          applyView(b.getAttribute('data-view'));
        });
      });

      bar.querySelectorAll('button[data-time]').forEach(function(b){
        b.addEventListener('click', function(){
          setTime(b.getAttribute('data-time'));
          bar.querySelectorAll('button[data-time]').forEach(function(x){ x.classList.remove('on'); });
          b.classList.add('on');
        });
      });

      const activeTime = bar.querySelector('button[data-time].on') || bar.querySelector('button[data-time]');
      if (activeTime) setTime(activeTime.getAttribute('data-time'));
    }
    injectControls();

    document.addEventListener('keydown', function(e){
      if (e.code === 'Space'){ e.preventDefault(); toggleAutoDirector(); }
    });

    console.log('[StadiumView] ✅ Controls ready — flood towers: ' + floodCount);
  }

})();
