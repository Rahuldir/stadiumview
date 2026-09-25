/* ══════════════════════════════════════════════════════════════
   StadiumView — Advanced cricket animation engine
   • Batsman takes guard (looks around, taps bat twice)
   • Bowler marks run-up (walks to mark, sets feet)
   • Realistic run-up with arm swing
   • Ball physics: gravity, bounce, spin, air drag
   • Bat-ball contact detection
   • Ball trail on 4s (cyan) and 6s (orange)
   • 6 flies out of ground, 4 rolls/bounces to boundary
   • 1/2/3 with running between wickets
   • Umpire signals, wicket celebration
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ─── Physical constants ──────────────────────────────────────
  const GRAVITY       = 9.81;
  const BALL_RADIUS   = 0.036;
  const BOUNDARY_R    = 38;
  const BOUNCE_DAMP   = 0.42;
  const AIR_DRAG      = 0.015;
  const GROUND_FRIC   = 2.4;

  // ─── Field reference (must match stadium.js) ────────────────
  const STRIKER_Z        =  8.6;
  const NON_STRIKER_Z    = -8.6;
  const BOWLER_START_Z   = -24;
  const BOWLER_RELEASE_Z = -11;

  function boot(){
    const SV = window.StadiumView;
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

    if (!bowler || !striker || !strikerBat || !bowlerBall){
      console.warn('[Anim] Missing refs — disabled');
      return;
    }

    const FIELDER_ROLES = [
      'Third Man','Point','Cover','Mid-Off','Mid-On',
      'Mid-Wicket','Square Leg','Fine Leg','Slip'
    ];
    const fielders = FIELDER_ROLES.map(function(r){ return players[r]; }).filter(Boolean);

    // ─── Save home state ─────────────────────────────────────
    const home = {};
    Object.keys(players).forEach(function(role){
      home[role] = {
        pos: players[role].position.clone(),
        rotY: players[role].rotation.y,
        rotX: players[role].rotation.x
      };
    });

    const batRest = {
      x: strikerBat.rotation.x,
      y: strikerBat.rotation.y,
      z: strikerBat.rotation.z
    };

    // ═══════════════════════════════════════════════════════════
    //  FLIGHT BALL (world-space, cloned from bowler's ball)
    // ═══════════════════════════════════════════════════════════
    const flightBall = bowlerBall.clone(true);
    flightBall.traverse(function(c){
      if (c.isMesh && c.material){
        c.material = c.material.clone();
        if (c.material.emissive) c.material.emissiveIntensity = 0.15;
        c.material.needsUpdate = true;
      }
    });
    flightBall.visible = false;
    scene.add(flightBall);
    if (bowlerBall) bowlerBall.visible = false;

    // ─── Trail effect ────────────────────────────────────────
    const trailMaxPoints = 60;
    const trailPositions = new Float32Array(trailMaxPoints * 3);
    const trailGeometry  = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeometry.setDrawRange(0, 0);

    const trailMaterial = new THREE.LineBasicMaterial({
      color: 0x22d3ee, transparent: true, opacity: 0.85, linewidth: 2
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

    // ═══════════════════════════════════════════════════════════
    //  BALL PHYSICS
    // ═══════════════════════════════════════════════════════════
    const ball = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      active: false,
      rolling: false,
      bounces: 0,
      spinning: new THREE.Vector3(0, 0, 0)
    };

    function launchBall(pos, vel, spin){
      ball.pos.copy(pos);
      ball.vel.copy(vel);
      ball.spinning.set(spin ? spin.x : 0, spin ? spin.y : 0, spin ? spin.z : 0);
      ball.active = true;
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
        ball.vel.x *= r;
        ball.vel.z *= r;
        ball.pos.x += ball.vel.x * dt;
        ball.pos.z += ball.vel.z * dt;
        ball.pos.y = fieldY + BALL_RADIUS;
        flightBall.rotation.x += newSpeed * dt * 6;
        flightBall.rotation.z -= ball.vel.x * dt * 6;
      } else {
        ball.vel.y -= GRAVITY * dt;

        // Magnus effect (spin curve)
        const k = 0.00015;
        ball.vel.x += k * (ball.spinning.y * ball.vel.z - ball.spinning.z * ball.vel.y) * dt;
        ball.vel.z += k * (ball.spinning.x * ball.vel.y - ball.spinning.y * ball.vel.x) * dt;

        // Air drag
        const drag = 1 - AIR_DRAG * dt;
        ball.vel.x *= drag;
        ball.vel.z *= drag;

        ball.pos.x += ball.vel.x * dt;
        ball.pos.y += ball.vel.y * dt;
        ball.pos.z += ball.vel.z * dt;

        // Ground bounce
        const groundY = fieldY + BALL_RADIUS;
        if (ball.pos.y < groundY){
          ball.pos.y = groundY;
          if (Math.abs(ball.vel.y) > 1.2){
            ball.vel.y = -ball.vel.y * BOUNCE_DAMP;
            ball.vel.x *= 0.78;
            ball.vel.z *= 0.78;
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

    // ═══════════════════════════════════════════════════════════
    //  DELIVERY LAUNCH
    // ═══════════════════════════════════════════════════════════
    function launchDelivery(){
      const lengths = ['short', 'good', 'full'];
      const choice  = lengths[Math.floor(Math.random() * 3)];
      let pitchZ;
      if (choice === 'short')      pitchZ = 4.5;
      else if (choice === 'good')  pitchZ = 6.5;
      else                          pitchZ = 8.0;

      const releaseY   = fieldY + 2.0;
      const releasePos = new THREE.Vector3(0.55, releaseY, BOWLER_RELEASE_Z);

      const t = 0.5;
      const vx = (0.3 - releasePos.x) / t;
      const vz = (pitchZ - releasePos.z) / t;
      const vy = (fieldY + 0.05 - releaseY + 0.5 * GRAVITY * t * t) / t;

      launchBall(releasePos, new THREE.Vector3(vx, vy, vz), { x: 20, y: 0, z: 0 });
    }

    // ═══════════════════════════════════════════════════════════
    //  HIT LAUNCH
    // ═══════════════════════════════════════════════════════════
    function launchHit(outcome){
      const contactPos = new THREE.Vector3(
        striker.position.x, fieldY + 0.7, striker.position.z
      );

      // Wicket — ball goes into stumps
      if (outcome.wicket){
        launchBall(contactPos, new THREE.Vector3(0, 0.5, 10), { x: 0, y: 0, z: 0 });
        return;
      }

      // Dot ball
      if (outcome.runs === 0){
        launchBall(contactPos, new THREE.Vector3(
          (Math.random() - 0.5) * 2, 1.5, -1
        ), { x: 5, y: 0, z: 0 });
        return;
      }

      // SIX — high arc, flies out of ground
      if (outcome.runs === 6){
        const angle = Math.random() * Math.PI * 2;
        const dist  = 55;
        const peak  = 20 + Math.random() * 10;
        const vy    = Math.sqrt(2 * GRAVITY * peak);
        const totalTime = vy / GRAVITY * 2;
        const speed = dist / totalTime;
        launchBall(contactPos, new THREE.Vector3(
          Math.cos(angle) * speed,
          vy,
          Math.sin(angle) * speed
        ), { x: 30, y: 0, z: 0 });
        trailStart(0xff6d00);
        return;
      }

      // FOUR — grounded or one bounce to the rope
      if (outcome.runs === 4){
        const angle    = Math.random() * Math.PI * 2;
        const grounded = Math.random() < 0.5;
        let vy, speed;
        if (grounded){ vy = 2.2; speed = 26; }
        else         { vy = 8.0; speed = 22; }
        launchBall(contactPos, new THREE.Vector3(
          Math.cos(angle) * speed,
          vy,
          Math.sin(angle) * speed
        ), { x: 18, y: 0, z: 0 });
        trailStart(0x22d3ee);
        return;
      }

      // 1 / 2 / 3 — hit to a fielder in the ring
      const angle = Math.random() * Math.PI * 2;
      const dist  = 12 + outcome.runs * 6;
      const peak  = 2 + outcome.runs * 0.5;
      const vy    = Math.sqrt(2 * GRAVITY * peak);
      const totalTime = vy / GRAVITY * 2 + 0.4;
      launchBall(contactPos, new THREE.Vector3(
        Math.cos(angle) * dist / totalTime,
        vy,
        Math.sin(angle) * dist / totalTime
      ), { x: 10, y: 0, z: 0 });
    }

    // ═══════════════════════════════════════════════════════════
    //  BAT-BALL CONTACT DETECTION
    // ═══════════════════════════════════════════════════════════
    const batWorldPos = new THREE.Vector3();
    function checkBatContact(){
      if (!strikerBat) return false;
      strikerBat.getWorldPosition(batWorldPos);
      const dx = ball.pos.x - batWorldPos.x;
      const dy = ball.pos.y - batWorldPos.y;
      const dz = ball.pos.z - batWorldPos.z;
      return Math.sqrt(dx*dx + dy*dy + dz*dz) < 0.5;
    }

    // ═══════════════════════════════════════════════════════════
    //  OUTCOME RANDOMIZER
    // ═══════════════════════════════════════════════════════════
    function rollOutcome(){
      const r = Math.random();
      if (r < 0.32) return { runs: 0 };
      if (r < 0.52) return { runs: 1 };
      if (r < 0.62) return { runs: 2 };
      if (r < 0.67) return { runs: 3 };
      if (r < 0.85) return { runs: 4, boundary: true };
      if (r < 0.93) return { runs: 6, boundary: true };
      return { runs: 0, wicket: true };
    }

    // ═══════════════════════════════════════════════════════════
    //  STATE MACHINE
    // ═══════════════════════════════════════════════════════════
    const PHASE = {
      IDLE:       'idle',
      GUARD:      'guard',
      MARK_RUNUP: 'mark_runup',
      RUNUP:      'runup',
      DELIVERY:   'delivery',
      INBOUND:    'inbound',
      SWING:      'swing',
      OUTBOUND:   'outbound',
      RUNNING:    'running',
      SIGNAL:     'signal',
      RESET:      'reset',
      WALK_BACK:  'walk_back'
    };

    let phase      = PHASE.IDLE;
    let phaseStart = performance.now();
    let phaseData  = {};
    let outcome    = null;
    let customOutcome = null;
    let ballCount  = 0;
    let paused     = false;

    const DURATIONS = {
      idle:       1200,
      guard:      2200,
      mark_runup: 2400,
      runup:      1500,
      delivery:   100,
      inbound:    2000,
      swing:      500,
      signal:     1400,
      reset:      900,
      walk_back:  2200
    };

    function setPhase(p, data){
      phase = p;
      phaseStart = performance.now();
      phaseData = data || {};
      console.log('[Anim] → ' + p);
    }

    // ─── Easing ─────────────────────────────────────────────
    function easeInOut(t){ return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2; }
    function easeOut(t){ return 1 - Math.pow(1-t, 3); }
    function lerp(a, b, t){ return a + (b - a) * t; }

    // ═══════════════════════════════════════════════════════════
    //  IDLE
    // ═══════════════════════════════════════════════════════════
    function animateIdle(now){
      striker.position.x = home['Striker'].pos.x + Math.sin(now * 0.0009) * 0.015;
      striker.position.z = home['Striker'].pos.z + Math.cos(now * 0.001)  * 0.015;
      striker.rotation.y = home['Striker'].rotY;

      if (nonStriker){
        nonStriker.position.x = home['Non-Striker'].pos.x + Math.sin(now * 0.0008 + 1) * 0.02;
        nonStriker.position.z = home['Non-Striker'].pos.z + Math.cos(now * 0.0007 + 1) * 0.02;
      }

      // Fielders return to home (no drift)
      fielders.forEach(function(f){
        const h = home[f.name] ? home[f.name].pos : f.position;
        f.position.x += (h.x - f.position.x) * 0.05;
        f.position.z += (h.z - f.position.z) * 0.05;
        f.position.y = fieldY;
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  BATSMAN TAKES GUARD
    // ═══════════════════════════════════════════════════════════
    function animateGuard(p){
      // Look around at fielders
      const look = Math.sin(p * Math.PI * 2) * 0.18;
      striker.rotation.y = home['Striker'].rotY + look;

      // Two bat taps on the pitch
      const tap1 = (p > 0.30 && p < 0.45)
        ? Math.max(0, Math.sin((p - 0.30) * Math.PI / 0.15)) : 0;
      const tap2 = (p > 0.55 && p < 0.70)
        ? Math.max(0, Math.sin((p - 0.55) * Math.PI / 0.15)) : 0;
      const tap = (tap1 + tap2) * 0.22;

      strikerBat.rotation.x = batRest.x + tap;
      strikerBat.rotation.z = batRest.z - tap * 0.4;

      striker.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 4)) * 0.015;

      if (nonStriker){
        nonStriker.position.y = fieldY + Math.sin(p * Math.PI * 3) * 0.01;
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  BOWLER MARKS RUN-UP
    // ═══════════════════════════════════════════════════════════
    function animateMarkRunup(p){
      if (p < 0.55){
        // Walk from home toward the top of the run-up
        const q = easeInOut(p / 0.55);
        bowler.position.x = lerp(home['Bowler'].pos.x, 1.2, q);
        bowler.position.z = lerp(home['Bowler'].pos.z, BOWLER_START_Z, q);
        bowler.position.y = fieldY;
        bowler.rotation.x = 0.05;
        bowler.rotation.y = lerp(home['Bowler'].rotY, Math.PI * 0.05, q);
      } else {
        // Standing at the mark, tapping feet
        const q = (p - 0.55) / 0.45;
        const footTap = Math.sin(q * Math.PI * 6) * 0.04;
        bowler.position.x = 1.2 + footTap;
        bowler.position.z = BOWLER_START_Z;
        bowler.position.y = fieldY + Math.abs(footTap) * 0.3;
        bowler.rotation.x = 0.05;

        if (umpBowl){
          umpBowl.rotation.y = Math.sin(q * Math.PI * 2) * 0.15;
        }
      }

      // Keeper starts crouching
      if (keeper){
        const q = Math.min(1, Math.max(0, (p - 0.55) / 0.45));
        keeper.rotation.x = 0.10 + q * 0.15;
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  BOWLER RUN-UP
    // ═══════════════════════════════════════════════════════════
    function animateRunup(p){
      const e = easeInOut(p);
      bowler.position.x = lerp(1.2, 0.55, e) + Math.sin(p * Math.PI * 6) * 0.1;
      bowler.position.z = lerp(BOWLER_START_Z, BOWLER_RELEASE_Z, e);
      bowler.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 8)) * 0.1;
      bowler.rotation.x = 0.15 * e;

      // Arm swing — try to find arm subgroups and rotate them
      const armSwing = Math.sin(p * Math.PI * 6) * 0.7;
      bowler.children.forEach(function(child){
        if (child.isGroup){
          child.children.forEach(function(sub){
            if (sub.isGroup && sub.position.y > 0.9){
              sub.children.forEach(function(torsoChild){
                if (torsoChild.isGroup && Math.abs(torsoChild.position.x) > 0.2){
                  torsoChild.rotation.x = (torsoChild.position.x > 0) ? -armSwing : armSwing;
                }
              });
            }
          });
        }
      });

      // Keeper crouch
      if (keeper && p > 0.4){
        keeper.rotation.x = 0.25 * ((p - 0.4) / 0.6);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  BOWLER DELIVERY
    // ═══════════════════════════════════════════════════════════
    function animateDelivery(p){
      const e = easeOut(p);
      bowler.position.z = BOWLER_RELEASE_Z + 0.6 * e;
      bowler.position.y = fieldY;
      bowler.rotation.x = 0.15 - 0.5 * e;
    }

    // ═══════════════════════════════════════════════════════════
    //  BATSMAN SWING
    // ═══════════════════════════════════════════════════════════
    const BAT_BACKLIFT = { x: batRest.x - 0.7, z: batRest.z + 1.0 };
    const BAT_CONTACT  = { x: batRest.x + 0.6, z: batRest.z - 1.4 };
    const BAT_FOLLOW   = { x: batRest.x + 1.0, z: batRest.z - 1.8 };

    function animateSwing(p){
      if (p < 0.22){
        const q = p / 0.22;
        strikerBat.rotation.x = lerp(batRest.x, BAT_BACKLIFT.x, easeInOut(q));
        strikerBat.rotation.z = lerp(batRest.z, BAT_BACKLIFT.z, easeInOut(q));
      } else if (p < 0.52){
        const q = (p - 0.22) / 0.30;
        strikerBat.rotation.x = lerp(BAT_BACKLIFT.x, BAT_CONTACT.x, easeOut(q));
        strikerBat.rotation.z = lerp(BAT_BACKLIFT.z, BAT_CONTACT.z, easeOut(q));
        striker.rotation.x = lerp(0, 0.2, q);
      } else {
        const q = (p - 0.52) / 0.48;
        strikerBat.rotation.x = lerp(BAT_CONTACT.x, BAT_FOLLOW.x, easeInOut(q));
        strikerBat.rotation.z = lerp(BAT_CONTACT.z, BAT_FOLLOW.z, easeInOut(q));
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  RUNNING BETWEEN WICKETS
    // ═══════════════════════════════════════════════════════════
    function animateRunning(totalRuns, progress){
      const lap = Math.min(progress, totalRuns);
      const currentLap = Math.floor(lap);
      const frac = lap - currentLap;
      const goingForward = currentLap % 2 === 0;

      const sZ = goingForward
        ? lerp(STRIKER_Z, NON_STRIKER_Z, frac)
        : lerp(NON_STRIKER_Z, STRIKER_Z, frac);
      const nZ = goingForward
        ? lerp(NON_STRIKER_Z, STRIKER_Z, frac)
        : lerp(STRIKER_Z, NON_STRIKER_Z, frac);

      striker.position.x = 0.6;
      striker.position.z = sZ;
      nonStriker.position.x = -0.6;
      nonStriker.position.z = nZ;

      const cycle = Math.sin(progress * Math.PI * 8);
      striker.position.y    = fieldY + Math.abs(cycle) * 0.1;
      nonStriker.position.y = fieldY + Math.abs(cycle) * 0.1;

      striker.rotation.x = 0.15;
      nonStriker.rotation.x = 0.15;
      strikerBat.rotation.x = batRest.x + 0.35;

      striker.rotation.y    = goingForward ? 0 : Math.PI;
      nonStriker.rotation.y = goingForward ? Math.PI : 0;
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
      strikerBat.rotation.x = batRest.x;
    }

    // ═══════════════════════════════════════════════════════════
    //  UMPIRE SIGNAL
    // ═══════════════════════════════════════════════════════════
    function animateSignal(p, type){
      if (!umpBowl) return;
      const up   = Math.min(1, p * 4);
      const down = Math.max(0, 1 - (p - 0.65) / 0.35);
      const a    = Math.min(up, down);

      if (type === 'four'){
        umpBowl.rotation.y = lerp(0, -0.9, easeInOut(a));
      } else if (type === 'six'){
        umpBowl.rotation.x = lerp(0, -0.35, easeInOut(a));
      } else {
        umpBowl.rotation.x = lerp(0, 0.25, easeInOut(a));
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  FIELDER CHASE
    // ═══════════════════════════════════════════════════════════
    let chasingFielder = null;

    function pickChaser(hitX, hitZ){
      let closest = fielders[0], minD = 9999;
      fielders.forEach(function(f){
        const h = home[f.name] ? home[f.name].pos : f.position;
        const d = Math.hypot(h.x - hitX, h.z - hitZ);
        if (d < minD){ minD = d; closest = f; }
      });
      chasingFielder = closest;
    }

    function updateChaser(dt){
      if (!chasingFielder) return;
      const cf = chasingFielder;
      const dx = ball.pos.x - cf.position.x;
      const dz = ball.pos.z - cf.position.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 0.5){
        const speed = 6 * dt;
        cf.position.x += (dx / dist) * Math.min(speed, dist);
        cf.position.z += (dz / dist) * Math.min(speed, dist);
        cf.position.y = fieldY + Math.abs(Math.sin(performance.now() * 0.02)) * 0.12;
        cf.rotation.x = 0.15;
      } else {
        cf.position.y = fieldY;
        cf.rotation.x = 0;
        chasingFielder = null;
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  RESET ALL
    // ═══════════════════════════════════════════════════════════
    function resetAll(t){
      const e = easeInOut(t);
      Object.keys(players).forEach(function(role){
        const p = players[role];
        const h = home[role];
        p.position.lerp(h.pos, e * 0.08);
        p.rotation.x = lerp(p.rotation.x, h.rotX, e * 0.08);
        p.rotation.y = lerp(p.rotation.y, h.rotY, e * 0.08);
      });
      if (strikerBat){
        strikerBat.rotation.x = lerp(strikerBat.rotation.x, batRest.x, e * 0.1);
        strikerBat.rotation.z = lerp(strikerBat.rotation.z, batRest.z, e * 0.1);
      }
      if (keeper) keeper.rotation.x = lerp(keeper.rotation.x, 0, e * 0.1);
    }

    // ═══════════════════════════════════════════════════════════
    //  BOWLER WALK BACK
    // ═══════════════════════════════════════════════════════════
    function animateWalkBack(p){
      const e = easeInOut(p);
      bowler.position.x = lerp(0.55, 1.2, e);
      bowler.position.z = lerp(BOWLER_RELEASE_Z, BOWLER_START_Z, e);
      bowler.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 6)) * 0.05;
      bowler.rotation.x = 0.05;
      bowler.rotation.y = lerp(0, Math.PI * 0.15, e);
    }

    // ═══════════════════════════════════════════════════════════
    //  UI — banner + flash + shake
    // ═══════════════════════════════════════════════════════════
    let bannerEl = document.getElementById('cm-banner');
    if (!bannerEl){
      bannerEl = document.createElement('div');
      bannerEl.id = 'cm-banner';
      bannerEl.style.cssText =
        'position:fixed;top:16%;left:50%;transform:translate(-50%,-30px);z-index:99999;' +
        'font-family:"Titillium Web",Arial,sans-serif;font-weight:900;font-style:italic;' +
        'font-size:clamp(48px,10vw,110px);letter-spacing:6px;text-transform:uppercase;' +
        'opacity:0;transition:opacity .3s ease, transform .5s cubic-bezier(.34,1.56,.64,1);' +
        'pointer-events:none;text-align:center;';
      document.body.appendChild(bannerEl);
    }
    function showBanner(text, color){
      bannerEl.textContent = text;
      bannerEl.style.color = color;
      bannerEl.style.textShadow = '0 0 60px ' + color + ', 0 8px 24px rgba(0,0,0,.95)';
      bannerEl.style.transform = 'translate(-50%, 0) scale(1)';
      bannerEl.style.opacity = '1';
      clearTimeout(bannerEl._hideT);
      bannerEl._hideT = setTimeout(function(){
        bannerEl.style.opacity = '0';
        bannerEl.style.transform = 'translate(-50%, -30px) scale(0.9)';
      }, 2200);
    }

    let flashEl = document.getElementById('cm-flash');
    if (!flashEl){
      flashEl = document.createElement('div');
      flashEl.id = 'cm-flash';
      flashEl.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:99998;opacity:0;' +
        'transition:opacity .12s ease-out;mix-blend-mode:screen;';
      document.body.appendChild(flashEl);
    }
    function flash(color, duration){
      flashEl.style.background = color;
      flashEl.style.opacity = '0.45';
      setTimeout(function(){ flashEl.style.opacity = '0'; }, duration || 300);
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

    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min((now - lastFrameTime) / 1000, 0.05);
      lastFrameTime = now;

      applyShake(now);
      if (paused) return;

      const elapsed = now - phaseStart;

      // Ball physics + trail
      if (ball.active){
        updateBall(dt);
        if (trail.visible) trailPush(ball.pos);
        if (chasingFielder) updateChaser(dt);
      }

      switch(phase){

        case PHASE.IDLE: {
          animateIdle(now);
          if (elapsed > DURATIONS.idle) setPhase(PHASE.GUARD);
          break;
        }

        case PHASE.GUARD: {
          const p = Math.min(1, elapsed / DURATIONS.guard);
          animateGuard(p);
          if (p >= 1) setPhase(PHASE.MARK_RUNUP);
          break;
        }

        case PHASE.MARK_RUNUP: {
          const p = Math.min(1, elapsed / DURATIONS.mark_runup);
          animateMarkRunup(p);
          if (p >= 1) setPhase(PHASE.RUNUP);
          break;
        }

        case PHASE.RUNUP: {
          const p = Math.min(1, elapsed / DURATIONS.runup);
          animateRunup(p);
          if (p >= 1) setPhase(PHASE.DELIVERY);
          break;
        }

        case PHASE.DELIVERY: {
          const p = Math.min(1, elapsed / DURATIONS.delivery);
          animateDelivery(p);
          if (p >= 1){
            launchDelivery();
            setPhase(PHASE.INBOUND);
          }
          break;
        }

        case PHASE.INBOUND: {
          const ballPastBat = ball.pos.z > striker.position.z + 0.5;
          const batContact  = checkBatContact();
          if (batContact || ballPastBat || elapsed > DURATIONS.inbound){
            ball.active = false;
            flightBall.visible = false;
            setPhase(PHASE.SWING);
          }
          break;
        }

        case PHASE.SWING: {
          const p = Math.min(1, elapsed / DURATIONS.swing);
          animateSwing(p);
          if (p >= 0.55 && !outcome){
            outcome = customOutcome || rollOutcome();
            customOutcome = null;
          }
          if (p >= 1){
            launchHit(outcome);
            setPhase(PHASE.OUTBOUND);
          }
          break;
        }

        case PHASE.OUTBOUND: {
          if (!phaseData._bannerShown){
            phaseData._bannerShown = true;
            if (outcome.wicket){
              showBanner('OUT!', '#ef4444');
              flash('#7f1d1d', 400);
              cameraShake(1.5, 500);
              if (SV.stumpsStriker) SV.stumpsStriker.rotation.x = -0.7;
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

          // Chase for 1/2/3
          if (outcome.runs > 0 && outcome.runs < 4 && !phaseData._chaserPicked){
            phaseData._chaserPicked = true;
            pickChaser(ball.pos.x, ball.pos.z);
          }

          const ballStopped     = !ball.active;
          const crossedBoundary = Math.hypot(ball.pos.x, ball.pos.z) > BOUNDARY_R;
          const ballFlew        = outcome.runs === 6 && elapsed > 3500;

          if (ballStopped || crossedBoundary || ballFlew){
            trailStop();
            if (outcome.runs > 0 && outcome.runs < 4 && !outcome.wicket){
              setPhase(PHASE.RUNNING, { runs: outcome.runs });
            } else {
              setPhase(PHASE.SIGNAL);
            }
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
          const p = Math.min(1, elapsed / DURATIONS.signal);
          let sigType = 'out';
          if (outcome.runs === 4) sigType = 'four';
          else if (outcome.runs === 6) sigType = 'six';
          animateSignal(p, sigType);
          if (p >= 1) setPhase(PHASE.RESET);
          break;
        }

        case PHASE.RESET: {
          const p = Math.min(1, elapsed / DURATIONS.reset);
          resetAll(p);
          if (p >= 1){
            ball.active = false;
            flightBall.visible = false;
            trailStop();
            if (SV.stumpsStriker) SV.stumpsStriker.rotation.x = 0;
            ballCount++;
            if (ballCount >= 6) ballCount = 0;
            setPhase(PHASE.WALK_BACK);
          }
          break;
        }

        case PHASE.WALK_BACK: {
          const p = Math.min(1, elapsed / DURATIONS.walk_back);
          animateWalkBack(p);
          if (p >= 1){
            outcome = null;
            setPhase(PHASE.IDLE);
          }
          break;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  KICKOFF
    // ═══════════════════════════════════════════════════════════
    console.log('[Anim] ✅ Advanced engine ready');
    console.log('[Anim] Trail: cyan on 4, orange on 6, ball flies out on 6');
    requestAnimationFrame(tick);

    window.StadiumAnim = {
      deliver: function(runs, wicket){
        if (phase !== PHASE.IDLE && phase !== PHASE.WALK_BACK &&
            phase !== PHASE.GUARD && phase !== PHASE.MARK_RUNUP){
          console.warn('[Anim] Not idle — phase=' + phase);
          return;
        }
        if (runs !== undefined){
          customOutcome = {
            runs: runs || 0,
            wicket: !!wicket,
            boundary: (runs === 4 || runs === 6)
          };
        }
        setPhase(PHASE.RUNUP);
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
      resume: function(){ paused = false; }
    };
  }

  // Wait for stadium to be fully booted
  const wait = setInterval(function(){
    if (window.StadiumView &&
        window.StadiumView.players &&
        window.StadiumView.players['Bowler']){
      clearInterval(wait);
      setTimeout(boot, 700);
    }
  }, 200);

})();
