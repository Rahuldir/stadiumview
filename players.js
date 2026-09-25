/* ══════════════════════════════════════════════════════════════
   StadiumView — Full Procedural Kinematics & Body Part Mapping
   • Complete bone discovery (name + hierarchy fallback)
   • All 9 action tables implemented:
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
   • Public API: PlayerControl.play(role, action)
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — full kinematics v1.0', 'color:#00e676;font-weight:bold');

  let attempts = 0;
  const MAX_ATTEMPTS = 40;

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
      console.warn('[players.js] gave up after ' + MAX_ATTEMPTS + ' attempts');
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
  //  SKELETON — discovers bones, caches rest quaternions
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

    // Spine chain
    if (/hips$|hip$|_hips|pelvis/.test(n) && !/left|right|_l|_r/.test(n)) return 'hips';
    if (/spine2|spine_02|chest|spine1$/.test(n)) return 'chest';
    if (/spine/.test(n)) return 'spine';
    if (/neck/.test(n)) return 'neck';
    if (/^(head|.*_head)$/.test(n) && !/headwear/.test(n)) return 'head';

    // Clavicle / shoulder
    if (/shoulder|clavicle/.test(n)) return L ? 'lShoulder' : R ? 'rShoulder' : null;

    // Upper arm — must not be shoulder/fore/hand
    if (/upperarm|upper_arm/.test(n)) return L ? 'lUpperArm' : R ? 'rUpperArm' : null;
    if (/arm/.test(n) && !/fore|lower|hand|finger|thumb/.test(n)){
      if (/shoulder/.test(n)) return null;
      return L ? 'lUpperArm' : R ? 'rUpperArm' : null;
    }

    // Forearm
    if (/forearm|lowerarm|lower_arm|elbow/.test(n)) return L ? 'lForeArm' : R ? 'rForeArm' : null;

    // Hand / wrist
    if (/hand|wrist/.test(n) && !/finger|thumb|index|pinky|middle|ring/.test(n)){
      return L ? 'lHand' : R ? 'rHand' : null;
    }

    // Legs
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

  // World X based left/right fallback when names are ambiguous
  function inferSide(bone, hipsWorld){
    const p = new THREE.Vector3();
    bone.getWorldPosition(p);
    return (p.x - hipsWorld.x) >= 0 ? 'r' : 'l';
  }

  function buildSkeleton(root){
    const bones = [];
    root.traverse(function(c){
      if (c.isBone || c.type === 'Bone') bones.push(c);
    });
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

    // Hierarchy fallback for missing slots
    function parentOf(b){ return b && b.parent && (b.parent.isBone || b.parent.type === 'Bone') ? b.parent : null; }

    if (!slots.hips && bones.length){
      // Find deepest root with 2+ children — often hips
      let best = null, bestDepth = -1;
      bones.forEach(function(b){
        let count = 0, d = 0, p = b;
        while (parentOf(p)){ d++; p = parentOf(p); }
        b.children.forEach(function(c){ if (c.isBone || c.type === 'Bone') count++; });
        if (count >= 3 && d > bestDepth){ bestDepth = d; best = b; }
      });
      slots.hips = best || bones[0];
    }
    if (!slots.chest && slots.spine) slots.chest = slots.spine;
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
    if (!slots.neck && slots.chest){
      slots.chest.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.neck && /neck/i.test(c.name || '')) slots.neck = c;
      });
    }
    if (!slots.head && slots.neck){
      slots.neck.children.forEach(function(c){
        if ((c.isBone || c.type === 'Bone') && !slots.head && /head/i.test(c.name || '')) slots.head = c;
      });
    }

    // Arm chain recovery — from forearm parent, from hand parent, etc.
    if (!slots.lUpperArm && slots.lForeArm) slots.lUpperArm = parentOf(slots.lForeArm);
    if (!slots.rUpperArm && slots.rForeArm) slots.rUpperArm = parentOf(slots.rForeArm);
    if (!slots.lForeArm && slots.lHand)      slots.lForeArm = parentOf(slots.lHand);
    if (!slots.rForeArm && slots.rHand)      slots.rForeArm = parentOf(slots.rHand);
    if (!slots.lHand && slots.lForeArm && slots.lForeArm.children.length){
      slots.lHand = slots.lForeArm.children.find(function(c){ return c.isBone || c.type === 'Bone'; }) || null;
    }
    if (!slots.rHand && slots.rForeArm && slots.rForeArm.children.length){
      slots.rHand = slots.rForeArm.children.find(function(c){ return c.isBone || c.type === 'Bone'; }) || null;
    }

    // Leg chain recovery
    if (!slots.lShin && slots.lFoot)   slots.lShin   = parentOf(slots.lFoot);
    if (!slots.rShin && slots.rFoot)   slots.rShin   = parentOf(slots.rFoot);
    if (!slots.lFoot && slots.lShin){
      slots.lFoot = slots.lShin.children.find(function(c){ return c.isBone || c.type === 'Bone'; }) || null;
    }
    if (!slots.rFoot && slots.rShin){
      slots.rFoot = slots.rShin.children.find(function(c){ return c.isBone || c.type === 'Bone'; }) || null;
    }

    // Fallback: use hips children to find thighs
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

    // Cache rest quaternions
    const rest = {};
    BONE_SLOTS.forEach(function(slot){
      if (slots[slot]) rest[slot] = slots[slot].quaternion.clone();
    });

    return { bones: bones, slots: slots, rest: rest };
  }

  // Apply delta quaternion on top of rest
  const _qa = new THREE.Quaternion();
  const _qb = new THREE.Quaternion();
  function applyDelta(skel, slot, axis, angle){
    const b = skel.slots[slot];
    if (!b || !skel.rest[slot]) return;
    _qa.setFromAxisAngle(axis, angle);
    _qb.copy(skel.rest[slot]).multiply(_qa);
    b.quaternion.copy(_qb);
  }

  // Compound: multiple axes
  function applyDeltaX(skel, slot, angle, restQ){
    const b = skel.slots[slot];
    if (!b) return;
    const base = restQ || skel.rest[slot];
    if (!base) return;
    _qa.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
    _qb.copy(base).multiply(_qa);
    b.quaternion.copy(_qb);
  }
  function applyDeltaY(skel, slot, angle, restQ){
    const b = skel.slots[slot];
    if (!b) return;
    const base = restQ || skel.rest[slot];
    if (!base) return;
    _qa.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    _qb.copy(base).multiply(_qa);
    b.quaternion.copy(_qb);
  }
  function applyDeltaZ(skel, slot, angle, restQ){
    const b = skel.slots[slot];
    if (!b) return;
    const base = restQ || skel.rest[slot];
    if (!base) return;
    _qa.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
    _qb.copy(base).multiply(_qa);
    b.quaternion.copy(_qb);
  }

  // ═════════════════════════════════════════════════════════════
  //  RIG-SPECIFIC CALIBRATION
  //  Detects which local axis corresponds to "swing forward" for the
  //  arms and legs on this particular model. Runs once per player.
  // ═════════════════════════════════════════════════════════════
  function calibrateRig(skel){
    // Test: apply -0.5 rad on X, Y, Z to lUpperArm; keep whichever makes
    // the lHand move closest to straight down. Same for lThigh.
    function distFromHipToChild(slot, childSlot, axis){
      const b = skel.slots[slot], c = skel.slots[childSlot];
      if (!b || !c) return Infinity;
      const rest = skel.rest[slot].clone();
      const test = new THREE.Quaternion().setFromAxisAngle(axis, 0.4);
      b.quaternion.copy(rest).multiply(test);
      b.updateMatrixWorld(true);
      const pw = new THREE.Vector3(); c.getWorldPosition(pw);
      // Distance from world origin upwards
      b.quaternion.copy(rest);
      b.updateMatrixWorld(true);
      return pw.y;
    }
    const X = new THREE.Vector3(1,0,0), Y = new THREE.Vector3(0,1,0), Z = new THREE.Vector3(0,0,1);
    // For arms we want the hand LOWEST → min y. Calibrate sign too.
    const results = [X, Y, Z].map(function(axis){
      let best = Infinity, sign = 1;
      [0.6, -0.6].forEach(function(s){
        const b = skel.slots.lUpperArm;
        if (!b) return;
        const rest = skel.rest.lUpperArm.clone();
        const test = new THREE.Quaternion().setFromAxisAngle(axis, s);
        b.quaternion.copy(rest).multiply(test);
        b.updateMatrixWorld(true);
        const pw = new THREE.Vector3();
        if (skel.slots.lHand) skel.slots.lHand.getWorldPosition(pw);
        else if (skel.slots.lForeArm) skel.slots.lForeArm.getWorldPosition(pw);
        if (pw.y < best){ best = pw.y; sign = s > 0 ? 1 : -1; }
      });
      // restore
      if (skel.slots.lUpperArm){
        skel.slots.lUpperArm.quaternion.copy(skel.rest.lUpperArm);
        skel.slots.lUpperArm.updateMatrixWorld(true);
      }
      return { axis, best, sign };
    });
    results.sort(function(a, b){ return a.best - b.best; });
    const best = results[0];
    skel.armDownAxis = best.axis;
    skel.armDownSign = best.sign;

    // Legs — swing forward should push the foot in the +Z direction
    // (or -Z, whichever rig's forward is)
    const legResults = [X, Y, Z].map(function(axis){
      let bestZ = 0, sign = 1;
      [0.5, -0.5].forEach(function(s){
        const b = skel.slots.lThigh;
        if (!b) return;
        const rest = skel.rest.lThigh.clone();
        const test = new THREE.Quaternion().setFromAxisAngle(axis, s);
        b.quaternion.copy(rest).multiply(test);
        b.updateMatrixWorld(true);
        const pw = new THREE.Vector3();
        if (skel.slots.lFoot) skel.slots.lFoot.getWorldPosition(pw);
        else if (skel.slots.lShin) skel.slots.lShin.getWorldPosition(pw);
        if (Math.abs(pw.z) > Math.abs(bestZ)){ bestZ = pw.z; sign = s > 0 ? 1 : -1; }
      });
      if (skel.slots.lThigh){
        skel.slots.lThigh.quaternion.copy(skel.rest.lThigh);
        skel.slots.lThigh.updateMatrixWorld(true);
      }
      return { axis, bestZ, sign };
    });
    legResults.sort(function(a, b){ return Math.abs(b.bestZ) - Math.abs(a.bestZ); });
    skel.legSwingAxis  = legResults[0].axis;
    skel.legSwingSign  = legResults[0].sign;

    // Elbow / knee bending axis — pick axis that pulls hand/knee up
    skel.elbowAxis = skel.armDownAxis || X;
    skel.elbowSign = skel.armDownSign || 1;
    skel.kneeAxis  = skel.legSwingAxis || X;
    skel.kneeSign  = -1;
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
    calibrateRig(skel);
    return {
      role: role,
      group: group,
      skel: skel,
      mode: 'idle',         // idle | walk | batting | bowling | keeping | signal | throw | ambient
      action: null,         // specific action within a mode
      phase: 0,             // 0..1 for one-shots
      phaseSpeed: 1,
      loop: true,           // repeat or one-shot
      params: {},
      home: {
        x: group.position.x,
        y: group.position.y,
        z: group.position.z,
        rotY: group.rotation.y
      },
      moving: false
    };
  }

  // ═════════════════════════════════════════════════════════════
  //  BOOT
  // ═════════════════════════════════════════════════════════════
  function boot(rawPlayers){
    const roles = Object.keys(rawPlayers);
    console.log('[PlayerControl] roles:', roles.join(', '));

    const players = {};
    let totalBones = 0, totalSlots = 0;

    roles.forEach(function(r){
      const p = makePlayer(r, rawPlayers[r]);
      if (!p) return;
      players[r] = p;
      totalBones += p.skel.bones.length;
      totalSlots += BONE_SLOTS.filter(function(s){ return p.skel.slots[s]; }).length;
      console.log('[PlayerControl] ' + r +
                  ': ' + p.skel.bones.length + ' bones · ' +
                  BONE_SLOTS.filter(function(s){ return p.skel.slots[s]; }).length + '/' + BONE_SLOTS.length + ' slots matched');
    });

    if (Object.keys(players).length === 0){
      console.warn('[PlayerControl] no valid players');
      return;
    }
    console.log('[PlayerControl] total ' + totalBones + ' bones across ' +
                Object.keys(players).length + ' players');

    // Sample slot map for the first player, useful for debugging
    const firstKey = Object.keys(players)[0];
    const firstSkel = players[firstKey].skel;
    const missing = BONE_SLOTS.filter(function(s){ return !firstSkel.slots[s]; });
    if (missing.length) console.warn('[PlayerControl] missing slots in ' + firstKey + ': ' + missing.join(', '));

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION TABLES — every formula from both documents
    // ═══════════════════════════════════════════════════════════
    const X = new THREE.Vector3(1,0,0);
    const Y = new THREE.Vector3(0,1,0);
    const Z = new THREE.Vector3(0,0,1);

    // Reset all animated bones to rest before driving them
    function resetToRest(p){
      BONE_SLOTS.forEach(function(slot){
        const b = p.skel.slots[slot];
        if (b && p.skel.rest[slot]) b.quaternion.copy(p.skel.rest[slot]);
      });
      // Reset group-level transforms to home
      p.group.position.y = p.home.y;
    }

    // ────────────────────────────────────────────────────────
    //  1. HEAD & NECK
    // ────────────────────────────────────────────────────────
    function headNeck(p, t, ball){
      const sk = p.skel;
      if (p.mode === 'idle'){
        // Neck pitch: breathing nod
        const pitch = Math.sin(t * 1.5) * 0.05;
        const yaw   = Math.sin(t * 0.5) * 0.15;
        applyDeltaX(sk, 'neck', pitch);
        applyDeltaY(sk, 'head', yaw, sk.rest.head);
      } else if (p.mode === 'running' || p.mode === 'walk'){
        // Head stabilising against torso sway
        const roll = Math.sin(p.phase * 12) * 0.04;
        applyDeltaZ(sk, 'neck', roll);
      }
      // Active Play — look at ball
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

    // ────────────────────────────────────────────────────────
    //  2. TORSO & CORE
    // ────────────────────────────────────────────────────────
    function torso(p, t){
      const sk = p.skel;
      if (p.mode === 'idle'){
        applyDeltaX(sk, 'chest', Math.sin(t * 2) * 0.02);
      } else if (p.mode === 'running' || p.mode === 'walk'){
        const rc = p.phase * 12;
        applyDeltaX(sk, 'spine', 0.25 + Math.sin(rc) * 0.05);
        applyDeltaY(sk, 'spine', -Math.sin(rc) * 0.15, sk.rest.spine);
        applyDeltaZ(sk, 'spine', Math.sin(p.phase * 6) * 0.08);
        // Vertical bob
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

    // ────────────────────────────────────────────────────────
    //  3-4. ARM + LEG ARTICULATION (running)
    // ────────────────────────────────────────────────────────
    function runCycle(p){
      const sk = p.skel;
      const rc = p.phase * 12;

      // Arms
      applyDeltaX(sk, 'lUpperArm', -Math.sin(rc) * 0.8);
      applyDeltaX(sk, 'rUpperArm',  Math.sin(rc) * 0.8);
      applyDeltaX(sk, 'lForeArm', -Math.max(0.1, Math.sin(rc)) * 1.2, sk.rest.lForeArm);
      applyDeltaX(sk, 'rForeArm', -Math.max(0.1, -Math.sin(rc)) * 1.2, sk.rest.rForeArm);
      applyDeltaZ(sk, 'lHand',  Math.sin(rc) * 0.1);
      applyDeltaZ(sk, 'rHand', -Math.sin(rc) * 0.1);

      // Legs
      applyDeltaX(sk, 'lThigh',  Math.sin(rc) * 0.6);
      applyDeltaX(sk, 'rThigh', -Math.sin(rc) * 0.6);
      applyDeltaX(sk, 'lShin', Math.max(0,  Math.sin(rc + 0.5)) * 1.1, sk.rest.lShin);
      applyDeltaX(sk, 'rShin', Math.max(0, -Math.sin(rc + 0.5)) * 1.1, sk.rest.rShin);
      applyDeltaX(sk, 'lFoot',  Math.cos(rc) * 0.2, sk.rest.lFoot);
      applyDeltaX(sk, 'rFoot', -Math.cos(rc) * 0.2, sk.rest.rFoot);
    }

    // ────────────────────────────────────────────────────────
    //  5. BOWLING
    // ────────────────────────────────────────────────────────
    function bowlingAction(p){
      const sk = p.skel;
      // Right shoulder windmill
      applyDeltaX(sk, 'rUpperArm', p.phase * Math.PI * 2);
      // Left arm counter-pull
      applyDeltaX(sk, 'lUpperArm', -Math.sin(p.phase * Math.PI) * 1.5);
    }

    // ────────────────────────────────────────────────────────
    //  5. CATCHING
    // ────────────────────────────────────────────────────────
    function catchingAction(p, ball){
      if (!ball) return;
      const sk = p.skel;
      const hp = new THREE.Vector3();
      p.group.getWorldPosition(hp);
      const dist = hp.distanceTo(ball);

      // Arms up + forward — use shoulder X and Z
      applyDeltaX(sk, 'lUpperArm', -Math.PI * 0.55);
      applyDeltaX(sk, 'rUpperArm', -Math.PI * 0.55);
      applyDeltaZ(sk, 'lUpperArm', -0.3);
      applyDeltaZ(sk, 'rUpperArm',  0.3);

      const bend = Math.min(1.5, 1 / Math.max(0.2, dist));
      applyDeltaX(sk, 'lForeArm', -bend, sk.rest.lForeArm);
      applyDeltaX(sk, 'rForeArm', -bend, sk.rest.rForeArm);
    }

    // ────────────────────────────────────────────────────────
    //  6. BATTING FOOTWORK
    // ────────────────────────────────────────────────────────
    function battingFootwork(p){
      const sk = p.skel;
      const a = p.phase;
      if (p.action === 'frontDrive'){
        // Left thigh steps forward
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

    // Batting swing (from earlier table)
    function battingSwing(p){
      const sk = p.skel;
      const a = p.phase;
      // Shoulder lift
      applyDeltaZ(sk, 'lUpperArm', Math.sin(a * Math.PI) * 0.8);
      // Wrist roll after contact
      if (a > 0.6){
        applyDeltaY(sk, 'lHand', Math.PI);
        applyDeltaY(sk, 'rHand', Math.PI);
      }
    }

    // ────────────────────────────────────────────────────────
    //  7. FIELDING
    // ────────────────────────────────────────────────────────
    function throwAction(p){
      const sk = p.skel;
      const a = p.phase;
      // Windup
      applyDeltaX(sk, 'rUpperArm', -Math.cos(a * Math.PI) * 1.5);
      // Snap elbow
      const elbow = a < 0.5 ? 1.5 : Math.max(0, 1.5 - a * 3);
      applyDeltaX(sk, 'rForeArm', elbow, sk.rest.rForeArm);
    }

    function keeperDive(p){
      const sk = p.skel;
      const a = p.phase;
      const dir = p.params.diveDirection || 1;
      p.group.position.x += dir * a * 0.6;   // frame-relative motion
      p.group.position.y = p.home.y + Math.sin(a * Math.PI) * 0.4;
      applyDeltaZ(sk, 'spine', dir * a * (Math.PI / 2));
    }

    function stumping(p){
      const sk = p.skel;
      applyDeltaY(sk, 'rUpperArm', p.phase * (Math.PI / 1.5));
    }

    // ────────────────────────────────────────────────────────
    //  8. UMPIRE SIGNALS
    // ────────────────────────────────────────────────────────
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

    // ────────────────────────────────────────────────────────
    //  9. AMBIENT MICRO-ANIMATIONS
    // ────────────────────────────────────────────────────────
    function ambient(p, t){
      const sk = p.skel;
      if (p.action === 'helmet'){
        // Left arm reaches to head — crude but readable
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
    //  MAIN TICKER — drives every player every frame
    // ═══════════════════════════════════════════════════════════
    let globalT = 0;
    let lastFrame = performance.now();

    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      globalT += dt;

      const ball = getBallWorldPosition();

      Object.keys(players).forEach(function(role){
        const p = players[role];
        const sk = p.skel;

        // Reset bones to rest each frame before driving them
        resetToRest(p);

        // Advance one-shot phases
        if (!p.loop && p.phase < 1){
          p.phase = Math.min(1, p.phase + dt * p.phaseSpeed);
          if (p.phase >= 1){
            // auto-revert to idle after one-shot
            setTimeout(function(){
              if (p.phase >= 1){
                p.mode = 'idle';
                p.action = null;
                p.phase = 0;
              }
            }, 250);
          }
        } else if (p.loop){
          p.phase = (p.phase + dt * p.phaseSpeed) % 1;
        }

        // Apply kinematics by mode
        headNeck(p, globalT, ball);
        torso(p, globalT);

        if (p.mode === 'walk' || p.mode === 'running') runCycle(p);
        else if (p.mode === 'bowling')                 bowlingAction(p);
        else if (p.mode === 'batting'){
          battingFootwork(p);
          battingSwing(p);
        }
        else if (p.mode === 'catching')                catchingAction(p, ball);
        else if (p.mode === 'throw')                   throwAction(p);
        else if (p.mode === 'keeping' && p.action === 'dive')    keeperDive(p);
        else if (p.mode === 'keeping' && p.action === 'stumping') stumping(p);
        else if (p.mode === 'signal')                  umpireSignal(p);
        else if (p.mode === 'ambient')                 ambient(p, globalT);
        else if (p.mode === 'disappointed'){ /* torso handles it */ }
        else if (p.mode === 'idle'){
          // Idle arms relaxed — bend elbows slightly for natural look
          applyDeltaX(sk, 'lForeArm', -0.15, sk.rest.lForeArm);
          applyDeltaX(sk, 'rForeArm', -0.15, sk.rest.rForeArm);
        }
      });
    }
    requestAnimationFrame(tick);

    // ─── Ball lookup ────────────────────────────────────────
    function getBallWorldPosition(){
      if (!window.StadiumView || !window.StadiumView.scene) return null;
      const fball = window.StadiumView.scene.getObjectByName('flightBall');
      if (fball && fball.visible) return fball.position.clone();
      return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  KEYBOARD CONTROL (Tab / WASD / Esc)
    // ═══════════════════════════════════════════════════════════
    let selected = Object.keys(players)[0];
    const keys = {};

    document.addEventListener('keydown', function(e){
      keys[e.code] = true;
      if (e.code === 'Tab'){
        e.preventDefault();
        const r = Object.keys(players);
        const i = r.indexOf(selected);
        selected = r[(i + 1) % r.length];
        showToast('→ ' + selected);
      }
      if (e.code === 'Escape'){
        Object.keys(players).forEach(function(r){
          const p = players[r];
          p.mode = 'idle'; p.action = null; p.phase = 0;
          p.group.position.set(p.home.x, p.home.y, p.home.z);
          p.group.rotation.y = p.home.rotY;
        });
        showToast('All players reset to idle');
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
        // Switch to walk mode
        if (p.mode !== 'walk'){ p.mode = 'walk'; p.action = null; p.phase = 0; }
        showToast(selected + ' · x=' + p.group.position.x.toFixed(1) + ' z=' + p.group.position.z.toFixed(1));
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
      toast.style.cssText =
        'position:fixed;top:90px;left:16px;z-index:100;' +
        'background:rgba(8,8,12,.85);color:#00e676;' +
        'border-left:3px solid #00e676;border-radius:3px;' +
        'padding:8px 12px;font-family:JetBrains Mono,monospace;' +
        'font-size:11px;letter-spacing:1.5px;text-transform:uppercase;' +
        'pointer-events:none;opacity:0;transition:opacity .2s;';
      document.body.appendChild(toast);
    }
    let toastT = 0;
    function showToast(msg){
      toast.textContent = msg;
      toast.style.opacity = '1';
      clearTimeout(toastT);
      toastT = setTimeout(function(){ toast.style.opacity = '0'; }, 1600);
    }

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════
    function play(role, action, opts){
      const p = players[role];
      if (!p){ console.warn('[PlayerControl] no player', role); return false; }
      opts = opts || {};

      // Map action → mode + params
      const A = {
        // Cricket
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
        // Umpire
        out:          { mode: 'signal',   action: 'out',    phaseSpeed: 0.9, loop: false },
        six:          { mode: 'signal',   action: 'six',    phaseSpeed: 1.0, loop: false },
        four:         { mode: 'signal',   action: 'four',   phaseSpeed: 2.0, loop: false },
        wide:         { mode: 'signal',   action: 'wide',   phaseSpeed: 1.0, loop: false },
        noball:       { mode: 'signal',   action: 'noball', phaseSpeed: 1.0, loop: false },
        dead:         { mode: 'signal',   action: 'dead',   phaseSpeed: 1.0, loop: false },
        // Ambient
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

    window.PlayerControl = {
      players:    players,
      roles:      Object.keys(players),
      selected:   function(){ return selected; },
      select:     function(role){ if (players[role]) selected = role; },
      play:       play,
      stopAll:    stopAll,
      resetAll:   resetAll,
      // Diagnostics
      listSlots:  function(role){
        const p = players[role || selected];
        if (!p) return null;
        const out = {};
        BONE_SLOTS.forEach(function(s){
          out[s] = p.skel.slots[s] ? p.skel.slots[s].name : null;
        });
        console.table(out);
        return out;
      },
      dumpBones:  function(role){
        const p = players[role || selected];
        if (!p) return;
        console.log('[PlayerControl] ' + p.skel.bones.length + ' bones in "' + (role || selected) + '":');
        p.skel.bones.forEach(function(b){ console.log('  ' + b.name); });
      }
    };

    console.log('[PlayerControl] ✅ Ready — ' + Object.keys(players).length + ' players');
    console.log('[PlayerControl] Tab=cycle · WASD=move · Esc=reset');
    console.log('[PlayerControl] API: PlayerControl.play("Bowler", "bowling")');
    console.log('[PlayerControl] Actions: bowling, batting, frontDrive, backPunch, duck, leave,');
    console.log('[PlayerControl]          catching, throw, dive, stumping, out, six, four, wide,');
    console.log('[PlayerControl]          noball, dead, helmet, shine, stretch, celebrate, disappointed');
    showToast('Tab=cycle · WASD=move · Esc=reset');
  }

})();
