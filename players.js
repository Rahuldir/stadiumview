/* ══════════════════════════════════════════════════════════════
   StadiumView — Full Procedural Kinematics & Body Part Mapping
   • Arms-down via world-space bone pointing (rig-agnostic)
   • All 9 action tables:
       1. Head & neck articulation
       2. Torso & core dynamics
       3. Arm articulation (running)
       4. Leg & foot articulation (running)
       5. Cricket actions: bowling, batting, catching
       6. Batting footwork: drive, punch, duck, leave
       7. Fielding: throw windup, keeper dive, stumping
       8. Umpire signals: out, six, four, wide, no-ball, dead ball
       9. Ambient micro-animations: helmet, shine, stretch,
          disappointment, celebration
   • Mobile: bones updated every 3rd frame
   • Public API: PlayerControl.play(role, action)
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — full kinematics v3.0', 'color:#00e676;font-weight:bold');

  const IS_MOBILE_PLAYERS = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const BONE_EVERY = IS_MOBILE_PLAYERS ? 3 : 1;

  let attempts = 0;
  const MAX_ATTEMPTS = 100;

  const wait = setInterval(function(){
    attempts++;
    const found = collectPlayers();
    if (found && Object.keys(found.players).length >= 5){
      clearInterval(wait);
      console.log('[players.js] found ' + Object.keys(found.players).length + ' players via "' + found.source + '"');
      boot(found.players);
      return;
    }
    if (attempts % 10 === 0) console.log('[players.js] waiting… attempt ' + attempts);
    if (attempts >= MAX_ATTEMPTS){
      clearInterval(wait);
      console.warn('[players.js] ❌ gave up after ' + MAX_ATTEMPTS + ' attempts');
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
        const role = o.userData.role || o.name.replace(/^PLAYER_/, '').replace(/_/g, ' ');
        out[role] = o;
      });
      if (Object.keys(out).length >= 5) return { players: out, source: 'scene traversal' };
    }
    return null;
  }

  // ═════════════════════════════════════════════════════════════
  //  SKELETON DISCOVERY
  // ═════════════════════════════════════════════════════════════
  const BONE_SLOTS = [
    'hips','spine','chest','neck','head',
    'lShoulder','lUpperArm','lForeArm','lHand',
    'rShoulder','rUpperArm','rForeArm','rHand',
    'lThigh','lShin','lFoot',
    'rThigh','rShin','rFoot'
  ];

  function classifyBone(bone){
    const n = (bone.name || '').toLowerCase();
    if (!n) return null;

    const L = /left|_l$|\.l$|_l_|l_arm|l_leg|l_hand|l_foot|l_thigh|l_shin|l_shoulder|l_upper|l_fore/.test(n);
    const R = /right|_r$|\.r$|_r_|r_arm|r_leg|r_hand|r_foot|r_thigh|r_shin|r_shoulder|r_upper|r_fore/.test(n);

    if (/hips$|hip$|_hips|pelvis/.test(n) && !/left|right|_l|_r/.test(n)) return 'hips';
    if (/spine2|spine_02|chest|spine1$/.test(n)) return 'chest';
    if (/spine/.test(n)) return 'spine';
    if (/neck/.test(n)) return 'neck';
    // Relaxed head detection
    if (/head/.test(n) && !/headwear|forehead|overhead/.test(n) && !/shoulder/.test(n)) return 'head';

    if (/shoulder|clavicle/.test(n)) return L ? 'lShoulder' : R ? 'rShoulder' : null;
    if (/upperarm|upper_arm/.test(n)) return L ? 'lUpperArm' : R ? 'rUpperArm' : null;
    if (/arm/.test(n) && !/fore|lower|hand|finger|thumb/.test(n)){
      if (/shoulder/.test(n)) return null;
      return L ? 'lUpperArm' : R ? 'rUpperArm' : null;
    }
    if (/forearm|lowerarm|lower_arm|elbow/.test(n)) return L ? 'lForeArm' : R ? 'rForeArm' : null;
    if (/hand|wrist/.test(n) && !/finger|thumb|index|pinky|middle|ring/.test(n)){
      return L ? 'lHand' : R ? 'rHand' : null;
    }
    if (/thigh|upperleg|upleg/.test(n) && !/lower|knee|calf|shin/.test(n)){
      return L ? 'lThigh' : R ? 'rThigh' : null;
    }
    if (/^leg$|leg_l|leg_r|leg\.l|leg\.r|_leg$/.test(n) && !/lower|calf|shin/.test(n)){
      return L ? 'lThigh' : R ? 'rThigh' : null;
    }
    if (/knee|calf|shin|lowerleg|lower_leg/.test(n)){
      return L ? 'lShin' : R ? 'rShin' : null;
    }
    if (/foot|ankle/.test(n) && !/toe/.test(n)){
      return L ? 'lFoot' : R ? 'rFoot' : null;
    }
    return null;
  }

  function inferSide(bone, hipsWorld){
    const p = new THREE.Vector3();
    bone.getWorldPosition(p);
    return (p.x - hipsWorld.x) >= 0 ? 'r' : 'l';
  }

  function buildSkeleton(root){
    const bones = [];
    root.traverse(function(c){ if (c.isBone || c.type === 'Bone') bones.push(c); });
    if (bones.length === 0){
      root.traverse(function(c){
        if (c.isSkinnedMesh && c.skeleton && c.skeleton.bones){
          c.skeleton.bones.forEach(function(b){
            if (bones.indexOf(b) < 0) bones.push(b);
          });
        }
      });
    }

    const slots = {};
    BONE_SLOTS.forEach(function(s){ slots[s] = null; });

    bones.forEach(function(b){
      const slot = classifyBone(b);
      if (slot && !slots[slot]) slots[slot] = b;
    });

    function parentOf(b){
      return b && b.parent && (b.parent.isBone || b.parent.type === 'Bone') ? b.parent : null;
    }
    function childOf(b){
      if (!b) return null;
      for (let i = 0; i < b.children.length; i++){
        const c = b.children[i];
        if (c.isBone || c.type === 'Bone') return c;
      }
      return null;
    }

    // Hips fallback
    if (!slots.hips && bones.length){
      let best = null, bestDepth = -1;
      bones.forEach(function(b){
        let count = 0, d = 0, p = b;
        while (parentOf(p)){ d++; p = parentOf(p); }
        b.children.forEach(function(c){ if (c.isBone || c.type === 'Bone') count++; });
        if (count >= 3 && d > bestDepth){ bestDepth = d; best = b; }
      });
      slots.hips = best || bones[0];
    }

    // Spine / chest
    if (!slots.spine && slots.hips){
      slots.hips.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.spine) slots.spine = c;
      });
    }
    if (!slots.chest && slots.spine){
      slots.spine.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.chest && !/shoulder|arm|clav/i.test(c.name || '')){
          slots.chest = c;
        }
      });
      if (!slots.chest) slots.chest = slots.spine;
    }

    // Neck / head
    if (!slots.neck && slots.chest){
      slots.chest.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.neck && /neck/i.test(c.name || '')) slots.neck = c;
      });
    }
    if (!slots.head){
      for (let i = 0; i < bones.length; i++){
        if (/head/i.test(bones[i].name || '')){ slots.head = bones[i]; break; }
      }
    }
    if (!slots.head && slots.neck){
      slots.neck.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.head) slots.head = c;
      });
    }
    if (!slots.head && slots.neck) slots.head = childOf(slots.neck);

    // Arm chain recovery
    if (!slots.lUpperArm && slots.lForeArm) slots.lUpperArm = parentOf(slots.lForeArm);
    if (!slots.rUpperArm && slots.rForeArm) slots.rUpperArm = parentOf(slots.rForeArm);
    if (!slots.lForeArm && slots.lHand)      slots.lForeArm = parentOf(slots.lHand);
    if (!slots.rForeArm && slots.rHand)      slots.rForeArm = parentOf(slots.rHand);
    if (!slots.lForeArm && slots.lUpperArm)  slots.lForeArm = childOf(slots.lUpperArm);
    if (!slots.rForeArm && slots.rUpperArm)  slots.rForeArm = childOf(slots.rUpperArm);
    if (!slots.lHand && slots.lForeArm)      slots.lHand = childOf(slots.lForeArm);
    if (!slots.rHand && slots.rForeArm)      slots.rHand = childOf(slots.rForeArm);

    // Leg chain recovery
    if (!slots.lShin && slots.lFoot)   slots.lShin = parentOf(slots.lFoot);
    if (!slots.rShin && slots.rFoot)   slots.rShin = parentOf(slots.rFoot);
    if (!slots.lShin && slots.lThigh)  slots.lShin = childOf(slots.lThigh);
    if (!slots.rShin && slots.rThigh)  slots.rShin = childOf(slots.rThigh);
    if (!slots.lFoot && slots.lShin)   slots.lFoot = childOf(slots.lShin);
    if (!slots.rFoot && slots.rShin)   slots.rFoot = childOf(slots.rShin);

    // Hips children → thighs
    if (slots.hips){
      const hipsKids = slots.hips.children.filter(function(c){
        return (c.isBone || c.type === 'Bone') && !/spine|chest|neck/i.test(c.name || '');
      });
      if (!slots.lThigh || !slots.rThigh){
        const hipsWorld = new THREE.Vector3();
        slots.hips.getWorldPosition(hipsWorld);
        hipsKids.forEach(function(k){
          const side = inferSide(k, hipsWorld);
          if (side === 'l' && !slots.lThigh) slots.lThigh = k;
          if (side === 'r' && !slots.rThigh) slots.rThigh = k;
        });
      }
    }

    const rest = {};
    BONE_SLOTS.forEach(function(slot){
      if (slots[slot]) rest[slot] = slots[slot].quaternion.clone();
    });

    return { bones, slots, rest };
  }

  // ═════════════════════════════════════════════════════════════
  //  ARMS-DOWN — world-space bone pointing (rig-agnostic)
  // ═════════════════════════════════════════════════════════════
  const _v1 = new THREE.Vector3();
  const _v2 = new THREE.Vector3();
  const _targetDown = new THREE.Vector3(0, -1, 0);
  const _parentQ = new THREE.Quaternion();
  const _invParentQ = new THREE.Quaternion();
  const _worldRot = new THREE.Quaternion();
  const _newLocalQ = new THREE.Quaternion();

  function pointBoneDown(bone, targetDir){
    if (!bone) return false;
    let child = null;
    for (let i = 0; i < bone.children.length; i++){
      const c = bone.children[i];
      if (c.isBone || c.type === 'Bone'){ child = c; break; }
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

    _newLocalQ.copy(_invParentQ)
      .multiply(_worldRot)
      .multiply(_parentQ)
      .multiply(bone.quaternion);

    bone.quaternion.copy(_newLocalQ);
    bone.updateMatrixWorld(true);
    return true;
  }

  function bakeArmsDown(skel){
    let applied = 0;
    if (skel.slots.lUpperArm && pointBoneDown(skel.slots.lUpperArm, _targetDown)) applied++;
    if (skel.slots.rUpperArm && pointBoneDown(skel.slots.rUpperArm, _targetDown)) applied++;

    // Slight natural tilt
    ['lUpperArm','rUpperArm'].forEach(function(slot){
      const b = skel.slots[slot];
      if (!b) return;
      const sign = slot.charAt(0) === 'l' ? 1 : -1;
      const tilt = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.12, 0, sign * 0.08, 'XYZ')
      );
      b.quaternion.multiply(tilt);
      b.updateMatrixWorld(true);
    });

    // Save as new rest
    BONE_SLOTS.forEach(function(s){
      if (skel.slots[s]) skel.rest[s] = skel.slots[s].quaternion.clone();
    });

    return applied;
  }

  // ═════════════════════════════════════════════════════════════
  //  RIG CALIBRATION (leg swing axis etc.)
  // ═════════════════════════════════════════════════════════════
  function calibrateRig(skel){
    const X = new THREE.Vector3(1,0,0), Y = new THREE.Vector3(0,1,0), Z = new THREE.Vector3(0,0,1);

    const legResults = [X, Y, Z].map(function(axis){
      let bestZ = 0, sign = 1;
      [0.5, -0.5].forEach(function(s){
        const b = skel.slots.lThigh;
        if (!b || !skel.rest.lThigh) return;
        const rest = skel.rest.lThigh.clone();
        const test = new THREE.Quaternion().setFromAxisAngle(axis, s);
        b.quaternion.copy(rest).multiply(test);
        b.updateMatrixWorld(true);
        const pw = new THREE.Vector3();
        if (skel.slots.lFoot) skel.slots.lFoot.getWorldPosition(pw);
        else if (skel.slots.lShin) skel.slots.lShin.getWorldPosition(pw);
        if (Math.abs(pw.z) > Math.abs(bestZ)){ bestZ = pw.z; sign = s > 0 ? 1 : -1; }
        b.quaternion.copy(rest);
        b.updateMatrixWorld(true);
      });
      return { axis, bestZ, sign };
    });
    legResults.sort(function(a, b){ return Math.abs(b.bestZ) - Math.abs(a.bestZ); });
    skel.legSwingAxis = legResults[0].axis;
    skel.legSwingSign = legResults[0].sign;
    skel.kneeAxis = X;
    skel.kneeSign = -1;
  }

  // ═════════════════════════════════════════════════════════════
  //  PLAYER WRAPPER
  // ═════════════════════════════════════════════════════════════
  function makePlayer(role, group){
    const skel = buildSkeleton(group);
    if (skel.bones.length === 0){
      console.warn('[PlayerControl] ' + role + ': no bones');
      return null;
    }
    const armsBaked = bakeArmsDown(skel);
    calibrateRig(skel);
    return {
      role, group, skel,
      armsBaked,
      mode: 'idle',
      action: null,
      phase: 0,
      phaseSpeed: 1,
      loop: true,
      params: {},
      home: {
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
        rotY: group.rotation.y
      }
    };
  }

  // ═════════════════════════════════════════════════════════════
  //  BOOT
  // ═════════════════════════════════════════════════════════════
  function boot(rawPlayers){
    const roles = Object.keys(rawPlayers);
    console.log('[PlayerControl] roles:', roles.join(', '));

    const players = {};
    let totalBones = 0;

    roles.forEach(function(r){
      const p = makePlayer(r, rawPlayers[r]);
      if (!p) return;
      players[r] = p;
      totalBones += p.skel.bones.length;
      const matched = BONE_SLOTS.filter(function(s){ return p.skel.slots[s]; }).length;
      console.log('[PlayerControl] ' + r + ' · ' + p.skel.bones.length +
                  ' bones · ' + matched + '/' + BONE_SLOTS.length +
                  ' slots · arms-down=' + p.armsBaked);
    });

    if (Object.keys(players).length === 0){
      console.warn('[PlayerControl] no valid players');
      return;
    }
    console.log('[PlayerControl] total ' + totalBones + ' bones across ' +
                Object.keys(players).length + ' players');

    const firstKey = Object.keys(players)[0];
    const firstSkel = players[firstKey].skel;
    const missing = BONE_SLOTS.filter(function(s){ return !firstSkel.slots[s]; });
    if (missing.length) console.warn('[PlayerControl] missing slots in ' + firstKey + ': ' + missing.join(', '));

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION TABLES
    // ═══════════════════════════════════════════════════════════
    const X = new THREE.Vector3(1,0,0);
    const Y = new THREE.Vector3(0,1,0);
    const Z = new THREE.Vector3(0,0,1);

    const _qa = new THREE.Quaternion();
    const _qb = new THREE.Quaternion();

    function applyDeltaX(skel, slot, angle, restQ){
      const b = skel.slots[slot];
      if (!b) return;
      const base = restQ || skel.rest[slot];
      if (!base) return;
      _qa.setFromAxisAngle(X, angle);
      _qb.copy(base).multiply(_qa);
      b.quaternion.copy(_qb);
    }
    function applyDeltaY(skel, slot, angle, restQ){
      const b = skel.slots[slot];
      if (!b) return;
      const base = restQ || skel.rest[slot];
      if (!base) return;
      _qa.setFromAxisAngle(Y, angle);
      _qb.copy(base).multiply(_qa);
      b.quaternion.copy(_qb);
    }
    function applyDeltaZ(skel, slot, angle, restQ){
      const b = skel.slots[slot];
      if (!b) return;
      const base = restQ || skel.rest[slot];
      if (!base) return;
      _qa.setFromAxisAngle(Z, angle);
      _qb.copy(base).multiply(_qa);
      b.quaternion.copy(_qb);
    }

    function resetToRest(p){
      BONE_SLOTS.forEach(function(slot){
        const b = p.skel.slots[slot];
        if (b && p.skel.rest[slot]) b.quaternion.copy(p.skel.rest[slot]);
      });
      p.group.position.y = p.home.y;
    }

    // 1. HEAD & NECK
    function headNeck(p, t, ball){
      const sk = p.skel;
      if (p.mode === 'idle'){
        applyDeltaX(sk, 'neck', Math.sin(t * 1.5) * 0.05);
        applyDeltaY(sk, 'head', Math.sin(t * 0.5) * 0.15, sk.rest.head);
      } else if (p.mode === 'running' || p.mode === 'walk'){
        applyDeltaZ(sk, 'neck', Math.sin(p.phase * 12) * 0.04);
      }
      if (ball && (p.mode === 'batting' || p.mode === 'keeping' || p.mode === 'bowling')){
        const hp = new THREE.Vector3();
        if (sk.slots.head) sk.slots.head.getWorldPosition(hp);
        const dx = ball.x - hp.x, dy = ball.y - hp.y, dz = ball.z - hp.z;
        const yaw   = Math.atan2(dx, dz);
        const dist  = Math.hypot(dx, dz);
        const pitch = Math.atan2(dy, dist);
        applyDeltaY(sk, 'neck', Math.max(-0.7, Math.min(0.7, yaw)));
        applyDeltaX(sk, 'head', Math.max(-0.5, Math.min(0.5, pitch)));
      }
    }

    // 2. TORSO & CORE
    function torso(p, t){
      const sk = p.skel;
      if (p.mode === 'idle'){
        applyDeltaX(sk, 'chest', Math.sin(t * 2) * 0.02);
      } else if (p.mode === 'running' || p.mode === 'walk'){
        const rc = p.phase * 12;
        applyDeltaX(sk, 'spine', 0.25 + Math.sin(rc) * 0.05);
        applyDeltaY(sk, 'spine', -Math.sin(rc) * 0.15, sk.rest.spine);
        applyDeltaZ(sk, 'spine', Math.sin(p.phase * 6) * 0.08);
        p.group.position.y = p.home.y + Math.abs(Math.sin(rc)) * 0.08;
      } else if (p.mode === 'bowling'){
        applyDeltaZ(sk, 'spine', Math.sin(p.phase * Math.PI) * 0.4);
      } else if (p.mode === 'batting'){
        applyDeltaY(sk, 'spine', -0.5 + p.phase * 1.2);
      } else if (p.mode === 'throw'){
        applyDeltaX(sk, 'spine', Math.pow(p.phase, 2) * 0.5);
      } else if (p.mode === 'disappointed'){
        applyDeltaX(sk, 'spine', 0.4);
        applyDeltaX(sk, 'neck', 0.5);
      }
    }

    // 3-4. RUN CYCLE
    function runCycle(p){
      const sk = p.skel;
      const rc = p.phase * 12;

      applyDeltaX(sk, 'lUpperArm', -Math.sin(rc) * 0.8);
      applyDeltaX(sk, 'rUpperArm',  Math.sin(rc) * 0.8);
      applyDeltaX(sk, 'lForeArm', -Math.max(0.1, Math.sin(rc)) * 1.2, sk.rest.lForeArm);
      applyDeltaX(sk, 'rForeArm', -Math.max(0.1, -Math.sin(rc)) * 1.2, sk.rest.rForeArm);
      applyDeltaZ(sk, 'lHand',  Math.sin(rc) * 0.1);
      applyDeltaZ(sk, 'rHand', -Math.sin(rc) * 0.1);

      applyDeltaX(sk, 'lThigh',  Math.sin(rc) * 0.6);
      applyDeltaX(sk, 'rThigh', -Math.sin(rc) * 0.6);
      applyDeltaX(sk, 'lShin', Math.max(0,  Math.sin(rc + 0.5)) * 1.1, sk.rest.lShin);
      applyDeltaX(sk, 'rShin', Math.max(0, -Math.sin(rc + 0.5)) * 1.1, sk.rest.rShin);
      applyDeltaX(sk, 'lFoot',  Math.cos(rc) * 0.2, sk.rest.lFoot);
      applyDeltaX(sk, 'rFoot', -Math.cos(rc) * 0.2, sk.rest.rFoot);
    }

    // 5. BOWLING
    function bowlingAction(p){
      const sk = p.skel;
      applyDeltaX(sk, 'rUpperArm', p.phase * Math.PI * 2);
      applyDeltaX(sk, 'lUpperArm', -Math.sin(p.phase * Math.PI) * 1.5);
    }

    // 5. CATCHING
    function catchingAction(p, ball){
      if (!ball) return;
      const sk = p.skel;
      const hp = new THREE.Vector3();
      p.group.getWorldPosition(hp);
      const dist = hp.distanceTo(ball);
      applyDeltaX(sk, 'lUpperArm', -Math.PI * 0.55);
      applyDeltaX(sk, 'rUpperArm', -Math.PI * 0.55);
      applyDeltaZ(sk, 'lUpperArm', -0.3);
      applyDeltaZ(sk, 'rUpperArm',  0.3);
      const bend = Math.min(1.5, 1 / Math.max(0.2, dist));
      applyDeltaX(sk, 'lForeArm', -bend, sk.rest.lForeArm);
      applyDeltaX(sk, 'rForeArm', -bend, sk.rest.rForeArm);
    }

    // 6. BATTING FOOTWORK
    function battingFootwork(p){
      const sk = p.skel;
      const a = p.phase;
      if (p.action === 'frontDrive'){
        applyDeltaX(sk, 'lThigh',  Math.sin(a * Math.PI) * 0.6);
        applyDeltaX(sk, 'rShin',   a * 0.4, sk.rest.rShin);
      } else if (p.action === 'backPunch'){
        applyDeltaX(sk, 'rThigh', -Math.sin(a * Math.PI) * 0.3);
        p.group.position.y = p.home.y + a * 0.1;
      } else if (p.action === 'duck'){
        p.group.position.y = p.home.y - Math.sin(a * Math.PI) * 0.6;
        applyDeltaX(sk, 'neck', Math.sin(a * Math.PI) * 0.5);
      } else if (p.action === 'leave'){
        const lift = Math.min(a * 2, 1) * (Math.PI / 1.5);
        applyDeltaZ(sk, 'lUpperArm', -lift);
        applyDeltaZ(sk, 'rUpperArm',  lift);
      }
    }

    function battingSwing(p){
      const sk = p.skel;
      const a = p.phase;
      applyDeltaZ(sk, 'lUpperArm', Math.sin(a * Math.PI) * 0.8);
      if (a > 0.6){
        applyDeltaY(sk, 'lHand', Math.PI);
        applyDeltaY(sk, 'rHand', Math.PI);
      }
    }

    // 7. FIELDING
    function throwAction(p){
      const sk = p.skel;
      const a = p.phase;
      applyDeltaX(sk, 'rUpperArm', -Math.cos(a * Math.PI) * 1.5);
      const elbow = a < 0.5 ? 1.5 : Math.max(0, 1.5 - a * 3);
      applyDeltaX(sk, 'rForeArm', elbow, sk.rest.rForeArm);
    }

    function keeperDive(p){
      const sk = p.skel;
      const a = p.phase;
      const dir = p.params.diveDirection || 1;
      p.group.position.x += dir * a * 0.6;
      p.group.position.y = p.home.y + Math.sin(a * Math.PI) * 0.4;
      applyDeltaZ(sk, 'spine', dir * a * (Math.PI / 2));
    }

    function stumping(p){
      const sk = p.skel;
      applyDeltaY(sk, 'rUpperArm', p.phase * (Math.PI / 1.5));
    }

    // 8. UMPIRE SIGNALS
    function umpireSignal(p){
      const sk = p.skel;
      const s = p.phase;
      if (p.action === 'out'){
        applyDeltaX(sk, 'rUpperArm', -Math.min(s * 2.5, 1) * Math.PI);
      } else if (p.action === 'six'){
        const a = Math.sin(s * (Math.PI / 2)) * Math.PI;
        applyDeltaX(sk, 'lUpperArm', -a);
        applyDeltaX(sk, 'rUpperArm', -a);
      } else if (p.action === 'four'){
        applyDeltaY(sk, 'rUpperArm', Math.sin(s * Math.PI * 6) * 0.5);
      } else if (p.action === 'wide'){
        applyDeltaZ(sk, 'lUpperArm', -Math.PI/2);
        applyDeltaZ(sk, 'rUpperArm',  Math.PI/2);
      } else if (p.action === 'noball'){
        applyDeltaZ(sk, 'rUpperArm', -Math.PI/2);
      } else if (p.action === 'dead'){
        applyDeltaY(sk, 'lHand', Math.sin(s * Math.PI * 4) * 0.4);
        applyDeltaY(sk, 'rHand', Math.sin(s * Math.PI * 4) * 0.4);
      }
    }

    // 9. AMBIENT
    function ambient(p, t){
      const sk = p.skel;
      if (p.action === 'helmet'){
        const a = Math.min(1, p.phase * 2) * (1 - Math.max(0, (p.phase - 0.7) / 0.3));
        applyDeltaX(sk, 'lUpperArm', -Math.PI * 0.9 * a);
        applyDeltaX(sk, 'lForeArm',  -Math.PI * 0.5 * a, sk.rest.lForeArm);
      } else if (p.action === 'shine'){
        applyDeltaY(sk, 'rHand', Math.sin(t * 15) * 0.4);
      } else if (p.action === 'stretch'){
        const s = Math.sin(t) * 0.3;
        applyDeltaX(sk, 'lShin', Math.abs(s), sk.rest.lShin);
        applyDeltaX(sk, 'rShin', Math.abs(s), sk.rest.rShin);
      } else if (p.action === 'celebrate'){
        p.group.position.y = p.home.y + Math.max(0, Math.sin(t * Math.PI * 2)) * 0.6;
        applyDeltaZ(sk, 'lUpperArm', Math.sin(t * Math.PI * 4) * 0.8);
        applyDeltaZ(sk, 'rUpperArm', -Math.sin(t * Math.PI * 4) * 0.8);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN TICKER
    // ═══════════════════════════════════════════════════════════
    let globalT = 0;
    let lastFrame = performance.now();
    let frameCount = 0;

    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      globalT += dt;
      frameCount++;

      const doBones = (frameCount % BONE_EVERY === 0);
      const ball = doBones ? getBallWorldPosition() : null;

      Object.keys(players).forEach(function(role){
        const p = players[role];
        const sk = p.skel;

        // Advance phases on every frame
        if (!p.loop && p.phase < 1){
          p.phase = Math.min(1, p.phase + dt * p.phaseSpeed);
          if (p.phase >= 1){
            setTimeout(function(){
              if (p.phase >= 1){
                p.mode = 'idle'; p.action = null; p.phase = 0;
              }
            }, 250);
          }
        } else if (p.loop){
          p.phase = (p.phase + dt * p.phaseSpeed) % 1;
        }

        if (!doBones) return;

        resetToRest(p);
        headNeck(p, globalT, ball);
        torso(p, globalT);

        if (p.mode === 'walk' || p.mode === 'running') runCycle(p);
        else if (p.mode === 'bowling')                 bowlingAction(p);
        else if (p.mode === 'batting'){ battingFootwork(p); battingSwing(p); }
        else if (p.mode === 'catching')                catchingAction(p, ball);
        else if (p.mode === 'throw')                   throwAction(p);
        else if (p.mode === 'keeping' && p.action === 'dive')    keeperDive(p);
        else if (p.mode === 'keeping' && p.action === 'stumping') stumping(p);
        else if (p.mode === 'signal')                  umpireSignal(p);
        else if (p.mode === 'ambient')                 ambient(p, globalT);
        else if (p.mode === 'disappointed'){ /* torso handles it */ }
        else if (p.mode === 'idle'){
          applyDeltaX(sk, 'lForeArm', -0.15, sk.rest.lForeArm);
          applyDeltaX(sk, 'rForeArm', -0.15, sk.rest.rForeArm);
        }
      });
    }
    requestAnimationFrame(tick);

    function getBallWorldPosition(){
      if (!window.StadiumView || !window.StadiumView.scene) return null;
      const fball = window.StadiumView.scene.getObjectByName('flightBall');
      if (fball && fball.visible) return fball.position.clone();
      return null;
    }

    // Keyboard
    let selected = Object.keys(players)[0];
    const keys = {};

    document.addEventListener('keydown', function(e){
      keys[e.code] = true;
      if (e.code === 'Tab'){
        e.preventDefault();
        const r = Object.keys(players);
        selected = r[(r.indexOf(selected) + 1) % r.length];
        showToast('→ ' + selected);
      }
      if (e.code === 'Escape'){
        Object.keys(players).forEach(function(r){
          const p = players[r];
          p.mode = 'idle'; p.action = null; p.phase = 0;
          p.group.position.set(p.home.x, p.home.y, p.home.z);
          p.group.rotation.y = p.home.rotY;
        });
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

      const speed = 0.5;
      let dx = 0, dz = 0;
      if (keys['KeyW'] || keys['ArrowUp'])    dz -= speed;
      if (keys['KeyS'] || keys['ArrowDown'])  dz += speed;
      if (keys['KeyA'] || keys['ArrowLeft'])  dx -= speed;
      if (keys['KeyD'] || keys['ArrowRight']) dx += speed;

      if (dx || dz){
        if (window.StadiumAnim && window.StadiumAnim.pause) window.StadiumAnim.pause();
        p.group.position.x += dx;
        p.group.position.z += dz;
        p.home.x = p.group.position.x;
        p.home.z = p.group.position.z;
        p.group.rotation.y = Math.atan2(dx, dz);
        if (p.mode !== 'walk'){ p.mode = 'walk'; p.action = null; p.phase = 0; }
        showToast(selected + ' · x=' + p.group.position.x.toFixed(1) + ' z=' + p.group.position.z.toFixed(1));
      } else if (p.mode === 'walk'){
        p.mode = 'idle'; p.action = null; p.phase = 0;
      }
    }
    keyLoop(0);

    // Toast
    let toast = document.getElementById('pc-toast');
    if (!toast){
      toast = document.createElement('div');
      toast.id = 'pc-toast';
      toast.style.cssText =
        'position:fixed;bottom:92px;left:50%;transform:translateX(-50%);z-index:400;' +
        'background:rgba(8,8,12,.9);color:#00e676;' +
        'border-left:3px solid #00e676;border-radius:3px;' +
        'padding:8px 14px;font-family:JetBrains Mono,monospace;' +
        'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;' +
        'pointer-events:none;opacity:0;transition:opacity .25s;';
      document.body.appendChild(toast);
    }
    let toastT = 0;
    function showToast(msg){
      toast.textContent = msg;
      toast.style.opacity = '1';
      clearTimeout(toastT);
      toastT = setTimeout(function(){ toast.style.opacity = '0'; }, 1600);
    }
    window.showToast = showToast;

    // Public API
    function play(role, action, opts){
      const p = players[role];
      if (!p){ console.warn('[PlayerControl] no player', role); return false; }
      opts = opts || {};

      const A = {
        bowling:      { mode: 'bowling',  phaseSpeed: 0.6,  loop: false },
        batting:      { mode: 'batting',  phaseSpeed: 0.9,  loop: false },
        frontDrive:   { mode: 'batting',  action: 'frontDrive', phaseSpeed: 1.2, loop: false },
        backPunch:    { mode: 'batting',  action: 'backPunch',  phaseSpeed: 1.2, loop: false },
        duck:         { mode: 'batting',  action: 'duck',       phaseSpeed: 1.4, loop: false },
        leave:        { mode: 'batting',  action: 'leave',      phaseSpeed: 1.2, loop: false },
        catching:     { mode: 'catching', phaseSpeed: 1.0,  loop: false },
        throw:        { mode: 'throw',    phaseSpeed: 1.4,  loop: false },
        dive:         { mode: 'keeping',  action: 'dive',    phaseSpeed: 1.0,  loop: false },
        stumping:     { mode: 'keeping',  action: 'stumping',phaseSpeed: 1.2,  loop: false },
        out:          { mode: 'signal',   action: 'out',    phaseSpeed: 0.9, loop: false },
        six:          { mode: 'signal',   action: 'six',    phaseSpeed: 1.0, loop: false },
        four:         { mode: 'signal',   action: 'four',   phaseSpeed: 2.0, loop: false },
        wide:         { mode: 'signal',   action: 'wide',   phaseSpeed: 1.0, loop: false },
        noball:       { mode: 'signal',   action: 'noball', phaseSpeed: 1.0, loop: false },
        dead:         { mode: 'signal',   action: 'dead',   phaseSpeed: 1.0, loop: false },
        helmet:       { mode: 'ambient',  action: 'helmet', phaseSpeed: 0.8, loop: false },
        shine:        { mode: 'ambient',  action: 'shine',  phaseSpeed: 1.0, loop: true  },
        stretch:      { mode: 'ambient',  action: 'stretch',phaseSpeed: 1.0, loop: true  },
        celebrate:    { mode: 'ambient',  action: 'celebrate', phaseSpeed: 1.0, loop: true },
        disappointed: { mode: 'disappointed', phaseSpeed: 1.0, loop: true }
      };

      const def = A[action];
      if (!def){ console.warn('[PlayerControl] unknown action', action); return false; }

      p.mode = def.mode;
      p.action = def.action || action;
      p.phaseSpeed = def.phaseSpeed;
      p.loop = def.loop;
      p.phase = 0;
      Object.assign(p.params, opts);

      console.log('[PlayerControl] ' + role + ' → ' + action);
      showToast(role + ' → ' + action);
      return true;
    }

    function stopAll(){
      Object.keys(players).forEach(function(r){
        const p = players[r];
        p.mode = 'idle'; p.action = null; p.phase = 0;
      });
    }

    function resetAll(){
      Object.keys(players).forEach(function(r){
        const p = players[r];
        p.mode = 'idle'; p.action = null; p.phase = 0;
        p.group.position.set(p.home.x, p.home.y, p.home.z);
        p.group.rotation.y = p.home.rotY;
      });
      if (window.StadiumAnim && window.StadiumAnim.resume) window.StadiumAnim.resume();
    }

    function moveTo(role, x, z, rotY, dur){
      const p = players[role];
      if (!p) return false;
      if (window.StadiumAnim && window.StadiumAnim.pause) window.StadiumAnim.pause();
      const fx = p.group.position.x, fz = p.group.position.z, fr = p.group.rotation.y;
      const tr = (rotY !== undefined) ? rotY : p.group.rotation.y;
      const t0 = performance.now();
      dur = dur || 1200;
      const baseY = p.group.position.y;
      (function step(){
        const t = Math.min(1, (performance.now() - t0) / dur);
        const e = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
        p.group.position.x = fx + (x - fx) * e;
        p.group.position.z = fz + (z - fz) * e;
        let dr = tr - fr;
        while (dr >  Math.PI) dr -= Math.PI * 2;
        while (dr < -Math.PI) dr += Math.PI * 2;
        p.group.rotation.y = fr + dr * e;
        if (t < 1){
          p.group.position.y = baseY + Math.abs(Math.sin(t * Math.PI * 8)) * 0.06;
          requestAnimationFrame(step);
        } else {
          p.group.position.y = baseY;
          p.home.x = x; p.home.z = z; p.home.rotY = tr;
        }
      })();
      return true;
    }

    window.PlayerControl = {
      players, roles: Object.keys(players),
      selected: function(){ return selected; },
      select:   function(role){ if (players[role]) selected = role; },
      play, stopAll, resetAll, moveTo,
      listSlots: function(role){
        const p = players[role || selected];
        if (!p) return null;
        const out = {};
        BONE_SLOTS.forEach(function(s){
          out[s] = p.skel.slots[s] ? p.skel.slots[s].name : null;
        });
        console.table(out);
        return out;
      },
      dumpBones: function(role){
        const p = players[role || selected];
        if (!p) return;
        console.log('[PlayerControl] ' + p.skel.bones.length + ' bones in "' + (role || selected) + '":');
        p.skel.bones.forEach(function(b){ console.log('  ' + b.name); });
      },
      reapplyArms: function(){
        let count = 0;
        Object.keys(players).forEach(function(r){
          count += bakeArmsDown(players[r].skel);
        });
        console.log('[PlayerControl] arms-down re-applied to ' + count + ' bones');
        return count;
      }
    };

    console.log('[PlayerControl] ✅ Ready — ' + Object.keys(players).length + ' players');
    console.log('[PlayerControl] Tab=cycle · WASD=move · Esc=reset');
    console.log('[PlayerControl] Actions: bowling, batting, frontDrive, backPunch, duck, leave,');
    console.log('[PlayerControl]          catching, throw, dive, stumping, out, six, four, wide,');
    console.log('[PlayerControl]          noball, dead, helmet, shine, stretch, celebrate, disappointed');
    showToast('Tab=cycle · WASD=move · Esc=reset');
  }

})();
