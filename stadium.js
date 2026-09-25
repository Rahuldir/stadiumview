/* ══════════════════════════════════════════════════════════════
   StadiumView — stadium + equipment (2 bats) + 15 cricket roles
   7 player models recycled to fill 15 positions
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ─── FILE PATHS ──────────────────────────────────────────────
  const STADIUM_FILE   = 'models/stadium.glb';
  const EQUIPMENT_FILE = 'models/equipment.glb';   // bat + ball + stumps

  // Only 7 models uploaded (p1..p7). We'll recycle them.
  const PLAYER_FILES = [
    'models/p1.glb',
    'models/p2.glb',
    'models/p3.glb',
    'models/p4.glb',
    'models/p5.glb',
    'models/p6.glb',
    'models/p7.glb'
  ];

  // ─── SIZES (metres; 0 = native) ──────────────────────────────
  const STADIUM_SIZE   = 0;
  const EQUIPMENT_SIZE = 0;
  const PLAYER_SIZE    = 1.8;

  // ─── ROTATIONS ───────────────────────────────────────────────
  const ROT_STADIUM   = { x: 0, y: 0, z: 0 };
  const ROT_EQUIPMENT = { x: 0, y: 0, z: 0 };
  const ROT_PLAYER    = { x: 0, y: 0, z: 0 };

  // ─── EQUIPMENT POSITIONS (both ends of the pitch) ────────────
  const EQUIPMENT_POS_STRIKER    = { x: 0.35, y: 0, z: 9 };
  const EQUIPMENT_POS_NONSTRIKER = { x: -1.2, y: 0, z: -9 };

  /* ─── 15 CRICKET POSITIONS ────────────────────────────────────
     x  = off-side (+) / leg-side (−)
     z  = batting end (+) / bowling end (−)
     rotY = direction the player faces (radians)
     Model faces +Z when rotY = 0                              */
  const FIELD_POSITIONS = [

    // ══ BATTING SIDE (2) ══
    { role: 'Striker',            x: 0.35,  y: 0, z: 9,     rotY: Math.PI },
    { role: 'Non-Striker',        x: -1.2,  y: 0, z: -9,    rotY: 0 },

    // ══ UMPIRES (2) ══
    { role: 'Umpire (Bowl End)',  x: -0.7,  y: 0, z: -10.5, rotY: 0 },
    { role: 'Umpire (Sq Leg)',    x: -14,   y: 0, z: 0,     rotY: Math.PI * 0.5 },

    // ══ BOWLING SIDE (11) ══
    { role: 'Bowler',             x: 0,     y: 0, z: -14,   rotY: 0 },
    { role: 'Keeper',             x: 0,     y: 0, z: 12,    rotY: Math.PI },
    { role: 'Slip',               x: 3,     y: 0, z: 13.5,  rotY: Math.PI },
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
  scene.fog = new THREE.Fog(0x87b8e0, 500, 1800);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  document.body.appendChild(renderer.domElement);

  // ─── LIGHTS ──────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const hemi = new THREE.HemisphereLight(0xffffff, 0x4a7a4a, 1.0);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(150, 220, 150);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -300;
  sun.shadow.camera.right = 300;
  sun.shadow.camera.top = 300;
  sun.shadow.camera.bottom = -300;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 1200;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // ─── LOADER ──────────────────────────────────────────────────
  const loader = new THREE.GLTFLoader();
  const loadStatus = {};

  function loadOne(key, url){
    loadStatus[key] = { status: 'pending' };
    updateList();

    return new Promise(function(resolve){
      loader.load(
        url,
        function(gltf){
          const model = gltf.scene || gltf.scenes[0];
          if (model && !model.name) model.name = key;
          loadStatus[key] = { status: 'loaded' };
          updateList();
          console.log('[StadiumView] ✅ ' + key);
          resolve(model);
        },
        function(p){
          if (p.total){
            loadStatus[key] = { status: 'loading', pct: Math.round((p.loaded / p.total) * 100) };
            updateList();
          }
        },
        function(err){
          loadStatus[key] = { status: 'failed' };
          updateList();
          console.warn('[StadiumView] ❌ ' + key + ' — ' + (err.message || 'not found'));
          resolve(null);
        }
      );
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

    model.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(model);
    const c = new THREE.Vector3();
    nb.getCenter(c);
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= nb.min.y;
  }

  function enableShadows(obj, cast){
    obj.traverse(function(c){
      if (c.isMesh){
        c.castShadow = cast !== false;
        c.receiveShadow = true;
        if (c.material){
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(function(m){ m.side = THREE.FrontSide; });
        }
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

  // ─── PLACE STADIUM ───────────────────────────────────────────
  let stadiumRadius = 150;

  function placeStadium(model){
    if (!model) return;
    model.rotation.set(ROT_STADIUM.x, ROT_STADIUM.y, ROT_STADIUM.z);
    autoFit(model, STADIUM_SIZE);
    enableShadows(model, false);
    model.position.set(0, 0, 0);
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    stadiumRadius = Math.max(sz.x, sz.z) * 0.6;
    console.log('[Stadium] size: ' + sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1));
  }

  // ─── PLACE EQUIPMENT (2 bats, 1 ball, stumps at both ends) ───
  function placeEquipment(model){
    if (!model) return;

    // Original at STRIKER'S end
    model.rotation.set(ROT_EQUIPMENT.x, ROT_EQUIPMENT.y, ROT_EQUIPMENT.z);
    autoFit(model, EQUIPMENT_SIZE);
    enableShadows(model, true);
    model.position.set(
      EQUIPMENT_POS_STRIKER.x,
      EQUIPMENT_POS_STRIKER.y,
      EQUIPMENT_POS_STRIKER.z
    );
    scene.add(model);

    // Clone at NON-STRIKER'S end, hide the ball
    const clone = model.clone(true);
    let ballHidden = false;
    const meshNames = [];
    clone.traverse(function(child){
      if (child.isMesh){
        meshNames.push(child.name || '(unnamed)');
        if (child.name && /ball/i.test(child.name)){
          child.visible = false;
          ballHidden = true;
        }
      }
    });

    clone.rotation.x = ROT_EQUIPMENT.x || 0;
    clone.rotation.y = (ROT_EQUIPMENT.y || 0) + Math.PI;
    clone.rotation.z = ROT_EQUIPMENT.z || 0;

    clone.position.set(
      EQUIPMENT_POS_NONSTRIKER.x,
      EQUIPMENT_POS_NONSTRIKER.y,
      EQUIPMENT_POS_NONSTRIKER.z
    );
    scene.add(clone);

    console.log('[Equipment] Meshes: ' + meshNames.join(', '));
    console.log('[Equipment] Ball hidden in clone: ' + (ballHidden ? 'YES ✅' : 'NO'));
  }

  /* ─── PLACE PLAYERS ───────────────────────────────────────────
     7 models recycled across all 15 positions.
     Each clone gets a shuffled model from the pool. */
  function placePlayers(models){
    const valid = models.filter(function(m){ return m; });
    if (valid.length === 0){ console.warn('[Players] none loaded'); return; }

    shuffle(valid);
    console.log('[Players] Loaded ' + valid.length + ' models, need ' + FIELD_POSITIONS.length + ' positions');
    console.log('[Players] Shuffled: ' + valid.map(function(m){ return m.name || '?'; }).join(', '));

    for (let i = 0; i < FIELD_POSITIONS.length; i++){
      const src = valid[i % valid.length];
      const pos = FIELD_POSITIONS[i];

      const model = src.clone(true);
      const srcName = src.name || ('p' + ((i % valid.length) + 1));
      model.name = srcName + '_' + pos.role.replace(/[^a-z0-9]/gi, '');

      // Reset transform for a clean auto-fit
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.scale.set(1, 1, 1);

      autoFit(model, PLAYER_SIZE);
      enableShadows(model, true);

      // Apply rotation for this role
      model.rotation.x = ROT_PLAYER.x || 0;
      model.rotation.y = pos.rotY || 0;
      model.rotation.z = ROT_PLAYER.z || 0;

      // Position on the field
      model.position.x = pos.x;
      model.position.z = pos.z;
      model.position.y = pos.y + (model.position.y || 0);

      scene.add(model);
      console.log('[Players] ' + pos.role + ' ← ' + srcName);
    }
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

    placeStadium(pick('stadium'));
    placeEquipment(pick('equipment'));

    const playerModels = PLAYER_FILES.map(function(_, i){
      return pick('p' + (i + 1));
    }).filter(function(m){ return m; });
    playerModels.forEach(function(m, i){ if (m && !m.name) m.name = 'p' + (i + 1); });

    placePlayers(playerModels);

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
      stadiumRadius: stadiumRadius
    };
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
