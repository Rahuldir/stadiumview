/* ══════════════════════════════════════════════════════════════
   StadiumView — camera controls + Auto Director + flood lights
   All view targets are relative to fieldY (grass level).
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
    const sun      = SV.sun     || null;
    const hemi     = SV.hemi    || null;
    const ambient  = SV.ambient || null;

    // Ground reference — every camera target is relative to this
    const F = SV.fieldY || 0;

    const target = new THREE.Vector3(0, F + 12, 0);
    let theta  = Math.PI * 0.25;
    let phi    = Math.PI * 0.30;
    let radius = 380;

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
    renderer.domElement.addEventListener('pointerup',    function(){ dragging = false; });
    renderer.domElement.addEventListener('pointerleave', function(){ dragging = false; });

    // ─── Wheel ───────────────────────────────────────────────
    renderer.domElement.addEventListener('wheel', function(e){
      e.preventDefault();
      if (autoDirector.active) stopAutoDirector();
      radius = Math.max(2, Math.min(1500, radius + e.deltaY * 0.5));
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
          radius = Math.max(2, Math.min(1500, radius - (dist - lastPinch) * 1.2));
          updateCamera();
        }
        lastPinch = dist;
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', function(){ lastPinch = 0; });

    // ─── Tween ───────────────────────────────────────────────
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

    // ─── Views ───────────────────────────────────────────────
    // Helper: Y values are ALWAYS relative to ground level (F).
    const V = THREE.Vector3;
    function v(x, y, z){ return new V(x, F + y, z); }

    const VIEWS = {
      //     target (x, y-above-grass, z)   theta                  phi               radius
      overview:  { t: v(0,    12,  0),       th: Math.PI * 0.25,    ph: Math.PI * 0.30, r: 380 },
      tv:        { t: v(0,     5,  0),       th: 0,                 ph: Math.PI * 0.40, r: 65  },
      tvlong:    { t: v(0,     5,  0),       th: 0,                 ph: Math.PI * 0.42, r: 100 },
      tvhigh:    { t: v(0,     5,  0),       th: 0,                 ph: Math.PI * 0.30, r: 70  },
      bowler:    { t: v(0,     3,  8.6),     th: -Math.PI * 0.50,   ph: Math.PI * 0.46, r: 38  },
      batsman:   { t: v(0.4,   3,  8.6),     th: Math.PI * 0.50,    ph: Math.PI * 0.42, r: 14  },
      batting:   { t: v(0.4,   3,  8.6),     th: Math.PI * 0.50,    ph: Math.PI * 0.42, r: 14  },
      closeup:   { t: v(0.4,  1.4, 8.6),     th: -Math.PI * 0.35,   ph: Math.PI * 0.42, r: 5   },
      stumps:    { t: v(0.4,  1.0, 8.6),     th: Math.PI * 0.50,    ph: Math.PI * 0.55, r: 2.5 },
      sideOn:    { t: v(0,     2,  0),       th: 0,                 ph: Math.PI * 0.48, r: 30  },
      pitch:     { t: v(0,     1,  0),       th: 0,                 ph: Math.PI * 0.50, r: 22  },
      aerial:    { t: v(0,     0,  0),       th: Math.PI * 0.25,    ph: 0.12,           r: 420 },
      spider:    { t: v(0,     6,  0),       th: Math.PI * 0.75,    ph: Math.PI * 0.35, r: 45  },
      drone:     { t: v(0,     4,  5),       th: Math.PI * 1.2,     ph: Math.PI * 0.35, r: 70  }
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

    // ─── Time of day — darker night, floods are the only source ─
    const setFloods = (typeof SV.setFloodlights === 'function') ? SV.setFloodlights : function(){};
    const floodCount = (SV.floodLights || []).length;

    function setTime(mode){
      if (!scene) return;

      const bgHex = mode === 'day'    ? 0x87b8e0
                  : mode === 'sunset' ? 0x4a1f16
                  :                     0x01040a;

      if (scene.background && scene.background.setHex){
        scene.background.setHex(bgHex);
      } else {
        scene.background = new THREE.Color(bgHex);
      }

      if (ambient) ambient.intensity = mode === 'day' ? 0.8
                                    : mode === 'sunset' ? 0.35
                                    : 0.02;
      if (hemi)    hemi.intensity    = mode === 'day' ? 0.6
                                    : mode === 'sunset' ? 0.35
                                    : 0.05;

      if (sun){
        sun.intensity = mode === 'day' ? 1.5
                      : mode === 'sunset' ? 0.85
                      : 0.0;
        if (sun.color && sun.color.setHex){
          sun.color.setHex(mode === 'day' ? 0xffffff
                         : mode === 'sunset' ? 0xff8855
                         : 0x8090ff);
        }
        if (sun.position && sun.position.set){
          if (mode === 'sunset')       sun.position.set(300, 60, -200);
          else if (mode === 'night')   sun.position.set(-150, 200, 80);
          else                         sun.position.set(80, 400, 80);
        }
      }

      if (scene.fog && scene.fog.color && scene.fog.color.setHex){
        scene.fog.color.setHex(bgHex);
      }

      // 0 → off, 0.35 → warm-up, 1.0 → full
      setFloods(mode === 'night' ? 1.0 : mode === 'sunset' ? 0.35 : 0.0);

      // Reduce overall glow at night so it doesn't wash out
      if (renderer){
        renderer.toneMappingExposure = mode === 'night'  ? 0.75
                                     : mode === 'sunset' ? 0.95
                                     : 1.0;
      }

      console.log('[Time] ' + mode + ' — floods=' + floodCount +
                  ' set=' + (mode === 'night' ? 'FULL' : mode === 'sunset' ? '35%' : 'OFF'));
    }

    // ─── Inject controls ─────────────────────────────────────
    function injectControls(){
      const bar = document.getElementById('controls');
      if (!bar) return;

      if (!document.getElementById('btn-auto')){
        const autoBtn = document.createElement('button');
        autoBtn.id = 'btn-auto';
        autoBtn.textContent = '▶ Auto Director';
        autoBtn.addEventListener('click', toggleAutoDirector);
        bar.appendChild(autoBtn);
      }

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

    console.log('[Camera] ground = y ' + F.toFixed(2) + ' — all views relative to grass');
    console.log('[StadiumView] ✅ Controls ready — flood lights: ' + floodCount);
  }

})();
