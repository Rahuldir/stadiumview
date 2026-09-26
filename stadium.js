/* ══════════════════════════════════════════════════════════════
   StadiumView — final scene builder
   • stadium.glb  · newplayer.glb  · bat.glb  · stump.glb
   • Pitch at Y = 7.19 (hardcoded, verified)
   • 15 players · 2 real stumps · 1 ball
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[stadium.js] FINAL v5 · loading', 'color:#00e676;font-weight:bold');

  const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const PIXEL_RATIO = IS_MOBILE ? 1 : Math.min(devicePixelRatio || 1, 2);

  const FILES = {
    stadium: 'models/stadium.glb',
    player:  'models/newplayer.glb',
    bat:     'models/bat.glb',
    stump:   'models/stump.glb'
  };

  const STADIUM_SIZE  = 200;
  const PLAYER_HEIGHT = 1.80;
  const BAT_LENGTH    = 0.96;
  const STUMPS_HEIGHT = 0.71;

  const FIELD_Y = 7.19;

  const ROLES = [
    { role:'Striker',           x:-0.30, z:  8.8, rotY: Math.PI*0.72, bat:true  },
    { role:'Non-Striker',       x: 1.00, z: -8.8, rotY:-Math.PI*0.22, bat:true  },
    { role:'Umpire (Bowl End)', x:-1.10, z:-11.5, rotY: 0                        },
    { role:'Umpire (Sq Leg)',   x:-13,   z:  0,   rotY: Math.PI*0.5              },
    { role:'Bowler',            x: 0.60, z:-24,   rotY: 0,             ball:true },
    { role:'Keeper',            x:-0.30, z: 12.6, rotY: Math.PI                  },
    { role:'Slip',              x: 2.4,  z: 13.5, rotY: Math.PI                  },
    { role:'Third Man',         x: 15,   z: 22,   rotY: Math.PI*0.9              },
    { role:'Point',             x: 24,   z:  5,   rotY: Math.PI*0.85             },
    { role:'Cover',             x: 21,   z:-14,   rotY: Math.PI*0.62             },
    { role:'Mid-Off',           x: 9,    z:-25,   rotY: Math.PI*0.12             },
    { role:'Mid-On',            x:-9,    z:-25,   rotY:-Math.PI*0.12             },
    { role:'Mid-Wicket',        x:-22,   z:-14,   rotY:-Math.PI*0.6              },
    { role:'Square Leg',        x:-24,   z:  4,   rotY:-Math.PI*0.85             },
    { role:'Fine Leg',          x:-15,   z: 22,   rotY: Math.PI*1.15             }
  ];

  const TOWER_POS = [[82,82],[-82,82],[82,-82],[-82,-82]];
  const TOWER_Y   = 46;

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
  renderer.toneMappingExposure = 1.1;
  document.body.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1.2);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(60, 200, 40);
  scene.add(sun);

  // ─── Loader ────────────────────────────────────────────────
  const loader = new THREE.GLTFLoader();

  if (THREE.DRACOLoader){
    const draco = new THREE.DRACOLoader();
    draco.setDecoderPath('https://unpkg.com/three@0.176.0/examples/jsm/libs/draco/');
    loader.setDRACOLoader(draco);
  }
  if (THREE.MeshoptDecoder) loader.setMeshoptDecoder(THREE.MeshoptDecoder);
  if (THREE.KTX2Loader){
    try {
      const ktx2 = new THREE.KTX2Loader();
      ktx2.setTranscoderPath('https://unpkg.com/three@0.176.0/examples/jsm/libs/basis/');
      ktx2.detectSupport(renderer);
      loader.setKTX2Loader(ktx2);
    } catch(e){}
  }
  console.log('[gltf] decoders attached');

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
        gltf => { console.log('[loaded]', key); tickProgress();
                  resolve(gltf.scene || gltf.scenes[0]); },
        undefined,
        err => { console.error('[FAILED]', key, err && err.message ? err.message : err);
                 tickProgress(); resolve(null); }
      );
    });
  }

  function scaleToHeight(obj, h){
    obj.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3(); box.getSize(size);
    if (size.y === 0) return 1;
    const s = h / size.y;
    obj.scale.setScalar(s);
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;
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
        if (typeof m.roughness === 'number') m.roughness = 0.85;
        if (typeof m.metalness === 'number') m.metalness = 0;
        if (m.emissive) m.emissive.setHex(0x000000);
        m.needsUpdate = true;
      });
    });
  }

  async function boot(){
    const [stadiumGLB, playerGLB, batGLB, stumpGLB] = await Promise.all([
      loadGLB('stadium', FILES.stadium),
      loadGLB('player',  FILES.player),
      loadGLB('bat',     FILES.bat),
      loadGLB('stump',   FILES.stump)
    ]);

    if (stadiumGLB){
      const stadiumModel = stadiumGLB;
      scaleToMaxDim(stadiumModel, STADIUM_SIZE);
      bottomToZero(stadiumModel);
      stadiumModel.position.set(0, 0, 0);
      makeStandard(stadiumModel);
      scene.add(stadiumModel);
      window.__stadiumModel = stadiumModel;
      console.log('[stadium] placed · pitch at Y=' + FIELD_Y);
    }

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
          panelMat.color.setRGB(0.15+v*0.85, 0.15+v*0.85, 0.10+v*0.90);
        }
      });
    });

    // Stumps — real stump.glb
    function placeStumps(z){
      if (!stumpGLB) return null;
      const g = THREE.SkeletonUtils.clone(stumpGLB) || stumpGLB.clone(true);
      makeStandard(g);
      scaleToHeight(g, STUMPS_HEIGHT);
      g.position.set(0, FIELD_Y, z);
      scene.add(g);
      return g;
    }
    const stumpsStriker = placeStumps( 10);
    const stumpsBowler  = placeStumps(-10);

    const playerRefs    = {};
    const accessoryRefs = {};

    ROLES.forEach(r => {
      const group = new THREE.Group();
      group.name = 'PLAYER_' + r.role.replace(/[^a-z0-9]/gi, '_');
      group.userData.role = r.role;

      if (playerGLB){
        try {
          const model = THREE.SkeletonUtils && THREE.SkeletonUtils.clone
            ? THREE.SkeletonUtils.clone(playerGLB)
            : playerGLB.clone(true);
          makeStandard(model);
          scaleToHeight(model, PLAYER_HEIGHT);
          group.add(model);
        } catch(e){ console.warn('clone failed', e); }
      }

      group.position.set(r.x, FIELD_Y, r.z);
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

    window.StadiumView = {
      scene, camera, renderer,
      sun, hemi, ambient,
      stadiumModel: window.__stadiumModel,
      fieldY:       FIELD_Y,
      players:      playerRefs,
      accessories:  accessoryRefs,
      stumpsStriker, stumpsBowler,
      floodLights,
      setFloodlights(v){ floodLights.forEach(f => f.setGlow(v)); }
    };

    console.log('[stadium.js] ✅ FINAL ready · fieldY=' + FIELD_Y +
                ' · players=' + Object.keys(playerRefs).length);
  }

  window.addEventListener('resize', () => {
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

  boot().catch(e => console.error('[stadium.js] boot failed', e));
  animate();
})();
