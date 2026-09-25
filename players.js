/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v6.0 (Ultra-Realistic Cricket Action)
   • Authentic Batsman stance, backlift, and follow-through
   • Multi-phase fast bowler action (gather, jump, delivery, follow-through)
   • Deep crouch for wicket keeper
   • Fielder weight-transfer throwing mechanics
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v6.0 (realism overhaul)', 'color:#00e676;font-weight:bold');

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
  //  REAL CRICKET STANCE OVERRIDES
  // ═════════════════════════════════════════════════════════════
  const STANCE_OVERRIDES = {
    'Striker': {
      x: -0.32, z: 8.8,
      rotY: Math.PI * 0.72,      // ~130° — side-on, chest towards off side
      batTilt: 0.45,             // bat leans forward, toe on ground
      headLook: true             // head tracks bowler
    },
    'Non-Striker': {
      x: 1.05, z: -9.5,
      rotY: -Math.PI * 0.22,     // slightly open, resting on bat
      batTilt: 0.35,
      headLook: true
    },
    'Bowler': {
      x: 0.6, z: -24,
      rotY: 0,
      batTilt: 0
    },
    'Keeper': {
      x: -0.32, z: 12.5,
      rotY: Math.PI,             // Facing down the pitch
      headLook: true
    }
  };

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
    if (/thigh|upperleg|upleg/.test(n) && !/lower|knee|calf|shin/.test(n)) return L ? 'lThigh' : R ? 'rThigh' : null;
    if (/^leg$|leg_l|leg_r|leg\.l|leg\.r|_leg$/.test(n) && !/lower|calf|shin/.test(n)) return L ? 'lThigh' : R ? 'rThigh' : null;
    if (/knee|calf|shin|lowerleg|lower_leg/.test(n)) return L ? 'lShin' : R ? 'rShin' : null;
    if (/foot|ankle/.test(n) && !/toe/.test(n))      return L ? 'lFoot' : R ? 'rFoot' : null;
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
          c.skeleton.bones.forEach(function(b){ if (bones.indexOf(b) < 0) bones.push(b); });
        }
      });
    }

    const slots = {};
    BONE_SLOTS.forEach(function(s){ slots[s] = null; });
    bones.forEach(function(b){
      const slot = classifyBone(b);
      if (slot && !slots[slot]) slots[slot] = b;
    });

    function parentOf(b){ return b && b.parent && (b.parent.isBone || b.parent.type === 'Bone') ? b.parent : null; }
    function childOf(b){
      if (!b) return null;
      for (let i = 0; i < b.children.length; i++){
        const c = b.children[i];
        if (c.isBone || c.type === 'Bone') return c;
      }
      return null;
    }

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
    if (!slots.spine && slots.hips){
      slots.hips.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.spine) slots.spine = c;
      });
    }
    if (!slots.chest && slots.spine){
      slots.spine.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.chest && !/shoulder|arm|clav/i.test(c.name || '')) slots.chest = c;
      });
      if (!slots.chest) slots.chest = slots.spine;
    }
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
    if (!slots.head && slots.neck) slots.head = childOf(slots.neck);

    if (!slots.lUpperArm && slots.lForeArm) slots.lUpperArm = parentOf(slots.lForeArm);
    if (!slots.rUpperArm && slots.rForeArm) slots.rUpperArm = parentOf(slots.rForeArm);
    if (!slots.lForeArm && slots.lHand)      slots.lForeArm = parentOf(slots.lHand);
    if (!slots.rForeArm && slots.rHand)      slots.rForeArm = parentOf(slots.rHand);
    if (!slots.lForeArm && slots.lUpperArm)  slots.lForeArm = childOf(slots.lUpperArm);
    if (!slots.rForeArm && slots.rUpperArm)  slots.rForeArm = childOf(slots.rUpperArm);
    if (!slots.lHand && slots.lForeArm)      slots.lHand = childOf(slots.lForeArm);
    if (!slots.rHand && slots.rForeArm)      slots.rHand = childOf(slots.rForeArm);

    if (!slots.lShin && slots.lFoot)   slots.lShin = parentOf(slots.lFoot);
    if (!slots.rShin && slots.rFoot)   slots.rShin = parentOf(slots.rFoot);
    if (!slots.lShin && slots.lThigh)  slots.lShin = childOf(slots.lThigh);
    if (!slots.rShin && slots.rThigh)  slots.rShin = childOf(slots.rThigh);
    if (!slots.lFoot && slots.lShin)   slots.lFoot = childOf(slots.lShin);
    if (!slots.rFoot && slots.rShin)   slots.rFoot = childOf(slots.rShin);

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
  //  ARMS-DOWN bake
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
    bone.updateWorldMatrix(true);
    return true;
  }

  function bakeArmsDown(skel){
    let applied = 0;
    if (skel.slots.lUpperArm && pointBoneDown(skel.slots.lUpperArm, _targetDown)) applied++;
    if (skel.slots.rUpperArm && pointBoneDown(skel.slots.rUpperArm, _targetDown)) applied++;

    ['lUpperArm','rUpperArm'].forEach(function(slot){
      const b = skel.slots[slot];
      if (!b) return;
      const sign = slot.charAt(0) === 'l' ? 1 : -1;
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.14, 0, sign * 0.10, 'XYZ'));
      b.quaternion.multiply(tilt);
      b.updateMatrixWorld(true);
    });

    BONE_SLOTS.forEach(function(s){
      if (skel.slots[s]) skel.rest[s] = skel.slots[s].quaternion.clone();
    });

    return applied;
  }

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
  }

  // ═════════════════════════════════════════════════════════════
  //  HAND ATTACHMENT — bat and ball
  // ═════════════════════════════════════════════════════════════
  const BAT_LENGTH = 0.96;

  function attachBat(bat, hand, tiltRad){
    if (!bat || !hand) return false;

    hand.updateWorldMatrix(true, false);
    const handPos = new THREE.Vector3();
    hand.getWorldPosition(handPos);

    if (bat.parent) bat.parent.remove(bat);
    const scene = window.StadiumView.scene;
    scene.add(bat);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltRad, 0, 0, 'XYZ'));
    bat.quaternion.copy(q);

    const handleLocal = new THREE.Vector3(0, BAT_LENGTH, 0);
    handleLocal.applyQuaternion(q);
    bat.position.copy(handPos).sub(handleLocal);

    bat.updateMatrixWorld(true);
    hand.attach(bat);
    return true;
  }

  function attachBall(ball, hand){
    if (!ball || !hand) return false;

    hand.updateWorldMatrix(true, false);
    const handPos = new THREE.Vector3();
    hand.getWorldPosition(handPos);

    if (ball.parent) ball.parent.remove(ball);
    const scene = window.StadiumView.scene;
    scene.add(ball);

    ball.position.copy(handPos);
    ball.quaternion.identity();
    ball.updateMatrixWorld(true);

    hand.attach(ball);
    return true;
  }

  // ═════════════════════════════════════════════════════════════
  //  PLAYER WRAPPER
  // ═════════════════════════════════════════════════════════════
  function makePlayer(role, group, accessoryRef){
    const skel = buildSkeleton(group);
    if (skel.bones.length === 0){
      console.warn('[PlayerControl] ' + role + ': no bones');
      return null;
    }

    const stance = STANCE_OVERRIDES[role];
    if (stance){
      group.position.x = stance.x;
      group.position.z = stance.z;
      group.rotation.y = stance.rotY;
      group.updateMatrixWorld(true);
    }

    const armsBaked = bakeArmsDown(skel);
    calibrateRig(skel);

    const playerObj = {
      role, group, skel, armsBaked,
      batAttached: false,
      ballAttached: false,
      stance: stance || null,
      mode: 'idle', action: null, phase: 0, phaseSpeed: 1, loop: true,
      params: {},
      home: {
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
        rotY: group.rotation.y
      }
    };

    group.updateMatrixWorld(true);

    if (accessoryRef && accessoryRef.bat){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand){
        const tilt = (stance && stance.batTilt) !== undefined ? stance.batTilt : 0.4;
        if (attachBat(accessoryRef.bat, hand, tilt)){
          playerObj.batAttached = true;
        }
      }
    }

    if (accessoryRef && accessoryRef.ball){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand){
        if (attachBall(accessoryRef.ball, hand)){
          playerObj.ballAttached = true;
        }
      }
    }

    return playerObj;
  }

  // ═════════════════════════════════════════════════════════════
  //  BOOT
  // ═════════════════════════════════════════════════════════════
  function boot(rawPlayers){
    const roles = Object.keys(rawPlayers);
    const accessories = (window.StadiumView.accessories) || {};

    const players = {};
    let totalBones = 0;

    roles.forEach(function(r){
      const p = makePlayer(r, rawPlayers[r], accessories[r]);
      if (!p) return;
      players[r] = p;
      totalBones += p.skel.bones.length;
    });

    if (Object.keys(players).length === 0) return;

    // ═══════════════════════════════════════════════════════════
    //  KINEMATIC TABLES
    // ═══════════════════════════════════════════════════════════
    const X = new THREE.Vector3(1,0,0);
    const Y = new THREE.Vector3(0,1,0);
    const Z = new THREE.Vector3(0,0,1);

    const _qa = new THREE.Quaternion();
    const _qb = new THREE.Quaternion();

    function dX(sk, slot, ang, rest){
      const b = sk.slots[slot]; if (!b) return;
      const base = rest || sk.rest[slot]; if (!base) return;
      _qa.setFromAxisAngle(X, ang); _qb.copy(base).multiply(_qa);
      b.quaternion.copy(_qb);
    }
    function dY(sk, slot, ang, rest){
      const b = sk.slots[slot]; if (!b) return;
      const base = rest || sk.rest[slot]; if (!base) return;
      _qa.setFromAxisAngle(Y, ang); _qb.copy(base).multiply(_qa);
      b.quaternion.copy(_qb);
    }
    function dZ(sk, slot, ang, rest){
      const b = sk.slots[slot]; if (!b) return;
      const base = rest || sk.rest[slot]; if (!base) return;
      _qa.setFromAxisAngle(Z, ang); _qb.copy(base).multiply(_qa);
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
        if (p.role !== 'Keeper') {
           dX(sk, 'neck', Math.sin(t * 1.5) * 0.04);
        }
        
        // Batsmen, Keeper track bowler during idle
        if (p.stance && p.stance.headLook){
          const bowler = players['Bowler'];
          if (bowler){
            const hp = new THREE.Vector3(), bp = new THREE.Vector3();
            if (sk.slots.head) sk.slots.head.getWorldPosition(hp);
            bowler.group.getWorldPosition(bp);
            const dx = bp.x - hp.x, dz = bp.z - hp.z;
            const yaw = Math.atan2(dx, dz) - p.group.rotation.y;
            let y = yaw;
            while (y >  Math.PI) y -= Math.PI * 2;
            while (y < -Math.PI) y += Math.PI * 2;
            dY(sk, 'neck', Math.max(-1.0, Math.min(1.0, y)), sk.rest.neck);
          }
        }
      }
      
      // Tracking ball directly when it's moving
      if (ball && (p.mode === 'batting' || p.mode === 'catching' || p.mode === 'keeping')){
        const hp = new THREE.Vector3();
        if (sk.slots.head) sk.slots.head.getWorldPosition(hp);
        const dx = ball.x - hp.x, dy = ball.y - hp.y, dz = ball.z - hp.z;
        dY(sk, 'neck', Math.max(-0.8, Math.min(0.8, Math.atan2(dx, dz))));
        dX(sk, 'head', Math.max(-0.6, Math.min(0.6, Math.atan2(dy, Math.hypot(dx, dz)))));
      }
    }

    // 2. TORSO & REALISTIC IDLE STANCES
    function torso(p, t){
      const sk = p.skel;
      if (p.mode === 'idle'){
        // Batsman Stance (Striker)
        if (p.role === 'Striker') {
          // Bent knees, athletic stance
          dX(sk, 'lThigh', 0.25); dX(sk, 'lShin', -0.3);
          dX(sk, 'rThigh', 0.25); dX(sk, 'rShin', -0.3);
          dX(sk, 'spine', 0.25); // Lean forward over the bat
          p.group.position.y = p.home.y - 0.15; // lower CG

          // Continuous Bat Tap
          const tap = Math.sin(t * 10) * 0.08; 
          dX(sk, 'rUpperArm', 0.35 + tap, sk.rest.rUpperArm);
          dX(sk, 'lUpperArm', 0.35 + tap, sk.rest.lUpperArm);
          dX(sk, 'rForeArm', -0.2 - tap, sk.rest.rForeArm);
          dX(sk, 'lForeArm', -0.2 - tap, sk.rest.lForeArm);
        }
        // Keeper Crouch
        else if (p.role === 'Keeper') {
          // Deep authentic squat
          dX(sk, 'lThigh', 1.1); dX(sk, 'lShin', -1.3); dX(sk, 'lFoot', 0.4);
          dX(sk, 'rThigh', 1.1); dX(sk, 'rShin', -1.3); dX(sk, 'rFoot', 0.4);
          dX(sk, 'spine', 0.6); // Deep lean forward
          dX(sk, 'neck', -0.4); // Look up at pitch
          p.group.position.y = p.home.y - 0.65; // Drop hips down
          
          // Hands ready to catch
          dX(sk, 'lUpperArm', 0.6, sk.rest.lUpperArm);
          dX(sk, 'rUpperArm', 0.6, sk.rest.rUpperArm);
          dX(sk, 'lForeArm', -0.8, sk.rest.lForeArm);
          dX(sk, 'rForeArm', -0.8, sk.rest.rForeArm);
        }
        // General Fielder Ready Stance
        else {
          dX(sk, 'chest', Math.sin(t * 2) * 0.02);
          dX(sk, 'lThigh', 0.1); dX(sk, 'lShin', -0.1);
          dX(sk, 'rThigh', 0.1); dX(sk, 'rShin', -0.1);
        }
      } 
      else if (p.mode === 'running' || p.mode === 'walk'){
        const rc = p.phase * 12;
        dX(sk, 'spine', 0.2 + Math.sin(rc) * 0.05);
        dY(sk, 'spine', -Math.sin(rc) * 0.1, sk.rest.spine);
        dZ(sk, 'spine', Math.sin(p.phase * 6) * 0.08);
        p.group.position.y = p.home.y + Math.abs(Math.sin(rc)) * 0.08;
      } 
    }

    // 3. RUN CYCLE
    function runCycle(p){
      const sk = p.skel;
      const rc = p.phase * 12;
      dX(sk, 'lUpperArm', -Math.sin(rc) * 0.8);
      dX(sk, 'rUpperArm',  Math.sin(rc) * 0.8);
      dX(sk, 'lForeArm', -Math.max(0.1, Math.sin(rc)) * 1.2, sk.rest.lForeArm);
      dX(sk, 'rForeArm', -Math.max(0.1, -Math.sin(rc)) * 1.2, sk.rest.rForeArm);
      dX(sk, 'lThigh',  Math.sin(rc) * 0.6);
      dX(sk, 'rThigh', -Math.sin(rc) * 0.6);
      dX(sk, 'lShin', Math.max(0,  Math.sin(rc + 0.5)) * 1.1, sk.rest.lShin);
      dX(sk, 'rShin', Math.max(0, -Math.sin(rc + 0.5)) * 1.1, sk.rest.rShin);
      dX(sk, 'lFoot',  Math.cos(rc) * 0.2, sk.rest.lFoot);
      dX(sk, 'rFoot', -Math.cos(rc) * 0.2, sk.rest.rFoot);
    }

    // 4. REALISTIC BOWLING ACTION (Gather -> Delivery -> Follow-through)
    function bowlingAction(p){
      const sk = p.skel;
      const a = p.phase; 
      
      if (a < 0.3) {
        // GATHER / JUMP Phase
        const q = a / 0.3; // 0 to 1
        p.group.position.y = p.home.y + Math.sin(q * Math.PI) * 0.3; // jump
        dX(sk, 'lThigh', -0.5 * q); // Front leg lifts
        dX(sk, 'rThigh', 0.2 * q);  // Back leg plants
        dX(sk, 'lUpperArm', -1.5 * q, sk.rest.lUpperArm); // Front arm goes high
        dX(sk, 'rUpperArm', 0.5 * q, sk.rest.rUpperArm);  // Bowling arm loads low
        dZ(sk, 'spine', 0.4 * q); // Lean back slightly
      } 
      else if (a < 0.6) {
        // DELIVERY STRIDE Phase
        const q = (a - 0.3) / 0.3; // 0 to 1
        dX(sk, 'lThigh', -0.5 + 0.5 * q); // Front leg plants
        dX(sk, 'lUpperArm', -1.5 + 2.5 * q, sk.rest.lUpperArm); // Front arm pulls down violently
        dX(sk, 'rUpperArm', 0.5 - Math.PI * q, sk.rest.rUpperArm); // Bowling arm rotates OVER
        dX(sk, 'spine', 0.5 * q); // Snap spine forward
        dZ(sk, 'spine', 0.4 - 0.6 * q); // Rotate shoulder
      } 
      else {
        // FOLLOW-THROUGH Phase
        const q = (a - 0.6) / 0.4; // 0 to 1
        dX(sk, 'spine', 0.5 - 0.5 * q); // Spine recovers
        dX(sk, 'rThigh', -0.8 * Math.sin(q * Math.PI)); // Back leg kicks up behind
        dX(sk, 'lUpperArm', 1.0 - 1.0 * q, sk.rest.lUpperArm);
        dX(sk, 'rUpperArm', (0.5 - Math.PI) - 0.5 * q, sk.rest.rUpperArm); // Arm finishes across body
      }
    }

    // 5. CATCHING (Hands attack the ball)
    function catchingAction(p, ball){
      if (!ball) return;
      const sk = p.skel;
      const hp = new THREE.Vector3();
      p.group.getWorldPosition(hp);
      const dist = hp.distanceTo(ball);
      
      const reach = Math.min(1.0, 2 / Math.max(0.5, dist));
      dX(sk, 'lUpperArm', -Math.PI * 0.4 * reach, sk.rest.lUpperArm);
      dX(sk, 'rUpperArm', -Math.PI * 0.4 * reach, sk.rest.rUpperArm);
      
      // Hands converge
      dZ(sk, 'lUpperArm', -0.2 * reach);
      dZ(sk, 'rUpperArm',  0.2 * reach);
      
      // Elbow bend softens as ball gets closer
      const bend = 0.8 * (1 - reach);
      dX(sk, 'lForeArm', -bend, sk.rest.lForeArm);
      dX(sk, 'rForeArm', -bend, sk.rest.rForeArm);
      
      // Keeper stays crouched while catching
      if (p.role === 'Keeper') {
          dX(sk, 'lThigh', 0.8); dX(sk, 'lShin', -0.9);
          dX(sk, 'rThigh', 0.8); dX(sk, 'rShin', -0.9);
          p.group.position.y = p.home.y - 0.4;
      }
    }

    // 6. BATTING FOOTWORK & SWING (High backlift, fluid follow-through)
    function battingFootwork(p){
      const sk = p.skel;
      const a = p.phase;
      
      if (p.action === 'frontDrive'){
        // Big front foot stride
        dX(sk, 'lThigh',  Math.sin(a * Math.PI) * 0.8);
        dX(sk, 'lShin', -Math.sin(a * Math.PI) * 0.3);
        p.group.position.y = p.home.y - Math.sin(a * Math.PI) * 0.2; // Drop into shot
        dX(sk, 'spine', Math.sin(a * Math.PI) * 0.4); // Head over ball
      } else if (p.action === 'backPunch'){
        // Step back, stand tall
        dX(sk, 'rThigh', -Math.sin(a * Math.PI) * 0.4);
        p.group.position.y = p.home.y + Math.sin(a * Math.PI) * 0.15; 
      } else if (p.action === 'duck'){
        p.group.position.y = p.home.y - Math.sin(a * Math.PI) * 0.8;
        dX(sk, 'neck', Math.sin(a * Math.PI) * 0.6); // tuck head
      } else if (p.action === 'leave'){
        const lift = Math.min(a * 3, 1) * (Math.PI / 1.5);
        dZ(sk, 'lUpperArm', -lift);
        dZ(sk, 'rUpperArm',  lift);
        p.group.position.y = p.home.y + Math.sin(a * Math.PI) * 0.2; // raise up on toes
      }
    }

    function battingSwing(p){
      const sk = p.skel;
      const a = p.phase;
      
      if (a < 0.3){
        // BACKLIFT
        const q = a / 0.3; // 0 to 1
        dZ(sk, 'spine', 0.2 * q); // Shoulder rotation
        dX(sk, 'rUpperArm', 1.0 * q, sk.rest.rUpperArm); // Right elbow high
        dX(sk, 'lUpperArm', 0.5 * q, sk.rest.lUpperArm); // Left arm across chest
        dY(sk, 'lUpperArm', -0.6 * q, sk.rest.lUpperArm); 
        dX(sk, 'rForeArm', -1.0 * q, sk.rest.rForeArm); // Cock wrists
      } 
      else if (a < 0.6) {
        // DOWNSWING & CONTACT
        const q = (a - 0.3) / 0.3; 
        dZ(sk, 'spine', 0.2 - 0.4 * q); // Uncoil
        dX(sk, 'rUpperArm', 1.0 - 1.5 * q, sk.rest.rUpperArm); 
        dX(sk, 'lUpperArm', 0.5 - 1.0 * q, sk.rest.lUpperArm); 
        dY(sk, 'lUpperArm', -0.6 + 0.6 * q, sk.rest.lUpperArm); 
        dX(sk, 'rForeArm', -1.0 + 1.0 * q, sk.rest.rForeArm); // Snap wrists through
      } 
      else {
        // FOLLOW-THROUGH
        const q = (a - 0.6) / 0.4;
        dX(sk, 'rUpperArm', -0.5 - 0.8 * Math.sin(q * Math.PI), sk.rest.rUpperArm);
        dX(sk, 'lUpperArm', -0.5 - 1.2 * Math.sin(q * Math.PI), sk.rest.lUpperArm); 
        dX(sk, 'lForeArm', -1.5 * Math.sin(q * Math.PI), sk.rest.lForeArm); // Bat wraps over shoulder
      }
    }

    // 7. FIELDING (Realistic Throw with weight transfer)
    function throwAction(p){
      const sk = p.skel;
      const a = p.phase;
      if (a < 0.4) {
          // Wind up - lean back, arm cocked
          const q = a / 0.4;
          dX(sk, 'spine', -0.3 * q); 
          dX(sk, 'rUpperArm', -1.5 * q, sk.rest.rUpperArm);
          dX(sk, 'rForeArm', -1.5 * q, sk.rest.rForeArm);
      } else {
          // Snap throw forward
          const q = (a - 0.4) / 0.6;
          dX(sk, 'spine', -0.3 + 0.6 * Math.sin(q * Math.PI)); 
          dX(sk, 'rUpperArm', -1.5 + 2.5 * q, sk.rest.rUpperArm); // Whip arm down
          dX(sk, 'rForeArm', -1.5 + 1.5 * q, sk.rest.rForeArm); // Extend elbow
      }
    }
    
    function keeperDive(p){
      const sk = p.skel;
      const a = p.phase;
      const dir = p.params.diveDirection || 1;
      // Explosive horizontal jump
      p.group.position.x += dir * a * 1.2;
      p.group.position.y = p.home.y + Math.sin(a * Math.PI) * 0.6;
      dZ(sk, 'spine', dir * Math.sin(a * Math.PI) * (Math.PI / 1.5)); // Body stretches out parallel
      
      // Arms fully extended towards ball
      dX(sk, 'lUpperArm', -1.5 * Math.sin(a * Math.PI));
      dX(sk, 'rUpperArm', -1.5 * Math.sin(a * Math.PI));
    }

    // 8. UMPIRE SIGNALS
    function umpireSignal(p){
      const sk = p.skel;
      const s = p.phase;
      if (p.action === 'out'){
        dX(sk, 'rUpperArm', -Math.min(s * 2.5, 1) * Math.PI, sk.rest.rUpperArm);
      } else if (p.action === 'six'){
        const a = Math.sin(s * (Math.PI / 2)) * Math.PI;
        dX(sk, 'lUpperArm', -a, sk.rest.lUpperArm);
        dX(sk, 'rUpperArm', -a, sk.rest.rUpperArm);
      } else if (p.action === 'four'){
        dY(sk, 'rUpperArm', Math.sin(s * Math.PI * 6) * 0.5, sk.rest.rUpperArm);
      } else if (p.action === 'wide'){
        dZ(sk, 'lUpperArm', -Math.PI/2, sk.rest.lUpperArm);
        dZ(sk, 'rUpperArm',  Math.PI/2, sk.rest.rUpperArm);
      }
    }

    // 9. AMBIENT
    function ambient(p, t){
      const sk = p.skel;
      if (p.action === 'shine'){
        dY(sk, 'rHand', Math.sin(t * 15) * 0.4);
      } else if (p.action === 'stretch'){
        const s = Math.sin(t) * 0.3;
        dX(sk, 'lShin', Math.abs(s), sk.rest.lShin);
        dX(sk, 'rShin', Math.abs(s), sk.rest.rShin);
      } else if (p.action === 'celebrate'){
        p.group.position.y = p.home.y + Math.max(0, Math.sin(t * Math.PI * 2)) * 0.6;
        dZ(sk, 'lUpperArm', Math.sin(t * Math.PI * 4) * 0.8);
        dZ(sk, 'rUpperArm', -Math.sin(t * Math.PI * 4) * 0.8);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  BALL VISIBILITY — hide when flightBall is active
    // ═══════════════════════════════════════════════════════════
    const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
    function updateBallVisibility(){
      if (!bowlerBall) return;
      const phase = (window.StadiumAnim && window.StadiumAnim.currentPhase)
                  ? window.StadiumAnim.currentPhase() : 'idle';
      const show = ['idle','guard','mark_runup','runup'].indexOf(phase) >= 0;
      bowlerBall.visible = show;
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN TICKER
    // ═══════════════════════════════════════════════════════════
    let globalT = 0, lastFrame = performance.now(), frameCount = 0;

    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      globalT += dt;
      frameCount++;

      const doBones = (frameCount % BONE_EVERY === 0);
      const ball = doBones ? getBallWorldPosition() : null;

      updateBallVisibility();

      Object.keys(players).forEach(function(role){
        const p = players[role];
        const sk = p.skel;

        if (!p.loop && p.phase < 1){
          p.phase = Math.min(1, p.phase + dt * p.phaseSpeed);
          if (p.phase >= 1){
            setTimeout(function(){
              if (p.phase >= 1){ p.mode = 'idle'; p.action = null; p.phase = 0; }
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
        else if (p.mode === 'signal')                  umpireSignal(p);
        else if (p.mode === 'ambient')                 ambient(p, globalT);
      });
    }
    requestAnimationFrame(tick);

    function getBallWorldPosition(){
      if (!window.StadiumView || !window.StadiumView.scene) return null;
      const fball = window.StadiumView.scene.getObjectByName('flightBall');
      if (fball && fball.visible) return fball.position.clone();
      return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  KEYBOARD
    // ═══════════════════════════════════════════════════════════
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
      if (keys['KeyW'] || keys['ArrowUp'])   dz -= speed;
      if (keys['KeyS'] || keys['ArrowDown']) dz += speed;
      if (keys['KeyA'] || keys['ArrowLeft']) dx -= speed;
      if (keys['KeyD'] || keys['ArrowRight']) dx += speed;

      if (dx || dz){
        if (window.StadiumAnim && window.StadiumAnim.pause) window.StadiumAnim.pause();
        p.group.position.x += dx;
        p.group.position.z += dz;
        p.home.x = p.group.position.x;
        p.home.z = p.group.position.z;
        p.group.rotation.y = Math.atan2(dx, dz);
        if (p.mode !== 'walk'){ p.mode = 'walk'; p.action = null; p.phase = 0; }
      } else if (p.mode === 'walk'){
        p.mode = 'idle'; p.action = null; p.phase = 0;
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
      document.body.appendChild(toast);
    }
    let toastT = 0;
    function showToast(msg){
      toast.textContent = msg;
      toast.classList.add('show');
      clearTimeout(toastT);
      toastT = setTimeout(function(){ toast.classList.remove('show'); }, 1600);
    }
    window.showToast = showToast;

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════
    function play(role, action, opts){
      const p = players[role];
      if (!p) return false;
      opts = opts || {};
      const A = {
        bowling:      { mode: 'bowling',  phaseSpeed: 0.65, loop: false },
        batting:      { mode: 'batting',  phaseSpeed: 0.9,  loop: false },
        frontDrive:   { mode: 'batting',  action: 'frontDrive', phaseSpeed: 1.2, loop: false },
        backPunch:    { mode: 'batting',  action: 'backPunch',  phaseSpeed: 1.2, loop: false },
        duck:         { mode: 'batting',  action: 'duck',       phaseSpeed: 1.4, loop: false },
        leave:        { mode: 'batting',  action: 'leave',      phaseSpeed: 1.2, loop: false },
        catching:     { mode: 'catching', phaseSpeed: 1.0,  loop: false },
        throw:        { mode: 'throw',    phaseSpeed: 1.4,  loop: false },
        dive:         { mode: 'keeping',  action: 'dive',    phaseSpeed: 1.0,  loop: false },
        out:          { mode: 'signal',   action: 'out',    phaseSpeed: 0.9, loop: false },
        six:          { mode: 'signal',   action: 'six',    phaseSpeed: 1.0, loop: false },
        four:         { mode: 'signal',   action: 'four',   phaseSpeed: 2.0, loop: false },
        wide:         { mode: 'signal',   action: 'wide',   phaseSpeed: 1.0, loop: false },
        shine:        { mode: 'ambient',  action: 'shine',  phaseSpeed: 1.0, loop: true  },
        stretch:      { mode: 'ambient',  action: 'stretch',phaseSpeed: 1.0, loop: true  },
        celebrate:    { mode: 'ambient',  action: 'celebrate', phaseSpeed: 1.0, loop: true }
      };
      const def = A[action];
      if (!def) return false;

      p.mode = def.mode;
      p.action = def.action || action;
      p.phaseSpeed = def.phaseSpeed;
      p.loop = def.loop;
      p.phase = 0;
      Object.assign(p.params, opts);
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

    window.PlayerControl = {
      players, roles: Object.keys(players),
      selected: function(){ return selected; },
      select:   function(role){ if (players[role]) selected = role; },
      play, stopAll, resetAll
    };

    console.log('[PlayerControl] ✅ Ready — Realism Kinematics Loaded');
  }
})();
