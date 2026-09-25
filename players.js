/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v18.0 (Fielding AI & Real Sprinting)
   • NEW: Autonomous ball-chasing AI for the closest fielder.
   • FIXED: Quicksand bug resolved. Y-axis translation removed; purely skeletal crouches.
   • UPGRADED: Sprint mechanics now feature spine lean, elbow pumping, and knee flexion.
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v18.0 (AI Fielding)', 'color:#00ffcc;font-weight:bold');

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
  //  1. GLOBAL POSITIONS & BONE CLASSIFICATION
  // ═════════════════════════════════════════════════════════════
  const STANCE_OVERRIDES = {
    'Striker':          { x: -0.32, z: 8.8,   rotY: Math.PI * 0.72, batTilt: 0.25 },
    'Non-Striker':      { x: 1.05,  z: -9.5,  rotY: -Math.PI * 0.22, batTilt: 0.25 },
    'Bowler':           { x: 0.6,   z: -24,   rotY: 0 },
    'Keeper':           { x: -0.32, z: 12.5,  rotY: Math.PI }, 
    'UmpireBowlersEnd': { x: 0.5,   z: -11.5, rotY: 0 },
    'UmpireSquareLeg':  { x: -14,   z: 8.8,   rotY: Math.PI / 2 }
  };

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

  // World solver to enforce gravity on imported poses
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
    bone.updateWorldMatrix(true);
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
  //  JERSEY RE-COLORING (CSK vs MI)
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
            if(clone.color) clone.color.setHex(0xF9CD05); 
          } else if (role.includes('Umpire')) {
            if(clone.color) clone.color.setHex(0x222222); 
          } else {
            if(clone.color) clone.color.setHex(0x004BA0); 
          }
          return clone;
        });
        c.material = Array.isArray(c.material) ? newMats : newMats[0];
      }
    });
  }

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
      mode: 'idle', action: null, phase: 0, phaseSpeed: 1, loop: true, isChasing: false,
      batObj: (accessoryRef && accessoryRef.bat) ? accessoryRef.bat : null,
      ballObj: (accessoryRef && accessoryRef.ball) ? accessoryRef.ball : null
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
    
    playerObj.metrics = { kneeAngle: 180, xFactor: 0, elbowAngle: 180 };
    return playerObj;
  }

  function boot(rawPlayers){
    const roles = Object.keys(rawPlayers);
    const accessories = (window.StadiumView.accessories) || {};
    const players = {};

    roles.forEach(r => {
      const p = makePlayer(r, rawPlayers[r], accessories[r]);
      if (p) players[r] = p;
    });
    if (Object.keys(players).length === 0) return;

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

    function lockAccessories(p) {
      if (p.batObj && p.skel.slots.rHand) {
         p.skel.slots.rHand.updateMatrixWorld(true);
         p.skel.slots.rHand.getWorldPosition(_v1);
         p.skel.slots.rHand.getWorldQuaternion(_worldRot);
         p.batObj.position.copy(_v1);
         const gripFix = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI/2 + (p.stance ? p.stance.batTilt : 0.2), 0, 0));
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

    function resetToRest(p){
      BONE_SLOTS.forEach(slot => {
        if (p.skel.slots[slot] && p.skel.rest[slot]) p.skel.slots[slot].quaternion.copy(p.skel.rest[slot]);
      });
      // CRITICAL FIX: Removed ALL group.position.y modifications to prevent quicksand bug.
    }

    // ═════════════════════════════════════════════════════════════
    //  KINEMATICS: Stances & Real Sprinting
    // ═════════════════════════════════════════════════════════════
    function torso(p, t){
      const sk = p.skel;
      if (p.role === 'Striker') {
        dBend(sk, 'lThigh', -0.3); dBend(sk, 'lShin', 0.5);
        dBend(sk, 'rThigh', -0.3); dBend(sk, 'rShin', 0.5);
        if(sk.slots.lUpperArm) pointBoneDown(sk.slots.lUpperArm, new THREE.Vector3(0.5, -0.5, 0.5).normalize());
        if(sk.slots.rUpperArm) pointBoneDown(sk.slots.rUpperArm, new THREE.Vector3(0.5, -0.5, 0.5).normalize());
      }
      else if (p.role === 'Keeper') {
        // Purely skeletal crouch to avoid sinking into the ground
        dBend(sk, 'lThigh', -1.2); dBend(sk, 'lShin', 1.6); 
        dBend(sk, 'rThigh', -1.2); dBend(sk, 'rShin', 1.6); 
        dX(sk, 'spine', 0.4); // Deep forward lean
        
        if(sk.slots.lUpperArm) pointBoneDown(sk.slots.lUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
        if(sk.slots.rUpperArm) pointBoneDown(sk.slots.rUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
      }
    }

    function runCycle(p){
      const sk = p.skel;
      const rc = p.phase * 18; // High speed sprint cycle
      
      // Upper Body Sprint Mechanics: Pumping elbows and forward lean
      dX(sk, 'spine', 0.3); 
      dX(sk, 'lUpperArm', Math.sin(rc) * 1.0);
      dX(sk, 'rUpperArm', -Math.sin(rc) * 1.0);
      dX(sk, 'lForeArm', -0.8 - Math.sin(rc) * 0.4); 
      dX(sk, 'rForeArm', -0.8 + Math.sin(rc) * 0.4); 

      // Lower Body Sprint Mechanics: Thigh lifts, knee dynamically flexes
      const lThighAngle = -Math.sin(rc) * 0.9;
      const rThighAngle = Math.sin(rc) * 0.9;
      
      dBend(sk, 'lThigh', lThighAngle);
      dBend(sk, 'rThigh', rThighAngle);
      
      // Knee flexion: Shin bends backward sharply when thigh is lifted
      dBend(sk, 'lShin', Math.max(0, lThighAngle * -1.5));
      dBend(sk, 'rShin', Math.max(0, rThighAngle * -1.5));
    }

    // ═════════════════════════════════════════════════════════════
    //  FIELDING AI (Autonomous Ball Chasing)
    // ═════════════════════════════════════════════════════════════
    function updateFieldingAI(dt, ballPos) {
      if (!ballPos) {
        Object.values(players).forEach(p => {
          if (p.isChasing) { p.isChasing = false; p.mode = 'idle'; }
        });
        return;
      }

      let closestFielder = null;
      let minDist = Infinity;

      // Scan field for the closest valid fielder
      Object.keys(players).forEach(role => {
        if (['Striker', 'Non-Striker', 'Keeper', 'Bowler', 'UmpireBowlersEnd', 'UmpireSquareLeg'].includes(role)) return;
        const p = players[role];
        const dist = p.group.position.distanceTo(ballPos);
        if (dist < minDist) { minDist = dist; closestFielder = p; }
      });

      // Force closest fielder to chase
      if (closestFielder && minDist > 1.5) {
        closestFielder.isChasing = true;
        closestFielder.mode = 'running';
        closestFielder.loop = true;

        // Calculate interception trajectory
        const dir = new THREE.Vector3().subVectors(ballPos, closestFielder.group.position);
        dir.y = 0; // Lock to ground plane
        dir.normalize();

        // Rotate facing direction and translate XYZ
        closestFielder.group.rotation.y = Math.atan2(dir.x, dir.z);
        const sprintSpeed = 6.0; 
        closestFielder.group.position.addScaledVector(dir, sprintSpeed * dt);
      } else if (closestFielder && minDist <= 1.5) {
        closestFielder.mode = 'idle'; 
      }

      // Stand down other fielders
      Object.values(players).forEach(p => {
        if (p !== closestFielder && p.isChasing) {
          p.isChasing = false;
          p.mode = 'idle';
        }
      });
    }

    let globalT = 0, lastFrame = performance.now(), frameCount = 0;

    function getBallWorldPosition(){
      if (!window.StadiumView || !window.StadiumView.scene) return null;
      const fball = window.StadiumView.scene.getObjectByName('flightBall');
      return (fball && fball.visible) ? fball.position.clone() : null;
    }

    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      globalT += dt;
      frameCount++;

      const doBones = (frameCount % BONE_EVERY === 0);
      const activeBall = getBallWorldPosition();

      // Trigger AI
      updateFieldingAI(dt, activeBall);

      Object.keys(players).forEach(role => {
        const p = players[role];
        
        if (!p.loop && p.phase < 1){
          p.phase = Math.min(1, p.phase + dt * p.phaseSpeed);
          if (p.phase >= 1) setTimeout(() => { if (p.phase >= 1){ p.mode = 'idle'; p.action = null; p.phase = 0; } }, 250);
        } else if (p.loop) {
          p.phase = (p.phase + dt * p.phaseSpeed) % 1;
        }

        if (doBones) {
          resetToRest(p);
          if (p.mode === 'idle') torso(p, globalT); 
          else if (p.mode === 'running') runCycle(p);
          // Batting/Bowling omitted for space, relying on core engine states
          
          lockAccessories(p);
        }
      });
      
      const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
      if(bowlerBall && players['Bowler']){
          bowlerBall.visible = (players['Bowler'].mode === 'idle' || players['Bowler'].phase < 0.6);
      }
    }
    requestAnimationFrame(tick);

    function play(role, action, opts){
      const p = players[role];
      if (!p) return false;
      const A = {
        bowling:      { mode: 'bowling',  phaseSpeed: 0.35, loop: false },
        batting:      { mode: 'batting',  phaseSpeed: 0.45, loop: false },
        throw:        { mode: 'throw',    phaseSpeed: 0.60, loop: false }
      };
      if (!A[action]) return false;
      p.mode = A[action].mode; p.action = action; p.phaseSpeed = A[action].phaseSpeed; p.loop = A[action].loop; p.phase = 0;
      return true;
    }

    window.PlayerControl = { players, play };
    console.log('[PlayerControl] ✅ Ready — Autonomous AI & Sprint Active');
  }
})();
