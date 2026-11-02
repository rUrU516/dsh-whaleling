import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterField } from './water-field.js';

function peak(field) {
  let maximum = 0;
  for (const value of field.current) {
    assert.ok(Number.isFinite(value), 'every height remains finite');
    maximum = Math.max(maximum, Math.abs(value));
  }
  return maximum;
}

function rms(field) {
  let sum = 0;
  for (const value of field.current) sum += value * value;
  return Math.sqrt(sum / field.current.length);
}

test('dimensions are validated and current is a row-major Float32Array', () => {
  const field = new WaterField(7, 5);
  assert.equal(field.width, 7);
  assert.equal(field.height, 5);
  assert.ok(field.current instanceof Float32Array);
  assert.equal(field.current.length, 35);
  for (const [width, height] of [[0, 2], [2, -1], [2.5, 3], [NaN, 3], [3, Infinity]]) {
    assert.throws(() => new WaterField(width, height), RangeError);
  }
});

test('an undisturbed field stays exactly zero and encodes flat as 128', () => {
  for (const [width, height] of [[1, 1], [1, 7], [7, 1], [17, 13]]) {
    const field = new WaterField(width, height);
    for (let i = 0; i < 600; i++) field.step();
    for (const height of field.current) assert.equal(height, 0);
    const pixels = new Uint8Array(width * height * 4);
    assert.equal(field.writeNormals(pixels), pixels);
    for (let i = 0; i < pixels.length; i += 4) {
      assert.deepEqual([...pixels.subarray(i, i + 4)], [128, 128, 128, 255]);
    }
  }
});

test('cosine disturbance supports fractional grid coordinates and smooth compact support', () => {
  const field = new WaterField(17, 17);
  field.disturb(8, 8, 4, 0.6);
  assert.ok(Math.abs(field.current[8 * 17 + 8] - 0.6) < 1e-6);
  assert.ok(Math.abs(field.current[8 * 17 + 10] - 0.3) < 1e-6);
  assert.equal(field.current[8 * 17 + 12], 0);
  const fractional = new WaterField(8, 8);
  fractional.disturb(3.5, 3.5, 2, 0.5);
  assert.ok(fractional.current[3 * 8 + 3] > 0);
  assert.equal(fractional.current[3 * 8 + 3], fractional.current[4 * 8 + 4]);
  assert.equal(fractional.current[3 * 8 + 4], fractional.current[4 * 8 + 3]);
});

test('waves propagate outside the original disturbed support', () => {
  const field = new WaterField(41, 41);
  field.disturb(20, 20, 2, 0.5);
  const remote = 20 * field.width + 25;
  assert.equal(field.current[remote], 0);
  let remotePeak = 0;
  for (let i = 0; i < 35; i++) {
    field.step();
    remotePeak = Math.max(remotePeak, Math.abs(field.current[remote]));
  }
  assert.ok(remotePeak > 0.001, `remote peak ${remotePeak} should show propagation`);
});

test('unforced waves remain finite, bounded, and decay over 3000 ticks', () => {
  const field = new WaterField(47, 39);
  field.disturb(23, 19, 5, 0.8);
  field.disturb(10, 11, 3.5, -0.4);
  const initialRms = rms(field);
  let observedPeak = peak(field);
  for (let i = 0; i < 3000; i++) {
    field.step();
    observedPeak = Math.max(observedPeak, peak(field));
  }
  assert.ok(observedPeak <= 1, `bounded peak: ${observedPeak}`);
  assert.ok(rms(field) < initialRms * 1e-5, `RMS decays: ${initialRms} -> ${rms(field)}`);
  assert.ok(peak(field) < 1e-5, `remaining peak: ${peak(field)}`);
});

test('repeated strong forcing saturates without accumulating unbounded height', () => {
  const field = new WaterField(23, 19);
  for (let i = 0; i < 1000; i++) field.disturb(11, 9, 4, 1e100);
  assert.equal(field.current[9 * field.width + 11], 1);
  for (let i = 0; i < 1200; i++) {
    field.disturb(11 + Math.sin(i * 0.1) * 6, 9, 3.5, i % 2 ? 1e100 : -1e100);
    field.step();
    assert.ok(peak(field) <= 1);
  }
  for (let i = 0; i < 2400; i++) field.step();
  assert.ok(peak(field) < 1e-5, 'forced field also decays after input stops');
});

