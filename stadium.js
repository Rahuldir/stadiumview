/* ══════════════════════════════════════════════════════════════
   StadiumView — Scene builder
   • Loads stadium.glb · newplayer.glb · bat.glb · stump.glb
   • Real pitch surface verified at Y = 7.19 (from raycast)
   • 15 players + stumps + ball all sit on the pitch at 7.19
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
    player:  'models/newplayer.glb',
    bat:     'models/bat.glb',
    stump:   'models/stump.glb'
  };

  const STADIUM_SIZE    = 200;
  const PLAYER_HEIGHT   = 1.80;
  const BAT_LENGTH      = 0.96;
  const STUMPS_HEIGHT   = 0.71;
  const BOUNDARY_RADIUS = 38;

  // ═══════════════════════════════════════════════════════════
  //  FIELD_Y — verified 7.19 (pitch surface, above the 0 base)
  // ═══════════════════════════════════════════════════════════
  const FIELD_Y = 7.19;

  // ═══════════════════════════════════════════════════════════
  //  15 ROLES — real cricket formation
  // ═══════════════════════════════════════════════════════════
  const ROLES = [
    { role:'Striker',            x: -0.30, z:  8.8,  rotY: Math.PI * 0.72, bat: true  },
    { role:'Non-Striker',        x:  1.00, z: -8.8,  rotY:-Math.PI * 0.22, bat: true  },
    { role:'Umpire (Bowl End)',  x: -1.10, z: -11.5, rotY: 0                            },
    { role:'Umpire (Sq Leg)',    x: -13,   z:  0,    rotY: Math.PI * 0.5                },
    { role:'Bowler',             x:  0.60, z: -24,   rotY: 0,              ball: true },
    { role:'Keeper',             x: -0.30, z:  12.6, rotY: Math.PI                      },
    { role:'Slip',               x:  2.4,  z:  13.5, rotY: Math.PI                      },
    { role:'Third Man',          x:  15,   z:  22,   rotY: Math.PI * 0.9                },
    { role:'Point',              x:  24,   z:  5,    rotY: Math.PI * 0.85               },
    { role:'Cover',              x:  21,   z: -14,   rotY: Math.PI * 0.62               },
    { role:'Mid-Off',            x:  9,    z: -25,   rotY: Math.PI * 0.12               },
    { role:'Mid-On',             x: -9,    z: -25,   rotY:-Math.PI * 0.12               },
    { role:'Mid-Wicket',         x: -22,   z: -14,   rotY:-Math.PI * 0.6                },
    { role:'Square Leg',         x: -24,   z:  4,    rotY:-Math.PI * 0.85               },
    { role:'Fine Leg',           x: -15,   z:  22,   rotY: Math.PI * 1.15               }
  ];

  const TOWER_POS = [[82,82],[-82,82],[82,-82],[-82,-82]];
  const TOWER_Y   = 46;

  // ─── Scene ────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.2, 2500);
  camera.position.set(0, FIELD_Y + 6, 45);
  camera.lookAt(0, FIELD_Y + 2, 0);

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
  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.3);
  sun.position.set(60, 200, 40);
  scene.add(sun);

  // ─── Loader with all decoders ─────────────────────────────
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
    obj.position.y -= box.min.y;   // feet → local Y = 0
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
      if (!c.isMesh || !c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach(m => {
        m.side = THREE.FrontSide;
        m.transparent = false;
        m.opacity = 1;
        m.depthWrite = true;
        m.vertexColors = false;
        if (typeof m.roughness === 'number') m.roughness = 0.8;
        if (typeof m.metalness === 'number') m.metalness = 0;
        if (m.emissive) m.emissive.setHex(0x000000);
        m.needsUpdate = true;
      });
    });
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
      const stadiumModel = stadiumGLB;
      scaleToMaxDim(stadiumModel, STADIUM_SIZE);
      bottomToZero(stadiumModel);          // model bottom → Y = 0
      stadiumModel.position.set(0, 0, 0);
      makeStandard(stadiumModel);
      scene.add(stadiumModel);
      window.__stadiumModel = stadiumModel;
      console.log('[stadium] placed · pitch surface at Y=' + FIELD_Y);
    }

    // ── Floodlights ─────────────────────────────────────────
    const floodLights = [];
    TOWER_POS.forEach(([x, z]) => {
      const spot = new THREE.SpotLight(0xffe9c0, 0, 400, Math.PI*0.18, 0.65, 0.0);
      spot.position.set(x, FIELD_Y + TOWER_Y, z);
      spot.target.position.set(0, FIELD_Y, 0);
      scene.add(spot); scene.add(spot.target);

      const panelMat = new THREE.MeshBasicMaterial({
        color: 0x111111, transparent: true, opacity: 0,
        side: THREE.DoubleSide, toneMapped: false
      });
      const len = Math.hypot(x, z);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), panelMat);
      panel.position.set(x - x/len*0.6, FIELD_Y + TOWER_Y - 1.5, z - z/len*0.6);
      panel.lookAt(0, FIELD_Y, 0);
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
    //  STUMPS — one set at each end, sitting on the pitch
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
        g.position.set(0, FIELD_Y, z);
        scene.add(g);
        return g;
      }

      const g = THREE.SkeletonUtils.clone(stumpGLB) || stumpGLB.clone(true);
      makeStandard(g);
      scaleToHeight(g, STUMPS_HEIGHT);      // base of stumps at local Y=0
      g.position.set(0, FIELD_Y, z);        // world Y = 7.19
      scene.add(g);
      return g;
    }
    const stumpsStriker = placeStumps( 10);
    const stumpsBowler  = placeStumps(-10);

    // ═══════════════════════════════════════════════════════
    //  PLAYERS — 15 clones of newplayer.glb, feet on the pitch
    // ═══════════════════════════════════════════════════════
    const playerRefs    = {};
    const accessoryRefs = {};
    let usedFallback = false;

    ROLES.forEach(r => {
      const group = new THREE.Group();
      group.name = 'PLAYER_' + r.role.replace(/[^a-z0-9]/gi, '_');
      group.userData.role = r.role;

      let model = null;
      if (playerGLB){
        try {
          model = THREE.SkeletonUtils && THREE.SkeletonUtils.clone
            ? THREE.SkeletonUtils.clone(playerGLB)
            : playerGLB.clone(true);
          makeStandard(model);
          scaleToHeight(model, PLAYER_HEIGHT);   // feet at local Y=0
        } catch(e){
          console.warn('[clone failed for', r.role, ']', e.message);
          model = null;
        }
      }
      if (!model){ model = createFallbackPlayer(); usedFallback = true; }

      group.add(model);
      group.position.set(r.x, FIELD_Y, r.z);    // world Y = 7.19
      group.rotation.y = r.rotY || 0;
      scene.add(group);
      playerRefs[r.role] = group;

      // ── Bat ────────────────────────────────────────────
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

      // ── Ball ───────────────────────────────────────────
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

    console.log('[players spawned]', Object.keys(playerRefs).length,
                usedFallback ? '(fallback)' : '(real model)');

    // ── Public API ──────────────────────────────────────────
    window.StadiumView = {
      scene, camera, renderer,
      sun, hemi, ambient,
      stadiumModel:    window.__stadiumModel,
      fieldY:          FIELD_Y,
      players:         playerRefs,
      accessories:     accessoryRefs,
      stumpsStriker,
      stumpsBowler,
      BOUNDARY_RADIUS,
      floodLights,
      usedFallback,
      setFloodlights(v){ floodLights.forEach(f => f.setGlow(v)); }
    };

    console.log('[stadium.js] ✅ ready · fieldY=' + FIELD_Y.toFixed(2) +
                ' · players=' + Object.keys(playerRefs).length);
  }

  // ─── Articulated fallback (only if newplayer.glb fails) ──
  function createFallbackPlayer(){
    const root = new THREE.Group();
    const SKIN  = new THREE.MeshStandardMaterial({ color: 0xd9a87c, roughness: 0.85 });
    const SHIRT = new THREE.MeshStandardMaterial({ color: 0x1a4fa0, roughness: 0.7 });
    const PANT  = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.8 });
    const SHOE  = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

    function seg(mat, r, len, parent, y){
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat);
      m.position.y = (typeof y === 'number') ? y : -(len/2 + r);
      parent.add(m);
      return m;
    }
    function grp(name, parent, x, y, z){
      const g = new THREE.Group();
      g.name = name;
      if (typeof x === 'number') g.position.x = x;
      if (typeof y === 'number') g.position.y = y;
      if (typeof z === 'number') g.position.z = z;
      parent.add(g);
      return g;
    }

    const hips  = grp('mixamorigHips',   root,   0, 1.00, 0);
    const spine = grp('mixamorigSpine',  hips,   0, 0.12, 0);
    const chest = grp('mixamorigSpine2', spine,  0, 0.22, 0);
    const neck  = grp('mixamorigNeck',   chest,  0, 0.24, 0);
    const head  = grp('mixamorigHead',   neck,   0, 0.10, 0);

    seg(SHIRT, 0.20, 0.42, chest, 0.14);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 14), SKIN);
    headMesh.position.y = 0.10;
    head.add(headMesh);

    const lUpArm = grp('mixamorigLeftArm',      chest, -0.24, 0.24, 0);
    const lFoArm = grp('mixamorigLeftForeArm',  lUpArm,  0,  -0.30, 0);
    const lHand  = grp('mixamorigLeftHand',     lFoArm,  0,  -0.28, 0);
    seg(SKIN, 0.05, 0.26, lUpArm, -0.17);
    seg(SKIN, 0.045,0.24, lFoArm, -0.16);

    const rUpArm = grp('mixamorigRightArm',     chest,  0.24, 0.24, 0);
    const rFoArm = grp('mixamorigRightForeArm', rUpArm,  0,  -0.30, 0);
    const rHand  = grp('mixamorigRightHand',    rFoArm,  0,  -0.28, 0);
    seg(SKIN, 0.05, 0.26, rUpArm, -0.17);
    seg(SKIN, 0.045,0.24, rFoArm, -0.16);

    const lUpLeg = grp('mixamorigLeftUpLeg', hips, -0.10, 0, 0);
    const lLoLeg = grp('mixamorigLeftLeg',   lUpLeg, 0, -0.42, 0);
    const lFoot  = grp('mixamorigLeftFoot',  lLoLeg, 0, -0.42, 0);
    seg(PANT, 0.085, 0.34, lUpLeg, -0.24);
    seg(SKIN, 0.070, 0.34, lLoLeg, -0.24);
    const lShoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.22), SHOE);
    lShoe.position.set(0, -0.04, 0.05);
    lFoot.add(lShoe);

    const rUpLeg = grp('mixamorigRightUpLeg', hips, 0.10, 0, 0);
    const rLoLeg = grp('mixamorigRightLeg',   rUpLeg, 0, -0.42, 0);
    const rFoot  = grp('mixamorigRightFoot',  rLoLeg, 0, -0.42, 0);
    seg(PANT, 0.085, 0.34, rUpLeg, -0.24);
    seg(SKIN, 0.070, 0.34, rLoLeg, -0.24);
    const rShoe = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.22), SHOE);
    rShoe.position.set(0, -0.04, 0.05);
    rFoot.add(rShoe);

    return root;
  }

  // ─── Resize ──────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  // ─── Render loop ─────────────────────────────────────────
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
