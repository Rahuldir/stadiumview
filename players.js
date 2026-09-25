/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v7.0 (Ultimate Realism Update)
   • SLOWER, deliberate animation speeds
   • Pronounced batsman leg movement (front-foot stride & drop)
   • Explosive bat swing (high backlift, shoulder rotation, follow-through)
   • Fixed ball visibility (scaled up, visible until exact release point)
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v7.0 (Ultra Realism)', 'color:#00e676;font-weight:bold');

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
    if (attempts >= MAX_ATTEMPTS){
      clearInterval(wait);
      console.warn('[players.js] ❌ gave up after ' + MAX_ATTEMPTS + ' attempts');
    }
  }, 200);

  function collectPlayers(){
    if (window.StadiumView && window.StadiumView.players && Object.keys(window.StadiumView.players).length >= 5){
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
      headLook: true
    },
    'Non-Striker': {
      x: 1.05, z: -9.5,
      rotY: -Math.PI * 0.22,     
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
      rotY: Math.PI,             
      headLook: true
    }
  };

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
    if (/hand|wrist/.test(n) && !/finger|thumb|index|pinky|middle|ring/.test(n)) return L ? 'lHand' : R ? 'rHand' : null;
    if (/thigh|upperleg|upleg/.test(n) && !/lower|knee|calf|shin/.test(n)) return L ? 'lThigh' : R ? 'rThigh' : null;
    if (/^leg$|leg_l|leg_r|leg\.l|leg\.r|_leg$/.test(n) && !/lower|calf|shin/.test(n)) return L ? 'lThigh' : R ? 'rThigh' : null;
    if (/knee|calf|shin|lowerleg|lower_leg/.test(n)) return L ? 'lShin' : R ? 'rShin' : null;
    if (/foot|ankle/.test(n) && !/toe/.test(n)) return L ? 'lFoot' : R ? 'rFoot' : null;
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
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _targetDown = new THREE.Vector3(0, -1, 0);
  const _parentQ = new THREE.Quaternion(), _invParentQ = new THREE.Quaternion();
  const _worldRot = new THREE.Quaternion(), _newLocalQ = new THREE.Quaternion();

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

    _newLocalQ.copy(_invParentQ).multiply(_worldRot).multiply(_parentQ).multiply(bone.quaternion);
    bone.quaternion.copy(_newLocalQ);
    bone.updateWorldMatrix(true);
    return true;
  }

  function bakeArmsDown(skel){
    if (skel.slots.lUpperArm) pointBoneDown(skel.slots.lUpperArm, _targetDown);
    if (skel.slots.rUpperArm) pointBoneDown(skel.slots.rUpperArm, _targetDown);
    BONE_SLOTS.forEach(function(s){
      if (skel.slots[s]) skel.rest[s] = skel.slots[s].quaternion.clone();
    });
  }

  // ═════════════════════════════════════════════════════════════
  //  HAND ATTACHMENT — bat and ball
  // ═════════════════════════════════════════════════════════════
  function attachBat(bat, hand, tiltRad){
    if (!bat || !hand) return false;
    hand.updateWorldMatrix(true, false);
    const handPos = new THREE.Vector3();
    hand.getWorldPosition(handPos);
    if (bat.parent) bat.parent.remove(bat);
    window.StadiumView.scene.add(bat);

    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltRad, 0, 0, 'XYZ'));
    bat.quaternion.copy(q);
    const handleLocal = new THREE.Vector3(0, 0.96, 0);
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
    window.StadiumView.scene.add(ball);
    
    // SCALE UP THE BALL SO IT'S VISIBLE IN HAND
    ball.scale.set(1.5, 1.5, 1.5);
    
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
    if (skel.bones.length === 0) return null;

    const stance = STANCE_OVERRIDES[role];
    if (stance){
      group.position.set(stance.x, group.position.y, stance.z);
      group.rotation.y = stance.rotY;
      group.updateMatrixWorld(true);
    }

    bakeArmsDown(skel);

    const playerObj = {
      role, group, skel,
      batAttached: false, ballAttached: false,
      stance: stance || null,
      mode: 'idle', action: null, phase: 0, phaseSpeed: 1, loop: true,
      params: {},
      home: { x: group.position.x, y: group.position.y, z: group.position.z, rotY: group.rotation.y }
    };

    group.updateMatrixWorld(true);

    if (accessoryRef && accessoryRef.bat){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand && attachBat(accessoryRef.bat, hand, (stance && stance.batTilt) !== undefined ? stance.batTilt : 0.4)){
        playerObj.batAttached = true;
      }
    }
    if (accessoryRef && accessoryRef.ball){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand && attachBall(accessoryRef.ball, hand)){
        playerObj.ballAttached = true;
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

    roles.forEach(function(r){
      const p = makePlayer(r, rawPlayers[r], accessories[r]);
      if (p) players[r] = p;
    });
    if (Object.keys(players).length === 0) return;

    // ═══════════════════════════════════════════════════════════
    //  KINEMATIC TABLES
    // ═══════════════════════════════════════════════════════════
    const X = new THREE.Vector3(1,0,0), Y = new THREE.Vector3(0,1,0), Z = new THREE.Vector3(0,0,1);
    const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

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

    function headNeck(p, t, ball){
      const sk = p.skel;
      if (p.mode === 'idle' && p.role !== 'Keeper') {
           dX(sk, 'neck', Math.sin(t * 1.5) * 0.04);
      }
      if (p.stance && p.stance.headLook && p.mode === 'idle'){
        const bowler = players['Bowler'];
        if (bowler){
          const hp = new THREE.Vector3(), bp = new THREE.Vector3();
          if (sk.slots.head) sk.slots.head.getWorldPosition(hp);
          bowler.group.getWorldPosition(bp);
          const dx = bp.x - hp.x, dz = bp.z - hp.z;
          let y = Math.atan2(dx, dz) - p.group.rotation.y;
          while (y >  Math.PI) y -= Math.PI * 2;
          while (y < -Math.PI) y += Math.PI * 2;
          dY(sk, 'neck', Math.max(-1.0, Math.min(1.0, y)), sk.rest.neck);
        }
      }
      if (ball && (p.mode === 'batting' || p.mode === 'catching' || p.mode === 'keeping')){
        const hp = new THREE.Vector3();
        if (sk.slots.head) sk.slots.head.getWorldPosition(hp);
        const dx = ball.x - hp.x, dy = ball.y - hp.y, dz = ball.z - hp.z;
        dY(sk, 'neck', Math.max(-0.8, Math.min(0.8, Math.atan2(dx, dz))));
        dX(sk, 'head', Math.max(-0.6, Math.min(0.6, Math.atan2(dy, Math.hypot(dx, dz)))));
      }
    }

    function torso(p, t){
      const sk = p.skel;
      if (p.mode === 'idle'){
        if (p.role === 'Striker') {
          // Bent knees, athletic stance
          dX(sk, 'lThigh', 0.25); dX(sk, 'lShin', -0.3);
          dX(sk, 'rThigh', 0.25); dX(sk, 'rShin', -0.3);
          dX(sk, 'spine', 0.25); 
          p.group.position.y = p.home.y - 0.15; 
          // Slower, rhythmic Bat Tap
          const tap = Math.sin(t * 6) * 0.08; 
          dX(sk, 'rUpperArm', 0.35 + tap, sk.rest.rUpperArm);
          dX(sk, 'lUpperArm', 0.35 + tap, sk.rest.lUpperArm);
          dX(sk, 'rForeArm', -0.2 - tap, sk.rest.rForeArm);
          dX(sk, 'lForeArm', -0.2 - tap, sk.rest.lForeArm);
        }
        else if (p.role === 'Keeper') {
          dX(sk, 'lThigh', 1.1); dX(sk, 'lShin', -1.3); dX(sk, 'lFoot', 0.4);
          dX(sk, 'rThigh', 1.1); dX(sk, 'rShin', -1.3); dX(sk, 'rFoot', 0.4);
          dX(sk, 'spine', 0.6); 
          dX(sk, 'neck', -0.4); 
          p.group.position.y = p.home.y - 0.65; 
          dX(sk, 'lUpperArm', 0.6, sk.rest.lUpperArm);
          dX(sk, 'rUpperArm', 0.6, sk.rest.rUpperArm);
          dX(sk, 'lForeArm', -0.8, sk.rest.lForeArm);
          dX(sk, 'rForeArm', -0.8, sk.rest.rForeArm);
        }
      } 
      else if (p.mode === 'running' || p.mode === 'walk'){
        const rc = p.phase * 12;
        dX(sk, 'spine', 0.2 + Math.sin(rc) * 0.05);
        dY(sk, 'spine', -Math.sin(rc) * 0.1, sk.rest.spine);
        p.group.position.y = p.home.y + Math.abs(Math.sin(rc)) * 0.08;
      } 
    }

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
    }

    function bowlingAction(p){
      const sk = p.skel;
      const a = p.phase; 
      if (a < 0.3) {
        const q = a / 0.3; 
        p.group.position.y = p.home.y + Math.sin(q * Math.PI) * 0.3; 
        dX(sk, 'lThigh', -0.5 * q); 
        dX(sk, 'rThigh', 0.2 * q);  
        dX(sk, 'lUpperArm', -1.5 * q, sk.rest.lUpperArm); 
        dX(sk, 'rUpperArm', 0.5 * q, sk.rest.rUpperArm);  
        dZ(sk, 'spine', 0.4 * q); 
      } else if (a < 0.6) {
        const q = (a - 0.3) / 0.3; 
        dX(sk, 'lThigh', -0.5 + 0.5 * q); 
        dX(sk, 'lUpperArm', -1.5 + 2.5 * q, sk.rest.lUpperArm); 
        dX(sk, 'rUpperArm', 0.5 - Math.PI * q, sk.rest.rUpperArm); 
        dX(sk, 'spine', 0.5 * q); 
        dZ(sk, 'spine', 0.4 - 0.6 * q); 
      } else {
        const q = (a - 0.6) / 0.4; 
        dX(sk, 'spine', 0.5 - 0.5 * q); 
        dX(sk, 'rThigh', -0.8 * Math.sin(q * Math.PI)); 
        dX(sk, 'lUpperArm', 1.0 - 1.0 * q, sk.rest.lUpperArm);
        dX(sk, 'rUpperArm', (0.5 - Math.PI) - 0.5 * q, sk.rest.rUpperArm); 
      }
    }

    // --- MASSIVE BATTING REWORK FOR REALISM ---
    function battingFootwork(p){
      const sk = p.skel;
      const a = p.phase;
      
      if (p.action === 'frontDrive' || p.action === 'batting'){
        // Smooth sine curve for stride (0 -> 1 -> 0)
        const stride = Math.sin(a * Math.PI); 
        
        // Massive physical weight transfer forward
        dX(sk, 'lThigh', -1.2 * stride); // Front leg stretches out
        dX(sk, 'lShin', 0.8 * stride);   // Front knee bends to take weight
        dX(sk, 'lFoot', 0.4 * stride);   // Plant foot
        
        dX(sk, 'rThigh', 0.4 * stride);  // Back leg anchors
        dX(sk, 'rShin', -0.4 * stride);  // Back knee drops
        
        // Body leans and drops heavily into the shot
        p.group.position.y = p.home.y - 0.35 * stride; 
        dX(sk, 'spine', 0.4 * stride); // Chest over the ball
      }
    }

    function battingSwing(p){
      const sk = p.skel;
      const a = p.phase;
      
      if (a < 0.4){
        // PHASE 1: MASSIVE BACKLIFT
        const q = a / 0.4; 
        dZ(sk, 'spine', 0.4 * q); // Turn shoulders back
        dY(sk, 'spine', 0.3 * q); 
        
        dX(sk, 'rUpperArm', 1.8 * q, sk.rest.rUpperArm); // Right elbow goes VERY high
        dZ(sk, 'rUpperArm', 0.5 * q, sk.rest.rUpperArm); 
        
        dX(sk, 'lUpperArm', 1.2 * q, sk.rest.lUpperArm); // Left arm across chest
        dZ(sk, 'lUpperArm', -0.8 * q, sk.rest.lUpperArm); 
        
        dX(sk, 'rForeArm', -1.5 * q, sk.rest.rForeArm); // Cock wrists hard
        dX(sk, 'lForeArm', -0.5 * q, sk.rest.lForeArm);
      } 
      else if (a < 0.7) {
        // PHASE 2: EXPLOSIVE DOWNSWING (0.4 to 0.7)
        const q = (a - 0.4) / 0.3; 
        
        dZ(sk, 'spine', 0.4 - 0.8 * q); // Uncoil shoulders rapidly
        dY(sk, 'spine', 0.3 - 0.6 * q);
        
        // Arms snap through the line
        dX(sk, 'rUpperArm', 1.8 - 2.5 * q, sk.rest.rUpperArm); 
        dX(sk, 'lUpperArm', 1.2 - 2.0 * q, sk.rest.lUpperArm); 
        
        // Violent wrist snap to bring bat through
        dX(sk, 'rForeArm', -1.5 + 1.5 * q, sk.rest.rForeArm); 
        dX(sk, 'lForeArm', -0.5 + 0.5 * q, sk.rest.lForeArm); 
      } 
      else {
        // PHASE 3: HIGH FOLLOW-THROUGH (0.7 to 1.0)
        const q = (a - 0.7) / 0.3;
        dZ(sk, 'spine', -0.4 - 0.2 * q); // Continue rotation
        
        dX(sk, 'rUpperArm', -0.7 - 0.8 * q, sk.rest.rUpperArm);
        dX(sk, 'lUpperArm', -0.8 - 1.2 * q, sk.rest.lUpperArm); 
        
        // Wrap bat completely over the shoulder
        dX(sk, 'rForeArm', -1.5 * q, sk.rest.rForeArm); 
        dX(sk, 'lForeArm', -2.0 * q, sk.rest.lForeArm); 
      }
    }
    // --- END BATTING REWORK ---

    // ═══════════════════════════════════════════════════════════
    //  BALL VISIBILITY — Hide at EXACT release point
    // ═══════════════════════════════════════════════════════════
    const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
    function updateBallVisibility(){
      if (!bowlerBall) return;
      const p = players['Bowler'];
      if (p) {
        // The ball leaves the hand at phase 0.6 in our bowling animation.
        const isPreRelease = (p.mode === 'bowling' && p.phase < 0.6);
        const isMoving = (p.mode === 'idle' || p.mode === 'walk' || p.mode === 'running');
        bowlerBall.visible = (isPreRelease || isMoving);
      }
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
            setTimeout(function(){ if (p.phase >= 1){ p.mode = 'idle'; p.action = null; p.phase = 0; } }, 250);
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
    //  PUBLIC API - ALL SPEEDS HALVED FOR DELIBERATE REALISM
    // ═══════════════════════════════════════════════════════════
    function play(role, action, opts){
      const p = players[role];
      if (!p) return false;
      opts = opts || {};
      const A = {
        bowling:      { mode: 'bowling',  phaseSpeed: 0.35, loop: false }, // WAS 0.65
        batting:      { mode: 'batting',  phaseSpeed: 0.45, loop: false }, // WAS 0.90
        frontDrive:   { mode: 'batting',  action: 'frontDrive', phaseSpeed: 0.50, loop: false }, // WAS 1.2
        backPunch:    { mode: 'batting',  action: 'backPunch',  phaseSpeed: 0.50, loop: false }, // WAS 1.2
        dive:         { mode: 'keeping',  action: 'dive',    phaseSpeed: 0.50, loop: false }, // WAS 1.0
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
        players[r].mode = 'idle'; players[r].action = null; players[r].phase = 0;
      });
    }

    window.PlayerControl = {
      players, roles: Object.keys(players),
      play, stopAll
    };

    console.log('[PlayerControl] ✅ Ready — Ultra Realism Update Loaded');
  }
})();