test('edge sponge removes more of an equal pulse than the interior', () => {
  const center = new WaterField(41, 41);
  const edge = new WaterField(41, 41);
  center.disturb(20, 20, 0.5, 0.5);
  edge.disturb(0, 20, 0.5, 0.5);
  center.step();
  edge.step();
  const centerNeighbor = center.current[20 * 41 + 21];
  const edgeNeighbor = edge.current[20 * 41 + 1];
  assert.ok(edgeNeighbor > 0);
  assert.ok(edgeNeighbor < centerNeighbor, `${edgeNeighbor} < ${centerNeighbor}`);
});

test('higher damping dissipates an identical pulse faster without resetting its shape', () => {
  const low = new WaterField(81, 81);
  const high = new WaterField(81, 81);
  for (const field of [low, high]) field.disturb(40, 40, 4, .6);
  let lowEnergy = 0, highEnergy = 0;
  for (let tick = 0; tick < 180; tick++) {
    low.step(.02); high.step(.8);
    if (tick >= 120) { lowEnergy += rms(low) ** 2; highEnergy += rms(high) ** 2; }
  }
  assert.ok(highEnergy < lowEnergy * .1, `${highEnergy} < ${lowEnergy} * .1`);
  const before = low.current;
  low.step(1);
  assert.notEqual(low.current, before, 'changing damping advances existing state');
  assert.ok(peak(low) > 0, 'changing damping does not clear the waves');
});

test('zero and maximum damping remain finite and bounded under repeated forcing', () => {
  for (const damping of [0, 1]) {
    const field = new WaterField(31, 27);
    for (let tick = 0; tick < 1800; tick++) {
      if (tick < 600) field.disturb(15 + Math.sin(tick) * 7, 13, 3, .5);
      field.step(damping);
      assert.ok(peak(field) <= 1);
    }
  }
});

test('damping default preserves original recurrence and invalid values are rejected', () => {
  const field = new WaterField(25, 25);
  field.disturb(12, 12, .5, .5);
  field.step();
  assert.ok(Math.abs(field.current[12 * 25 + 13] - .985 * .28 * .5) < 1e-7);
  for (const damping of [-.1, 1.1, Infinity, NaN, '0.2', null]) {
    assert.throws(() => field.step(damping), RangeError);
  }
});

test('normal bytes use signed central differences, height, and opaque alpha', () => {
  const field = new WaterField(3, 3);
  // A plane h(x,y)=0.1*x-0.05*y, centered at the middle cell.
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) field.current[y * 3 + x] = 0.1 * (x - 1) - 0.05 * (y - 1);
  }
  const pixels = field.writeNormals(new Uint8Array(36));
  const offset = (1 * 3 + 1) * 4;
  assert.deepEqual([...pixels.subarray(offset, offset + 4)], [159, 112, 128, 255]);
  for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 255);
  field.current.fill(0);
  field.current[3] = -1;
  field.current[5] = 1;
  field.writeNormals(pixels);
  assert.equal(pixels[offset], 255, 'large positive slope saturates');
  assert.equal(pixels[3 * 4 + 2], 0, 'height -1 encodes to 0');
  assert.equal(pixels[5 * 4 + 2], 255, 'height +1 encodes to 255');
  field.current[3] = 1;
  field.current[5] = -1;
  field.writeNormals(pixels);
  assert.equal(pixels[offset], 0, 'large negative slope saturates');
});

test('encoding requires an exact-sized Uint8Array and supports byte views', () => {
  const field = new WaterField(4, 3);
  assert.throws(() => field.writeNormals(new Uint8Array(47)), RangeError);
  assert.throws(() => field.writeNormals(new Uint8Array(49)), RangeError);
  assert.throws(() => field.writeNormals(new Float32Array(48)), TypeError);
  assert.throws(() => field.writeNormals(new Uint8ClampedArray(48)), TypeError);
  assert.throws(() => field.writeNormals(null), TypeError);
  const backing = new Uint8Array(52).fill(77);
  const view = backing.subarray(2, 50);
  assert.equal(field.writeNormals(view), view);
  assert.deepEqual([...backing.subarray(0, 2)], [77, 77]);
  assert.deepEqual([...backing.subarray(50)], [77, 77]);
});

test('invalid disturbance input is rejected without poisoning the field', () => {
  const field = new WaterField(9, 7);
  for (const args of [[NaN, 3, 2, 1], [3, Infinity, 2, 1], [3, 3, 0, 1],
    [3, 3, -1, 1], [3, 3, Infinity, 1], [3, 3, 2, NaN]]) {
    assert.throws(() => field.disturb(...args), RangeError);
  }
  field.disturb(-100, -100, 2, 1);
  field.disturb(4, 3, 2, 0);
  assert.equal(peak(field), 0);
  field.disturb(0, 0, 2, -2);
  assert.equal(field.current[0], -1);
  for (let i = 0; i < 100; i++) field.step();
  assert.ok(peak(field) <= 1);
});
