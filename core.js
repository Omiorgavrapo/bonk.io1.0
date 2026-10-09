/* Bonk Local physics. Planck/Box2D, independent of DOM, Canvas and wall-clock time. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./vendor/planck.min.js'));
  else root.BonkCore = factory(root.planck);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (pl) {
  'use strict';
  if (!pl) throw new Error('Planck must be loaded before core.js.');
  // These numbers are reconstruction estimates, NOT measured Bonk 2025 constants.
  // Official reference establishes heavy's tradeoff, aim/move exclusion and grapple contact break.
  // Altering dt, mass, impulses or damping requires new comparison measurements.
  var PARAMS = Object.freeze({
    dt: 1 / 60, ppm: 30, gravity: 25, radius: 16, density: 1,
    friction: .18, restitution: .48, linearDamping: .65,
    moveAccel: 38, airControl: .62, jumpSpeed: 11.5, airUpAccel: 8,
    downAccel: 17, jumpCooldown: 18, maxSpeed: 38,
    heavyMass: 1.5, heavyControl: .42, heavyFadeTicks: 180, heavyRecoveryTicks: 90,
    arrowChargeTicks: 72, arrowCooldown: 54, arrowMinSpeed: 15, arrowMaxSpeed: 33,
    arrowLifetime: 300, arrowKnock: 8, grappleRange: 340, grappleCooldown: 30,
    vtolAccel: 34, vtolWingOffset: .62, vtolAngularDamping: 2.6,
    ballRadius: 14, kickSpeed: 18, kickRange: 52, kickCooldown: 30,
    countdownTicks: 120, roundOverTicks: 150, roundTimeTicks: 10800
  });
  var MODES = Object.freeze(['classic', 'arrows', 'deatharrows', 'grapple', 'vtol', 'football']);
  var keys = ['left', 'right', 'up', 'down', 'heavy', 'special'];
  var V = pl.Vec2, scale = PARAMS.ppm, dt = PARAMS.dt;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function number(x, fallback) { return typeof x === 'number' && isFinite(x) ? x : fallback; }
  function pixels(v) { return { x: v.x * scale, y: v.y * scale }; }
  function encode(i) { var n = 0; keys.forEach(function (k, j) { if (i && i[k]) n |= 1 << j; }); return n; }
  function decode(n) { var i = {}; keys.forEach(function (k, j) { i[k] = !!(n & (1 << j)); }); return i; }
  function angleDifference(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
  function pointIn(p, r) { return Math.abs(p.x - r.x) <= r.w / 2 && Math.abs(p.y - r.y) <= r.h / 2; }

  // Ear clipping preserves editable concave polygons. Planck only accepts convex fixtures.
  function polygonParts(points) {
    var p = points.map(function (x) { return [x[0] / scale, x[1] / scale]; });
    var area = 0;
    p.forEach(function (a, i) { var b = p[(i + 1) % p.length]; area += a[0] * b[1] - b[0] * a[1]; });
    if (area < 0) p.reverse();
    function cross(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
    if (p.length <= 8 && p.every(function (a, i) { return cross(a, p[(i + 1) % p.length], p[(i + 2) % p.length]) >= -1e-9; })) return [p];
    var parts = [], guard = p.length * p.length;
    while (p.length > 3 && guard-- > 0) {
      var found = false;
      for (var i = 0; i < p.length; i++) {
        var a = p[(i + p.length - 1) % p.length], b = p[i], c = p[(i + 1) % p.length];
        if (cross(a, b, c) <= 1e-9) continue;
        if (p.some(function (q) { return q !== a && q !== b && q !== c && cross(a, b, q) >= -1e-9 && cross(b, c, q) >= -1e-9 && cross(c, a, q) >= -1e-9; })) continue;
        parts.push([a, b, c]); p.splice(i, 1); found = true; break;
      }
      if (!found) throw new Error('Polygon is degenerate or self-intersecting.');
    }
    if (p.length === 3) parts.push(p);
    return parts;
  }

  function create(mapInput, optionsInput) {
    var map = clone(mapInput), opts = clone(optionsInput || {});
    if (!map || !Array.isArray(map.bodies)) throw new Error('Map bodies are missing.');
    var mode = opts.mode || map.mode || 'classic';
    if (MODES.indexOf(mode) < 0) throw new Error('Unsupported mode: ' + mode);
    map.mode = mode;
    var roster = opts.players || [{ id: 'p1', name: 'Player 1', color: '#ff3030', team: 1 }];
    if (!roster.length || roster.length > 8 || roster.filter(function (p) { return p.bot; }).length > 6) throw new Error('Use at most eight players and six bots.');
    var ids = {};
    roster = roster.map(function (p, i) {
      if (!p.id || ids[p.id]) throw new Error('Player IDs must be unique.');
      ids[p.id] = true;
      return { id: String(p.id), name: String(p.name || p.id), color: p.color || ['#ff3030', '#448aff', '#60b852', '#ffc640'][i % 4], skin: p.skin || 'plain', team: p.team === 2 ? 2 : 1, bot: !!p.bot };
    });
    // Football always has both teams even in a one-human + bots session.
    if (mode === 'football' && roster.length > 1 && roster.every(function (p) { return p.team === roster[0].team; })) roster.forEach(function (p, i) { p.team = i % 2 + 1; });
    opts.players = clone(roster);
    opts.seed = number(opts.seed, 123) >>> 0;
    opts.roundsToWin = clamp(Math.floor(number(opts.roundsToWin, 3)), 1, 20);
    opts.countdownTicks = clamp(Math.floor(number(opts.countdownTicks, PARAMS.countdownTicks)), 0, 600);
    opts.roundTimeTicks = clamp(Math.floor(number(opts.roundTimeTicks, PARAMS.roundTimeTicks)), 1, 216000);
    var rng = opts.seed || 1, world, mapBodies, players, playerById, arrows, ball;
    var tick = 0, round = 1, phase, timer, roundTicks, winner = null, matchWinner = null;
    var events = [], pending = [], scores = {}, teamScores = { 1: 0, 2: 0 }, history = [], replayBase, arrowId = 0;
    roster.forEach(function (p) { scores[p.id] = 0; });
    function random() { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; }
    function emit(type, data) { events.push(Object.assign({ type: type, tick: tick }, data || {})); }
    function fixtureInfo(f) { return f.getBody().getUserData() || {}; }
    function bodyFixture(body, shape, def) {
      return body.createFixture(shape, Object.assign({ density: number(def.density, 1), friction: number(def.friction, .3), restitution: number(def.restitution, .2), isSensor: !!def.sensor }, def.filter || {}));
    }
    function build() {
      world = new pl.World(V(0, PARAMS.gravity * number(map.gravity, 1)));
      world.setContinuousPhysics(true);
      mapBodies = {}; arrows = []; playerById = {}; pending = []; ball = null;
      (map.bodies || []).forEach(function (def, index) {
        if (def.noPhysics) return;
        var body = world.createBody({ type: def.type || 'static', position: V(number(def.x, 0) / scale, number(def.y, 0) / scale), angle: number(def.angle, 0) * Math.PI / 180,
          linearVelocity: V(number(def.linearVelocity && def.linearVelocity.x, 0) / scale, number(def.linearVelocity && def.linearVelocity.y, 0) / scale), angularVelocity: number(def.angularVelocity, 0),
          fixedRotation: !!def.fixedRotation, linearDamping: number(def.linearDamping, 0), angularDamping: number(def.angularDamping, 0), bullet: def.type === 'dynamic' });
        var id = def.id || 'body' + index;
        body.setUserData({ kind: 'map', id: id, lethal: !!def.lethal, noGrapple: !!def.noGrapple });
        if (def.shape === 'circle') bodyFixture(body, pl.Circle(Math.max(.05, number(def.r, 20) / scale)), def);
        else if (def.shape === 'polygon') polygonParts(def.points || []).forEach(function (p) { bodyFixture(body, pl.Polygon(p.map(function (q) { return V(q[0], q[1]); })), def); });
        else bodyFixture(body, pl.Box(Math.max(.02, number(def.w, 80) / (2 * scale)), Math.max(.02, number(def.h, 30) / (2 * scale))), def);
        mapBodies[id] = body;
      });
      (map.joints || []).forEach(function (j) {
        var a = mapBodies[j.bodyA], b = mapBodies[j.bodyB];
        if (!a || !b || a === b) return;
        var anchor = V(number(j.x, (a.getPosition().x + b.getPosition().x) * scale / 2) / scale, number(j.y, (a.getPosition().y + b.getPosition().y) * scale / 2) / scale);
        var joint;
        if (j.type === 'revolute') joint = pl.RevoluteJoint({ collideConnected: !!j.collideConnected, enableMotor: !!j.enableMotor, motorSpeed: number(j.motorSpeed, 0), maxMotorTorque: number(j.maxMotorTorque, 0) }, a, b, anchor);
        else joint = pl.DistanceJoint({ collideConnected: !!j.collideConnected, length: Math.max(.05, number(j.length, V.distance(a.getPosition(), b.getPosition()) * scale) / scale), frequencyHz: number(j.frequency, 0), dampingRatio: number(j.damping, .2) }, a, b, a.getPosition(), b.getPosition());
        world.createJoint(joint);
      });
      var usedSpawns = {}, allSpawns = map.spawns || [];
      players = roster.map(function (def, index) {
        var eligible = allSpawns.filter(function (s) { return mode !== 'football' || !s.team || s.team === def.team; });
        if (!eligible.length) eligible = allSpawns;
        var si = usedSpawns[def.team] || 0;
        var s = eligible.length ? eligible[si % eligible.length] : { x: (number(map.width, 1000) * (index + 1)) / (roster.length + 1), y: number(map.height, 700) * .3 };
        if (mode !== 'football') { si = index; s = eligible.length ? eligible[si % eligible.length] : s; }
        usedSpawns[def.team] = si + 1;
        var extra = Math.floor(si / Math.max(1, eligible.length));
        var body = world.createDynamicBody({ position: V((s.x + extra * PARAMS.radius * 2.2) / scale, s.y / scale), fixedRotation: mode !== 'vtol', bullet: true, linearDamping: PARAMS.linearDamping, angularDamping: mode === 'vtol' ? PARAMS.vtolAngularDamping : .3 });
        var fixture = body.createFixture(pl.Circle(PARAMS.radius / scale), { density: PARAMS.density, friction: PARAMS.friction, restitution: PARAMS.restitution, filterGroupIndex: -(index + 1) });
        var p = Object.assign({}, def, { body: body, fixture: fixture, index: index, alive: true, heavy: false, heavyStrength: 1, aim: index % 2 ? Math.PI : 0, charge: 0, cooldown: 0, jumpCooldown: 0, kickCooldown: 0, grappleCooldown: 0, grapple: null, prev: decode(0), botInput: decode(0), botUntil: 0, botChargeTicks: 0, captures: {} });
        body.setUserData({ kind: 'player', id: p.id }); playerById[p.id] = p; return p;
      });
      if (mode === 'football') {
        var spawn = map.ballSpawn || { x: number(map.width, 1000) / 2, y: number(map.height, 700) / 2 };
        ball = world.createDynamicBody({ position: V(spawn.x / scale, spawn.y / scale), bullet: true, linearDamping: .22, angularDamping: .4 });
        ball.createFixture(pl.Circle(PARAMS.ballRadius / scale), { density: .65, friction: .35, restitution: .66 }); ball.setUserData({ kind: 'ball' });
      }
      world.on('begin-contact', function (contact) {
        var fa = contact.getFixtureA(), fb = contact.getFixtureB(), a = fixtureInfo(fa), b = fixtureInfo(fb);
        function contactOne(x, y, other) {
          if (x.kind === 'player') {
            if (y.lethal) pending.push({ type: 'dead', id: x.id, cause: 'hazard' });
            if (y.kind === 'player' && x.id !== y.id) pending.push({ type: 'break', id: x.id });
          }
          if (x.kind === 'arrow' && y.kind !== 'arrow' && y.id !== x.owner) pending.push({ type: 'arrow', id: x.id, other: y, body: other });
          if (x.kind === 'ball' && y.lethal) pending.push({ type: 'ball-reset' });
        }
        contactOne(a, b, fb.getBody()); contactOne(b, a, fa.getBody());
      });
      world.on('post-solve', function (contact, impulse) {
        var a = fixtureInfo(contact.getFixtureA()), b = fixtureInfo(contact.getFixtureB());
        if (a.kind !== 'player' && b.kind !== 'player') return;
        var force = (impulse.normalImpulses || []).reduce(function (s, x) { return s + x; }, 0);
        if (force > 2 && events.filter(function (e) { return e.type === 'hit'; }).length < 6) emit('hit', { x: contact.getWorldManifold(null).points[0].x * scale, y: contact.getWorldManifold(null).points[0].y * scale, intensity: Math.min(force / 10, 1) });
      });
      phase = 'countdown'; timer = Math.max(0, Math.floor(number(opts.countdownTicks, PARAMS.countdownTicks))); roundTicks = 0; winner = null;
      if (!timer) phase = 'playing';
      // A new round has no old contact impulses. Keep only that round's inputs,
      // plus its starting counters, so replay memory does not grow with a session.
      history = [];
      replayBase = { tick: tick, round: round, rng: rng >>> 0, scores: clone(scores), teamScores: clone(teamScores), matchWinner: matchWinner, arrowId: arrowId };
    }
    function grounded(p) {
      for (var edge = p.body.getContactList(); edge; edge = edge.next) {
        var c = edge.contact;
        if (!c.isTouching() || c.getFixtureA().isSensor() || c.getFixtureB().isSensor()) continue;
        var n = c.getWorldManifold(null).normal;
        var y = c.getFixtureA().getBody() === p.body ? -n.y : n.y;
        if (y < -.4) return true;
      }
      return false;
    }
    function breakGrapple(p) {
      if (!p || !p.grapple) return;
      world.destroyJoint(p.grapple.joint); p.grapple = null; p.grappleCooldown = PARAMS.grappleCooldown;
    }
    function eliminate(p, cause) {
      if (!p || !p.alive) return;
      p.alive = false; p.heavy = false; breakGrapple(p); p.body.setActive(false);
      emit('eliminate', { id: p.id, cause: cause, x: p.body.getPosition().x * scale, y: p.body.getPosition().y * scale });
    }
    function attachGrapple(p) {
      var start = p.body.getPosition(), best = null;
      // ponytail: 32 fixed rays are sufficient for the local 8-player limit;
      // a nearest-surface query can replace them if more complex maps justify it.
      for (var i = 0; i < 32; i++) {
        var a = i * Math.PI * 2 / 32;
        world.rayCast(start, V(start.x + Math.cos(a) * PARAMS.grappleRange / scale, start.y + Math.sin(a) * PARAMS.grappleRange / scale), function (fixture, point, normal, fraction) {
          var data = fixtureInfo(fixture);
          if (data.kind !== 'map' || data.lethal || data.noGrapple || fixture.isSensor()) return -1;
          if (!best || fraction < best.fraction) best = { fraction: fraction, point: V(point), body: fixture.getBody() };
          return fraction;
        });
      }
      if (!best) return;
      var length = Math.max(PARAMS.radius / scale * 1.2, V.distance(start, best.point));
      var joint = world.createJoint(pl.RopeJoint({ localAnchorA: V(0, 0), localAnchorB: best.body.getLocalPoint(best.point), maxLength: length, collideConnected: true }, p.body, best.body));
      p.grapple = { body: best.body, local: best.body.getLocalPoint(best.point), joint: joint };
      emit('grapple', { id: p.id, x: best.point.x * scale, y: best.point.y * scale });
    }
    function fire(p) {
      if (p.cooldown || p.charge < .02) { p.charge = 0; return; }
      var d = V(Math.cos(p.aim), Math.sin(p.aim)), pos = p.body.getPosition(), charge = p.charge;
      var body = world.createDynamicBody({ position: V(pos.x + d.x * (PARAMS.radius + 20) / scale, pos.y + d.y * (PARAMS.radius + 20) / scale), angle: p.aim, bullet: true, gravityScale: .22 });
      body.createFixture(pl.Box(.52, .055), { density: .75, friction: .1, restitution: 0, filterGroupIndex: -(p.index + 1) });
      var id = 'arrow' + (++arrowId), speed = PARAMS.arrowMinSpeed + charge * (PARAMS.arrowMaxSpeed - PARAMS.arrowMinSpeed), velocity = p.body.getLinearVelocity();
      body.setLinearVelocity(V(d.x * speed + velocity.x, d.y * speed + velocity.y)); body.setUserData({ kind: 'arrow', id: id, owner: p.id });
      arrows.push({ id: id, body: body, owner: p.id, age: 0, charge: charge });
      p.cooldown = PARAMS.arrowCooldown; p.charge = 0;
      emit('shoot', { id: p.id, x: pos.x * scale, y: pos.y * scale, charge: charge });
    }
    function kick(p, i) {
      if (!ball || p.kickCooldown || !i.heavy) return;
      var a = p.body.getPosition(), b = ball.getPosition(), dx = b.x - a.x, dy = b.y - a.y;
      if (Math.sqrt(dx * dx + dy * dy) * scale > PARAMS.kickRange) return;
      var length = Math.max(.001, Math.sqrt(dx * dx + dy * dy));
      if (Math.abs(dx) < .05 && Math.abs(dy) < .05) { dx = p.team === 1 ? 1 : -1; dy = -.3; length = Math.sqrt(dx * dx + dy * dy); }
      ball.applyLinearImpulse(V(dx / length * PARAMS.kickSpeed * ball.getMass(), dy / length * PARAMS.kickSpeed * ball.getMass()), ball.getWorldCenter(), true);
      p.kickCooldown = PARAMS.kickCooldown; emit('kick', { id: p.id, x: b.x * scale, y: b.y * scale });
    }
    function control(p, input) {
      if (!p.alive) return;
      var i = input, aiming = (mode === 'arrows' || mode === 'deatharrows') && i.special;
      p.cooldown = Math.max(0, p.cooldown - 1); p.jumpCooldown = Math.max(0, p.jumpCooldown - 1); p.kickCooldown = Math.max(0, p.kickCooldown - 1); p.grappleCooldown = Math.max(0, p.grappleCooldown - 1);
      p.heavy = mode !== 'football' && !aiming && !!i.heavy;
      if (mode === 'classic') p.heavyStrength = clamp(p.heavyStrength + (p.heavy ? -1 / PARAMS.heavyFadeTicks : 1 / PARAMS.heavyRecoveryTicks), 0, 1);
      else p.heavyStrength = 1;
      var density = PARAMS.density * (p.heavy ? 1 + (PARAMS.heavyMass - 1) * (.2 + .8 * p.heavyStrength) : 1);
      if (Math.abs(p.fixture.getDensity() - density) > .001) { p.fixture.setDensity(density); p.body.resetMassData(); }
      if (mode === 'arrows' || mode === 'deatharrows') {
        if (aiming && !p.cooldown) {
          var dx = (i.right ? 1 : 0) - (i.left ? 1 : 0), dy = (i.down ? 1 : 0) - (i.up ? 1 : 0);
          if (dx || dy) {
            var target = Math.atan2(dy, dx), delta = angleDifference(target, p.aim);
            p.aim += clamp(delta, -.075, .075);
          }
          p.charge = clamp(p.charge + 1 / PARAMS.arrowChargeTicks, 0, 1);
        } else if (!i.special && p.prev.special) fire(p);
      }
      if (mode === 'grapple') {
        if (!i.special) breakGrapple(p);
        else if (!p.grapple && !p.grappleCooldown) attachGrapple(p);
      }
      var body = p.body, mass = body.getMass(), heavyFactor = p.heavy ? PARAMS.heavyControl : 1, onGround = grounded(p);
      if (mode === 'vtol') {
        var thrust = PARAMS.vtolAccel * mass * heavyFactor, offset = PARAMS.radius / scale * PARAMS.vtolWingOffset;
        var left = !p.heavy && !!i.right, right = !p.heavy && !!i.left;
        if (i.up || (i.left && i.right)) left = right = true;
        function jet(x, direction) { body.applyForce(body.getWorldVector(V(0, direction * thrust)), body.getWorldPoint(V(x, .18)), true); }
        if (i.down) { jet(-offset, 1); jet(offset, 1); }
        else { if (left) jet(-offset, -1); if (right) jet(offset, -1); }
      } else if (!aiming) {
        var x = (i.right ? 1 : 0) - (i.left ? 1 : 0), y = (i.down ? PARAMS.downAccel : 0) - (i.up ? PARAMS.airUpAccel : 0);
        body.applyForceToCenter(V(x * PARAMS.moveAccel * (onGround ? 1 : PARAMS.airControl) * heavyFactor * PARAMS.density * Math.PI * Math.pow(PARAMS.radius / scale, 2), y * mass * heavyFactor), true);
      }
      if (!aiming && i.up && onGround && !p.jumpCooldown && !p.heavy) {
        var velocity = body.getLinearVelocity();
        body.applyLinearImpulse(V(0, -mass * Math.max(0, PARAMS.jumpSpeed + velocity.y)), body.getWorldCenter(), true); p.jumpCooldown = PARAMS.jumpCooldown;
      }
      if (mode === 'football') kick(p, i);
      (map.zones || []).forEach(function (z, zi) {
        var at = pixels(body.getPosition());
        if ((z.team && z.team !== p.team) || !pointIn(at, z)) { p.captures[zi] = 0; return; }
        if (z.lethal) pending.push({ type: 'dead', id: p.id, cause: 'zone' });
        if (z.forceX || z.forceY) body.applyForceToCenter(V(number(z.forceX, 0) / scale * mass, number(z.forceY, 0) / scale * mass), true);
        if (z.capture) { p.captures[zi] = (p.captures[zi] || 0) + 1; if (p.captures[zi] >= number(z.captureTicks, 180)) finish(mode === 'football' ? 'team' + p.team : p.id); }
      });
      var velocity = body.getLinearVelocity(), speed = velocity.length();
      if (speed > PARAMS.maxSpeed) body.setLinearVelocity(V.mul(velocity, PARAMS.maxSpeed / speed));
      p.prev = i;
    }
    function bot(p) {
      if (tick < p.botUntil) return p.botInput;
      p.botUntil = tick + 7 + Math.floor(random() * 6);
      var pos = pixels(p.body.getPosition()), target = null, distance = Infinity;
      players.forEach(function (q) {
        if (!q.alive || q.id === p.id || (mode === 'football' && q.team === p.team)) return;
        var at = pixels(q.body.getPosition()), d = Math.hypot(at.x - pos.x, at.y - pos.y);
        if (d < distance) { target = at; distance = d; }
      });
      if (mode === 'football' && ball) { target = pixels(ball.getPosition()); distance = Math.hypot(target.x - pos.x, target.y - pos.y); target.x += p.team === 1 ? -18 : 18; }
      if (!target) target = { x: number(map.width, 1000) / 2, y: number(map.height, 700) / 2 };
      var i = decode(0), dx = target.x - pos.x, dy = target.y - pos.y;
      i.left = dx < -12; i.right = dx > 12;
      var danger = false, ahead = V((pos.x + Math.sign(dx || 1) * 55) / scale, (pos.y + PARAMS.radius + 2) / scale), support = false;
      world.rayCast(ahead, V(ahead.x, ahead.y + 3.5), function (f) { if (fixtureInfo(f).kind === 'map' && !f.isSensor() && !fixtureInfo(f).lethal) support = true; return 0; });
      danger = !support && grounded(p);
      i.up = danger || (dy < -45 && random() < .7) || (distance < 70 && random() < .2);
      i.down = dy > 100 && !danger;
      i.heavy = distance < 62 && !i.up && random() < .6;
      if (mode === 'arrows' || mode === 'deatharrows') {
        if (p.prev.special) {
          if (p.charge > .3 && Math.abs(angleDifference(Math.atan2(dy, dx), p.aim)) < .3) i.special = p.charge < .8 && random() > .35;
          else i.special = p.charge < 1;
        } else i.special = !p.cooldown && distance > 45 && random() < .7;
        if (i.special) { i.left = dx < -8; i.right = dx > 8; i.up = dy < -25; i.down = dy > 25; i.heavy = false; }
      }
      if (mode === 'grapple') i.special = (Math.floor(tick / 90) + p.index) % 3 !== 2;
      if (mode === 'vtol') {
        var angle = angleDifference(0, p.body.getAngle()), angular = p.body.getAngularVelocity();
        i.up = pos.y > target.y - 65 && Math.abs(angle) < 1;
        i.left = angle < -.08 || (Math.abs(angle) < .35 && dx < -25);
        i.right = angle > .08 || (Math.abs(angle) < .35 && dx > 25);
        if (Math.abs(angular) > 3) { i.left = angular > 0; i.right = angular < 0; }
        i.down = pos.y < target.y - 160 && Math.abs(angle) < .6; i.heavy = false;
      }
      if (mode === 'football') i.heavy = distance < PARAMS.kickRange;
      p.botInput = i; return i;
    }
    function finish(result) {
      if (phase !== 'playing') return;
      winner = result || null; phase = 'roundover'; timer = PARAMS.roundOverTicks;
      if (mode === 'football' && result) {
        var team = Number(String(result).slice(-1)); teamScores[team]++;
        players.forEach(function (p) { if (p.team === team) scores[p.id]++; });
        if (teamScores[team] >= opts.roundsToWin) matchWinner = result;
      } else if (result && scores[result] !== undefined) {
        scores[result]++; if (scores[result] >= opts.roundsToWin) matchWinner = result;
      }
      emit('round', { winner: winner, round: round });
      if (matchWinner) phase = 'matchover';
    }
    function resetBall() {
      if (!ball) return;
      var spawn = map.ballSpawn || { x: number(map.width, 1000) / 2, y: number(map.height, 700) / 2 };
      ball.setTransform(V(spawn.x / scale, spawn.y / scale), 0); ball.setLinearVelocity(V(0, 0)); ball.setAngularVelocity(0);
    }
    function process() {
      var hitArrows = {};
      pending.forEach(function (event) {
        if (event.type === 'dead') eliminate(playerById[event.id], event.cause);
        if (event.type === 'break') breakGrapple(playerById[event.id]);
        if (event.type === 'ball-reset') resetBall();
        if (event.type === 'arrow' && !hitArrows[event.id]) {
          var arrow = arrows.find(function (a) { return a.id === event.id; });
          if (!arrow) return;
          hitArrows[event.id] = true;
          if (event.other.kind === 'player') {
            var p = playerById[event.other.id];
            if (p && p.alive) {
              if (mode === 'deatharrows') eliminate(p, 'arrow');
              else { var v = arrow.body.getLinearVelocity(), len = Math.max(.01, v.length()), baseMass = PARAMS.density * Math.PI * Math.pow(PARAMS.radius / scale, 2); p.body.applyLinearImpulse(V(v.x / len * PARAMS.arrowKnock * (.35 + .65 * arrow.charge) * baseMass, v.y / len * PARAMS.arrowKnock * (.35 + .65 * arrow.charge) * baseMass), p.body.getWorldCenter(), true); breakGrapple(p); }
              var at = pixels(p.body.getPosition()); emit('hit', { id: p.id, owner: arrow.owner, x: at.x, y: at.y, intensity: 1 });
            }
          }
        }
      }); pending = [];
      arrows = arrows.filter(function (a) {
        a.age++;
        var at = pixels(a.body.getPosition()), v = a.body.getLinearVelocity();
        if (hitArrows[a.id] || a.age > PARAMS.arrowLifetime || at.y > map.height + 200 || at.x < -300 || at.x > map.width + 300) { world.destroyBody(a.body); return false; }
        if (v.length() > .1) a.body.setAngle(Math.atan2(v.y, v.x));
        return true;
      });
      players.forEach(function (p) {
        if (!p.alive) return;
        var pos = pixels(p.body.getPosition());
        if (!isFinite(pos.x) || !isFinite(pos.y) || pos.y > number(map.height, 700) + 160 || pos.x < -180 || pos.x > number(map.width, 1000) + 180 || pos.y < -1000) eliminate(p, 'out');
      });
      if (ball) {
        var pos = pixels(ball.getPosition());
        var goals = map.goals || [];
        for (var i = 0; i < goals.length; i++) if (pointIn(pos, goals[i])) { var team = goals[i].team === 1 ? 2 : 1; emit('goal', { team: team, x: pos.x, y: pos.y }); finish('team' + team); break; }
        if (pos.y > number(map.height, 700) + 100 || pos.x < -120 || pos.x > number(map.width, 1000) + 120) resetBall();
        (map.zones || []).forEach(function (z) { if (pointIn(pos, z)) { if (z.lethal) resetBall(); else ball.applyForceToCenter(V(number(z.forceX, 0) / scale * ball.getMass(), number(z.forceY, 0) / scale * ball.getMass()), true); } });
      }
      if (mode !== 'football' && roster.length > 1) {
        var alive = players.filter(function (p) { return p.alive; });
        if (alive.length <= 1) finish(alive.length ? alive[0].id : null);
      }
      if (roundTicks >= number(opts.roundTimeTicks, PARAMS.roundTimeTicks)) finish(null);
    }
    function state() {
      return { tick: tick, phase: phase, countdown: phase === 'countdown' ? Math.ceil(timer * dt) : 0, mode: mode, map: map, round: round, winner: winner, matchWinner: matchWinner,
        timeRemaining: Math.ceil(Math.max(0, number(opts.roundTimeTicks, PARAMS.roundTimeTicks) - roundTicks) * dt),
        players: players.map(function (p) { var pos = pixels(p.body.getPosition()), g = p.grapple && pixels(p.grapple.body.getWorldPoint(p.grapple.local)); return { id: p.id, name: p.name, color: p.color, skin: p.skin, team: p.team, bot: p.bot, alive: p.alive, x: pos.x, y: pos.y, angle: p.body.getAngle() * 180 / Math.PI, radius: PARAMS.radius, heavy: p.heavy, heavyStrength: p.heavyStrength, aim: p.aim, charge: p.charge, cooldown: p.cooldown / PARAMS.arrowCooldown, grapple: g, controls: clone(p.prev) }; }),
        bodies: map.bodies.map(function (b, i) { var body = mapBodies[b.id || 'body' + i]; if (!body) return clone(b); var pos = pixels(body.getPosition()); return Object.assign({}, b, pos, { angle: body.getAngle() * 180 / Math.PI }); }),
        projectiles: arrows.map(function (a) { var pos = pixels(a.body.getPosition()); return { id: a.id, x: pos.x, y: pos.y, angle: a.body.getAngle(), length: 31, owner: a.owner }; }),
        ball: ball ? Object.assign(pixels(ball.getPosition()), { r: PARAMS.ballRadius, angle: ball.getAngle() * 180 / Math.PI }) : null, scores: clone(scores), teamScores: clone(teamScores), events: clone(events) };
    }
    function step(inputs) {
      if (phase === 'matchover') { events = []; return; }
      inputs = inputs || {}; events = []; tick++;
      var commands = roster.map(function (p) { return p.bot ? 0 : encode(inputs[p.id]); }); history.push(commands);
      if (phase === 'countdown') { if (--timer <= 0) { phase = 'playing'; emit('start'); } return; }
      if (phase === 'roundover') { if (--timer <= 0) { round++; build(); } return; }
      roundTicks++;
      (map.bodies || []).forEach(function (def, index) { var b = mapBodies[def.id || 'body' + index]; if (b && def.force && b.isDynamic()) b.applyForceToCenter(V(number(def.force.x, 0) / scale * b.getMass(), number(def.force.y, 0) / scale * b.getMass()), true); });
      players.forEach(function (p, i) { control(p, p.bot ? bot(p) : decode(commands[i])); });
      world.step(dt, 8, 4); process();
    }
    function restartRound() {
      // Restart is a retry of the current round; score does not change.
      if (phase === 'matchover') { scores = {}; roster.forEach(function (p) { scores[p.id] = 0; }); teamScores = { 1: 0, 2: 0 }; round = 1; matchWinner = null; }
      build(); events = [];
    }
    function snapshot() {
      // Planck's JSON serializer omits contact warm-start impulses. Replaying the
      // command log restores those too, instead of falsely promising position-only rollback.
      // ponytail: replay cost is at most the current round (normally 3 minutes);
      // contact-aware live rollback belongs to an actual future server implementation.
      return { version: 2, engine: 'planck-1.4.2', map: clone(map), options: clone(opts), base: clone(replayBase), commands: clone(history), state: state(), rng: rng >>> 0 };
    }
    function restore(s) {
      if (!s || s.version !== 2 || !s.base || !Array.isArray(s.commands) || JSON.stringify(s.map) !== JSON.stringify(map) || JSON.stringify(s.options) !== JSON.stringify(opts)) throw new Error('Snapshot must use this map, players, seed and rules.');
      var base = s.base, maxFrames = opts.roundTimeTicks + opts.countdownTicks + PARAMS.roundOverTicks + 1;
      if (!Number.isSafeInteger(base.tick) || base.tick < 0 || !Number.isSafeInteger(base.round) || base.round < 1 || !Number.isInteger(base.rng) || base.rng < 0 || base.rng > 4294967295 || !Number.isSafeInteger(base.arrowId) || base.arrowId < 0 || !base.scores || !base.teamScores || s.commands.length > maxFrames) throw new Error('Invalid snapshot round checkpoint.');
      roster.forEach(function (p) { if (!Number.isInteger(base.scores[p.id]) || base.scores[p.id] < 0 || base.scores[p.id] > opts.roundsToWin) throw new Error('Invalid snapshot player score.'); });
      [1, 2].forEach(function (team) { if (!Number.isInteger(base.teamScores[team]) || base.teamScores[team] < 0 || base.teamScores[team] > opts.roundsToWin) throw new Error('Invalid snapshot team score.'); });
      s.commands.forEach(function (frame) { if (!Array.isArray(frame) || frame.length !== roster.length || frame.some(function (mask) { return !Number.isInteger(mask) || mask < 0 || mask > 63; })) throw new Error('Invalid snapshot command frame.'); });
      if (s.state && s.state.tick !== base.tick + s.commands.length) throw new Error('Snapshot command log is incomplete.');
      var saved = clone(s.commands);
      tick = s.base.tick; round = s.base.round; rng = s.base.rng; scores = clone(s.base.scores); teamScores = clone(s.base.teamScores); matchWinner = s.base.matchWinner; arrowId = s.base.arrowId; events = []; build();
      saved.forEach(function (frame) {
        var inputs = {}; roster.forEach(function (p, i) { if (!p.bot) inputs[p.id] = decode(frame[i]); }); step(inputs);
      });
      return state();
    }
    build();
    return { step: step, state: state, snapshot: snapshot, restore: restore, restartRound: restartRound };
  }
  return { PARAMS: PARAMS, MODES: MODES, create: create };
}));
