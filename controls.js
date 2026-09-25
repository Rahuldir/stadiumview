/* ══════════════════════════════════════════════════════════════
   StadiumView — camera controls + 12 preset views + Auto Director
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const wait = setInterval(function(){
    if (!window.StadiumView) return;
    clearInterval(wait);
    init();
  }, 50);

  function init(){
    const { scene, camera, sun, hemi } = window.StadiumView;
    const renderer = window.StadiumView.renderer;

    // ─── Camera state ─────────────────────────────────────────
    const target = new THREE.Vector3(0, 30, 0);
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

    // ─── Auto-fit camera when stadium size is known ───────────
    setInterval(function(){
      if (window.StadiumView.stadiumRadius && !window.__camFitted){
        const r = window.StadiumView.stadiumRadius;
        if (r > 0){
          radius = Math.max(300, r * 2.4);
          target.set(0, 30, 0);
          updateCamera();
          window.__camFitted = true;
          console.log('[Camera] Auto-fitted: radius ' + radius.toFixed(0));
        }
      }
    }, 500);

    // ─── Mouse / touch orbit ──────────────────────────────────
    let dragging = false, lastX = 0, lastY = 0;

    renderer.domElement.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });

    renderer.domElement.addEventListener('pointermove', function(e){
      if (!dragging) return;
      // If user interacts, cancel auto-director
      if (autoDirector.active) stopAutoDirector();
      theta -= (e.clientX - lastX) * 0.005;
      phi   -= (e.clientY - lastY) * 0.005;
      phi = Math.max(0.05, Math.min(Math.PI * 0.49, phi));
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });

    renderer.domElement.addEventListener('pointerup', function(){ dragging = false; });
    renderer.domElement.addEventListener('pointerleave', function(){ dragging = false; });

    // ─── Scroll / pinch zoom ──────────────────────────────────
    renderer.domElement.addEventListener('wheel', function(e){
      e.preventDefault();
      if (autoDirector.active) stopAutoDirector();
      radius = Math.max(3, Math.min(2000, radius + e.deltaY * 0.5));
      updateCamera();
    }, { passive: false });

    let lastPinch = 0;
    renderer.domElement.addEventListener('touchmove', function(e){
      if (e.touches.length === 2){
        if (autoDirector.active) stopAutoDirector();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (lastPinch > 0){
          radius = Math.max(3, Math.min(2000, radius - (dist - lastPinch) * 1.2));
          updateCamera();
        }
        lastPinch = dist;
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', function(){ lastPinch = 0; });

    // ─── Smooth cinematic transition ──────────────────────────
    let transitionToken = 0;

    function smoothTo(newTarget, newTheta, newPhi, newRadius, duration){
      const myToken = ++transitionToken;
      const sT = target.clone();
      const sTh = theta, sP = phi, sR = radius;
      const t0 = performance.now();
      const dur = duration || 900;

      function step(){
        if (myToken !== transitionToken) return; // cancelled by a newer transition
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

    /* ═══════════════════════════════════════════════════════════
       12 CAMERA PRESETS — cricket broadcast style
       x/z are world positions; theta/phi/radius map to orbit
       ═══════════════════════════════════════════════════════════ */
    const V = THREE.Vector3;
    const VIEWS = {

      // ── Broad coverage ──
      overview: {
        label: '📺 Overview',
        t: new V(0, 25, 0),
        th: Math.PI * 0.25,
        ph: Math.PI * 0.32,
        r: 450
      },
      aerial: {
        label: '🚁 Aerial',
        t: new V(0, 0, 0),
        th: Math.PI * 0.25,
        ph: 0.1,
        r: 550
      },
      spider: {
        label: '🕷️ Spider Cam',
        t: new V(0, 5, 0),
        th: Math.PI * 0.75,
        ph: Math.PI * 0.42,
        r: 80
      },
      drone: {
        label: '🛸 Drone',
        t: new V(0, 10, 5),
        th: Math.PI * 1.2,
        ph: Math.PI * 0.25,
        r: 120
      },

      // ── TV broadcast ──
      tv: {
        label: '📺 TV Broadcast',
        t: new V(0, 3, 9),
        th: Math.PI * 0.5,
        ph: Math.PI * 0.5,
        r: 38
      },
      tvlong: {
        label: '📺 TV Long',
        t: new V(0, 2, 9),
        th: Math.PI * 0.5,
        ph: Math.PI * 0.46,
        r: 55
      },
      tvhigh: {
        label: '📺 TV High',
        t: new V(0, 5, 9),
        th: Math.PI * 0.5,
        ph: Math.PI * 0.38,
        r: 40
      },

      // ── Behind bowler (looking at batsman) ──
      bowler: {
        label: '🎯 Behind Bowler',
        t: new V(0, 2, 9),
        th: 0,                    // behind the bowler (negative z)
        ph: Math.PI * 0.5,
        r: 40
      },

      // ── Behind batsman (looking at bowler) ──
      batsman: {
        label: '🏏 Behind Batsman',
        t: new V(0, 2, -6),
        th: Math.PI,              // behind the batsman (positive z)
        ph: Math.PI * 0.5,
        r: 35
      },

      // ── Close-ups ──
      closeup: {
        label: '🎬 Striker Close-up',
        t: new V(0.35, 1.5, 9),
        th: Math.PI * 1.25,
        ph: Math.PI * 0.35,
        r: 8
      },
      stumps: {
        label: '🎯 Stump Cam',
        t: new V(0, 1.5, 10),
        th: 0,
        ph: Math.PI * 0.55,
        r: 12
      },

      // ── Side on ──
      sideOn: {
        label: '🎥 Side On',
        t: new V(0, 2, 0),
        th: Math.PI * 0.5,
        ph: Math.PI * 0.42,
        r: 30
      }
    };

    function applyView(name){
      const v = VIEWS[name];
      if (!v) return;
      smoothTo(v.t, v.th, v.ph, v.r, 900);
      document.querySelectorAll('#controls button[data-view]').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-view') === name);
      });
    }

    // ─── Auto Director ────────────────────────────────────────
    // Cycles through views automatically like a broadcast director.
    const autoDirector = {
      active: false,
      order: ['tv', 'bowler', 'closeup', 'sideOn', 'tvhigh', 'spider', 'stumps', 'tvlong', 'aerial'],
      index: 0,
      timer: null,
      holdMs: 4000
    };

    function nextAutoView(){
      if (!autoDirector.active) return;
      const name = autoDirector.order[autoDirector.index % autoDirector.order.length];
      autoDirector.index++;
      applyView(name);
      console.log('[AutoDirector] → ' + name);

      autoDirector.timer = setTimeout(nextAutoView, autoDirector.holdMs);
    }

    function startAutoDirector(){
      if (autoDirector.active) return;
      autoDirector.active = true;
      autoDirector.index = 0;
      document.getElementById('btn-auto').classList.add('on');
      document.getElementById('btn-auto').textContent = '⏸ Stop Director';
      nextAutoView();
    }

    function stopAutoDirector(){
      autoDirector.active = false;
      if (autoDirector.timer) clearTimeout(autoDirector.timer);
      autoDirector.timer = null;
      document.getElementById('btn-auto').classList.remove('on');
      document.getElementById('btn-auto').textContent = '▶ Auto Director';
    }

    function toggleAutoDirector(){
      if (autoDirector.active) stopAutoDirector();
      else startAutoDirector();
    }

    // ─── Time of day ──────────────────────────────────────────
    function setTime(mode){
      const bg = mode === 'day'    ? 0x87b8e0
               : mode === 'sunset' ? 0x552a20
               :                     0x020713;
      scene.background.setHex(bg);
      scene.fog.color.setHex(bg);

      if (mode === 'day'){
        hemi.intensity = 1.0; sun.intensity = 1.0;
        sun.color.setHex(0xffffff);
        sun.position.set(150, 300, 150);
      } else if (mode === 'sunset'){
        hemi.intensity = 0.65; sun.intensity = 0.9;
        sun.color.setHex(0xff8855);
        sun.position.set(300, 60, -200);
      } else {
        hemi.intensity = 0.35; sun.intensity = 0.3;
        sun.color.setHex(0x8899ff);
        sun.position.set(-150, 200, 80);
      }
    }

    // ─── Inject extra buttons into the controls bar ───────────
    // This adds the Auto Director + more camera buttons without
    // touching index.html.
    function injectControls(){
      const bar = document.getElementById('controls');
      if (!bar) return;

      // Add Auto Director button
      const autoBtn = document.createElement('button');
      autoBtn.id = 'btn-auto';
      autoBtn.textContent = '▶ Auto Director';
      autoBtn.addEventListener('click', toggleAutoDirector);

      // Add a menu of camera views
      const viewBtnRow = document.createElement('div');
      viewBtnRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1);width:100%;justify-content:center;';

      Object.keys(VIEWS).forEach(function(key){
        const btn = document.createElement('button');
        btn.setAttribute('data-view', key);
        btn.textContent = VIEWS[key].label;
        btn.style.padding = '6px 10px';
        btn.style.fontSize = '9.5px';
        viewBtnRow.appendChild(btn);
      });

      bar.appendChild(autoBtn);
      bar.appendChild(viewBtnRow);

      // Re-wire click handlers (since we added new buttons)
      bar.querySelectorAll('button[data-view]').forEach(function(b){
        b.addEventListener('click', function(){
          if (autoDirector.active) stopAutoDirector();
          applyView(b.getAttribute('data-view'));
        });
      });

      // Preserve original time-of-day buttons
      bar.querySelectorAll('button[data-time]').forEach(function(b){
        b.addEventListener('click', function(){
          setTime(b.getAttribute('data-time'));
          bar.querySelectorAll('button[data-time]').forEach(function(x){ x.classList.remove('on'); });
          b.classList.add('on');
        });
      });
    }
    injectControls();

    // ─── Keyboard shortcuts ───────────────────────────────────
    document.addEventListener('keydown', function(e){
      // Spacebar = toggle auto director
      if (e.code === 'Space'){
        e.preventDefault();
        toggleAutoDirector();
      }
      // Number keys 1-9 switch views
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9){
        const keys = Object.keys(VIEWS);
        if (keys[n - 1]) applyView(keys[n - 1]);
      }
    });

    console.log('[StadiumView] ✅ Controls + Auto Director ready');
    console.log('[StadiumView] 12 camera views available. Press Space to start auto director.');
  }

})();
