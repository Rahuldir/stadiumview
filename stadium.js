/* ══════════════════════════════════════════════════════════════
   StadiumView — raycast-based field detection
   Finds actual grass height, places everything on it
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

  const STADIUM_SIZE   = 200;
  const EQUIPMENT_SIZE = 4.0;
  const PLAYER_SIZE    = 1.8;

  const ROT_STADIUM   = { x: 0, y: 0, z: 0 };
  const ROT_EQUIPMENT = { x: 0, y: 0, z: 0 };
  const ROT_PLAYER    = { x: 0, y: 0, z: 0 };

  // ─── EQUIPMENT POSITIONS ─────────────────────────────────────
  const EQUIPMENT_POS_STRIKER    = { x: 0, y: 0, z: 10 };
  const EQUIPMENT_POS_NONSTRIKER = { x: 0, y: 0, z: -10 };

  // ─── 15 CRICKET POSITIONS ────────────────────────────────────
  const FIELD_POSITIONS = [
    { role: 'Striker',            x: 0.35,  y: 0, z: 9,     rotY: Math.PI },
    { role: 'Non-Striker',        x: -1.2,  y: 0, z: -9,    rotY: 0 },
    { role: 'Umpire (Bowl End)',  x: -0.7,  y: 0, z: -11,   rotY: 0 },
    { role: 'Umpire (Sq Leg)',    x: -14,   y: 0, z: 0,     rotY: Math.PI * 0.5 },
    { role: 'Bowler',             x: 0,     y: 0, z: -15,   rotY: 0 },
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

  // Position a model so its bottom sits at y = 0 locally
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

  /* ═══════════════════════════════════════════════════════════
     RAYCAST — find the actual height of the grass
     ═══════════════════════════════════════════════════════════ */
  function findFieldLevel(stadiumModel){
    const raycaster = new THREE.Raycaster();
    // Cast from very high above the field centre, straight down
    raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(stadiumModel, true);
    if (hits.length > 0){
      console.log('[Raycast] field surface found at y = ' + hits[0].point.y.toFixed(2));
      return hits[0].point.y;
    }
    console.log('[Raycast] no hit — defaulting to y = 0');
    return 0;
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

    // Measure size
    const box = new THREE.Box3().setFromObject(model);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    stadiumRadius = Math.max(sz.x, sz.z) * 0.6;
    console.log('[Stadium] size: ' + sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1));

    // Find the actual grass level with a raycast
    fieldY = findFieldLevel(model);
  }

  // ─── PLACE EQUIPMENT ─────────────────────────────────────────
  function placeEquipment(model){
    if (!model) return;

    model.rotation.set(ROT_EQUIPMENT.x, ROT_EQUIPMENT.y, ROT_EQUIPMENT.z);
    autoFit(model, EQUIPMENT_SIZE);
    enableShadows(model);
    bottomToZero(model);          // sit on y = 0 locally
    model.position.y += fieldY;   // lift to grass level
    model.position.x = EQUIPMENT_POS_STRIKER.x;
    model.position.z = EQUIPMENT_POS_STRIKER.z;
    scene.add(model);

    const clone = model.clone(true);
    clone.rotation.x = ROT_EQUIPMENT.x || 0;
    clone.rotation.y = (ROT_EQUIPMENT.y || 0) + Math.PI;
    clone.rotation.z = ROT_EQUIPMENT.z || 0;
    clone.position.y = fieldY;
    clone.position.x = EQUIPMENT_POS_NONSTRIKER.x;
    clone.position.z = EQUIPMENT_POS_NONSTRIKER.z;
    scene.add(clone);

    console.log('[Equipment] placed at y = ' + fieldY.toFixed(2));
  }

  // ─── PLACE PLAYERS ───────────────────────────────────────────
  function placePlayers(models){
    const valid = models.filter(function(m){ return m; });
    if (valid.length === 0){ console.warn('[Players] none loaded'); return; }

    shuffle(valid);
    console.log('[Players] Loaded ' + valid.length + ' models, need ' + FIELD_POSITIONS.length);

    for (let i = 0; i < FIELD_POSITIONS.length; i++){
      const src = valid[i % valid.length];
      const pos = FIELD_POSITIONS[i];

      const model = src.clone(true);
      const srcName = src.name || ('p' + ((i % valid.length) + 1));
      model.name = srcName + '_' + pos.role.replace(/[^a-z0-9]/gi, '');

      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.scale.set(1, 1, 1);

      autoFit(model, PLAYER_SIZE);
      enableShadows(model);
      bottomToZero(model);          // feet at y = 0 locally

      model.rotation.x = ROT_PLAYER.x || 0;
      model.rotation.y = pos.rotY || 0;
      model.rotation.z = ROT_PLAYER.z || 0;

      model.position.x = pos.x;
      model.position.z = pos.z;
      model.position.y += fieldY;   // lift to grass level

      scene.add(model);
    }
    console.log('[Players] all 15 placed at y = ' + fieldY.toFixed(2));
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

    // Stadium first — we need fieldY before placing anything else
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
      stadiumRadius: stadiumRadius,
      fieldY: fieldY
    };

    console.log('[StadiumView] Ready. fieldY = ' + fieldY.toFixed(2) + ', radius = ' + stadiumRadius.toFixed(1));
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
