/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v17.0 (Keeper Direction & Stance Fix)
   • FIXED: Keeper rotY set to Math.PI to correctly face the pitch.
   • FIXED: Restored truncated idle torso logic so the Keeper crouches again.
   • LIVERY: Mumbai Blue for fielders, Red/Yellow F1 livery for Batsmen.
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v17.0 (Keeper Fix)', 'color:#00e5ff;font-weight:bold');

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
  //  1. GLOBAL COORDINATE MAPPING (Fixed Keeper Rotation)
  // ═════════════════════════════════════════════════════════════
  const STANCE_OVERRIDES = {
    'Striker':          { x: -0.32, z: 8.8,   rotY: Math.PI * 0.72, batTilt: 0.25 },
    'Non-Striker':      { x: 1.05,  z: -9.5,  rotY: -Math.PI * 0.22, batTilt: 0.25 },
    'Bowler':           { x: 0.6,   z: -24,   rotY: 0 },
    'Keeper':           { x: -0.32, z: 12.5,  rotY: Math.PI }, // 180 deg fix to face the pitch
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
            if(clone.color) clone.color.setHex(0xE31837); 
            if(clone.emissive) { clone.emissive.setHex(0xFFD700); clone.emissiveIntensity = 0.25; }
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
      mode: 'idle', action: null, phase: 0, phaseSpeed: 1, loop: true,
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
    function dZ(sk, slot, ang){
      if (!sk.slots[slot] || !sk.rest[slot]) return;
      _qa.setFromAxisAngle(Z, ang); _qb.copy(sk.rest[slot]).multiply(_qa);
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
    }

    // ═════════════════════════════════════════════════════════════
    //  RESTORED IDLE STANCE (Keeper Crouch)
    // ═════════════════════════════════════════════════════════════
    function torso(p, t){
      const sk = p.skel;
      if (p.role === 'Striker') {
        dBend(sk, 'lThigh', -0.3); dBend(sk, 'lShin', 0.4);
        dBend(sk, 'rThigh', -0.3); dBend(sk, 'rShin', 0.4);
        if(sk.slots.lUpperArm) pointBoneDown(sk.slots.lUpperArm, new THREE.Vector3(0.5, -0.5, 0.5).normalize());
        if(sk.slots.rUpperArm) pointBoneDown(sk.slots.rUpperArm, new THREE.Vector3(0.5, -0.5, 0.5).normalize());
      }
      else if (p.role === 'Keeper') {
        dBend(sk, 'lThigh', -1.4); dBend(sk, 'lShin', 1.8); 
        dBend(sk, 'rThigh', -1.4); dBend(sk, 'rShin', 1.8); 
        if(sk.slots.lUpperArm) pointBoneDown(sk.slots.lUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
        if(sk.slots.rUpperArm) pointBoneDown(sk.slots.rUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
      }
    }

    // ═════════════════════════════════════════════════════════════
    //  ANALYTICS KINEMATICS
    // ═════════════════════════════════════════════════════════════
    function battingKinematics(p){
      const sk = p.skel;
      const a = p.phase;
      
      const xFactorRot = Math.sin(a * Math.PI) * 0.4;
      p.metrics.xFactor = (xFactorRot * 180 / Math.PI).toFixed(1);

      const isImpact = (a > 0.5 && a < 0.7);
      const kneeFlexion = isImpact ? 0 : 0.4;
      p.metrics.kneeAngle = 180 - (kneeFlexion * 180 / Math.PI);

      dX(sk, 'lThigh', -0.6); 
      dX(sk, 'lShin', kneeFlexion); 
      dX(sk, 'rThigh', 0.3);  
      
      if (a < 0.4){
        const q = a / 0.4; 
        dY(sk, 'hips', 0.2 * q); 
        dY(sk, 'chest', (0.2 - xFactorRot) * q); 
        dX(sk, 'rUpperArm', 1.5 * q); 
        dX(sk, 'lUpperArm', 0.8 * q); 
      } else if (a < 0.7) {
        const q = (a - 0.4) / 0.3; 
        dY(sk, 'hips', 0.2 - 0.6 * q);
        dY(sk, 'chest', (0.2 - xFactorRot) - 0.8 * q); 
        dX(sk, 'rUpperArm', 1.5 - 2.0 * q); 
        dX(sk, 'lUpperArm', 0.8 - 1.5 * q); 
      } else {
        const q = (a - 0.7) / 0.3;
        dY(sk, 'chest', -0.6 - 0.2 * q);
        dX(sk, 'rUpperArm', -0.5 - 0.5 * q);
        dX(sk, 'lUpperArm', -0.7 - 0.5 * q);
      }
    }

    function bowlingKinematics(p){
      const sk = p.skel;
      const a = p.phase; 
      
      dX(sk, 'rForeArm', 0); 
      p.metrics.elbowAngle = 180;

      if (a < 0.3) {
        const q = a / 0.3; 
        dX(sk, 'lThigh', -0.6 * q); 
        dZ(sk, 'lUpperArm', 0.5); dX(sk, 'lUpperArm', -1.5 * q); 
        dX(sk, 'rUpperArm', 0.5 * q); 
      } else if (a < 0.6) {
        const q = (a - 0.3) / 0.3; 
        dX(sk, 'lUpperArm', -1.5 + 2.0 * q); 
        dX(sk, 'rUpperArm', 0.5 - Math.PI * q); 
        dY(sk, 'chest', 0.5 * q); 
      } else {
        const q = (a - 0.6) / 0.4; 
        dX(sk, 'rThigh', -0.8 * Math.sin(q * Math.PI)); 
        dX(sk, 'rUpperArm', (0.5 - Math.PI) - 0.5 * q); 
      }
    }

    function throwKinematics(p){
      const sk = p.skel;
      const a = p.phase;
      
      if (a < 0.5) {
        const q = a / 0.5;
        dX(sk, 'chest', -0.3 * q); 
        dX(sk, 'rUpperArm', -1.5 * q);
        dX(sk, 'rForeArm', -1.5 * q); 
      } else {
        const q = (a - 0.5) / 0.5;
        dX(sk, 'chest', -0.3 + 0.6 * q);
        const optimalRelease = 0.52; 
        dX(sk, 'rUpperArm', -1.5 + (1.5 + optimalRelease) * q); 
        dX(sk, 'rForeArm', -1.5 + 1.5 * q); 
      }
    }

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
        
        if (!p.loop && p.phase < 1){
          p.phase = Math.min(1, p.phase + dt * p.phaseSpeed);
          if (p.phase >= 1) setTimeout(() => { if (p.phase >= 1){ p.mode = 'idle'; p.action = null; p.phase = 0; } }, 250);
        } else if (p.loop) {
          p.phase = (p.phase + dt * p.phaseSpeed) % 1;
        }

        if (doBones) {
          resetToRest(p);
          if (p.mode === 'idle') torso(p, globalT); 
          else if (p.mode === 'batting') battingKinematics(p);
          else if (p.mode === 'bowling') bowlingKinematics(p);
          else if (p.mode === 'throw') throwKinematics(p);
          
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
    console.log('[PlayerControl] ✅ Ready — Analytic Constraints Active');
  }
})();
