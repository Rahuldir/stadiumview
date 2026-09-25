/* ══════════════════════════════════════════════════════════════
   StadiumView — camera controls + UI
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // Wait for stadium.js to expose the scene
  const wait = setInterval(function(){
    if (!window.StadiumView) return;
    clearInterval(wait);
    init();
  }, 50);

  function init(){
    const { scene, camera, sun, hemi } = window.StadiumView;
    const renderer = window.StadiumView.renderer;

    // ─── Camera state ─────────────────────────────────────────
    const target = new THREE.Vector3(0, 5, 0);
    let theta = Math.PI * 0.25;
    let phi   = Math.PI * 0.32;
    let radius = 150;

    function updateCamera(){
      const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
      const y = target.y + radius * Math.cos(phi);
      const z = target.z + radius * Math.sin(phi) * Math.sin(theta);
      camera.position.set(x, y, z);
      camera.lookAt(target);
    }
    updateCamera();

    // ─── Mouse / touch orbit ─────────────────────────────────
    let dragging = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('pointerdown', function(e){
      dragging = true; lastX = e.clientX; lastY = e.clientY;
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

    // ─── Scroll / pinch zoom ─────────────────────────────────
    renderer.domElement.addEventListener('wheel', function(e){
      e.preventDefault();
      radius = Math.max(2, Math.min(600, radius + e.deltaY * 0.2));
      updateCamera();
    }, { passive: false });

    let lastPinch = 0;
    renderer.domElement.addEventListener('touchmove', function(e){
      if (e.touches.length === 2){
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (lastPinch > 0){
          radius = Math.max(2, Math.min(600, radius - (dist - lastPinch) * 0.4));
          updateCamera();
        }
        lastPinch = dist;
      }
    }, { passive: true });
    renderer.domElement.addEventListener('touchend', function(){ lastPinch = 0; });

    // ─── Smooth camera transitions ───────────────────────────
    function smoothTo(newTarget, newTheta, newPhi, newRadius){
      const sT = target.clone(), sTh = theta, sP = phi, sR = radius;
      const t0 = performance.now();
      const dur = 800;
      function step(){
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2;
        target.lerpVectors(sT, newTarget, e);
        theta = sTh + (newTheta - sTh) * e;
        phi   = sP  + (newPhi   - sP)  * e;
        radius = sR + (newRadius - sR) * e;
        updateCamera();
        if (t < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    // ─── Preset views ────────────────────────────────────────
    const VIEWS = {
      overview: { t: new THREE.Vector3(0, 5, 0), th: Math.PI * 0.25, ph: Math.PI * 0.32, r: 150 },
      pitch:    { t: new THREE.Vector3(0, 1, 0), th: Math.PI * 0.5,  ph: Math.PI * 0.35, r: 30  },
      batting:  { t: new THREE.Vector3(0, 2, 9), th: Math.PI * 0.5,  ph: Math.PI * 0.42, r: 10  },
      aerial:   { t: new THREE.Vector3(0, 0, 0), th: Math.PI * 0.25, ph: 0.1,            r: 220 }
    };

    function applyView(name){
      const v = VIEWS[name];
      if (v) smoothTo(v.t, v.th, v.ph, v.r);
    }

    // ─── Time of day ─────────────────────────────────────────
    function setTime(mode){
      const bg = mode === 'day'    ? 0x87b8e0
               : mode === 'sunset' ? 0x552a20
               :                     0x020713;
      scene.background.setHex(bg);
      scene.fog.color.setHex(bg);

      if (mode === 'day'){
        hemi.intensity = 0.9;  sun.intensity = 1.7;
        sun.color.setHex(0xffffff); sun.position.set(80, 150, 100);
      } else if (mode === 'sunset'){
        hemi.intensity = 0.5;  sun.intensity = 1.3;
        sun.color.setHex(0xff8855); sun.position.set(200, 40, -100);
      } else {
        hemi.intensity = 0.2;  sun.intensity = 0.25;
        sun.color.setHex(0x8899ff); sun.position.set(-80, 120, 40);
      }
    }

    // ─── UI wiring ───────────────────────────────────────────
    document.querySelectorAll('#controls button[data-view]').forEach(function(b){
      b.addEventListener('click', function(){
        applyView(b.getAttribute('data-view'));
        document.querySelectorAll('#controls button[data-view]').forEach(function(x){ x.classList.remove('on'); });
        b.classList.add('on');
      });
    });

    document.querySelectorAll('#controls button[data-time]').forEach(function(b){
      b.addEventListener('click', function(){
        setTime(b.getAttribute('data-time'));
        document.querySelectorAll('#controls button[data-time]').forEach(function(x){ x.classList.remove('on'); });
        b.classList.add('on');
      });
    });

    console.log('[StadiumView] ✅ Controls ready');
  }

})();
