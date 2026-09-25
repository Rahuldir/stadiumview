/* ══════════════════════════════════════════════════════════════
   StadiumView — scene builder for 4-GLB setup
   Loads: stadium.glb · player.glb · bat.glb · stump.glb
   Spawns: 15 players, 2 bats, 2 stumps, 1 ball
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[stadium.js] start', 'color:#00e676;font-weight:bold');

  const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const PIXEL_RATIO = IS_MOBILE ? 1 : Math.min(devicePixelRatio || 1/* ══════════════════════════════════════════════════════════════
   StadiumView — Kinematics v13.0 (Absolute Color & Rotation Fix)
   • FIXED: Fielders rotated 180° to fix inverted GLTF forward axes.
   • FIXED: Aggressive material targeting (colors everything except skin/hair).
   • LIVERY: Mumbai Blue/Gold for fielding, Red/Yellow for Batsmen.
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[players.js] IIFE started — kinematics v13.0 (Color & Target Fix)', 'color:#ff00ea;font-weight:bold');

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
  //  THE MAIN ROLES (Hardcoded absolute positions & rotations)
  // ═════════════════════════════════════════════════════════════
  const STANCE_OVERRIDES = {
    'Striker':          { x: -0.32, z: 8.8,   rotY: Math.PI * 0.72, batTilt: 0.25 },
    'Non-Striker':      { x: 1.05,  z: -9.5,  rotY: -Math.PI * 0.22, batTilt: 0.25 },
    'Bowler':           { x: 0.6,   z: -24,   rotY: 0 },
    'Keeper':           { x: -0.32, z: 12.5,  rotY: 0 }, 
    'UmpireBowlersEnd': { x: 0.5,   z: -11.5, rotY: 0 },
    'UmpireSquareLeg':  { x: -14,   z: 8.8,   rotY: Math.PI / 2 }
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

    return { bones, slots, rest: {} };
  }

  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _targetDown = new THREE.Vector3(0, -1, 0);
  const _parentQ = new THREE.Quaternion(), _invParentQ = new THREE.Quaternion();
  const _worldRot = new THREE.Quaternion(), _newLocalQ = new THREE.Quaternion();

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
  //  AGGRESSIVE JERSEY RE-COLORING ENGINE
  // ═════════════════════════════════════════════════════════════
  function applyJerseyColors(role, group) {
    group.traverse(c => {
      if (c.isMesh && c.material) {
        // Handle models with multi-materials (arrays) safely
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        
        const newMats = mats.map(m => {
          // If the material is named skin/face/hair, LEAVE IT ALONE
          if (/skin|face|hair|body|eye|mouth|teeth/i.test(m.name) || /skin|face|hair/i.test(c.name)) {
            return m; 
          }
          
          let clone = m.clone();
          if (role === 'Striker' || role === 'Non-Striker') {
            // Batsmen Livery (Red and Yellow)
            if(clone.color) clone.color.setHex(0xE31837); 
            if(clone.emissive) { clone.emissive.setHex(0xFFD700); clone.emissiveIntensity = 0.25; } 
          } else if (role.includes('Umpire')) {
            // Umpires
            if(clone.color) clone.color.setHex(0x111111);
          } else {
            // Mumbai Indians (Blue and Gold)
            if(clone.color) clone.color.setHex(0x004BA0); 
            if(clone.emissive) { clone.emissive.setHex(0xD4AF37); clone.emissiveIntensity = 0.25; }
          }
          return clone;
        });

        // Reapply the safely cloned materials
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
      // AUTO-TARGETING (Inverted to fix the models facing backwards)
      const targetX = 0;
      const targetZ = 8.8;
      const dx = targetX - group.position.x;
      const dz = targetZ - group.position.z;
      group.rotation.y = Math.atan2(dx, dz); // Math.PI removed to flip them towards pitch
    }
    
    group.updateMatrixWorld(true);
    bakeRestPose(skel);
    calibrateRig(skel);
    applyJerseyColors(role, group); 

    const playerObj = {
      role, group, skel, stance: stance || null,
      mode: 'idle', action: null, phase: 0, phaseSpeed: 1, loop: true,
      batObj: (accessoryRef && accessoryRef.bat) ? accessoryRef.bat : null,
      ballObj: (accessoryRef && accessoryRef.ball) ? accessoryRef.ball : null,
      home: { x: group.position.x, y: group.position.y, z: group.position.z, rotY: group.rotation.y }
    };
    
    if (playerObj.batObj && playerObj.batObj.parent) playerObj.batObj.parent.remove(playerObj.batObj);
    if (playerObj.ballObj && playerObj.ballObj.parent) playerObj.ballObj.parent.remove(playerObj.ballObj);
    if (playerObj.batObj) window.StadiumView.scene.add(playerObj.batObj);
    if (playerObj.ballObj) window.StadiumView.scene.add(playerObj.ballObj);

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
    
    function lockAccessories(p) {
      if (p.batObj && p.skel.slots.rHand) {
         p.skel.slots.rHand.updateMatrixWorld(true);
         const handPos = new THREE.Vector3();
         p.skel.slots.rHand.getWorldPosition(handPos);
         const worldRot = p.group.rotation.y;
         p.batObj.quaternion.setFromEuler(new THREE.Euler(Math.PI * 0.4, worldRot, 0, 'YXZ'));
         const handleOffset = new THREE.Vector3(0, 0.45, 0).applyQuaternion(p.batObj.quaternion);
         p.batObj.position.copy(handPos).sub(handleOffset);
      }
      if (p.ballObj && p.skel.slots.rHand) {
         p.skel.slots.rHand.updateMatrixWorld(true);
         const handPos = new THREE.Vector3();
         p.skel.slots.rHand.getWorldPosition(handPos);
         p.ballObj.position.copy(handPos);
         p.ballObj.scale.set(1.5, 1.5, 1.5);
      }
    }

    function resetToRest(p){
      BONE_SLOTS.forEach(slot => {
        if (p.skel.slots[slot] && p.skel.rest[slot]) p.skel.slots[slot].quaternion.copy(p.skel.rest[slot]);
      });
      p.group.position.y = p.home.y;
    }

    function torso(p, t){
      const sk = p.skel;
      if (p.mode === 'idle'){
        if (p.role === 'Striker') {
          dBend(sk, 'lThigh', -0.3); dBend(sk, 'lShin', 0.4);
          dBend(sk, 'rThigh', -0.3); dBend(sk, 'rShin', 0.4);
          p.group.position.y = p.home.y - 0.15; 
          
          if(sk.slots.lUpperArm) pointBoneDown(sk.slots.lUpperArm, new THREE.Vector3(0.5, -0.5, 0.5).normalize());
          if(sk.slots.rUpperArm) pointBoneDown(sk.slots.rUpperArm, new THREE.Vector3(0.5, -0.5, 0.5).normalize());
        }
        else if (p.role === 'Keeper') {
          dBend(sk, 'lThigh', -1.4); dBend(sk, 'lShin', 1.8); 
          dBend(sk, 'rThigh', -1.4); dBend(sk, 'rShin', 1.8); 
          p.group.position.y = p.home.y - 0.65; 
          
          if(sk.slots.lUpperArm) pointBoneDown(sk.slots.lUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
          if(sk.slots.rUpperArm) pointBoneDown(sk.slots.rUpperArm, new THREE.Vector3(0, -0.5, 0.8).normalize());
        }
        else {
           dBend(sk, 'lThigh', -0.1); dBend(sk, 'rThigh', -0.1);
        }
      } 
    }

    function runCycle(p){
      const rc = p.phase * 12;
      dBend(p.skel, 'lThigh', -Math.sin(rc) * 0.8);
      dBend(p.skel, 'rThigh', Math.sin(rc) * 0.8);
    }
    
    function battingFootwork(p){
      const sk = p.skel;
      const a = p.phase;
      if (p.action === 'frontDrive' || p.action === 'batting'){
        const stride = Math.sin(a * Math.PI); 
        dBend(sk, 'lThigh', -0.8 * stride); 
        dBend(sk, 'lShin', 0.6 * stride);   
        dBend(sk, 'rThigh', 0.3 * stride);  
        p.group.position.y = p.home.y - 0.25 * stride; 
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
          else if (p.mode === 'walk' || p.mode === 'running') runCycle(p);
          else if (p.mode === 'batting') battingFootwork(p); 
          
          lockAccessories(p);
        }
      });
      
      const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
      if(bowlerBall && players['Bowler']){
          bowlerBall.visible = (players['Bowler'].mode === 'idle' || players['Bowler'].mode === 'walk');
      }
    }
    requestAnimationFrame(tick);

    function play(role, action, opts){
      const p = players[role];
      if (!p) return false;
      const A = {
        bowling:      { mode: 'bowling',  phaseSpeed: 0.35, loop: false },
        batting:      { mode: 'batting',  phaseSpeed: 0.45, loop: false },
        frontDrive:   { mode: 'batting',  action: 'frontDrive', phaseSpeed: 0.50, loop: false },
      };
      if (!A[action]) return false;
      p.mode = A[action].mode; p.action = action; p.phaseSpeed = A[action].phaseSpeed; p.loop = A[action].loop; p.phase = 0;
      return true;
    }

    window.PlayerControl = { players, play };
    console.log('[PlayerControl] ✅ Ready — Colors & Rotations Applied');
  }
})();, 2);

  const FILES = {
    stadium: 'models/stadium.glb',
    player:  'models/player.glb',
    bat:     'models/bat.glb',
    stump:   'models/stump.glb'
  };

  const STADIUM_SIZE    = 200;
  const PLAYER_HEIGHT   = 1.80;
  const BAT_LENGTH      = 0.96;
  const STUMPS_HEIGHT   = 0.71;
  const BOUNDARY_RADIUS = 38;

  // Field positions (real cricket formation)
  const ROLES = [
    { role:'Striker',            x: -0.30, z:  8.8,  rotY: Math.PI * 0.72, bat: true  },
    { role:'Non-Striker',        x:  1.00, z: -8.8,  rotY: -Math.PI * 0.22, bat: true  },
    { role:'Umpire (Bowl End)',  x: -1.10, z: -11.5, rotY: 0                            },
    { role:'Umpire (Sq Leg)',    x: -13,   z:  0,    rotY: Math.PI * 0.5                },
    { role:'Bowler',             x:  0.60, z: -24,   rotY: 0,              ball: true },
    { role:'Keeper',             x: -0.30, z:  12.6, rotY: Math.PI                      },
    { role:'Slip',               x:  2.4,  z:  13.5, rotY: Math.PI                      },
    { role:'Third Man',          x:  15,   z:  22,   rotY: Math.PI * 0.9                },
    { role:'Point',              x:  24,   z:  5,    rotY: Math.PI * 0.85               },
    { role:'Cover',              x:  21,   z: -14,   rotY: Math.PI * 0.62               },
    { role:'Mid-Off',            x:  9,    z: -25,   rotY: Math.PI * 0.12               },
    { role:'Mid-On',             x: -9,    z: -25,   rotY: -Math.PI * 0.12              },
    { role:'Mid-Wicket',         x: -22,   z: -14,   rotY: -Math.PI * 0.6               },
    { role:'Square Leg',         x: -24,   z:  4,    rotY: -Math.PI * 0.85              },
    { role:'Fine Leg',           x: -15,   z:  22,   rotY: Math.PI * 1.15               }
  ];

  const TOWER_POS = [[82,82],[-82,82],[82,-82],[-82,-82]];
  const TOWER_Y   = 46;

  // ─── Scene ─────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.2, 2500);

  const renderer = new THREE.WebGLRenderer({
    antialias: !IS_MOBILE,
    powerPreference: IS_MOBILE ? 'default' : 'high-performance'
  });
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(90, 200, 90);
  scene.add(sun);

  // ─── Loader ────────────────────────────────────────────
  const loader = new THREE.GLTFLoader();

  const progress = { total: 4, done: 0 };
  function tick(){
    progress.done++;
    const sub = document.getElementById('loaderSub');
    const txt = document.getElementById('loaderText');
    if (sub) sub.textContent = progress.done + ' / ' + progress.total;
    if (txt && progress.done === progress.total) txt.textContent = 'Ready';
  }

  function loadGLB(key, url){
    return new Promise(resolve => {
      loader.load(url, gltf => {
        console.log('[loaded]', key);
        tick();
        resolve(gltf.scene || gltf.scenes[0]);
      }, undefined, err => {
        console.warn('[failed]', key, err);
        tick();
        resolve(null);
      });
    });
  }

  // ─── Helpers ───────────────────────────────────────────
  function scaleToHeight(obj, h){
    obj.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    if (size.y === 0) return 1;
    const s = h / size.y;
    obj.scale.setScalar(s);
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;
    obj.updateMatrixWorld(true);
    return s;
  }
  function scaleToMaxDim(obj, m){
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    const md = Math.max(size.x, size.y, size.z);
    if (md === 0) return 1;
    const s = m / md;
    obj.scale.setScalar(s);
    obj.updateMatrixWorld(true);
    return s;
  }
  function bottomToZero(obj){
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;
  }
  function makeStandard(obj){
    obj.traverse(c => {
      if (!c.isMesh) return;
      if (!c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach(m => {
        m.side = THREE.FrontSide;
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        if (typeof m.roughness === 'number') m.roughness = 0.8;
        if (typeof m.metalness === 'number') m.metalness = 0;
        if (m.emissive) m.emissive.setHex(0x000000);
        m.needsUpdate = true;
      });
    });
  }

  // ─── Field level ───────────────────────────────────────
  let fieldY = 0;
  let stadiumModel = null;

  function findFieldLevel(model){
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const counts = {};
    for (let x = -15; x <= 15; x += 3){
      for (let z = -15; z <= 15; z += 3){
        ray.set(new THREE.Vector3(x, 100, z), down);
        const hits = ray.intersectObject(model, true);
        if (hits.length){
          const key = Math.round(hits[0].point.y * 10) / 10;
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    }
    let bestY = 0, bestCount = 0;
    for (const k in counts){
      if (counts[k] > bestCount){ bestCount = counts[k]; bestY = parseFloat(k); }
    }
    return bestCount >= 3 ? bestY : 0;
  }

  // ══════════════════════════════════════════════════════
  //  MAIN
  // ══════════════════════════════════════════════════════
  async function boot(){
    const [stadiumGLB, playerGLB, batGLB, stumpGLB] = await Promise.all([
      loadGLB('stadium', FILES.stadium),
      loadGLB('player',  FILES.player),
      loadGLB('bat',     FILES.bat),
      loadGLB('stump',   FILES.stump)
    ]);

    // ─── Stadium ─────────────────────────────────────
    if (stadiumGLB){
      stadiumModel = stadiumGLB;
      scaleToMaxDim(stadiumModel, STADIUM_SIZE);
      bottomToZero(stadiumModel);
      stadiumModel.position.set(0, 0, 0);
      makeStandard(stadiumModel);
      scene.add(stadiumModel);

      fieldY = findFieldLevel(stadiumModel);
      console.log('[fieldY]', fieldY.toFixed(2));
    }

    // ─── Flood light towers ──────────────────────────
    const floodLights = [];
    TOWER_POS.forEach(([x, z]) => {
      const spot = new THREE.SpotLight(
        0xffe9c0, 0, 400, Math.PI * 0.18, 0.65, 0.0
      );
      spot.position.set(x, fieldY + TOWER_Y, z);
      spot.target.position.set(0, fieldY, 0);
      scene.add(spot); scene.add(spot.target);

      // Visible glow panel
      const panelMat = new THREE.MeshBasicMaterial({
        color: 0x111111, transparent: true, opacity: 0,
        side: THREE.DoubleSide, toneMapped: false
      });
      const len = Math.hypot(x, z);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), panelMat);
      panel.position.set(x - x/len * 0.6, fieldY + TOWER_Y - 1.5, z - z/len * 0.6);
      panel.lookAt(0, fieldY, 0);
      scene.add(panel);

      floodLights.push({
        spot, panelMat,
        setGlow: v => {
          spot.intensity = v * 1.8;
          panelMat.opacity = v;
          panelMat.color.setRGB(0.15 + v*0.85, 0.15 + v*0.85, 0.10 + v*0.90);
        }
      });
    });

    // ─── Stumps (2 sets) ─────────────────────────────
    function placeStumps(z){
      if (!stumpGLB) return null;
      const g = THREE.SkeletonUtils.clone(stumpGLB) || stumpGLB.clone(true);
      makeStandard(g);
      scaleToHeight(g, STUMPS_HEIGHT);
      g.position.set(0, fieldY, z);
      scene.add(g);
      return g;
    }
    const stumpsA = placeStumps(10);
    const stumpsB = placeStumps(-10);

    // ─── Players ─────────────────────────────────────
    const playerRefs = {};
    const accessoryRefs = {};

    ROLES.forEach(r => {
      const group = new THREE.Group();
      group.name = 'PLAYER_' + r.role.replace(/[^a-z0-9]/gi, '_');
      group.userData.role = r.role;

      if (playerGLB){
        const model = THREE.SkeletonUtils.clone
          ? THREE.SkeletonUtils.clone(playerGLB)
          : playerGLB.clone(true);
        makeStandard(model);
        scaleToHeight(model, PLAYER_HEIGHT);
        group.add(model);
      } else {
        // Fallback capsule
        const cap = new THREE.Mesh(
          new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.3, 1.2, 4, 8) : new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8),
          new THREE.MeshStandardMaterial({ color: 0x004BA0 })
        );
        cap.position.y = 0.9;
        group.add(cap);
      }

      group.position.set(r.x, fieldY, r.z);
      group.rotation.y = r.rotY || 0;
      scene.add(group);
      playerRefs[r.role] = group;

      // Bat
      if (r.bat && batGLB){
        const bat = THREE.SkeletonUtils.clone ? THREE.SkeletonUtils.clone(batGLB) : batGLB.clone(true);
        makeStandard(bat);
        scaleToHeight(bat, BAT_LENGTH);
        bat.visible = true;
        scene.add(bat);
        accessoryRefs[r.role] = accessoryRefs[r.role] || {};
        accessoryRefs[r.role].bat = bat;
      }

      // Ball (small red sphere, no glb)
      if (r.ball){
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.036, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
        );
        scene.add(ball);
        accessoryRefs[r.role] = accessoryRefs[r.role] || {};
        accessoryRefs[r.role].ball = ball;
      }
    });

    console.log('[players]', Object.keys(playerRefs).length);

    // ─── Public API ──────────────────────────────────
    window.StadiumView = {
      scene, camera, renderer,
      sun, hemi, ambient,
      stadiumModel,
      fieldY,
      players: playerRefs,
      accessories: accessoryRefs,
      stumpsA, stumpsB,
      BOUNDARY_RADIUS,
      floodLights,
      setFloodlights(v){ floodLights.forEach(f => f.setGlow(v)); }
    };

    console.log('[stadium.js] ready · fieldY=' + fieldY.toFixed(2));
  }

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // Render loop
  const fpsEl = document.getElementById('fps');
  let frames = 0, lastFps = performance.now();
  function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - lastFps >= 1000){
      if (fpsEl) fpsEl.textContent = frames + ' FPS';
      frames = 0; lastFps = now;
    }
  }

  boot().catch(e => console.error('[stadium.js] boot failed', e));
  animate();

})();
