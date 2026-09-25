/* ══════════════════════════════════════════════════════════════
   StadiumView — with debug markers to diagnose missing players
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const STADIUM_FILE = 'models/stadium.glb';

  const PLAYER_FILES = [
    'models/p1.glb','models/p2.glb','models/p3.glb',
    'models/p4.glb','models/p5.glb','models/p6.glb','models/p7.glb'
  ];

  const STADIUM_SIZE = 200;
  const PLAYER_SIZE  = 1.9;

  // Debug: draws a red marker at every player position
  const DEBUG_MARKERS = true;   // ← set to false once you see players

  const ROT_STADIUM = { x: 0, y: 0, z: 0 };

  const FIELD_POSITIONS = [
    { role: 'Striker',            x: 0.4,   y: 0, z: 9,     rotY: Math.PI,      hasBat: true },
    { role: 'Non-Striker',        x: -0.4,  y: 0, z: -9,    rotY: 0,            hasBat: true },
    { role: 'Umpire (Bowl End)',  x: -1.0,  y: 0, z: -11.5, rotY: 0 },
    { role: 'Umpire (Sq Leg)',    x: -14,   y: 0, z: 0,     rotY: Math.PI * 0.5 },
    { role: 'Bowler',             x: 0,     y: 0, z: -14,   rotY: 0,            hasBall: true },
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
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
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
    if (!targetSize || targetSize <= 0) return 1;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return 1;
    const scale = targetSize / maxDim;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    return scale;
  }

  function bottomToZero(model){
    model.updateMatrixWorld(true);
    const nb = new THREE.Box3().setFromObject(model);
    model.position.y -= nb.min.y;
  }

  function enableMaterials(obj){
    obj.traverse(function(c){
      if (c.isMesh && c.material){
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(function(m){
          if (m.emissive) m.emissive.setHex(0x000000);
          if (typeof m.roughness === 'number') m.roughness = 0.85;
          if (typeof m.metalness === 'number') m.metalness = 0;
          m.side = THREE.DoubleSide;
          m.transparent = false;
          m.opacity = 1;
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
    if (hits.length > 0) return hits[0].point.y;
    return 0;
  }

  /* ═══════════════════════════════════════════════════════════
     PROCEDURAL EQUIPMENT
     ═══════════════════════════════════════════════════════════ */
  function makeBat(){
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd4b483, roughness: 0.75 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.60, 0.05), bladeMat);
    blade.position.y = 0.30;
    g.add(blade);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.30, 10), handleMat);
    handle.position.y = 0.75;
    g.add(handle);
    return g;
  }

  function makeBall(){
    const mat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.55 });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 16), mat);
    const seamMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.004, 6, 20), seamMat);
    seam.rotation.y = Math.PI / 2;
    ball.add(seam);
    return ball;
  }

  function makeStumps(){
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xefe2c0, roughness: 0.7 });
    const bailMat = new THREE.MeshStandardMaterial({ color: 0xd4b483, roughness: 0.7 });
    [-0.11, 0, 0.11].forEach(function(x){
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.71, 12), mat);
      s.position.set(x, 0.355, 0);
      g.add(s);
    });
    [-0.055, 0.055].forEach(function(x){
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.10, 8), bailMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(x, 0.72, 0);
      g.add(b);
    });
    return g;
  }

  /* ═══════════════════════════════════════════════════════════
     SIGHT SCREEN — beyond the boundary, thin frame
     ═══════════════════════════════════════════════════════════ */
  function buildSightScreen(zPos, fieldY){
    const W = 22, H = 8, D = 0.6;

    const group = new THREE.Group();

    // Main white panel
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(W, H, D),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 })
    );
    panel.position.y = H / 2;
    group.add(panel);

    // Thin black outline (thin frame, not chunky)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7 });
    // Top bar
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.25, D + 0.1), frameMat);
    topBar.position.y = H + 0.12;
    group.add(topBar);
    // Bottom bar
    const botBar = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.25, D + 0.1), frameMat);
    botBar.position.y = -0.12;
    group.add(botBar);
    // Left/right thin posts
    [-W/2 - 0.2, W/2 + 0.2].forEach(function(x){
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.25, H + 0.4, D + 0.1), frameMat);
      side.position.set(x, H / 2, 0);
      group.add(side);
    });

    // Support poles going into the ground
    [-W/2 + 1.5, W/2 - 1.5].forEach(function(x){
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, H + 1, 8),
        frameMat
      );
      pole.position.set(x, (H + 1) / 2 - 0.5, 0);
      group.add(pole);
    });

    group.position.set(0, fieldY, zPos);
    scene.add(group);

    console.log('[SightScreen] at z = ' + zPos + ', size ' + W + '×' + H);
  }

  /* ═══════════════════════════════════════════════════════════
     REPLAY SCREEN
     ═══════════════════════════════════════════════════════════ */
  function buildReplayScreen(x, z, rotY, fieldY){
    const W = 36, H = 20, D = 0.6;

    const group = new THREE.Group();

    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(W + 1.5, H + 1.5, D),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7, metalness: 0.3 })
    );
    group.add(frame);

    const cvs = document.createElement('canvas');
    cvs.width = 1024; cvs.height = 576;
    const ctx = cvs.getContext('2d');

    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    ctx.fillStyle = '#e10600';
    ctx.fillRect(0, 0, cvs.width, 10);
    ctx.fillRect(0, cvs.height - 10, cvs.width, 10);

    ctx.strokeStyle = 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < cvs.width + cvs.height; i += 40){
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i - cvs.height, cvs.height);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 110px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CRICMAX', cvs.width / 2, 200);

    ctx.fillStyle = '#00e676';
    ctx.font = 'bold 80px Arial';
    ctx.fillText('REPLAY', cvs.width / 2, 330);

    ctx.fillStyle = '#7a8590';
    ctx.font = 'bold 34px Arial';
    ctx.fillText('LIVE · MATCH VIEWER', cvs.width / 2, 440);

    const tex = new THREE.CanvasTexture(cvs);
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    screen.position.z = D / 2 + 0.05;
    group.add(screen);

    group.position.set(x, fieldY + H / 2 + 10, z);
    group.rotation.y = rotY;
    scene.add(group);

    console.log('[ReplayScreen] at (' + x + ',' + z + ') rotY=' + rotY.toFixed(2));
  }

  // ─── STADIUM ─────────────────────────────────────────────────
  let stadiumRadius = 100;
  let fieldY = 0;

  function placeStadium(model){
    if (!model) return;
    model.rotation.set(ROT_STADIUM.x, ROT_STADIUM.y, ROT_STADIUM.z);
    autoFit(model, STADIUM_SIZE);
    enableMaterials(model);
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
    console.log('[Raycast] grass at y = ' + fieldY.toFixed(2));
  }

  /* ═══════════════════════════════════════════════════════════
     PLACE PLAYERS
     ═══════════════════════════════════════════════════════════ */
  function placePlayers(models){
    const valid = models.filter(function(m){ return m; });
    if (valid.length === 0){ console.warn('[Players] none loaded'); return; }

    shuffle(valid);
    console.log('[Players] ' + valid.length + ' models → ' + FIELD_POSITIONS.length + ' roles');

    const playerGroups = [];

    for (let i = 0; i < FIELD_POSITIONS.length; i++){
      const src = valid[i % valid.length];
      const pos = FIELD_POSITIONS[i];

      const group = new THREE.Group();

      const pm = src.clone(true);
      pm.position.set(0, 0, 0);
      pm.rotation.set(0, 0, 0);
      pm.scale.set(1, 1, 1);

      // Log BEFORE scaling to see natural size
      pm.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(pm);
      const rawSize = new THREE.Vector3();
      rawBox.getSize(rawSize);
      const rawMax = Math.max(rawSize.x, rawSize.y, rawSize.z);

      const scale = autoFit(pm, PLAYER_SIZE);
      enableMaterials(pm);
      bottomToZero(pm);

      const pbox = new THREE.Box3().setFromObject(pm);
      const psz = new THREE.Vector3();
      pbox.getSize(psz);
      console.log('[Player ' + pos.role + '] rawMax=' + rawMax.toFixed(3) +
                  ' scale=' + scale.toFixed(5) +
                  ' final=' + psz.x.toFixed(2) + '×' + psz.y.toFixed(2) + '×' + psz.z.toFixed(2) +
                  ' yPos=' + pm.position.y.toFixed(3));

      group.add(pm);

      // Attach bat
      if (pos.hasBat){
        const bat = makeBat();
        bat.position.set(-0.35, 0.95, 0.25);
        bat.rotation.x = -0.7;
        bat.rotation.z = 0.15;
        group.add(bat);
      }

      // Attach ball
      if (pos.hasBall){
        const ball = makeBall();
        ball.position.set(0.35, 1.35, 0.20);
        group.add(ball);
      }

      // Debug marker — a bright red glowing sphere at feet
      if (DEBUG_MARKERS){
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.35, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0xff0066 })
        );
        marker.position.set(0, 0.35, 0);
        group.add(marker);
      }

      group.rotation.y = pos.rotY || 0;
      group.position.x = pos.x;
      group.position.z = pos.z;
      group.position.y = fieldY;

      scene.add(group);
      playerGroups.push(group);

      // Log world position of this player
      group.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      group.getWorldPosition(worldPos);
      console.log('  ↳ world pos: ' + worldPos.x.toFixed(1) + ', ' +
                  worldPos.y.toFixed(2) + ', ' + worldPos.z.toFixed(1));
    }

    window.__playerGroups = playerGroups;
    console.log('[Players] placed ' + playerGroups.length + ' groups');
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
      { key: 'stadium', url: STADIUM_FILE }
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

    // Stadium
    placeStadium(pick('stadium'));

    // Sight screens — beyond the grass boundary
    // Grass is roughly 35m radius, so push screens to z = ±52
    buildSightScreen( 52, fieldY);
    buildSightScreen(-52, fieldY);

    // Replay screens on the sides (in the stands)
    buildReplayScreen( 72, 0, -Math.PI / 2, fieldY);
    buildReplayScreen(-72, 0,  Math.PI / 2, fieldY);

    // Stumps at both ends, aligned with pitch center (x = 0)
    const stumpsStriker = makeStumps();
    stumpsStriker.position.set(0, fieldY, 10);
    scene.add(stumpsStriker);

    const stumpsNonStriker = makeStumps();
    stumpsNonStriker.position.set(0, fieldY, -10);
    scene.add(stumpsNonStriker);
    console.log('[Stumps] placed at z = ±10, centered on x = 0');

    // Players
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

    console.log('[StadiumView] Ready. fieldY=' + fieldY.toFixed(2));
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
