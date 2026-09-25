/* ══════════════════════════════════════════════════════════════
   StadiumView — scene builder
   Loads: stadium.glb · player.glb · bat.glb · stump.glb
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('[stadium.js] start');

  const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const PIXEL_RATIO = IS_MOBILE ? 1 : Math.min(devicePixelRatio || 1, 2);

  const STADIUM_SIZE    = 200;
  const PLAYER_HEIGHT   = 1.80;
  const BAT_LENGTH      = 0.96;
  const STUMPS_HEIGHT   = 0.71;
  const BOUNDARY_RADIUS = 38;
  const TOWER_Y         = 46;

  const FILES = {
    stadium: 'models/stadium.glb',
    player:  'models/player.glb',
    bat:     'models/bat.glb',
    stump:   'models/stump.glb'
  };

  const ROLES = [
    { role:'Striker',            x: -0.30, z:  8.8,  rotY: Math.PI * 0.72, bat: true },
    { role:'Non-Striker',        x:  1.00, z: -8.8,  rotY: -Math.PI * 0.22, bat: true },
    { role:'Umpire (Bowl End)',  x: -1.10, z: -11.5, rotY: 0 },
    { role:'Umpire (Sq Leg)',    x: -13,   z:  0,    rotY: Math.PI * 0.5 },
    { role:'Bowler',             x:  0.60, z: -24,   rotY: 0, ball: true },
    { role:'Keeper',             x: -0.30, z:  12.6, rotY: Math.PI },
    { role:'Slip',               x:  2.4,  z:  13.5, rotY: Math.PI },
    { role:'Third Man',          x:  15,   z:  22,   rotY: Math.PI * 0.9 },
    { role:'Point',              x:  24,   z:  5,    rotY: Math.PI * 0.85 },
    { role:'Cover',              x:  21,   z: -14,   rotY: Math.PI * 0.62 },
    { role:'Mid-Off',            x:  9,    z: -25,   rotY: Math.PI * 0.12 },
    { role:'Mid-On',             x: -9,    z: -25,   rotY: -Math.PI * 0.12 },
    { role:'Mid-Wicket',         x: -22,   z: -14,   rotY: -Math.PI * 0.6 },
    { role:'Square Leg',         x: -24,   z:  4,    rotY: -Math.PI * 0.85 },
    { role:'Fine Leg',           x: -15,   z:  22,   rotY: Math.PI * 1.15 }
  ];

  const TOWER_POS = [[82,82],[-82,82],[82,-82],[-82,-82]];

  // ─── Scene ──────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b8e0);
  scene.fog = null;

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.2, 2500);

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

  const ambient = new THREE.AmbientLight(0xffffff, 0.85);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa88, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(90, 200, 90);
  scene.add(sun);

  // ─── Load ───────────────────────────────────────────────
  const loader = new THREE.GLTFLoader();
  const progress = { total: 4, done: 0 };

  function tickProgress(){
    progress.done++;
    const sub = document.getElementById('loaderSub');
    const txt = document.getElementById('loaderText');
    if (sub) sub.textContent = progress.done + ' / ' + progress.total;
    if (txt && progress.done === progress.total) txt.textContent = 'Ready';
  }

  function load(key, url){
    return new Promise(resolve => {
      loader.load(url, g => {
        console.log('[loaded]', key);
        tickProgress();
        resolve(g.scene || g.scenes[0]);
      }, undefined, e => {
        console.warn('[failed]', key, e);
        tickProgress();
        resolve(null);
      });
    });
  }

  // ─── Helpers ────────────────────────────────────────────
  function scaleToHeight(obj, h){
    obj.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(obj);
    const s = new THREE.Vector3(); box.getSize(s);
    if (s.y === 0) return 1;
    const k = h / s.y;
    obj.scale.setScalar(k);
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;
    obj.updateMatrixWorld(true);
    return k;
  }
  function scaleToMaxDim(obj, m){
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    const s = new THREE.Vector3(); box.getSize(s);
    const md = Math.max(s.x, s.y, s.z);
    if (!md) return 1;
    const k = m / md;
    obj.scale.setScalar(k);
    obj.updateMatrixWorld(true);
    return k;
  }
  function bottomToZero(obj){
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.position.y -= box.min.y;
  }
  function prep(obj){
    obj.traverse(c => {
      if (!c.isMesh || !c.material) return;
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
  function clone(obj){
    if (THREE.SkeletonUtils && THREE.SkeletonUtils.clone) return THREE.SkeletonUtils.clone(obj);
    return obj.clone(true);
  }

  function findFieldLevel(model){
    const ray = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    const counts = {};
    for (let x = -15; x <= 15; x += 3){
      for (let z = -15; z <= 15; z += 3){
        ray.set(new THREE.Vector3(x, 100, z), down);
        const hits = ray.intersectObject(model, true);
        if (hits.length){
          const k = Math.round(hits[0].point.y * 10) / 10;
          counts[k] = (counts[k] || 0) + 1;
        }
      }
    }
    let bestY = 0, bestCount = 0;
    for (const k in counts){
      if (counts[k] > bestCount){ bestCount = counts[k]; bestY = parseFloat(k); }
    }
    return bestCount >= 3 ? bestY : 0;
  }

  // ═════════════════════════════════════════════════════════
  //  BOOT
  // ═════════════════════════════════════════════════════════
  async function boot(){
    const [stadiumGLB, playerGLB, batGLB, stumpGLB] = await Promise.all([
      load('stadium', FILES.stadium),
      load('player',  FILES.player),
      load('bat',     FILES.bat),
      load('stump',   FILES.stump)
    ]);

    let fieldY = 0;
    let stadiumModel = null;

    // Stadium
    if (stadiumGLB){
      stadiumModel = stadiumGLB;
      scaleToMaxDim(stadiumModel, STADIUM_SIZE);
      bottomToZero(stadiumModel);
      stadiumModel.position.set(0, 0, 0);
      prep(stadiumModel);
      scene.add(stadiumModel);
      fieldY = findFieldLevel(stadiumModel);
      console.log('[fieldY]', fieldY.toFixed(2));
    }

    // Flood light towers
    const floodLights = [];
    TOWER_POS.forEach(([x, z]) => {
      const spot = new THREE.SpotLight(0xffe9c0, 0, 400, Math.PI * 0.18, 0.65, 0.0);
      spot.position.set(x, fieldY + TOWER_Y, z);
      spot.target.position.set(0, fieldY, 0);
      scene.add(spot); scene.add(spot.target);

      const panelMat = new THREE.MeshBasicMaterial({
        color: 0x111111, transparent: true, opacity: 0,
        side: THREE.DoubleSide, toneMapped: false
      });
      const len = Math.hypot(x, z);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.5), panelMat);
      panel.position.set(x - x/len * 0.6, fieldY + TOWER_Y - 1.5, z - z/len * 0.6);
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

    // Stumps (2 sets)
    function placeStump(z){
      if (!stumpGLB) return null;
      const g = clone(stumpGLB);
      prep(g);
      scaleToHeight(g, STUMPS_HEIGHT);
      g.position.set(0, fieldY, z);
      scene.add(g);
      return g;
    }
    const stumpsA = placeStump(10);
    const stumpsB = placeStump(-10);

    // Players
    const playerRefs = {};
    const accessoryRefs = {};

    ROLES.forEach(r => {
      const group = new THREE.Group();
      group.name = 'PLAYER_' + r.role.replace(/[^a-z0-9]/gi, '_');
      group.userData.role = r.role;

      if (playerGLB){
        const model = clone(playerGLB);
        prep(model);
        scaleToHeight(model, PLAYER_HEIGHT);
        group.add(model);
      } else {
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8),
          new THREE.MeshStandardMaterial({ color: 0x004BA0 })
        );
        cap.position.y = 0.9;
        group.add(cap);
      }

      group.position.set(r.x, fieldY, r.z);
      group.rotation.y = r.rotY || 0;
      scene.add(group);
      playerRefs[r.role] = group;

      // Bat
      if (r.bat && batGLB){
        const bat = clone(batGLB);
        prep(bat);
        scaleToHeight(bat, BAT_LENGTH);
        scene.add(bat);
        accessoryRefs[r.role] = accessoryRefs[r.role] || {};
        accessoryRefs[r.role].bat = bat;
      }

      // Ball
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

    console.log('[players]', Object.keys(playerRefs).length);

    // Publish
    window.StadiumView = {
      scene, camera, renderer,
      sun, hemi, ambient,
      stadiumModel,
      fieldY,
      players: playerRefs,
      accessories: accessoryRefs,
      stumpsA, stumpsB,
      BOUNDARY_RADIUS,
      floodLights,
      setFloodlights(v){ floodLights.forEach(f => f.setGlow(v)); }
    };

    console.log('[stadium.js] ready · fieldY=' + fieldY.toFixed(2));
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
