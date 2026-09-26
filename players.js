/* ══════════════════════════════════════════════════════════════
   players.js — v9.5 Combined
   • No arm baking (arms stay visible in model's rest pose)
   • Bat attached to right-hand bone with tuned offsets
   • Keeper crouch + batsman stance applied at setup AND maintained
   • Leg-only walk cycle with reduced stride
   • Arm swing only for pure fielders (not batsman/bowler/keeper)
   Exposes: window.PlayerControl
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] v9.5 start', 'color:#00e676;font-weight:bold');

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
    const AX = new THREE.Vector3(1, 0, 0);
    const AY = new THREE.Vector3(0, 1, 0);

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

    const BONE_MAP = [
      { key:'hips',      patterns:['hips','pelvis','root'] },
      { key:'spine',     patterns:['spine','spine1'] },
      { key:'chest',     patterns:['chest','spine2','upperchest'] },
      { key:'neck',      patterns:['neck'] },
      { key:'head',      patterns:['head'] },
      { key:'lUpperArm', patterns:['leftupperarm','leftarm','lupperarm','upperarml','upperarmleft','leftshoulder','lshoulder'] },
      { key:'rUpperArm', patterns:['rightupperarm','rightarm','rupperarm','upperarmr','upperarmright','rightshoulder','rshoulder'] },
      { key:'lForeArm',  patterns:['leftforearm','leftlowerarm','lforearm','forearml'] },
      { key:'rForeArm',  patterns:['rightforearm','rightlowerarm','rforearm','forearmr'] },
      { key:'lHand',     patterns:['lefthand','lhand','handl'] },
      { key:'rHand',     patterns:['righthand','rhand','handr'] },
      { key:'lThigh',    patterns:['leftupleg','leftthigh','lthigh','thighl'] },
      { key:'rThigh',    patterns:['rightupleg','rightthigh','rthigh','thighr'] },
      { key:'lShin',     patterns:['leftleg','leftshin','llowerleg','shinleft','calfleft'] },
      { key:'rShin',     patterns:['rightleg','rightshin','rlowerleg','shinright','calfright'] },
      { key:'lFoot',     patterns:['leftfoot','lfoot','footl'] },
      { key:'rFoot',     patterns:['rightfoot','rfoot','footr'] }
    ];

    const _q = new THREE.Quaternion();
    function applyRot(bone, axis, angle){
      if (!bone) return;
      _q.setFromAxisAngle(axis, angle);
      bone.quaternion.multiply(_q);
    }

    // ─── Base posture (applied at setup + every frame) ──────
    function applyBasePosture(p){
      // Keeper: deep athletic crouch
      if (p.role === 'Keeper'){
        applyRot(p.bones.lThigh, AX,  0.9);
        applyRot(p.bones.rThigh, AX,  0.9);
        applyRot(p.bones.lShin,  AX, -1.0);
        applyRot(p.bones.rShin,  AX, -1.0);
        applyRot(p.bones.spine,  AX,  0.15);
      }
      // Batsman: slight knee bend, leaning forward
      else if (p.role === 'Striker' || p.role === 'Non-Striker'){
        applyRot(p.bones.lThigh, AX, 0.20);
        applyRot(p.bones.rThigh, AX, 0.20);
        applyRot(p.bones.lShin,  AX, -0.15);
        applyRot(p.bones.rShin,  AX, -0.15);
      }
      // Slip: crouch similar to keeper, slightly less
      else if (p.role === 'Slip'){
        applyRot(p.bones.lThigh, AX,  0.55);
        applyRot(p.bones.rThigh, AX,  0.55);
        applyRot(p.bones.lShin,  AX, -0.60);
        applyRot(p.bones.rShin,  AX, -0.60);
        applyRot(p.bones.spine,  AX,  0.20);
      }
    }

    // ─── Setup each player ──────────────────────────────────
    roles.forEach(role => {
      const group = raw[role];
      const bones = {};
      BONE_MAP.forEach(item => { bones[item.key] = findBone(group, item.patterns); });

      // Cache rest pose (before any modification)
      const rest = {};
      group.traverse(c => {
        if (c.isBone || c.type === 'Bone') rest[c.uuid] = c.quaternion.clone();
      });

      const bat  = accessories[role] && accessories[role].bat;
      const ball = accessories[role] && accessories[role].ball;

      // ═══════════════════════════════════════════════════════
      //  BAT — attach to right hand (v9 offsets)
      // ═══════════════════════════════════════════════════════
      if (bat && bones.rHand){
        if (bat.parent) bat.parent.remove(bat);

        // Scale bat to 0.96 m first
        bat.scale.set(1, 1, 1);
        bat.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(bat);
        const sz = new THREE.Vector3(); bb.getSize(sz);
        if (sz.y > 0) bat.scale.multiplyScalar(0.96 / sz.y);

        // Apply position + rotation from v9
        bat.position.set(0.02, -0.05, 0.01);
        bat.rotation.set(Math.PI * 0.5, 0, -Math.PI * 0.5);

        bones.rHand.add(bat);
        bat.updateMatrixWorld(true);
      }

      // ═══════════════════════════════════════════════════════
      //  BALL — attach to right hand (v9 offsets)
      // ═══════════════════════════════════════════════════════
      if (ball && bones.rHand){
        if (ball.parent) ball.parent.remove(ball);
        ball.position.set(0.04, 0.02, 0.03);
        bones.rHand.add(ball);
        ball.updateMatrixWorld(true);
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

      // Apply base posture once at setup
      applyBasePosture(players[role]);
    });

    console.log('[players.js] ' + Object.keys(players).length + ' players mapped');

    // ─── Walk cycle — legs only, reduced stride ─────────────
    function updateWalk(p, dt){
      const dx = p.group.position.x - p.lastX;
      const dz = p.group.position.z - p.lastZ;
      const inst = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      p.lastX = p.group.position.x;
      p.lastZ = p.group.position.z;
      p.speed = p.speed * 0.85 + inst * 0.15;

      if (p.speed < 0.2) return;
      // Keeper doesn't walk — stays crouched
      if (p.role === 'Keeper') return;

      p.phase += dt * (1.5 + Math.min(2.5, p.speed) * 1.5) * Math.PI * 2;
      const cyc = p.phase;
      const s = Math.min(1, p.speed / 3.5);
      const stride = 0.35 + s * 0.40;   // ← moderate, natural

      applyRot(p.bones.lThigh, AX,  Math.sin(cyc) * stride);
      applyRot(p.bones.rThigh, AX, -Math.sin(cyc) * stride);
      applyRot(p.bones.lShin,  AX, -Math.max(0, -Math.sin(cyc - 0.4)) * stride * 1.4);
      applyRot(p.bones.rShin,  AX, -Math.max(0,  Math.sin(cyc - 0.4)) * stride * 1.4);

      // Arms swing ONLY for pure fielders
      const isSpecial = (p.role === 'Striker' || p.role === 'Non-Striker' ||
                         p.role === 'Bowler'  || p.role === 'Keeper' ||
                         p.role.indexOf('Umpire') === 0);
      if (!isSpecial){
        applyRot(p.bones.lUpperArm, AX, -Math.sin(cyc) * stride * 0.5);
        applyRot(p.bones.rUpperArm, AX,  Math.sin(cyc) * stride * 0.5);
      }

      applyRot(p.bones.hips, AY, Math.sin(cyc) * 0.06);
    }

    // ─── Reset to rest + reapply stance ─────────────────────
    function resetRest(p){
      p.group.traverse(c => {
        if ((c.isBone || c.type === 'Bone') && p.rest[c.uuid]){
          c.quaternion.copy(p.rest[c.uuid]);
        }
      });
      applyBasePosture(p);
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
        if (window.showToast) window.showToast('Selected: ' + selected);
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

    console.log('[PlayerControl] ✅ ready');
  }
})();
