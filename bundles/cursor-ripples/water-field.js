// Original, dependency-free finite-difference water simulation.
const WAVE_COEFFICIENT = 0.28;
const INTERIOR_RETENTION = 0.985;
const EDGE_LOSS = 0.18;
const SLOPE_SCALE = 2.5;

const clampHeight = (value) => Math.max(-1, Math.min(1, value));
const encodeSigned = (value) => Math.round((clampHeight(value) * 0.5 + 0.5) * 255);

/**
 * A row-major height field with unit grid spacing and a fixed 1/60-second step.
 * Heights and disturbance strengths are dimensionless, bounded to [-1, 1].
 * No DOM, WebGL, timers, dependencies, or environment-specific globals are used.
 */
export class WaterField {
  #previous;
  #next;
  #retention;

  /** @param {number} width Positive integer number of columns.
   *  @param {number} height Positive integer number of rows. */
  constructor(width, height) {
    if (!Number.isSafeInteger(width) || width < 1 ||
        !Number.isSafeInteger(height) || height < 1 ||
        !Number.isSafeInteger(width * height)) {
      throw new RangeError('WaterField dimensions must be positive safe integers');
    }
    this.width = width;
    this.height = height;
    /**
     * Current heights: current[y * width + x]. step() rotates the arrays;
     * read this property again after stepping instead of caching its reference.
     */
    this.current = new Float32Array(width * height);
    this.#previous = new Float32Array(width * height);
    this.#next = new Float32Array(width * height);
    this.#retention = new Float32Array(width * height);

    // A quadratic sponge over up to eight cells; zero-height exterior neighbors
    // and stronger edge loss absorb outgoing waves rather than wrap them around.
    const spongeWidth = Math.min(8, Math.max(1, Math.min(width, height) / 4));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const distance = Math.min(x, y, width - 1 - x, height - 1 - y);
        const edge = Math.max(0, 1 - distance / spongeWidth);
        this.#retention[y * width + x] = INTERIOR_RETENTION * (1 - EDGE_LOSS * edge * edge);
      }
    }
  }

  /**
   * Add a compact, smooth cosine displacement, centered on fractional GRID
   * coordinates (x, y), with support distance < radius (also in grid cells).
   * strength is clamped to [-1, 1], as are all resulting heights. Apply the same
   * accepted displacement to the previous state to avoid injecting artificial
   * velocity on every call. Repeated saturated input cannot accumulate height.
   * Off-grid centers are allowed; only the overlapping part is applied.
   */
  disturb(x, y, radius, strength) {
    if (!Number.isFinite(x) || !Number.isFinite(y) ||
        !Number.isFinite(radius) || radius <= 0 || !Number.isFinite(strength)) {
      throw new RangeError('disturb requires finite coordinates/strength and a positive finite radius');
    }
    const amplitude = clampHeight(strength);
    if (amplitude === 0) return;
    const { width, height, current } = this;
    const minX = Math.max(0, Math.ceil(x - radius));
    const maxX = Math.min(width - 1, Math.floor(x + radius));
    const minY = Math.max(0, Math.ceil(y - radius));
    const maxY = Math.min(height - 1, Math.floor(y + radius));
    for (let row = minY; row <= maxY; row++) {
      for (let col = minX; col <= maxX; col++) {
        const distance = Math.hypot((col - x) / radius, (row - y) / radius);
        if (distance >= 1) continue;
        const index = row * width + col;
        const weight = 0.5 * (1 + Math.cos(Math.PI * distance));
        const before = current[index];
        const after = clampHeight(before + amplitude * weight);
        current[index] = after;
        this.#previous[index] = clampHeight(this.#previous[index] + (current[index] - before));
      }
    }
  }

  /**
   * Advance exactly one 60 Hz tick. With L(u) = left+right+up+down-4*u:
   * next = retention * (2*current - previous + 0.28*L(current)).
   * The squared Courant number 0.28 is below the 2-D five-point limit 0.5
   * (Courant number sqrt(0.28) ~= 0.529). Interior retention is 0.985 per tick;
   * the sponge lowers it smoothly to 0.8077 at the outermost cells.
   * Multiplying the whole recurrence also relaxes the mean height toward zero,
   * rather than leaving a permanent DC offset. Clipping is a last-resort bound
   * for strong/continuous forcing, not the mechanism for linear stability.
   */
  step() {
    const { width, height, current } = this;
    const previous = this.#previous;
    const next = this.#next;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const center = current[index];
        const left = x > 0 ? current[index - 1] : 0;
        const right = x + 1 < width ? current[index + 1] : 0;
        const up = y > 0 ? current[index - width] : 0;
        const down = y + 1 < height ? current[index + width] : 0;
        const laplacian = left + right + up + down - 4 * center;
        next[index] = clampHeight(this.#retention[index] *
          (2 * center - previous[index] + WAVE_COEFFICIENT * laplacian));
      }
    }
    this.#previous = current;
    this.current = next;
    this.#next = previous;
  }

  /**
   * Write exactly width*height*4 bytes to an ordinary linear RGBA8 texture buffer.
   * R = encode(2.5 * dx), G = encode(2.5 * dy), B = encode(height), A = 255,
   * where dx=(right-left)/2, dy=(down-up)/2 (positive y points to later rows).
   * Derivatives use clamp-to-edge heights at the boundary. encode(v) is
   * round(255 * (0.5 + 0.5*clamp(v,-1,1))); a flat zero field is (128,128,128,255).
   * Thus sample.rg*2-1 recovers the scaled, clipped slopes, not normalized XYZ
   * normals. Divide by 2.5 for the original slopes, or amplify in the shader.
   * RGBA8 has no exact 0.5: byte 128 decodes to +1/255 with that shader formula.
   * Returns the supplied Uint8Array; no per-call arrays are allocated.
   */
  writeNormals(target) {
    if (!(target instanceof Uint8Array)) {
      throw new TypeError('writeNormals requires a Uint8Array');
    }
    if (target.length !== this.width * this.height * 4) {
      throw new RangeError('writeNormals buffer length must equal width * height * 4');
    }
    const { width, height, current } = this;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const left = current[y * width + Math.max(0, x - 1)];
        const right = current[y * width + Math.min(width - 1, x + 1)];
        const up = current[Math.max(0, y - 1) * width + x];
        const down = current[Math.min(height - 1, y + 1) * width + x];
        const offset = index * 4;
        target[offset] = encodeSigned((right - left) * 0.5 * SLOPE_SCALE);
        target[offset + 1] = encodeSigned((down - up) * 0.5 * SLOPE_SCALE);
        target[offset + 2] = encodeSigned(current[index]);
        target[offset + 3] = 255;
      }
    }
    return target;
  }
}
