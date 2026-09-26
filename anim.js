/* ══════════════════════════════════════════════════════════════
   StadiumView — Complex Match Engine v8.0
   • Full 3D ball physics (gravity, bounce, drag, Magnus)
   • Shot library → ball goes in the shot's direction
   • Fielder: chase → pickup → throw back to keeper
   • Role behaviors: keeper anticipation, umpire signals, head tracking
   • Match state: runs, wickets, balls, overs, batsmen on strike
   • Batsmen swap ends on odd runs; new batsman walks in after wicket
   Exposes: window.StadiumAnim  ·  window.MatchState
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  const GRAVITY     = 9.81;
  const BALL_RADIUS = 0.036;
  const BOUNDARY_R  = 38;
  const BOUNCE_DAMP = 0.42;
  const AIR_DRAG    = 0.015;
  const GROUND_FRIC = 2.4;

  const STRIKER_Z        =  8.8;
  const NON_STRIKER_Z    = -8.8;
  const BOWLER_START_Z   = -24;
  const BOWLER_RELEASE_Z = -11;

  // ═══════════════════════════════════════════════════════════
  //  MATCH STATE — public scoreboard
  // ═══════════════════════════════════════════════════════════
  const MatchState = {
    runs:        0,
    wickets:     0,
    balls:       0,       // legal deliveries in current innings
    over:        0,       // completed overs
    ballInOver:  0,       // 0..5
    lastOutcome: '—',
    striker:     { name: 'Striker',     runs: 0, balls: 0, onStrike: true  },
    nonStriker:  { name: 'Non-Striker', runs: 0, balls: 0, onStrike: false },
    bowler:      { name: 'Bowler',      balls: 0, runs: 0, wickets: 0 },
    overHistory: [],
    lastBallRuns: 0,

    reset(){
      this.runs = 0; this.wickets = 0; this.balls = 0;
      this.over = 0; this.ballInOver = 0; this.lastOutcome = '—';
      this.striker.runs = 0; this.striker.balls = 0;
      this.nonStriker.runs = 0; this.nonStriker.balls = 0;
      this.bowler.balls = 0; this.bowler.runs = 0; this.bowler.wickets = 0;
      this.overHistory = [];
    }
  };
  window.MatchState = MatchState;

  // ═══════════════════════════════════════════════════════════
  //  SHOT LIBRARY
  // ═══════════════════════════════════════════════════════════
  const SHOTS = {
    coverDrive:   { angle:  Math.PI * 0.15, power: 22, loft: 3, name: 'Cover Drive' },
    straightDrive:{ angle:  Math.PI * 0.02, power: 20, loft: 2, name: 'Straight Drive' },
    onDrive:      { angle: -Math.PI * 0.02, power: 20, loft: 2, name: 'On Drive' },
    squareCut:    { angle:  Math.PI * 0.48, power: 24, loft: 1, name: 'Square Cut' },
    pull:         { angle: -Math.PI * 0.50, power: 26, loft: 2, name: 'Pull' },
    hook:         { angle: -Math.PI * 0.75, power: 24, loft: 6, name: 'Hook' },
    flick:        { angle: -Math.PI * 0.30, power: 18, loft: 2, name: 'Flick' },
    sweep:        { angle: -Math.PI * 0.70, power: 20, loft: 1, name: 'Sweep' },
    lofted:       { angle:  Math.PI * 0.10, power: 30, loft: 15, name: 'Lofted Six' },
    defense:      { angle:  Math.PI * 0.10, power:  4, loft: 0, name: 'Defense' }
  };

  function boot(){
    const SV          = window.StadiumView;
    const players     = SV.players || {};
    const accessories = SV.accessories || {};
    const fieldY      = SV.fieldY || 0;
    const scene       = SV.scene;

    const bowler     = players['Bowler'];
    const striker    = players['Striker'];
    const nonStriker = players['Non-Striker'];
    const keeper     = players['Keeper'];
    const umpBowl    = players['Umpire (Bowl End)'];
    const strikerBat = accessories['Striker'] && accessories['Striker'].bat;
    const bowlerBall = accessories['Bowler']  && accessories['Bowler'].ball;

    const PC = window.PlayerControl;
    const strikerBones = PC && PC.players['Striker'] ? PC.players['Striker'].bones : {};
    const bowlerBones  = PC && PC.players['Bowler']  ? PC.players['Bowler'].bones  : {};
    const keeperBones  = PC && PC.players['Keeper']  ? PC.players['Keeper'].bones  : {};

    if (!bowler || !striker || !strikerBat || !bowlerBall){
      console.warn('[Anim] Missing refs — engine disabled');
      return;
    }

    const FIELDER_ROLES = [
      'Third Man','Point','Cover','Mid-Off','Mid-On',
      'Mid-Wicket','Square Leg','Fine Leg','Slip'
    ];
    const fielders = FIELDER_ROLES.map(r => players[r]).filter(Boolean);

    // Home snapshot
    const home = {};
    Object.keys(players).forEach(role => {
      home[role] = {
        pos:  players[role].position.clone(),
        rotY: players[role].rotation.y,
        rotX: players[role].rotation.x
      };
    });

    const batRest = {
      x: strikerBat.rotation.x,
      y: strikerBat.rotation.y,
      z: strikerBat.rotation.z
    };

    // ─── Flight ball ────────────────────────────────────────
    const flightBall = bowlerBall.clone(true);
    flightBall.traverse(c => {
      if (c.isMesh && c.material){
        c.material = c.material.clone();
        c.material.needsUpdate = true;
      }
    });
    flightBall.visible = false;
    scene.add(flightBall);
    if (bowlerBall) bowlerBall.visible = false;

    // ─── Trail ──────────────────────────────────────────────
    const trailMaxPoints = 60;
    const trailPositions = new Float32Array(trailMaxPoints * 3);
    const trailGeometry  = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setDrawRange(0, 0);
    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x22d3ee, transparent: true, opacity: 0.85
    });
    const trail = new THREE.Line(trailGeometry, trailMaterial);
    trail.frustumCulled = false;
    trail.visible = false;
    scene.add(trail);

    let trailCount = 0;
    function trailStart(color){
      trailMaterial.color.setHex(color);
      trailCount = 0;
      trail.visible = true;
      trailGeometry.setDrawRange(0, 0);
    }
    function trailPush(pos){
      if (trailCount >= trailMaxPoints){
        for (let i = 0; i < trailMaxPoints - 1; i++){
          trailPositions[i*3+0] = trailPositions[(i+1)*3+0];
          trailPositions[i*3+1] = trailPositions[(i+1)*3+1];
          trailPositions[i*3+2] = trailPositions[(i+1)*3+2];
        }
        trailCount = trailMaxPoints - 1;
      }
      trailPositions[trailCount*3+0] = pos.x;
      trailPositions[trailCount*3+1] = pos.y;
      trailPositions[trailCount*3+2] = pos.z;
      trailCount++;
      trailGeometry.attributes.position.needsUpdate = true;
      trailGeometry.setDrawRange(0, trailCount);
    }
    function trailStop(){
      trail.visible = false;
      trailCount = 0;
      trailGeometry.setDrawRange(0, 0);
    }

    // ─── Ball physics ───────────────────────────────────────
    const ball = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      active: false,
      rolling: false,
      bounces: 0,
      spinning: new THREE.Vector3()
    };

    function launchBall(pos, vel, spin){
      ball.pos.copy(pos);
      ball.vel.copy(vel);
      ball.spinning.set(spin ? spin.x : 0, spin ? spin.y : 0, spin ? spin.z : 0);
      ball.active  = true;
      ball.rolling = false;
      ball.bounces = 0;
      flightBall.position.copy(pos);
      flightBall.visible = true;
    }

    function updateBall(dt){
      if (!ball.active) return;

      if (ball.rolling){
        const speed = Math.hypot(ball.vel.x, ball.vel.z);
        if (speed < 0.3){ ball.active = false; return; }
        const newSpeed = Math.max(0, speed - GROUND_FRIC * dt);
        const r = newSpeed / speed;
        ball.vel.x *= r; ball.vel.z *= r;
        ball.pos.x += ball.vel.x * dt;
        ball.pos.z += ball.vel.z * dt;
        ball.pos.y = fieldY + BALL_RADIUS;
        flightBall.rotation.x += newSpeed * dt * 6;
      } else {
        ball.vel.y -= GRAVITY * dt;
        const k = 0.00015;
        ball.vel.x += k * (ball.spinning.y * ball.vel.z - ball.spinning.z * ball.vel.y) * dt;
        ball.vel.z += k * (ball.spinning.x * ball.vel.y - ball.spinning.y * ball.vel.x) * dt;
        const drag = 1 - AIR_DRAG * dt;
        ball.vel.x *= drag; ball.vel.z *= drag;

        ball.pos.x += ball.vel.x * dt;
        ball.pos.y += ball.vel.y * dt;
        ball.pos.z += ball.vel.z * dt;

        const groundY = fieldY + BALL_RADIUS;
        if (ball.pos.y < groundY){
          ball.pos.y = groundY;
          if (Math.abs(ball.vel.y) > 1.2){
            ball.vel.y = -ball.vel.y * BOUNCE_DAMP;
            ball.vel.x *= 0.78; ball.vel.z *= 0.78;
            ball.bounces++;
          } else {
            ball.rolling = true;
            ball.vel.y = 0;
          }
        }
        flightBall.rotation.x += 14 * dt;
        flightBall.rotation.y += 4 * dt;
      }

      flightBall.position.copy(ball.pos);
      if (ball.rolling && Math.hypot(ball.vel.x, ball.vel.z) < 0.3){
        ball.active = false;
      }
    }

    // ─── Delivery ───────────────────────────────────────────
    function launchDelivery(){
      const lengths = ['short', 'good', 'full'];
      const choice  = lengths[Math.floor(Math.random() * lengths.length)];
      let pitchZ = choice === 'short' ? 4.5 : choice === 'good' ? 6.5 : 8.0;
      const releaseY   = fieldY + 2.0;
      const releasePos = new THREE.Vector3(0.55, releaseY, BOWLER_RELEASE_Z);
      const t = 0.5;
      const vx = (0.3 - releasePos.x) / t;
      const vz = (pitchZ - releasePos.z) / t;
      const vy = (fieldY + 0.05 - releaseY + 0.5 * GRAVITY * t * t) / t;
      launchBall(releasePos, new THREE.Vector3(vx, vy, vz), { x: 20, y: 0, z: 0 });
    }

    // ─── Hit ────────────────────────────────────────────────
    let currentShot = null;
    let lastHitContactPos = new THREE.Vector3();

    function launchHit(outcome){
      const contactPos = new THREE.Vector3(
        striker.position.x, fieldY + 0.7, striker.position.z
      );
      lastHitContactPos.copy(contactPos);

      if (outcome.wicket){
        launchBall(contactPos, new THREE.Vector3(0, 0.5, 10), { x: 0, y: 0, z: 0 });
        return;
      }

      let shot;
      if (outcome.runs === 0)      shot = SHOTS.defense;
      else if (outcome.runs === 6) shot = SHOTS.lofted;
      else if (outcome.runs === 4){
        const opts = [SHOTS.coverDrive, SHOTS.squareCut, SHOTS.pull, SHOTS.straightDrive];
        shot = opts[Math.floor(Math.random() * opts.length)];
      } else {
        const opts = [SHOTS.flick, SHOTS.onDrive, SHOTS.coverDrive, SHOTS.straightDrive];
        shot = opts[Math.floor(Math.random() * opts.length)];
      }
      currentShot = shot;

      let power = shot.power;
      if (outcome.runs === 6) power = 32;
      if (outcome.runs === 4) power = 28;

      const dirX = Math.sin(shot.angle);
      const dirZ = -Math.cos(shot.angle);

      let vy = shot.loft * 1.5;
      if (outcome.runs === 6) vy = 14;
      else if (outcome.runs === 4) vy = shot.loft > 3 ? 8 : 2.5;

      launchBall(contactPos, new THREE.Vector3(dirX * power, vy, dirZ * power), { x: 15, y: 0, z: 0 });

      if (outcome.runs === 6) trailStart(0xff6d00);
      else if (outcome.runs === 4) trailStart(0x22d3ee);
    }

    const batWorldPos = new THREE.Vector3();
    function checkBatContact(){
      if (!strikerBat) return false;
      strikerBat.getWorldPosition(batWorldPos);
      const dx = ball.pos.x - batWorldPos.x;
      const dy = ball.pos.y - batWorldPos.y;
      const dz = ball.pos.z - batWorldPos.z;
      return Math.sqrt(dx*dx + dy*dy + dz*dz) < 0.6;
    }

    function rollOutcome(){
      const r = Math.random();
      if (r < 0.30) return { runs: 0 };
      if (r < 0.50) return { runs: 1 };
      if (r < 0.60) return { runs: 2 };
      if (r < 0.65) return { runs: 3 };
      if (r < 0.83) return { runs: 4, boundary: true };
      if (r < 0.92) return { runs: 6, boundary: true };
      return { runs: 0, wicket: true };
    }

    // ─── State machine ──────────────────────────────────────
    const PHASE = {
      IDLE:'idle', GUARD:'guard', MARK_RUNUP:'mark_runup', RUNUP:'runup',
      DELIVERY:'delivery', INBOUND:'inbound', SWING:'swing', OUTBOUND:'outbound',
      FIELD_CHASE:'field_chase', THROW_RETURN:'throw_return',
      RUNNING:'running', SIGNAL:'signal', RESET:'reset', WALK_BACK:'walk_back'
    };

    let phase       = PHASE.IDLE;
    let phaseStart  = performance.now();
    let phaseData   = {};
    let outcome     = null;
    let customOutcome = null;
    let paused      = false;

    const DUR = {
      idle:1200, guard:2200, mark_runup:2400, runup:1500, delivery:100,
      inbound:2000, swing:500, signal:1400, reset:900, walk_back:2200
    };

    function setPhase(p, data){
      phase = p;
      phaseStart = performance.now();
      phaseData = data || {};
      console.log('[Anim] → ' + p);
    }

    const easeInOut = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2;
    const easeOut   = t => 1 - Math.pow(1-t, 3);
    const lerp = (a, b, t) => a + (b - a) * t;

    const _q = new THREE.Quaternion();
    const AX = new THREE.Vector3(1,0,0);
    const AY = new THREE.Vector3(0,1,0);
    function rot(bone, axis, angle){
      if (!bone) return;
      _q.setFromAxisAngle(axis, angle);
      bone.quaternion.multiply(_q);
    }

    // ═══════════════════════════════════════════════════════════
    //  ROLE BEHAVIORS (head tracking, keeper anticipation)
    // ═══════════════════════════════════════════════════════════
    function roleHeadTrack(group, target, smoothing){
      if (!group || !target) return;
      const dx = target.x - group.position.x;
      const dz = target.z - group.position.z;
      const targetAngle = Math.atan2(dx, dz);
      let diff = targetAngle - group.rotation.y;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      group.rotation.y += diff * (smoothing || 0.08);
    }

    function updateRoles(now, dt){
      // Keeper lateral anticipation
      if (keeper && ball.active){
        const targetX = Math.max(-1.5, Math.min(1.5, ball.pos.x * 0.35));
        keeper.position.x += (targetX - keeper.position.x) * 0.12;
        roleHeadTrack(keeper, ball.pos, 0.10);
      } else if (keeper){
        keeper.position.x += (home['Keeper'].pos.x - keeper.position.x) * 0.05;
      }
      // Umpire head tracks ball
      if (umpBowl && ball.active){
        roleHeadTrack(umpBowl, ball.pos, 0.08);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  FIELDER — chase → pickup → throw back
    // ═══════════════════════════════════════════════════════════
    let chasingFielder = null;
    let fielderState   = 'IDLE';   // IDLE → CHASING → PICKING_UP → THROWING
    let fielderTimer   = 0;

    function pickChaser(shotDirX, shotDirZ){
      let best = null, bestDot = -Infinity;
      fielders.forEach(f => {
        const h = home[f.name] ? home[f.name].pos : f.position;
        const len = Math.hypot(h.x, h.z) || 1;
        const dot = (h.x / len) * shotDirX + (h.z / len) * shotDirZ;
        if (dot > bestDot){ bestDot = dot; best = f; }
      });
      chasingFielder = best || fielders[0];
      fielderState = 'CHASING';
      fielderTimer = 0;
      if (window.StadiumAnim) window.StadiumAnim.activeChaserRole =
        chasingFielder ? (chasingFielder.userData.role || chasingFielder.name) : null;
      if (chasingFielder) console.log('[Anim] Chaser → ' + chasingFielder.userData.role);
    }

    function updateFielder(dt){
      if (!chasingFielder){ fielderState = 'IDLE'; return; }
      const cf = chasingFielder;

      if (fielderState === 'CHASING'){
        const dx = ball.pos.x - cf.position.x;
        const dz = ball.pos.z - cf.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.7){
          const speed = 8.5 * dt;
          cf.position.x += (dx / dist) * Math.min(speed, dist);
          cf.position.z += (dz / dist) * Math.min(speed, dist);
          cf.position.y = fieldY;
          cf.rotation.y = Math.atan2(dx, dz);
        } else {
          fielderState = 'PICKING_UP';
          fielderTimer = 0;
          ball.active = false;
          flightBall.visible = false;
        }
      } else if (fielderState === 'PICKING_UP'){
        fielderTimer += dt;
        if (fielderTimer > 0.6){
          fielderState = 'THROWING';
          fielderTimer = 0;
          // Throw back to keeper
          const targetX = 0, targetZ = 12.6;
          const dx = targetX - cf.position.x;
          const dz = targetZ - cf.position.z;
          const dist = Math.hypot(dx, dz);
          const throwSpeed = 22;
          launchBall(
            cf.position.clone().setY(fieldY + 1.2),
            new THREE.Vector3(dx / dist * throwSpeed, 6, dz / dist * throwSpeed),
            { x: 5, y: 0, z: 0 }
          );
        }
      } else if (fielderState === 'THROWING'){
        fielderTimer += dt;
        if (fielderTimer > 0.5){
          chasingFielder = null;
          fielderState = 'IDLE';
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATIONS
    // ═══════════════════════════════════════════════════════════
    function animateIdle(now){
      striker.position.x = home['Striker'].pos.x + Math.sin(now * 0.0009) * 0.015;
      striker.position.z = home['Striker'].pos.z + Math.cos(now * 0.001)  * 0.015;
      striker.rotation.y = home['Striker'].rotY;

      if (nonStriker){
        nonStriker.position.x = home['Non-Striker'].pos.x + Math.sin(now * 0.0008 + 1) * 0.02;
        nonStriker.position.z = home['Non-Striker'].pos.z + Math.cos(now * 0.0007 + 1) * 0.02;
      }

      fielders.forEach(f => {
        const h = home[f.name] ? home[f.name].pos : f.position;
        f.position.x += (h.x - f.position.x) * 0.05;
        f.position.z += (h.z - f.position.z) * 0.05;
        f.position.y = fieldY;
      });

      if (keeper){
        keeper.position.y = fieldY;
        // Keeper crouch — thigh/shin bend
        if (keeperBones.lThigh) rot(keeperBones.lThigh, AX, -0.35);
        if (keeperBones.rThigh) rot(keeperBones.rThigh, AX, -0.35);
        if (keeperBones.lShin)  rot(keeperBones.lShin,  AX,  0.70);
        if (keeperBones.rShin)  rot(keeperBones.rShin,  AX,  0.70);
      }
    }

    function animateGuard(p){
      const look = Math.sin(p * Math.PI * 2) * 0.18;
      striker.rotation.y = home['Striker'].rotY + look;
      const tap = Math.sin(p * Math.PI * 4) * 0.1;
      strikerBat.rotation.x = batRest.x + tap;
      striker.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 4)) * 0.015;
      if (keeper){
        keeper.position.y = fieldY;
        if (keeperBones.lThigh) rot(keeperBones.lThigh, AX, -0.35);
        if (keeperBones.rThigh) rot(keeperBones.rThigh, AX, -0.35);
      }
    }

    function animateMarkRunup(p){
      if (p < 0.55){
        const q = easeInOut(p / 0.55);
        bowler.position.x = lerp(home['Bowler'].pos.x, 1.2, q);
        bowler.position.z = lerp(home['Bowler'].pos.z, BOWLER_START_Z, q);
      } else {
        const q = (p - 0.55) / 0.45;
        bowler.position.x = 1.2 + Math.sin(q * Math.PI * 6) * 0.04;
        bowler.position.z = BOWLER_START_Z;
      }
      if (umpBowl) umpBowl.rotation.y = Math.sin(p * Math.PI * 2) * 0.15;
    }

    function animateRunup(p){
      const e = easeInOut(p);
      bowler.position.x = lerp(1.2, 0.55, e) + Math.sin(p * Math.PI * 6) * 0.1;
      bowler.position.z = lerp(BOWLER_START_Z, BOWLER_RELEASE_Z, e);
      bowler.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 8)) * 0.1;
      // Bowler arm swing
      if (bowlerBones.rUpperArm){
        rot(bowlerBones.rUpperArm, AX, Math.sin(p * Math.PI * 6) * 0.6);
      }
      if (bowlerBones.lUpperArm){
        rot(bowlerBones.lUpperArm, AX, -Math.sin(p * Math.PI * 6) * 0.6);
      }
    }

    function animateDelivery(p){
      const e = easeOut(p);
      bowler.position.z = BOWLER_RELEASE_Z + 0.6 * e;
      bowler.position.y = fieldY;
      bowler.rotation.x = 0.15 - 0.5 * e;
      if (bowlerBones.rUpperArm){
        rot(bowlerBones.rUpperArm, AX, lerp(-0.4, 2.2, e));
      }
    }

    function animateSwing(p){
      // Bat local rotation
      if (p < 0.25){
        const q = p / 0.25;
        strikerBat.rotation.x = batRest.x + lerp(0, -0.9, easeInOut(q));
        strikerBat.rotation.z = batRest.z + lerp(0,  0.7, easeInOut(q));
      } else if (p < 0.55){
        const q = (p - 0.25) / 0.30;
        strikerBat.rotation.x = batRest.x + lerp(-0.9, 0.8, easeOut(q));
        strikerBat.rotation.z = batRest.z + lerp( 0.7, -0.6, easeOut(q));
      } else {
        const q = (p - 0.55) / 0.45;
        strikerBat.rotation.x = batRest.x + lerp(0.8, 1.2, easeInOut(q));
        strikerBat.rotation.z = batRest.z + lerp(-0.6, -1.0, easeInOut(q));
      }

      let bodyAngle = 0;
      if (currentShot) bodyAngle = currentShot.angle * 0.6;
      striker.rotation.y = home['Striker'].rotY + lerp(0, bodyAngle, easeOut(p));

      let armAngle = 0;
      if (p < 0.25)      armAngle = lerp(0, 0.7, p / 0.25);
      else if (p < 0.55) armAngle = lerp(0.7, -1.1, (p - 0.25) / 0.30);
      else               armAngle = lerp(-1.1, -1.5, (p - 0.55) / 0.45);
      if (strikerBones.rUpperArm) rot(strikerBones.rUpperArm, AX, armAngle);
      if (strikerBones.lUpperArm) rot(strikerBones.lUpperArm, AX, armAngle * 0.6);
    }

    function animateRunning(totalRuns, progress){
      const lap = Math.min(progress, totalRuns);
      const currentLap = Math.floor(lap);
      const frac = lap - currentLap;
      const goingForward = currentLap % 2 === 0;

      const sZ = goingForward ? lerp(STRIKER_Z, NON_STRIKER_Z, frac) : lerp(NON_STRIKER_Z, STRIKER_Z, frac);
      const nZ = goingForward ? lerp(NON_STRIKER_Z, STRIKER_Z, frac) : lerp(STRIKER_Z, NON_STRIKER_Z, frac);

      striker.position.x = 0.6;
      striker.position.z = sZ;
      nonStriker.position.x = -0.6;
      nonStriker.position.z = nZ;

      const cyc = progress * Math.PI * 4;
      const bob = Math.abs(Math.sin(cyc)) * 0.10;
      striker.position.y    = fieldY + bob;
      nonStriker.position.y = fieldY + bob;

      striker.rotation.x    = 0.25;
      nonStriker.rotation.x = 0.25;
      striker.rotation.y    = goingForward ? 0 : Math.PI;
      nonStriker.rotation.y = goingForward ? Math.PI : 0;

      // Legs run
      const SBones = PC.players['Striker'].bones;
      const NBones = PC.players['Non-Striker'].bones;
      rot(SBones.lThigh, AX,  Math.sin(cyc) * 0.9);
      rot(SBones.rThigh, AX, -Math.sin(cyc) * 0.9);
      rot(NBones.lThigh, AX,  Math.sin(cyc) * 0.9);
      rot(NBones.rThigh, AX, -Math.sin(cyc) * 0.9);
    }

    function settleAfterRuns(totalRuns){
      const swapped = totalRuns % 2 === 1;
      if (swapped){
        striker.position.set(0.4, fieldY, NON_STRIKER_Z);
        striker.rotation.y = Math.PI;
        nonStriker.position.set(-0.4, fieldY, STRIKER_Z);
        nonStriker.rotation.y = 0;
      } else {
        striker.position.set(0.4, fieldY, STRIKER_Z);
        striker.rotation.y = Math.PI;
        nonStriker.position.set(-0.4, fieldY, NON_STRIKER_Z);
        nonStriker.rotation.y = 0;
      }
      striker.rotation.x = 0;
      nonStriker.rotation.x = 0;
    }

    function animateSignal(p, type){
      if (!umpBowl) return;
      if (type === 'four')      umpBowl.rotation.y = lerp(0, -0.9, easeInOut(p));
      else if (type === 'six')  umpBowl.rotation.x = lerp(0, -0.35, easeInOut(p));
      else                       umpBowl.rotation.x = lerp(0,  0.25, easeInOut(p));
    }

    function resetAll(t){
      const e = easeInOut(t);
      Object.keys(players).forEach(role => {
        const p = players[role], h = home[role];
        if (!h) return;
        p.position.lerp(h.pos, e * 0.08);
        p.rotation.x = lerp(p.rotation.x, h.rotX, e * 0.08);
        p.rotation.y = lerp(p.rotation.y, h.rotY, e * 0.08);
      });
      if (strikerBat){
        strikerBat.rotation.x = lerp(strikerBat.rotation.x, batRest.x, e * 0.1);
        strikerBat.rotation.z = lerp(strikerBat.rotation.z, batRest.z, e * 0.1);
      }
    }

    function animateWalkBack(p){
      const e = easeInOut(p);
      bowler.position.x = lerp(0.55, 1.2, e);
      bowler.position.z = lerp(BOWLER_RELEASE_Z, BOWLER_START_Z, e);
      bowler.position.y = fieldY;
      bowler.rotation.x = 0.05;
    }

    // ═══════════════════════════════════════════════════════════
    //  MATCH STATE UPDATES (after each ball completes)
    // ═══════════════════════════════════════════════════════════
    function updateMatchState(runs, isWicket){
      MatchState.lastBallRuns = runs;

      // Balls / overs
      MatchState.balls++;
      MatchState.ballInOver++;
      MatchState.striker.balls++;
      MatchState.bowler.balls++;
      if (MatchState.ballInOver >= 6){
        MatchState.ballInOver = 0;
        MatchState.over++;
        MatchState.overHistory.push(MatchState.runs);
      }

      // Runs
      MatchState.runs += runs;
      MatchState.striker.runs += runs;
      MatchState.bowler.runs += runs;

      if (isWicket){
        MatchState.wickets++;
        MatchState.bowler.wickets++;
        MatchState.lastOutcome = 'W';
      } else if (runs === 4){
        MatchState.lastOutcome = '4';
      } else if (runs === 6){
        MatchState.lastOutcome = '6';
      } else if (runs === 0){
        MatchState.lastOutcome = '•';
      } else {
        MatchState.lastOutcome = String(runs);
      }

      // Batsmen swap ends on odd runs
      if (runs % 2 === 1){
        const tmp = MatchState.striker.onStrike;
        MatchState.striker.onStrike = MatchState.nonStriker.onStrike;
        MatchState.nonStriker.onStrike = tmp;
      }

      // Scoreboard toast
      if (window.showToast){
        window.showToast(
          'Score: ' + MatchState.runs + '/' + MatchState.wickets +
          ' · ' + MatchState.over + '.' + MatchState.ballInOver + ' ov'
        );
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  UI Banner / shake
    // ═══════════════════════════════════════════════════════════
    let bannerEl = document.getElementById('cm-banner');
    function showBanner(text, color){
      if (!bannerEl) return;
      bannerEl.textContent = text;
      bannerEl.style.color = color;
      bannerEl.style.textShadow = '0 0 60px ' + color + ', 0 8px 24px rgba(0,0,0,.95)';
      bannerEl.style.transform = 'translate(-50%, 0) scale(1)';
      bannerEl.style.opacity = '1';
      clearTimeout(bannerEl._hideT);
      bannerEl._hideT = setTimeout(() => {
        bannerEl.style.opacity = '0';
        bannerEl.style.transform = 'translate(-50%, -30px) scale(0.9)';
      }, 2200);
    }

    let flashEl = document.getElementById('cm-flash');
    function flash(color, duration){
      if (!flashEl) return;
      flashEl.style.background = color;
      flashEl.style.opacity = '0.45';
      setTimeout(() => { flashEl.style.opacity = '0'; }, duration || 300);
    }

    let shakeUntil = 0, shakeAmp = 0;
    function cameraShake(amp, duration){
      shakeUntil = performance.now() + duration;
      shakeAmp = amp;
    }
    function applyShake(now){
      if (now > shakeUntil){ shakeAmp = 0; return; }
      const decay = (shakeUntil - now) / 1000;
      const a = shakeAmp * decay;
      SV.camera.position.x += (Math.random() - 0.5) * a;
      SV.camera.position.y += (Math.random() - 0.5) * a;
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN LOOP
    // ═══════════════════════════════════════════════════════════
    let lastFrameTime = performance.now();
    let roleTickAccum = 0;

    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      applyShake(now);
      if (paused) return;

      // Role behaviors every frame
      updateRoles(now, dt);

      const elapsed = now - phaseStart;

      if (ball.active){
        updateBall(dt);
        if (trail.visible) trailPush(ball.pos);
      }
      if (chasingFielder) updateFielder(dt);

      switch(phase){
        case PHASE.IDLE:
          animateIdle(now);
          if (elapsed > DUR.idle) setPhase(PHASE.GUARD);
          break;
        case PHASE.GUARD: {
          const p = Math.min(1, elapsed / DUR.guard);
          animateGuard(p);
          if (p >= 1) setPhase(PHASE.MARK_RUNUP);
          break;
        }
        case PHASE.MARK_RUNUP: {
          const p = Math.min(1, elapsed / DUR.mark_runup);
          animateMarkRunup(p);
          if (p >= 1) setPhase(PHASE.RUNUP);
          break;
        }
        case PHASE.RUNUP: {
          const p = Math.min(1, elapsed / DUR.runup);
          animateRunup(p);
          if (p >= 1) setPhase(PHASE.DELIVERY);
          break;
        }
        case PHASE.DELIVERY: {
          const p = Math.min(1, elapsed / DUR.delivery);
          animateDelivery(p);
          if (p >= 1){ launchDelivery(); setPhase(PHASE.INBOUND); }
          break;
        }
        case PHASE.INBOUND: {
          const past = ball.pos.z > striker.position.z + 0.5;
          if (checkBatContact() || past || elapsed > DUR.inbound){
            ball.active = false;
            flightBall.visible = false;
            setPhase(PHASE.SWING);
          }
          break;
        }
        case PHASE.SWING: {
          const p = Math.min(1, elapsed / DUR.swing);
          animateSwing(p);
          if (p >= 0.55 && !outcome){
            outcome = customOutcome || rollOutcome();
            customOutcome = null;
          }
          if (p >= 1){ launchHit(outcome); setPhase(PHASE.OUTBOUND); }
          break;
        }
        case PHASE.OUTBOUND: {
          if (!phaseData._banner){
            phaseData._banner = true;
            if (outcome.wicket){
              showBanner('OUT!', '#ef4444');
              flash('#7f1d1d', 400);
              cameraShake(1.5, 500);
            } else if (outcome.runs === 6){
              showBanner('SIX!', '#ff6d00');
              flash('#ff6d00', 350);
              cameraShake(2.0, 600);
            } else if (outcome.runs === 4){
              showBanner('FOUR!', '#22d3ee');
              flash('#22d3ee', 300);
              cameraShake(1.2, 400);
            } else if (outcome.runs > 0){
              showBanner(outcome.runs + ' RUN' + (outcome.runs > 1 ? 'S' : ''), '#00e676');
            }
          }

          // Pick chaser based on shot direction
          if (currentShot && !phaseData._chaserPicked && outcome.runs > 0 && outcome.runs < 4){
            phaseData._chaserPicked = true;
            pickChaser(Math.sin(currentShot.angle), -Math.cos(currentShot.angle));
          }

          const stopped  = !ball.active;
          const crossed  = Math.hypot(ball.pos.x, ball.pos.z) > BOUNDARY_R;
          const flew     = outcome.runs === 6 && elapsed > 3500;

          if (stopped || crossed || flew){
            trailStop();
            // Update scoreboard once per ball
            if (!phaseData._scored){
              phaseData._scored = true;
              updateMatchState(outcome.runs, !!outcome.wicket);
            }
            if (outcome.runs > 0 && outcome.runs < 4 && !outcome.wicket)
              setPhase(PHASE.RUNNING, { runs: outcome.runs });
            else
              setPhase(PHASE.SIGNAL);
          }
          break;
        }
        case PHASE.RUNNING: {
          const runs = phaseData.runs;
          const dur  = runs * 1200;
          const p    = Math.min(1, elapsed / dur);
          animateRunning(runs, p * runs);
          if (p >= 1){
            settleAfterRuns(runs);
            setPhase(PHASE.SIGNAL);
          }
          break;
        }
        case PHASE.SIGNAL: {
          const p = Math.min(1, elapsed / DUR.signal);
          let t = 'out';
          if (outcome.runs === 4) t = 'four';
          else if (outcome.runs === 6) t = 'six';
          animateSignal(p, t);
          if (p >= 1) setPhase(PHASE.RESET);
          break;
        }
        case PHASE.RESET: {
          const p = Math.min(1, elapsed / DUR.reset);
          resetAll(p);
          if (p >= 1){
            ball.active = false;
            flightBall.visible = false;
            trailStop();
            currentShot = null;
            chasingFielder = null;
            fielderState = 'IDLE';
            setPhase(PHASE.WALK_BACK);
          }
          break;
        }
        case PHASE.WALK_BACK: {
          const p = Math.min(1, elapsed / DUR.walk_back);
          animateWalkBack(p);
          if (p >= 1){
            outcome = null;
            setPhase(PHASE.IDLE);
          }
          break;
        }
      }
    }

    console.log('[Anim] ✅ Complex Match Engine v8.0 ready');
    console.log('[Anim] MatchState exposed at window.MatchState');
    requestAnimationFrame(tick);

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════════
    window.StadiumAnim = {
      ball: ball,
      activeChaserRole: null,
      deliver: function(runs, wicket){
        if (phase !== PHASE.IDLE && phase !== PHASE.WALK_BACK &&
            phase !== PHASE.GUARD && phase !== PHASE.MARK_RUNUP){
          return false;
        }
        if (runs !== undefined){
          customOutcome = {
            runs: runs || 0,
            wicket: !!wicket,
            boundary: (runs === 4 || runs === 6)
          };
        }
        setPhase(PHASE.RUNUP);
        return true;
      },
      setNextOutcome: function(runs, wicket){
        customOutcome = {
          runs: runs || 0,
          wicket: !!wicket,
          boundary: (runs === 4 || runs === 6)
        };
      },
      currentPhase: function(){ return phase; },
      pause:  function(){ paused = true;  },
      resume: function(){ paused = false; },
      forceIdle: function(){
        ball.active = false;
        flightBall.visible = false;
        trailStop();
        outcome = null;
        currentShot = null;
        chasingFielder = null;
        setPhase(PHASE.IDLE);
      },
      resetMatch: function(){
        MatchState.reset();
        console.log('[Anim] Match reset');
      }
    };
  }

  const wait = setInterval(function(){
    if (window.StadiumView &&
        window.StadiumView.players &&
        window.StadiumView.players['Bowler'] &&
        window.PlayerControl &&
        window.PlayerControl.players['Bowler']){
      clearInterval(wait);
      setTimeout(boot, 500);
    }
  }, 200);

})();
