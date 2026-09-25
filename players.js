/* ══════════════════════════════════════════════════════════════
   StadiumView — Player controller
   • Every player stands with arms down (neutral idle)
   • Tab cycles players · WASD moves · Esc resets
   • Independent of fieldY — uses each player's own Y
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started', 'color:#00e676;font-weight:bold');

  const wait = setInterval(function(){
    if (!window.StadiumView || !window.StadiumView.players) return;
    if (Object.keys(window.StadiumView.players).length < 5) return;
    clearInterval(wait);
    setTimeout(boot, 1200);
  }, 200);

  function boot(){
    const SV      = window.StadiumView;
    const players = SV.players;
    const roles   = Object.keys(players);
    if (!roles.length){ console.warn('[PlayerControl] no players'); return; }

    // ─── Snapshot home positions (using each player's OWN Y) ─
    const homes = {};
    roles.forEach(function(r){
      const p = players[r];
      homes[r] = {
        x: p.position.x,
        y: p.position.y,
        z: p.position.z,
        rotY: p.rotation.y
      };
      p.userData._moving = false;
    });

    // ═══════════════════════════════════════════════════════════
    //  NEUTRAL STANDING — arms down, gentle breathing
    // ═══════════════════════════════════════════════════════════
    let idleRAF = 0;
    function standIdle(now){
      idleRAF = requestAnimationFrame(standIdle);
      const t = now * 0.0015;

      roles.forEach(function(r, i){
        const p = players[r];
        if (p.userData._moving) return;

        const h = homes[r];
        // Breathing
        p.position.y = h.y + Math.sin(t + i * 0.7) * 0.008;
        // Weight shift (very subtle)
        const shift = Math.sin(t * 0.3 + i * 1.4) * 0.015;
        p.position.x += (h.x + shift - p.position.x) * 0.05;
        p.position.z += (h.z         - p.position.z) * 0.05;
        // Return to neutral pitch (no limb rotation)
        p.rotation.x += (0 - p.rotation.x) * 0.08;
      });
    }
    standIdle(0);

    // ═══════════════════════════════════════════════════════════
    //  MOVE API — tween a player with walk bob
    // ═══════════════════════════════════════════════════════════
    const moves = {};

    function moveTo(role, x, z, rotY, duration){
      const p = players[role];
      if (!p) return false;

      if (window.StadiumAnim && window.StadiumAnim.pause) window.StadiumAnim.pause();

      p.userData._moving = true;
      moves[role] = {
        fx: p.position.x, fz: p.position.z, fr: p.rotation.y,
        tx: x, tz: z,
        tr: (rotY !== undefined) ? rotY : p.rotation.y,
        t0: performance.now(),
        dur: duration || 1200,
        baseY: p.position.y
      };
      homes[role].x = x; homes[role].z = z;
      if (rotY !== undefined) homes[role].rotY = rotY;
      return true;
    }

    function updateMoves(now){
      requestAnimationFrame(updateMoves);
      Object.keys(moves).forEach(function(role){
        const m = moves[role];
        const p = players[role];
        const t = Math.min(1, (now - m.t0) / m.dur);
        const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;

        p.position.x = m.fx + (m.tx - m.fx) * e;
        p.position.z = m.fz + (m.tz - m.fz) * e;

        let dr = m.tr - m.fr;
        while (dr >  Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        p.rotation.y = m.fr + dr * e;

        if (t < 1){
          p.position.y = m.baseY + Math.abs(Math.sin(t * Math.PI * 8)) * 0.06;
        } else {
          p.position.y = m.baseY;
          p.userData._moving = false;
          delete moves[role];
        }
      });
    }
    updateMoves(0);

    // ═══════════════════════════════════════════════════════════
    //  KEYBOARD — Tab cycles player, WASD moves, Esc resets
    // ═══════════════════════════════════════════════════════════
    let selected = 'Striker';
    const keys = {};

    document.addEventListener('keydown', function(e){
      keys[e.code] = true;

      if (e.code === 'Tab'){
        e.preventDefault();
        const i = roles.indexOf(selected);
        selected = roles[(i + 1) % roles.length];
        showToast('→ ' + selected);
        console.log('[PlayerControl] selected → ' + selected);
      }
      if (e.code === 'Escape'){
        standAll();
        showToast('All players reset');
      }
    });
    document.addEventListener('keyup', function(e){ keys[e.code] = false; });

    let lastStep = 0;
    function keyLoop(now){
      requestAnimationFrame(keyLoop);
      if (now - lastStep < 45) return;
      lastStep = now;

      const p = players[selected];
      if (!p) return;

      const speed = 0.45;
      let dx = 0, dz = 0;
      if (keys['KeyW'] || keys['ArrowUp'])    dz -= speed;
      if (keys['KeyS'] || keys['ArrowDown'])  dz += speed;
      if (keys['KeyA'] || keys['ArrowLeft'])  dx -= speed;
      if (keys['KeyD'] || keys['ArrowRight']) dx += speed;

      if (dx || dz){
        if (window.StadiumAnim && window.StadiumAnim.pause) window.StadiumAnim.pause();
        p.position.x += dx;
        p.position.z += dz;
        homes[selected].x = p.position.x;
        homes[selected].z = p.position.z;
        // Face direction of movement
        p.rotation.y = Math.atan2(dx, dz);
        showToast(selected + ' — x=' + p.position.x.toFixed(1) + ' z=' + p.position.z.toFixed(1));
      }
    }
    keyLoop(0);

    // ═══════════════════════════════════════════════════════════
    //  UI TOAST — small HUD showing active player
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
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════
    function standAll(){
      roles.forEach(function(r){
        moveTo(r, homes[r].x, homes[r].z, homes[r].rotY, 800);
      });
      if (window.StadiumAnim && window.StadiumAnim.resume){
        setTimeout(function(){ window.StadiumAnim.resume(); }, 900);
      }
    }

    function listPositions(){
      const out = {};
      roles.forEach(function(r){
        out[r] = {
          x:    +players[r].position.x.toFixed(2),
          y:    +players[r].position.y.toFixed(2),
          z:    +players[r].position.z.toFixed(2),
          rotY: +players[r].rotation.y.toFixed(2)
        };
      });
      return out;
    }

    window.PlayerControl = {
      roles:         roles,
      selected:      function(){ return selected; },
      select:        function(role){ if (players[role]) selected = role; },
      moveTo:        moveTo,
      standAll:      standAll,
      listPositions: listPositions
    };

    // Show initial toast so user knows it's live
    showToast('Tab = cycle · WASD = move · Esc = reset');
    console.log('[PlayerControl] ✅ Ready — ' + roles.length + ' players');
    console.log('[PlayerControl] Tab = cycle · WASD = move · Esc = reset');
  }

})();
