/* ══════════════════════════════════════════════════════════════
   StadiumView — camera controls V2
   Absolute-position camera (not orbit) + auto fieldY offset
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

    // ─── Get fieldY from the raycast done in stadium.js ──────
    const fieldY = (typeof window.StadiumView.fieldY === 'number') ? window.StadiumView.fieldY : 0;
    console.log('[Camera] fieldY = ' + fieldY.toFixed(2));

    // Current camera position and look-at target
    const camPos   = new THREE.Vector3(200, fieldY + 100, 200);
    const camTarget = new THREE.Vector3(0, fieldY + 5, 0);

    camera.position.copy(camPos);
    camera.lookAt(camTarget);

    // ─── Smooth transition: lerp both position and target ───
    let transitionToken = 0;

    function smoothTo(newPos, newTarget, duration){
      const myToken = ++transitionToken;
      const sPos = camera.position.clone();
      const sTgt = camTarget.clone();
      const t0 = performance.now();
      const dur = duration || 1000;

      function step(){
        if (myToken !== transitionToken) return;
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        camera.position.lerpVectors(sPos, newPos, e);
        camTarget.lerpVectors(sTgt, newTarget, e);
        camera.lookAt(camTarget);

        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    /* ═══════════════════════════════════════════════════════════
       12 CRICKET CAMERA VIEWS
       All Y values are offsets from fieldY
       Pitch runs along Z (batsman at +z, bowler at -z)
       ═══════════════════════════════════════════════════════════ */
    const V = THREE.Vector3;
    const FY = fieldY;   // shorthand

    const VIEWS = {

      overview: {
        label: '📺 Overview',
        pos: new V(150,  FY + 90,  150),
        tgt: new V(0,    FY + 5,   0)
      },

      aerial: {
        label: '🚁 Aerial',
        pos: new V(0,    FY + 250, 0.1),
        tgt: new V(0,    FY,       0)
      },

      spider: {
        label: '🕷️ Spider Cam',
        pos: new V(25,   FY + 20,  30),
        tgt: new V(0,    FY + 2,   0)
      },

      drone: {
        label: '🛸 Drone',
        pos: new V(0,    FY + 45,  55),
        tgt: new V(0,    FY + 2,   0)
      },

      // ── TV BROADCAST: from behind bowler, looking at striker ──
      tv: {
        label: '📺 TV Broadcast',
        pos: new V(0,    FY + 12,  -32),
        tgt: new V(0,    FY + 3,   9)
      },

      tvlong: {
        label: '📺 TV Long',
        pos: new V(0,    FY + 20,  -45),
        tgt: new V(0,    FY + 3,   9)
      },

      tvhigh: {
        label: '📺 TV High',
        pos: new V(0,    FY + 30,  -40),
        tgt: new V(0,    FY + 2,   9)
      },

      bowler: {
        label: '🎯 Behind Bowler',
        pos: new V(0,    FY + 4,   -28),
        tgt: new V(0,    FY + 2,   9)
      },

      batsman: {
        label: '🏏 Behind Batsman',
        pos: new V(0,    FY + 4,   25),
        tgt: new V(0,    FY + 2,   -10)
      },

      closeup: {
        label: '🎬 Striker Close-up',
        pos: new V(-4,   FY + 2.5, 13),
        tgt: new V(0.35, FY + 1.5, 9)
      },

      stumps: {
        label: '🎯 Stump Cam',
        pos: new V(0.9,  FY + 0.8, 10.5),
        tgt: new V(0,    FY + 1.5, -5)
      },

      sideOn: {
        label: '🎥 Side On',
        pos: new V(28,   FY + 4,   0),
        tgt: new V(0,    FY + 2,   0)
      }
    };

    function applyView(name){
      const v = VIEWS[name];
      if (!v) return;
      smoothTo(v.pos, v.tgt, 1000);
      document.querySelectorAll('#controls button[data-view]').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-view') === name);
      });
    }

    // ─── Auto Director ────────────────────────────────────────
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
      const btn = document.getElementById('btn-auto');
      if (btn){
        btn.classList.remove('on');
        btn.textContent = '▶ Auto Director';
      }
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

    /* ═══════════════════════════════════════════════════════════
       MANUAL ORBIT (drag) — offsets from a base position
       Rather than absolute, we compute the orbit around camTarget
       ═══════════════════════════════════════════════════════════ */
    let dragging = false, lastX = 0, lastY = 0;

    renderer.domElement.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });

    renderer.domElement.addEventListener('pointermove', function(e){
      if (!dragging) return;
      if (autoDirector.active) stopAutoDirector();

      // Convert camera position to spherical around camTarget
      const offset = new THREE.Vector3().subVectors(camera.position, camTarget);
      const r = offset.length();
      if (r < 0.001) return;

      let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / r)));
      let theta = Math.atan2(offset.z, offset.x);

      theta -= (e.clientX - lastX) * 0.005;
      phi   -= (e.clientY - lastY) * 0.005;
      phi = Math.max(0.05, Math.min(Math.PI * 0.49, phi));

      const newOffset = new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      camera.position.copy(camTarget).add(newOffset);
      camera.lookAt(camTarget);

      lastX = e.clientX; lastY = e.clientY;
    });

    renderer.domElement.addEventListener('pointerup', function(){ dragging = false; });
    renderer.domElement.addEventListener('pointerleave', function(){ dragging = false; });

    // ─── Wheel zoom — moves camera toward/away from target ───
    renderer.domElement.addEventListener('wheel', function(e){
      e.preventDefault();
      if (autoDirector.active) stopAutoDirector();
      const offset = new THREE.Vector3().subVectors(camera.position, camTarget);
      const dir = offset.clone().normalize();
      offset.addScaledVector(dir, -e.deltaY * 0.3);
      const newR = Math.max(3, Math.min(800, offset.length()));
      offset.normalize().multiplyScalar(newR);
      camera.position.copy(camTarget).add(offset);
      camera.lookAt(camTarget);
    }, { passive: false });

    // Touch pinch
    let lastPinch = 0;
    renderer.domElement.addEventListener('touchmove', function(e){
      if (e.touches.length === 2){
        if (autoDirector.active) stopAutoDirector();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (lastPinch > 0){
          const offset = new THREE.Vector3().subVectors(camera.position, camTarget);
          const dir = offset.clone().normalize();
          offset.addScaledVector(dir, (lastPinch - dist) * 1.5);
          const newR = Math.max(3, Math.min(800, offset.length()));
          offset.normalize().multiplyScalar(newR);
          camera.position.copy(camTarget).add(offset);
          camera.lookAt(camTarget);
        }
        lastPinch = dist;
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', function(){ lastPinch = 0; });

    // ─── Inject extra buttons into the existing controls bar ──
    function injectControls(){
      const bar = document.getElementById('controls');
      if (!bar) return;

      const autoBtn = document.createElement('button');
      autoBtn.id = 'btn-auto';
      autoBtn.textContent = '▶ Auto Director';
      autoBtn.addEventListener('click', toggleAutoDirector);

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
    }
    injectControls();

    // ─── Keyboard shortcuts ───────────────────────────────────
    document.addEventListener('keydown', function(e){
      if (e.code === 'Space'){
        e.preventDefault();
        toggleAutoDirector();
      }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9){
        const keys = Object.keys(VIEWS);
        if (keys[n - 1]) applyView(keys[n - 1]);
      }
    });

    console.log('[StadiumView] ✅ Camera V2 ready — fieldY offset applied');
    console.log('[StadiumView] views use absolute positions with fieldY = ' + fieldY.toFixed(2));
  }

})();
