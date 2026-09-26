/* ══════════════════════════════════════════════════════════════
   StadiumView — Camera controls + Auto Director
   Exposes: window.__applyView(name) · window.__setTime(mode)
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[controls.js] start', 'color:#00e676;font-weight:bold');

  let SV = null, camera = null, renderer = null, scene = null;
  const _target = new THREE.Vector3(0, 10, 0);
  let _theta  = Math.PI * 0.25;
  let _phi    = Math.PI * 0.32;
  let _radius = 160;

  const PHI_MIN = 0.10;
  const PHI_MAX = Math.PI * 0.48;
  const R_MIN   = 3;
  const R_MAX   = 180;

  // ✅ Accepts 0 as a valid ground height
  function currentFieldY(){
    const f = SV && SV.fieldY;
    if (typeof f === 'number' && isFinite(f)) return f;
    return 0;
  }
  function clampPhi(v){ return Math.max(PHI_MIN, Math.min(PHI_MAX, v)); }
  function clampR(v){   return Math.max(R_MIN,   Math.min(R_MAX,   v)); }

  function updateCamera(){
    if (!camera) return;
    _phi    = clampPhi(_phi);
    _radius = clampR(_radius);
    const F = currentFieldY();
    const floorY = F + 0.5;

    const x = _target.x + _radius * Math.sin(_phi) * Math.cos(_theta);
    let   y = _target.y + _radius * Math.cos(_phi);
    const z = _target.z + _radius * Math.sin(_phi) * Math.sin(_theta);
    if (y < floorY) y = floorY;

    camera.position.set(x, y, z);
    camera.lookAt(_target);
  }

  // ─── 14 View definitions ─────────────────────────────────
  const VIEW_DEFS = {
    overview: { x: 0,    y: 10,  z: 0,   th: Math.PI * 0.25,  ph: Math.PI * 0.30, r: 160 },
    tv:       { x: 0,    y: 4,   z: 0,   th: 0,               ph: Math.PI * 0.42, r: 60  },
    tvlong:   { x: 0,    y: 4,   z: 0,   th: 0,               ph: Math.PI * 0.42, r: 90  },
    tvhigh:   { x: 0,    y: 4,   z: 0,   th: 0,               ph: Math.PI * 0.28, r: 65  },
    bowler:   { x: 0,    y: 2,   z: 8.6, th: -Math.PI * 0.50, ph: Math.PI * 0.42, r: 32  },
    batsman:  { x: 0.4,  y: 2,   z: 8.6, th: Math.PI * 0.50,  ph: Math.PI * 0.42, r: 12  },
    batting:  { x: 0.4,  y: 2,   z: 8.6, th: Math.PI * 0.50,  ph: Math.PI * 0.42, r: 12  },
    closeup:  { x: 0.4,  y: 1.4, z: 8.6, th: -Math.PI * 0.35, ph: Math.PI * 0.42, r: 4.5 },
    stumps:   { x: 0.4,  y: 1.0, z: 8.6, th: Math.PI * 0.50,  ph: Math.PI * 0.42, r: 3   },
    sideOn:   { x: 0,    y: 2,   z: 0,   th: 0,               ph: Math.PI * 0.46, r: 26  },
    pitch:    { x: 0,    y: 1,   z: 0,   th: 0,               ph: Math.PI * 0.42, r: 20  },
    aerial:   { x: 0,    y: 0,   z: 0,   th: Math.PI * 0.25,  ph: 0.14,           r: 175 },
    spider:   { x: 0,    y: 6,   z: 0,   th: Math.PI * 0.75,  ph: Math.PI * 0.35, r: 42  },
    drone:    { x: 0,    y: 4,   z: 5,   th: Math.PI * 1.2,   ph: Math.PI * 0.35, r: 65  }
  };

  function smoothTo(nT, nTh, nP, nR, dur){
    const sT  = _target.clone();
    const sTh = _theta, sP = _phi, sR = _radius;
    const tP  = clampPhi(nP), tR = clampR(nR);
    const t0  = performance.now();
    dur = dur || 900;

    (function step(){
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2;
      _target.lerpVectors(sT, nT, e);
      _theta  = sTh + (nTh - sTh) * e;
      _phi    = sP  + (tP  - sP)  * e;
      _radius = sR  + (tR  - sR)  * e;
      updateCamera();
      if (t < 1) requestAnimationFrame(step);
    })();
  }

  // ─── Public API ──────────────────────────────────────────
  window.__applyView = function(name){
    const view = VIEW_DEFS[name];
    if (!view){
      console.warn('[Camera] unknown view: ' + name);
      return false;
    }
    const F = currentFieldY();
    const targetPos = new THREE.Vector3(view.x, F + view.y, view.z);
    smoothTo(targetPos, view.th, view.ph, view.r, 900);

    document.querySelectorAll('#viewRow button').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-view') === name);
    });
    console.log('[Camera] → ' + name);
    return true;
  };

  window.__setTime = function(mode){
    if (!scene) return;
    const sun     = (SV && SV.sun)     || null;
    const hemi    = (SV && SV.hemi)    || null;
    const ambient = (SV && SV.ambient) || null;

    const bgHex = mode === 'day'    ? 0x87b8e0
                : mode === 'sunset' ? 0x4a1f16
                :                     0x01040a;

    if (scene.background && scene.background.setHex) scene.background.setHex(bgHex);

    if (mode === 'day'){
      if (ambient) ambient.intensity = 0.8;
      if (hemi)    hemi.intensity    = 0.6;
      if (sun){ sun.intensity = 1.5; sun.color.setHex(0xffffff); sun.position.set(80, 400, 80); }
      if (SV && SV.setFloodlights) SV.setFloodlights(0);
      if (renderer) renderer.toneMappingExposure = 1.0;
    } else if (mode === 'sunset'){
      if (ambient) ambient.intensity = 0.4;
      if (hemi)    hemi.intensity    = 0.35;
      if (sun){ sun.intensity = 0.9; sun.color.setHex(0xff8855); sun.position.set(300, 60, -200); }
      if (SV && SV.setFloodlights) SV.setFloodlights(0.4);
      if (renderer) renderer.toneMappingExposure = 0.95;
    } else {
      if (ambient) ambient.intensity = 0.05;
      if (hemi)    hemi.intensity    = 0.08;
      if (sun)     sun.intensity     = 0;
      if (SV && SV.setFloodlights) SV.setFloodlights(1);
      if (renderer) renderer.toneMappingExposure = 0.95;
    }

    document.querySelectorAll('#timeRow button').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-time') === mode);
    });
    console.log('[Time] ' + mode);
  };

  // ─── Wire listeners ──────────────────────────────────────
  const wait = setInterval(function(){
    if (!window.StadiumView || !window.StadiumView.scene) return;
    clearInterval(wait);
    setTimeout(setup, 150);
  }, 100);

  function setup(){
    try {
      SV       = window.StadiumView;
      scene    = SV.scene;
      camera   = SV.camera;
      renderer = SV.renderer;

      if (!camera || !renderer){
        console.warn('[Camera] missing camera/renderer — input disabled');
        return;
      }

      const F = currentFieldY();
      _target.set(0, F + 10, 0);
      updateCamera();

      const canvas = renderer.domElement;

      // Drag
      let dragging = false, lastX = 0, lastY = 0;
      canvas.addEventListener('pointerdown', e => {
        dragging = true; lastX = e.clientX; lastY = e.clientY;
      });
      canvas.addEventListener('pointermove', e => {
        if (!dragging) return;
        _theta -= (e.clientX - lastX) * 0.005;
        _phi   -= (e.clientY - lastY) * 0.005;
        lastX = e.clientX; lastY = e.clientY;
        updateCamera();
      });
      canvas.addEventListener('pointerup',     () => dragging = false);
      canvas.addEventListener('pointerleave',  () => dragging = false);
      canvas.addEventListener('pointercancel', () => dragging = false);

      // Wheel
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        _radius = clampR(_radius + e.deltaY * 0.5);
        updateCamera();
      }, { passive: false });

      // Pinch
      let pinchDist = 0;
      canvas.addEventListener('touchstart', e => {
        if (e.touches.length === 2){
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          pinchDist = Math.hypot(dx, dy);
        }
      }, { passive: true });
      canvas.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && pinchDist > 0){
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          _radius = clampR(_radius - (dist - pinchDist) * 1.1);
          pinchDist = dist;
          updateCamera();
        }
      }, { passive: true });
      canvas.addEventListener('touchend', () => pinchDist = 0);

      // Space toggles Director
      document.addEventListener('keydown', e => {
        if (e.code === 'Space' && !e.repeat){
          const tag = (e.target && e.target.tagName) || '';
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;
          e.preventDefault();
          const b = document.getElementById('btn-auto');
          if (b) b.click();
        }
      });

      // Initial
      window.__applyView('tv');
      window.__setTime('day');

      console.log('[Camera] ✅ ready · fieldY=' + F.toFixed(2) +
                  ' · views=' + Object.keys(VIEW_DEFS).length);
    } catch (err) {
      console.error('[Camera] setup failed:', err);
    }
  }
})();
