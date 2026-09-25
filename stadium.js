/* ══════════════════════════════════════════════════════════════
   StadiumView — real-world dimensions (Fixed Lighting & Colors)
   Player  1.8m  |  Bat  0.96m  |  Ball  0.072m  |  Stumps  0.71m
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const STADIUM_FILE = 'models/stadium.glb';

  const PLAYER_FILES = [
    'models/p1.glb','models/p2.glb','models/p3.glb',
    'models/p4.glb','models/p5.glb','models/p6.glb','models/p7.glb'
  ];

  // ─── REAL-WORLD DIMENSIONS (metres) ─────────────────────────
  const STADIUM_SIZE       = 200;     
  const PLAYER_HEIGHT      = 1.80;    
  const BAT_LENGTH         = 0.96;    
  const BALL_DIAMETER      = 0.072;   
  const STUMPS_HEIGHT      = 0.71;    
  const PITCH_LENGTH       = 20.12;   
  const BOUNDARY_RADIUS    = 30;      

  const ROT_STADIUM = { x: 0, y: 0, z: 0 };

  const FIELD_POSITIONS = [
    { role: 'Striker',            x: 0.4,   y: 0, z: 9,     rotY: Math.PI,      hasBat: true,  ringColor: 0x22d3ee },
    { role: 'Non-Striker',        x: -0.4,  y: 0, z: -9,    rotY: 0,            hasBat: true,  ringColor: 0x22d3ee },
    { role: 'Umpire (Bowl End)',  x: -1.0,  y: 0, z: -11.5, rotY: 0,                           ringColor: 0xa855f7 },
    { role: 'Umpire (Sq Leg)',    x: -14,   y: 0, z: 0,     rotY: Math.PI * 0.5,               ringColor: 0xa855f7 },
    { role: 'Bowler',             x: 0,     y: 0, z: -14,   rotY: 0,            hasBall: true, ringColor: 0xe10600 },
    { role: 'Keeper',             x: 0,     y: 0, z: 13,    rotY: Math.PI,                     ringColor: 0xfbbf24 },
    { role: 'Slip',               x: 3,     y: 0, z: 14.5,  rotY: Math.PI,                     ringColor: 0x00e676 },
    { role: 'Point',              x: 15,    y: 0, z: 6,     rotY: Math.PI * 0.75,              ringColor: 0x00e676 },
    { role: 'Cover',              x: 18,    y: 0, z: -3,    rotY: Math.PI * 0.55,              ringColor: 0x00e676 },
    { role: 'Mid-Off',            x: 10,    y: 0, z: -10,   rotY: 0,                           ringColor: 0x00e676 },
    { role: 'Mid-On',             x: -10,   y: 0, z: -10,   rotY: 0,                           ringColor: 0x00e676 },
    { role: 'Mid-Wicket',         x: -18,   y: 0, z: -3,    rotY: Math.PI * 1.45,              ringColor: 0x00e676 },
    { role: 'Square Leg',         x: -16,   y: 0, z: 6,     rotY: Math.PI * 1.25,              ringColor: 0x00e676 },
    { role: 'Fine Leg',           x: -22,   y: 0, z: 12,    rotY: Math.PI * 1.2,               ringColor: 0x00e676 },
    { role: 'Third Man',          x: 12,    y: 0, z: 14,    rotY: Math.PI,                     ringColor: 0x00e676 }
  ];

  // ─── SCENE ───────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Lowered default exposure so things aren't washed out
  renderer.toneMappingExposure = 1.0; 
  document.body.appendChild(renderer.domElement);

  // ─── LIGHTS (Lowered baselines so Night mode works) ──────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.6);
  scene.add(hemi);
  
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(80, 400, 80);
  scene.add(sun);

  // ─── LOADER ──────────────────────────────────────────────────
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
  function scaleToHeight(model, targetHeight){
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    let size = new THREE.Vector3();
    box.getSize(size);
    if (size.y === 0) return 1;
    const scale = targetHeight / size.y;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);
    return scale;
  }

  function scaleToMaxDim(model, targetMax){
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return 1;
    const scale = targetMax / maxDim;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    return scale;
  }

  function bottomToZero(model){
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
  }

  function forceVisible(obj){
    let meshCount = 0;
    obj.traverse(function(c){
      c.visible = true;
      c.frustumCulled = false;
      if (c.isMesh){
        meshCount++;
        if (c.material){
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(function(m){
            m.transparent = false;
            m.opacity = 1;
            m.alphaTest = 0;
            m.depthWrite = true;
            if (typeof m.roughness === 'number') m.roughness = 0.75;
            if (typeof m.metalness === 'number') m.metalness = 0;
            m.side = THREE.DoubleSide;
            // FIXED: Removed the emissive glowing that made players washed out!
            if (m.emissive) m.emissive.setHex(0x000000); 
            m.needsUpdate = true;
          });
        }
      }
    });
    return { meshCount: meshCount };
  }

  function findFieldLevel(stadiumModel){
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(stadiumModel, true);
    if (hits.length > 0) return hits[0].point.y;
    return 0;
  }

  // ─── EQUIPMENT ───────────────────────────────────────────────
  function makeBat(){
    const g = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd4b483, roughness: 0.75 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.60, 0.05), bladeMat);
    blade.position.y = 0.30;
    g.add(blade);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.36, 10), handleMat);
    handle.position.y = 0.78;
    g.add(handle);
    return g;
  }

  function makeBall(){
    const r = BALL_DIAMETER / 2;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.5
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), mat);
    const seamMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const seam = new THREE.Mesh(new THREE.TorusGeometry(r, 0.004, 6, 20), seamMat);
    seam.rotation.y = Math.PI / 2;
    ball.add(seam);
    return ball;
  }

  function makeStumps(){
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xefe2c0, roughness: 0.7 });
    const bailMat = new THREE.MeshStandardMaterial({ color: 0xd4b483, roughness: 0.7 });
    [-0.11, 0, 0.11].forEach(function(x){
      const s = new THREE.Mesh(
        new THREE.CylinderGeometry(0.019, 0.019, STUMPS_HEIGHT, 12),
        mat
      );
      s.position.set(x, STUMPS_HEIGHT / 2, 0);
      g.add(s);
    });
    [-0.055, 0.055].forEach(function(x){
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.10, 8), bailMat);
      b.rotation.z = Math.PI / 2;
      b.position.set(x, STUMPS_HEIGHT + 0.01, 0);
      g.add(b);
    });
    return g;
  }

  // ─── GROUND RING MARKERS ─────────────────────────────────────
  function makeGroundMarker(x, z, color, fieldY){
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.3, 24),
      new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = fieldY + 0.05;
    group.add(ring);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8),
      new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
        depthWrite: false
      })
    );
    pole.position.y = fieldY + 1.5;
    group.add(pole);

    group.position.set(x, 0, z);
    scene.add(group);
    return group;
  }

  // ─── STADIUM ─────────────────────────────────────────────────
  let stadiumRadius = 100;
  let fieldY = 0;

  function placeStadium(model){
    if (!model) return;
    model.rotation.set(ROT_STADIUM.x, ROT_STADIUM.y, ROT_STADIUM.z);
    scaleToMaxDim(model, STADIUM_SIZE);
    model.traverse(function(c){
      if (c.isMesh){ c.castShadow = false; c.receiveShadow = false; }
    });
    bottomToZero(model);
    model.position.x = 0;
    model.position.z = 0;
    scene.add(model);

    const box = new THREE.Box3().setFromObject(model);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    stadiumRadius = Math.max(sz.x, sz.z) * 0.6;
    fieldY = findFieldLevel(model);
  }

  // ─── PLAYERS ─────────────────────────────────────────────────
  const playerRefs = {};
  const accessoryRefs = {};

  function placePlayers(playersData){
    playersData.forEach(function(pd){
      const src = pd.model;
      const pos = pd.pos;
      if (!src) return;

      const group = new THREE.Group();
      group.name = 'PLAYER_' + pos.role.replace(/[^a-z0-9]/gi, '_');

      const pm = src;
      pm.position.set(0, 0, 0);
      pm.rotation.set(0, 0, 0);
      pm.scale.set(1, 1, 1);

      scaleToHeight(pm, PLAYER_HEIGHT);
      forceVisible(pm);

      group.add(pm);

      if (pos.hasBat){
        const bat = makeBat();
        bat.position.set(-0.35, 0.95, 0.25);
        bat.rotation.x = -0.7;
        bat.rotation.z = 0.15;
        group.add(bat);
        accessoryRefs[pos.role] = accessoryRefs[pos.role] || {};
        accessoryRefs[pos.role].bat = bat;
      }

      if (pos.hasBall){
        const ball = makeBall();
        ball.position.set(0.35, 1.35, 0.20);
        group.add(ball);
        accessoryRefs[pos.role] = accessoryRefs[pos.role] || {};
        accessoryRefs[pos.role].ball = ball;
      }

      group.traverse(function(c){ c.frustumCulled = false; });
      group.rotation.y = pos.rotY || 0;
      group.position.x = pos.x;
      group.position.z = pos.z;
      group.position.y = fieldY;

      scene.add(group);
      playerRefs[pos.role] = group;
      makeGroundMarker(pos.x, pos.z, pos.ringColor, fieldY);
    });
  }

  function setLoaderProgress(loaded, total){
    const sub = document.getElementById('loaderSub');
    const txt = document.getElementById('loaderText');
    if (sub) sub.textContent = loaded + ' / ' + total + ' loaded';
    if (txt && loaded === total) txt.textContent = 'Ready';
  }

  // ─── BOOT ────────────────────────────────────────────────────
  async function boot(){
    const tasks = [
      { key: 'stadium', url: STADIUM_FILE, type: 'stadium' }
    ];
    
    FIELD_POSITIONS.forEach(function(pos, i){
      tasks.push({
        key: pos.role.replace(/[^a-z0-9]/gi, ''), 
        url: PLAYER_FILES[i % PLAYER_FILES.length],
        type: 'player',
        pos: pos
      });
    });

    let done = 0;
    const total = tasks.length;

    const results = await Promise.all(tasks.map(function(t){
      return loadOne(t.key, t.url).then(function(m){
        done++;
        setLoaderProgress(done, total);
        return { type: t.type, model: m, pos: t.pos };
      });
    }));

    const stadiumResult = results.find(function(r){ return r.type === 'stadium'; });
    placeStadium(stadiumResult ? stadiumResult.model : null);

    const stumpsA = makeStumps();
    stumpsA.position.set(0, fieldY, 10);
    scene.add(stumpsA);

    const stumpsB = makeStumps();
    stumpsB.position.set(0, fieldY, -10);
    scene.add(stumpsB);

    // Replay screens
    (function buildReplay(x, z, rotY){
      const W = 25, H = 14, D = 0.6;
      const g = new THREE.Group();
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(W + 1.2, H + 1.2, D),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7, metalness: 0.3 })
      );
      g.add(frame);
      const cvs = document.createElement('canvas');
      cvs.width = 1024; cvs.height = 576;
      const cx = cvs.getContext('2d');
      cx.fillStyle = '#0a0e1a'; cx.fillRect(0, 0, cvs.width, cvs.height);
      cx.fillStyle = '#e10600'; cx.fillRect(0, 0, cvs.width, 10); cx.fillRect(0, cvs.height - 10, cvs.width, 10);
      cx.fillStyle = '#ffffff'; cx.font = 'bold 110px Arial';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText('CRICMAX', cvs.width / 2, 200);
      cx.fillStyle = '#00e676'; cx.font = 'bold 80px Arial';
      cx.fillText('REPLAY', cvs.width / 2, 330);
      cx.fillStyle = '#7a8590'; cx.font = 'bold 34px Arial';
      cx.fillText('LIVE · MATCH VIEWER', cvs.width / 2, 440);
      const tex = new THREE.CanvasTexture(cvs);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      screen.position.z = D / 2 + 0.05;
      g.add(screen);
      g.position.set(x, fieldY + H / 2 + 4, z);
      g.rotation.y = rotY;
      scene.add(g);
    })(55, 0, -Math.PI / 2);
    (function buildReplay(x, z, rotY){
      const W = 25, H = 14, D = 0.6;
      const g = new THREE.Group();
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(W + 1.2, H + 1.2, D),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7, metalness: 0.3 })
      );
      g.add(frame);
      const cvs = document.createElement('canvas');
      cvs.width = 1024; cvs.height = 576;
      const cx = cvs.getContext('2d');
      cx.fillStyle = '#0a0e1a'; cx.fillRect(0, 0, cvs.width, cvs.height);
      cx.fillStyle = '#e10600'; cx.fillRect(0, 0, cvs.width, 10); cx.fillRect(0, cvs.height - 10, cvs.width, 10);
      cx.fillStyle = '#ffffff'; cx.font = 'bold 110px Arial';
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText('CRICMAX', cvs.width / 2, 200);
      cx.fillStyle = '#00e676'; cx.font = 'bold 80px Arial';
      cx.fillText('REPLAY', cvs.width / 2, 330);
      cx.fillStyle = '#7a8590'; cx.font = 'bold 34px Arial';
      cx.fillText('LIVE · MATCH VIEWER', cvs.width / 2, 440);
      const tex = new THREE.CanvasTexture(cvs);
      const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: tex })
      );
      screen.position.z = D / 2 + 0.05;
      g.add(screen);
      g.position.set(x, fieldY + H / 2 + 4, z);
      g.rotation.y = rotY;
      scene.add(g);
    })(-55, 0, Math.PI / 2);

    const playerData = results.filter(function(r){ return r.type === 'player'; });
    placePlayers(playerData);

    setTimeout(function(){
      const el = document.getElementById('loader');
      if (el) el.classList.add('hide');
    }, 400);

    // Exported ambient so controls can dim it
    window.StadiumView = {
      scene: scene,
      camera: camera,
      renderer: renderer,
      sun: sun,
      hemi: hemi,
      ambient: ambient, 
      stadiumRadius: stadiumRadius,
      fieldY: fieldY,
      players: playerRefs,
      accessories: accessoryRefs,
      stumpsStriker: stumpsA,
      stumpsBowler: stumpsB,
      BOUNDARY_RADIUS: BOUNDARY_RADIUS
    };

    console.log('[StadiumView] Ready.');
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
