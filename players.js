/* ══════════════════════════════════════════════════════════════
   Player kinematics:
   • Arms-down bake  (world-space bone pointing)
   • Walk cycle driven by group movement
   • Bat + ball locked to right hand
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

    // ─── Bone finder ────────────────────────────────────────
    function findBone(group, patterns){
      let found = null;
      group.traverse(c => {
        if (found) return;
        if (!c.isBone && c.type !== 'Bone') return;
        const n = (c.name || '').toLowerCase();
        if (patterns.some(p => n.includes(p))) found = c;
      });
      return found;
    }

    const BONE_MAP = [
      { key:'hips',      patterns:['hips','pelvis'] },
      { key:'spine',     patterns:['spine'] },
      { key:'chest',     patterns:['chest','spine2','spine1'] },
      { key:'neck',      patterns:['neck'] },
      { key:'head',      patterns:['head'] },
      { key:'lUpperArm', patterns:['leftarm','left_arm','l_upperarm','upperarm_l','arm_l'] },
      { key:'rUpperArm', patterns:['rightarm','right_arm','r_upperarm','upperarm_r','arm_r'] },
      { key:'lForeArm',  patterns:['leftforearm','left_forearm','l_lowerarm','forearm_l','lowerarm_l'] },
      { key:'rForeArm',  patterns:['rightforearm','right_forearm','r_lowerarm','forearm_r','lowerarm_r'] },
      { key:'lHand',     patterns:['lefthand','left_hand','l_hand','hand_l','hand.l'] },
      { key:'rHand',     patterns:['righthand','right_hand','r_hand','hand_r','hand.r'] },
      { key:'lThigh',    patterns:['leftthigh','left_thigh','l_thigh','thigh_l'] },
      { key:'rThigh',    patterns:['rightthigh','right_thigh','r_thigh','thigh_r'] },
      { key:'lShin',     patterns:['leftshin','left_lowerleg','l_shin','shin_l','calf_l'] },
      { key:'rShin',     patterns:['rightshin','right_lowerleg','r_shin','shin_r','calf_r'] },
      { key:'lFoot',     patterns:['leftfoot','left_foot','l_foot','foot_l'] },
      { key:'rFoot',     patterns:['rightfoot','right_foot','r_foot','foot_r'] }
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

    // ─── Setup each player ──────────────────────────────────
    roles.forEach(role => {
      const group = raw[role];
      const bones = {};
      BONE_MAP.forEach(item => { bones[item.key] = findBone(group, item.patterns); });

      // Arms-down bake
      if (bones.lUpperArm) pointBoneDown(bones.lUpperArm);
      if (bones.rUpperArm) pointBoneDown(bones.rUpperArm);

      // Cache rest pose
      const rest = {};
      group.traverse(c => {
        if (c.isBone || c.type === 'Bone') rest[c.uuid] = c.quaternion.clone();
      });

      // Attach bat
      const bat = accessories[role] && accessories[role].bat;
      if (bat && bones.rHand){
        bones.rHand.updateWorldMatrix(true, false);
        const hp = new THREE.Vector3();
        const hq = new THREE.Quaternion();
        bones.rHand.getWorldPosition(hp);
        bones.rHand.getWorldQuaternion(hq);
        bat.position.copy(hp);
        bat.quaternion.copy(hq);
        bat.rotateX(0.5);
        const off = new THREE.Vector3(0, 0.96, 0).applyQuaternion(bat.quaternion);
        bat.position.sub(off);
        bat.updateMatrixWorld(true);
      }

      // Attach ball
      const ball = accessories[role] && accessories[role].ball;
      if (ball && bones.rHand){
        bones.rHand.updateWorldMatrix(true, false);
        const hp = new THREE.Vector3();
        bones.rHand.getWorldPosition(hp);
        ball.position.copy(hp);
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
        bat, ball
      };
    });

    console.log('[players.js]', Object.keys(players).length, 'ready');

    // ─── Walk cycle helpers ─────────────────────────────────
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

      p.phase += dt * (1.2 + Math.min(2, p.speed) * 1.2) * Math.PI * 2;
      const cyc = p.phase;
      const s   = Math.min(1, p.speed / 3.5);
      const stride = 0.35 + s * 0.45;

      // Legs
      applyRot(p.bones.lThigh, AX,  Math.sin(cyc) * stride);
      applyRot(p.bones.rThigh, AX, -Math.sin(cyc) * stride);
      applyRot(p.bones.lShin,  AX, Math.max(0, -Math.sin(cyc - 0.4)) * stride * 1.6);
      applyRot(p.bones.rShin,  AX, Math.max(0,  Math.sin(cyc - 0.4)) * stride * 1.6);
      applyRot(p.bones.lFoot,  AX, -Math.cos(cyc) * stride * 0.4);
      applyRot(p.bones.rFoot,  AX,  Math.cos(cyc) * stride * 0.4);

      // Arms counter-swing (skip if this role is animating a bat/ball)
      const isStriker = (p.role === 'Striker' || p.role === 'Non-Striker' || p.role === 'Bowler');
      if (!isStriker){
        applyRot(p.bones.lUpperArm, AX,  Math.sin(cyc) * stride * (1 + s * 0.3));
        applyRot(p.bones.rUpperArm, AX, -Math.sin(cyc) * stride * (1 + s * 0.3));
      }

      // Hips counter-rotation
      applyRot(p.bones.hips, new THREE.Vector3(0,1,0), Math.sin(cyc) * 0.1 * (0.5 + s * 0.5));

      return true;
    }

    function resetRest(p){
      p.group.traverse(c => {
        if ((c.isBone || c.type === 'Bone') && p.rest[c.uuid]){
          c.quaternion.copy(p.rest[c.uuid]);
        }
      });
    }

    function lockAccessories(p){
      if (p.bat && p.bones.rHand){
        p.bones.rHand.updateWorldMatrix(true, false);
        const hp = new THREE.Vector3();
        const hq = new THREE.Quaternion();
        p.bones.rHand.getWorldPosition(hp);
        p.bones.rHand.getWorldQuaternion(hq);
        p.bat.position.copy(hp);
        p.bat.quaternion.copy(hq);
        p.bat.rotateX(0.5);
        const off = new THREE.Vector3(0, 0.96, 0).applyQuaternion(p.bat.quaternion);
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
        resetRest(p);                 // reset bones to rest
        updateWalk(p, dt);            // apply walk cycle on top
        // (anim.js runs later and adds cricket pose on top)
        lockAccessories(p);           // lock bat/ball to hand
      });
    }
    requestAnimationFrame(tick);

    // ─── Keyboard controls ──────────────────────────────────
    let selected = roles[0];
    const keys   = {};

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
        if (window.showToast) window.showToast('Reset all');
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
        if (window.showToast) window.showToast(
          selected + ' · x=' + p.group.position.x.toFixed(1) +
                   ' z=' + p.group.position.z.toFixed(1));
      }
    })();

    // ─── Public API ─────────────────────────────────────────
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
      }
    };

    console.log('[PlayerControl] ✅ ready ·', Object.keys(players).length, 'players');
  }
})();
