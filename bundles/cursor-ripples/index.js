import z from '@deepseek-ai/schemastery';
import { APPEARANCE_DEFAULTS, normalizeAppearance } from './appearance.js';

export const inject = ['settings', 'tools'];
export const Config = z.object({
  enabled: z.boolean().default(true).volatile(),
  tint: z.string().pattern(/^#[\da-fA-F]{6}$/).default(APPEARANCE_DEFAULTS.tint).volatile(),
  brightness: z.number().min(.5).max(2).default(1.12).volatile(),
  opacity: z.number().min(0).max(.5).default(.16).volatile(),
  waveStrength: z.number().min(0).max(2).default(1).volatile(),
  damping: z.number().min(0).max(1).default(.15).volatile(),
  speed: z.number().min(0).max(2).default(1).volatile(),
});

export function apply(ctx, config) {
  ctx.effect(() => ctx.settings.configure({ auto: false }));
  const read = () => normalizeAppearance(Object.fromEntries(Object.keys(APPEARANCE_DEFAULTS).map((key) => [key, config[key].get()])));
  ctx.tools.register({
    name: 'ocean_appearance',
    description: 'Read or adjust the DSH ocean background appearance. Updates are saved and shared with Settings → Ocean Appearance; reset restores the default appearance.',
    parameters: {
      type: 'object', properties: {
        action: { type: 'string', enum: ['get', 'update', 'reset'], description: 'Read current values, change supplied fields, or restore defaults.' },
        enabled: { type: 'boolean', description: 'Show the ocean background.' },
        tint: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$', description: 'Water color as a six-digit hex color.' },
        brightness: { type: 'number', minimum: .5, maximum: 2, description: 'Exposure multiplier; default 1.12.' },
        opacity: { type: 'number', minimum: 0, maximum: .5, description: 'Background material intensity; default 0.16.' },
        waveStrength: { type: 'number', minimum: 0, maximum: 2, description: 'Wave relief and pointer disturbance multiplier; default 1.' },
        damping: { type: 'number', minimum: 0, maximum: 1, description: 'Pointer-wave damping; higher values settle faster. Default 0.15; not physical viscosity.' },
        speed: { type: 'number', minimum: 0, maximum: 2, description: 'Wave speed multiplier; 0 pauses, default 1.' },
      }, required: ['action'], additionalProperties: false,
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      if (args.action !== 'get') {
        const patch = args.action === 'reset' ? { ...APPEARANCE_DEFAULTS } : Object.fromEntries(Object.keys(APPEARANCE_DEFAULTS).filter(key => args[key] !== undefined).map(key => [key, args[key]]));
        // Same Host Settings mutation path used by the Client Config form.
        await ctx.settings.update('cursor-ripples', patch);
      }
      return JSON.stringify({ saved: true, settings: read() });
    },
  });
}
