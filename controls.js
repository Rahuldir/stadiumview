/* ══════════════════════════════════════════════════════════════
   StadiumView — Camera controls + Auto Director
   • Reads fieldY correctly (retries until ready)
   • Exposes window.__applyView / window.__setTime
   • Does NOT touch the DOM — the menu in index.html handles buttons
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const wait = setInterval(function(){
    if (!window.StadiumView || !window.StadiumView.scene) return;
    clearInterval(wait);
    // Small delay so stadium.js finishes the raycast
    setTimeout(init, 150);
  }, 100);

  function init(){
    const SV       = window.StadiumView;
    const scene    = SV.scene;
    const camera   = SV.camera;
    const renderer = SV.renderer;

    // ─── fieldY — retry until it's non-zero ────────────────
    let F = SV.fieldY;
    if (!F || F < 1){
      // stadium.js may not have finished; poll a few times
      let tries = 0;
      const poll = setInterval(function(){
        tries++;
        if (SV.fieldY && SV.fieldY > 1){ F = SV.fieldY; clearInterval(poll); }
        else if (tries > 40){ F = SV.fieldY || 7.19; clearInterval(poll); }
      }, 100);
      F = SV.fieldY || 7.19;   // provisional
    }
    console.log('[Camera] fieldY=' + F.toFixed(2));

    // ─── Target + state ────────────────────────────────────
    const target = new THREE.Vector3(0, F + 10, 0);
    let theta  = Math.PI * 0.25;
    let phi    = Math.PI * 0.32;
    let radius = 160;

    const PHI_MIN = 0.10;
    const PHI_MAX = Math.PI * 0.48;
    const R_MIN   = 3;
    const R_MAX   = 180;
    const FLOOR_Y = F + 0.5;

    function clampPhi(v){ return Math.max(PHI_MIN, Math.min(PHI_MAX, v)); }
    function clampR(v){   return Math.max(R_MIN,   Math.min(R_MAX,   v)); }

    function updateCamera(){
      phi    = clampPhi(phi);
      radius = clampR(radius);

      const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      let   y = target.y + radius * Math.cos(phi);
      const z = target.z + radius * Math.sin(phi) * Math.sin(theta);

      if (y < FLOOR_Y) y = FLOOR_Y;

      camera.position.set(x, y, z);
      camera.lookAt(target);
    }
    updateCamera();

    // ─── Input — drag / wheel / pinch ──────────────────────
    let dragging = false, lastX = 0, lastY = 0;
    const canvas = renderer.domElement;

    canvas.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    canvas.addEventListener('pointermove', function(e){
      if (!dragging) return;
      theta -= (e.clientX - lastX) * 0.005;
      phi   -= (e.clientY - lastY) * 0.005;
      lastX = e.clientX; lastY = e.clientY;
      updateCamera();
    });
    canvas.addEventListener('pointerup',    function(){ dragging = false; });
    canvas.addEventListener('pointerleave', function(){ dragging = false; });
    canvas.addEventListener('pointercancel',function(){ dragging = false; });

    canvas.addEventListener('wheel', function(e){
      e.preventDefault();
      radius = clampR(radius + e.deltaY * 0.5);
      updateCamera();
    }, { passive: false });

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

    // ─── Tween ─────────────────────────────────────────────
    function smoothTo(nT, nTh, nP, nR, dur){
      const sT = target.clone();
      const sTh = theta, sP = phi, sR = radius;
      const tP = clampPhi(nP), tR = clampR(nR);
      const t0 = performance.now();
      dur = dur || 800;

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

    // ─── Views — Y values are RELATIVE to fieldY ───────────
    const V = THREE.Vector3;
    function v(x, y, z){ return new V(x, F + y, z); }

    const VIEWS = {
      overview: { t: v(0,    10,  0),     th: Math.PI * 0.25,   ph: Math.PI * 0.30, r: 160 },
      tv:       { t: v(0,     4,  0),     th: 0,                ph: Math.PI * 0.42, r: 60  },
      tvlong:   { t: v(0,     4,  0),     th: 0,                ph: Math.PI * 0.42, r: 90  },
      tvhigh:   { t: v(0,     4,  0),     th: 0,                ph: Math.PI * 0.28, r: 65  },
      bowler:   { t: v(0,     2,  8.6),   th: -Math.PI * 0.50,  ph: Math.PI * 0.42, r: 32  },
      batsman:  { t: v(0.4,   2,  8.6),   th: Math.PI * 0.50,   ph: Math.PI * 0.42, r: 12  },
      batting:  { t: v(0.4,   2,  8.6),   th: Math.PI * 0.50,   ph: Math.PI * 0.42, r: 12  },
      closeup:  { t: v(0.4,   1.4, 8.6),  th: -Math.PI * 0.35,  ph: Math.PI * 0.42, r: 4.5 },
      stumps:   { t: v(0.4,   1.0, 8.6),  th: Math.PI * 0.50,   ph: Math.PI * 0.42, r: 3   },
      sideOn:   { t: v(0,     2,  0),     th: 0,                ph: Math.PI * 0.46, r: 26  },
      pitch:    { t: v(0,     1,  0),     th: 0,                ph: Math.PI * 0.42, r: 20  },
      aerial:   { t: v(0,     0,  0),     th: Math.PI * 0.25,   ph: 0.14,           r: 175 },
      spider:   { t: v(0,     6,  0),     th: Math.PI * 0.75,   ph: Math.PI * 0.35, r: 42  },
      drone:    { t: v(0,     4,  5),     th: Math.PI * 1.2,    ph: Math.PI * 0.35, r: 65  }
    };

    function applyView(name){
      const view = VIEWS[name];
      if (!view){
        console.warn('[Camera] unknown view: ' + name);
        return false;
      }
      smoothTo(view.t, view.th, view.ph, view.r, 900);
      document.querySelectorAll('#viewRow button[data-view]').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-view') === name);
      });
      console.log('[Camera] → ' + name);
      return true;
    }

    // ─── Time of day ───────────────────────────────────────
    const setFloods = (typeof SV.setFloodlights === 'function') ? SV.setFloodlights : function(){};

    function setTime(mode){
      const sun     = SV.sun     || null;
      const hemi    = SV.hemi    || null;
      const ambient = SV.ambient || null;

      const bgHex = mode === 'day'    ? 0x87b8e0
                  : mode === 'sunset' ? 0x4a1f16
                  :                     0x01040a;

      if (scene.background && scene.background.setHex) scene.background.setHex(bgHex);
      if (scene.fog && scene.fog.color && scene.fog.color.setHex) scene.fog.color.setHex(bgHex);

      if (mode === 'day'){
        if (ambient) ambient.intensity = 0.8;
        if (hemi)    hemi.intensity    = 0.6;
        if (sun){ sun.intensity = 1.5; sun.color.setHex(0xffffff); sun.position.set(80, 400, 80); }
        setFloods(0);
        renderer.toneMappingExposure = 1.0;
      } else if (mode === 'sunset'){
        if (ambient) ambient.intensity = 0.4;
        if (hemi)    hemi.intensity    = 0.35;
        if (sun){ sun.intensity = 0.9; sun.color.setHex(0xff8855); sun.position.set(300, 60, -200); }
        setFloods(0.4);
        renderer.toneMappingExposure = 0.95;
      } else {
        if (ambient) ambient.intensity = 0.05;
        if (hemi)    hemi.intensity    = 0.08;
        if (sun)     sun.intensity     = 0;
        setFloods(1);
        renderer.toneMappingExposure = 0.95;
      }

      document.querySelectorAll('#timeRow button').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-time') === mode);
      });
      console.log('[Time] ' + mode);
    }

    // ─── Expose for menu ───────────────────────────────────
    window.__applyView = applyView;
    window.__setTime   = setTime;

    // ─── Keyboard shortcut ─────────────────────────────────
    document.addEventListener('keydown', function(e){
      if (e.code === 'Space'){
        e.preventDefault();
        const autoBtn = document.getElementById('btn-auto');
        if (autoBtn) autoBtn.click();
      }
    });

    console.log('[StadiumView] ✅ Camera ready · views=' + Object.keys(VIEWS).length +
                ' · floor y=' + FLOOR_Y.toFixed(2));
  }

})();
