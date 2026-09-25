/* ══════════════════════════════════════════════════════════════
   StadiumView — Realistic Broadcast Edition (v3.3)
   • Uses the model's OWN 4 corner flood-light towers
   • Raycast grass BEFORE FrontSide (preserves fieldY = 7.19)
   • Spotlights from each tower, aimed at the pitch
   • Emissive quads on tower lamp panels → they glow at night
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[stadium.js] IIFE started — file is alive', 'color:#00e676;font-weight:bold');

  const STADIUM_FILE = 'models/stadium.glb';
  const PLAYER_FILES = [
    'models/p1.glb','models/p2.glb','models/p3.glb',
    'models/p4.glb','models/p5.glb','models/p6.glb','models/p7.glb'
  ];

  const STADIUM_SIZE    = 200;
  const PLAYER_HEIGHT   = 1.80;
  const BALL_DIAMETER   = 0.072;
  const STUMPS_HEIGHT   = 0.71;
  const BOUNDARY_RADIUS = 38;

  // ── The 4 flood-light tower positions baked into the model ──
  // Matches the visible corner towers: 80 m out in x and z,
  // top of the lamp panel at ~48 m above the stadium base.
  const TOWER_TOP_Y     = 48;      // from stadium base (not grass)
  const TOWER_RADIUS_XZ = 80;

  const FIELD_POSITIONS = [
    { role: 'Striker',            x:  0.4, y: 0, z:  8.6,  rotY: Math.PI,          hasBat: true  },
    { role: 'Non-Striker',        x: -1.2, y: 0, z: -8.6,  rotY: 0,                hasBat: true  },
    { role: 'Umpire (Bowl End)',  x: -1.0, y: 0, z: -11.5, rotY: 0                                },
    { role: 'Umpire (Sq Leg)',    x: -13,  y: 0, z:  0,    rotY: Math.PI * 0.5                   },
    { role: 'Bowler',             x:  0.5, y: 0, z: -24,   rotY: 0,                hasBall: true },
    { role: 'Keeper',             x:  0,   y: 0, z:  14,   rotY: Math.PI                         },
    { role: 'Slip',               x:  3,   y: 0, z:  14.5, rotY: Math.PI                         },
    { role: 'Third Man',          x:  15,  y: 0, z:  22,   rotY: Math.PI * 0.9                   },
    { role: 'Point',              x:  24,  y: 0, z:  5,    rotY: Math.PI * 0.85                  },
    { role: 'Cover',              x:  21,  y: 0, z: -14,   rotY: Math.PI * 0.62                  },
    { role: 'Mid-Off',            x:  9,   y: 0, z: -25,   rotY: Math.PI * 0.12                  },
    { role: 'Mid-On',             x: -9,   y: 0, z: -25,   rotY: -Math.PI * 0.12                 },
    { role: 'Mid-Wicket',         x: -22,  y: 0, z: -14,   rotY: -Math.PI * 0.6                  },
    { role: 'Square Leg',         x: -24,  y: 0, z:  4,    rotY: -Math.PI * 0.85                 },
    { role: 'Fine Leg',           x: -15,  y: 0, z:  22,   rotY: Math.PI * 1.15                  }
  ];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  document.body.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.6);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(80, 400, 80);
  scene.add(sun);

  // ─── LOADER ─────────────────────────────────────────────────
  const loader = new THREE.GLTFLoader();
  if (typeof THREE.DRACOLoader === 'function'){
    try {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
      loader.setDRACOLoader(draco);
      console.log('[Loader] DRACO attached ✅');
    } catch(e){ console.warn('[Loader] DRACO failed:', e); }
  } else {
    console.warn('[Loader] THREE.DRACOLoader not found');
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
        console.warn('[StadiumView] ❌ ' + key + ' — ' + (err && err.message ? err.message : 'not found'));
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

  // ─── HELPERS ────────────────────────────────────────────────
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
    obj.traverse(function(c){
      c.visible = true;
      c.frustumCulled = false;
      if (c.isMesh && c.material){
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(function(m){
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
          if (typeof m.roughness === 'number') m.roughness = 0.75;
          m.side = THREE.DoubleSide;
          if (m.emissive) m.emissive.setHex(0x000000);
          m.needsUpdate = true;
        });
      }
    });
  }

  function findFieldLevel(stadiumModel){
    const raycaster = new THREE.Raycaster();
    raycaster.set(new THREE.Vector3(0, 1000, 0), new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(stadiumModel, true);
    if (hits.length > 0) return hits[0].point.y;
    return 0;
  }

  // ─── EQUIPMENT ──────────────────────────────────────────────
  function makeBat(){
    const g = new THREE.Group();
    const bladeMat  = new THREE.MeshStandardMaterial({ color: 0xd4b483, roughness: 0.75 });
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
    const mat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });
    return new THREE.Mesh(new THREE.SphereGeometry(BALL_DIAMETER / 2, 16, 16), mat);
  }

  function makeStumps(){
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xefe2c0, roughness: 0.7 });
    [-0.11, 0, 0.11].forEach(function(x){
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, STUMPS_HEIGHT, 12), mat);
      s.position.set(x, STUMPS_HEIGHT / 2, 0);
      g.add(s);
    });
    return g;
  }

  let stadiumRadius = 100;
  let fieldY = 0;
  let stadiumModel = null;

  function placeStadium(model){
    if (!model) return;
    stadiumModel = model;
    scaleToMaxDim(model, STADIUM_SIZE);
    bottomToZero(model);
    model.position.set(0, 0, 0);
    scene.add(model);

    // ─── RAYCAST FIRST — while materials are still DoubleSide ───
    fieldY = findFieldLevel(model);
    console.log('[Raycast] grass at y = ' + fieldY.toFixed(2));

    // ─── THEN force FrontSide so camera never sees interior walls ───
    model.traverse(function(c){
      if (c.isMesh){
        c.castShadow = false;
        c.receiveShadow = false;
        if (c.material){
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(function(m){
            m.side = THREE.FrontSide;
            m.needsUpdate = true;
          });
        }
      }
    });

    const box = new THREE.Box3().setFromObject(model);
    const sz = new THREE.Vector3();
    box.getSize(sz);
    stadiumRadius = Math.max(sz.x, sz.z) * 0.6;
    console.log('[Stadium] size: ' + sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1));
  }

  // ═══════════════════════════════════════════════════════════
  //  FLOOD LIGHTS — from the 4 corner towers baked into the model
  // ═══════════════════════════════════════════════════════════
  const floodLights = [];

  function attachFloodlight(pos, panelNormal){
    // SpotLight at the tower top, aimed at the pitch centre
    const spot = new THREE.SpotLight(
      0xffe9c0,             // warm white
      0.0,
      600,                  // max range covers 200 m stadium
      Math.PI * 0.24,       // ~43° beam — covers the whole field
      0.55,
      0.0                   // NO distance falloff
    );
    spot.position.set(pos.x, pos.y, pos.z);
    spot.target.position.set(0, fieldY, 0);
    scene.add(spot);
    scene.add(spot.target);

    // Emissive quad on the tower's lamp panel — glows bright at night.
    // Positioned just in front of the tower's own dark panel.
    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.0,
      toneMapped: false
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), panelMat);

    // Place the quad slightly inward from the tower, facing the pitch
    const nx = panelNormal.x, nz = panelNormal.z;
    const panelPos = new THREE.Vector3(
      pos.x + nx * 0.9,
      pos.y - 1.8,
      pos.z + nz * 0.9
    );
    panel.position.copy(panelPos);
    panel.lookAt(0, panelPos.y, 0);
    scene.add(panel);

    const ref = {
      spot: spot,
      panel: panel,
      panelMat: panelMat,
      setGlow: function(v){
        spot.intensity   = v * 5.0;
        panelMat.opacity = v * 1.0;
        panelMat.color.setRGB(
          0.15 + v * 0.85,
          0.15 + v * 0.85,
          0.10 + v * 0.90
        );
      }
    };
    ref.setGlow(0);
    floodLights.push(ref);
  }

  function buildFloodlights(){
    // 4 corner towers — matches the visible model geometry
    // Each tower's lamp panel faces the pitch centre
    const R = TOWER_RADIUS_XZ;
    const H = TOWER_TOP_Y;

    const towers = [
      { x:  R, y: fieldY + H, z:  R, nx: -1, nz: -1 },   // NE corner
      { x: -R, y: fieldY + H, z:  R, nx:  1, nz: -1 },   // NW corner
      { x:  R, y: fieldY + H, z: -R, nx: -1, nz:  1 },   // SE corner
      { x: -R, y: fieldY + H, z: -R, nx:  1, nz:  1 }    // SW corner
    ];

    // Normalize the inward directions
    towers.forEach(function(t){
      const len = Math.hypot(t.nx, t.nz);
      t.nx /= len;
      t.nz /= len;
    });

    towers.forEach(function(t){
      attachFloodlight(
        { x: t.x, y: t.y, z: t.z },
        { x: t.nx, z: t.nz }
      );
    });

    console.log('[Floodlights] ' + floodLights.length + ' lights placed on the model\'s 4 corner towers');
  }

  // ═══════════════════════════════════════════════════════════
  //  ADVERTISING BOARDS
  // ═══════════════════════════════════════════════════════════
  const AD_BOARD_RADIUS = BOUNDARY_RADIUS + 1.5;
  const AD_BOARD_COUNT  = 24;

  function makeAdTexture(label, bg, fg){
    const cvs = document.createElement('canvas');
    cvs.width = 512; cvs.height = 96;
    const ctx = cvs.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cvs.width, cvs.height);
    ctx.fillStyle = fg;
    ctx.fillRect(0, 0, cvs.width, 6);
    ctx.fillRect(0, cvs.height - 6, cvs.width, 6);
    ctx.fillStyle = fg;
    ctx.font = 'bold 62px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cvs.width / 2, cvs.height / 2 + 2);
    const tex = new THREE.CanvasTexture(cvs);
    tex.anisotropy = 4;
    return tex;
  }

  function buildAdBoards(){
    const brands = [
      { label: 'CRICMAX',   bg: '#0a0e1a', fg: '#00e676' },
      { label: 'CRICMAX',   bg: '#7f1d1d', fg: '#ffffff' },
      { label: 'LIVE',      bg: '#0a0e1a', fg: '#22d3ee' },
      { label: 'REPLAY',    bg: '#111111', fg: '#ff6d00' },
      { label: 'CRICMAX',   bg: '#1e3a8a', fg: '#ffffff' },
      { label: 'MATCHVIEW', bg: '#0a0e1a', fg: '#fbbf24' }
    ];

    const boardH = 1.0;
    const boardW = 5.0;

    for (let i = 0; i < AD_BOARD_COUNT; i++){
      const a = (i / AD_BOARD_COUNT) * Math.PI * 2;
      const x = Math.cos(a) * AD_BOARD_RADIUS;
      const z = Math.sin(a) * AD_BOARD_RADIUS;
      const b = brands[i % brands.length];

      const tex = makeAdTexture(b.label, b.bg, b.fg);
      const mat = new THREE.MeshStandardMaterial({
        map: tex, roughness: 0.6, metalness: 0.1,
        emissive: 0x111111, emissiveIntensity: 0.35
      });
      const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.15), mat);
      board.position.set(x, fieldY + boardH / 2 + 0.05, z);
      board.lookAt(0, fieldY + boardH / 2, 0);
      scene.add(board);
    }
    console.log('[AdBoards] ' + AD_BOARD_COUNT + ' textured boards @ r=' + AD_BOARD_RADIUS);
  }

  // ═══════════════════════════════════════════════════════════
  //  PLAYERS
  // ═══════════════════════════════════════════════════════════
  const playerRefs = {};
  const accessoryRefs = {};

  function placePlayers(playersData){
    playersData.forEach(function(pd){
      const src = pd.model;
      const pos = pd.pos;
      if (!src) return;

      const group = new THREE.Group();
      group.name = 'PLAYER_' + pos.role.replace(/[^a-z0-9]/gi, '_');
      group.userData.role = pos.role;

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
      group.position.set(pos.x, fieldY, pos.z);

      scene.add(group);
      playerRefs[pos.role] = group;
    });
    console.log('[Players] ' + Object.keys(playerRefs).length + ' placed');
  }

  // ─── BOOT ───────────────────────────────────────────────────
  async function boot(){
    console.log('[Boot] boot() entered');
    const tasks = [{ key: 'stadium', url: STADIUM_FILE, type: 'stadium' }];
    FIELD_POSITIONS.forEach(function(pos, i){
      tasks.push({
        key: pos.role.replace(/[^a-z0-9]/gi, ''),
        url: PLAYER_FILES[i % PLAYER_FILES.length],
        type: 'player',
        pos: pos
      });
    });

    console.log('[Boot] loading ' + tasks.length + ' models...');

    let done = 0;
    const results = await Promise.all(tasks.map(function(t){
      return loadOne(t.key, t.url).then(function(m){
        done++;
        const sub = document.getElementById('loaderSub');
        const txt = document.getElementById('loaderText');
        if (sub) sub.textContent = done + ' / ' + tasks.length + ' models';
        if (txt && done === tasks.length) txt.textContent = 'Ready';
        return { type: t.type, model: m, pos: t.pos };
      });
    }));

    console.log('[Boot] all models resolved');

    const stadiumResult = results.find(function(r){ return r.type === 'stadium'; });
    placeStadium(stadiumResult ? stadiumResult.model : null);

    buildFloodlights();
    buildAdBoards();

    const stumpsA = makeStumps();
    stumpsA.position.set(0, fieldY, 10);
    scene.add(stumpsA);

    const stumpsB = makeStumps();
    stumpsB.position.set(0, fieldY, -10);
    scene.add(stumpsB);

    const playerData = results.filter(function(r){ return r.type === 'player'; });
    placePlayers(playerData);

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
      ambient: ambient,
      stadiumModel: stadiumModel,
      stadiumRadius: stadiumRadius,
      fieldY: fieldY,
      players: playerRefs,
      accessories: accessoryRefs,
      stumpsStriker: stumpsA,
      stumpsBowler: stumpsB,
      BOUNDARY_RADIUS: BOUNDARY_RADIUS,
      floodLights: floodLights,
      setFloodlights: function(v){
        floodLights.forEach(function(f){ f.setGlow(v); });
      }
    };

    console.log('[StadiumView] Ready. fieldY=' + fieldY.toFixed(2) +
                ' · floods=' + floodLights.length +
                ' · players=' + Object.keys(playerRefs).length);
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
      frames = 0; lastFps = now;
    }
  }

  console.log('[stadium.js] calling boot() + animate()');
  boot().catch(function(e){
    console.error('[stadium.js] ❌ boot() threw:', e);
  });
  animate();

})();
