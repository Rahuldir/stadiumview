/* ══════════════════════════════════════════════════════════════
   StadiumView — Realistic Player Controller (v2.0)
   • Role-specific stances (Keeper crouch, Batsman guard)
   • Procedural WASD walk/run cycle (Arms and legs swing)
   • Ball and Bat synchronize with hand movements
   • Tab cycles players · WASD moves · Esc resets
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] Manual Controller Initializing...', 'color:#00e676;font-weight:bold');

  const wait = setInterval(function(){
    if (!window.StadiumView || !window.StadiumView.players) return;
    if (Object.keys(window.StadiumView.players).length < 5) return;
    clearInterval(wait);
    setTimeout(boot, 1200);
  }, 200);

  function boot(){
    const SV      = window.StadiumView;
    const players = SV.players;
    const accessories = SV.accessories || {};
    const roles   = Object.keys(players);
    if (!roles.length){ console.warn('[PlayerControl] no players'); return; }

    // ─── Snapshot home positions ─────────────────────────────
    const homes = {};
    roles.forEach(function(r){
      const p = players[r];
      homes[r] = {
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        rotY: p.rotation.y,
        rotX: p.rotation.x
      };
      p.userData._moving = false;
      p.userData._runTime = 0; 
    });

    // ═══════════════════════════════════════════════════════════
    //  PROCEDURAL LIMB ANIMATOR
    // ═══════════════════════════════════════════════════════════
    // Attempts to find and swing arms/legs in the GLB hierarchy safely
    function swingLimbs(player, time, intensity) {
      const swing = Math.sin(time) * intensity;
      player.children.forEach(function(child){
        if (child.isGroup){
          child.children.forEach(function(sub){
            if (sub.isGroup) {
              // Upper body (Arms)
              if (sub.position.y > 0.8) {
                sub.children.forEach(function(limb){
                  if (Math.abs(limb.position.x) > 0.15) {
                    limb.rotation.x = (limb.position.x > 0) ? -swing : swing;
                  }
                });
              }
              // Lower body (Legs)
              else if (sub.position.y <= 0.8) {
                sub.children.forEach(function(limb){
                  if (Math.abs(limb.position.x) > 0.05) {
                    limb.rotation.x = (limb.position.x > 0) ? swing : -swing;
                  }
                });
              }
            }
          });
        }
      });
      return swing; // Return the raw swing value to sync accessories
    }

    // Reset limbs to neutral
    function resetLimbs(player) {
      player.children.forEach(function(child){
        if (child.isGroup){
          child.children.forEach(function(sub){
            if (sub.isGroup) {
              sub.children.forEach(function(limb){
                limb.rotation.x += (0 - limb.rotation.x) * 0.1;
              });
            }
          });
        }
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  REALISTIC IDLE STANCES
    // ═══════════════════════════════════════════════════════════
    function standIdle(now){
      requestAnimationFrame(standIdle);
      
      // Do not fight the main animation engine if a delivery is happening
      if (window.StadiumAnim && window.StadiumAnim.currentPhase && window.StadiumAnim.currentPhase() !== 'idle') return;

      const t = now * 0.0015;

      roles.forEach(function(r, i){
        const p = players[r];
        if (p.userData._moving) return;

        const h = homes[r];
        resetLimbs(p); // Stand naturally

        // Role-Specific Stances
        if (r === 'Keeper') {
          // Keeper crouch and bob
          p.rotation.x = 0.4;
          p.position.y = h.y - 0.2 + Math.sin(t * 2) * 0.02;
        } 
        else if (r === 'Striker') {
          // Batsman takes guard
          p.rotation.x = 0.15; // slight lean
          p.position.y = h.y + Math.sin(t + i) * 0.005;
          const bat = accessories['Striker']?.bat;
          if (bat) {
            const tap = Math.max(0, Math.sin(t * 4)) * 0.15;
            bat.rotation.x = -0.5 + tap; // Bat pointing down at pitch
            bat.rotation.z = 0.1;
            bat.position.set(-0.35, 0.85, 0.4); // Closer to hands
          }
        } 
        else if (r === 'Non-Striker') {
          p.rotation.x = 0.1;
          const bat = accessories['Non-Striker']?.bat;
          if (bat) {
            bat.rotation.x = -0.4;
            bat.position.set(-0.35, 0.9, 0.3);
          }
        }
        else {
          // Normal Fielders & Bowler Breathing
          p.rotation.x += (0 - p.rotation.x) * 0.1;
          p.position.y = h.y + Math.sin(t + i * 0.7) * 0.008;
          const shift = Math.sin(t * 0.3 + i * 1.4) * 0.015;
          p.position.x += (h.x + shift - p.position.x) * 0.05;
          p.position.z += (h.z - p.position.z) * 0.05;

          // Bowler idle ball position
          if (r === 'Bowler' && accessories['Bowler']?.ball) {
            accessories['Bowler'].ball.position.set(0.35, 1.35, 0.20);
          }
        }
      });
    }
    standIdle(0);

    // ═══════════════════════════════════════════════════════════
    //  KEYBOARD — Tab cycles player, WASD moves
    // ═══════════════════════════════════════════════════════════
    let selected = 'Striker';
    const keys = {};

    document.addEventListener('keydown', function(e){
      if (e.code === 'Tab'){
        e.preventDefault();
        const i = roles.indexOf(selected);
        selected = roles[(i + 1) % roles.length];
        showToast('→ ' + selected);
      }
      if (e.code === 'Escape'){
        standAll();
        showToast('All players reset');
      }
      keys[e.code] = true;
    });
    document.addEventListener('keyup', function(e){ keys[e.code] = false; });

    let lastStep = 0;
    function keyLoop(now){
      requestAnimationFrame(keyLoop);
      const dt = Math.min(now - lastStep, 50);
      lastStep = now;

      const p = players[selected];
      if (!p) return;

      let dx = 0, dz = 0;
      const speed = 0.06; // Adjusted for 60fps smoothing

      if (keys['KeyW'] || keys['ArrowUp'])    dz -= speed;
      if (keys['KeyS'] || keys['ArrowDown'])  dz += speed;
      if (keys['KeyA'] || keys['ArrowLeft'])  dx -= speed;
      if (keys['KeyD'] || keys['ArrowRight']) dx += speed;

      if (dx !== 0 || dz !== 0){
        // Pause automated animations if user takes manual control
        if (window.StadiumAnim && window.StadiumAnim.pause) window.StadiumAnim.pause();
        
        p.userData._moving = true;
        p.position.x += dx;
        p.position.z += dz;
        homes[selected].x = p.position.x;
        homes[selected].z = p.position.z;
        
        // Face movement direction
        const targetRot = Math.atan2(dx, dz);
        let dr = targetRot - p.rotation.y;
        while (dr >  Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        p.rotation.y += dr * 0.15; // Smooth turn

        // ─── Apply Walk/Run Animation ───
        p.userData._runTime += dt * 0.015;
        p.rotation.x = 0.1; // Lean into run
        p.position.y = homes[selected].y + Math.abs(Math.sin(p.userData._runTime * 2)) * 0.08; // Body bob
        
        const armSwing = swingLimbs(p, p.userData._runTime * 2, 0.8);

        // Sync Bat to running arms
        if (accessories[selected]?.bat) {
          accessories[selected].bat.rotation.x = -armSwing * 0.5 - 0.2;
          accessories[selected].bat.position.z = 0.25 + armSwing * 0.2;
        }

        // Sync Ball to running Bowler hand
        if (selected === 'Bowler' && accessories['Bowler']?.ball) {
          accessories['Bowler'].ball.position.z = 0.20 + armSwing * 0.3; // Moves forward/back with arm
          accessories['Bowler'].ball.position.y = 1.35 - Math.abs(armSwing * 0.1); 
        }

      } else {
        p.userData._moving = false;
        p.userData._runTime = 0;
      }
    }
    keyLoop(0);

    // ═══════════════════════════════════════════════════════════
    //  UI TOAST
    // ═══════════════════════════════════════════════════════════
    let toast = document.getElementById('pc-toast');
    if (!toast){
      toast = document.createElement('div');
      toast.id = 'pc-toast';
      toast.style.cssText =
        'position:fixed;top:90px;left:16px;z-index:100;' +
        'background:rgba(8,8,12,.85);color:#00e676;' +
        'border-left:3px solid #00e676;border-radius:3px;' +
        'padding:8px 12px;font-family:JetBrains Mono,monospace;' +
        'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;' +
        'pointer-events:none;opacity:0;transition:opacity .2s;';
      document.body.appendChild(toast);
    }
    let toastT = 0;
    function showToast(msg){
      toast.textContent = msg;
      toast.style.opacity = '1';
      clearTimeout(toastT);
      toastT = setTimeout(function(){ toast.style.opacity = '0'; }, 1600);
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API (for external script resetting)
    // ═══════════════════════════════════════════════════════════
    function standAll(){
      roles.forEach(function(r){
        const p = players[r];
        p.position.set(homes[r].x, homes[r].y, homes[r].z);
        p.rotation.set(homes[r].rotX, homes[r].rotY, 0);
      });
      if (window.StadiumAnim && window.StadiumAnim.resume){
        window.StadiumAnim.resume();
      }
    }

    window.PlayerControl = {
      roles:         roles,
      selected:      function(){ return selected; },
      select:        function(role){ if (players[role]) selected = role; },
      standAll:      standAll
    };

    showToast('Tab = cycle · WASD = move · Esc = reset');
    console.log('[PlayerControl] ✅ Live. Real-time kinematic IK mapped to WASD.');
  }

})();
