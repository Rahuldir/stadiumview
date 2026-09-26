/* ══════════════════════════════════════════════════════════════
   Player kinematics — works with any Mixamo / Blender / custom rig
   Exposes: window.PlayerControl
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] start', 'color:#00e676;font-weight:bold');

  const wait = setInterval(() => {
    const P = window.StadiumView && window.StadiumView.players;
    if (!P || Object.keys(P).length < 5) return;
    clearInterval(wait);
    setTimeout(boot, 300);
  }, 200);

  function boot(){
    const SV          = window.StadiumView;
    const raw         = SV.players;
    const accessories = SV.accessories || {};
    const roles       = Object.keys(raw);
    const players     = {};
    const AX          = new THREE.Vector3(1,0,0);
    const AY          = new THREE.Vector3(0,1,0);
    const AZ          = new THREE.Vector3(0,0,1);

    // ─── Bone finder ────────────────────────────────────────
    function findBone(group, patterns){
      let found = null;
      group.traverse(c => {
        if (found) return;
        if (!c.isBone && c.type !== 'Bone') return;
        const n = (c.name || '').toLowerCase().replace(/[_.\-\s]/g, '');
        if (patterns.some(p => n.includes(p))) found = c;
      });
      return found;
    }

    // ═══════════════════════════════════════════════════════
    //  EXPANDED BONE MAP — handles Mixamo, Blender, Unity, custom
    // ═══════════════════════════════════════════════════════
    const BONE_MAP = [
      { key:'hips',      patterns:['hips','pelvis','root'] },
      { key:'spine',     patterns:['spine','spine1'] },
      { key:'chest',     patterns:['chest','spine2','upperchest'] },
      { key:'neck',      patterns:['neck'] },
      { key:'head',      patterns:['head'] },

      { key:'lUpperArm', patterns:['leftupperarm','leftarm','lupperarm','upperarml','upperarmleft','leftshoulder','lshoulder','shoulderl'] },
      { key:'rUpperArm', patterns:['rightupperarm','rightarm','rupperarm','upperarmr','upperarmright','rightshoulder','rshoulder','shoulderr'] },
      { key:'lForeArm',  patterns:['leftforearm','leftlowerarm','lforearm','forearml','forearmleft','lowerarmleft'] },
      { key:'rForeArm',  patterns:['rightforearm','rightlowerarm','rforearm','forearmr','forearmright','lowerarmright'] },
      { key:'lHand',     patterns:['lefthand','lhand','handl','handleft'] },
      { key:'rHand',     patterns:['righthand','rhand','handr','handright'] },

      { key:'lThigh',    patterns:['leftupleg','leftthigh','lthigh','thighl','upperlegleft','uplegleft'] },
      { key:'rThigh',    patterns:['rightupleg','rightthigh','rthigh','thighr','upperlegright','uplegright'] },
      { key:'lShin',     patterns:['leftleg','leftshin','llowerleg','lowerlegleft','shinleft','calfleft'] },
      { key:'rShin',     patterns:['rightleg','rightshin','rlowerleg','lowerlegright','shinright','calfright'] },
      { key:'lFoot',     patterns:['leftfoot','lfoot','footl','footleft'] },
      { key:'rFoot',     patterns:['rightfoot','rfoot','footr','footright'] }
    ];

    // ─── Bake arms straight down ────────────────────────────
    const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
    const _targetDown = new THREE.Vector3(0, -1, 0);

    function pointBoneDown(bone){
      if (!bone) return false;
      let child = null;
      for (let i = 0; i < bone.children.length; i++){
        const c = bone.children[i];
        if (c.isBone || c.type === 'Bone'){ child = c; break; }
      }
      if (!child) return false;
      bone.updateWorldMatrix(true, false);
      child.updateWorldMatrix(true, false);
      bone.getWorldPosition(_p1);
      child.getWorldPosition(_p2);
      const dir = _p2.clone().sub(_p1);
      if (dir.lengthSq() < 1e-8) return false;
      dir.normalize();
      const wrot = new THREE.Quaternion().setFromUnitVectors(dir, _targetDown);
      const pq   = new THREE.Quaternion();
      if (bone.parent) bone.parent.getWorldQuaternion(pq);
      const newQ = pq.clone().invert()
        .multiply(wrot)
        .multiply(pq)
        .multiply(bone.quaternion);
      bone.quaternion.copy(newQ);
      bone.updateMatrixWorld(true);
      return true;
    }

    // ─── Diagnostic: dump bone names for the FIRST player ──
    (function dumpBones(){
      const first = raw[roles[0]];
      if (!first) return;
      const names = [];
      first.traverse(c => { if (c.isBone || c.type === 'Bone') names.push(c.name); });
      console.log('%c[players.js] BONE NAMES in rig (' + names.length + '):',
                  'color:#22d3ee;font-weight:bold');
      console.log(names.join('\n'));
    })();

    // ─── Setup each player ──────────────────────────────────
    roles.forEach(role => {
      const group = raw[role];
      const bones = {};
      BONE_MAP.forEach(item => { bones[item.key] = findBone(group, item.patterns); });

      // Bake arms down
      if (bones.lUpperArm) pointBoneDown(bones.lUpperArm);
      if (bones.rUpperArm) pointBoneDown(bones.rUpperArm);

      // Cache rest pose AFTER the arms-down bake
      const rest = {};
      group.traverse(c => {
        if (c.isBone || c.type === 'Bone') rest[c.uuid] = c.quaternion.clone();
      });

      const bat  = accessories[role] && accessories[role].bat;
      const ball = accessories[role] && accessories[role].ball;

      // Compute bat handle-offset in bat-local Y
      let batHandleOffset = 0;
      if (bat){
        const bb = new THREE.Box3().setFromObject(bat);
        const sz = new THREE.Vector3(); bb.getSize(sz);
        batHandleOffset = sz.y * 0.5;   // half bat length → grip is halfway down
      }

      players[role] = {
        role, group, bones, rest,
        home: {
          x: group.position.x,
          y: group.position.y,
          z: group.position.z,
          rotY: group.rotation.y
        },
        lastX: group.position.x,
        lastZ: group.position.z,
        phase: 0,
        speed: 0,
        bat, ball, batHandleOffset
      };

      // Initial attach
      lockAccessories(players[role]);
    });

    console.log('[players.js] ' + Object.keys(players).length + ' ready');

    // ─── Walk helpers ───────────────────────────────────────
    const _q = new THREE.Quaternion();
    function applyRot(bone, axis, angle){
      if (!bone) return;
      _q.setFromAxisAngle(axis, angle);
      bone.quaternion.multiply(_q);
    }

    function updateWalk(p, dt){
      const dx = p.group.position.x - p.lastX;
      const dz = p.group.position.z - p.lastZ;
      const inst = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      p.lastX = p.group.position.x;
      p.lastZ = p.group.position.z;
      p.speed = p.speed * 0.85 + inst * 0.15;

      if (p.speed < 0.2) return false;

      p.phase += dt * (1.5 + Math.min(2.5, p.speed) * 1.5) * Math.PI * 2;
      const cyc = p.phase;
      const s   = Math.min(1, p.speed / 3.5);
      const stride = 0.55 + s * 0.60;

      // Legs
      applyRot(p.bones.lThigh, AX,  Math.sin(cyc) * stride);
      applyRot(p.bones.rThigh, AX, -Math.sin(cyc) * stride);
      applyRot(p.bones.lShin,  AX, -Math.max(0, -Math.sin(cyc - 0.4)) * stride * 1.8);
      applyRot(p.bones.rShin,  AX, -Math.max(0,  Math.sin(cyc - 0.4)) * stride * 1.8);
      applyRot(p.bones.lFoot,  AX, -Math.cos(cyc) * stride * 0.5);
      applyRot(p.bones.rFoot,  AX,  Math.cos(cyc) * stride * 0.5);

      // Arms counter-swing (skip for striker/non-striker/bowler)
      const isBat = (p.role === 'Striker' || p.role === 'Non-Striker' || p.role === 'Bowler');
      if (!isBat){
        applyRot(p.bones.lUpperArm, AX,  Math.sin(cyc) * stride * 0.8);
        applyRot(p.bones.rUpperArm, AX, -Math.sin(cyc) * stride * 0.8);
        applyRot(p.bones.lForeArm,  AX, -Math.abs(Math.sin(cyc)) * 0.4);
        applyRot(p.bones.rForeArm,  AX, -Math.abs(Math.sin(cyc)) * 0.4);
      }

      applyRot(p.bones.hips, AY, Math.sin(cyc) * 0.10 * (0.5 + s * 0.5));

      return true;
    }

    function resetRest(p){
      p.group.traverse(c => {
        if ((c.isBone || c.type === 'Bone') && p.rest[c.uuid]){
          c.quaternion.copy(p.rest[c.uuid]);
        }
      });
    }

    // ─── Bat / ball attachment ──────────────────────────────
    //  The bat's origin is assumed to be at the HANDLE TOP.
    //  We place it so the origin sits at the hand, then rotate
    //  so the blade hangs naturally downward.
    function lockAccessories(p){
      if (p.bat && p.bones.rHand){
        p.bones.rHand.updateWorldMatrix(true, false);
        const hp = new THREE.Vector3();
        const hq = new THREE.Quaternion();
        p.bones.rHand.getWorldPosition(hp);
        p.bones.rHand.getWorldQuaternion(hq);

        p.bat.position.copy(hp);
        p.bat.quaternion.copy(hq);

        // Rotate bat so blade points forward/down from the grip
        p.bat.rotateX(Math.PI * 0.5);   // handle → hand, blade → forward

        // If the bat's pivot is at its CENTER, shift so the handle
        // lands in the palm instead of the middle of the blade.
        const off = new THREE.Vector3(0, p.batHandleOffset, 0)
          .applyQuaternion(p.bat.quaternion);
        p.bat.position.sub(off);
      }
      if (p.ball && p.bones.rHand){
        p.bones.rHand.updateWorldMatrix(true, false);
        const hp = new THREE.Vector3();
        p.bones.rHand.getWorldPosition(hp);
        p.ball.position.copy(hp);
      }
    }

    // ─── Main loop ──────────────────────────────────────────
    let last = performance.now();
    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      Object.keys(players).forEach(r => {
        const p = players[r];
        resetRest(p);
        updateWalk(p, dt);
        lockAccessories(p);
      });
    }
    requestAnimationFrame(tick);

    // ─── Keyboard ───────────────────────────────────────────
    let selected = roles[0];
    const keys = {};

    document.addEventListener('keydown', e => {
      keys[e.code] = true;
      if (e.code === 'Tab'){
        e.preventDefault();
        const i = roles.indexOf(selected);
        selected = roles[(i + 1) % roles.length];
        if (window.showToast) window.showToast('→ ' + selected);
      }
      if (e.code === 'Escape'){
        Object.keys(players).forEach(r => {
          const p = players[r];
          p.group.position.set(p.home.x, p.home.y, p.home.z);
          p.group.rotation.y = p.home.rotY;
        });
      }
    });
    document.addEventListener('keyup', e => keys[e.code] = false);

    let lastStep = 0;
    (function keyLoop(){
      requestAnimationFrame(keyLoop);
      const now = performance.now();
      if (now - lastStep < 45) return;
      lastStep = now;
      const p = players[selected];
      if (!p) return;
      const sp = 0.4;
      let dx = 0, dz = 0;
      if (keys['KeyW'] || keys['ArrowUp'])    dz -= sp;
      if (keys['KeyS'] || keys['ArrowDown'])  dz += sp;
      if (keys['KeyA'] || keys['ArrowLeft'])  dx -= sp;
      if (keys['KeyD'] || keys['ArrowRight']) dx += sp;
      if (dx || dz){
        p.group.position.x += dx;
        p.group.position.z += dz;
        p.home.x = p.group.position.x;
        p.home.z = p.group.position.z;
        p.group.rotation.y = Math.atan2(dx, dz);
      }
    })();

    window.PlayerControl = {
      players,
      roles,
      selected: () => selected,
      select: role => { if (players[role]) selected = role; },
      resetAll: () => {
        Object.keys(players).forEach(r => {
          const p = players[r];
          p.group.position.set(p.home.x, p.home.y, p.home.z);
          p.group.rotation.y = p.home.rotY;
        });
      },
      // Debug helper
      dumpBones: (role) => {
        const p = players[role || roles[0]];
        const names = [];
        p.group.traverse(c => { if (c.isBone || c.type === 'Bone') names.push(c.name); });
        console.log(names.join('\n'));
      }
    };

    console.log('[PlayerControl] ✅ ready ·', Object.keys(players).length, 'players');
  }
})();
