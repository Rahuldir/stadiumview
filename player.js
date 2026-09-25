/* ══════════════════════════════════════════════════════════════
   StadiumView — Player controller
   • Every player idles in a neutral stance (hands down, breathing)
   • Move any player with Tab + WASD, or via API
   • Match animation pauses automatically while you move someone
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const wait = setInterval(function(){
    if (!window.StadiumView || !window.StadiumView.players) return;
    clearInterval(wait);
    setTimeout(boot, 1000);   // wait for anim.js to settle first
  }, 200);

  function boot(){
    const SV      = window.StadiumView;
    const players = SV.players;
    const fieldY  = SV.fieldY || 0;

    const roles = Object.keys(players);
    if (!roles.length){ console.warn('[PlayerControl] no players'); return; }

    // ─── Snapshot home positions ─────────────────────────────
    const homes = {};
    roles.forEach(function(r){
      const p = players[r];
      homes[r] = { x: p.position.x, z: p.position.z, rotY: p.rotation.y };
      p.userData._baseY  = fieldY;
      p.userData._moving = false;
    });

    // ═══════════════════════════════════════════════════════════
    //  NEUTRAL STANDING — hands down, subtle breathing
    // ═══════════════════════════════════════════════════════════
    function standIdle(now){
      const t = now * 0.0018;
      roles.forEach(function(r, i){
        const p = players[r];
        if (p.userData._moving) return;

        // Breathing bob
        const baseY = p.userData._baseY !== undefined ? p.userData._baseY : fieldY;
        p.position.y = baseY + Math.sin(t + i * 0.7) * 0.008;

        // Tiny weight-shift side-to-side every ~4 s
        const shift = Math.sin(t * 0.4 + i * 1.3) * 0.012;
        p.position.x += (homes[r].x + shift - p.position.x) * 0.04;
        p.position.z += (homes[r].z       - p.position.z) * 0.04;

        // Return to neutral rotation (arm-down stance = no extra rotation)
        p.rotation.x += (0 - p.rotation.x) * 0.06;
      });
      requestAnimationFrame(standIdle);
    }

    // ═══════════════════════════════════════════════════════════
    //  MOVE API — tween a player from A to B with a walk bob
    // ═══════════════════════════════════════════════════════════
    const moves = {};

    function moveTo(role, x, z, rotY, duration){
      const p = players[role];
      if (!p) return false;

      // Pause match animation while manual control is active
      if (window.StadiumAnim && window.StadiumAnim.pause){
        window.StadiumAnim.pause();
      }

      p.userData._moving = true;
      moves[role] = {
        fx: p.position.x, fz: p.position.z,
        fr: p.rotation.y,
        tx: x, tz: z,
        tr: rotY !== undefined ? rotY : p.rotation.y,
        t0: performance.now(),
        dur: duration || 1200
      };
      return true;
    }

    function updateMoves(now){
      Object.keys(moves).forEach(function(role){
        const m = moves[role];
        const p = players[role];
        const t = Math.min(1, (now - m.t0) / m.dur);
        const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;

        p.position.x = m.fx + (m.tx - m.fx) * e;
        p.position.z = m.fz + (m.tz - m.fz) * e;

        // Shortest-path rotation
        let dr = m.tr - m.fr;
        while (dr >  Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        p.rotation.y = m.fr + dr * e;

        // Walk bob while in transit
        if (t < 1){
          p.position.y = fieldY + Math.abs(Math.sin(t * Math.PI * 8)) * 0.06;
        } else {
          p.position.y = fieldY;
          p.userData._baseY  = fieldY;
          p.userData._moving = false;
          delete moves[role];
        }
      });
      requestAnimationFrame(updateMoves);
    }

    // ═══════════════════════════════════════════════════════════
    //  KEYBOARD CONTROL — Tab cycles player, WASD moves
    // ═══════════════════════════════════════════════════════════
    let selected = 'Striker';
    const keys = {};

    document.addEventListener('keydown', function(e){
      keys[e.code] = true;

      if (e.code === 'Tab'){
        e.preventDefault();
        const i = roles.indexOf(selected);
        selected = roles[(i + 1) % roles.length];
        console.log('[PlayerControl] selected → ' + selected);
      }
      if (e.code === 'Escape'){
        standAll();
      }
    });
    document.addEventListener('keyup', function(e){ keys[e.code] = false; });

    let lastStep = 0;
    function keyLoop(now){
      requestAnimationFrame(keyLoop);
      if (now - lastStep < 60) return;
      lastStep = now;

      const p = players[selected];
      if (!p) return;

      const speed = 0.35;
      let dx = 0, dz = 0;
      if (keys['KeyW'] || keys['ArrowUp'])    dz -= speed;
      if (keys['KeyS'] || keys['ArrowDown'])  dz += speed;
      if (keys['KeyA'] || keys['ArrowLeft'])  dx -= speed;
      if (keys['KeyD'] || keys['ArrowRight']) dx += speed;

      if (dx || dz){
        if (window.StadiumAnim && window.StadiumAnim.pause) window.StadiumAnim.pause();
        p.position.x += dx;
        p.position.z += dz;
        p.userData._baseY = fieldY;
        // Remember new home so idle doesn't snap them back
        homes[selected].x = p.position.x;
        homes[selected].z = p.position.z;
      }
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
          z:    +players[r].position.z.toFixed(2),
          rotY: +players[r].rotation.y.toFixed(2)
        };
      });
      return out;
    }

    window.PlayerControl = {
      roles:      roles,
      selected:   function(){ return selected; },
      select:     function(role){ if (players[role]) selected = role; },
      moveTo:     moveTo,
      standAll:   standAll,
      listPositions: listPositions
    };

    // Kick off loops
    requestAnimationFrame(standIdle);
    requestAnimationFrame(updateMoves);
    requestAnimationFrame(keyLoop);

    console.log('[PlayerControl] ✅ Ready — ' + roles.length + ' players');
    console.log('[PlayerControl] Tab = cycle player · WASD = move · Esc = reset all');
  }

})();
