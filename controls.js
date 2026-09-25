/* ══════════════════════════════════════════════════════════════
   Camera controls + view presets + time of day
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[controls.js] start', 'color:#00e676;font-weight:bold');

  // Published IMMEDIATELY so menu can call them right away
  window.__applyView = function(name){ console.warn('[controls] not ready yet:', name); };
  window.__setTime   = function(mode){ console.warn('[controls] not ready yet:', mode); };

  let camera, scene, renderer, SV;
  let target, theta, phi, radius;
  const PHI_MIN = 0.10, PHI_MAX = Math.PI * 0.48;
  const R_MIN = 3, R_MAX = 180;

  function F(){ return (SV && SV.fieldY && SV.fieldY > 1) ? SV.fieldY : 7.19; }
  function clampPhi(v){ return Math.max(PHI_MIN, Math.min(PHI_MAX, v)); }
  function clampR(v){ return Math.max(R_MIN, Math.min(R_MAX, v)); }

  function updateCamera(){
    if (!camera) return;
    phi = clampPhi(phi);
    radius = clampR(radius);
    const floorY = F() + 0.5;
    const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
    let   y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * Math.sin(phi) * Math.sin(theta);
    if (y < floorY) y = floorY;
    camera.position.set(x, y, z);
    camera.lookAt(target);
  }

  const VIEW_DEFS = {
    overview: { y: 10, z: 0,   th: Math.PI * 0.25, ph: Math.PI * 0.30, r: 160 },
    tv:       { y: 4,  z: 0,   th: 0,              ph: Math.PI * 0.42, r: 60  },
    tvlong:   { y: 4,  z: 0,   th: 0,              ph: Math.PI * 0.42, r: 90  },
    tvhigh:   { y: 4,  z: 0,   th: 0,              ph: Math.PI * 0.28, r: 65  },
    bowler:   { y: 2,  z: 8.6, th: -Math.PI * 0.5, ph: Math.PI * 0.42, r: 32  },
    batsman:  { y: 2,  z: 8.6, th: Math.PI * 0.5,  ph: Math.PI * 0.42, r: 12  },
    closeup:  { y: 1.4,z: 8.6, th: -Math.PI * 0.35,ph: Math.PI * 0.42, r: 4.5 },
    stumps:   { y: 1.0,z: 8.6, th: Math.PI * 0.5,  ph: Math.PI * 0.42, r: 3   },
    sideOn:   { y: 2,  z: 0,   th: 0,              ph: Math.PI * 0.46, r: 26  },
    pitch:    { y: 1,  z: 0,   th: 0,              ph: Math.PI * 0.42, r: 20  },
    aerial:   { y: 0,  z: 0,   th: Math.PI * 0.25, ph: 0.14,           r: 175 },
    spider:   { y: 6,  z: 0,   th: Math.PI * 0.75, ph: Math.PI * 0.35, r: 42  },
    drone:    { y: 4,  z: 5,   th: Math.PI * 1.2,  ph: Math.PI * 0.35, r: 65  }
  };

  function smoothTo(nT, nTh, nP, nR, dur){
    const sT = target.clone();
    const sTh = theta, sP = phi, sR = radius;
    const tP = clampPhi(nP), tR = clampR(nR);
    const t0 = performance.now();
    dur = dur || 900;
    (function step(){
      const t = Math.min(1, (performance.now() - t0) / dur);
      const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
      target.lerpVectors(sT, nT, e);
      theta  = sTh + (nTh - sTh) * e;
      phi    = sP  + (tP - sP) * e;
      radius = sR  + (tR - sR) * e;
      updateCamera();
      if (t < 1) requestAnimationFrame(step);
    })();
  }

  // ─── Boot ────────────────────────────────────────────
  const wait = setInterval(() => {
    if (!window.StadiumView || !window.StadiumView.scene) return;
    clearInterval(wait);
    setTimeout(setup, 200);
  }, 100);

  function setup(){
    SV = window.StadiumView;
    scene = SV.scene;
    camera = SV.camera;
    renderer = SV.renderer;

    const Fv = F();
    target = new THREE.Vector3(0, Fv + 10, 0);
    theta = Math.PI * 0.25;
    phi = Math.PI * 0.32;
    radius = 160;
    updateCamera();

    const canvas = renderer.domElement;

    // Drag
    let drag = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', e => { drag = true; lx = e.clientX; ly = e.clientY; });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      theta -= (e.clientX - lx) * 0.005;
      phi   -= (e.clientY - ly) * 0.005;
      lx = e.clientX; ly = e.clientY;
      updateCamera();
    });
    canvas.addEventListener('pointerup',    () => drag = false);
    canvas.addEventListener('pointerleave', () => drag = false);
    canvas.addEventListener('pointercancel',() => drag = false);

    // Wheel
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      radius = clampR(radius + e.deltaY * 0.5);
      updateCamera();
    }, { passive: false });

    // Pinch
    let pinch = 0;
    canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 2){
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinch = Math.hypot(dx, dy);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinch > 0){
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.hypot(dx, dy);
        radius = clampR(radius - (d - pinch) * 1.1);
        pinch = d;
        updateCamera();
      }
    }, { passive: true });
    canvas.addEventListener('touchend', () => pinch = 0);

    // Space toggles Director
    document.addEventListener('keydown', e => {
      if (e.code === 'Space'){
        e.preventDefault();
        const b = document.getElementById('btn-auto');
        if (b) b.click();
      }
    });

    // ─── Publish API ─────────────────────────────────
    window.__applyView = function(name){
      const v = VIEW_DEFS[name];
      if (!v){ console.warn('[controls] unknown view', name); return; }
      const Fv = F();
      const t = new THREE.Vector3(0, Fv + v.y, v.z);
      smoothTo(t, v.th, v.ph, v.r, 900);
      console.log('[camera] →', name);
    };

    window.__setTime = function(mode){
      const Fv = F();
      const bg = mode === 'day' ? 0x87b8e0
               : mode === 'sunset' ? 0x4a1f16
               : 0x01040a;
      if (scene.background && scene.background.setHex) scene.background.setHex(bg);

      if (mode === 'day'){
        if (SV.ambient) SV.ambient.intensity = 0.85;
        if (SV.hemi)    SV.hemi.intensity    = 0.55;
        if (SV.sun){ SV.sun.intensity = 1.4; SV.sun.color.setHex(0xffffff); }
        if (SV.setFloodlights) SV.setFloodlights(0);
        renderer.toneMappingExposure = 1.0;
      } else if (mode === 'sunset'){
        if (SV.ambient) SV.ambient.intensity = 0.4;
        if (SV.hemi)    SV.hemi.intensity    = 0.3;
        if (SV.sun){ SV.sun.intensity = 0.85; SV.sun.color.setHex(0xff8855); }
        if (SV.setFloodlights) SV.setFloodlights(0.4);
        renderer.toneMappingExposure = 0.95;
      } else {
        if (SV.ambient) SV.ambient.intensity = 0.03;
        if (SV.hemi)    SV.hemi.intensity    = 0.05;
        if (SV.sun)     SV.sun.intensity     = 0;
        if (SV.setFloodlights) SV.setFloodlights(1);
        renderer.toneMappingExposure = 0.85;
      }
      console.log('[time]', mode);
    };

    // Initial view
    window.__applyView('tv');

    console.log('[controls.js] ready · views=' + Object.keys(VIEW_DEFS).length +
                ' · fieldY=' + Fv.toFixed(2));
  }
})();
