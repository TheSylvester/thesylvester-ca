(function () {
  "use strict";

  let kernel;
  let S, W, H, C, RGB, WAVES, STATS, TAU;
  let rgba, rgbFor, cssFor, wrap, delta, angleDelta, easeOut, clamp, lerp, starEaterSegments, findEnemy;
  let wx;
  let lx;
  let DPR = 1;

  function setKernel(k) {
    kernel = k;
    S = k.S;
    W = k.W;
    H = k.H;
    C = k.C;
    RGB = k.RGB;
    WAVES = k.WAVES;
    STATS = k.STATS;
    TAU = k.TAU;
    rgba = k.rgba;
    rgbFor = k.rgbFor;
    cssFor = k.cssFor;
    wrap = k.wrap;
    delta = k.delta;
    angleDelta = k.angleDelta;
    easeOut = k.easeOut;
    clamp = k.clamp;
    lerp = k.lerp;
    starEaterSegments = k.starEaterSegments;
    findEnemy = k.findEnemy;
  }

  function renderPos(o, alpha) {
    return {
      x: wrap(o.px + delta(o.px, o.x, W) * alpha, W),
      y: wrap(o.py + delta(o.py, o.y, H) * alpha, H)
    };
  }

  function wrappedRenderOffsets(pos, margin) {
    const xs = [0];
    const ys = [0];
    if (pos.x < margin) xs.push(W);
    if (pos.x > W - margin) xs.push(-W);
    if (pos.y < margin) ys.push(H);
    if (pos.y > H - margin) ys.push(-H);
    const offsets = [];
    for (let xi = 0; xi < xs.length; xi++) {
      for (let yi = 0; yi < ys.length; yi++) {
        if (xs[xi] || ys[yi]) offsets.push({ x: xs[xi], y: ys[yi] });
      }
    }
    return offsets;
  }
  function glow(ctx, x, y, radius, color, alpha) {
    if (radius <= 0 || alpha <= 0) return;
    const rgb = rgbFor(color);
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(0.2, rgba(rgb, alpha * 0.55));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function beginCanvas(ctx, shakeX, shakeY) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.translate(shakeX || 0, shakeY || 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  function drawBackground() {
    wx.setTransform(DPR, 0, 0, DPR, 0, 0);
    wx.fillStyle = C.dark;
    wx.fillRect(0, 0, W, H);
    const nebula = wx.createRadialGradient(W * 0.72, H * 0.24, 0, W * 0.72, H * 0.24, Math.max(W, H) * 0.58);
    nebula.addColorStop(0, "rgba(89,25,113,0.11)");
    nebula.addColorStop(0.45, "rgba(27,31,77,0.045)");
    nebula.addColorStop(1, "rgba(0,0,0,0)");
    wx.fillStyle = nebula;
    wx.fillRect(0, 0, W, H);

    const blueCloud = wx.createRadialGradient(W * 0.18, H * 0.78, 0, W * 0.18, H * 0.78, Math.max(W, H) * 0.42);
    blueCloud.addColorStop(0, "rgba(18,92,122,0.075)");
    blueCloud.addColorStop(0.5, "rgba(21,40,84,0.035)");
    blueCloud.addColorStop(1, "rgba(0,0,0,0)");
    wx.fillStyle = blueCloud;
    wx.fillRect(0, 0, W, H);

    // A quiet eclipsed planet supplies the large celestial scale visible in
    // Nova Drift's battlefields without competing with combat silhouettes.
    const planetR = clamp(Math.min(W, H) * 0.14, 62, 138);
    const planetX = W * 0.16;
    const planetY = H * 0.76;
    wx.save();
    wx.translate(planetX, planetY);
    wx.rotate(-0.24);
    wx.strokeStyle = "rgba(102,214,240,0.10)";
    wx.lineWidth = 4;
    wx.beginPath();
    wx.ellipse(0, 0, planetR * 1.72, planetR * 0.24, 0, 0, TAU);
    wx.stroke();
    wx.restore();
    wx.save();
    wx.translate(planetX, planetY);
    const planet = wx.createRadialGradient(-planetR * 0.42, -planetR * 0.48, planetR * 0.04, 0, 0, planetR);
    planet.addColorStop(0, "rgba(70,58,105,0.44)");
    planet.addColorStop(0.38, "rgba(19,20,43,0.96)");
    planet.addColorStop(1, "rgba(2,3,10,0.995)");
    wx.fillStyle = planet;
    wx.beginPath();
    wx.arc(0, 0, planetR, 0, TAU);
    wx.fill();
    wx.strokeStyle = "rgba(235,93,196,0.16)";
    wx.lineWidth = 1.2;
    wx.stroke();
    wx.rotate(-0.24);
    wx.strokeStyle = "rgba(190,103,221,0.11)";
    wx.lineWidth = 1.5;
    wx.beginPath();
    wx.ellipse(0, 0, planetR * 1.72, planetR * 0.24, 0, 0.08, Math.PI - 0.08);
    wx.stroke();
    wx.restore();

    wx.save();
    wx.globalAlpha = 0.075;
    wx.strokeStyle = "#7280aa";
    wx.lineWidth = 0.55;
    const grid = 96;
    const ox = (S.time * -2.2) % grid;
    const oy = (S.time * 1.25) % grid;
    wx.beginPath();
    for (let x = ox; x < W; x += grid) { wx.moveTo(x, 0); wx.lineTo(x, H); }
    for (let y = oy; y < H; y += grid) { wx.moveTo(0, y); wx.lineTo(W, y); }
    wx.stroke();
    wx.restore();
    for (let i = 0; i < S.stars.length; i++) {
      const st = S.stars[i];
      const twinkle = 0.32 + (Math.sin(S.time * st.speed + st.phase) * 0.5 + 0.5) * 0.55;
      wx.fillStyle = rgba(rgbFor(st.tint), twinkle);
      wx.fillRect(st.x * W, st.y * H, st.size, st.size);
    }
    const def = WAVES[S.wave];
    if (def && def.omen && S.wave < WAVES.length - 1) drawStarEaterOmen(wx, def.omen);
  }

  function drawStarEaterOmen(ctx, intensity) {
    const x = W * 0.82;
    const y = H * 0.34;
    const pulse = 0.82 + Math.sin(S.time * 1.3) * 0.18;
    ctx.save();
    ctx.globalAlpha = intensity;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.min(W, H) * 0.2);
    g.addColorStop(0, rgba(RGB.ink, 0.52 * pulse));
    g.addColorStop(0.06, rgba(RGB.red, 0.55 * pulse));
    g.addColorStop(0.3, rgba(RGB.red, 0.13));
    g.addColorStop(1, rgba(RGB.red, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - H * 0.24, y - H * 0.24, H * 0.48, H * 0.48);
    ctx.strokeStyle = rgba(RGB.red, 0.12 + intensity * 0.16);
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const sx = x - 72 - i * 66;
      const sy = y + 26 + Math.sin(S.time * 0.46 + i * 0.9) * 18;
      ctx.beginPath();
      ctx.ellipse(sx, sy, 48, 20, -0.28 + Math.sin(S.time * 0.2 + i) * 0.08, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPortal(ctx, entry, alpha, glowPass) {
    if (entry.age < 0) return;
    const t = clamp(entry.age / entry.duration, 0, 1);
    const fade = entry.spawned ? clamp(1 - (entry.age - entry.duration) / 0.62, 0, 1) : 1;
    const pos = renderPos(entry, alpha);
    const color = STATS[entry.type].color;
    const bossScale = STATS[entry.type].boss ? 1.9 : 1;
    if (entry.kind === "edge") return;
    if (glowPass) {
      glow(ctx, pos.x, pos.y, (34 + Math.sin(t * Math.PI) * 18) * bossScale, color, 0.24 * fade);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(entry.spin);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = cssFor(color);
    ctx.lineWidth = 1.2;
    if (entry.kind === "depth") {
      const r = lerp(2, 31 * bossScale, easeOut(t));
      ctx.globalAlpha *= 0.8;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 1.5, 0); ctx.lineTo(r * 1.5, 0);
      ctx.moveTo(0, -r * 1.5); ctx.lineTo(0, r * 1.5);
      ctx.stroke();
    } else {
      const petals = 8;
      const r = 9 + Math.sin(t * Math.PI) * 22;
      for (let i = 0; i < petals; i++) {
        ctx.rotate(TAU / petals);
        ctx.beginPath();
        ctx.moveTo(r * 0.28, 0);
        ctx.quadraticCurveTo(r * 0.76, -r * 0.24, r, 0);
        ctx.quadraticCurveTo(r * 0.76, r * 0.24, r * 0.28, 0);
        ctx.stroke();
      }
      ctx.rotate(-entry.spin * 1.7);
      ctx.strokeStyle = C.ink;
      ctx.globalAlpha *= 0.55;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(ctx, e, alpha, glowPass, copyPass) {
    const pos = renderPos(e, alpha);
    const st = STATS[e.type];
    const scale = e.emerge > 0 ? 0.08 + easeOut(1 - e.emerge / e.emergeMax) * 0.92 : 1;
    const ang = lerpAngle(e.pangle, e.angle, alpha);
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(pos, Math.max(34, st.r * (st.boss ? 4 : 2.4)));
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawEnemy(ctx, e, alpha, glowPass, true);
        ctx.restore();
      }
    }
    if (e.type === "starEater") drawStarEaterSegments(ctx, e, pos, ang, lerp(e.pphase == null ? e.phase : e.pphase, e.phase, alpha), glowPass, scale);
    if (e.type === "cherub") drawSupportLink(ctx, e, pos, glowPass);
    if (e.type === "constructor") drawConstructorGrid(ctx, e, pos, glowPass);
    if (glowPass) {
      const active = e.state === "charge" || e.state === "telegraph" || e.state === "dash" || e.state === "open" ||
        e.state === "retaliate" || e.state === "orbCharge" || e.state === "lanceCharge" || e.state === "lasers" ||
        e.state === "beam" || e.state === "beamTell" || e.state === "lungeTell" || e.lance > 0;
      glow(ctx, pos.x, pos.y, (st.r * 2.1 + (active ? 12 : 0)) * scale, st.color, active ? 0.27 : 0.12);
      if (e.type === "hive") glow(ctx, pos.x, pos.y, 48 * scale, "violet", 0.12);
      if (st.boss) glow(ctx, pos.x, pos.y, st.r * 3.1 * scale, st.color, 0.16);
      if (!copyPass && e.type === "swarmling" && e.lance > 0) drawWrappedEffect(ctx, e, pos, drawLanceGlow);
      if (!copyPass && e.type === "stationOmega" && e.state === "lasers") drawWrappedEffect(ctx, e, pos, drawStationLasersGlow);
      if (!copyPass && e.type === "starEater" && (e.state === "beam" || e.state === "beamTell")) drawWrappedEffect(ctx, e, pos, drawStarBeamGlow);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(ang);
    ctx.scale(scale, scale);
    ctx.globalAlpha = e.emerge > 0 ? 0.42 + 0.58 * easeOut(1 - e.emerge / e.emergeMax) : 1;
    ctx.strokeStyle = e.hit > 0 ? C.ink : cssFor(st.color);
    ctx.fillStyle = "rgba(7,9,20,0.88)";
    ctx.lineWidth = e.hit > 0 ? 2.2 : 1.45;
    if (e.type === "swarmling") pathSwarmling(ctx, e);
    else if (e.type === "warden") pathWarden(ctx, e);
    else if (e.type === "interceptor") pathInterceptor(ctx, e);
    else if (e.type === "hammerhead") pathHammerhead(ctx, e);
    else if (e.type === "hive") pathHive(ctx, e);
    else if (e.type === "drone") pathDrone(ctx, e);
    else if (e.type === "tracer") pathTracer(ctx, e);
    else if (e.type === "minelayer") pathMinelayer(ctx, e);
    else if (e.type === "myrmidon") pathMyrmidon(ctx, e);
    else if (e.type === "snapper") pathSnapper(ctx, e);
    else if (e.type === "bulwark") pathBulwark(ctx, e);
    else if (e.type === "cherub") pathCherub(ctx, e);
    else if (e.type === "constructor") pathConstructor(ctx, e);
    else if (e.type === "turret") pathTurret(ctx, e);
    else if (e.type === "vanguard") pathVanguard(ctx, e);
    else if (e.type === "pulsar") pathPulsar(ctx, e);
    else if (e.type === "omegaDefender") pathOmegaDefender(ctx, e);
    else if (e.type === "spitfire") pathSpitfire(ctx, e);
    else if (e.type === "stationOmega") pathStationOmega(ctx, e);
    else if (e.type === "starEater") pathStarEater(ctx, e);
    ctx.restore();
    if (!copyPass && e.emerge <= e.emergeMax * 0.25) {
      if (e.type === "swarmling" && e.lance > 0) drawWrappedEffect(ctx, e, pos, drawLance);
      if (e.type === "warden" && e.state === "charge") drawWrappedEffect(ctx, e, pos, drawWardenTelegraph);
      if (e.type === "hammerhead" && e.state === "telegraph") drawWrappedEffect(ctx, e, pos, drawHammerLane);
      if (e.type === "snapper" && e.state === "open") drawWrappedEffect(ctx, e, pos, drawSnapperLane);
      if (e.type === "bulwark" && e.state === "retaliate") drawWrappedEffect(ctx, e, pos, drawBulwarkCone);
      if (e.type === "spitfire" && (e.state === "orbCharge" || e.state === "lanceCharge")) drawWrappedEffect(ctx, e, pos, drawSpitfireTelegraph);
      if (e.type === "stationOmega" && e.state === "lasers") drawWrappedEffect(ctx, e, pos, drawStationLasers);
      if (e.type === "starEater" && (e.state === "beam" || e.state === "beamTell" || e.state === "lungeTell")) drawWrappedEffect(ctx, e, pos, drawStarTelegraph);
    }
    if (e.shield > 0 || e.shieldPulse > 0) drawEnemyShield(ctx, e, pos);
  }

  function drawStarEaterSegments(ctx, e, basePos, baseAngle, renderPhase, glowPass, scale) {
    const segments = starEaterSegments(e, basePos, baseAngle, renderPhase);
    for (let i = segments.length - 1; i >= 0; i--) {
      const s = segments[i];
      if (glowPass) {
        glow(ctx, s.x, s.y, 92 * scale, "red", 0.12 + (e.enraged ? 0.07 : 0));
        continue;
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.scale(scale, scale);
      ctx.fillStyle = "rgba(12,5,13,0.9)";
      ctx.strokeStyle = e.enraged ? C.ink : C.red;
      ctx.lineWidth = e.enraged ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 49 - i * 3, 31 - i * 2, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = rgba(RGB.red, 0.68);
      ctx.beginPath(); ctx.arc(-4, 0, 19, -1.2, 1.2); ctx.stroke();
      for (let n = -1; n <= 1; n += 2) {
        ctx.beginPath(); ctx.moveTo(8, n * 24); ctx.lineTo(-10, n * 34); ctx.lineTo(-21, n * 22); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawWrappedEffect(ctx, entity, pos, drawEffect) {
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        drawEffect(ctx, entity, { x: pos.x + ix * W, y: pos.y + iy * H });
      }
    }
  }

  function lerpAngle(a, b, t) { return a + angleDelta(a, b) * t; }

  function pathSwarmling(ctx, e) {
    const pulse = 1 + Math.sin(S.time * 8 + e.phase) * 0.08;
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(11, 0); ctx.lineTo(2, -5); ctx.lineTo(-7, -9); ctx.lineTo(-5, -2);
    ctx.lineTo(-10, 0); ctx.lineTo(-5, 2); ctx.lineTo(-7, 9); ctx.lineTo(2, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.globalAlpha *= 0.88;
    ctx.beginPath(); ctx.arc(2, 0, 2.2, 0, TAU); ctx.fill();
  }

  function pathWarden(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(8, -10); ctx.lineTo(-6, -14); ctx.lineTo(-14, -7);
    ctx.lineTo(-10, 0); ctx.lineTo(-14, 7); ctx.lineTo(-6, 14); ctx.lineTo(8, 10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(-1, 0); ctx.lineTo(-4, 10); ctx.stroke();
    const charge = e.state === "charge" ? 1 - e.timer / 1.12 : 0;
    ctx.fillStyle = charge > 0 ? rgba(RGB.red, 0.45 + charge * 0.55) : rgba(RGB.red, 0.45);
    ctx.beginPath(); ctx.arc(6, 0, 3 + charge * 2.5, 0, TAU); ctx.fill();
  }

  function pathInterceptor(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(3, -5); ctx.lineTo(-7, -14); ctx.lineTo(-5, -4);
    ctx.lineTo(-14, 0); ctx.lineTo(-5, 4); ctx.lineTo(-7, 14); ctx.lineTo(3, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.magenta;
    ctx.beginPath(); ctx.arc(-5, -10, 1.7, 0, TAU); ctx.arc(-5, 10, 1.7, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(RGB.ink, 0.7);
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(9, 0); ctx.stroke();
  }

  function pathHammerhead(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(18, -14); ctx.lineTo(18, 14); ctx.lineTo(9, 11); ctx.lineTo(3, 6);
    ctx.lineTo(-16, 6); ctx.lineTo(-10, 0); ctx.lineTo(-16, -6); ctx.lineTo(3, -6); ctx.lineTo(9, -11); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha *= 0.75;
    ctx.beginPath(); ctx.moveTo(12, -10); ctx.lineTo(12, 10); ctx.stroke();
    if (e.state === "dash") {
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.moveTo(-15, -4); ctx.lineTo(-25, 0); ctx.lineTo(-15, 4); ctx.fill();
    }
  }

  function pathHive(ctx, e) {
    const pulse = 1 + Math.sin(S.time * 2.7 + e.phase) * 0.055;
    ctx.scale(pulse, pulse);
    polygon(ctx, 6, 25, Math.PI / 6);
    ctx.fill(); ctx.stroke();
    ctx.save();
    ctx.rotate(-e.angle * 1.9 + S.time * 0.32);
    ctx.strokeStyle = rgba(RGB.ink, 0.68);
    polygon(ctx, 6, 16, 0); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      ctx.rotate(TAU / 6);
      ctx.fillStyle = C.violet;
      ctx.beginPath(); ctx.arc(19, 0, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = rgba(RGB.violet, 0.7);
    ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
  }

  function pathDrone(ctx) {
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(-5, -6); ctx.lineTo(-2, 0); ctx.lineTo(-5, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  function pathTracer(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(2, -5); ctx.lineTo(-8, -15); ctx.lineTo(-5, -4);
    ctx.lineTo(-16, 0); ctx.lineTo(-5, 4); ctx.lineTo(-8, 15); ctx.lineTo(2, 5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.green;
    ctx.beginPath(); ctx.moveTo(-9, -10); ctx.lineTo(3, -3); ctx.moveTo(-9, 10); ctx.lineTo(3, 3); ctx.stroke();
    ctx.fillStyle = e.state === "combo" ? C.ink : C.green;
    ctx.beginPath(); ctx.arc(6, 0, e.state === "combo" ? 3.4 : 2.2, 0, TAU); ctx.fill();
  }

  function pathMinelayer(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(20, -11); ctx.lineTo(12, -17); ctx.lineTo(-13, -12); ctx.lineTo(-20, 0);
    ctx.lineTo(-13, 12); ctx.lineTo(12, 17); ctx.lineTo(20, 11); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(7, 0, 20, -0.82, 0.82); ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.arc(-12, -8, 2.3, 0, TAU); ctx.arc(-12, 8, 2.3, 0, TAU); ctx.fill();
  }

  function pathMyrmidon(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(10, -13); ctx.lineTo(-5, -17); ctx.lineTo(-19, -8);
    ctx.lineTo(-14, 0); ctx.lineTo(-19, 8); ctx.lineTo(-5, 17); ctx.lineTo(10, 13); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.blue;
    ctx.beginPath(); ctx.arc(2, 0, 11, -1.1, 1.1); ctx.stroke();
    ctx.fillStyle = C.blue;
    ctx.beginPath(); ctx.arc(8, 0, 4, 0, TAU); ctx.fill();
  }

  function pathSnapper(ctx, e) {
    const open = e.state === "open" ? 7 + (1 - e.timer / 0.95) * 7 : e.state === "lunge" ? 2 : 5;
    ctx.beginPath();
    ctx.moveTo(22, -open); ctx.lineTo(5, -17); ctx.lineTo(-18, -10); ctx.lineTo(-10, 0);
    ctx.lineTo(-18, 10); ctx.lineTo(5, 17); ctx.lineTo(22, open);
    ctx.lineTo(8, 2); ctx.lineTo(8, -2); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.magenta;
    ctx.beginPath(); ctx.moveTo(20, -open); ctx.lineTo(4, -2); ctx.moveTo(20, open); ctx.lineTo(4, 2); ctx.stroke();
    if (e.vulnerable) {
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(7, 0, 4.2 + Math.sin(S.time * 12) * 0.8, 0, TAU); ctx.fill();
    }
  }

  function pathBulwark(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(23, -18); ctx.lineTo(6, -22); ctx.lineTo(-18, -13); ctx.lineTo(-24, 0);
    ctx.lineTo(-18, 13); ctx.lineTo(6, 22); ctx.lineTo(23, 18); ctx.lineTo(14, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const heat = clamp(e.shieldHeat / 24, 0, 1);
    ctx.strokeStyle = heat > 0.72 ? C.ink : heat > 0.34 ? C.orange : C.cyan;
    ctx.lineWidth = 2.4 + heat * 2;
    ctx.beginPath(); ctx.arc(3, 0, 31, -0.96, 0.96); ctx.stroke();
    ctx.fillStyle = rgba(RGB.orange, 0.45 + heat * 0.45);
    ctx.beginPath(); ctx.arc(5, 0, 4 + heat * 2, 0, TAU); ctx.fill();
  }

  function pathCherub(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(13, 0); ctx.lineTo(2, -7); ctx.lineTo(-8, -13); ctx.lineTo(-5, -4);
    ctx.lineTo(-13, 0); ctx.lineTo(-5, 4); ctx.lineTo(-8, 13); ctx.lineTo(2, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.green;
    ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(S.time * 4 + e.phase), 0, TAU); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(1, 0, 2.5, 0, TAU); ctx.fill();
  }

  function pathConstructor(ctx, e) {
    polygon(ctx, 8, 22, Math.PI / 8); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.violet;
    ctx.beginPath(); ctx.arc(0, 0, 13, S.time * 0.4, S.time * 0.4 + Math.PI * 1.45); ctx.stroke();
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath(); ctx.moveTo(-2, i * 10); ctx.lineTo(14, i * 16); ctx.stroke();
    }
    ctx.fillStyle = C.violet;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  }

  function pathTurret(ctx, e) {
    polygon(ctx, 6, 9, Math.PI / 6); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(15, 0); ctx.stroke();
    ctx.fillStyle = C.violet;
    ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fill();
  }

  function pathVanguard(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(22, 0); ctx.lineTo(4, -7); ctx.lineTo(-4, -20); ctx.lineTo(-8, -8);
    ctx.lineTo(-20, -4); ctx.lineTo(-10, 0); ctx.lineTo(-20, 4); ctx.lineTo(-8, 8);
    ctx.lineTo(-4, 20); ctx.lineTo(4, 7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.arc(-4, -15, 2, 0, TAU); ctx.arc(-4, 15, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(14, 0); ctx.stroke();
  }

  function pathPulsar(ctx, e) {
    ctx.save(); ctx.rotate(S.time * 1.7 + e.phase);
    for (let i = 0; i < 5; i++) {
      ctx.rotate(TAU / 5);
      ctx.beginPath(); ctx.moveTo(3, -3); ctx.lineTo(12, 0); ctx.lineTo(3, 3); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = C.gold;
    ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill();
  }

  function pathOmegaDefender(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(1, -9); ctx.lineTo(-11, -5); ctx.lineTo(-6, 0);
    ctx.lineTo(-11, 5); ctx.lineTo(1, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.cyan;
    ctx.beginPath(); ctx.arc(0, 0, 6, -1.2, 1.2); ctx.stroke();
  }

  function pathSpitfire(ctx, e) {
    ctx.beginPath();
    ctx.moveTo(37, 0); ctx.lineTo(12, -9); ctx.lineTo(-5, -31); ctx.lineTo(-13, -13);
    ctx.lineTo(-34, -18); ctx.lineTo(-22, 0); ctx.lineTo(-34, 18); ctx.lineTo(-13, 13);
    ctx.lineTo(-5, 31); ctx.lineTo(12, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.orange;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8, -25); ctx.lineTo(15, -7); ctx.moveTo(-8, 25); ctx.lineTo(15, 7); ctx.stroke();
    const charge = e.state === "orbCharge" ? 1 - e.timer / 1.35 : e.state === "lanceCharge" ? 1 - e.timer / 1.4 : 0;
    ctx.fillStyle = charge > 0 ? C.ink : C.orange;
    ctx.beginPath(); ctx.arc(16, 0, 4 + charge * 5, 0, TAU); ctx.fill();
  }

  function pathStationOmega(ctx, e) {
    polygon(ctx, 10, 60, Math.PI / 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(RGB.cyan, 0.72);
    ctx.lineWidth = 1.2;
    polygon(ctx, 5, 43, -Math.PI * 0.5); ctx.stroke();
    ctx.save();
    ctx.rotate(-e.angle * 1.35 + S.time * 0.17);
    polygon(ctx, 10, 27, 0); ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5;
      const alive = i >= (e.brokenNodes || 0);
      ctx.fillStyle = alive ? (e.weakPulse > 0 ? C.ink : C.cyan) : rgba(RGB.cyan, 0.12);
      ctx.beginPath(); ctx.arc(Math.cos(a) * 31, Math.sin(a) * 31, alive ? 5.2 : 3.2, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = C.ink;
    ctx.beginPath(); ctx.arc(0, 0, 8 + Math.sin(S.time * 3) * 1.2, 0, TAU); ctx.fill();
  }

  function pathStarEater(ctx, e) {
    const jaw = e.state === "beamTell" || e.state === "beam" || e.state === "burst" ? 18 : 11;
    ctx.beginPath();
    ctx.moveTo(66, -jaw); ctx.lineTo(34, -38); ctx.lineTo(-6, -47); ctx.lineTo(-45, -28);
    ctx.lineTo(-61, 0); ctx.lineTo(-45, 28); ctx.lineTo(-6, 47); ctx.lineTo(34, 38); ctx.lineTo(66, jaw);
    ctx.lineTo(29, 5); ctx.lineTo(29, -5); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = e.enraged ? C.ink : C.red;
    ctx.lineWidth = e.enraged ? 2.5 : 1.7;
    ctx.beginPath(); ctx.moveTo(63, -jaw); ctx.lineTo(24, -5); ctx.moveTo(63, jaw); ctx.lineTo(24, 5); ctx.stroke();
    ctx.fillStyle = e.enraged ? C.ink : C.red;
    ctx.beginPath(); ctx.arc(24, 0, 7 + Math.sin(S.time * 5) * 1.5, 0, TAU); ctx.fill();
    for (let i = -1; i <= 1; i += 2) {
      ctx.beginPath(); ctx.moveTo(-18, i * 35); ctx.lineTo(-35, i * 53); ctx.lineTo(-43, i * 30); ctx.stroke();
    }
  }

  function drawSupportLink(ctx, e, pos, glowPass) {
    const target = findEnemy(e.supportTarget);
    if (!target) return;
    const tx = pos.x + delta(e.x, target.x, W);
    const ty = pos.y + delta(e.y, target.y, H);
    ctx.save();
    ctx.strokeStyle = rgba(RGB.green, glowPass ? 0.12 : 0.36);
    ctx.lineWidth = glowPass ? 8 : 1;
    ctx.setLineDash(glowPass ? [] : [4, 7]);
    ctx.lineDashOffset = -S.time * 18;
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function drawConstructorGrid(ctx, e, pos, glowPass) {
    const children = [];
    for (let i = 0; i < S.enemies.length; i++) if (!S.enemies[i].dead && S.enemies[i].parent === e.id && S.enemies[i].type === "turret") children.push(S.enemies[i]);
    if (!children.length) return;
    ctx.save();
    ctx.strokeStyle = rgba(RGB.violet, glowPass ? 0.12 : 0.3);
    ctx.lineWidth = glowPass ? 7 : 1;
    for (let i = 0; i < children.length; i++) {
      const tx = pos.x + delta(e.x, children[i].x, W);
      const ty = pos.y + delta(e.y, children[i].y, H);
      ctx.beginPath(); ctx.moveTo(pos.x, pos.y); ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemyShield(ctx, e, pos) {
    ctx.save();
    ctx.strokeStyle = rgba(rgbFor(STATS[e.type].color), 0.25 + Math.min(0.35, e.shield * 0.04));
    ctx.lineWidth = e.shieldPulse > 0 ? 2.2 : 1;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, e.r + 7 + Math.sin(S.time * 5 + e.id) * 1.5, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function polygon(ctx, sides, radius, offset) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = offset + i * TAU / sides;
      const x = Math.cos(a) * radius;
      const y = Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawLance(ctx, e, pos) {
    const elapsed = 0.44 - e.lance;
    const hot = elapsed > 0.21 && elapsed < 0.35;
    const opacity = hot ? 0.92 : elapsed < 0.21 ? 0.16 + elapsed / 0.21 * 0.28 : clamp(e.lance / 0.09, 0, 1);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.lanceAngle);
    ctx.strokeStyle = hot ? C.ink : C.cyan;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = hot ? 2.4 : 0.8;
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(hot ? 132 : 116, 0); ctx.stroke();
    if (hot) {
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(15, -3); ctx.lineTo(126, -1); ctx.moveTo(15, 3); ctx.lineTo(126, 1); ctx.stroke();
    }
    ctx.restore();
  }

  function drawLanceGlow(ctx, e, pos) {
    const elapsed = 0.44 - e.lance;
    if (elapsed < 0.18 || elapsed > 0.38) return;
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.lanceAngle);
    const g = ctx.createLinearGradient(8, 0, 132, 0);
    g.addColorStop(0, rgba(RGB.cyan, 0.05));
    g.addColorStop(0.65, rgba(RGB.cyan, 0.24));
    g.addColorStop(1, rgba(RGB.cyan, 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(132, 0); ctx.stroke();
    ctx.restore();
  }

  function drawWardenTelegraph(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 1.12, 0, 1);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.chargeAngle);
    ctx.globalAlpha = 0.18 + charge * 0.46;
    ctx.strokeStyle = C.red;
    ctx.setLineDash([3, 8]);
    ctx.lineDashOffset = -S.time * 25;
    ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(210, 0); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawHammerLane(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 0.92, 0, 1);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(e.dashAngle);
    ctx.globalAlpha = 0.22 + charge * 0.52;
    ctx.strokeStyle = charge > 0.72 ? C.gold : C.orange;
    ctx.lineWidth = 1;
    ctx.setLineDash([18, 11]);
    ctx.lineDashOffset = -S.time * 55;
    ctx.beginPath();
    ctx.moveTo(20, -9); ctx.lineTo(Math.min(460, Math.max(W, H) * 0.48), -9);
    ctx.moveTo(20, 9); ctx.lineTo(Math.min(460, Math.max(W, H) * 0.48), 9);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawSnapperLane(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 0.95, 0, 1);
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.dashAngle);
    ctx.globalAlpha = 0.18 + charge * 0.5;
    ctx.strokeStyle = charge > 0.72 ? C.ink : C.magenta;
    ctx.lineWidth = 1;
    ctx.setLineDash([9, 12]); ctx.lineDashOffset = -S.time * 40;
    ctx.beginPath();
    ctx.moveTo(22, -12); ctx.lineTo(430, -12);
    ctx.moveTo(22, 12); ctx.lineTo(430, 12); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function drawBulwarkCone(ctx, e, pos) {
    const charge = clamp(1 - e.timer / 0.82, 0, 1);
    const heat = clamp(e.shieldHeat / 24, 0.15, 1);
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.angle);
    ctx.globalAlpha = 0.18 + charge * 0.48;
    ctx.strokeStyle = heat > 0.72 ? C.ink : C.orange;
    ctx.fillStyle = rgba(RGB.orange, 0.025 + charge * 0.04);
    ctx.beginPath(); ctx.moveTo(24, 0); ctx.arc(0, 0, 260, -0.62, 0.62); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawSpitfireTelegraph(ctx, e, pos) {
    ctx.save(); ctx.translate(pos.x, pos.y);
    if (e.state === "orbCharge") {
      const charge = clamp(1 - e.timer / 1.35, 0, 1);
      const x = Math.cos(e.chargeAngle) * 46;
      const y = Math.sin(e.chargeAngle) * 46;
      ctx.strokeStyle = rgba(RGB.orange, 0.3 + charge * 0.55);
      ctx.lineWidth = 1 + charge * 1.5;
      ctx.beginPath(); ctx.arc(x, y, 7 + charge * 13, S.time * 2, S.time * 2 + Math.PI * 1.6); ctx.stroke();
    } else {
      const charge = clamp(1 - e.timer / 1.4, 0, 1);
      ctx.rotate(e.chargeAngle);
      ctx.strokeStyle = charge > 0.72 ? C.ink : C.gold;
      ctx.globalAlpha = 0.22 + charge * 0.55;
      ctx.setLineDash([22, 12]); ctx.lineDashOffset = -S.time * 65;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(38, -7); ctx.lineTo(680, -7); ctx.moveTo(38, 7); ctx.lineTo(680, 7); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawStationLasers(ctx, e, pos) {
    const length = Math.max(W, H) * 1.15;
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.angle);
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(length, 0); ctx.stroke();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(i * TAU / 5);
      ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(length * 0.68, 0); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function drawStationLasersGlow(ctx, e, pos) {
    const length = Math.max(W, H) * 1.15;
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.angle);
    ctx.strokeStyle = rgba(RGB.cyan, 0.18); ctx.lineWidth = 18;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(length, 0); ctx.stroke();
    ctx.lineWidth = 10;
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(i * TAU / 5);
      ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(length * 0.68, 0); ctx.stroke(); ctx.restore();
    }
    ctx.restore();
  }

  function drawStarTelegraph(ctx, e, pos) {
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.dashAngle || e.angle);
    const active = e.state === "beam";
    const lunge = e.state === "lungeTell";
    ctx.globalAlpha = active ? 0.92 : 0.28 + Math.sin(S.time * 10) * 0.08;
    ctx.strokeStyle = active ? C.ink : C.red;
    ctx.lineWidth = active ? 5 : 1.2;
    if (lunge) {
      ctx.setLineDash([24, 15]); ctx.lineDashOffset = -S.time * 70;
      ctx.beginPath(); ctx.moveTo(58, -31); ctx.lineTo(Math.max(W, H), -31); ctx.moveTo(58, 31); ctx.lineTo(Math.max(W, H), 31); ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath(); ctx.moveTo(54, 0); ctx.lineTo(Math.max(W, H) * 1.2, 0); ctx.stroke();
      if (active) {
        ctx.strokeStyle = C.red; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(54, -12); ctx.lineTo(Math.max(W, H), -4); ctx.moveTo(54, 12); ctx.lineTo(Math.max(W, H), 4); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawStarBeamGlow(ctx, e, pos) {
    ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(e.dashAngle || e.angle);
    const active = e.state === "beam";
    ctx.strokeStyle = rgba(RGB.red, active ? 0.25 : 0.09);
    ctx.lineWidth = active ? 34 : 13;
    ctx.beginPath(); ctx.moveTo(48, 0); ctx.lineTo(Math.max(W, H) * 1.2, 0); ctx.stroke();
    ctx.restore();
  }

  function drawBullet(ctx, b, alpha, glowPass, copyPass) {
    const p = renderPos(b, alpha);
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(p, Math.max(24, b.r * 3));
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawBullet(ctx, b, alpha, glowPass, true);
        ctx.restore();
      }
    }
    const prevX = p.x - delta(b.px, b.x, W) * 1.8;
    const prevY = p.y - delta(b.py, b.y, H) * 1.8;
    if (glowPass) {
      const radius = b.team === "player" ? 10 : Math.max(13, b.r * 2.6);
      glow(ctx, p.x, p.y, radius, b.color, b.r >= 9 ? 0.36 : 0.22);
      ctx.strokeStyle = rgba(rgbFor(b.color), b.team === "player" ? 0.22 : 0.14);
      ctx.lineWidth = b.kind === "kineticLance" ? 13 : b.r >= 9 ? 7 : 3;
      ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(p.x, p.y); ctx.stroke();
      return;
    }
    ctx.strokeStyle = cssFor(b.color);
    ctx.fillStyle = b.r >= 9 ? "rgba(8,8,18,0.88)" : cssFor(b.color);
    ctx.lineWidth = b.r >= 9 ? 2 : 1.25;
    if (b.kind !== "mine") { ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(p.x, p.y); ctx.stroke(); }
    if (b.kind === "heavy") {
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(p.x, p.y, b.r + 4, S.time, S.time + Math.PI * 1.3); ctx.stroke();
    } else if (b.kind === "mine") {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(S.time * 0.7 + b.id);
      polygon(ctx, 8, b.r, Math.PI / 8); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = b.armed > 0 ? rgba(RGB.gold, 0.35) : C.ink;
      ctx.lineWidth = b.armed > 0 ? 1 : 1.7;
      ctx.beginPath(); ctx.arc(0, 0, b.r + 6 + Math.sin(S.time * 7 + b.id) * 2, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (b.kind === "plasma" || b.kind === "spitOrb" || b.kind === "omegaSphere" || b.kind === "splitter" || b.kind === "vortex") {
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r * 0.52, -S.time * 2 + b.id, -S.time * 2 + b.id + Math.PI * 1.35); ctx.stroke();
      ctx.strokeStyle = cssFor(b.color);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r + 4, S.time * 1.6, S.time * 1.6 + Math.PI); ctx.stroke();
    } else if (b.kind === "kineticLance" || b.kind === "rocket") {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
      ctx.fillStyle = b.kind === "kineticLance" ? C.ink : cssFor(b.color);
      ctx.beginPath(); ctx.moveTo(b.r * 1.6, 0); ctx.lineTo(-b.r, -b.r * 0.48); ctx.lineTo(-b.r * 0.5, 0); ctx.lineTo(-b.r, b.r * 0.48); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else if (b.kind === "asteroid") {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(S.time * 0.8 + b.id);
      polygon(ctx, 7, b.r, b.id * 0.17); ctx.fill(); ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = cssFor(b.color);
      ctx.beginPath(); ctx.arc(p.x, p.y, b.r, 0, TAU); ctx.fill();
    }
  }

  function drawPlayer(ctx, alpha, glowPass, copyPass) {
    const p = S.player;
    const pos = renderPos(p, alpha);
    const angle = lerpAngle(p.pangle, p.angle, alpha);
    if (!p.alive) return;
    if (!copyPass) {
      const offsets = wrappedRenderOffsets(pos, 34);
      for (let i = 0; i < offsets.length; i++) {
        ctx.save(); ctx.translate(offsets[i].x, offsets[i].y);
        drawPlayer(ctx, alpha, glowPass, true);
        ctx.restore();
      }
    }
    if (glowPass) {
      glow(ctx, pos.x, pos.y, 29, p.flash > 0 ? "red" : "cyan", p.flash > 0 ? 0.32 : 0.16);
      const bx = pos.x - Math.cos(p.thrustAngle) * 11;
      const by = pos.y - Math.sin(p.thrustAngle) * 11;
      glow(ctx, bx, by, 19, "cyan", 0.2);
      return;
    }
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(angle);
    if (p.invuln > 0 && Math.floor(S.time * 18) % 2) ctx.globalAlpha = 0.5;
    ctx.fillStyle = "rgba(9,12,25,0.92)";
    ctx.strokeStyle = p.flash > 0 ? C.red : C.ink;
    ctx.lineWidth = 1.65;
    ctx.beginPath();
    ctx.moveTo(17, 0); ctx.lineTo(-8, -9); ctx.lineTo(-3, -3); ctx.lineTo(-13, 0);
    ctx.lineTo(-3, 3); ctx.lineTo(-8, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-4, -4); ctx.moveTo(7, 0); ctx.lineTo(-4, 4); ctx.stroke();
    ctx.fillStyle = C.cyan;
    ctx.beginPath(); ctx.arc(2, 0, 1.9, 0, TAU); ctx.fill();
    ctx.restore();
    if (p.invuln > 0) {
      ctx.save();
      ctx.strokeStyle = rgba(RGB.cyan, 0.18 + 0.2 * (Math.sin(S.time * 9) * 0.5 + 0.5));
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, 16 + Math.sin(S.time * 6) * 1.5, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles(ctx, alpha, glowPass) {
    for (let i = 0; i < S.particles.length; i++) {
      const p = S.particles[i];
      const at = renderPos(p, alpha);
      const t = clamp(p.life / p.max, 0, 1);
      if (glowPass) {
        if (p.kind === "trail" || p.r > 1.5) glow(ctx, at.x, at.y, p.r * (p.kind === "trail" ? 5 : 3.5), p.color, t * 0.12);
      } else {
        ctx.globalAlpha = t;
        ctx.fillStyle = cssFor(p.color);
        if (p.kind === "chip") {
          ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(p.spin);
          ctx.fillRect(-p.r * 1.5, -0.45, p.r * 3, 0.9); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(at.x, at.y, p.r * (0.35 + t * 0.65), 0, TAU); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawFragments(ctx, alpha) {
    for (let i = 0; i < S.fragments.length; i++) {
      const f = S.fragments[i];
      const at = renderPos(f, alpha);
      ctx.save();
      ctx.translate(at.x, at.y); ctx.rotate(f.angle);
      ctx.globalAlpha = clamp(f.life / 0.7, 0, 1);
      ctx.strokeStyle = cssFor(f.color); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-f.size, -f.size * 0.3); ctx.lineTo(f.size, 0); ctx.lineTo(-f.size * 0.4, f.size * 0.65); ctx.stroke();
      ctx.restore();
    }
  }

  function drawOrbs(ctx, alpha, glowPass) {
    for (let i = 0; i < S.orbs.length; i++) {
      const o = S.orbs[i];
      const at = renderPos(o, alpha);
      const pulse = 1 + Math.sin(o.phase) * 0.18;
      if (glowPass) glow(ctx, at.x, at.y, 16 * pulse, "gold", 0.2);
      else {
        ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(o.phase * 0.32);
        ctx.strokeStyle = C.gold; ctx.fillStyle = rgba(RGB.gold, 0.2); ctx.lineWidth = 1;
        polygon(ctx, 4, 4.5 * pulse, Math.PI / 4); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
  }

  function drawShockwaves(ctx, glowPass) {
    for (let i = 0; i < S.shockwaves.length; i++) {
      const s = S.shockwaves[i];
      const t = 1 - s.life / s.max;
      const radius = lerp(s.r, s.end, easeOut(t));
      const alpha = (1 - t) * (glowPass ? 0.12 : 0.55);
      ctx.strokeStyle = rgba(rgbFor(s.color), alpha);
      ctx.lineWidth = glowPass ? 7 : Math.max(0.6, 2.2 * (1 - t));
      for (let ix = -1; ix <= 1; ix++) {
        for (let iy = -1; iy <= 1; iy++) {
          ctx.beginPath();
          ctx.arc(s.x + ix * W, s.y + iy * H, radius, 0, TAU);
          ctx.stroke();
        }
      }
    }
  }

  function render(ctxs, alpha, reducedMotion = false) {
    wx = ctxs.world;
    lx = ctxs.light;
    drawBackground();
    lx.setTransform(DPR, 0, 0, DPR, 0, 0);
    lx.clearRect(0, 0, W, H);
    const shakeX = !reducedMotion && S.shake > 0.05 ? Math.sin(S.time * 91.7) * S.shake : 0;
    const shakeY = !reducedMotion && S.shake > 0.05 ? Math.sin(S.time * 77.3 + 1.2) * S.shake : 0;
    beginCanvas(wx, shakeX, shakeY);
    beginCanvas(lx, shakeX, shakeY);
    lx.globalCompositeOperation = "lighter";

    for (let i = 0; i < S.entries.length; i++) {
      drawPortal(wx, S.entries[i], alpha, false);
      drawPortal(lx, S.entries[i], alpha, true);
    }
    drawShockwaves(wx, false);
    drawShockwaves(lx, true);
    drawOrbs(wx, alpha, false);
    drawOrbs(lx, alpha, true);
    for (let i = 0; i < S.bullets.length; i++) {
      drawBullet(wx, S.bullets[i], alpha, false);
      drawBullet(lx, S.bullets[i], alpha, true);
    }
    for (let i = 0; i < S.enemies.length; i++) {
      drawEnemy(wx, S.enemies[i], alpha, false);
      drawEnemy(lx, S.enemies[i], alpha, true);
    }
    drawFragments(wx, alpha);
    drawParticles(wx, alpha, false);
    drawParticles(lx, alpha, true);
    drawPlayer(wx, alpha, false);
    drawPlayer(lx, alpha, true);
    lx.globalCompositeOperation = "source-over";
    wx.globalAlpha = 1;
    lx.globalAlpha = 1;
  }

  window.DemoRender = {
    setKernel: setKernel,
    render: render
  };
})();

