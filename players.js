/* ══════════════════════════════════════════════════════════════
   players.js + anim.js — SINGLE FILE
   • Bone mapping for 15 players
   • Bat & ball attached to right-hand bone
   • Batting stance / keeper crouch / slip crouch
   • Cricket match loop: idle → runup → bowl → hit → outbound → reset
   • Fielder chase + keeper anticipation
   Exposes: window.PlayerControl  ·  window.StadiumAnim
   ══════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  console.log('%c[cricket.js] start', 'color:#00e676;font-weight:bold');

  // ═══════════════════════════════════════════════════════════
  //  TUNE VALUES
  // ═══════════════════════════════════════════════════════════
  const STANCE = {
    bodyTurn:     -0.35,
    rArmForward:   0.65,
    rArmOut:      -0.25,
    rElbow:        0.95,
    lArmForward:   0.85,
    lArmOut:       0.30,
    lElbow:        1.10,
    kneeThigh:     0.30,
    kneeShin:     -0.20,
    batRotX:       Math.PI * 0.5,
    batRotY:       0,
    batRotZ:      -Math.PI * 0.5,
    batPosX:       0.02,
    batPosY:      -0.05,
    batPosZ:       0.01
  };
  const KEEPER = { thigh: 0.90, shin: -1.00, spine: 0.15 };
  const SLIP   = { thigh: 0.55, shin: -0.60, spine: 0.20 };

  const GRAVITY = 9.81;
  const BALL_RADIUS = 0.036;
  const BOUNCE_DAMP = 0.42;
  const AIR_DRAG = 0.015;
  const GROUND_FRIC = 2.4;
  const BOUNDARY_R = 38;

  const wait = setInterval(() => {
    const P = window.StadiumView && window.StadiumView.players;
    if (!P || Object.keys(P).length < 5) return;
    clearInterval(wait);
    setTimeout(boot, 300);
  }, 200);

  function boot(){
    const SV          = window.StadiumView;
    const raw         = SV.players;
    const accessories = SV.accessories || {};
    const roles       = Object.keys(raw);
    const players     = {};
    const scene       = SV.scene;
    const fieldY      = SV.fieldY || 0;

    const AX = new THREE.Vector3(1, 0, 0);
    const AY = new THREE.Vector3(0, 1, 0);
    const AZ = new THREE.Vector3(0, 0, 1);

    // ═══════════════════════════════════════════════════════
    //  BONE FINDER
    // ═══════════════════════════════════════════════════════
    function findBone(group, patterns){
      let found = null;
      group.traverse(c => {
        if (found) return;
        if (!c.isBone && c.type !== 'Bone') return;
        const n = (c.name || '').toLowerCase().replace(/[_.\-\s]/g, '');
        if (patterns.some(p => n.includes(p))) found = c;
      });
      return found;
    }

    const BONE_MAP = [
      { key:'hips',      patterns:['hips','pelvis','root'] },
      { key:'spine',     patterns:['spine','spine1'] },
      { key:'chest',     patterns:['chest','spine2','upperchest'] },
      { key:'neck',      patterns:['neck'] },
      { key:'head',      patterns:['head'] },
      { key:'lUpperArm', patterns:['leftupperarm','leftarm','lupperarm','upperarml','upperarmleft','leftshoulder','lshoulder'] },
      { key:'rUpperArm', patterns:['rightupperarm','rightarm','rupperarm','upperarmr','upperarmright','rightshoulder','rshoulder'] },
      { key:'lForeArm',  patterns:['leftforearm','leftlowerarm','lforearm','forearml'] },
      { key:'rForeArm',  patterns:['rightforearm','rightlowerarm','rforearm','forearmr'] },
      { key:'lHand',     patterns:['lefthand','lhand','handl'] },
      { key:'rHand',     patterns:['righthand','rhand','handr'] },
      { key:'lThigh',    patterns:['leftupleg','leftthigh','lthigh','thighl'] },
      { key:'rThigh',    patterns:['rightupleg','rightthigh','rthigh','thighr'] },
      { key:'lShin',     patterns:['leftleg','leftshin','llowerleg','shinleft','calfleft'] },
      { key:'rShin',     patterns:['rightleg','rightshin','rlowerleg','shinright','calfright'] },
      { key:'lFoot',     patterns:['leftfoot','lfoot','footl'] },
      { key:'rFoot',     patterns:['rightfoot','rfoot','footr'] }
    ];

    const _q = new THREE.Quaternion();
    function applyRot(bone, axis, angle){
      if (!bone || !angle) return;
      _q.setFromAxisAngle(axis, angle);
      bone.quaternion.multiply(_q);
    }

    // ═══════════════════════════════════════════════════════
    //  POSES
    // ═══════════════════════════════════════════════════════
    function applyBattingStance(b){
      if (!b) return;
      applyRot(b.spine, AY, STANCE.bodyTurn * 0.5);
      applyRot(b.chest, AY, STANCE.bodyTurn * 0.5);
      applyRot(b.lThigh, AX, STANCE.kneeThigh);
      applyRot(b.rThigh, AX, STANCE.kneeThigh);
      applyRot(b.lShin,  AX, STANCE.kneeShin);
      applyRot(b.rShin,  AX, STANCE.kneeShin);
      applyRot(b.rUpperArm, AX, -STANCE.rArmForward);
      applyRot(b.rUpperArm, AZ, STANCE.rArmOut);
      applyRot(b.rForeArm,  AX, -STANCE.rElbow);
      applyRot(b.lUpperArm, AX, -STANCE.lArmForward);
      applyRot(b.lUpperArm, AZ, STANCE.lArmOut);
      applyRot(b.lForeArm,  AX, -STANCE.lElbow);
    }

    function applyKeeperStance(b){
      if (!b) return;
      applyRot(b.lThigh, AX, KEEPER.thigh);
      applyRot(b.rThigh, AX, KEEPER.thigh);
      applyRot(b.lShin,  AX, KEEPER.shin);
      applyRot(b.rShin,  AX, KEEPER.shin);
      applyRot(b.spine,  AX, KEEPER.spine);
    }

    function applySlipStance(b){
      if (!b) return;
      applyRot(b.lThigh, AX, SLIP.thigh);
      applyRot(b.rThigh, AX, SLIP.thigh);
      applyRot(b.lShin,  AX, SLIP.shin);
      applyRot(b.rShin,  AX, SLIP.shin);
      applyRot(b.spine,  AX, SLIP.spine);
    }

    function applyBasePosture(p){
      if (!p || !p.bones) return;
      if (p.role === 'Striker' || p.role === 'Non-Striker'){
        applyBattingStance(p.bones);
      } else if (p.role === 'Keeper'){
        applyKeeperStance(p.bones);
      } else if (p.role === 'Slip'){
        applySlipStance(p.bones);
      }
    }

    // ═══════════════════════════════════════════════════════
    //  SETUP EACH PLAYER
    // ═══════════════════════════════════════════════════════
    roles.forEach(role => {
      const group = raw[role];
      const bones = {};
      BONE_MAP.forEach(item => { bones[item.key] = findBone(group, item.patterns); });

      const rest = {};
      group.traverse(c => {
        if (c.isBone || c.type === 'Bone') rest[c.uuid] = c.quaternion.clone();
      });

      const bat  = accessories[role] && accessories[role].bat;
      const ball = accessories[role] && accessories[role].ball;

      // Bat → right hand
      if (bat && bones.rHand){
        if (bat.parent) bat.parent.remove(bat);
        bat.scale.set(1, 1, 1);
        bat.updateMatrixWorld(true);
        const bb = new THREE.Box3().setFromObject(bat);
        const sz = new THREE.Vector3(); bb.getSize(sz);
        if (sz.y > 0) bat.scale.multiplyScalar(0.96 / sz.y);
        bat.position.set(STANCE.batPosX, STANCE.batPosY, STANCE.batPosZ);
        bat.rotation.set(STANCE.batRotX, STANCE.batRotY, STANCE.batRotZ);
        bones.rHand.add(bat);
        bat.updateMatrixWorld(true);
      }

      // Ball → right hand
      if (ball && bones.rHand){
        if (ball.parent) ball.parent.remove(ball);
        ball.position.set(0.04, 0.02, 0.03);
        bones.rHand.add(ball);
        ball.updateMatrixWorld(true);
      }

      players[role] = {
        role, group, bones, rest,
        home: {
          x: group.position.x,
          y: group.position.y,
          z: group.position.z,
          rotY: group.rotation.y
        },
        lastX: group.position.x,
        lastZ: group.position.z,
        phase: 0,
        speed: 0,
        bat, ball
      };

      applyBasePosture(players[role]);
    });

    console.log('[players] ' + Object.keys(players).length + ' mapped');

    // ═══════════════════════════════════════════════════════
    //  WALK CYCLE
    // ═══════════════════════════════════════════════════════
    function updateWalk(p, dt){
      const dx = p.group.position.x - p.lastX;
      const dz = p.group.position.z - p.lastZ;
      const inst = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      p.lastX = p.group.position.x;
      p.lastZ = p.group.position.z;
      p.speed = p.speed * 0.85 + inst * 0.15;

      if (p.speed < 0.2) return;
      if (p.role === 'Keeper') return;

      p.phase += dt * (1.5 + Math.min(2.5, p.speed) * 1.5) * Math.PI * 2;
      const cyc = p.phase;
      const s = Math.min(1, p.speed / 3.5);
      const stride = 0.35 + s * 0.40;

      applyRot(p.bones.lThigh, AX,  Math.sin(cyc) * stride);
      applyRot(p.bones.rThigh, AX, -Math.sin(cyc) * stride);
      applyRot(p.bones.lShin,  AX, -Math.max(0, -Math.sin(cyc - 0.4)) * stride * 1.4);
      applyRot(p.bones.rShin,  AX, -Math.max(0,  Math.sin(cyc - 0.4)) * stride * 1.4);

      const isSpecial = (
        p.role === 'Striker' || p.role === 'Non-Striker' ||
        p.role === 'Bowler'  || p.role === 'Keeper' ||
        p.role === 'Slip'    || p.role.indexOf('Umpire') === 0
      );
      if (!isSpecial){
        applyRot(p.bones.lUpperArm, AX, -Math.sin(cyc) * stride * 0.5);
        applyRot(p.bones.rUpperArm, AX,  Math.sin(cyc) * stride * 0.5);
      }
      applyRot(p.bones.hips, AY, Math.sin(cyc) * 0.06);
    }

    function resetRest(p){
      p.group.traverse(c => {
        if ((c.isBone || c.type === 'Bone') && p.rest[c.uuid]){
          c.quaternion.copy(p.rest[c.uuid]);
        }
      });
      applyBasePosture(p);
    }

    // ═══════════════════════════════════════════════════════
    //  MATCH STATE
    // ═══════════════════════════════════════════════════════
    const MatchState = {
      runs: 0, wickets: 0, balls: 0, over: 0, ballInOver: 0,
      lastOutcome: '—',
      reset(){ this.runs=0; this.wickets=0; this.balls=0; this.over=0; this.ballInOver=0; this.lastOutcome='—'; }
    };
    window.MatchState = MatchState;

    // ═══════════════════════════════════════════════════════
    //  FLIGHT BALL + PHYSICS
    // ═══════════════════════════════════════════════════════
    const bowlerBall = accessories['Bowler'] && accessories['Bowler'].ball;
    if (!bowlerBall){
      console.warn('[cricket] no bowler ball');
      return;
    }

    const flightBall = bowlerBall.clone(true);
    flightBall.visible = false;
    scene.add(flightBall);
    bowlerBall.visible = false;

    const ball = {
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      active: false,
      rolling: false,
      spinning: new THREE.Vector3()
    };

    function launchBall(pos, vel, spin){
      ball.pos.copy(pos);
      ball.vel.copy(vel);
      ball.spinning.set(spin ? spin.x : 0, spin ? spin.y : 0, spin ? spin.z : 0);
      ball.active = true;
      ball.rolling = false;
      flightBall.position.copy(pos);
      flightBall.visible = true;
    }

    function updateBall(dt){
      if (!ball.active) return;
      if (ball.rolling){
        const speed = Math.hypot(ball.vel.x, ball.vel.z);
        if (speed < 0.3){ ball.active = false; return; }
        const ns = Math.max(0, speed - GROUND_FRIC * dt);
        const r = ns / speed;
        ball.vel.x *= r; ball.vel.z *= r;
        ball.pos.x += ball.vel.x * dt;
        ball.pos.z += ball.vel.z * dt;
        ball.pos.y = fieldY + BALL_RADIUS;
      } else {
        ball.vel.y -= GRAVITY * dt;
        const drag = 1 - AIR_DRAG * dt;
        ball.vel.x *= drag; ball.vel.z *= drag;
        ball.pos.x += ball.vel.x * dt;
        ball.pos.y += ball.vel.y * dt;
        ball.pos.z += ball.vel.z * dt;
        const gy = fieldY + BALL_RADIUS;
        if (ball.pos.y < gy){
          ball.pos.y = gy;
          if (Math.abs(ball.vel.y) > 1.2){
            ball.vel.y = -ball.vel.y * BOUNCE_DAMP;
            ball.vel.x *= 0.78; ball.vel.z *= 0.78;
          } else {
            ball.rolling = true;
            ball.vel.y = 0;
          }
        }
      }
      flightBall.position.copy(ball.pos);
    }

    // ═══════════════════════════════════════════════════════
    //  MATCH LOOP
    // ═══════════════════════════════════════════════════════
    const PHASE = {
      IDLE:'idle', RUNUP:'runup', DELIVERY:'delivery', INBOUND:'inbound',
      SWING:'swing', OUTBOUND:'outbound', RESET:'reset'
    };
    let phase = PHASE.IDLE;
    let phaseStart = performance.now();
    let outcome = null;
    let customOutcome = null;
    let chasingFielder = null;

    const DUR = {
      idle: 1500, runup: 1800, delivery: 200, inbound: 2000,
      swing: 500, outbound: 4000, reset: 1500
    };

    function setPhase(p){
      phase = p;
      phaseStart = performance.now();
      console.log('[cricket] → ' + p);
    }

    const strikerBat = accessories['Striker'] && accessories['Striker'].bat;
    const batRest = strikerBat ? {
      x: strikerBat.rotation.x, y: strikerBat.rotation.y, z: strikerBat.rotation.z
    } : null;

    function animateSwing(p){
      if (!strikerBat || !batRest) return;
      if (p < 0.4){
        strikerBat.rotation.x = batRest.x + (p / 0.4) * 0.5;
      } else if (p < 0.7){
        strikerBat.rotation.x = batRest.x + 0.5 - ((p - 0.4) / 0.3) * 1.5;
      } else {
        strikerBat.rotation.x = batRest.x - 1.0 + ((p - 0.7) / 0.3) * 0.5;
      }
    }

    function launchDelivery(){
      const bowler = players['Bowler'];
      const releasePos = new THREE.Vector3(0.55, fieldY + 2.0, -11);
      const t = 0.5;
      const vx = (0.3 - releasePos.x) / t;
      const vz = (6.5 - releasePos.z) / t;
      const vy = (fieldY + 0.05 - releasePos.y + 0.5 * GRAVITY * t * t) / t;
      launchBall(releasePos, new THREE.Vector3(vx, vy, vz), { x: 20, y: 0, z: 0 });
    }

    function launchHit(outcome){
      const striker = players['Striker'];
      const contact = new THREE.Vector3(striker.position.x, fieldY + 0.7, striker.position.z);
      if (outcome.wicket){
        launchBall(contact, new THREE.Vector3(0, 0.5, 10), { x: 0, y: 0, z: 0 });
        return;
      }
      if (outcome.runs === 0){
        launchBall(contact, new THREE.Vector3((Math.random()-0.5)*2, 1.5, -1), { x: 5, y: 0, z: 0 });
        return;
      }
      if (outcome.runs === 6){
        const a = Math.random() * Math.PI * 2;
        launchBall(contact, new THREE.Vector3(Math.cos(a) * 22, 14, Math.sin(a) * 22), { x: 30, y: 0, z: 0 });
        return;
      }
      if (outcome.runs === 4){
        const a = Math.random() * Math.PI * 2;
        launchBall(contact, new THREE.Vector3(Math.cos(a) * 26, 4, Math.sin(a) * 26), { x: 18, y: 0, z: 0 });
        return;
      }
      const a = Math.random() * Math.PI * 2;
      launchBall(contact, new THREE.Vector3(Math.cos(a) * 15, 4, Math.sin(a) * 15), { x: 10, y: 0, z: 0 });
    }

    function rollOutcome(){
      const r = Math.random();
      if (r < 0.30) return { runs: 0 };
      if (r < 0.55) return { runs: 1 };
      if (r < 0.63) return { runs: 2 };
      if (r < 0.67) return { runs: 3 };
      if (r < 0.85) return { runs: 4, boundary: true };
      if (r < 0.93) return { runs: 6, boundary: true };
      return { runs: 0, wicket: true };
    }

    // Fielder chase
    const FIELDER_ROLES = ['Third Man','Point','Cover','Mid-Off','Mid-On','Mid-Wicket','Square Leg','Fine Leg','Slip'];
    const fielders = FIELDER_ROLES.map(r => players[r]).filter(Boolean);

    function pickChaser(){
      let best = null, minD = Infinity;
      fielders.forEach(f => {
        const d = Math.hypot(f.position.x, f.position.z);
        const target = Math.hypot(0, 0);
        const diff = d - target;
        if (diff < minD){ minD = diff; best = f; }
      });
      chasingFielder = best;
    }

    function updateChaser(dt){
      if (!chasingFielder) return;
      const cf = chasingFielder;
      const dx = ball.pos.x - cf.position.x;
      const dz = ball.pos.z - cf.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.6){
        const sp = 8 * dt;
        cf.position.x += (dx / dist) * Math.min(sp, dist);
        cf.position.z += (dz / dist) * Math.min(sp, dist);
        cf.rotation.y = Math.atan2(dx, dz);
      } else {
        chasingFielder = null;
      }
    }

    // ═══════════════════════════════════════════════════════
    //  MASTER TICK
    // ═══════════════════════════════════════════════════════
    let last = performance.now();
    function tick(now){
      requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const elapsed = now - phaseStart;

      // Walk cycle for everyone
      Object.keys(players).forEach(r => {
        const p = players[r];
        resetRest(p);
        updateWalk(p, dt);
      });

      // Keeper anticipation
      const keeper = players['Keeper'];
      if (keeper && ball.active){
        const tx = Math.max(-1.5, Math.min(1.5, ball.pos.x * 0.35));
        keeper.position.x += (tx - keeper.position.x) * 0.10;
      } else if (keeper){
        const kHome = keeper.home;
        keeper.position.x += (kHome.x - keeper.position.x) * 0.05;
      }

      if (ball.active){
        updateBall(dt);
        if (chasingFielder) updateChaser(dt);
      }

      const bowler = players['Bowler'];
      const striker = players['Striker'];

      switch(phase){
        case PHASE.IDLE:
          if (elapsed > DUR.idle) setPhase(PHASE.RUNUP);
          break;

        case PHASE.RUNUP: {
          const p = Math.min(1, elapsed / DUR.runup);
          if (bowler){
            bowler.position.z = -24 + p * 13;
            bowler.position.y = fieldY + Math.abs(Math.sin(p * Math.PI * 8)) * 0.08;
          }
          if (p >= 1) setPhase(PHASE.DELIVERY);
          break;
        }

        case PHASE.DELIVERY: {
          const p = Math.min(1, elapsed / DUR.delivery);
          if (p >= 1){ launchDelivery(); setPhase(PHASE.INBOUND); }
          break;
        }

        case PHASE.INBOUND:
          if (!ball.active || ball.pos.z > striker.position.z + 0.5 || elapsed > DUR.inbound){
            ball.active = false;
            flightBall.visible = false;
            setPhase(PHASE.SWING);
          }
          break;

        case PHASE.SWING: {
          const p = Math.min(1, elapsed / DUR.swing);
          animateSwing(p);
          if (p >= 0.5 && !outcome){
            outcome = customOutcome || rollOutcome();
            customOutcome = null;
          }
          if (p >= 1){ launchHit(outcome); setPhase(PHASE.OUTBOUND); }
          break;
        }

        case PHASE.OUTBOUND:
          if (outcome.runs > 0 && outcome.runs < 4 && !chasingFielder){
            pickChaser();
          }
          if (!ball.active || elapsed > DUR.outbound){
            // Update scoreboard
            MatchState.balls++;
            MatchState.ballInOver++;
            MatchState.runs += outcome.runs;
            if (outcome.wicket) MatchState.wickets++;
            if (MatchState.ballInOver >= 6){
              MatchState.ballInOver = 0;
              MatchState.over++;
            }
            MatchState.lastOutcome = outcome.wicket ? 'W' : String(outcome.runs);
            console.log('[Score] ' + MatchState.runs + '/' + MatchState.wickets +
                        ' · ' + MatchState.over + '.' + MatchState.ballInOver);

            chasingFielder = null;
            setPhase(PHASE.RESET);
          }
          break;

        case PHASE.RESET:
          if (elapsed > DUR.reset){
            Object.keys(players).forEach(r => {
              const p = players[r];
              p.group.position.set(p.home.x, p.home.y, p.home.z);
              p.group.rotation.y = p.home.rotY;
            });
            ball.active = false;
            flightBall.visible = false;
            outcome = null;
            setPhase(PHASE.IDLE);
          }
          break;
      }
    }
    requestAnimationFrame(tick);

    // ═══════════════════════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════════════════════
    window.PlayerControl = {
      players,
      roles,
      resetAll: () => {
        Object.keys(players).forEach(r => {
          const p = players[r];
          p.group.position.set(p.home.x, p.home.y, p.home.z);
          p.group.rotation.y = p.home.rotY;
        });
      },
      tune: (key, value) => {
        if (STANCE[key] === undefined) return console.warn('unknown: ' + key);
        STANCE[key] = value;
        console.log('STANCE.' + key + ' = ' + value);
      }
    };

    window.StadiumAnim = {
      ball: ball,
      deliver: (runs, wicket) => {
        if (runs !== undefined) customOutcome = { runs: runs || 0, wicket: !!wicket };
        setPhase(PHASE.RUNUP);
        return true;
      },
      currentPhase: () => phase,
      resetMatch: () => { MatchState.reset(); console.log('[cricket] match reset'); }
    };

    console.log('[cricket] ✅ ready · 15 players · match loop active');
    console.log('Live tune: PlayerControl.tune("rArmForward", 0.8)');
  }
})();
