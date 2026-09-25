/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v9.0 (T-Pose Killer & Ultimate Realism)
   • FIXED: Destroys the T-Pose by forcing explicit joint rotations every frame
   • FIXED: Wicketkeeper forced into a deep, authentic crouch
   • FIXED: Batsman stance forces hands together; bat strictly locked to palm
   • FIXED: Bowler load-up and follow-through mechanics smoothed
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v9.0 (T-Pose Override)', 'color:#ff3d00;font-weight:bold');

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
    'Striker': { x: -0.32, z: 8.8, rotY: Math.PI * 0.72, batTilt: 0.25 },
    'Non-Striker': { x: 1.05, z: -9.5, rotY: -Math.PI * 0.22, batTilt: 0.25 },
    'Bowler': { x: 0.6, z: -24, rotY: 0, batTilt: 0 },
    'Keeper': { x: -0.32, z: 12.5, rotY: Math.PI }
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

    const rest = {};
    // FORCE ARMS DOWN IMMEDIATELY to override T-Pose rest state
    if (slots.lUpperArm) slots.lUpperArm.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), 1.3));
    if (slots.rUpperArm) slots.rUpperArm.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), -1.3));

    BONE_SLOTS.forEach(slot => {
      if (slots[slot]) rest[slot] = slots[slot].quaternion.clone();
    });

    return { bones, slots, rest };
  }

  // ═════════════════════════════════════════════════════════════
  //  STRICT ATTACHMENTS (Locks bat firmly to hand)
  // ═════════════════════════════════════════════════════════════
  function attachBat(bat, hand, tiltRad){
    if (!bat || !hand) return false;
    if (bat.parent) bat.parent.remove(bat);
    hand.add(bat); // Add DIRECTLY as a child of the bone
    
    // Explicit local transform to lock it to the palm
    bat.position.set(0, -0.4, 0); 
    bat.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2 + tiltRad, 0, 0, 'XYZ'));
    return true;
  }

  function attachBall(ball, hand){
    if (!ball || !hand) return false;
    if (ball.parent) ball.parent.remove(ball);
    hand.add(ball);
    
    ball.scale.set(2.0, 2.0, 2.0); // Make it highly visible
    ball.position.set(0, -0.1, 0); // Lock to palm center
    ball.quaternion.identity();
    return true;
  }

  // ═════════════════════════════════════════════════════════════
  //  PLAYER INITIALIZATION
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
      role, group, skel, stance: stance || null,
      mode: 'idle', action: null, phase: 0, phaseSpeed: 1, loop: true,
      params: {},
      home: { x: group.position.x, y: group.position.y, z: group.position.z, rotY: group.rotation.y }
    };

    if (accessoryRef && accessoryRef.bat){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand) attachBat(accessoryRef.bat, hand, stance ? stance.batTilt : 0.2);
    }
    if (accessoryRef && accessoryRef.ball){
      const hand = skel.slots.rHand || skel.slots.lHand;
      if (hand) attachBall(accessoryRef.ball, hand);
    }
    return playerObj;
  }

  // ═════════════════════════════════════════════════════════════
  //  PHYSICS ENGINE & POSE OVERRIDES
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

    function headNeck(p, t, ball){
      const sk = p.skel;
      if (p.mode === 'idle' && p.role !== 'Keeper') dX(sk, 'neck', Math.sin(t * 1.5) * 0.04);
      if (ball && (p.mode === 'batting' || p.mode === 'keeping')){
        const hp = new THREE.Vector3();
        if (sk.slots.head) sk.slots.head.getWorldPosition(hp);
        const dx = ball.x - hp.x, dy = ball.y - hp.y, dz = ball.z - hp.z;
        dY(sk, 'neck', Math.max(-0.6, Math.min(0.6, Math.atan2(dx, dz))));
      }
    }

    // ─── STRICT POSE ENFORCEMENT (Kills the T-Pose) ──────────────────────
    function torso(p, t){
      const sk = p.skel;
      if (p.mode === 'idle'){
        if (p.role === 'Striker') {
          // Batsman Stance: Knees bent, arms tightly forward holding bat
          dX(sk, 'lThigh', -0.3); dX(sk, 'lShin', 0.3);
          dX(sk, 'rThigh', -0.3); dX(sk, 'rShin', 0.3);
          dX(sk, 'spine', 0.2); 
          p.group.position.y = p.home.y - 0.1; 
          
          // Force hands together in front of waist
          dZ(sk, 'lUpperArm', 0.6); dX(sk, 'lUpperArm', -0.4); dY(sk, 'lUpperArm', 0.4); dX(sk, 'lForeArm', -0.3);
          dZ(sk, 'rUpperArm', -0.6); dX(sk, 'rUpperArm', -0.4); dY(sk, 'rUpperArm', -0.4); dX(sk, 'rForeArm', -0.3);
          
          const tap = Math.sin(t * 8) * 0.04; 
          dX(sk, 'lUpperArm', -0.4 + tap);
          dX(sk, 'rUpperArm', -0.4 + tap);
        }
        else if (p.role === 'Keeper') {
          // Keeper: Deep Squat, hands cupped forward
          dX(sk, 'lThigh', -1.2); dX(sk, 'lShin', 1.4); 
          dX(sk, 'rThigh', -1.2); dX(sk, 'rShin', 1.4); 
          dX(sk, 'spine', 0.6); 
          dX(sk, 'neck', -0.4); 
          p.group.position.y = p.home.y - 0.45; // Hips drop drastically
          
          // Arms thrust forward to catch
          dZ(sk, 'lUpperArm', 0.5); dX(sk, 'lUpperArm', -0.8); dX(sk, 'lForeArm', -0.5);
          dZ(sk, 'rUpperArm', -0.5); dX(sk, 'rUpperArm', -0.8); dX(sk, 'rForeArm', -0.5);
        }
        else {
           // Fielders: Relaxed ready stance
           dX(sk, 'lThigh', -0.1); dX(sk, 'rThigh', -0.1);
           dZ(sk, 'lUpperArm', 0.2); dZ(sk, 'rUpperArm', -0.2); // Keep arms tucked slightly
        }
      } 
      else if (p.mode === 'walk'){
        const rc = p.phase * 12;
        p.group.position.y = p.home.y + Math.abs(Math.sin(rc)) * 0.05;
      } 
    }

    function runCycle(p){
      const sk = p.skel;
      const rc = p.phase * 12;
      dX(sk, 'lUpperArm', Math.sin(rc) * 0.8);
      dX(sk, 'rUpperArm', -Math.sin(rc) * 0.8);
      dX(sk, 'lThigh', -Math.sin(rc) * 0.6);
      dX(sk, 'rThigh', Math.sin(rc) * 0.6);
      dX(sk, 'lShin', Math.max(0, Math.sin(rc + 0.5)) * 0.8);
      dX(sk, 'rShin', Math.max(0, -Math.sin(rc + 0.5)) * 0.8);
    }

    function bowlingAction(p){
      const sk = p.skel;
      const a = p.phase; 
      if (a < 0.3) {
        // Jump and Load
        const q = a / 0.3; 
        p.group.position.y = p.home.y + Math.sin(q * Math.PI) * 0.2; 
        dX(sk, 'lThigh', -0.6 * q); 
        dZ(sk, 'lUpperArm', 0.5); dX(sk, 'lUpperArm', -1.5 * q); // Front arm high
        dX(sk, 'rUpperArm', 0.5 * q); // Bowling arm low
      } else if (a < 0.6) {
        // Delivery Stride
        const q = (a - 0.3) / 0.3; 
        dX(sk, 'lUpperArm', -1.5 + 2.0 * q); // Front arm pulls down
        dX(sk, 'rUpperArm', 0.5 - Math.PI * q); // Bowling arm rotates rapidly over
        dX(sk, 'spine', 0.5 * q); // Snap spine forward
      } else {
        // Follow Through
        const q = (a - 0.6) / 0.4; 
        dX(sk, 'spine', 0.5 - 0.3 * q); 
        dX(sk, 'rThigh', -0.8 * Math.sin(q * Math.PI)); // Back leg kicks up
        dX(sk, 'rUpperArm', (0.5 - Math.PI) - 0.5 * q); // Arm follows across body
      }
    }

    function battingFootwork(p){
      const sk = p.skel;
      const a = p.phase;
      if (p.action === 'frontDrive' || p.action === 'batting'){
        const stride = Math.sin(a * Math.PI); 
        dX(sk, 'lThigh', -0.8 * stride); 
        dX(sk, 'lShin', 0.6 * stride);   
        dX(sk, 'rThigh', 0.3 * stride);  
        p.group.position.y = p.home.y - 0.25 * stride; 
        dX(sk, 'spine', 0.3 * stride); 
      }
    }

    function battingSwing(p){
      const sk = p.skel;
      const a = p.phase;
      
      if (a < 0.4){
        // High Backlift
        const q = a / 0.4; 
        dY(sk, 'spine', 0.4 * q); // Shoulder rotation
        dX(sk, 'rUpperArm', 1.5 * q); dZ(sk, 'rUpperArm', -0.5); // Right elbow high
        dX(sk, 'lUpperArm', 0.8 * q); dY(sk, 'lUpperArm', 0.5 * q);
        dX(sk, 'rForeArm', -1.2 * q); // Cock wrists
      } 
      else if (a < 0.7) {
        // Explosive Downswing
        const q = (a - 0.4) / 0.3; 
        dY(sk, 'spine', 0.4 - 0.8 * q);
        dX(sk, 'rUpperArm', 1.5 - 2.0 * q); 
        dX(sk, 'lUpperArm', 0.8 - 1.5 * q); 
        dX(sk, 'rForeArm', -1.2 + 1.2 * q); // Snap wrists
      } 
      else {
        // Follow Through wrapping over shoulder
        const q = (a - 0.7) / 0.3;
        dY(sk, 'spine', -0.4 - 0.2 * q);
        dX(sk, 'rUpperArm', -0.5 - 0.5 * q);
        dX(sk, 'lUpperArm', -0.7 - 0.5 * q);
        dX(sk, 'lForeArm', -1.5 * q); 
      }
    }

    const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
    function updateBallVisibility(){
      if (!bowlerBall) return;
      const p = players['Bowler'];
      if (p) {
        const isPreRelease = (p.mode === 'bowling' && p.phase < 0.6);
        const isMoving = (p.mode === 'idle' || p.mode === 'walk');
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
        
        if (p.mode === 'idle') {
          torso(p, globalT);
          headNeck(p, globalT, ball);
        }
        else if (p.mode === 'walk') runCycle(p);
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
    console.log('[PlayerControl] ✅ Ready — T-Pose Killed');
  }
})();
