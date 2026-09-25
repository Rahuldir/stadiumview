/* ══════════════════════════════════════════════════════════════
   StadiumView — Full match animation engine
   Covers 14 animation types:
   1. Bowler run-up · 2. Batsman swing · 3. Ball flight + bounce
   4. Keeper crouch · 5. Fielder drift · 6. Batsman idle fidget
   7. Fielder chase + dive · 8. Umpire signals · 9. Wicket celebration
   10. Boundary celebration · 11. Running between wickets
   13. Bowler walk back · 14. Bowler change · 15. Cinematic camera
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  function boot(){
    const SV = window.StadiumView;
    const players = SV.players || {};
    const accessories = SV.accessories || {};
    const fieldY = SV.fieldY || 0;

    // ─── REFS ─────────────────────────────────────────────────
    const bowler       = players['Bowler'];
    const striker      = players['Striker'];
    const nonStriker   = players['Non-Striker'];
    const keeper       = players['Keeper'];
    const umpBowl      = players['Umpire (Bowl End)'];
    const umpLeg       = players['Umpire (Sq Leg)'];
    const strikerBat   = accessories['Striker'] && accessories['Striker'].bat;
    const bowlerBall   = accessories['Bowler'] && accessories['Bowler'].ball;

    if (!bowler || !striker || !strikerBat){
      console.warn('[Anim] Missing required refs — animation disabled');
      return;
    }

    // Fielder list (excluding keeper, bowlers)
    const FIELDER_ROLES = [
      'Slip','Point','Cover','Mid-Off','Mid-On',
      'Mid-Wicket','Square Leg','Fine Leg','Third Man'
    ];
    const fielders = FIELDER_ROLES.map(function(r){ return players[r]; }).filter(Boolean);

    console.log('[Anim] Players ready. Fielders: ' + fielders.length);

    // ─── HOME POSITIONS ───────────────────────────────────────
    const home = {};
    Object.keys(players).forEach(function(k){
      home[k] = players[k].position.clone();
    });

    // ─── REST ROTATIONS ───────────────────────────────────────
    const batRest = {
      x: strikerBat.rotation.x,
      y: strikerBat.rotation.y,
      z: strikerBat.rotation.z
    };

    // ─── FLIGHT BALL (world-space) ────────────────────────────
    const flightBall = bowlerBall ? bowlerBall.clone(true) : new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.55, emissive: 0x440000, emissiveIntensity: 0.3 })
    );
    if (bowlerBall) {
      // Remove the emissive override — keep ball looking like a ball
      flightBall.traverse(function(c){
        if (c.isMesh && c.material){
          c.material = c.material.clone();
          if (c.material.emissive) c.material.emissiveIntensity = 0.2;
          c.material.needsUpdate = true;
        }
      });
    }
    flightBall.visible = false;
    SV.scene.add(flightBall);

    // ─── STATE ────────────────────────────────────────────────
    const PHASE = {
      IDLE: 'idle',
      RUNUP: 'runup',
      DELIVERY: 'delivery',
      FLIGHT: 'flight',
      SWING: 'swing',
      FOLLOW: 'follow',
      RUNNING: 'running',
      CELEBRATE: 'celebrate',
      SIGNAL: 'signal',
      RESET: 'reset',
      WALK_BACK: 'walk_back'
    };

    let phase = PHASE.IDLE;
    let phaseStart = performance.now();
    let outcome = null;
    let lastBallContactAt = 0;
    let paused = false;

    const DURATION = {
      idle: 1500,
      runup: 1600,
      delivery: 250,
      flight: 550,
      swing: 500,
      follow: 500,
      running: 0,       // dynamic — 1350ms per run
      celebrate: 2500,
      signal: 900,
      reset: 800,
      walk_back: 2500
    };

    // ─── EASING ───────────────────────────────────────────────
    function ease(t){ return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2) / 2; }
    function easeOut(t){ return 1 - Math.pow(1-t, 3); }
    function lerp(a, b, t){ return a + (b - a) * t; }

    // ─── OUTCOME RANDOMIZER ───────────────────────────────────
    function rollOutcome(){
      const r = Math.random();
      if (r < 0.40) return { runs: 0 };
      if (r < 0.60) return { runs: 1 };
      if (r < 0.70) return { runs: 2 };
      if (r < 0.75) return { runs: 3 };
      if (r < 0.90) return { runs: 4, boundary: true };
      if (r < 0.95) return { runs: 6, boundary: true };
      return { runs: 0, wicket: true };
    }

    // ─── CAMERA SHAKE ─────────────────────────────────────────
    let shakeAmount = 0;
    let shakeUntil = 0;
    function shakeCamera(intensity, duration){
      shakeAmount = intensity;
      shakeUntil = performance.now() + duration;
    }

    // Apply shake in the animation loop (moves camera slightly)
    const originalCameraPos = SV.camera.position.clone();
    function applyShake(now){
      if (now > shakeUntil){
        shakeAmount = 0;
        return;
      }
      const intensity = shakeAmount * (shakeUntil - now) / 1000;
      SV.camera.position.x += (Math.random() - 0.5) * intensity * 0.5;
      SV.camera.position.y += (Math.random() - 0.5) * intensity * 0.5;
    }

    // ─── FLASH OVERLAY (crowd reaction) ───────────────────────
    let flashEl = document.getElementById('cm-flash');
    if (!flashEl){
      flashEl = document.createElement('div');
      flashEl.id = 'cm-flash';
      flashEl.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:99999;opacity:0;' +
        'transition:opacity .12s ease-out;mix-blend-mode:screen;';
      document.body.appendChild(flashEl);
    }
    function flashScreen(color, duration){
      flashEl.style.background = color;
      flashEl.style.opacity = '0.4';
      setTimeout(function(){ flashEl.style.opacity = '0'; }, duration || 250);
    }

    // ─── FLOATING TEXT (broadcast banner) ─────────────────────
    let bannerEl = document.getElementById('cm-banner');
    if (!bannerEl){
      bannerEl = document.createElement('div');
      bannerEl.id = 'cm-banner';
      bannerEl.style.cssText =
        'position:fixed;top:20%;left:50%;transform:translate(-50%,-30px);z-index:99999;' +
        'font-family:"Titillium Web",sans-serif;font-weight:900;font-style:italic;' +
        'font-size:64px;letter-spacing:4px;text-transform:uppercase;' +
        'opacity:0;transition:opacity .3s ease, transform .4s cubic-bezier(.34,1.56,.64,1);' +
        'pointer-events:none;text-align:center;';
      document.body.appendChild(bannerEl);
    }
    function showBanner(text, color){
      bannerEl.textContent = text;
      bannerEl.style.color = color;
      bannerEl.style.textShadow = '0 0 40px ' + color + ', 0 6px 20px rgba(0,0,0,.9)';
      bannerEl.style.transform = 'translate(-50%, 0)';
      bannerEl.style.opacity = '1';
      clearTimeout(bannerEl._hideT);
      bannerEl._hideT = setTimeout(function(){
        bannerEl.style.opacity = '0';
        bannerEl.style.transform = 'translate(-50%, -30px)';
      }, 2000);
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 5. FIELDER DRIFT (background)
    // ═══════════════════════════════════════════════════════════
    function animateFielderDrift(now, dt){
      fielders.forEach(function(f, i){
        const h = home[f.name] || f.position;
        // Gentle sway around home position
        const sway = Math.sin(now * 0.0006 + i) * 0.4;
        const drift = Math.cos(now * 0.0004 + i * 1.7) * 0.3;
        f.position.x += (h.x + sway - f.position.x) * 0.02;
        f.position.z += (h.z + drift - f.position.z) * 0.02;
        // Small head sway
        f.rotation.y = (home[f.name] ? f.userData._homeRot || 0 : 0) + Math.sin(now * 0.0005 + i) * 0.15;
      });
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 6. BATSMAN IDLE FIDGET (background)
    // ═══════════════════════════════════════════════════════════
    function animateBatsmanIdle(now){
      if (!strikerBat) return;
      // Bat tap every ~2.5s
      const tapCycle = (now % 2500) / 2500;
      const tapMotion = tapCycle < 0.15 ? Math.sin(tapCycle * Math.PI / 0.15) * 0.12 : 0;

      strikerBat.rotation.x = batRest.x + tapMotion;
      strikerBat.rotation.z = batRest.z;

      // Subtle body sway
      striker.rotation.y += 0; // keep as set
      striker.position.x = home['Striker'].x + Math.sin(now * 0.0008) * 0.02;
      striker.position.z = home['Striker'].z + Math.cos(now * 0.0009) * 0.02;

      // Non-striker shift
      if (nonStriker){
        nonStriker.position.x = home['Non-Striker'].x + Math.sin(now * 0.0007 + 1) * 0.03;
        nonStriker.position.z = home['Non-Striker'].z + Math.cos(now * 0.0006 + 1) * 0.03;
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 1. BOWLER RUN-UP
    // ═══════════════════════════════════════════════════════════
    const RUNUP_START = new THREE.Vector3(1.2, fieldY, -24);
    const RUNUP_END   = new THREE.Vector3(0.55, fieldY, -11);

    function animateBowlerRunUp(p){
      const e = ease(p);
      bowler.position.lerpVectors(RUNUP_START, RUNUP_END, e);
      // Bobbing
      bowler.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 8)) * 0.08;
      // Side sway
      bowler.position.x += Math.sin(p * Math.PI * 6) * 0.1;
      // Lean forward
      bowler.rotation.x = 0.15 * e;
      bowler.rotation.y = 0;
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 2. DELIVERY (arm over)
    // ═══════════════════════════════════════════════════════════
    function animateDelivery(p){
      const e = ease(p);
      bowler.position.z = RUNUP_END.z + 0.4 * e;
      bowler.position.y = fieldY;
      // Lean back as they release
      bowler.rotation.x = 0.15 - 0.5 * e;
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 3. BALL FLIGHT + BOUNCE
    // ═══════════════════════════════════════════════════════════
    const BALL_RELEASE = new THREE.Vector3(0.9, fieldY + 2.0, -11);
    const BALL_BOUNCE  = new THREE.Vector3(0.3, fieldY + 0.1, -1);
    const BALL_CONTACT = new THREE.Vector3(0.4, fieldY + 0.7, 9);

    function animateBallFlight(p){
      // Two-stage: release → bounce (0-0.6), bounce → contact (0.6-1.0)
      const BOUNCE_T = 0.55;
      if (p < BOUNCE_T){
        const t = p / BOUNCE_T;
        flightBall.position.lerpVectors(BALL_RELEASE, BALL_BOUNCE, t);
        // Slight arc down
        flightBall.position.y += (1 - t) * 0.5 * Math.sin(t * Math.PI);
      } else {
        const t = (p - BOUNCE_T) / (1 - BOUNCE_T);
        flightBall.position.lerpVectors(BALL_BOUNCE, BALL_CONTACT, t);
        // Rise after bounce
        flightBall.position.y += t * 0.4;
      }
      // Spin
      flightBall.rotation.x += 0.25;
      flightBall.rotation.z += 0.05;
      flightBall.visible = true;

      // Keeper crouch starts
      if (keeper){
        const crouch = Math.min(1, p * 2);
        keeper.rotation.x = 0.25 * crouch;
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 2. BATSMAN SWING
    // ═══════════════════════════════════════════════════════════
    const BAT_BACKLIFT = { x: batRest.x - 0.6, z: batRest.z + 0.9 };
    const BAT_CONTACT  = { x: batRest.x + 0.6, z: batRest.z - 1.4 };
    const BAT_FOLLOW   = { x: batRest.x + 1.0, z: batRest.z - 1.8 };

    function animateBatsmanSwing(p){
      if (p < 0.25){
        const q = p / 0.25;
        strikerBat.rotation.x = lerp(batRest.x, BAT_BACKLIFT.x, ease(q));
        strikerBat.rotation.z = lerp(batRest.z, BAT_BACKLIFT.z, ease(q));
      } else if (p < 0.55){
        const q = (p - 0.25) / 0.3;
        strikerBat.rotation.x = lerp(BAT_BACKLIFT.x, BAT_CONTACT.x, easeOut(q));
        strikerBat.rotation.z = lerp(BAT_BACKLIFT.z, BAT_CONTACT.z, easeOut(q));
        striker.rotation.x = lerp(0, 0.2, q);
      } else {
        const q = (p - 0.55) / 0.45;
        strikerBat.rotation.x = lerp(BAT_CONTACT.x, BAT_FOLLOW.x, ease(q));
        strikerBat.rotation.z = lerp(BAT_CONTACT.z, BAT_FOLLOW.z, ease(q));
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 11. RUNNING BETWEEN WICKETS
    // ═══════════════════════════════════════════════════════════
    const NONSTRIKER_HOME = new THREE.Vector3(-0.4, fieldY, -9);

    function animateRunning(totalRuns, progress){
      // progress goes 0 → totalRuns
      const lap = progress;
      const currentLap = Math.floor(lap);
      const frac = lap - currentLap;
      const goingForward = currentLap % 2 === 0;

      const sZ = goingForward
        ? lerp(9, -9, frac)
        : lerp(-9, 9, frac);
      const nZ = goingForward
        ? lerp(-9, 9, frac)
        : lerp(9, -9, frac);

      striker.position.z = sZ;
      striker.position.x = 0.6;
      nonStriker.position.z = nZ;
      nonStriker.position.x = -0.6;

      // Running motion
      const cycle = Math.sin(progress * Math.PI * 6);
      striker.position.y = fieldY + Math.abs(cycle) * 0.08;
      nonStriker.position.y = fieldY + Math.abs(cycle) * 0.08;

      striker.rotation.x = 0.15;
      nonStriker.rotation.x = 0.15;

      // Bats held forward
      if (strikerBat) strikerBat.rotation.x = batRest.x + 0.3;
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 9. WICKET CELEBRATION
    // ═══════════════════════════════════════════════════════════
    function animateWicketCelebration(p){
      // Bowler celebrates (arms up)
      bowler.rotation.x = lerp(0, -0.2, ease(Math.min(1, p * 2)));
      // Keeper stands up
      if (keeper) keeper.rotation.x = lerp(0.25, 0, ease(Math.min(1, p * 2)));
      // Fielders jog towards the pitch
      if (p < 0.5){
        fielders.forEach(function(f, i){
          const h = home[f.name] || f.position;
          const targetX = lerp(h.x, h.x * 0.6, p * 2);
          const targetZ = lerp(h.z, h.z * 0.6, p * 2);
          f.position.x += (targetX - f.position.x) * 0.05;
          f.position.z += (targetZ - f.position.z) * 0.05;
        });
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 10. BOUNDARY CELEBRATION
    // ═══════════════════════════════════════════════════════════
    function animateBoundaryCelebration(p){
      // Batsman raises bat
      const raise = Math.min(1, p * 2);
      if (strikerBat) strikerBat.rotation.x = lerp(BAT_FOLLOW.x, batRest.x - 0.4, ease(raise));
      // Non-striker walks over
      nonStriker.position.x += (striker.position.x - 1.2 - nonStriker.position.x) * 0.05;
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 7. FIELDER CHASE + DIVE
    // ═══════════════════════════════════════════════════════════
    function animateFielderChase(p, hitPoint){
      // Find closest fielder
      let closest = fielders[0], minD = 9999;
      fielders.forEach(function(f){
        const h = home[f.name] || f.position;
        const d = Math.hypot(h.x - hitPoint.x, h.z - hitPoint.z);
        if (d < minD){ minD = d; closest = f; }
      });
      if (!closest) return;
      // Move towards ball
      if (p < 0.7){
        const h = home[closest.name] || closest.position;
        const t = ease(p / 0.7);
        closest.position.x = lerp(h.x, hitPoint.x * 0.85, t);
        closest.position.z = lerp(h.z, hitPoint.z * 0.85, t);
        // Bobbing
        closest.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 10)) * 0.15;
      } else if (p < 0.85){
        // Dive
        const t = (p - 0.7) / 0.15;
        closest.rotation.x = lerp(0, Math.PI * 0.4, t);
        closest.position.y = lerp(fieldY, fieldY + 0.3, Math.sin(t * Math.PI));
      } else {
        // Recover
        const t = (p - 0.85) / 0.15;
        closest.rotation.x = lerp(Math.PI * 0.4, 0, t);
        closest.position.y = lerp(fieldY + 0.3, fieldY, t);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 8. UMPIRE SIGNALS
    // ═══════════════════════════════════════════════════════════
    function animateUmpireSignal(p, signalType){
      if (!umpBowl) return;
      const up = Math.min(1, p * 3);
      const down = Math.max(0, 1 - (p - 0.7) / 0.3);
      const active = Math.min(up, down);

      if (signalType === 'four'){
        // Arm sweeps across body
        umpBowl.rotation.y = lerp(0, -0.8, ease(active));
      } else if (signalType === 'six'){
        // Both arms up — lean back
        umpBowl.rotation.x = lerp(0, -0.3, ease(active));
      } else if (signalType === 'out'){
        // Finger raised — lean forward
        umpBowl.rotation.x = lerp(0, 0.2, ease(active));
      } else if (signalType === 'wide'){
        // Arms out — turn slightly
        umpBowl.rotation.y = lerp(0, 0.5, ease(active));
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 13. BOWLER WALKS BACK
    // ═══════════════════════════════════════════════════════════
    function animateBowlerWalkBack(p){
      const e = ease(p);
      const from = new THREE.Vector3(0.55, fieldY, -11);
      bowler.position.lerpVectors(from, RUNUP_START, e);
      // Slow walking motion
      const cycle = Math.sin(p * Math.PI * 4);
      bowler.rotation.x = 0.05;
      // Limb motion — small bob
      bowler.position.y = fieldY + Math.abs(cycle) * 0.04;
      // Head down
      bowler.rotation.y = lerp(0, Math.PI * 0.15, e);
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 14. BOWLER CHANGE AT END OF OVER
    // ═══════════════════════════════════════════════════════════
    let ballCount = 0;
    let overs = 0;
    function checkOverChange(){
      ballCount++;
      if (ballCount >= 6){
        ballCount = 0;
        overs++;
        return true;
      }
      return false;
    }

    // ═══════════════════════════════════════════════════════════
    //  ANIMATION: 15. CINEMATIC CAMERA (shake + slight zoom)
    // ═══════════════════════════════════════════════════════════
    function cinematicCamera(intensity, duration){
      shakeCamera(intensity, duration);
    }

    // ═══════════════════════════════════════════════════════════
    //  RESET ALL PLAYERS TO HOME
    // ═══════════════════════════════════════════════════════════
    function resetAll(t){
      const e = ease(t);
      Object.keys(players).forEach(function(role){
        const p = players[role];
        const h = home[role];
        p.position.lerp(h, e * 0.08);
        p.rotation.x = lerp(p.rotation.x, 0, e * 0.08);
        p.rotation.y = lerp(p.rotation.y, p.userData._homeRotY || p.rotation.y, e * 0.08);
      });
      if (strikerBat){
        strikerBat.rotation.x = lerp(strikerBat.rotation.x, batRest.x, e * 0.1);
        strikerBat.rotation.z = lerp(strikerBat.rotation.z, batRest.z, e * 0.1);
      }
      if (keeper) keeper.rotation.x = lerp(keeper.rotation.x, 0, e * 0.1);
    }

    // ═══════════════════════════════════════════════════════════
    //  MAIN STATE MACHINE
    // ═══════════════════════════════════════════════════════════
    function tick(now){
      requestAnimationFrame(tick);

      // Apply any active camera shake
      applyShake(now);

      if (paused) return;
      const dt = now - phaseStart;
      const t = dt / 1000;

      switch(phase){

        case PHASE.IDLE:
          animateBatsmanIdle(now);
          animateFielderDrift(now, dt);
          if (dt > DURATION.idle){
            setPhase(PHASE.RUNUP);
          }
          break;

        case PHASE.RUNUP: {
          const p = Math.min(1, dt / DURATION.runup);
          animateBowlerRunUp(p);
          // Keeper crouches during run-up
          if (keeper && p > 0.4){
            keeper.rotation.x = 0.25 * ((p - 0.4) / 0.6);
          }
          if (p >= 1) setPhase(PHASE.DELIVERY);
          break;
        }

        case PHASE.DELIVERY: {
          const p = Math.min(1, dt / DURATION.delivery);
          animateDelivery(p);
          if (p >= 1){
            // Release the ball
            flightBall.position.copy(BALL_RELEASE);
            flightBall.visible = true;
            if (bowlerBall) bowlerBall.visible = false;
            lastBallContactAt = performance.now();
            setPhase(PHASE.FLIGHT);
          }
          break;
        }

        case PHASE.FLIGHT: {
          const p = Math.min(1, dt / DURATION.flight);
          animateBallFlight(p);
          if (p >= 1){
            // Ball reaches batsman
            flightBall.visible = false;
            setPhase(PHASE.SWING);
          }
          break;
        }

        case PHASE.SWING: {
          const p = Math.min(1, dt / DURATION.swing);
          animateBatsmanSwing(p);
          if (p >= 1){
            outcome = rollOutcome();
            // Show outcome
            if (outcome.wicket){
              showBanner('OUT!', '#ef4444');
              flashScreen('#7f1d1d', 400);
              cinematicCamera(1.5, 500);
              // Wicket falls
              if (keeper) keeper.rotation.x = 0.25;
            } else if (outcome.boundary && outcome.runs === 6){
              showBanner('SIX!', '#ff6d00');
              flashScreen('#ff6d00', 350);
              cinematicCamera(2.0, 600);
              if (audioMode !== 'mute') crowdRoarSound(1.2);
            } else if (outcome.boundary && outcome.runs === 4){
              showBanner('FOUR!', '#22d3ee');
              flashScreen('#22d3ee', 300);
              cinematicCamera(1.2, 400);
              if (audioMode !== 'mute') crowdRoarSound(0.8);
            } else if (outcome.runs > 0){
              // Small chime
            }
            setPhase(PHASE.FOLLOW);
          }
          break;
        }

        case PHASE.FOLLOW: {
          const p = Math.min(1, dt / DURATION.follow);
          // Ball travels away from batsman
          if (outcome && outcome.runs > 0 && !outcome.wicket){
            const hitAngle = Math.random() * Math.PI * 2;
            const distance = 15 + (outcome.runs * 15);
            const endX = 0.4 + Math.cos(hitAngle) * distance;
            const endZ = 9 + Math.sin(hitAngle) * distance;
            flightBall.position.x = lerp(0.4, endX, p);
            flightBall.position.z = lerp(9, endZ, p);
            flightBall.position.y = fieldY + 0.7 + (outcome.boundary ? 4 * Math.sin(p * Math.PI) : 0.5 * Math.sin(p * Math.PI));
            flightBall.visible = true;
          }
          if (p >= 1){
            // Decide next phase
            if (outcome && outcome.wicket){
              setPhase(PHASE.CELEBRATE);
            } else if (outcome && outcome.boundary){
              // Umpire signal
              setPhase(PHASE.SIGNAL);
            } else if (outcome && outcome.runs > 0){
              setPhase(PHASE.RUNNING);
            } else {
              setPhase(PHASE.RESET);
            }
          }
          break;
        }

        case PHASE.RUNNING: {
          if (!outcome || outcome.runs === 0){
            setPhase(PHASE.RESET);
            break;
          }
          const duration = outcome.runs * 1200;
          const p = Math.min(1, dt / duration);
          animateRunning(outcome.runs, p * outcome.runs);

          // Fielder chase if applicable (run 1-3)
          if (outcome.runs <= 3){
            const hitPoint = { x: 8, z: 6 };
            animateFielderChase(p, hitPoint);
          }

          if (p >= 1){
            setPhase(PHASE.SIGNAL);
          }
          break;
        }

        case PHASE.SIGNAL: {
          const p = Math.min(1, dt / DURATION.signal);
          let signalType = 'wide';
          if (outcome){
            if (outcome.runs === 4) signalType = 'four';
            else if (outcome.runs === 6) signalType = 'six';
            else if (outcome.wicket) signalType = 'out';
          }
          animateUmpireSignal(p, signalType);
          if (p >= 1){
            setPhase(PHASE.RESET);
          }
          break;
        }

        case PHASE.CELEBRATE: {
          const p = Math.min(1, dt / DURATION.celebrate);
          animateWicketCelebration(p);
          if (p >= 1){
            setPhase(PHASE.RESET);
          }
          break;
        }

        case PHASE.RESET: {
          const p = Math.min(1, dt / DURATION.reset);
          resetAll(p);
          if (p >= 1){
            // Reset ball
            flightBall.visible = false;
            if (bowlerBall) bowlerBall.visible = true;
            outcome = null;
            // Every 6 balls, bowler walks back slowly
            const overEnded = (ballCount + 1) >= 6;
            if (overEnded){
              ballCount = 0;
              setPhase(PHASE.WALK_BACK);
            } else {
              ballCount++;
              // Quick bowler walk back
              setPhase(PHASE.WALK_BACK);
            }
          }
          break;
        }

        case PHASE.WALK_BACK: {
          const p = Math.min(1, dt / DURATION.walk_back);
          animateBowlerWalkBack(p);
          if (p >= 1){
            setPhase(PHASE.IDLE);
          }
          break;
        }
      }
    }

    function setPhase(p){
      phase = p;
      phaseStart = performance.now();
      console.log('[Anim] → ' + p);
    }

    // ═══════════════════════════════════════════════════════════
    //  SOUND (fake crowd roar via oscillator)
    // ═══════════════════════════════════════════════════════════
    let crowdAudioCtx = null;
    function crowdRoarSound(intensity){
      try {
        if (!crowdAudioCtx) crowdAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dur = 0.8, sr = crowdAudioCtx.sampleRate;
        const buf = crowdAudioCtx.createBuffer(1, Math.floor(sr * dur), sr);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++){
          const env = Math.sin(Math.PI * (i / d.length));
          d[i] = (Math.random() * 2 - 1) * env;
        }
        const src = crowdAudioCtx.createBufferSource();
        src.buffer = buf;
        const bp = crowdAudioCtx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 700;
        bp.Q.value = 0.7;
        const g = crowdAudioCtx.createGain();
        g.gain.value = 0.15 * intensity;
        src.connect(bp); bp.connect(g); g.connect(crowdAudioCtx.destination);
        src.start();
      } catch(e){}
    }

    let audioMode = 'stadium';

    // ═══════════════════════════════════════════════════════════
    //  KICK OFF
    // ═══════════════════════════════════════════════════════════
    console.log('[Anim] ✅ Animation engine ready');
    console.log('[Anim] Phases: idle → runup → delivery → flight → swing → follow → [running/signal/celebrate] → reset → walk_back');
    console.log('[Anim] Full ball cycle: ~10 seconds');

    // Save initial rotations for reset
    Object.keys(players).forEach(function(role){
      players[role].userData._homeRotY = players[role].rotation.y;
    });

    requestAnimationFrame(tick);

    // ═══════════════════════════════════════════════════════════
    //  PUBLIC API — hook your scoring engine here
    // ═══════════════════════════════════════════════════════════
    window.StadiumAnim = {
      // Trigger a specific delivery
      deliver: function(runsOverride, wicketOverride){
        if (phase !== PHASE.IDLE && phase !== PHASE.WALK_BACK){
          console.warn('[Anim] Not idle — cannot deliver');
          return;
        }
        // Store override to be used at SWING phase
        if (runsOverride !== undefined){
          const origRoll = rollOutcome;
          rollOutcome = function(){
            return {
              runs: runsOverride || 0,
              wicket: !!wicketOverride,
              boundary: (runsOverride === 4 || runsOverride === 6)
            };
          };
          // Restore after outcome is decided
          setTimeout(function(){ rollOutcome = origRoll; }, 5000);
        }
        setPhase(PHASE.RUNUP);
      },

      // Pause / resume
      pause: function(){ paused = true; },
      resume: function(){ paused = false; },

      // Force a specific outcome next ball
      setNextOutcome: function(runs, wicket){
        const origRoll = rollOutcome;
        rollOutcome = function(){
          rollOutcome = origRoll;
          return {
            runs: runs || 0,
            wicket: !!wicket,
            boundary: (runs === 4 || runs === 6)
          };
        };
      },

      // Query current state
      currentPhase: function(){ return phase; },
      ballCount: function(){ return ballCount; },

      // Sound toggle for crowd roar
      setAudioMode: function(mode){ audioMode = mode; }
    };
  }

  // ─── WAIT FOR STADIUM TO BE READY ──────────────────────────
  const wait = setInterval(function(){
    if (window.StadiumView && window.StadiumView.players && window.StadiumView.players['Bowler']){
      clearInterval(wait);
      setTimeout(boot, 600);
    }
  }, 200);

})();
