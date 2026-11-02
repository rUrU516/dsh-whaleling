import { WaterField } from './water-field.js';
import { createOceanRenderer } from './ocean-renderer.js';

/** The real renderer at a bounded resolution, mounted only while settings are open. */
export function createOceanPreview(React, ctx, t) {
  const h = React.createElement;
  return function OceanPreview({ settings, immersive = false }) {
    const ref = React.useRef(null);
    const current = React.useRef(settings);
    const redraw = React.useRef(() => {});
    const [error, setError] = React.useState(false);
    current.current = settings;
    React.useEffect(() => { redraw.current(); }, [settings]);
    React.useEffect(() => {
      const canvas = ref.current;
      let field, renderer, raf = 0, last = 0, time = 0, accumulator = 0;
      let visible = !document.hidden, focused = document.hasFocus(), lastPointer = 0;
      const motion = matchMedia('(prefers-reduced-motion: reduce)');
      function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; accumulator = 0; }
      function draw(now) {
        raf = 0;
        if (!renderer) return;
        if (!last || now - last >= 1000 / 30 - 1) {
          const elapsed = last ? Math.min(.08, (now - last) / 1000) : 1 / 30;
          last = now;
          const s = current.current;
          if (s.enabled && !motion.matches) {
            accumulator += elapsed * s.speed;
            while (accumulator >= 1 / 60) { field.step(s.damping); accumulator -= 1 / 60; }
            time += elapsed * s.speed;
          }
          renderer.draw(time, ctx.theme.getTheme().active.colorScheme === 'dark', s);
        }
        const s = current.current;
        if (s.enabled && s.speed > 0 && !motion.matches && visible && focused) raf = requestAnimationFrame(draw);
      }
      function start() { if (!raf && renderer && visible && focused) raf = requestAnimationFrame(draw); }
      function resize() {
        stop(); renderer?.dispose(); renderer = null;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.min(600, Math.round(rect.width)));
        canvas.height = Math.max(1, Math.round(canvas.width * rect.height / Math.max(1, rect.width)));
        field = new WaterField(160, Math.max(32, Math.round(160 * rect.height / Math.max(1, rect.width))));
        try { renderer = createOceanRenderer(canvas, field); setError(false); start(); }
        catch { setError(true); }
      }
      function pointer(event) {
        if (!renderer || !current.current.enabled || motion.matches || current.current.speed === 0) return;
        const now = performance.now();
        if (event.type === 'pointermove' && now - lastPointer < 20) return;
        lastPointer = now;
        const box = canvas.getBoundingClientRect();
        field.disturb((event.clientX - box.left) / box.width * field.width,
          (event.clientY - box.top) / box.height * field.height, 3,
          event.type === 'pointerdown' ? .65 : .17);
        start();
      }
      const refresh = () => { stop(); start(); };
      const visibility = () => { visible = !document.hidden; refresh(); };
      const blur = () => { focused = false; stop(); };
      const focus = () => { focused = true; start(); };
      const lost = event => { event.preventDefault(); stop(); setError(true); };
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      canvas.addEventListener('pointermove', pointer, { passive: true });
      canvas.addEventListener('pointerdown', pointer, { passive: true });
      canvas.addEventListener('webglcontextlost', lost);
      canvas.addEventListener('webglcontextrestored', resize);
      document.addEventListener('visibilitychange', visibility);
      window.addEventListener('blur', blur);
      window.addEventListener('focus', focus);
      motion.addEventListener('change', refresh);
      const offTheme = ctx.on('theme/change', refresh);
      redraw.current = refresh;
      resize();
      return () => {
        redraw.current = () => {};
        observer.disconnect(); stop(); renderer?.dispose(); offTheme();
        canvas.removeEventListener('pointermove', pointer);
        canvas.removeEventListener('pointerdown', pointer);
        canvas.removeEventListener('webglcontextlost', lost);
        canvas.removeEventListener('webglcontextrestored', resize);
        document.removeEventListener('visibilitychange', visibility);
        window.removeEventListener('blur', blur); window.removeEventListener('focus', focus);
        motion.removeEventListener('change', refresh);
      };
    }, []);
    return h('div', { style: { position: 'relative', height: '100%', background: 'var(--dsw-alias-bg-base)', overflow: 'hidden', borderRadius: immersive ? 0 : 14 } },
      h('canvas', { ref, 'aria-label': t('oceanSettings.previewLabel'), style: { display: 'block', width: '100%', height: '100%', opacity: settings.enabled && !error ? settings.opacity : 0 } }),
      error ? h('p', { role: 'status', style: { position: 'absolute', left: 24, right: 24, bottom: 68, fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('oceanSettings.previewError')) : null);
  };
}
