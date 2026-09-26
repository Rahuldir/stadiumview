/* ══════════════════════════════════════════════════════════════
   StadiumView — scene builder (standalone, mobile-aware)
   • Flood lights: intensity 1.8, narrower beam
   • fieldY from multi-sample raycast (7.20)
   • Loads single shared player model for all roles
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[stadium.js] IIFE started — standalone v4.2', 'color:#00e676;font-weight:bold');

  const ua = navigator.userAgent || '';
  const IS_MOBILE =
    /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini/i.test(ua)
    || (navigator.maxTouchPoints > 1 && window.innerWidth < 900);
  const PIXEL_RATIO = IS_MOBILE ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  console.log('[Perf] ' + (IS_MOBILE ? 'MOBILE' : 'DESKTOP') + ' · pixelRatio=' + PIXEL_RATIO);

  const STADIUM_FILE = 'models/stadium.glb';
  const PLAYER_FILE  = 'models/newplayer.glb';
  const BAT_FILE     = 'models/bat.glb';
  const STUMP_FILE   = 'models/stump.glb';

  const STADIUM_SIZE    = 200;
  const PLAYER_HEIGHT   = 1.80;
  const BALL_DIAMETER   = 0.072;
  const STUMPS_HEIGHT   = 0.71;
  const BOUNDARY_RADIUS = 38;
  const TOWER_XZ        = 82;
  const TOWER_Y         = 46;

  const FIELD_POSITIONS = [
    { role:'Striker',             x: 0.4, y:0, z: 8.6, rotY:Math.PI,        hasBat:true  },
    { role:'Non-Striker',         x:-1.2, y:0, z:-8.6, rotY:0,              hasBat:true  },
    { role:'Umpire (Bowl End)',   x:-1.0, y:0, z:-11.5,rotY:0                            },
    { role:'Umpire (Sq Leg)',     x:-13,  y:0, z: 0,   rotY:Math.PI*0.5                  },
    { role:'Bowler',              x: 0.5, y:0, z:-24,  rotY:0,              hasBall:true },
    { role:'Keeper',              x: 0,   y:0, z: 14,  rotY:Math.PI                      },
    { role:'Slip',                x: 3,   y:0, z: 14.5,rotY:Math.PI                      },
    { role:'Third Man',           x: 15,  y:0, z: 22,  rotY:Math.PI*0.9                  },
    { role:'Point',               x: 24,  y:0, z: 5,   rotY:Math.PI*0.85                 },
    { role:'Cover',               x: 21,  y:0, z:-14,  rotY:Math.PI*0.62                 },
    { role:'Mid-Off',             x: 9,   y:0, z:-25,  rotY:Math.PI*0.12                 },
    { role:'Mid-On',              x:-9,   y:0, z:-25,  rotY:-Math.PI*0.12                },
    { role:'Mid-Wicket',          x:-22,  y:0, z:-14,  rotY:-Math.PI*0.6                 },
    { role:'Square Leg',          x:-24,  y:0, z: 4,   rotY:-Math.PI*0.85                },
    { role:'Fine Leg',            x:-15,  y:0, z: 22,  rotY:Math.PI*1.15                 }
  ];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.3, 2000);
  const renderer = new THREE.WebGLRenderer({
    antialias: !IS_MOBILE,
    powerPreference: IS_MOBILE ? 'default' : 'high-performance',
    alpha: false
  });
  renderer.setPixelRatio(PIXEL_RATIO);
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

  const loader = new THREE.GLTFLoader();
  if (typeof THREE.DRACOLoader === 'function'){
    try {
      const draco = new THREE.DRACOLoader();
      draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/libs/draco/');
      loader.setDRACOLoader(draco);
      console.log('[Loader] DRACO attached ✅');
    } catch(e){}
  }

  const loadStatus = {};
  function loadOne(key, url){
    loadStatus[key] = { status:'pending' };
    updateList();
    return new Promise(function(resolve){
      loader.load(url, function(gltf){
        const m = gltf.scene || gltf.scenes[0];
        if (m && !m.name) m.name = key;
        loadStatus[key] = { status:'loaded' };
        updateList();
        console.log('[StadiumView] ✅ ' + key);
        resolve(m);
      }, function(p){
        if (p.total){
          loadStatus[key] = { status:'loading', pct: Math.round(p.loaded/p.total*100) };
          updateList();
        }
      }, function(){
        loadStatus[key] = { status:'failed' };
        updateList();
        console.warn('[StadiumView] ❌ ' + key);
        resolve(null);
      });
    });
  }
  function updateList(){
    const el = document.getElementById('modelList');
    if (!el) return;
    el.innerHTML = Object.keys(loadStatus).sort().map(function(k){
      const s = loadStatus[k];
      const icon = s.status === 'loaded' ? '✅' : s.status === 'failed' ? '❌' : '⏳';
      return '<div>' + icon + ' ' + k + '</div>';
    }).join('');
  }

  function scaleToHeight(model, targetHeight){
    model.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    if (size.y === 0) return 1;
    const s = targetHeight / size.y;
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);
    return s;
  }
  function scaleToMaxDim(model, targetMax){
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return 1;
    const s = targetMax / maxDim;
    model.scale.setScalar(s);
    model.updateMatrixWorld(true);
    return s;
  }
  function bottomToZero(model){
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
  }
  function forceVisible(obj){
    obj.traverse(function(c){
      c.visible = true;
      c.frustumCulled = true;
      if (c.isMesh && c.material){
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(function(m){
          m.transparent = false;
          m.opacity = 1;
          m.depthWrite = true;
          if (typeof m.roughness === 'number') m.roughness = 0.75;
          m.side = THREE.FrontSide;
          if (m.emissive) m.emissive.setHex(0x000000);
          m.needsUpdate = true;
        });
      }
    });
  }

  function findFieldLevel(stadium){
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0,-1,0);
    const counts = {};
    for (let x = -15; x <= 15; x += 3){
      for (let z = -15; z <= 15; z += 3){
        raycaster.set(new THREE.Vector3(x, 150, z), down);
        const hits = raycaster.intersectObject(stadium, true);
        if (hits.length){
          const k = Math.round(hits[0].point.y * 10) / 10;
          counts[k] = (counts[k] || 0) + 1;
        }
      }
    }
    let bestY = 0, bestCount = 0;
    Object.keys(counts).forEach(function(k){
      if (counts[k] > bestCount){ bestCount = counts[k]; bestY = parseFloat(k); }
    });
    return bestCount >= 3 && bestY > 1 ? bestY : 7.20;
  }

  function makeBat(){
    const g = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.60, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xd4b483, roughness: 0.75 })
    );
    blade.position.y = 0.30; g.add(blade);
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.36, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })
    );
    handle.position.y = 0.78; g.add(handle);
    return g;
  }
  function makeBall(){
    return new THREE.Mesh(
      new THREE.SphereGeometry(BALL_DIAMETER/2, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 })
    );
  }
  function makeStumps(){
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xefe2c0, roughness: 0.7 });
    [-0.11,0,0.11].forEach(function(x){
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.019,0.019,STUMPS_HEIGHT,8), mat);
      s.position.set(x, STUMPS_HEIGHT/2, 0); g.add(s);
    });
    return g;
  }

  let fieldY = 7.20;
  let stadiumModel = null;
  let stadiumRadius = 100;

  function placeStadium(model){
    if (!model) return;
    stadiumModel = model;
    scaleToMaxDim(model, STADIUM_SIZE);
    bottomToZero(model);
    model.position.set(0,0,0);
    scene.add(model);

    // ✅ Raycast for the pitch level — DO NOT touch materials
    fieldY = findFieldLevel(model);
    console.log('[Raycast] grass y=' + fieldY.toFixed(2));

    // Only disable shadows — leave every material alone
    model.traverse(function(c){
      if (c.isMesh){ c.castShadow = false; c.receiveShadow = false; }
    });

    const box = new THREE.Box3().setFromObject(model);
    const sz = new THREE.Vector3(); box.getSize(sz);
    stadiumRadius = Math.max(sz.x, sz.z) * 0.6;
  }

  const floodLights = [];

  function attachFloodlight(x, z){
    const yWorld = fieldY + TOWER_Y;
    let spot = null;

    if (!IS_MOBILE){
      spot = new THREE.SpotLight(0xffe9c0, 0, 400, Math.PI * 0.18, 0.65, 0.0);
      spot.position.set(x, yWorld, z);
      spot.target.position.set(0, fieldY, 0);
      scene.add(spot);
      scene.add(spot.target);
    }

    const len = Math.hypot(x, z);
    const nx = -x/len, nz = -z/len;

    const panelMat = new THREE.MeshBasicMaterial({
      color: 0x111111, transparent: true, opacity: 0,
      side: THREE.DoubleSide, toneMapped: false
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), panelMat);
    panel.position.set(x + nx*0.6, yWorld - 1.5, z + nz*0.6);
    panel.lookAt(0, fieldY, 0);
    scene.add(panel);

    let cheapLight = null;
    if (IS_MOBILE){
      cheapLight = new THREE.PointLight(0xffe9c0, 0, 150, 1.5);
      cheapLight.position.set(x, yWorld - 2, z);
      scene.add(cheapLight);
    }

    const ref = {
      spot, panel, panelMat, cheapLight,
      setGlow: function(v){
        if (spot)       spot.intensity = v * 1.8;
        if (cheapLight) cheapLight.intensity = v * 0.35;
        panelMat.opacity = v;
        panelMat.color.setRGB(0.15 + v*0.85, 0.15 + v*0.85, 0.10 + v*0.90);
      }
    };
    ref.setGlow(0);
    floodLights.push(ref);
  }

  function buildFloodlights(){
    const R = TOWER_XZ;
    [[R,R],[-R,R],[R,-R],[-R,-R]].forEach(function(p){ attachFloodlight(p[0], p[1]); });
  }

  function buildAdBoards(){
    const count = IS_MOBILE ? 10 : 24;
    const colors = [0x0a0e1a, 0x7f1d1d, 0x0a0e1a, 0x111111, 0x1e3a8a, 0x0a0e1a];
    const H = 1.0, W = 5.0, R = BOUNDARY_RADIUS + 1.5;

    for (let i = 0; i < count; i++){
      const a = (i/count) * Math.PI * 2;
      const x = Math.cos(a)*R, z = Math.sin(a)*R;
      const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
      const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.15), mat);
      board.position.set(x, fieldY + H/2 + 0.05, z);
      board.lookAt(0, fieldY + H/2, 0);
      scene.add(board);
    }
  }

  const playerRefs = {};
  const accessoryRefs = {};

  function placePlayers(playerGLB){
    if (!playerGLB) return;
    FIELD_POSITIONS.forEach(function(pos){
      const group = new THREE.Group();
      group.name = 'PLAYER_' + pos.role.replace(/[^a-z0-9]/gi,'_');
      group.userData.role = pos.role;

      const pm = THREE.SkeletonUtils && THREE.SkeletonUtils.clone
        ? THREE.SkeletonUtils.clone(playerGLB)
        : playerGLB.clone(true);

      pm.position.set(0,0,0);
      pm.rotation.set(0,0,0);
      pm.scale.set(1,1,1);
      scaleToHeight(pm, PLAYER_HEIGHT);
      forceVisible(pm);
      group.add(pm);

      if (pos.hasBat){
        loadOne('bat', BAT_FILE).then(batModel => {
          if (batModel) {
            const bat = batModel.clone(true);
            scaleToHeight(bat, 0.96);
            bat.position.set(-0.35, 0.95, 0.25);
            bat.rotation.x = -0.7; bat.rotation.z = 0.15;
            group.add(bat);
            accessoryRefs[pos.role] = accessoryRefs[pos.role] || {};
            accessoryRefs[pos.role].bat = bat;
          }
        });
      }
      if (pos.hasBall){
        const ball = makeBall();
        ball.position.set(0.35, 1.35, 0.20);
        group.add(ball);
        accessoryRefs[pos.role] = accessoryRefs[pos.role] || {};
        accessoryRefs[pos.role].ball = ball;
      }

      group.rotation.y = pos.rotY || 0;
      group.position.set(pos.x, fieldY, pos.z);
      scene.add(group);
      playerRefs[pos.role] = group;
    });
    console.log('[Players] ' + Object.keys(playerRefs).length + ' placed @ y=' + fieldY.toFixed(2));
  }

  async function boot(){
    console.log('[Boot] boot() entered');
    const [stadiumModel, playerModel] = await Promise.all([
      loadOne('stadium', STADIUM_FILE),
      loadOne('player', PLAYER_FILE)
    ]);

    placeStadium(stadiumModel);
    buildFloodlights();
    buildAdBoards();

    const stumpsA = makeStumps(); stumpsA.position.set(0, fieldY, 10); scene.add(stumpsA);
    const stumpsB = makeStumps(); stumpsB.position.set(0, fieldY,-10); scene.add(stumpsB);

    placePlayers(playerModel);

    window.StadiumView = {
      scene, camera, renderer, sun, hemi, ambient,
      stadiumModel, stadiumRadius, fieldY,
      players: playerRefs,
      accessories: accessoryRefs,
      stumpsStriker: stumpsA, stumpsBowler: stumpsB,
      BOUNDARY_RADIUS,
      floodLights,
      setFloodlights: function(v){ floodLights.forEach(function(f){ f.setGlow(v); }); }
    };
    console.log('[StadiumView] Ready. fieldY=' + fieldY.toFixed(2));
  }

  window.addEventListener('resize', function(){
    camera.aspect = innerWidth/innerHeight;
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
      if (fpsEl){
        const f = frames;
        fpsEl.textContent = f + ' FPS';
        fpsEl.classList.toggle('low', f < 25);
      }
      frames = 0; lastFps = now;
    }
  }

  boot().catch(function(e){ console.error('[stadium.js] boot threw:', e); });
  animate();

})();
