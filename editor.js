(function (global) {
  'use strict';

  var config, root, canvas, ctx, stage, inspector, status, map, selected = null;
  var tool = 'select', undoStack = [], redoStack = [], drag = null, polygon = [], jointBody = null;
  var importedInput, loadSelect, isOpen = false, snap = false, resizeObserver;
  var modes = ['classic', 'arrows', 'deatharrows', 'grapple', 'vtol', 'football'];
  var toolNames = { select: 'Select / move', resize: 'Resize', rotate: 'Rotate', rect: 'Rectangle', circle: 'Circle', polygon: 'Polygon', spawn: 'Spawn', goal: 'Goal', zone: 'Force / death zone', joint: 'Joint' };
  var hints = {
    select: 'Click an object to select it; drag to move. Delete removes it. Arrow keys move the selection.',
    resize: 'Select an object, then drag a corner or edge to size it. Dimensions can also be entered on the right.',
    rotate: 'Select a body, then drag around its centre. Shift snaps rotation to 15 degrees.',
    rect: 'Drag to draw a rectangle. A click creates a small platform.',
    circle: 'Drag from the centre to set the radius. A click creates a circle.',
    polygon: 'Click 3–8 points. Double-click or Enter finishes a convex polygon; Escape cancels.',
    spawn: 'Click to add a player spawn. Set its team in Properties.',
    goal: 'Drag to draw a Football goal. Team identifies whose goal it is.',
    zone: 'Drag to draw a zone; set a force or enable Deadly in Properties.',
    joint: 'Click one body, then another to connect them. Choose Distance or Revolute in Properties.'
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function encode(value) { return JSON.stringify(value); }
  function clamp(n, low, high) { return Math.max(low, Math.min(high, n)); }
  function escapeHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function validate(value) {
    if (!global.BonkMaps || !global.BonkMaps.validate) throw new Error('The map validator is not available.');
    return global.BonkMaps.validate(value);
  }
  function say(message, bad) { status.textContent = message || hints[tool]; status.classList.toggle('editor-error', !!bad); }
  function blankMap() {
    return { version: 1, id: 'local-' + Date.now(), name: 'Untitled map', author: 'Local player', mode: 'classic', width: 1000, height: 700, background: '#d7e3e8', gravity: 1,
      bodies: [{ id: 'body1', shape: 'rect', x: 500, y: 580, w: 700, h: 25, angle: 0, type: 'static', color: '#666666', density: 1, friction: 0.3, restitution: 0.2, lethal: false, fixedRotation: false, linearVelocity: { x: 0, y: 0 }, angularVelocity: 0, force: { x: 0, y: 0 } }],
      spawns: [{ x: 350, y: 500, team: 1 }, { x: 650, y: 500, team: 2 }], goals: [], zones: [], joints: [], source: { url: '', evidence: 'Created locally in the map editor.', historicalVerified: false } };
  }
  function uniqueId(prefix) {
    var count = 1, ids = map.bodies.concat(map.joints).map(function (item) { return item.id; });
    while (ids.indexOf(prefix + count) >= 0) count++;
    return prefix + count;
  }
  function object() { return selected && map[selected.kind] && map[selected.kind][selected.index] || null; }
  function pushUndo(before) {
    if (before === encode(map)) return;
    undoStack.push(before);
    // ponytail: 40 whole-map snapshots keep undo simple; use diffs only if large maps demonstrate a memory problem.
    if (undoStack.length > 40) undoStack.shift();
    redoStack = [];
  }
  function commit(before, message) {
    try {
      map = validate(map);
      pushUndo(before);
      if (selected && !object()) selected = null;
      render();
      say(message);
      return true;
    } catch (err) {
      map = JSON.parse(before);
      if (selected && !object()) selected = null;
      render();
      say(err.message, true);
      return false;
    }
  }
  function mutate(fn, message) { var before = encode(map); fn(); return commit(before, message); }
  function history(redo) {
    var source = redo ? redoStack : undoStack, destination = redo ? undoStack : redoStack;
    if (!source.length) return;
    destination.push(encode(map));
    map = JSON.parse(source.pop()); selected = null; polygon = []; jointBody = null;
    render(); say(redo ? 'Redone.' : 'Undone.');
  }
  function setTool(value) {
    tool = value; polygon = []; jointBody = null; drag = null;
    root.querySelectorAll('[data-tool]').forEach(function (button) { button.classList.toggle('active', button.dataset.tool === value); button.setAttribute('aria-pressed', button.dataset.tool === value ? 'true' : 'false'); });
    canvas.style.cursor = value === 'select' ? 'default' : 'crosshair';
    say(); draw();
  }
  function field(label, path, value, kind, options) {
    var id = 'editor-' + path.replace(/\./g, '-'), input;
    if (kind === 'select') input = '<select id="' + id + '" data-property="' + path + '">' + options.map(function (entry) { var v = typeof entry === 'string' ? entry : entry.value, text = typeof entry === 'string' ? entry : entry.label; return '<option value="' + escapeHtml(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + escapeHtml(text) + '</option>'; }).join('') + '</select>';
    else if (kind === 'check') input = '<input id="' + id + '" data-property="' + path + '" type="checkbox"' + (value ? ' checked' : '') + '>';
    else if (kind === 'points') input = '<textarea id="' + id + '" data-property="' + path + '" rows="3" spellcheck="false">' + escapeHtml(encode(value)) + '</textarea>';
    else input = '<input id="' + id + '" data-property="' + path + '" type="' + (kind || 'number') + '"' + (!kind || kind === 'number' ? ' step="any"' : '') + ' value="' + escapeHtml(value == null ? 0 : value) + '">';
    return '<label class="editor-field' + (kind === 'check' ? ' editor-check' : '') + (kind === 'text' || kind === 'select' || kind === 'points' ? ' editor-wide-field' : '') + '" for="' + id + '"><span>' + label + '</span>' + input + '</label>';
  }
  function buildInspector() {
    var item = object(), bodyOptions = map.bodies.map(function (b) { return { value: b.id, label: b.id + ' (' + b.shape + ')' }; });
    var objectOptions = ['bodies', 'spawns', 'goals', 'zones', 'joints'].map(function (kind) { return map[kind].length ? '<optgroup label="' + kind + '">' + map[kind].map(function (obj, index) { var value = kind + ':' + index; return '<option value="' + value + '"' + (selected && selected.kind === kind && selected.index === index ? ' selected' : '') + '>' + escapeHtml(obj.id || kind.slice(0, -1) + ' ' + (index + 1)) + '</option>'; }).join('') + '</optgroup>' : ''; }).join('');
    var html = '<details class="editor-section" open><summary>Map</summary><div class="editor-fields">' + field('Name', 'map.name', map.name, 'text') + field('Author', 'map.author', map.author || '', 'text') + field('Mode', 'map.mode', map.mode, 'select', modes) + field('Background', 'map.background', map.background, 'color') + field('Width', 'map.width', map.width) + field('Height', 'map.height', map.height) + field('Gravity', 'map.gravity', map.gravity) + '</div></details><section class="editor-section"><label class="editor-field editor-wide-field"><span>Select any object</span><select class="editor-object-list"><option value="">None</option>' + objectOptions + '</select></label></section>';
    if (!item) html += '<div class="editor-section editor-empty">Select an object to edit its properties.</div>';
    else {
      html += '<section class="editor-section"><h3>' + ({ bodies: 'Body', spawns: 'Player spawn', goals: 'Football goal', zones: 'Zone', joints: 'Joint' }[selected.kind]) + (item.id ? ' · ' + escapeHtml(item.id) : ' · ' + (selected.index + 1)) + '</h3><div class="editor-fields">';
      html += field('X', 'x', item.x) + field('Y', 'y', item.y);
      if (selected.kind === 'bodies') {
        html += field('Rotation °', 'angle', item.angle || 0) + field('Behaviour', 'type', item.type, 'select', ['static', 'dynamic', 'kinematic']) + field('Colour', 'color', item.color, 'color');
        if (item.shape === 'circle') html += field('Radius', 'r', item.r);
        else if (item.shape === 'rect') html += field('Width', 'w', item.w) + field('Height', 'h', item.h);
        else html += field('Local vertices · JSON', 'points', item.points, 'points');
        html += field('Density', 'density', item.density) + field('Friction', 'friction', item.friction) + field('Bounce', 'restitution', item.restitution) + field('Deadly', 'lethal', item.lethal, 'check') + field('Fixed rotation', 'fixedRotation', item.fixedRotation, 'check');
        html += field('Velocity X', 'linearVelocity.x', item.linearVelocity && item.linearVelocity.x || 0) + field('Velocity Y', 'linearVelocity.y', item.linearVelocity && item.linearVelocity.y || 0) + field('Angular velocity', 'angularVelocity', item.angularVelocity || 0) + field('Force X', 'force.x', item.force && item.force.x || 0) + field('Force Y', 'force.y', item.force && item.force.y || 0);
      } else if (selected.kind === 'spawns') html += field('Team', 'team', item.team, 'select', ['1', '2']);
      else if (selected.kind === 'goals' || selected.kind === 'zones') {
        html += field('Width', 'w', item.w) + field('Height', 'h', item.h);
        html += field(selected.kind === 'goals' ? 'Goal owner' : 'Affected team', 'team', item.team || (selected.kind === 'goals' ? 1 : 0), 'select', selected.kind === 'goals' ? ['1', '2'] : [{ value: 0, label: 'All' }, '1', '2']);
        if (selected.kind === 'zones') html += field('Force X', 'forceX', item.forceX || 0) + field('Force Y', 'forceY', item.forceY || 0) + field('Deadly', 'lethal', item.lethal, 'check');
      } else {
        html += field('Joint type', 'type', item.type, 'select', ['distance', 'revolute']) + field('Body A', 'bodyA', item.bodyA, 'select', bodyOptions) + field('Body B', 'bodyB', item.bodyB, 'select', bodyOptions) + field('Length', 'length', item.length || 100) + field('Frequency', 'frequency', item.frequency || 0) + field('Damping', 'damping', item.damping == null ? 0.2 : item.damping) + field('Motor enabled', 'enableMotor', item.enableMotor, 'check') + field('Motor speed', 'motorSpeed', item.motorSpeed || 0) + field('Motor torque', 'maxMotorTorque', item.maxMotorTorque || 0);
      }
      html += '</div><div class="editor-object-actions">' + (selected.kind !== 'joints' ? '<button type="button" data-action="duplicate">Duplicate</button>' : '') + '<button type="button" data-action="delete">Delete</button></div></section>';
    }
    html += '<section class="editor-section editor-counts">' + map.bodies.length + ' bodies · ' + map.spawns.length + ' spawns · ' + map.joints.length + ' joints</section>';
    inspector.innerHTML = html;
  }
  function readSaved() {
    try { var value = JSON.parse(localStorage.getItem('bonk-local-maps') || '[]'); return Array.isArray(value) ? value : []; } catch (err) { return []; }
  }
  function updateMapList() {
    var library = global.BonkMaps && global.BonkMaps.maps || [], saved = readSaved();
    loadSelect.innerHTML = '<option value="">Load a map…</option>' + (library.length ? '<optgroup label="Included maps">' + library.map(function (m, i) { return '<option value="library:' + i + '">' + escapeHtml(m.name) + '</option>'; }).join('') + '</optgroup>' : '') + (saved.length ? '<optgroup label="Saved on this browser">' + saved.map(function (m, i) { return '<option value="saved:' + i + '">' + escapeHtml(m.name) + '</option>'; }).join('') + '</optgroup>' : '');
  }
  function render() {
    buildInspector();
    root.querySelector('[data-action="undo"]').disabled = !undoStack.length;
    root.querySelector('[data-action="redo"]').disabled = !redoStack.length;
    root.querySelector('.editor-map-name').textContent = map.name;
    resize();
  }
  function resize() {
    if (!isOpen || !stage) return;
    var availableW = Math.max(180, stage.clientWidth - 16), availableH = Math.max(140, stage.clientHeight - 16);
    var factor = Math.min(availableW / map.width, availableH / map.height), w = Math.max(1, Math.round(map.width * factor)), h = Math.max(1, Math.round(map.height * factor));
    var ratio = Math.min(global.devicePixelRatio || 1, 1.5);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
    draw();
  }
  function drawBodyPath(item) {
    if (item.shape === 'circle') ctx.arc(0, 0, item.r, 0, Math.PI * 2);
    else if (item.shape === 'rect' || !item.shape) ctx.rect(-item.w / 2, -item.h / 2, item.w, item.h);
    else { item.points.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
  }
  function selectionOutline(item, colour) {
    ctx.save(); ctx.translate(item.x, item.y); ctx.rotate((item.angle || 0) * Math.PI / 180); ctx.beginPath();
    if (selected && selected.kind === 'spawns') ctx.arc(0, 0, 21, 0, Math.PI * 2);
    else if (selected && selected.kind === 'joints') ctx.arc(0, 0, 14, 0, Math.PI * 2);
    else drawBodyPath(item);
    ctx.strokeStyle = colour; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = colour; ctx.fillRect(-3, -3, 6, 6);
    if (tool === 'resize' && selected && selected.kind !== 'spawns' && selected.kind !== 'joints') {
      var handles = item.shape === 'circle' ? [[item.r, 0], [-item.r, 0], [0, item.r], [0, -item.r]] : item.shape === 'polygon' ? item.points : [[-item.w / 2, -item.h / 2], [item.w / 2, -item.h / 2], [item.w / 2, item.h / 2], [-item.w / 2, item.h / 2]];
      handles.forEach(function (point) { ctx.fillRect(point[0] - 4, point[1] - 4, 8, 8); });
    }
    ctx.restore();
  }
  function draw() {
    if (!ctx || !map || !isOpen) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (config.drawPreview) config.drawPreview(ctx, map, canvas.width, canvas.height);
    else { ctx.fillStyle = map.background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.setTransform(canvas.width / map.width, 0, 0, canvas.height / map.height, 0, 0);
    ctx.lineWidth = 2; ctx.font = '14px Roboto, Arial, sans-serif';
    map.spawns.forEach(function (spawn, i) {
      ctx.beginPath(); ctx.arc(spawn.x, spawn.y, 16, 0, Math.PI * 2); ctx.strokeStyle = spawn.team === 2 ? '#ed6262' : '#4688cf'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(spawn.x - 22, spawn.y); ctx.lineTo(spawn.x + 22, spawn.y); ctx.moveTo(spawn.x, spawn.y - 22); ctx.lineTo(spawn.x, spawn.y + 22); ctx.stroke();
      ctx.fillStyle = '#222'; ctx.fillText('P' + (i + 1) + ' · T' + spawn.team, spawn.x + 21, spawn.y - 12);
    });
    map.goals.forEach(function (goal) {
      ctx.strokeStyle = goal.team === 2 ? '#d74949' : '#347fc0'; ctx.setLineDash([8, 5]); ctx.strokeRect(goal.x - goal.w / 2, goal.y - goal.h / 2, goal.w, goal.h); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText('Goal T' + goal.team, goal.x - goal.w / 2 + 5, goal.y - goal.h / 2 + 17);
    });
    map.zones.forEach(function (zone) {
      ctx.strokeStyle = zone.lethal ? '#c72727' : '#497c56'; ctx.setLineDash([5, 5]); ctx.strokeRect(zone.x - zone.w / 2, zone.y - zone.h / 2, zone.w, zone.h); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.fillText(zone.lethal ? 'Deadly zone' : 'Force zone', zone.x - zone.w / 2 + 4, zone.y - zone.h / 2 + 16);
    });
    map.joints.forEach(function (joint) {
      var a = map.bodies.filter(function (body) { return body.id === joint.bodyA; })[0], b = map.bodies.filter(function (body) { return body.id === joint.bodyB; })[0];
      if (!a || !b) return;
      ctx.strokeStyle = '#ae8134'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(joint.x, joint.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(joint.x, joint.y, 7, 0, Math.PI * 2); ctx.stroke();
    });
    if (object()) selectionOutline(object(), '#ffe455');
    if (jointBody != null && map.bodies[jointBody]) {
      var waiting = map.bodies[jointBody]; ctx.save(); ctx.translate(waiting.x, waiting.y); ctx.rotate((waiting.angle || 0) * Math.PI / 180); ctx.beginPath(); drawBodyPath(waiting); ctx.strokeStyle = '#ffe455'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
    if (polygon.length) {
      ctx.strokeStyle = '#2d78a8'; ctx.beginPath(); polygon.forEach(function (point, i) { if (i) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y); }); ctx.stroke();
      polygon.forEach(function (point) { ctx.fillStyle = '#2d78a8'; ctx.fillRect(point.x - 3, point.y - 3, 6, 6); });
    }
    if (drag && drag.create) {
      var preview = creationShape(drag.start, drag.current, drag.create);
      ctx.save(); ctx.translate(preview.x, preview.y); ctx.beginPath(); drawBodyPath(preview); ctx.fillStyle = 'rgba(76,114,145,.3)'; ctx.fill(); ctx.strokeStyle = '#2d78a8'; ctx.stroke(); ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function pointerPoint(event) {
    var bounds = canvas.getBoundingClientRect(), x = (event.clientX - bounds.left) / bounds.width * map.width, y = (event.clientY - bounds.top) / bounds.height * map.height;
    return { x: snap ? Math.round(x / 10) * 10 : x, y: snap ? Math.round(y / 10) * 10 : y };
  }
  function localPoint(point, body) {
    var a = -(body.angle || 0) * Math.PI / 180, x = point.x - body.x, y = point.y - body.y;
    return { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a) };
  }
  function withinBody(point, body) {
    var p = localPoint(point, body);
    if (body.shape === 'circle') return p.x * p.x + p.y * p.y <= body.r * body.r;
    if (body.shape === 'rect' || !body.shape) return Math.abs(p.x) <= body.w / 2 && Math.abs(p.y) <= body.h / 2;
    var inside = false, vertices = body.points;
    for (var i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      var a = vertices[i], b = vertices[j];
      if ((a[1] > p.y) !== (b[1] > p.y) && p.x < (b[0] - a[0]) * (p.y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  function hit(point, bodiesOnly) {
    var kinds = bodiesOnly ? ['bodies'] : ['joints', 'spawns', 'bodies', 'goals', 'zones'];
    for (var k = 0; k < kinds.length; k++) {
      var kind = kinds[k];
      for (var i = map[kind].length - 1; i >= 0; i--) {
        var item = map[kind][i], near = kind === 'spawns' || kind === 'joints' ? Math.hypot(point.x - item.x, point.y - item.y) <= 24 : withinBody(point, item);
        if (near) return { kind: kind, index: i };
      }
    }
    return null;
  }
  function creationShape(start, end, kind) {
    var small = Math.hypot(end.x - start.x, end.y - start.y) < 5;
    if (kind === 'circle') return { shape: 'circle', x: start.x, y: start.y, r: small ? 35 : Math.max(5, Math.hypot(end.x - start.x, end.y - start.y)) };
    return { shape: 'rect', x: small ? start.x : (start.x + end.x) / 2, y: small ? start.y : (start.y + end.y) / 2, w: small ? kind === 'goal' ? 80 : 120 : Math.max(5, Math.abs(end.x - start.x)), h: small ? kind === 'goal' ? 150 : kind === 'zone' ? 80 : 25 : Math.max(5, Math.abs(end.y - start.y)) };
  }
  function addShape(shape, kind) {
    return mutate(function () {
      var collection;
      if (kind === 'goal') { collection = 'goals'; delete shape.shape; shape.team = 1; }
      else if (kind === 'zone') { collection = 'zones'; delete shape.shape; shape.forceX = 0; shape.forceY = -15; shape.lethal = false; shape.team = 0; }
      else { collection = 'bodies'; shape.id = uniqueId('body'); shape.angle = 0; shape.type = 'static'; shape.color = '#666666'; shape.density = 1; shape.friction = 0.3; shape.restitution = 0.2; shape.lethal = false; shape.fixedRotation = false; shape.linearVelocity = { x: 0, y: 0 }; shape.angularVelocity = 0; shape.force = { x: 0, y: 0 }; }
      map[collection].push(shape); selected = { kind: collection, index: map[collection].length - 1 };
    }, 'Created ' + toolNames[kind].toLowerCase() + '.');
  }
  function convexHull(points) {
    var sorted = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; }).filter(function (p, i, list) { return !i || p.x !== list[i - 1].x || p.y !== list[i - 1].y; });
    function cross(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
    var lower = [], upper = [];
    sorted.forEach(function (p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); });
    sorted.slice().reverse().forEach(function (p) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); });
    lower.pop(); upper.pop(); return lower.concat(upper);
  }
  function finishPolygon() {
    var points = convexHull(polygon);
    if (points.length < 3) { say('A polygon needs at least three non-collinear points.', true); return; }
    if (points.length > 8) { say('Use at most 8 outline vertices per body. Multiple bodies can form a more complex shape.', true); return; }
    var centre = { x: 0, y: 0 }; points.forEach(function (p) { centre.x += p.x / points.length; centre.y += p.y / points.length; });
    if (addShape({ shape: 'polygon', x: centre.x, y: centre.y, points: points.map(function (p) { return [p.x - centre.x, p.y - centre.y]; }) }, 'polygon')) {
      polygon = []; draw();
      say('Convex polygon created. Use multiple bodies for a concave outline.');
    }
  }
  function down(event) {
    if (event.button !== 0) return;
    event.preventDefault(); canvas.focus();
    var point = pointerPoint(event), target;
    if (tool === 'polygon') {
      if (!polygon.length || Math.hypot(polygon[polygon.length - 1].x - point.x, polygon[polygon.length - 1].y - point.y) > 3) polygon.push(point);
      draw(); return;
    }
    if (tool === 'spawn') { mutate(function () { map.spawns.push({ x: point.x, y: point.y, team: map.spawns.length % 2 + 1 }); selected = { kind: 'spawns', index: map.spawns.length - 1 }; }, 'Spawn added.'); return; }
    if (tool === 'joint') {
      target = hit(point, true);
      if (!target) { say('Choose a body to attach the joint.', true); return; }
      if (jointBody == null) { jointBody = target.index; say('Now click the second body.'); draw(); return; }
      if (jointBody === target.index) { say('Choose a different second body.', true); return; }
      mutate(function () {
        var a = map.bodies[jointBody], b = map.bodies[target.index];
        map.joints.push({ id: uniqueId('joint'), type: 'distance', bodyA: a.id, bodyB: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, length: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), frequency: 0, damping: 0.2, motorSpeed: 0, maxMotorTorque: 0, enableMotor: false });
        selected = { kind: 'joints', index: map.joints.length - 1 }; jointBody = null;
      }, 'Joint created.'); return;
    }
    if (['rect', 'circle', 'goal', 'zone'].indexOf(tool) >= 0) drag = { start: point, current: point, create: tool };
    else {
      target = hit(point, false);
      if (tool === 'select' || !object()) selected = target;
      else if (target) selected = target;
      buildInspector(); draw();
      if (!object()) return;
      if (tool === 'rotate' && selected.kind !== 'bodies') { say('Only physical bodies support rotation.', true); return; }
      if (tool === 'resize' && selected.kind === 'spawns') { say('Spawns are points; use Select / move to position them.', true); return; }
      drag = { start: point, current: point, before: encode(map), item: clone(object()), action: tool };
    }
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
  }
  function move(event) {
    if (!drag) return;
    var point = pointerPoint(event); drag.current = point;
    if (!drag.create) {
      var item = object(), original = drag.item;
      if (!item) return;
      if (drag.action === 'rotate') {
        var from = Math.atan2(drag.start.y - original.y, drag.start.x - original.x), to = Math.atan2(point.y - original.y, point.x - original.x);
        item.angle = original.angle + (to - from) * 180 / Math.PI;
        if (event.shiftKey) item.angle = Math.round(item.angle / 15) * 15;
      } else if (drag.action === 'resize') {
        var local = localPoint(point, original);
        if (item.shape === 'circle') item.r = clamp(Math.hypot(local.x, local.y), 5, 3000);
        else if (item.shape === 'polygon') {
          var factor = clamp(Math.hypot(point.x - original.x, point.y - original.y) / Math.max(10, Math.hypot(drag.start.x - original.x, drag.start.y - original.y)), 0.05, 20);
          item.points = original.points.map(function (p) { return [p[0] * factor, p[1] * factor]; });
        } else if (selected.kind === 'joints') item.length = Math.max(1, Math.hypot(local.x, local.y) * 2);
        else { item.w = Math.max(5, Math.abs(local.x) * 2); item.h = Math.max(5, Math.abs(local.y) * 2); }
      } else {
        item.x = original.x + point.x - drag.start.x; item.y = original.y + point.y - drag.start.y;
        if (snap) { item.x = Math.round(item.x / 10) * 10; item.y = Math.round(item.y / 10) * 10; }
      }
    }
    draw();
  }
  function up(event) {
    if (!drag) return;
    var ended = drag; drag = null;
    if (ended.create) addShape(creationShape(ended.start, ended.current, ended.create), ended.create);
    else commit(ended.before, 'Object updated.');
    if (event && canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }
  function deleteSelected() {
    if (!object()) return;
    mutate(function () {
      var removed = object();
      if (selected.kind === 'bodies') map.joints = map.joints.filter(function (joint) { return joint.bodyA !== removed.id && joint.bodyB !== removed.id; });
      map[selected.kind].splice(selected.index, 1); selected = null;
    }, 'Object removed. Related joints are removed with a body.');
  }
  function duplicate() {
    if (!object() || selected.kind === 'joints') return;
    mutate(function () {
      var item = clone(object()); item.x += 25; item.y += 25;
      if (selected.kind === 'bodies') item.id = uniqueId('body');
      map[selected.kind].push(item); selected.index = map[selected.kind].length - 1;
    }, 'Object duplicated.');
  }
  function propertyChange(event) {
    var path = event.target.dataset.property;
    if (!path) return;
    var target = path.indexOf('map.') === 0 ? map : object(), parts = path.replace(/^map\./, '').split('.'), value;
    if (!target) return;
    try {
      value = event.target.type === 'checkbox' ? event.target.checked : event.target.type === 'number' ? Number(event.target.value) : path === 'points' ? JSON.parse(event.target.value) : event.target.value;
      if (parts[parts.length - 1] === 'team') value = Number(value);
      if (event.target.type === 'number' && (!event.target.value.trim() || !Number.isFinite(value))) throw new Error('Enter a finite number.');
      mutate(function () {
        for (var i = 0; i < parts.length - 1; i++) { if (!target[parts[i]]) target[parts[i]] = {}; target = target[parts[i]]; }
        target[parts[parts.length - 1]] = value;
      }, 'Property updated.');
    } catch (err) { render(); say(err.message, true); }
  }
  function save() {
    try {
      var saved = readSaved(), value = validate(map);
      if (value.id.indexOf('local-') !== 0) value.id = 'local-' + Date.now();
      value.source = { url: value.source && value.source.url || '', evidence: 'Local map saved in the editor. Its geometry has not been historically verified.', historicalVerified: false };
      saved = saved.filter(function (entry) { return entry.id !== value.id; }); saved.push(value);
      localStorage.setItem('bonk-local-maps', encode(saved));
      map = value; updateMapList(); render();
      if (config.onSave) config.onSave(clone(map));
      say('Saved on this browser. Export JSON to keep a portable backup.');
    } catch (err) { say('Save failed: ' + err.message + ' Export JSON still works.', true); }
  }
  function exportMap() {
    try {
      var value = validate(map), blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = (value.name || 'map').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.bonk-map.json'; link.style.display = 'none'; root.appendChild(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      say('JSON exported. Import it to restore all map properties.');
    } catch (err) { say(err.message, true); }
  }
  function importFile(event) {
    var file = event.target.files && event.target.files[0]; importedInput.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { say('Map files must be smaller than 2 MB. Your current map is unchanged.', true); return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = validate(JSON.parse(reader.result));
        mutate(function () { map = imported; selected = null; polygon = []; jointBody = null; }, 'Imported ' + imported.name + '. Undo restores the previous map.');
      } catch (err) { say('Import failed: ' + err.message + ' Your current map is unchanged.', true); }
    };
    reader.onerror = function () { say('The file could not be read. Your current map is unchanged.', true); };
    reader.readAsText(file);
  }
  function action(event) {
    var button = event.target.closest('[data-action], [data-tool]');
    if (!button || !root.contains(button)) return;
    if (button.dataset.tool) { setTool(button.dataset.tool); return; }
    var name = button.dataset.action;
    if (name === 'new') { mutate(function () { map = blankMap(); selected = null; polygon = []; jointBody = null; }, 'New map created. Undo restores the previous map.'); updateMapList(); }
    else if (name === 'undo' || name === 'redo') history(name === 'redo');
    else if (name === 'delete') deleteSelected();
    else if (name === 'duplicate') duplicate();
    else if (name === 'save') save();
    else if (name === 'export') exportMap();
    else if (name === 'import') importedInput.click();
    else if (name === 'test') { try { if (config.onTest) config.onTest(validate(map)); } catch (err) { say(err.message, true); } }
    else if (name === 'back' && config.onBack) config.onBack();
  }
  function keydown(event) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); history(event.shiftKey); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); history(true); return; }
    if (event.key === 'Escape') { event.preventDefault(); if (drag && drag.before) map = JSON.parse(drag.before); drag = null; polygon = []; jointBody = null; setTool('select'); render(); return; }
    if (event.key === 'Enter' && tool === 'polygon') { event.preventDefault(); finishPolygon(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelected(); return; }
    if (object() && /^Arrow/.test(event.key)) {
      event.preventDefault();
      mutate(function () { var item = object(), amount = event.shiftKey || snap ? 10 : 1; item.x += event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0; item.y += event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0; }, 'Selection moved.');
    }
  }
  function init(options) {
    config = options; root = options.container; root.classList.add('bonk-editor');
    root.innerHTML = '<div class="editor-header"><strong>MAP EDITOR <span class="editor-map-name"></span></strong><div class="editor-header-actions"><button data-action="new" type="button">New</button><select class="editor-map-list" aria-label="Load a map"></select><button data-action="save" type="button">Save</button><button data-action="import" type="button">Import</button><button data-action="export" type="button">Export</button><button data-action="test" type="button" class="editor-test">Test map</button><button data-action="back" type="button">Back</button></div></div>' +
      '<div class="editor-toolbar" role="toolbar" aria-label="Map tools">' + Object.keys(toolNames).map(function (name) { return '<button type="button" data-tool="' + name + '" title="' + hints[name] + '" aria-pressed="false">' + toolNames[name] + '</button>'; }).join('') + '<span class="editor-toolbar-end"><label><input type="checkbox" class="editor-snap"> Snap 10 px</label><button data-action="undo" type="button" title="Ctrl+Z">Undo</button><button data-action="redo" type="button" title="Ctrl+Y">Redo</button></span></div>' +
      '<div class="editor-main"><div class="editor-stage"><canvas tabindex="0" aria-label="Map editing canvas. Use the toolbar to select a tool. Arrow keys move a selected object."></canvas></div><aside class="editor-inspector" aria-label="Map and object properties"></aside></div><div class="editor-status" role="status" aria-live="polite"></div><input class="editor-file" type="file" accept=".json,application/json">';
    canvas = root.querySelector('canvas'); ctx = canvas.getContext('2d'); stage = root.querySelector('.editor-stage'); inspector = root.querySelector('.editor-inspector'); status = root.querySelector('.editor-status'); importedInput = root.querySelector('.editor-file'); loadSelect = root.querySelector('.editor-map-list');
    root.addEventListener('click', action); inspector.addEventListener('change', function (event) {
      if (event.target.classList.contains('editor-object-list')) { var value = event.target.value.split(':'); selected = value.length === 2 ? { kind: value[0], index: Number(value[1]) } : null; buildInspector(); draw(); }
      else propertyChange(event);
    }); root.addEventListener('keydown', keydown);
    root.querySelector('.editor-snap').addEventListener('change', function (event) { snap = event.target.checked; });
    importedInput.addEventListener('change', importFile);
    loadSelect.addEventListener('change', function (event) {
      var parts = event.target.value.split(':'), list = parts[0] === 'library' ? global.BonkMaps.maps : readSaved(), value = list[Number(parts[1])];
      if (!event.target.value || !value) return;
      try { var loaded = validate(value); mutate(function () { map = loaded; selected = null; polygon = []; jointBody = null; }, 'Loaded ' + loaded.name + '. Undo restores the previous map.'); } catch (err) { say(err.message, true); }
      loadSelect.value = '';
    });
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', function () { if (drag && drag.before) map = JSON.parse(drag.before); drag = null; render(); });
    canvas.addEventListener('dblclick', function (event) { if (tool === 'polygon') { event.preventDefault(); finishPolygon(); } });
    global.addEventListener('resize', resize);
    if (global.ResizeObserver) { resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage); }
    root.hidden = true;
  }
  function open(value) {
    if (!root) throw new Error('Initialize BonkEditor before opening it.');
    if (value || !map) { map = validate(value || blankMap()); undoStack = []; redoStack = []; selected = null; }
    isOpen = true; root.hidden = false; updateMapList(); setTool('select'); render();
    global.requestAnimationFrame(resize);
  }
  function close() { isOpen = false; if (root) root.hidden = true; drag = null; }
  function getMap() { return validate(map); }
  function selfCheck() {
    var test = blankMap(), result = convexHull([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 10, y: 10 }]);
    if (result.length !== 4) throw new Error('Editor convex hull check failed.');
    if (!withinBody({ x: 8, y: 0 }, { shape: 'rect', x: 0, y: 0, w: 5, h: 20, angle: 90 })) throw new Error('Editor rotated selection check failed.');
    test.bodies.push({ id: 'poly', shape: 'polygon', x: 200, y: 200, angle: 17, points: [[-20, -20], [20, -20], [0, 20]], type: 'dynamic', color: '#ccaa88', density: 1.3, friction: 0.1, restitution: 0.7, lethal: false, fixedRotation: true, linearVelocity: { x: 2, y: 3 }, angularVelocity: 0.2, force: { x: 0, y: -2 } });
    test.zones.push({ x: 200, y: 300, w: 100, h: 40, forceX: 0, forceY: -5, lethal: false, team: 0 });
    test.goals.push({ x: 50, y: 500, w: 80, h: 140, team: 1 });
    test.joints.push({ id: 'joint1', type: 'distance', bodyA: 'body1', bodyB: 'poly', x: 300, y: 300, length: 100, frequency: 0, damping: 0.2, enableMotor: false, motorSpeed: 0, maxMotorTorque: 0 });
    test.mode = 'football';
    var valid = validate(test), roundTrip = validate(JSON.parse(JSON.stringify(valid)));
    if (encode(valid) !== encode(roundTrip)) throw new Error('Editor JSON round-trip check failed.');
    return 'Editor checks passed: convex polygon, rotated hit test, complete map JSON round trip.';
  }
  global.BonkEditor = { init: init, open: open, close: close, getMap: getMap, selfCheck: selfCheck };
}(typeof window !== 'undefined' ? window : globalThis));
