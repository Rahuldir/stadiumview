/* ══════════════════════════════════════════════════════════════
   StadiumView — full cricket setup
   • Players hold bats / ball
   • Sight screens behind each set of stumps
   • Replay screen inside the stands
   • Bigger players for visibility
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ─── FILE PATHS ──────────────────────────────────────────────
  const STADIUM_FILE   = 'models/stadium.glb';
  const EQUIPMENT_FILE = 'models/equipment.glb';

  const PLAYER_FILES = [
    'models/p1.glb','models/p2.glb','models/p3.glb',
    'models/p4.glb','models/p5.glb','models/p6.glb','models/p7.glb'
  ];

  // ─── SIZES (metres) ──────────────────────────────────────────
  const STADIUM_SIZE    = 200;
  const EQUIPMENT_SIZE  = 4.0;
  const PLAYER_SIZE     = 2.2;      // bigger than real life for visibility
  const STUMPS_SIZE     = 0.9;      // stumps are ~71cm tall
  const BAT_SIZE        = 1.0;      // bat is ~96cm
  const BALL_SIZE       = 0.075;    // ball is 7.2cm diameter

  // ─── ROTATIONS ───────────────────────────────────────────────
  const ROT_STADIUM   = { x: 0, y: 0, z: 0 };
  const ROT_EQUIPMENT = { x: 0, y: 0, z: 0 };
  const ROT_PLAYER    = { x: 0, y: 0, z: 0 };

  // ─── STUMPS POSITIONS ────────────────────────────────────────
  const STUMPS_STRIKER    = { x: 0, y: 0, z: 10 };
  const STUMPS_NONSTRIKER = { x: 0, y: 0, z: -10 };

  // ─── 15 CRICKET POSITIONS ────────────────────────────────────
  const FIELD_POSITIONS = [
    { role: 'Striker',            x: 0.35,  y: 0, z: 9,     rotY: Math.PI },
    { role: 'Non-Striker',        x: -1.2,  y: 0, z: -9,    rotY: 0 },
    { role: 'Umpire (Bowl End)',  x: -0.7,  y: 0, z: -11.5, rotY: 0 },
    { role: 'Umpire (Sq Leg)',    x: -14,   y: 0, z: 0,     rotY: Math.PI * 0.5 },
    { role: 'Bowler',             x: 0,     y: 0, z: -14,   rotY: 0 },
    { role: 'Keeper',             x: 0,     y: 0, z: 13,    rotY: Math.PI },
    { role: 'Slip',               x: 3,     y: 0, z: 14.5,  rotY: Math.PI },
    { role: 'Point',              x: 15,    y: 0, z: 6,     rotY: Math.PI * 0.75 },
    { role: 'Cover',              x: 18,    y: 0, z: -3,    rotY: Math.PI * 0.55 },
    { role: 'Mid-Off',            x: 10,    y: 0, z: -10,   rotY: 0 },
    { role: 'Mid-On',             x: -10,   y: 0, z: -10,   rotY: 0 },
    { role: 'Mid-Wicket',         x: -18,   y: 0, z: -3,    rotY: Math.PI * 1.45 },
    { role: 'Square Leg',         x: -16,   y: 0, z: 6,     rotY: Math.PI * 1.25 },
    { role: 'Fine Leg',           x: -22,   y: 0, z: 12,    rotY: Math.PI * 1.2 },
    { role: 'Third Man',          x: 12,    y: 0, z: 14,    rotY: Math.PI }
  ];

  // ─── SCENE ───────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = new THREE.Fog(0x87b8e0, 500, 2000);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  document.body.appendChild(renderer.domElement);

  // ─── LIGHTS ──────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(80, 400, 80);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.6);
  fill.position.set(-80, 300, -80);
  scene.add(fill);

  // ─── LOADER + DRACO ──────────────────────────────────────────
  const loader = new THREE.GLTFLoader();
  if (typeof THREE.DRACOLoader === 'function'){
    try {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
      loader.setDRACOLoader(draco);
      console.log('[Loader] DRACO decoder attached ✅');
    } catch(e){ console.warn('[Loader] DRACO setup failed:', e); }
  }

  const loadStatus = {};

  function loadOne(key, url){
    loadStatus[key] = { status: 'pending' };
    updateList();
    return new Promise(function(resolve){
      loader.load(url, function(gltf){
        const model = gltf.scene || gltf.scenes[0];
        if (model && !model.name) model.name = key;
        loadStatus[key] = { status: 'loaded' };
        updateList();
        console.log('[StadiumView] ✅ ' + key);
        resolve(model);
      }, function(p){
        if (p.total){
          loadStatus[key] = { status: 'loading', pct: Math.round((p.loaded / p.total) * 100) };
          updateList();
        }
      }, function(err){
        loadStatus[key] = { status: 'failed' };
        updateList();
        console.warn('[StadiumView] ❌ ' + key + ' — ' + (err.message || 'not found'));
        resolve(null);
      });
    });
  }

  function updateList(){
    const el = document.getElementById('modelList');
    if (!el) return;
    const keys = Object.keys(loadStatus).sort();
    el.innerHTML = keys.map(function(key){
      const s = loadStatus[key];
      let icon = '⏳', cls = 'wait';
      if (s.status === 'loaded')       { icon = '✅'; cls = 'ok'; }
      else if (s.status === 'failed')  { icon = '❌'; cls = 'fail'; }
      else if (s.status === 'loading') { icon = '📥'; cls = 'wait'; }
      return '<div class="row ' + cls + '">' + icon + ' ' + key + '</div>';
    }).join('');
  }

  // ─── HELPERS ─────────────────────────────────────────────────
  function autoFit(model, targetSize){
    if (!targetSize || targetSize <= 0) return;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
  }

  function bottomToZero(model){
    model.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(model);
    model.position.y -= nb.min.y;
  }

  function enableShadows(obj){
    obj.traverse(function(c){
      if (c.isMesh && c.material){
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(function(m){
          if (m.emissive) m.emissive.setHex(0x000000);
          if (typeof m.roughness === 'number') m.roughness = 0.85;
          if (typeof m.metalness === 'number') m.metalness = 0;
          m.side = THREE.DoubleSide;
          m.needsUpdate = true;
        });
      }
    });
  }

  function shuffle(arr){
    for (let i = arr.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function findFieldLevel(stadiumModel){
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(stadiumModel, true);
    if (hits.length > 0){
      console.log('[Raycast] grass at y = ' + hits[0].point.y.toFixed(2));
      return hits[0].point.y;
    }
    return 0;
  }

  /* ═══════════════════════════════════════════════════════════
     SPLIT EQUIPMENT MODEL into bat / ball / stumps by size
     ═══════════════════════════════════════════════════════════ */
  function splitEquipment(equipmentModel){
    const parts = { bat: null, ball: null, stumps: [] };

    equipmentModel.updateMatrixWorld(true);

    equipmentModel.traverse(function(child){
      if (!child.isMesh) return;

      const box = new THREE.Box3().setFromObject(child);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const minDim = Math.min(size.x, size.y, size.z);
      const aspect = maxDim / (minDim || 0.001);

      // Bat: tall + very thin (aspect ratio > 8)
      if (aspect > 8 && maxDim > 0.5 && maxDim < 2.5){
        if (!parts.bat) parts.bat = child;
      }
      // Ball: small sphere (max dim < 0.2)
      else if (maxDim < 0.25){
        if (!parts.ball) parts.ball = child;
      }
      // Stumps: tall cylinders (max dim 0.5–1.5, thicker)
      else if (maxDim > 0.5 && maxDim < 1.6){
        parts.stumps.push(child);
      }
    });

    console.log('[Split] bat: ' + (parts.bat ? '✅' : '❌') +
                ' | ball: ' + (parts.ball ? '✅' : '❌') +
                ' | stumps meshes: ' + parts.stumps.length);
    return parts;
  }

  /* ═══════════════════════════════════════════════════════════
     BUILD SIGHT SCREEN — a white wall behind the stumps
     ═══════════════════════════════════════════════════════════ */
  function buildSightScreen(zPos, fieldY){
    const screenW = 18;    // 18m wide
    const screenH = 6;     // 6m tall
    const screenD = 0.4;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0
    });

    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(screenW, screenH, screenD),
      mat
    );
    wall.position.set(0, fieldY + screenH / 2, zPos);

    scene.add(wall);

    // Support posts behind
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    [-screenW/2 + 1, screenW/2 - 1].forEach(function(x){
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, screenH + 1, 8),
        postMat
      );
      post.position.set(x, fieldY + (screenH + 1) / 2, zPos - 0.5);
      scene.add(post);
    });

    console.log('[SightScreen] placed at z = ' + zPos);
  }

  /* ═══════════════════════════════════════════════════════════
     BUILD REPLAY SCREEN — big LED panel in the stands
     ═══════════════════════════════════════════════════════════ */
  function buildReplayScreen(x, z, rotationY, fieldY){
    const screenW = 40;
    const screenH = 22;
    const screenD = 0.5;

    // Frame
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(screenW + 2, screenH + 2, screenD),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6, metalness: 0.4 })
    );
    frame.position.set(x, fieldY + 18, z);
    frame.rotation.y = rotationY;
    scene.add(frame);

    // Screen surface — canvas-based with a brand pattern
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 576;
    const ctx = canvas.getContext('2d');

    // Dark background
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Red stripe at top and bottom
    ctx.fillStyle = '#e10600';
    ctx.fillRect(0, 0, canvas.width, 8);
    ctx.fillRect(0, canvas.height - 8, canvas.width, 8);

    // Grid pattern
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40){
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40){
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // Big text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 100px "Titillium Web", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CRICMAX', canvas.width / 2, canvas.height / 2 - 40);

    ctx.fillStyle = '#00e676';
    ctx.font = 'bold 60px "Titillium Web", Arial, sans-serif';
    ctx.fillText('REPLAY', canvas.width / 2, canvas.height / 2 + 60);

    ctx.fillStyle = '#7a8590';
    ctx.font = 'bold 28px "Titillium Web", Arial, sans-serif';
    ctx.fillText('LIVE · MATCH VIEWER', canvas.width / 2, canvas.height / 2 + 130);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;

    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(screenW, screenH),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    screenMesh.position.set(x, fieldY + 18, z + (rotationY === 0 ? 0.3 : -0.3));
    screenMesh.rotation.y = rotationY;
    scene.add(screenMesh);

    // Support legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7, metalness: 0.5 });
    [-screenW/2 + 3, screenW/2 - 3].forEach(function(dx){
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(1, 12, 1),
        legMat
      );
      leg.position.set(x + dx, fieldY + 6, z);
      leg.rotation.y = rotationY;
      scene.add(leg);
    });

    console.log('[ReplayScreen] placed at (' + x + ', ' + z + ') rotY=' + rotationY.toFixed(2));
  }

  // ─── PLACE STADIUM ───────────────────────────────────────────
  let stadiumRadius = 100;
  let fieldY = 0;

  function placeStadium(model){
    if (!model) return;
    model.rotation.set(ROT_STADIUM.x, ROT_STADIUM.y, ROT_STADIUM.z);
    autoFit(model, STADIUM_SIZE);
    enableShadows(model);
    bottomToZero(model);
    model.position.x = 0;
    model.position.z = 0;
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    stadiumRadius = Math.max(sz.x, sz.z) * 0.6;
    console.log('[Stadium] size: ' + sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1));

    fieldY = findFieldLevel(model);
  }

  /* ═══════════════════════════════════════════════════════════
     PLACE STUMPS — at both ends, using extracted stumps meshes
     ═══════════════════════════════════════════════════════════ */
  function placeStumps(stumpsMeshes, equipmentRoot){
    if (!stumpsMeshes || stumpsMeshes.length === 0){
      console.warn('[Stumps] no stumps meshes found — check equipment split');
      return;
    }

    // Build a small group from the stumps meshes
    function makeStumpGroup(){
      const g = new THREE.Group();
      stumpsMeshes.forEach(function(mesh){
        const clone = mesh.clone(true);
        // Reset to identity, then re-apply world transform of the mesh
        // (so the group's children keep their relative positions)
        clone.matrixAutoUpdate = true;
        clone.matrix.copy(mesh.matrixWorld);
        clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
        g.add(clone);
      });
      return g;
    }

    // At striker's end
    const sA = makeStumpGroup();
    const boxA = new THREE.Box3().setFromObject(sA);
    const sizeA = new THREE.Vector3();
    boxA.getSize(sizeA);
    const maxA = Math.max(sizeA.x, sizeA.y, sizeA.z);
    if (maxA > 0){
      sA.scale.multiplyScalar(STUMPS_SIZE / maxA);
    }
    // Recenter so bottom sits at y = 0
    sA.updateMatrixWorld(true);
    const nbA = new THREE.Box3().setFromObject(sA);
    sA.position.x = STUMPS_STRIKER.x - (nbA.min.x + nbA.max.x) / 2;
    sA.position.z = STUMPS_STRIKER.z - (nbA.min.z + nbA.max.z) / 2;
    sA.position.y = fieldY - nbA.min.y;
    scene.add(sA);

    // At non-striker's end
    const sB = makeStumpGroup();
    sB.scale.copy(sA.scale);
    sB.updateMatrixWorld(true);
    const nbB = new THREE.Box3().setFromObject(sB);
    sB.position.x = STUMPS_NONSTRIKER.x - (nbB.min.x + nbB.max.x) / 2;
    sB.position.z = STUMPS_NONSTRIKER.z - (nbB.min.z + nbB.max.z) / 2;
    sB.position.y = fieldY - nbB.min.y;
    scene.add(sB);

    console.log('[Stumps] placed at both ends');
  }

  /* ═══════════════════════════════════════════════════════════
     ATTACH BAT to a batsman (positioned in their hands)
     ═══════════════════════════════════════════════════════════ */
  function attachBatTo(batsmanGroup, batMesh, sideSign){
    if (!batMesh) return;
    const batClone = batMesh.clone(true);

    // Reset the clone's world transform
    batClone.position.set(0, 0, 0);
    batClone.rotation.set(0, 0, 0);
    batClone.scale.set(1, 1, 1);

    // Wrap in a group we can size independently
    const wrap = new THREE.Group();
    wrap.add(batClone);

    // Scale to BAT_SIZE
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0){
      wrap.scale.setScalar(BAT_SIZE / maxDim);
    }

    // Recenter so the bat's grip is roughly at the origin (bottom of bat)
    wrap.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(wrap);
    wrap.position.x = -(nb.min.x + nb.max.x) / 2;
    wrap.position.y = -nb.min.y;
    wrap.position.z = -(nb.min.z + nb.max.z) / 2;

    // Holder group — this is what we attach to the batsman
    const holder = new THREE.Group();
    holder.add(wrap);

    // Position in front of the batsman, at hand height
    // Note: batsman's local +z is "forward" (where they face)
    holder.position.set(sideSign * 0.35, 1.2, 0.35);

    // Rotate bat so it angles down toward the pitch (like a batsman at rest)
    holder.rotation.x = -0.6;
    holder.rotation.z = sideSign * 0.15;

    batsmanGroup.add(holder);
  }

  /* ═══════════════════════════════════════════════════════════
     ATTACH BALL to the bowler's hand
     ═══════════════════════════════════════════════════════════ */
  function attachBallTo(bowlerGroup, ballMesh){
    if (!ballMesh) return;
    const ballClone = ballMesh.clone(true);

    ballClone.position.set(0, 0, 0);
    ballClone.rotation.set(0, 0, 0);
    ballClone.scale.set(1, 1, 1);

    const wrap = new THREE.Group();
    wrap.add(ballClone);
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0){
      wrap.scale.setScalar(BALL_SIZE / maxDim);
    }

    // Holder
    const holder = new THREE.Group();
    holder.add(wrap);
    // Ball in front of the bowler, near their right hand
    holder.position.set(0.35, 1.4, 0.25);

    bowlerGroup.add(holder);
  }

  // ─── PLACE PLAYERS ───────────────────────────────────────────
  function placePlayers(models, equipmentParts){
    const valid = models.filter(function(m){ return m; });
    if (valid.length === 0){ console.warn('[Players] none loaded'); return; }

    shuffle(valid);
    console.log('[Players] Loaded ' + valid.length + ' models, need ' + FIELD_POSITIONS.length);

    for (let i = 0; i < FIELD_POSITIONS.length; i++){
      const src = valid[i % valid.length];
      const pos = FIELD_POSITIONS[i];

      // Each player is a Group so we can attach equipment
      const playerGroup = new THREE.Group();
      playerGroup.name = (src.name || ('p' + ((i % valid.length) + 1))) + '_' + pos.role.replace(/[^a-z0-9]/gi, '');

      // Clone the player model into the group
      const playerModel = src.clone(true);
      playerModel.position.set(0, 0, 0);
      playerModel.rotation.set(0, 0, 0);
      playerModel.scale.set(1, 1, 1);

      autoFit(playerModel, PLAYER_SIZE);
      enableShadows(playerModel);
      bottomToZero(playerModel);

      playerGroup.add(playerModel);

      // Attach bat to batsmen
      if (pos.role === 'Striker'){
        attachBatTo(playerGroup, equipmentParts.bat, -1);
      } else if (pos.role === 'Non-Striker'){
        attachBatTo(playerGroup, equipmentParts.bat, 1);
      }
      // Attach ball to bowler
      else if (pos.role === 'Bowler'){
        attachBallTo(playerGroup, equipmentParts.ball);
      }

      // Apply rotation + position to the GROUP
      playerGroup.rotation.x = ROT_PLAYER.x || 0;
      playerGroup.rotation.y = pos.rotY || 0;
      playerGroup.rotation.z = ROT_PLAYER.z || 0;

      playerGroup.position.x = pos.x;
      playerGroup.position.z = pos.z;
      playerGroup.position.y = fieldY;

      scene.add(playerGroup);
    }
    console.log('[Players] all 15 placed + equipped');
  }

  function setLoaderProgress(loaded, total){
    const sub = document.getElementById('loaderSub');
    const txt = document.getElementById('loaderText');
    if (sub) sub.textContent = loaded + ' / ' + total + ' models';
    if (txt && loaded === total) txt.textContent = 'Ready';
  }

  // ─── BOOT ────────────────────────────────────────────────────
  async function boot(){
    const tasks = [
      { key: 'stadium',   url: STADIUM_FILE },
      { key: 'equipment', url: EQUIPMENT_FILE }
    ].concat(PLAYER_FILES.map(function(url, i){
      return { key: 'p' + (i + 1), url: url };
    }));

    let done = 0;
    const total = tasks.length;

    const results = await Promise.all(tasks.map(function(t){
      return loadOne(t.key, t.url).then(function(m){
        done++;
        setLoaderProgress(done, total);
        return { key: t.key, model: m };
      });
    }));

    const pick = function(key){
      const r = results.find(function(x){ return x.key === key; });
      return r ? r.model : null;
    };

    // 1. Stadium first
    placeStadium(pick('stadium'));

    // 2. Split equipment into bat / ball / stumps
    const equipmentModel = pick('equipment');
    let parts = { bat: null, ball: null, stumps: [] };
    if (equipmentModel){
      parts = splitEquipment(equipmentModel);
      placeStumps(parts.stumps, equipmentModel);
    }

    // 3. Sight screens behind each set of stumps
    buildSightScreen(STUMPS_STRIKER.z + 18, fieldY);
    buildSightScreen(STUMPS_NONSTRIKER.z - 18, fieldY);

    // 4. Replay screens on two opposite sides of the ground
    //    (they face inward, in the stands)
    buildReplayScreen( 75, 0, -Math.PI / 2, fieldY);
    buildReplayScreen(-75, 0,  Math.PI / 2, fieldY);

    // 5. Players + equipment
    const playerModels = PLAYER_FILES.map(function(_, i){
      return pick('p' + (i + 1));
    }).filter(function(m){ return m; });
    playerModels.forEach(function(m, i){ if (m && !m.name) m.name = 'p' + (i + 1); });

    placePlayers(playerModels, parts);

    setTimeout(function(){
      const el = document.getElementById('loader');
      if (el) el.classList.add('hide');
    }, 400);

    window.StadiumView = {
      scene: scene,
      camera: camera,
      renderer: renderer,
      sun: sun,
      hemi: hemi,
      stadiumRadius: stadiumRadius,
      fieldY: fieldY
    };

    console.log('[StadiumView] Ready. fieldY=' + fieldY.toFixed(2) + ', radius=' + stadiumRadius.toFixed(1));
  }

  window.addEventListener('resize', function(){
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  const fpsEl = document.getElementById('fps');
  let frames = 0, lastFps = performance.now();

  function animate(){
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
    frames++;
    const now = performance.now();
    if (now - lastFps >= 1000){
      if (fpsEl) fpsEl.textContent = frames + ' FPS';
      frames = 0;
      lastFps = now;
    }
  }

  boot();
  animate();

})();
