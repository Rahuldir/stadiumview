/* ══════════════════════════════════════════════════════════════
   StadiumView — Player Controller with Universal Arms-Down
   • Quaternion-based: rotates upper arm bones to point down
   • Structural detection (finds arm bones by hierarchy, not names)
   • Tab cycles players · WASD moves · Esc resets
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — v4 (arms-down)', 'color:#00e676;font-weight:bold');

  let attempts = 0;
  const MAX_ATTEMPTS = 40;

  const wait = setInterval(function(){
    attempts++;
    const found = collectPlayers();
    if (found && Object.keys(found.players).length >= 5){
      clearInterval(wait);
      console.log('[players.js] found ' + Object.keys(found.players).length +
                  ' players via "' + found.source + '"');
      boot(found.players);
      return;
    }
    if (attempts % 5 === 0){
      console.log('[players.js] waiting… attempt ' + attempts);
    }
    if (attempts >= MAX_ATTEMPTS){
      clearInterval(wait);
      console.warn('[players.js] ❌ gave up');
    }
  }, 200);

  function collectPlayers(){
    if (window.StadiumView && window.StadiumView.players &&
        Object.keys(window.StadiumView.players).length >= 5){
      return { players: window.StadiumView.players, source: 'StadiumView.players' };
    }
    if (window.StadiumView && window.StadiumView.scene){
      const out = {};
      window.StadiumView.scene.traverse(function(o){
        if (!o.name || o.name.indexOf('PLAYER_') !== 0) return;
        const role = o.userData.role
                  || o.name.replace(/^PLAYER_/, '').replace(/_/g, ' ');
        out[role] = o;
      });
      if (Object.keys(out).length >= 5){
        return { players: out, source: 'scene traversal' };
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════
  function boot(players){
    const roles = Object.keys(players);
    console.log('[PlayerControl] roles:', roles.join(', '));

    const homes = {};
    roles.forEach(function(r){
      const p = players[r];
      homes[r] = { x: p.position.x, y: p.position.y, z: p.position.z, rotY: p.rotation.y };
      p.userData._moving = false;
    });

    // ═══════════════════════════════════════════════════════════
    //  ARMS-DOWN — quaternion method (rig-agnostic)
    // ═══════════════════════════════════════════════════════════

    // Find all bones in a player (deep)
    function getAllBones(root){
      const bones = [];
      root.traverse(function(c){
        if (c.isBone || c.type === 'Bone' || c.type === 'SkinnedMesh' && c.skeleton){
          if (c.isBone || c.type === 'Bone') bones.push(c);
        }
      });
      // Fallback: check skeleton on SkinnedMesh
      if (bones.length === 0){
        root.traverse(function(c){
          if (c.isSkinnedMesh && c.skeleton && c.skeleton.bones){
            c.skeleton.bones.forEach(function(b){ if (bones.indexOf(b) < 0) bones.push(b); });
          }
        });
      }
      return bones;
    }

    // Heuristic: which bones are upper arms?
    function findUpperArmBones(bones){
      const upper = [];

      // Strategy 1: name-based — find forearm/lowerarm/hand, take their parent
      bones.forEach(function(b){
        const n = (b.name || '').toLowerCase();
        if (/forearm|lowerarm|lower_arm/.test(n)){
          if (b.parent && bones.indexOf(b.parent) >= 0){
            if (upper.indexOf(b.parent) < 0) upper.push(b.parent);
          }
        }
      });

      // Strategy 2: name-based — bones that literally say "upperarm" or end in "arm"
      bones.forEach(function(b){
        const n = (b.name || '').toLowerCase();
        if (upper.indexOf(b) >= 0) return;
        if (/upper_?arm/.test(n) ||
            /^mixamorig.*arm$/.test(n) ||
            /(left|right)arm$/.test(n) ||
            /arm.*_(l|r)$/.test(n) ||
            /arm\.(l|r)$/.test(n)){
          // Skip if this is a forearm/hand
          if (!/fore|lower|hand|finger|thumb/.test(n)) upper.push(b);
        }
      });

      return upper;
    }

    // Point a bone's "direction to its first child" straight down
    function pointBoneDown(bone){
      if (!bone) return false;

      // Find the child that is a bone — arm chains always have one
      let child = null;
      for (let i = 0; i < bone.children.length; i++){
        const c = bone.children[i];
        if (c.isBone || c.type === 'Bone'){ child = c; break; }
      }
      if (!child){
        // Fall back to first child of any type
        child = bone.children[0];
      }
      if (!child) return false;

      // Get world positions
      bone.updateWorldMatrix(true, false);
      child.updateWorldMatrix(true, false);

      const p1 = new THREE.Vector3();
      const p2 = new THREE.Vector3();
      bone.getWorldPosition(p1);
      child.getWorldPosition(p2);

      const dir = p2.clone().sub(p1);
      if (dir.lengthSq() < 1e-8) return false;
      dir.normalize();

      // Target direction = straight down
      const targetDir = new THREE.Vector3(0, -1, 0);

      // World quaternion: rotate `dir` to `targetDir`
      const worldRot = new THREE.Quaternion().setFromUnitVectors(dir, targetDir);

      // Convert to bone-local: newLocal = parentWorldQ^-1 * worldRot * parentWorldQ * oldLocal
      const parentWorldQ = new THREE.Quaternion();
      if (bone.parent){
        bone.parent.getWorldQuaternion(parentWorldQ);
      }
      const invParent = parentWorldQ.clone().invert();

      const newLocalQ = invParent
        .multiply(worldRot)
        .multiply(parentWorldQ)
        .multiply(bone.quaternion.clone());

      bone.quaternion.copy(newLocalQ);
      bone.updateMatrixWorld(true);
      return true;
    }

    // Apply to a single player
    function applyArmsDown(role){
      const p = players[role];
      if (!p) return { found: 0, applied: 0 };

      const bones = getAllBones(p);
      const arms  = findUpperArmBones(bones);

      let applied = 0;
      arms.forEach(function(b){
        if (pointBoneDown(b)) applied++;
      });

      // Save rest state so idle doesn't drift
      arms.forEach(function(b){
        b.userData._restQuat = b.quaternion.clone();
      });

      return { found: arms.length, applied: applied, totalBones: bones.length };
    }

    // Apply to all players
    let totalFound = 0, totalApplied = 0, totalBones = 0;
    roles.forEach(function(r){
      const res = applyArmsDown(r);
      totalFound   += res.found;
      totalApplied += res.applied;
      totalBones   += res.totalBones;
    });
    console.log('[PlayerControl] bones total: ' + totalBones +
                ' · arm bones found: ' + totalFound +
                ' · pointed down: ' + totalApplied);

    if (totalFound === 0){
      console.warn('[PlayerControl] ⚠ No arm bones detected.');
      console.warn('[PlayerControl] Run: PlayerControl.dumpBones("Striker")');
      console.warn('[PlayerControl] Copy the output and send it back.');
    }

    // ═══════════════════════════════════════════════════════════
    //  IDLE — breathing + slight weight shift (no bone rotations)
    // ═══════════════════════════════════════════════════════════
    function standIdle(now){
      requestAnimationFrame(standIdle);
      const t = now * 0.0015;

      roles.forEach(function(r, i){
        const p = players[r];
        if (p.userData._moving) return;
        const h = homes[r];

        p.position.y = h.y + Math.sin(t + i * 0.7) * 0.008;
        const shift = Math.sin(t * 0.3 + i * 1.4) * 0.012;
        p.position.x += (h.x + shift - p.position.x) * 0.05;
        p.position.z += (h.z         - p.position.z) * 0.05;
        p.rotation.x += (0 - p.rotation.x) * 0.08;
      });
    }
    standIdle(0);

    // ═══════════════════════════════════════════════════════════
    //  MOVE API
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
    //  KEYBOARD
    // ═══════════════════════════════════════════════════════════
    let selected = roles[0];
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
        p.rotation.y = Math.atan2(dx, dz);
        showToast(selected + ' · x=' + p.position.x.toFixed(1) +
                  ' z=' + p.position.z.toFixed(1));
      }
    }
    keyLoop(0);

    // ═══════════════════════════════════════════════════════════
    //  TOAST
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

    // Dump every bone in a player — used to debug rigs
    function dumpBones(role){
      const p = players[role || selected];
      if (!p){ console.warn('no player', role); return; }
      const names = [];
      p.traverse(function(c){
        if (c.isBone || c.type === 'Bone'){
          names.push(c.name);
        }
      });
      console.log('%c[PlayerControl] ' + names.length + ' bones in "' +
                  (role || selected) + '":', 'color:#22d3ee;font-weight:bold');
      names.forEach(function(n){ console.log('  ' + n); });
      return names;
    }

    function resetArms(role){
      let found = 0, applied = 0;
      const targets = role ? [role] : roles;
      targets.forEach(function(r){
        const res = applyArmsDown(r);
        found += res.found;
        applied += res.applied;
      });
      console.log('[PlayerControl] re-applied arms-down: ' + applied + '/' + found);
      return applied;
    }

    window.PlayerControl = {
      roles:         roles,
      selected:      function(){ return selected; },
      select:        function(role){ if (players[role]) selected = role; },
      moveTo:        moveTo,
      standAll:      standAll,
      listPositions: listPositions,
      dumpBones:     dumpBones,
      resetArms:     resetArms
    };

    showToast('Tab = cycle · WASD = move · Esc = reset');
    console.log('[PlayerControl] ✅ Ready — ' + roles.length + ' players');
  }

})();
