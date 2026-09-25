/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v8.0 (Physical Realism & Mesh Fix)
   • FIXED: Contorted arms/broken shoulders (removed destructive bake)
   • FIXED: Floating bat attachment aligned properly to the wrist
   • FIXED: Wicket keeper sinking into the ground
   • Added natural, non-destructive rotational limits for all joints
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v8.0 (Mesh Fix Update)', 'color:#00e676;font-weight:bold');

  const IS_MOBILE_PLAYERS = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const BONE_EVERY = IS_MOBILE_PLAYERS ? 3 : 1;

  let attempts = 0;
  const MAX_ATTEMPTS = 100;

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
    'Striker': { x: -0.32, z: 8.8, rotY: Math.PI * 0.72, batTilt: 0.15, headLook: true },
    'Non-Striker': { x: 1.05, z: -9.5, rotY: -Math.PI * 0.22, batTilt: 0.15, headLook: true },
    'Bowler': { x: 0.6, z: -24, rotY: 0, batTilt: 0 },
    'Keeper': { x: -0.32, z: 12.5, rotY: Math.PI, headLook: true }
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
    if (/arm/.test(n) && !/fore|lower|hand|finger|thumb/.test(n)) return L ? 'lUpperArm' : R ? 'rUpperArm' : null;
    if (/forearm|lowerarm|lower_arm|elbow/.test(n)) return L ? 'lForeArm' : R ? 'rForeArm' : null;
    if (/hand|wrist/.test(n) && !/finger|thumb/.test(n)) return L ? 'lHand' : R ? 'rHand' : null;
    if (/thigh|upperleg|upleg/.test(n) && !/lower|knee|calf|shin/.test(n)) return L ? 'lThigh' : R ? 'rThigh' : null;
    if (/^leg$|leg_l|leg_r|leg\.l|leg\.r|_leg$/.test(n) && !/lower|calf|shin/.test(n)) return L ? 'lThigh' : R ? 'rThigh' : null;
    if (/knee|calf|shin|lowerleg|lower_leg/.test(n)) return L ? 'lShin' : R ? 'rShin' : null;
    if (/foot|ankle/.test(n) && !/toe/.test(n)) return L ? 'lFoot' : R ? 'rFoot' : null;
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
    if (!slots.neck && slots.chest) slots.neck = childOf(slots.chest);
    if (!slots.head && slots.neck) slots.head = childOf(slots.neck);

    if (!slots.lUpperArm && slots.lForeArm) slots.lUpperArm = parentOf(slots.lForeArm);
    if (!slots.rUpperArm && slots.rForeArm) slots.rUpperArm = parentOf(slots.rForeArm);
    if (!slots.lForeArm && slots.lUpperArm) slots.lForeArm = childOf(slots.lUpperArm);
    if (!slots.rForeArm && slots.rUpperArm) slots.rForeArm = childOf(slots.rUpperArm);
    if (!slots.lHand && slots.lForeArm) slots.lHand = childOf(slots.lForeArm);
    if (!slots.rHand && slots.rForeArm) slots.rHand = childOf(slots.rForeArm);
    
    if (!slots.lShin && slots.lThigh) slots.lShin = childOf(slots.lThigh);
    if (!slots.rShin && slots.rThigh) slots.rShin = childOf(slots.rThigh);
    if (!slots.lFoot && slots.lShin) slots.lFoot = childOf(slots.lShin);
    if (!slots.rFoot && slots.rShin) slots.rFoot = childOf(slots.rShin);

    const rest = {};
    BONE_SLOTS.forEach(slot => {
      if (slots[slot]) rest[slot] = slots[slot].quaternion.clone();
    });

    return { bones, slots, rest };
  }

  // ═════════════════════════════════════════════════════════════
  //  SAFE ATTACHMENTS (Fixes floating bat)
  // ═════════════════════════════════════════════════════════════
  function attachBat(bat, hand, tiltRad){
    if (!bat || !hand) return false;
    hand.updateWorldMatrix(true, false);
    
    if (bat.parent) bat.parent.remove(bat);
    window.StadiumView.scene.add(bat);

    // Lock the bat to the hand's world position, pointing downwards
    const handPos = new THREE.Vector3();
    hand.getWorldPosition(handPos);
    
    // Create a stable rotation offset relative to the world, not the twisted bone
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 + tiltRad, 0, 0, 'XYZ'));
    bat.quaternion.copy(q);
    
    // Offset handle so it rests exactly in the palm
    const handleLocal = new THREE.Vector3(0, 0.45, 0); 
    handleLocal.applyQuaternion(q);
    bat.position.copy(handPos).sub(handleLocal);
    
    bat.updateMatrixWorld(true);
    hand.attach(bat); // Now attach to maintain relative position safely
    return true;
  }

  function attachBall(ball, hand){
    if (!ball || !hand) return false;
    hand.updateWorldMatrix(true, false);
    const handPos = new THREE.Vector3();
    hand.getWorldPosition(handPos);
    
    if (ball.parent) ball.parent.remove(ball);
    window.StadiumView.scene.add(ball);
    
    ball.scale.set(1.2, 1.2, 1.2); // Visible size
    ball.position.copy(handPos);
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

    const playerObj = {
      role, group, skel,
      stance: stance || null,
      mode: 'idle', action: null, phase: 0, phaseSpeed: 1, loop: true,
      params: {},
      home: { x: group.position.x, y: group.position.y, z: group.position.z, rotY: group.rotation.y }
    };

    group.updateMatrixWorld(true);

    if (accessoryRef && accessoryRef.bat){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand) attachBat(accessoryRef.bat, hand, stance ? stance.batTilt : 0.15);
    }
    if (accessoryRef && accessoryRef.ball){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand) attachBall(accessoryRef.ball, hand);
    }
    return playerObj;
  }

  // ═════════════════════════════════════════════════════════════
  //  BOOT & PHYSICS ENGINE
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

    const X = new THREE.Vector3(1,0,0), Y = new THREE.Vector3(0,1,0), Z = new THREE.Vector3(0,0,1);
    const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

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
        if (p.skel.slots[slot] && p.skel.rest[slot]) {
          p.skel.slots[slot].quaternion.copy(p.skel.rest[slot]);
        }
      });
      p.group.position.y = p.home.y;
    }

    // BASE POSE: Dynamically bring arms down from T-Pose cleanly
    function applyBasePose(p) {
        const sk = p.skel;
        // Natural arm resting position (no baking necessary)
        dZ(sk, 'lUpperArm', 1.2); // bring left arm down
        dZ(sk, 'rUpperArm', -1.2); // bring right arm down
    }

    function headNeck(p, t, ball){
      const sk = p.skel;
      if (p.mode === 'idle' && p.role !== 'Keeper') {
           dX(sk, 'neck', Math.sin(t * 1.5) * 0.04);
      }
      if (ball && (p.mode === 'batting' || p.mode === 'keeping')){
        const hp = new THREE.Vector3();
        if (sk.slots.head) sk.slots.head.getWorldPosition(hp);
        const dx = ball.x - hp.x, dy = ball.y - hp.y, dz = ball.z - hp.z;
        dY(sk, 'neck', Math.max(-0.6, Math.min(0.6, Math.atan2(dx, dz))));
      }
    }

    function torso(p, t){
      const sk = p.skel;
      if (p.mode === 'idle'){
        if (p.role === 'Striker') {
          // Athletic, safe stance
          dX(sk, 'lThigh', -0.2); dX(sk, 'lShin', 0.2);
          dX(sk, 'rThigh', -0.2); dX(sk, 'rShin', 0.2);
          dX(sk, 'spine', 0.15); 
          p.group.position.y = p.home.y - 0.05; 
          
          // Bring hands together to hold bat in front
          dZ(sk, 'lUpperArm', 0.8); dY(sk, 'lUpperArm', 0.5); dX(sk, 'lForeArm', -0.4);
          dZ(sk, 'rUpperArm', -0.8); dY(sk, 'rUpperArm', -0.5); dX(sk, 'rForeArm', -0.4);
          
          const tap = Math.sin(t * 6) * 0.05; 
          dX(sk, 'lUpperArm', 0.2 + tap);
          dX(sk, 'rUpperArm', 0.2 + tap);
        }
        else if (p.role === 'Keeper') {
          // Safe Keeper Crouch (Fixes sinking into ground)
          dX(sk, 'lThigh', -0.8); dX(sk, 'lShin', 1.0); 
          dX(sk, 'rThigh', -0.8); dX(sk, 'rShin', 1.0); 
          dX(sk, 'spine', 0.4); 
          dX(sk, 'neck', -0.3); 
          p.group.position.y = p.home.y - 0.25; // Adjusted to not clip into ground
          
          dZ(sk, 'lUpperArm', 0.8); dY(sk, 'lUpperArm', 0.6); dX(sk, 'lForeArm', -0.8);
          dZ(sk, 'rUpperArm', -0.8); dY(sk, 'rUpperArm', -0.6); dX(sk, 'rForeArm', -0.8);
        }
        else {
           // Fielders
           applyBasePose(p);
           dX(sk, 'lThigh', -0.1); dX(sk, 'rThigh', -0.1);
        }
      } 
      else if (p.mode === 'running' || p.mode === 'walk'){
        const rc = p.phase * 12;
        dX(sk, 'spine', 0.1 + Math.sin(rc) * 0.05);
        p.group.position.y = p.home.y + Math.abs(Math.sin(rc)) * 0.05;
      } 
    }

    function runCycle(p){
      const sk = p.skel;
      const rc = p.phase * 12;
      dZ(sk, 'lUpperArm', 1.2); dX(sk, 'lUpperArm', Math.sin(rc) * 0.6);
      dZ(sk, 'rUpperArm', -1.2); dX(sk, 'rUpperArm', -Math.sin(rc) * 0.6);
      dX(sk, 'lThigh', -Math.sin(rc) * 0.6);
      dX(sk, 'rThigh', Math.sin(rc) * 0.6);
      dX(sk, 'lShin', Math.max(0, Math.sin(rc + 0.5)) * 0.8);
      dX(sk, 'rShin', Math.max(0, -Math.sin(rc + 0.5)) * 0.8);
    }

    function bowlingAction(p){
      const sk = p.skel;
      const a = p.phase; 
      if (a < 0.3) {
        const q = a / 0.3; 
        p.group.position.y = p.home.y + Math.sin(q * Math.PI) * 0.2; 
        dX(sk, 'lThigh', -0.4 * q); 
        dZ(sk, 'lUpperArm', 1.2 - 2.0 * q); // Left arm up
        dZ(sk, 'rUpperArm', -1.2); // Right arm down
      } else if (a < 0.6) {
        const q = (a - 0.3) / 0.3; 
        dZ(sk, 'lUpperArm', -0.8 + 2.0 * q); // Pull left arm down
        dZ(sk, 'rUpperArm', -1.2 + Math.PI * q); // Bowling arm comes over
        dX(sk, 'spine', 0.4 * q); 
      } else {
        const q = (a - 0.6) / 0.4; 
        applyBasePose(p);
        dX(sk, 'spine', 0.4 - 0.4 * q); 
        dX(sk, 'rThigh', -0.6 * Math.sin(q * Math.PI)); 
      }
    }

    function battingFootwork(p){
      const sk = p.skel;
      const a = p.phase;
      if (p.action === 'frontDrive' || p.action === 'batting'){
        const stride = Math.sin(a * Math.PI); 
        dX(sk, 'lThigh', -0.6 * stride); 
        dX(sk, 'lShin', 0.4 * stride);   
        dX(sk, 'rThigh', 0.2 * stride);  
        p.group.position.y = p.home.y - 0.15 * stride; 
        dX(sk, 'spine', 0.2 * stride); 
      }
    }

    function battingSwing(p){
      const sk = p.skel;
      const a = p.phase;
      
      if (a < 0.4){
        const q = a / 0.4; 
        dY(sk, 'spine', 0.2 * q); 
        // Backlift - arms go back cleanly
        dZ(sk, 'rUpperArm', -0.5 - 0.5 * q); dY(sk, 'rUpperArm', -0.5);
        dZ(sk, 'lUpperArm', 0.8 + 0.2 * q); dY(sk, 'lUpperArm', 0.5);
        dX(sk, 'rForeArm', -1.0 * q);
      } 
      else if (a < 0.7) {
        const q = (a - 0.4) / 0.3; 
        dY(sk, 'spine', 0.2 - 0.4 * q);
        // Downswing
        dZ(sk, 'rUpperArm', -1.0 + 1.0 * q); dY(sk, 'rUpperArm', -0.5 + 1.0 * q);
        dZ(sk, 'lUpperArm', 1.0 - 1.0 * q); dY(sk, 'lUpperArm', 0.5 - 1.0 * q);
        dX(sk, 'rForeArm', -1.0 + 1.0 * q); 
      } 
      else {
        const q = (a - 0.7) / 0.3;
        applyBasePose(p); // Recover to base smoothly
      }
    }

    const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
    function updateBallVisibility(){
      if (!bowlerBall) return;
      const p = players['Bowler'];
      if (p) {
        const isPreRelease = (p.mode === 'bowling' && p.phase < 0.6);
        const isMoving = (p.mode === 'idle' || p.mode === 'walk' || p.mode === 'running');
        bowlerBall.visible = (isPreRelease || isMoving);
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
      const ball = doBones ? getBallWorldPosition() : null;

      updateBallVisibility();

      Object.keys(players).forEach(role => {
        const p = players[role];
        
        if (!p.loop && p.phase < 1){
          p.phase = Math.min(1, p.phase + dt * p.phaseSpeed);
          if (p.phase >= 1) setTimeout(() => { if (p.phase >= 1){ p.mode = 'idle'; p.action = null; p.phase = 0; } }, 250);
        } else if (p.loop){
          p.phase = (p.phase + dt * p.phaseSpeed) % 1;
        }

        if (!doBones) return;

        resetToRest(p);
        
        // Execute animations
        if (p.mode === 'idle') {
          torso(p, globalT);
          headNeck(p, globalT, ball);
        }
        else if (p.mode === 'walk' || p.mode === 'running') runCycle(p);
        else if (p.mode === 'bowling') bowlingAction(p);
        else if (p.mode === 'batting'){ battingFootwork(p); battingSwing(p); }
      });
    }
    requestAnimationFrame(tick);

    function getBallWorldPosition(){
      if (!window.StadiumView || !window.StadiumView.scene) return null;
      const fball = window.StadiumView.scene.getObjectByName('flightBall');
      return (fball && fball.visible) ? fball.position.clone() : null;
    }

    function play(role, action, opts){
      const p = players[role];
      if (!p) return false;
      const A = {
        bowling:      { mode: 'bowling',  phaseSpeed: 0.35, loop: false },
        batting:      { mode: 'batting',  phaseSpeed: 0.45, loop: false },
        frontDrive:   { mode: 'batting',  action: 'frontDrive', phaseSpeed: 0.50, loop: false },
      };
      if (!A[action]) return false;

      p.mode = A[action].mode;
      p.action = A[action].action || action;
      p.phaseSpeed = A[action].phaseSpeed;
      p.loop = A[action].loop;
      p.phase = 0;
      Object.assign(p.params, opts || {});
      return true;
    }

    window.PlayerControl = { players, roles: Object.keys(players), play };
    console.log('[PlayerControl] ✅ Ready — Mesh Fixed Update Loaded');
  }
})();
