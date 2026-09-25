/* ══════════════════════════════════════════════════════════════
   StadiumView — 3D scene + model loading
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ─── CONFIG (edit these to match your files) ─────────────────
  const MODEL_FILES = {
    stadium: 'models/stadium.glb',
    pitch:   'models/pitch.glb',
    ball:    'models/ball.glb',
    bat:     'models/bat.glb',
    player:  'models/player.glb'
  };

  // Target sizes in metres (0 = keep native size)
  const TARGET_SCALE = {
    stadium: 0,
    pitch:   20.12,
    ball:    0.072,
    bat:     0.965,
    player:  1.8
  };

  // Manual rotations (radians) — fix orientation issues here
  const MANUAL_ROTATION = {
    stadium: { x: 0, y: 0, z: 0 },
    pitch:   { x: 0, y: 0, z: 0 },
    ball:    { x: 0, y: 0, z: 0 },
    bat:     { x: 0, y: 0, z: 0 },
    player:  { x: 0, y: 0, z: 0 }
  };

  // Manual positions (metres) — where each model sits in the world
  const POSITION = {
    stadium: { x: 0,    y: 0,    z: 0 },
    pitch:   { x: 0,    y: 0.02, z: 0 },
    ball:    { x: 0,    y: 0.10, z: 6 },
    bat:     { x: 1.2,  y: 0,    z: 9 },
    player:  { x: 0.35, y: 0,    z: 9 }
  };

  // ─── SCENE ────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050a12);
  scene.fog = new THREE.Fog(0x050a12, 300, 1200);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 3000);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);

  // ─── LIGHTS ──────────────────────────────────────────────────
  const hemi = new THREE.HemisphereLight(0xffffff, 0x1a4a2a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(80, 150, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -200;
  sun.shadow.camera.right = 200;
  sun.shadow.camera.top = 200;
  sun.shadow.camera.bottom = -200;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  scene.add(new THREE.AmbientLight(0xffffff, 0.3));

  // ─── GROUND ──────────────────────────────────────────────────
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(500, 64),
    new THREE.MeshStandardMaterial({ color: 0x0a1a10, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);

  // ─── LOADER ──────────────────────────────────────────────────
  const loader = new THREE.GLTFLoader();
  const loadedModels = {};
  const loadStatus = {};

  function loadOne(key, url){
    loadStatus[key] = { status: 'pending' };
    updateList();

    return new Promise(function(resolve){
      loader.load(
        url,
        function(gltf){
          const model = gltf.scene || gltf.scenes[0];
          loadedModels[key] = model;
          loadStatus[key] = { status: 'loaded' };
          updateList();
          console.log('[StadiumView] ✅ ' + key);
          resolve(model);
        },
        function(p){
          if (p.total){
            const pct = Math.round((p.loaded / p.total) * 100);
            loadStatus[key] = { status: 'loading', pct: pct };
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
    el.innerHTML = Object.keys(MODEL_FILES).map(function(key){
      const s = loadStatus[key] || { status: 'pending' };
      let icon = '⏳', cls = 'wait', txt = 'waiting';
      if (s.status === 'loaded')       { icon = '✅'; cls = 'ok';   txt = 'ready'; }
      else if (s.status === 'failed')  { icon = '❌'; cls = 'fail'; txt = 'missing'; }
      else if (s.status === 'loading') { icon = '📥'; cls = 'wait'; txt = s.pct + '%'; }
      return '<div class="row ' + cls + '">' + icon + ' ' + key + ' · ' + txt + '</div>';
    }).join('');
  }

  // ─── AUTO-FIT (scale + centre, bottom at y=0) ────────────────
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
    const centre = new THREE.Vector3();
    nb.getCenter(centre);
    model.position.x -= centre.x;
    model.position.z -= centre.z;
    model.position.y -= nb.min.y;
  }

  // ─── ENABLE SHADOWS ──────────────────────────────────────────
  function enableShadows(obj){
    obj.traverse(function(c){
      if (c.isMesh){
        c.castShadow = true;
        c.receiveShadow = true;
        if (c.material){
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(function(m){ m.side = THREE.FrontSide; });
        }
      }
    });
  }

  // ─── PLACE ───────────────────────────────────────────────────
  function placeOne(key, model){
    if (!model) return;
    const r = MANUAL_ROTATION[key];
    if (r){ model.rotation.set(r.x || 0, r.y || 0, r.z || 0); }

    autoFit(model, TARGET_SCALE[key]);
    enableShadows(model);

    const p = POSITION[key];
    if (p){
      model.position.x = p.x;
      model.position.y = p.y + (model.position.y || 0);
      model.position.z = p.z;
    }

    scene.add(model);
  }

  // ─── LOADER OVERLAY ──────────────────────────────────────────
  function setLoaderProgress(loaded, total){
    const sub = document.getElementById('loaderSub');
    const txt = document.getElementById('loaderText');
    if (sub) sub.textContent = loaded + ' / ' + total + ' models';
    if (txt && loaded === total) txt.textContent = 'Ready';
  }

  // ─── BOOT ────────────────────────────────────────────────────
  async function boot(){
    const keys = Object.keys(MODEL_FILES);
    let loaded = 0;

    const results = await Promise.all(
      keys.map(function(key){
        return loadOne(key, MODEL_FILES[key]).then(function(m){
          if (m) loaded++;
          setLoaderProgress(loaded, keys.length);
          return { key: key, model: m };
        });
      })
    );

    results.forEach(function(r){ if (r.model) placeOne(r.key, r.model); });

    setTimeout(function(){
      const el = document.getElementById('loader');
      if (el) el.classList.add('hide');
    }, 400);

    // Expose for controls.js
    window.StadiumView = {
      scene: scene,
      camera: camera,
      renderer: renderer,
      sun: sun,
      hemi: hemi
    };
  }

  // ─── RESIZE ──────────────────────────────────────────────────
  window.addEventListener('resize', function(){
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ─── RENDER LOOP ─────────────────────────────────────────────
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
