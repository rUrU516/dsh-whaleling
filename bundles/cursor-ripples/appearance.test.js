import test from 'node:test';
import assert from 'node:assert/strict';
import { APPEARANCE_DEFAULTS, normalizeAppearance, tintRGB } from './appearance.js';
import { createAppearanceModel } from './appearance-model.js';
import { PANEL_DICTS, OCEAN_BUOYS, placeBuoyControl } from './settings-panel.js';
import { setTimeout as delay } from 'node:timers/promises';

test('defaults preserve the accepted 0.5.1 appearance', () => {
  assert.deepEqual(normalizeAppearance({}), APPEARANCE_DEFAULTS);
  assert.deepEqual(tintRGB('#ffffff'), [1, 1, 1]);
  assert.deepEqual(tintRGB('#000000'), [0, 0, 0]);
});
test('appearance normalizes bounds, malformed colors and nonfinite input', () => {
  assert.deepEqual(normalizeAppearance({ brightness: Infinity, opacity: -1, waveStrength: 8, speed: NaN, tint: 'red', enabled: 'no' }),
    { ...APPEARANCE_DEFAULTS, opacity: 0, waveStrength: 2 });
  assert.equal(normalizeAppearance({ tint: '#AB34FF' }).tint, '#ab34ff');
});
test('damping defaults, bounds and persisted updates use the shared settings contract', async () => {
  assert.equal(normalizeAppearance({}).damping, .15);
  assert.equal(normalizeAppearance({ damping: -1 }).damping, 0);
  assert.equal(normalizeAppearance({ damping: 2 }).damping, 1);
  assert.equal(normalizeAppearance({ damping: NaN }).damping, .15);
  const f = fixture();
  const model = createAppearanceModel(f.form, APPEARANCE_DEFAULTS, normalizeAppearance, () => 'refused');
  model.update({ damping: .7 });
  assert.equal(model.getSnapshot().settings.damping, .7);
  await delay(280);
  assert.deepEqual(f.writes[0], [{ op: 'set', path: ['damping'], value: .7 }]);
  assert.equal(model.getSnapshot().settings.damping, .7);
  model.reset(); await delay(280);
  assert.equal(model.getSnapshot().settings.damping, .15);
  model.dispose();
});
test('panel dictionaries have the same complete key set', () => {
  assert.deepEqual(Object.keys(PANEL_DICTS.en).sort(), Object.keys(PANEL_DICTS.zh).sort());
  for (const value of Object.values(PANEL_DICTS.zh)) assert.equal(typeof value, 'string');
});
test('buoys expose every adjustable field once with localized labels and hints', () => {
  assert.deepEqual(OCEAN_BUOYS.map(b => b.key).sort(), ['tint', 'brightness', 'opacity', 'waveStrength', 'speed', 'damping'].sort());
  for (const buoy of OCEAN_BUOYS) {
    assert.ok(buoy.x > 0 && buoy.x < 1 && buoy.y > 0 && buoy.y < 1);
    for (const dict of Object.values(PANEL_DICTS)) {
      assert.ok(dict[`oceanSettings.${buoy.key}`]);
      assert.ok(dict[`oceanSettings.${buoy.key}Hint`]);
      if (buoy.key !== 'tint') {
        assert.ok(dict[`oceanSettings.${buoy.key}Low`] && dict[`oceanSettings.${buoy.key}High`]);
        assert.ok(APPEARANCE_DEFAULTS[buoy.key] >= buoy.min && APPEARANCE_DEFAULTS[buoy.key] <= buoy.max);
      }
    }
  }
});
test('local controls stay inside narrow and wide water canvases', () => {
  for (const width of [240, 280, 320, 540, 760]) {
    for (const height of [500, 540, 720]) {
      for (const buoy of OCEAN_BUOYS) {
        const result = placeBuoyControl(width, height, buoy, 238, 200);
        assert.ok(result.left >= 12 && result.top >= 12);
        assert.ok(result.left + result.width <= width - 12 + 1e-8);
        assert.ok(result.top + 200 <= height - 12 + 1e-8);
      }
    }
  }
});
function fixture() {
  let state = { status: 'ready', writable: true, value: { ...APPEARANCE_DEFAULTS } };
  const listeners = new Set();
  const writes = [];
  let fail = false;
  let reject = false;
  const form = {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async mutate(ops) {
      writes.push(ops);
      if (reject) throw new Error('offline');
      if (fail) return false;
      state = { ...state, value: { ...state.value } };
      for (const op of ops) state.value[op.path[0]] = op.value;
      for (const fn of listeners) fn();
      return true;
    },
  };
  return { form, writes, setFail: value => { fail = value; }, setReject: value => { reject = value; },
    change(patch) { state = { ...state, ...patch }; for (const fn of listeners) fn(); } };
}
test('preview is immediate; rapid changes debounce into one atomic Host write', async () => {
  const f = fixture();
  const model = createAppearanceModel(f.form, APPEARANCE_DEFAULTS, normalizeAppearance, () => 'refused');
  const initial = model.getSnapshot();
  assert.equal(model.getSnapshot(), initial);
  model.update({ brightness: 1.3 });
  model.update({ tint: '#ff8844', opacity: .2 });
  assert.equal(model.getSnapshot().settings.brightness, 1.3);
  assert.equal(model.getSnapshot().saving, true);
  assert.equal(f.writes.length, 0);
  await delay(280);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].length, 3);
  assert.equal(model.getSnapshot().saving, false);
  assert.equal(model.getSnapshot().error, '');
  model.dispose();
});
test('Host refusal and transport error roll back preview and report a failure', async () => {
  const f = fixture();
  const model = createAppearanceModel(f.form, APPEARANCE_DEFAULTS, normalizeAppearance, () => 'refused');
  f.setFail(true); model.update({ brightness: 1.7 }); await delay(280);
  assert.equal(model.getSnapshot().error, 'refused');
  assert.equal(model.getSnapshot().settings.brightness, 1.12);
  f.setFail(false); f.setReject(true); model.update({ opacity: .3 }); await delay(280);
  assert.equal(model.getSnapshot().error, 'offline');
  assert.equal(model.getSnapshot().settings.opacity, .16);
  model.dispose();
});
test('accepted remote changes, reset, and read-only protection share the same model', async () => {
  const f = fixture();
  const model = createAppearanceModel(f.form, APPEARANCE_DEFAULTS, normalizeAppearance, () => 'refused');
  f.change({ value: { ...APPEARANCE_DEFAULTS, brightness: 1.4 } });
  assert.equal(model.getSnapshot().settings.brightness, 1.4);
  model.reset(); await delay(280);
  assert.deepEqual(model.getSnapshot().settings, APPEARANCE_DEFAULTS);
  f.change({ writable: false }); model.update({ opacity: .5 });
  assert.equal(model.getSnapshot().settings.opacity, .16);
  model.dispose();
});
