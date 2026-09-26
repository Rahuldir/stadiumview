/* ══════════════════════════════════════════════════════════════
   StadiumView — Scene builder
   Loads: stadium.glb · newplayer.glb · bat.glb · stump.glb
   Spawns: 15 cloned players, 2 bats, 2 stump sets, 1 ball
   Exposes: window.StadiumView
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[stadium.js] start', 'color:#00e676;font-weight:bold');

  const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const PIXEL_RATIO = IS_MOBILE ? 1 : Math.min(devicePixelRatio || 1, 2);

  const FILES = {
    stadium: 'models/stadium.glb',
    player:  'models/newplayer.glb',   // ← your new player model
    bat:     'models/bat.glb',
    stump:   'models/stump.glb'
  };

  const STADIUM_SIZE    = 200;
  const PLAYER_HEIGHT   = 1.80;
  const BAT_LENGTH      = 0.96;
  const STUMPS_HEIGHT   = 0.71;
  const BOUNDARY_RADIUS = 38;

  // ═══════════════════════════════════════════════════════════
  //  15 ROLES (11 fielding + 2 batsmen + 2 umpires)
  // ═══════════════════════════════════════════════════════════
  const ROLES = [
    { role:'Striker',           x:-0.30, z:  8.8, rotY: Math.PI*0.72, bat:true  },
    { role:'Non-Striker',       x: 1.00, z: -8.8, rotY:-Math.PI*0.22, bat:true  },
    { role:'Umpire (Bowl End)', x:-1.10, z:-11.5, rotY: 0                 },
    { role:'Umpire (Sq Leg)',   x:-13,   z:  0,   rotY: Math.PI*0.5     },
    { role:'Bowler',            x: 0.60, z:-24,   rotY: 0,             ball:true },
    { role:'Keeper',            x:-0.30, z: 12.6, rotY: Math.PI                },
    { role:'Slip',              x: 2.4,  z: 13.5, rotY: Math.PI                },
    { role:'Third Man',         x: 15,   z: 22,   rotY: Math.PI*0.9            },
    { role:'Point',             x: 24,   z:  5,   rotY: Math.PI*0.85           },
    { role:'Cover',             x: 21,   z:-14,   rotY: Math.PI*0.62           },
    { role:'Mid-Off',           x: 9,    z:-25,   rotY: Math.PI*0.12           },
    { role:'Mid-On',            x:-9,    z:-25,   rotY:-Math.PI*0.12           },
    { role:'Mid-Wicket',        x:-22,   z:-14,   rotY:-Math.PI*0.6            },
    { role:'Square Leg',        x:-24,   z:  4,   rotY:-Math.PI*0.85           },
    { role:'Fine Leg',          x:-15,   z: 22,   rotY: Math.PI*1.15           }
  ];

  const TOWER_POS = [[82,82],[-82,82],[82,-82],[-82,-82]];
  const TOWER_Y   = 46;

  // ─── Scene ────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.2, 2500);
  camera.position.set(60, 40, 60);
  camera.lookAt(0, 5, 0);

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

  // ─── Lights ───────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(90, 200, 90);
  scene.add(sun);

  // ═══════════════════════════════════════════════════════════
  //  GLTF LOADER  —  with ALL decoders attached
  // ═══════════════════════════════════════════════════════════
  const loader = new THREE.GLTFLoader();

  if (THREE.DRACOLoader){
    const draco = new THREE.DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.176.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
    console.log('[gltf] Draco attached');
  }
  if (THREE.MeshoptDecoder){
    loader.setMeshoptDecoder(THREE.MeshoptDecoder);
    console.log('[gltf] Meshopt attached');
  }
  if (THREE.KTX2Loader){
    try {
      const ktx2 = new THREE.KTX2Loader();
      ktx2.setTranscoderPath('https://unpkg.com/three@0.176.0/examples/jsm/libs/basis/');
      ktx2.detectSupport(renderer);
      loader.setKTX2Loader(ktx2);
      console.log('[gltf] KTX2 attached');
    } catch(e){ console.warn('[gltf] KTX2 setup failed:', e); }
  }

  // ─── Progress ─────────────────────────────────────────────
  const progress = { total: 4, done: 0 };
  function tickProgress(){
    progress.done++;
    const sub = document.getElementById('loaderSub');
    const txt = document.getElementById('loaderText');
    if (sub) sub.textContent = progress.done + ' / ' + progress.total;
    if (txt && progress.done >= progress.total) txt.textContent = 'Ready';
  }

  function loadGLB(key, url){
    return new Promise(resolve => {
      loader.load(url,
        gltf => {
          console.log('[loaded]', key);
          tickProgress();
          resolve(gltf.scene || gltf.scenes[0]);
        },
        xhr => {
          if (xhr && xhr.total){
            const pct = Math.round(xhr.loaded / xhr.total * 100);
            if (pct === 25 || pct === 50 || pct === 75)
              console.log('[loading]', key, pct + '%');
          }
        },
        err => {
          console.error('[FAILED]', key, err && err.message ? err.message : err);
          tickProgress();
          resolve(null);
        }
      );
    });
  }

  // ─── Helpers ──────────────────────────────────────────────
  function scaleToHeight(obj, h){
    obj.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    if (size.y === 0) return 1;
    const s = h / size.y;
    obj.scale.setScalar(s);
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;      // lift so bottom is at y=0
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

  // ─── Field level probe (accepts 0) ────────────────────────
  let fieldY = 0;
  let stadiumModel = null;

  function findFieldLevel(model){
    const ray  = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const counts = {};
    let totalHits = 0;
    for (let x = -20; x <= 20; x += 2){
      for (let z = -20; z <= 20; z += 2){
        ray.set(new THREE.Vector3(x, 200, z), down);
        const hits = ray.intersectObject(model, true);
        if (hits.length){
          totalHits++;
          const key = Math.round(hits[0].point.y * 10) / 10;
          counts[key] = (counts[key] || 0) + 1;
        }
      }
    }
    if (!totalHits){
      console.warn('[fieldY] no probe hits — using 0');
      return 0;
    }
    let bestY = 0, bestCount = 0;
    for (const k in counts){
      if (counts[k] > bestCount){ bestCount = counts[k]; bestY = parseFloat(k); }
    }
    console.log('[fieldY] probe: hits=' + totalHits + ' → y=' + bestY);
    return bestY;
  }

  // ═══════════════════════════════════════════════════════════
  //  MAIN BOOT
  // ═══════════════════════════════════════════════════════════
  async function boot(){
    const [stadiumGLB, playerGLB, batGLB, stumpGLB] = await Promise.all([
      loadGLB('stadium', FILES.stadium),
      loadGLB('player',  FILES.player),
      loadGLB('bat',     FILES.bat),
      loadGLB('stump',   FILES.stump)
    ]);

    // ── Stadium ─────────────────────────────────────────────
    if (stadiumGLB){
      stadiumModel = stadiumGLB;
      scaleToMaxDim(stadiumModel, STADIUM_SIZE);
      bottomToZero(stadiumModel);
      stadiumModel.position.set(0, 0, 0);
      makeStandard(stadiumModel);
      scene.add(stadiumModel);
      fieldY = findFieldLevel(stadiumModel);
      console.log('[fieldY]', fieldY.toFixed(2));
    } else {
      const plane = new THREE.Mesh(
        new THREE.CircleGeometry(BOUNDARY_RADIUS + 15, 48),
        new THREE.MeshStandardMaterial({ color: 0x2d7a3e, roughness: 1 })
      );
      plane.rotation.x = -Math.PI / 2;
      scene.add(plane);
      fieldY = 0;
    }

    // ── Floodlights ─────────────────────────────────────────
    const floodLights = [];
    TOWER_POS.forEach(([x, z]) => {
      const spot = new THREE.SpotLight(0xffe9c0, 0, 400, Math.PI*0.18, 0.65, 0.0);
      spot.position.set(x, fieldY + TOWER_Y, z);
      spot.target.position.set(0, fieldY, 0);
      scene.add(spot); scene.add(spot.target);

      const panelMat = new THREE.MeshBasicMaterial({
        color: 0x111111, transparent: true, opacity: 0,
        side: THREE.DoubleSide, toneMapped: false
      });
      const len = Math.hypot(x, z);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), panelMat);
      panel.position.set(x - x/len*0.6, fieldY + TOWER_Y - 1.5, z - z/len*0.6);
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

    // ═══════════════════════════════════════════════════════
    //  STUMPS — fixed Y so they sit on the ground
    // ═══════════════════════════════════════════════════════
    function placeStumps(z){
      if (!stumpGLB){
        const g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.7 });
        for (let i=-1; i<=1; i++){
          const cyl = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, STUMPS_HEIGHT, 8),
            mat
          );
          cyl.position.set(i*0.09, STUMPS_HEIGHT/2, 0);
          g.add(cyl);
        }
        g.position.set(0, fieldY, z);
        scene.add(g);
        return g;
      }

      const g = THREE.SkeletonUtils.clone(stumpGLB) || stumpGLB.clone(true);
      makeStandard(g);
      scaleToHeight(g, STUMPS_HEIGHT);   // lift so bottom is at y=0

      // ✅ Set X/Z freely, ADD fieldY on top of the lift
      g.position.x = 0;
      g.position.z = z;
      g.position.y += fieldY;

      scene.add(g);
      return g;
    }
    const stumpsStriker = placeStumps( 10);
    const stumpsBowler  = placeStumps(-10);

    // ═══════════════════════════════════════════════════════
    //  PLAYERS
    // ═══════════════════════════════════════════════════════
    const playerRefs    = {};
    const accessoryRefs = {};

    ROLES.forEach(r => {
      const group = new THREE.Group();
      group.name = 'PLAYER_' + r.role.replace(/[^a-z0-9]/gi, '_');
      group.userData.role = r.role;

      if (playerGLB){
        let model;
        if (THREE.SkeletonUtils && THREE.SkeletonUtils.clone){
          model = THREE.SkeletonUtils.clone(playerGLB);
        } else {
          model = playerGLB.clone(true);
        }
        makeStandard(model);
        scaleToHeight(model, PLAYER_HEIGHT);
        group.add(model);
      } else {
        // Humanoid fallback (so it doesn't look like a pill)
        const skin = new THREE.MeshStandardMaterial({ color: 0x004BA0, roughness: 0.7 });
        const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.20, 0.55, 4, 8), skin);
        torso.position.y = 1.20;
        const head  = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), skin);
        head.position.y = 1.68;
        const lLeg  = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 6), skin);
        lLeg.position.set(-0.10, 0.45, 0);
        const rLeg  = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.55, 4, 6), skin);
        rLeg.position.set( 0.10, 0.45, 0);
        const lArm  = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 6), skin);
        lArm.position.set(-0.28, 1.20, 0);
        const rArm  = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.45, 4, 6), skin);
        rArm.position.set( 0.28, 1.20, 0);
        group.add(torso, head, lLeg, rLeg, lArm, rArm);
      }

      group.position.set(r.x, fieldY, r.z);
      group.rotation.y = r.rotY || 0;
      scene.add(group);
      playerRefs[r.role] = group;

      if (r.bat && batGLB){
        const bat = THREE.SkeletonUtils
          ? THREE.SkeletonUtils.clone(batGLB)
          : batGLB.clone(true);
        makeStandard(bat);
        scaleToHeight(bat, BAT_LENGTH);
        bat.visible = true;
        scene.add(bat);
        accessoryRefs[r.role] = accessoryRefs[r.role] || {};
        accessoryRefs[r.role].bat = bat;
      }

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

    console.log('[players spawned]', Object.keys(playerRefs).length);

    // ── Public API ──────────────────────────────────────────
    window.StadiumView = {
      scene, camera, renderer,
      sun, hemi, ambient,
      stadiumModel,
      fieldY,
      players:     playerRefs,
      accessories: accessoryRefs,
      stumpsStriker,
      stumpsBowler,
      BOUNDARY_RADIUS,
      floodLights,
      setFloodlights(v){ floodLights.forEach(f => f.setGlow(v)); }
    };

    console.log('[stadium.js] ✅ ready · fieldY=' + fieldY.toFixed(2) +
                ' · players=' + Object.keys(playerRefs).length);
  }

  // ─── Resize ─────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ─── Render loop ────────────────────────────────────────────
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
