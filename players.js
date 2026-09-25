/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v18.0 (Advanced Locomotion + Actions)
   • Velocity-driven walk/run cycle (works with moveTo, keyboard, chase)
   • 9 batting strokes · 2 bowling types · fielding · keeping · signals
   • Smooth transitions between modes
   • Preserves v17: jersey colors, stance overrides, hand-locked bat/ball
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v18.0', 'color:#00e5ff;font-weight:bold');

  const IS_MOBILE_PLAYERS = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const BONE_EVERY = IS_MOBILE_PLAYERS ? 3 : 1;
  let attempts = 0, MAX_ATTEMPTS = 100;

  const wait = setInterval(function(){
    attempts++;
    const found = collectPlayers();
    if (found && Object.keys(found.players).length >= 5){
      clearInterval(wait);
      console.log('[players.js] found ' + Object.keys(found.players).length + ' players');
      boot(found.players);
      return;
    }
    if (attempts >= MAX_ATTEMPTS){
      clearInterval(wait);
      console.warn('[players.js] ❌ gave up after ' + MAX_ATTEMPTS + ' attempts');
    }
  }, 200);

  function collectPlayers(){
    if (window.StadiumView && window.StadiumView.players && Object.keys(window.StadiumView.players).length >= 5){
      return { players: window.StadiumView.players };
    }
    if (window.StadiumView && window.StadiumView.scene){
      const out = {};
      window.StadiumView.scene.traverse(function(o){
        if (!o.name || o.name.indexOf('PLAYER_') !== 0) return;
        const role = o.userData.role || o.name.replace(/^PLAYER_/, '').replace(/_/g, ' ');
        out[role] = o;
      });
      if (Object.keys(out).length >= 5) return { players: out };
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════════
  //  1. STANCE OVERRIDES (kept from v17)
  // ═════════════════════════════════════════════════════════════
  const STANCE_OVERRIDES = {
    'Striker':          { x: -0.32, z: 8.8,   rotY: Math.PI * 0.72, batTilt: 0.25 },
    'Non-Striker':      { x: 1.05,  z: -9.5,  rotY: -Math.PI * 0.22, batTilt: 0.25 },
    'Bowler':           { x: 0.6,   z: -24,   rotY: 0 },
    'Keeper':           { x: -0.32, z: 12.5,  rotY: Math.PI },
    'UmpireBowlersEnd': { x: 0.5,   z: -11.5, rotY: 0 },
    'UmpireSquareLeg':  { x: -14,   z: 8.8,   rotY: Math.PI / 2 }
  };

  // ═════════════════════════════════════════════════════════════
  //  2. BONE DISCOVERY (kept from v17, unchanged)
  // ═════════════════════════════════════════════════════════════
  const BONE_SLOTS = [
    'hips','spine','chest','neck','head',
    'lShoulder','lUpperArm','lForeArm','lHand',
    'rShoulder','rUpperArm','rForeArm','rHand',
    'lThigh','lShin','lFoot','rThigh','rShin','rFoot'
  ];

  function classifyBone(bone){
    const n = (bone.name || '').toLowerCase();
    if (!n) return null;
    const L = /left|_l$|\.l$|_l_|l_arm|l_leg|l_hand|l_foot|l_thigh|l_shin|l_shoulder|l_upper|l_fore/.test(n);
    const R = /right|_r$|\.r$|_r_|r_arm|r_leg|r_hand|r_foot|r_thigh|r_shin|r_shoulder|r_upper|r_fore/.test(n);

    if (/hips$|hip$|_hips|pelvis/.test(n) && !/left|right|_l|_r/.test(n)) return 'hips';
    if (/spine2|spine_02|chest|spine1$/.test(n)) return 'chest';
    if (/spine/.test(n)) return 'spine';
    if (/upperarm|upper_arm/.test(n)) return L ? 'lUpperArm' : R ? 'rUpperArm' : null;
    if (/arm/.test(n) && !/fore|lower|hand|finger|thumb/.test(n)) return L ? 'lUpperArm' : R ? 'rUpperArm' : null;
    if (/forearm|lowerarm|lower_arm|elbow/.test(n)) return L ? 'lForeArm' : R ? 'rForeArm' : null;
    if (/hand|wrist/.test(n) && !/finger|thumb/.test(n)) return L ? 'lHand' : R ? 'rHand' : null;
    if (/thigh|upperleg|upleg/.test(n) && !/lower|knee|calf|shin/.test(n)) return L ? 'lThigh' : R ? 'rThigh' : null;
    if (/knee|calf|shin|lowerleg|lower_leg/.test(n)) return L ? 'lShin' : R ? 'rShin' : null;
    return null;
  }

  function buildSkeleton(root){
    const bones = [];
    root.traverse(c => { if (c.isBone || c.type === 'Bone') bones.push(c); });
    if (bones.length === 0){
      root.traverse(c => { if (c.isSkinnedMesh && c.skeleton && c.skeleton.bones) bones.push(...c.skeleton.bones); });
    }

    const slots = {};
    BONE_SLOTS.forEach(s => slots[s] = null);
    bones.forEach(b => {
      const slot = classifyBone(b);
      if (slot && !slots[slot]) slots[slot] = b;
    });

    const parentOf = b => b && b.parent && (b.parent.isBone || b.parent.type === 'Bone') ? b.parent : null;
    const childOf = b => {
      if (!b) return null;
      for (let i = 0; i < b.children.length; i++) {
        if (b.children[i].isBone || b.children[i].type === 'Bone') return b.children[i];
      }
      return null;
    };

    if (!slots.hips && bones.length) slots.hips = bones[0];
    if (!slots.spine && slots.hips) slots.spine = childOf(slots.hips);
    if (!slots.chest && slots.spine) slots.chest = childOf(slots.spine) || slots.spine;
    if (!slots.lUpperArm && slots.lForeArm) slots.lUpperArm = parentOf(slots.lForeArm);
    if (!slots.rUpperArm && slots.rForeArm) slots.rUpperArm = parentOf(slots.rForeArm);
    if (!slots.lForeArm && slots.lUpperArm) slots.lForeArm = childOf(slots.lUpperArm);
    if (!slots.rForeArm && slots.rUpperArm) slots.rForeArm = childOf(slots.rUpperArm);
    if (!slots.lHand && slots.lForeArm) slots.lHand = childOf(slots.lForeArm);
    if (!slots.rHand && slots.rForeArm) slots.rHand = childOf(slots.rForeArm);
    if (!slots.lShin && slots.lThigh) slots.lShin = childOf(slots.lThigh);
    if (!slots.rShin && slots.rThigh) slots.rShin = childOf(slots.rThigh);

    return { bones, slots, rest: {} };
  }

  // ═════════════════════════════════════════════════════════════
  //  3. REST POSE + RIG CALIBRATION (kept from v17)
  // ═════════════════════════════════════════════════════════════
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _targetDown = new THREE.Vector3(0, -1, 0);
  const _parentQ = new THREE.Quaternion(), _invParentQ = new THREE.Quaternion(), _worldRot = new THREE.Quaternion(), _newLocalQ = new THREE.Quaternion();

  function pointBoneDown(bone, targetDir){
    if (!bone) return false;
    let child = null;
    for (let i = 0; i < bone.children.length; i++){
      if (bone.children[i].isBone || bone.children[i].type === 'Bone'){ child = bone.children[i]; break; }
    }
    if (!child && bone.children.length > 0) child = bone.children[0];
    if (!child) return false;

    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(true, false);
    bone.getWorldPosition(_v1);
    child.getWorldPosition(_v2);

    const currentDir = _v2.clone().sub(_v1);
    if (currentDir.lengthSq() < 1e-8) return false;
    currentDir.normalize();

    _worldRot.setFromUnitVectors(currentDir, targetDir);

    if (bone.parent){
      bone.parent.getWorldQuaternion(_parentQ);
      _invParentQ.copy(_parentQ).invert();
    } else {
      _parentQ.identity();
      _invParentQ.identity();
    }

    _newLocalQ.copy(_invParentQ).multiply(_worldRot).multiply(_parentQ).multiply(bone.quaternion);
    bone.quaternion.copy(_newLocalQ);
    bone.updateMatrixWorld(true);
    return true;
  }

  function bakeRestPose(skel){
    if (skel.slots.lUpperArm) pointBoneDown(skel.slots.lUpperArm, _targetDown);
    if (skel.slots.rUpperArm) pointBoneDown(skel.slots.rUpperArm, _targetDown);
    BONE_SLOTS.forEach(slot => {
      if (skel.slots[slot]) skel.rest[slot] = skel.slots[slot].quaternion.clone();
    });
  }

  function calibrateRig(skel){
    const axes = [new THREE.Vector3(1,0,0), new THREE.Vector3(0,1,0), new THREE.Vector3(0,0,1)];
    let bestAxis = axes[0], bestZ = 0;

    axes.forEach(axis => {
      const b = skel.slots.lThigh;
      if (!b || !skel.rest.lThigh) return;
      const test = new THREE.Quaternion().setFromAxisAngle(axis, 1.0);
      b.quaternion.copy(skel.rest.lThigh).multiply(test);
      b.updateMatrixWorld(true);
      const pw = new THREE.Vector3();
      if (skel.slots.lShin) skel.slots.lShin.getWorldPosition(pw);
      if (Math.abs(pw.z) > bestZ){ bestZ = Math.abs(pw.z); bestAxis = axis; }
      b.quaternion.copy(skel.rest.lThigh);
    });
    skel.bendAxis = bestAxis;
  }

  // ═════════════════════════════════════════════════════════════
  //  4. JERSEY COLORS (kept from v17)
  // ═════════════════════════════════════════════════════════════
  function applyJerseyColors(role, group) {
    group.traverse(c => {
      if (c.userData && c.userData.isAccessory) return;
      if (c.isMesh && c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        const newMats = mats.map(m => {
          if (m.map !== null || /skin|face|hair|head|eye/i.test(m.name) || /skin|face|hair|head/i.test(c.name)) return m;
          let clone = m.clone();
          clone.emissiveIntensity = 0;
          if (clone.emissive) clone.emissive.setHex(0x000000);

          if (role === 'Striker' || role === 'Non-Striker') {
            if (clone.color) clone.color.setHex(0xE31837);
            if (clone.emissive) { clone.emissive.setHex(0xFFD700); clone.emissiveIntensity = 0.25; }
          } else if (role.includes('Umpire')) {
            if (clone.color) clone.color.setHex(0x222222);
          } else {
            if (clone.color) clone.color.setHex(0x004BA0);
          }
          return clone;
        });
        c.material = Array.isArray(c.material) ? newMats : newMats[0];
      }
    });
  }

  // ═════════════════════════════════════════════════════════════
  //  5. PLAYER WRAPPER
  // ═════════════════════════════════════════════════════════════
  function makePlayer(role, group, accessoryRef){
    const skel = buildSkeleton(group);
    if (skel.bones.length === 0) return null;

    const stance = STANCE_OVERRIDES[role];
    if (stance){
      group.position.set(stance.x, group.position.y, stance.z);
      group.rotation.y = stance.rotY;
    } else {
      const target = new THREE.Vector3(0, group.position.y, 8.8);
      group.lookAt(target);
      if (skel.slots.hips) skel.slots.hips.rotateY(Math.PI);
    }
    group.updateMatrixWorld(true);

    const playerObj = {
      role, group, skel, stance: stance || null,
      mode: 'idle',
      action: null,
      phase: 0, phaseSpeed: 1, loop: true,
      // Locomotion
      lastX: group.position.x,
      lastZ: group.position.z,
      locoPhase: 0,
      locoSpeed: 0,
      // Transition blend (0 = pure old pose, 1 = pure new pose)
      blend: 1,
      prevAction: null,
      transitionT: 1,
      // Accessories
      batObj: (accessoryRef && accessoryRef.bat) ? accessoryRef.bat : null,
      ballObj: (accessoryRef && accessoryRef.ball) ? accessoryRef.ball : null,
      // Metrics
      metrics: { kneeAngle: 180, xFactor: 0, elbowAngle: 180 }
    };

    if (playerObj.batObj) {
      if (playerObj.batObj.parent) playerObj.batObj.parent.remove(playerObj.batObj);
      playerObj.batObj.userData.isAccessory = true;
      playerObj.batObj.scale.set(1, 1, 1);
      window.StadiumView.scene.add(playerObj.batObj);
    }
    if (playerObj.ballObj) {
      if (playerObj.ballObj.parent) playerObj.ballObj.parent.remove(playerObj.ballObj);
      playerObj.ballObj.userData.isAccessory = true;
      playerObj.ballObj.scale.set(1.5, 1.5, 1.5);
      window.StadiumView.scene.add(playerObj.ballObj);
    }

    bakeRestPose(skel);
    calibrateRig(skel);
    applyJerseyColors(role, group);

    return playerObj;
  }

  // ═════════════════════════════════════════════════════════════
  //  6. BOOT
  // ═════════════════════════════════════════════════════════════
  function boot(rawPlayers){
    const roles = Object.keys(rawPlayers);
    const accessories = (window.StadiumView.accessories) || {};
    const players = {};

    roles.forEach(r => {
      const p = makePlayer(r, rawPlayers[r], accessories[r]);
      if (p) players[r] = p;
    });
    if (Object.keys(players).length === 0) return;

    // ─── Bone-delta helpers ───────────────────────────────
    const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
    const X = new THREE.Vector3(1,0,0), Y = new THREE.Vector3(0,1,0), Z = new THREE.Vector3(0,0,1);

    function dBend(sk, slot, ang){
      if (!sk.slots[slot] || !sk.rest[slot] || !sk.bendAxis) return;
      _qa.setFromAxisAngle(sk.bendAxis, ang);
      _qb.copy(sk.rest[slot]).multiply(_qa);
      sk.slots[slot].quaternion.copy(_qb);
    }
    function dX(sk, slot, ang){
      if (!sk.slots[slot] || !sk.rest[slot]) return;
      _qa.setFromAxisAngle(X, ang); _qb.copy(sk.rest[slot]).multiply(_qa);
      sk.slots[slot].quaternion.copy(_qb);
    }
    function dY(sk, slot, ang){
      if (!sk.slots[slot] || !sk.rest[slot]) return;
      _qa.setFromAxisAngle(Y, ang); _qb.copy(sk.rest[slot]).multiply(_qa);
      sk.slots[slot].quaternion.copy(_qb);
    }
    function dZ(sk, slot, ang){
      if (!sk.slots[slot] || !sk.rest[slot]) return;
      _qa.setFromAxisAngle(Z, ang); _qb.copy(sk.rest[slot]).multiply(_qa);
      sk.slots[slot].quaternion.copy(_qb);
    }

    function resetToRest(p){
      BONE_SLOTS.forEach(slot => {
        if (p.skel.slots[slot] && p.skel.rest[slot]) p.skel.slots[slot].quaternion.copy(p.skel.rest[slot]);
      });
      p.group.position.y = p.homeY !== undefined ? p.homeY : p.group.position.y;
    }

    // Store each player's home Y so resetToRest doesn't clobber
    Object.keys(players).forEach(r => {
      players[r].homeY = players[r].group.position.y;
    });

    // ─── Accessory locking (kept from v17) ────────────────
    function lockAccessories(p) {
      if (p.batObj && p.skel.slots.rHand) {
        p.skel.slots.rHand.updateMatrixWorld(true);
        p.skel.slots.rHand.getWorldPosition(_v1);
        p.skel.slots.rHand.getWorldQuaternion(_worldRot);
        p.batObj.position.copy(_v1);
        const gripFix = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(Math.PI/2 + (p.stance ? p.stance.batTilt : 0.2), 0, 0)
        );
        p.batObj.quaternion.copy(_worldRot).multiply(gripFix);
        const handleOffset = new THREE.Vector3(0, 0.45, 0).applyQuaternion(p.batObj.quaternion);
        p.batObj.position.sub(handleOffset);
      }
      if (p.ballObj && p.skel.slots.rHand) {
        p.skel.slots.rHand.updateMatrixWorld(true);
        p.skel.slots.rHand.getWorldPosition(_v1);
        p.ballObj.position.copy(_v1);
      }
    }

    // ═════════════════════════════════════════════════════════════
    //  7. LOCOMOTION — velocity-driven walk/run cycle
    //     Called every frame. Reads how far the group moved since last frame
    //     and plays a walk/run animation with the corresponding speed.
    // ═════════════════════════════════════════════════════════════
    function updateLocomotion(p, dt){
      const cx = p.group.position.x;
      const cz = p.group.position.z;
      const dx = cx - p.lastX;
      const dz = cz - p.lastZ;
      const dist = Math.hypot(dx, dz);

      p.lastX = cx;
      p.lastZ = cz;

      // Instantaneous speed (m/s)
      const speed = dt > 0 ? dist / dt : 0;
      // Smooth speed (low-pass filter)
      p.locoSpeed = p.locoSpeed * 0.85 + speed * 0.15;

      // Not moving → reset walk phase
      if (p.locoSpeed < 0.15){
        p.locoPhase *= 0.85; // decay back to neutral
        if (Math.abs(p.locoPhase) < 0.01) p.locoPhase = 0;
        return false;
      }

      // Advance phase proportional to speed
      const freq = 1.2 + Math.min(2.0, p.locoSpeed) * 0.8;
      p.locoPhase += dt * freq * Math.PI * 2;
      const cyc = p.locoPhase;

      // Normalized speed: 0 = walk, 1 = run
      const run = Math.min(1, p.locoSpeed / 3.5);
      const stride = 0.35 + run * 0.45;

      // Legs — sinusoid swing + knee bend when leg is behind
      dX(p.skel, 'lThigh',  Math.sin(cyc) * stride);
      dX(p.skel, 'rThigh', -Math.sin(cyc) * stride);

      const lKnee = Math.max(0, -Math.sin(cyc - 0.4)) * stride * 1.6;
      const rKnee = Math.max(0,  Math.sin(cyc - 0.4)) * stride * 1.6;
      dBend(p.skel, 'lShin', lKnee);
      dBend(p.skel, 'rShin', rKnee);

      // Ankles push off — small
      dX(p.skel, 'lFoot', -Math.cos(cyc) * stride * 0.4);
      dX(p.skel, 'rFoot',  Math.cos(cyc) * stride * 0.4);

      // Arms counter-swing (arms move opposite to same-side leg)
      // Plus forward bias so arms stay in front of the chest
      dX(p.skel, 'lUpperArm', Math.sin(cyc) * stride * (1.0 + run * 0.3));
      dX(p.skel, 'rUpperArm', -Math.sin(cyc) * stride * (1.0 + run * 0.3));
      dBend(p.skel, 'lForeArm', 0.5 + Math.max(0, Math.sin(cyc)) * (0.5 + run * 0.5));
      dBend(p.skel, 'rForeArm', 0.5 + Math.max(0, -Math.sin(cyc)) * (0.5 + run * 0.5));

      // Hips yaw side-to-side with stride
      dY(p.skel, 'hips', Math.sin(cyc) * 0.12 * (0.5 + run * 0.5));
      dY(p.skel, 'chest', -Math.sin(cyc) * 0.08 * (0.5 + run * 0.5));

      // Spine forward lean grows with speed
      dX(p.skel, 'spine', run * 0.20);

      // Vertical bob — two peaks per cycle
      p.group.position.y = p.homeY + Math.abs(Math.sin(cyc)) * 0.05 * (0.4 + run * 0.8);

      return true;
    }

    // ═════════════════════════════════════════════════════════════
    //  8. IDLE STANCE — per role
    // ═════════════════════════════════════════════════════════════
    function idleStance(p, t){
      const sk = p.skel;

      // Subtle breathing on chest
      dX(sk, 'chest', Math.sin(t * 1.6) * 0.015);

      // Role-specific idle
      if (p.role === 'Striker' || p.role === 'Non-Striker'){
        // Cricketer's guard stance: slight knee bend, bat down
        dBend(sk, 'lThigh', -0.25); dBend(sk, 'lShin', 0.35);
        dBend(sk, 'rThigh', -0.25); dBend(sk, 'rShin', 0.35);
        // Bat tap sway
        const tap = Math.max(0, Math.sin(t * 2.5)) * 0.06;
        dX(sk, 'rUpperArm', 0.55 + tap);
        dX(sk, 'lUpperArm', 0.45 + tap);
        dBend(sk, 'rForeArm', 0.8);
        dBend(sk, 'lForeArm', 0.7);
      }
      else if (p.role === 'Keeper'){
        // Deep crouch
        dBend(sk, 'lThigh', -1.4); dBend(sk, 'lShin', 1.8);
        dBend(sk, 'rThigh', -1.4); dBend(sk, 'rShin', 1.8);
        if (sk.slots.lUpperArm) pointBoneDown(sk.slots.lUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
        if (sk.slots.rUpperArm) pointBoneDown(sk.slots.rUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
        // Subtle weight shift
        dY(sk, 'hips', Math.sin(t * 0.9) * 0.05);
      }
      else if (p.role === 'Bowler'){
        // Bowler at top of run-up: upright, ball in hand
        dBend(sk, 'lForeArm', 0.3);
        dBend(sk, 'rForeArm', 0.4);
        // Slight bounce on toes
        p.group.position.y = p.homeY + Math.max(0, Math.sin(t * 2.4)) * 0.02;
      }
      else if (p.role.includes('Umpire')){
        // Umpire: hands slightly forward, standing tall
        dX(sk, 'rUpperArm', 0.15);
        dX(sk, 'lUpperArm', 0.15);
        dBend(sk, 'rForeArm', 0.3);
        dBend(sk, 'lForeArm', 0.3);
      }
      else {
        // Fielder: hands on hips, alert
        dX(sk, 'lUpperArm', 0.3);
        dX(sk, 'rUpperArm', 0.3);
        dBend(sk, 'lForeArm', 1.4);
        dBend(sk, 'rForeArm', 1.4);
        // Small sway
        dY(sk, 'chest', Math.sin(t * 0.7) * 0.04);
      }
    }

    // ═════════════════════════════════════════════════════════════
    //  9. BATTING STROKES — 9 shots
    // ═════════════════════════════════════════════════════════════
    function battingKinematics(p){
      const sk = p.skel;
      const a = p.phase;   // 0..1
      const shot = p.action || 'coverDrive';

      // Common: hips lead, chest follows (kinetic chain)
      const xFactor = Math.sin(a * Math.PI) * 0.4;
      p.metrics.xFactor = (xFactor * 180 / Math.PI).toFixed(1);

      // ─── SHOT: COVER DRIVE (front-foot, through the covers) ───
      if (shot === 'coverDrive'){
        if (a < 0.35){
          const q = a / 0.35;
          // Backlift
          dX(sk, 'rUpperArm', 1.4 * q);
          dX(sk, 'lUpperArm', 0.7 * q);
          dBend(sk, 'rForeArm', 1.0 * q);
          dY(sk, 'chest', 0.25 * q);
          dY(sk, 'hips', 0.15 * q);
          // Step forward onto left foot
          dX(sk, 'lThigh', -0.5 * q);
          dBend(sk, 'rShin', 0.3 * q);
        } else if (a < 0.6){
          const q = (a - 0.35) / 0.25;
          // Downswing through the line
          dX(sk, 'rUpperArm', 1.4 - 2.2 * q);
          dX(sk, 'lUpperArm', 0.7 - 1.2 * q);
          dBend(sk, 'rForeArm', 1.0 - 0.6 * q);
          dY(sk, 'chest', 0.25 - 0.7 * q);
          dY(sk, 'hips', 0.15 - 0.35 * q);
          dX(sk, 'lThigh', -0.5);
          dX(sk, 'rThigh', 0.2);
        } else {
          const q = (a - 0.6) / 0.4;
          // Follow-through — bat swings up through off-side
          dX(sk, 'rUpperArm', -0.8 - 0.4 * q);
          dX(sk, 'lUpperArm', -0.5 - 0.3 * q);
          dY(sk, 'chest', -0.45 - 0.2 * q);
          dY(sk, 'hips', -0.2);
        }
      }

      // ─── SHOT: STRAIGHT DRIVE (front-foot, down the ground) ───
      else if (shot === 'straightDrive'){
        if (a < 0.3){
          const q = a / 0.3;
          dX(sk, 'rUpperArm', 1.6 * q);
          dX(sk, 'lUpperArm', 0.9 * q);
          dBend(sk, 'rForeArm', 1.1 * q);
          dX(sk, 'lThigh', -0.6 * q);
        } else if (a < 0.65){
          const q = (a - 0.3) / 0.35;
          dX(sk, 'rUpperArm', 1.6 - 2.4 * q);
          dX(sk, 'lUpperArm', 0.9 - 1.5 * q);
          dBend(sk, 'rForeArm', 1.1 - 0.7 * q);
          // Lower body drives through the shot
          dX(sk, 'lThigh', -0.6 + 0.15 * q);
          dX(sk, 'rThigh', 0.1 * q);
          dX(sk, 'spine', 0.1 * q);
        } else {
          const q = (a - 0.65) / 0.35;
          dX(sk, 'rUpperArm', -0.8 - 0.5 * q);
          dX(sk, 'lUpperArm', -0.6 - 0.3 * q);
          dX(sk, 'spine', 0.15 - 0.1 * q);
        }
      }

      // ─── SHOT: PULL (back-foot, cross-batted) ───
      else if (shot === 'pull'){
        if (a < 0.3){
          const q = a / 0.3;
          // Backlift high + step back
          dX(sk, 'rUpperArm', 1.8 * q);
          dX(sk, 'lUpperArm', 1.0 * q);
          dBend(sk, 'rForeArm', 1.2 * q);
          dX(sk, 'rThigh', 0.4 * q);
          dY(sk, 'chest', 0.4 * q);
          dY(sk, 'hips', 0.3 * q);
        } else if (a < 0.6){
          const q = (a - 0.3) / 0.3;
          // Horizontal swing across body
          dX(sk, 'rUpperArm', 1.8 - 2.6 * q);
          dX(sk, 'lUpperArm', 1.0 - 1.6 * q);
          dY(sk, 'chest', 0.4 - 1.3 * q);
          dY(sk, 'hips', 0.3 - 0.8 * q);
          dZ(sk, 'rUpperArm', -0.4 * q);
          dZ(sk, 'lUpperArm', 0.2 * q);
        } else {
          const q = (a - 0.6) / 0.4;
          dX(sk, 'rUpperArm', -0.8);
          dX(sk, 'lUpperArm', -0.6);
          dY(sk, 'chest', -0.9 - 0.2 * q);
        }
      }

      // ─── SHOT: CUT (back-foot, square of the wicket) ───
      else if (shot === 'cut'){
        if (a < 0.3){
          const q = a / 0.3;
          dX(sk, 'rUpperArm', 1.5 * q);
          dX(sk, 'lUpperArm', 0.8 * q);
          dY(sk, 'chest', 0.35 * q);
          dZ(sk, 'rUpperArm', -0.5 * q);
        } else if (a < 0.65){
          const q = (a - 0.3) / 0.35;
          dY(sk, 'chest', 0.35 - 1.4 * q);
          dY(sk, 'hips', -0.4 * q);
          dX(sk, 'rUpperArm', 1.5 - 1.8 * q);
          dX(sk, 'lUpperArm', 0.8 - 1.2 * q);
          dZ(sk, 'rUpperArm', -0.5 - 0.3 * q);
        } else {
          const q = (a - 0.65) / 0.35;
          dY(sk, 'chest', -1.05 - 0.2 * q);
          dX(sk, 'rUpperArm', -0.3 - 0.3 * q);
        }
      }

      // ─── SHOT: SWEEP (kneeling, horizontal bat) ───
      else if (shot === 'sweep'){
        if (a < 0.35){
          const q = a / 0.35;
          // Drop to one knee
          dBend(sk, 'lThigh', -1.0 * q);
          dBend(sk, 'lShin', 1.3 * q);
          dBend(sk, 'rThigh', -0.6 * q);
          dBend(sk, 'rShin', 0.8 * q);
          dX(sk, 'rUpperArm', 1.0 * q);
          dX(sk, 'lUpperArm', 0.6 * q);
          // Bat comes around low
          dZ(sk, 'rUpperArm', -0.6 * q);
        } else if (a < 0.65){
          const q = (a - 0.35) / 0.3;
          dBend(sk, 'lThigh', -1.0);
          dBend(sk, 'lShin', 1.3);
          dBend(sk, 'rThigh', -0.6);
          dBend(sk, 'rShin', 0.8);
          // Bat sweeps horizontally, pivot whole torso
          dY(sk, 'hips', -0.6 * q);
          dY(sk, 'chest', -0.5 * q);
          dX(sk, 'rUpperArm', 1.0 - 1.5 * q);
          dZ(sk, 'rUpperArm', -0.6 - 0.4 * q);
        } else {
          const q = (a - 0.65) / 0.35;
          dBend(sk, 'lThigh', -0.6 * (1 - q));
          dBend(sk, 'lShin', 0.8 * (1 - q));
          dBend(sk, 'rThigh', -0.3 * (1 - q));
          dBend(sk, 'rShin', 0.4 * (1 - q));
          dY(sk, 'chest', -0.5 - 0.2 * q);
        }
      }

      // ─── SHOT: DEFEND (defensive block) ───
      else if (shot === 'defend'){
        if (a < 0.4){
          const q = a / 0.4;
          dX(sk, 'rUpperArm', 0.5 * q);
          dX(sk, 'lUpperArm', 0.3 * q);
          dBend(sk, 'rForeArm', 0.6 * q);
          // Small forward press
          dX(sk, 'lThigh', -0.25 * q);
        } else {
          const q = (a - 0.4) / 0.6;
          // Bat stays down in front of pad
          dX(sk, 'rUpperArm', 0.5 - 0.4 * q);
          dX(sk, 'lUpperArm', 0.3 - 0.25 * q);
          dBend(sk, 'rForeArm', 0.6 - 0.2 * q);
          dX(sk, 'lThigh', -0.25);
        }
      }

      // ─── SHOT: LEAVE (shoulder arms, let ball pass) ───
      else if (shot === 'leave'){
        const q = Math.min(1, a * 2) * (1 - Math.max(0, (a - 0.75) / 0.25));
        // Lift bat out of the way
        dX(sk, 'rUpperArm', -0.6 * q);
        dX(sk, 'lUpperArm', -0.4 * q);
        // Lean torso back slightly
        dX(sk, 'spine', -0.15 * q);
        dY(sk, 'chest', 0.15 * q);
      }

      // ─── SHOT: DUCK (bouncer evasion) ───
      else if (shot === 'duck'){
        const arch = Math.sin(a * Math.PI);
        // Deep knee bend + spine arch
        dBend(sk, 'lThigh', -0.5 * arch);
        dBend(sk, 'rThigh', -0.5 * arch);
        dBend(sk, 'lShin', 0.7 * arch);
        dBend(sk, 'rShin', 0.7 * arch);
        dX(sk, 'spine', 0.5 * arch);
        // Head tucks down
        dX(sk, 'neck', 0.4 * arch);
        // Drop group position
        p.group.position.y = p.homeY - arch * 0.35;
        // Arms relax down
        dX(sk, 'rUpperArm', 0.2 * arch);
        dX(sk, 'lUpperArm', 0.2 * arch);
      }

      // ─── SHOT: HOOK (bouncer, hit behind square) ───
      else if (shot === 'hook'){
        if (a < 0.35){
          const q = a / 0.35;
          dX(sk, 'rUpperArm', 1.9 * q);
          dX(sk, 'lUpperArm', 1.1 * q);
          dBend(sk, 'rForeArm', 1.3 * q);
          dY(sk, 'chest', 0.45 * q);
        } else if (a < 0.7){
          const q = (a - 0.35) / 0.35;
          // High horizontal swing across the head
          dX(sk, 'rUpperArm', 1.9 - 2.8 * q);
          dX(sk, 'lUpperArm', 1.1 - 1.7 * q);
          dY(sk, 'chest', 0.45 - 1.5 * q);
          dY(sk, 'hips', -0.5 * q);
          dZ(sk, 'rUpperArm', -0.6 * q);
        } else {
          dY(sk, 'chest', -1.05 - 0.3 * ((a - 0.7) / 0.3));
          dX(sk, 'rUpperArm', -0.9);
        }
      }

      // Default fallback = coverDrive handled above
    }

    // ═════════════════════════════════════════════════════════════
    // 10. BOWLING ACTIONS — pace + spin
    // ═════════════════════════════════════════════════════════════
    function bowlingKinematics(p){
      const sk = p.skel;
      const a = p.phase;
      const type = p.action || 'pace';

      if (type === 'spin'){
        // ─── SPIN BOWLER: short run-up, side-on delivery ───
        if (a < 0.4){
          const q = a / 0.4;
          // Small steps
          dX(sk, 'lThigh', Math.sin(a * 6 * Math.PI) * 0.3 * q);
          dX(sk, 'rThigh', -Math.sin(a * 6 * Math.PI) * 0.3 * q);
          // Bowl-arm held high
          dX(sk, 'rUpperArm', -1.4 * q);
          dX(sk, 'lUpperArm', 0.9 * q);
        } else if (a < 0.75){
          const q = (a - 0.4) / 0.35;
          // Pivot + release (arm high over the shoulder)
          dY(sk, 'chest', 0.6 * q);
          dY(sk, 'hips', -0.3 * q);
          dX(sk, 'rUpperArm', -1.4 + 1.8 * q);
          dZ(sk, 'rUpperArm', -0.5 * q);
          dX(sk, 'lUpperArm', 0.9 - 0.8 * q);
        } else {
          const q = (a - 0.75) / 0.25;
          // Follow-through, arm drops
          dY(sk, 'chest', 0.6 - 0.2 * q);
          dX(sk, 'rUpperArm', 0.4 - 0.6 * q);
          dX(sk, 'lUpperArm', 0.1 - 0.3 * q);
        }
      } else {
        // ─── PACE BOWLER: full run-up + windmill ───
        if (a < 0.35){
          // Run-up (stride handled by locomotion)
          const q = a / 0.35;
          dX(sk, 'spine', 0.25 * q);
          dX(sk, 'rUpperArm', -1.5 * q);
          dX(sk, 'lUpperArm', 0.9 * q);
        } else if (a < 0.7){
          const q = (a - 0.35) / 0.35;
          // Delivery — arm windmills over
          dY(sk, 'chest', 0.5 * q);
          dY(sk, 'hips', -0.35 * q);
          dX(sk, 'rUpperArm', -1.5 + Math.PI * 2 * q);   // full windmill
          dBend(sk, 'rForeArm', 0.4);
          dX(sk, 'lUpperArm', 0.9 - 1.2 * q);
          dX(sk, 'lThigh', -0.5 * q);
          dBend(sk, 'lShin', 0.6 * q);
        } else {
          const q = (a - 0.7) / 0.3;
          dY(sk, 'chest', 0.5 - 0.3 * q);
          dX(sk, 'rUpperArm', (Math.PI * 2 - 1.5) - 0.6 * q);
          dX(sk, 'lUpperArm', -0.3 - 0.3 * q);
          dX(sk, 'lThigh', -0.5 + 0.3 * q);
        }
      }
    }

    // ═════════════════════════════════════════════════════════════
    // 11. FIELDING — throw, catch, dive
    // ═════════════════════════════════════════════════════════════
    function fieldingKinematics(p){
      const sk = p.skel;
      const a = p.phase;
      const type = p.action || 'throw';

      if (type === 'throw'){
        if (a < 0.35){
          const q = a / 0.35;
          // Windup — arm pulled back
          dX(sk, 'chest', -0.25 * q);
          dX(sk, 'rUpperArm', -1.7 * q);
          dBend(sk, 'rForeArm', -1.3 * q);
        } else if (a < 0.75){
          const q = (a - 0.35) / 0.4;
          // Snap forward
          dX(sk, 'chest', -0.25 + 0.5 * q);
          dX(sk, 'rUpperArm', -1.7 + 2.4 * q);
          dBend(sk, 'rForeArm', -1.3 + 1.6 * q);
          dY(sk, 'chest', 0.3 * q);
        } else {
          const q = (a - 0.75) / 0.25;
          dX(sk, 'rUpperArm', 0.7 - 0.3 * q);
          dX(sk, 'rForeArm', 0.3 - 0.15 * q);
        }
      }

      else if (type === 'catch'){
        const arch = Math.sin(a * Math.PI);
        // Both arms up to catch at chest height
        dX(sk, 'lUpperArm', -1.2 * arch);
        dX(sk, 'rUpperArm', -1.2 * arch);
        dBend(sk, 'lForeArm', 0.8 * arch);
        dBend(sk, 'rForeArm', 0.8 * arch);
        // Slight knee dip when ball arrives
        dBend(sk, 'lThigh', -0.3 * arch);
        dBend(sk, 'rThigh', -0.3 * arch);
        dBend(sk, 'lShin', 0.4 * arch);
        dBend(sk, 'rShin', 0.4 * arch);
      }

      else if (type === 'dive'){
        const arch = Math.sin(a * Math.PI * 0.8);
        // Body lowers + rolls to one side
        p.group.position.y = p.homeY - arch * 0.4;
        dY(sk, 'hips', 0.8 * arch);
        dZ(sk, 'spine', 0.5 * arch);
        // Arms extended toward the ball
        dX(sk, 'lUpperArm', -1.4 * arch);
        dX(sk, 'rUpperArm', -1.4 * arch);
        // Legs trail behind
        dX(sk, 'lThigh', 0.6 * arch);
        dX(sk, 'rThigh', 0.6 * arch);
      }
    }

    // ═════════════════════════════════════════════════════════════
    // 12. KEEPING — crouch, catch, dive, stumping
    // ═════════════════════════════════════════════════════════════
    function keepingKinematics(p){
      const sk = p.skel;
      const a = p.phase;
      const type = p.action || 'catch';

      // All keeper actions start from crouch
      dBend(sk, 'lThigh', -1.4); dBend(sk, 'lShin', 1.8);
      dBend(sk, 'rThigh', -1.4); dBend(sk, 'rShin', 1.8);

      if (type === 'catch'){
        const arch = Math.sin(a * Math.PI);
        // Gloves rise to catch
        dX(sk, 'lUpperArm', -1.0 * arch);
        dX(sk, 'rUpperArm', -1.0 * arch);
        dBend(sk, 'lForeArm', 0.9 * arch);
        dBend(sk, 'rForeArm', 0.9 * arch);
      }

      else if (type === 'diveLeft' || type === 'diveRight'){
        const side = type === 'diveLeft' ? -1 : 1;
        const arch = Math.sin(a * Math.PI);
        // Lateral dive
        p.group.position.x += side * arch * 0.6 * (a < 0.5 ? a * 2 : (1 - a) * 2);
        p.group.position.y = p.homeY - arch * 0.3;
        dZ(sk, 'spine', side * arch * 0.9);
        // Both arms extend toward ball side
        dX(sk, 'lUpperArm', -1.3 * arch);
        dX(sk, 'rUpperArm', -1.3 * arch);
        dZ(sk, 'lUpperArm', side * arch * 0.6);
        dZ(sk, 'rUpperArm', side * arch * 0.6);
      }

      else if (type === 'stumping'){
        if (a < 0.5){
          const q = a / 0.5;
          // Rise from crouch, arms reach forward
          dBend(sk, 'lThigh', -1.4 + 0.9 * q);
          dBend(sk, 'lShin', 1.8 - 1.0 * q);
          dBend(sk, 'rThigh', -1.4 + 0.9 * q);
          dBend(sk, 'rShin', 1.8 - 1.0 * q);
          dX(sk, 'rUpperArm', -0.8 * q);
          dX(sk, 'lUpperArm', -0.6 * q);
        } else {
          // Snap arms down toward stumps
          const q = (a - 0.5) / 0.5;
          dX(sk, 'rUpperArm', -0.8 + 1.4 * q);
          dX(sk, 'lUpperArm', -0.6 + 1.0 * q);
          // Crouch back down
          dBend(sk, 'lThigh', -0.5 - 0.9 * q);
          dBend(sk, 'lShin', 0.8 + 1.0 * q);
          dBend(sk, 'rThigh', -0.5 - 0.9 * q);
          dBend(sk, 'rShin', 0.8 + 1.0 * q);
        }
      }
    }

    // ═════════════════════════════════════════════════════════════
    // 13. UMPIRE SIGNALS
    // ═════════════════════════════════════════════════════════════
    function signalKinematics(p){
      const sk = p.skel;
      const a = p.phase;
      const sig = p.action || 'out';

      if (sig === 'out'){
        const up = Math.min(1, a * 4);
        const down = Math.max(0, 1 - (a - 0.65) / 0.35);
        const q = Math.min(up, down);
        // Right arm straight up, index extended
        dX(sk, 'rUpperArm', -Math.PI * q);
        dBend(sk, 'rForeArm', -0.1 * q);
        // Head tips up
        dX(sk, 'neck', -0.15 * q);
      }

      else if (sig === 'six'){
        const arc = Math.sin(a * Math.PI * 0.9);
        // Both arms raised above head
        dX(sk, 'lUpperArm', -Math.PI * arc);
        dX(sk, 'rUpperArm', -Math.PI * arc);
      }

      else if (sig === 'four'){
        // Right arm sweeps side to side across the chest
        dX(sk, 'rUpperArm', -0.6);
        dY(sk, 'rUpperArm', Math.sin(a * Math.PI * 6) * 0.6);
        dZ(sk, 'rUpperArm', -0.3);
      }

      else if (sig === 'wide'){
        const q = Math.min(1, a * 3);
        dZ(sk, 'lUpperArm', -Math.PI * 0.5 * q);
        dZ(sk, 'rUpperArm',  Math.PI * 0.5 * q);
      }

      else if (sig === 'noball'){
        const q = Math.min(1, a * 3);
        dZ(sk, 'rUpperArm', -Math.PI * 0.5 * q);
      }

      else if (sig === 'bye' || sig === 'legbye'){
        // Tap the leg with one hand
        dX(sk, 'rUpperArm', 0.9);
        dBend(sk, 'rForeArm', 1.4);
        dY(sk, 'chest', Math.sin(a * Math.PI * 3) * 0.15);
      }
    }

    // ═════════════════════════════════════════════════════════════
    // 14. AMBIENT — helmet, shine, celebrate, disappointed, argue
    // ═════════════════════════════════════════════════════════════
    function ambientKinematics(p, t){
      const sk = p.skel;
      const a = p.phase;
      const act = p.action || 'shine';

      if (act === 'helmet'){
        const q = Math.min(1, a * 2) * (1 - Math.max(0, (a - 0.7) / 0.3));
        // Left hand reaches up to helmet
        dX(sk, 'lUpperArm', -1.5 * q);
        dBend(sk, 'lForeArm', 1.8 * q);
      }

      else if (act === 'shine'){
        // Right hand rubs the ball on the thigh rapidly
        dX(sk, 'rUpperArm', 0.9);
        dBend(sk, 'rForeArm', 1.3);
        dBend(sk, 'rShin', Math.max(0, Math.sin(t * 15)) * 0.15);
        dY(sk, 'rHand', Math.sin(t * 12) * 0.4);
      }

      else if (act === 'celebrate'){
        // Jump and pump arms
        const jump = Math.max(0, Math.sin(t * Math.PI * 2));
        p.group.position.y = p.homeY + jump * 0.35;
        dX(sk, 'lUpperArm', -Math.PI * (0.6 + jump * 0.3));
        dX(sk, 'rUpperArm', -Math.PI * (0.6 + jump * 0.3));
        dBend(sk, 'lForeArm', 0.4);
        dBend(sk, 'rForeArm', 0.4);
      }

      else if (act === 'disappointed'){
        // Head down, shoulders slumped
        dX(sk, 'neck', 0.55);
        dX(sk, 'spine', 0.35);
        dX(sk, 'lUpperArm', 0.1);
        dX(sk, 'rUpperArm', 0.1);
        dBend(sk, 'lForeArm', 0.4);
        dBend(sk, 'rForeArm', 0.4);
      }

      else if (act === 'argue'){
        // Gesture with both hands toward umpire
        const wave = Math.sin(t * 6) * 0.5;
        dX(sk, 'lUpperArm', -0.8);
        dX(sk, 'rUpperArm', -0.8);
        dBend(sk, 'lForeArm', 0.6 + wave * 0.3);
        dBend(sk, 'rForeArm', 0.6 - wave * 0.3);
        dY(sk, 'chest', Math.sin(t * 3) * 0.15);
      }
    }

    // ═════════════════════════════════════════════════════════════
    // 15. MAIN TICKER
    // ═════════════════════════════════════════════════════════════
    let globalT = 0, lastFrame = performance.now(), frameCount = 0;

    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      globalT += dt;
      frameCount++;

      const doBones = (frameCount % BONE_EVERY === 0);

      Object.keys(players).forEach(role => {
        const p = players[role];

        // Advance phase for one-shot actions
        if (!p.loop && p.phase < 1){
          p.phase = Math.min(1, p.phase + dt * p.phaseSpeed);
          if (p.phase >= 1){
            setTimeout(() => {
              if (p.phase >= 1){ p.mode = 'idle'; p.action = null; p.phase = 0; }
            }, 250);
          }
        } else if (p.loop){
          p.phase = (p.phase + dt * p.phaseSpeed) % 1;
        }

        if (!doBones) return;

        // Reset bones to rest, then apply the current mode
        resetToRest(p);

        // Priority: locomotion overrides idle (but not explicit actions)
        const moving = updateLocomotion(p, dt);

        if (!moving){
          if (p.mode === 'idle')          idleStance(p, globalT);
          else if (p.mode === 'batting')  battingKinematics(p);
          else if (p.mode === 'bowling')  bowlingKinematics(p);
          else if (p.mode === 'fielding') fieldingKinematics(p);
          else if (p.mode === 'keeping')  keepingKinematics(p);
          else if (p.mode === 'signal')   signalKinematics(p);
          else if (p.mode === 'ambient')  ambientKinematics(p, globalT);
        } else {
          // Even while moving, apply non-locomotion actions
          if (p.mode === 'batting')  battingKinematics(p);
          else if (p.mode === 'bowling')  bowlingKinematics(p);
          else if (p.mode === 'fielding') fieldingKinematics(p);
          else if (p.mode === 'keeping')  keepingKinematics(p);
          else if (p.mode === 'signal')   signalKinematics(p);
        }

        lockAccessories(p);
      });

      // Bowler ball visibility
      const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
      if (bowlerBall && players['Bowler']){
        const bp = players['Bowler'];
        bowlerBall.visible = (bp.mode === 'idle' || (bp.mode === 'bowling' && bp.phase < 0.6));
      }
    }
    requestAnimationFrame(tick);

    // ═════════════════════════════════════════════════════════════
    // 16. PUBLIC API
    // ═════════════════════════════════════════════════════════════
    const ACTION_MAP = {
      // Batting strokes
      'coverDrive':   { mode: 'batting',  phaseSpeed: 0.45, loop: false },
      'straightDrive':{ mode: 'batting',  phaseSpeed: 0.45, loop: false },
      'pull':         { mode: 'batting',  phaseSpeed: 0.50, loop: false },
      'hook':         { mode: 'batting',  phaseSpeed: 0.50, loop: false },
      'cut':          { mode: 'batting',  phaseSpeed: 0.50, loop: false },
      'sweep':        { mode: 'batting',  phaseSpeed: 0.45, loop: false },
      'defend':       { mode: 'batting',  phaseSpeed: 0.55, loop: false },
      'leave':        { mode: 'batting',  phaseSpeed: 0.60, loop: false },
      'duck':         { mode: 'batting',  phaseSpeed: 0.65, loop: false },
      // Bowling
      'pace':         { mode: 'bowling',  phaseSpeed: 0.30, loop: false },
      'spin':         { mode: 'bowling',  phaseSpeed: 0.40, loop: false },
      // Fielding
      'throw':        { mode: 'fielding', phaseSpeed: 0.70, loop: false },
      'catch':        { mode: 'fielding', phaseSpeed: 0.85, loop: false },
      'dive':         { mode: 'fielding', phaseSpeed: 0.60, loop: false },
      // Keeping
      'keeperCatch':  { mode: 'keeping',  phaseSpeed: 0.75, loop: false },
      'keeperDiveL':  { mode: 'keeping',  phaseSpeed: 0.55, loop: false },
      'keeperDiveR':  { mode: 'keeping',  phaseSpeed: 0.55, loop: false },
      'stumping':     { mode: 'keeping',  phaseSpeed: 0.70, loop: false },
      // Umpire
      'out':          { mode: 'signal',   phaseSpeed: 0.75, loop: false },
      'six':          { mode: 'signal',   phaseSpeed: 0.85, loop: false },
      'four':         { mode: 'signal',   phaseSpeed: 1.60, loop: false },
      'wide':         { mode: 'signal',   phaseSpeed: 0.90, loop: false },
      'noball':       { mode: 'signal',   phaseSpeed: 0.90, loop: false },
      'bye':          { mode: 'signal',   phaseSpeed: 1.00, loop: false },
      'legbye':       { mode: 'signal',   phaseSpeed: 1.00, loop: false },
      // Ambient
      'helmet':       { mode: 'ambient',  phaseSpeed: 0.80, loop: false },
      'shine':        { mode: 'ambient',  phaseSpeed: 1.00, loop: true  },
      'celebrate':    { mode: 'ambient',  phaseSpeed: 1.00, loop: true  },
      'disappointed': { mode: 'ambient',  phaseSpeed: 1.00, loop: true  },
      'argue':        { mode: 'ambient',  phaseSpeed: 1.00, loop: true  }
    };

    // Map API action name → internal action name for the kinematic functions
    const ACTION_ALIAS = {
      'keeperCatch': 'catch',
      'keeperDiveL': 'diveLeft',
      'keeperDiveR': 'diveRight',
      'dive':        'dive'
    };

    function play(role, action, opts){
      const p = players[role];
      if (!p){
        console.warn('[PlayerControl] no player', role);
        return false;
      }
      const def = ACTION_MAP[action];
      if (!def){
        console.warn('[PlayerControl] unknown action', action);
        return false;
      }

      p.mode = def.mode;
      // Translate alias for internal kinematics
      p.action = ACTION_ALIAS[action] || action;
      p.phaseSpeed = def.phaseSpeed;
      p.loop = def.loop;
      p.phase = 0;

      console.log('[PlayerControl] ' + role + ' → ' + action);
      if (window.showToast) window.showToast(role + ' → ' + action);
      return true;
    }

    function stopAll(){
      Object.keys(players).forEach(r => {
        const p = players[r];
        p.mode = 'idle'; p.action = null; p.phase = 0;
      });
    }

    function resetAll(){
      Object.keys(players).forEach(r => {
        const p = players[r];
        p.mode = 'idle'; p.action = null; p.phase = 0;
        p.group.position.set(p.stance ? p.stance.x : p.group.position.x, p.homeY, p.stance ? p.stance.z : p.group.position.z);
        p.group.rotation.y = p.stance ? p.stance.rotY : p.group.rotation.y;
      });
    }

    window.PlayerControl = {
      players,
      roles: Object.keys(players),
      play, stopAll, resetAll,
      // Diagnostics
      status: function(){
        const out = {};
        Object.keys(players).forEach(r => {
          const p = players[r];
          out[r] = {
            mode: p.mode, action: p.action,
            phase: +p.phase.toFixed(2),
            speed: +p.locoSpeed.toFixed(2)
          };
        });
        console.table(out);
        return out;
      }
    };

    console.log('[PlayerControl] ✅ v18 ready — ' + Object.keys(players).length + ' players');
    console.log('[PlayerControl] Strokes: coverDrive · straightDrive · pull · hook · cut · sweep · defend · leave · duck');
    console.log('[PlayerControl] Bowling: pace · spin');
    console.log('[PlayerControl] Fielding: throw · catch · dive');
    console.log('[PlayerControl] Keeping: keeperCatch · keeperDiveL · keeperDiveR · stumping');
    console.log('[PlayerControl] Signals: out · six · four · wide · noball · bye · legbye');
    console.log('[PlayerControl] Ambient: helmet · shine · celebrate · disappointed · argue');
  }

})();
