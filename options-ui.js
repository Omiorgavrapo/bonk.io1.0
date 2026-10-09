(function (root) {
  'use strict';
  function mount(container, prefix, onChange, onError) {
    var rules = BonkCore.normalizeRules(), disabled = false;
    container.innerHTML = '<div class="physics-heading"><div><span class="section-kicker">PERSONALIZE</span><h2>Regras da partida</h2></div><button type="button" class="rules-reset">Restaurar padrão</button></div><div class="physics-grid">' + Object.keys(BonkCore.RULES).map(function (key) {
      var def = BonkCore.RULES[key], id = prefix + '-' + key;
      return '<div class="physics-option"><div class="physics-label"><label for="' + id + '">' + def.label + '</label><div class="physics-value"><input id="' + id + '" data-rule="' + key + '" type="number" min="' + def.min + '" max="' + def.max + '" step="' + def.step + '" aria-describedby="' + id + '-hint"><span>' + def.unit + '</span></div></div><input type="range" data-slider="' + key + '" min="' + def.min + '" max="' + def.max + '" step="' + def.step + '" aria-label="' + def.label + '"><p id="' + id + '-hint">' + def.hint + '</p></div>';
    }).join('') + '</div>';
    function set(value, readonly) {
      rules = BonkCore.normalizeRules(value); disabled = !!readonly;
      Object.keys(rules).forEach(function (key) { ['[data-rule="' + key + '"]', '[data-slider="' + key + '"]'].forEach(function (selector) { var input = container.querySelector(selector); input.value = rules[key]; input.disabled = disabled; }); });
      container.querySelector('.rules-reset').disabled = disabled;
      container.classList.toggle('rules-readonly', disabled);
    }
    function commit(key, value) {
      if (disabled) return;
      try { if (String(value).trim() === '') throw Error('Preencha o valor de ' + BonkCore.RULES[key].label.toLowerCase() + '.'); var next = Object.assign({}, rules); next[key] = Number(value); next = BonkCore.normalizeRules(next); set(next, false); onChange(next); }
      catch (error) { set(rules, false); if (onError) onError(error.message); }
    }
    container.querySelectorAll('[data-rule]').forEach(function (input) { input.onchange = function () { commit(input.dataset.rule, input.value); }; });
    container.querySelectorAll('[data-slider]').forEach(function (input) {
      input.oninput = function () { container.querySelector('[data-rule="' + input.dataset.slider + '"]').value = input.value; };
      input.onchange = function () { commit(input.dataset.slider, input.value); };
    });
    container.querySelector('.rules-reset').onclick = function () { if (!disabled) { set(BonkCore.normalizeRules(), false); onChange(rules); } };
    set(rules, false); return { set: set };
  }
  root.BonkOptions = { mount: mount };
}(typeof globalThis !== 'undefined' ? globalThis : this));
