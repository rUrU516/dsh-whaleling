/** Shared validated appearance contract for Host, Client and tests. */
export const APPEARANCE_DEFAULTS = Object.freeze({
  enabled: true, tint: '#4896a6', brightness: 1.12, opacity: .16, waveStrength: 1, speed: 1, damping: .15,
});
export const APPEARANCE_RANGES = Object.freeze({
  brightness: [.5, 2], opacity: [0, .5], waveStrength: [0, 2], speed: [0, 2], damping: [0, 1],
});
export function normalizeAppearance(input = {}) {
  const result = { ...APPEARANCE_DEFAULTS };
  if (typeof input.enabled === 'boolean') result.enabled = input.enabled;
  if (typeof input.tint === 'string' && /^#[\da-f]{6}$/i.test(input.tint)) result.tint = input.tint.toLowerCase();
  for (const [key, [min, max]] of Object.entries(APPEARANCE_RANGES)) {
    if (typeof input[key] === 'number' && Number.isFinite(input[key])) result[key] = Math.min(max, Math.max(min, input[key]));
  }
  return result;
}
export function tintRGB(tint) {
  return [1, 3, 5].map((offset) => parseInt(tint.slice(offset, offset + 2), 16) / 255);
}
