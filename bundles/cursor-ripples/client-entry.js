import { WaterField } from './water-field.js';
import { createOceanRenderer } from './ocean-renderer.js';
import { APPEARANCE_DEFAULTS, normalizeAppearance } from './appearance.js';
import { createAppearanceModel } from './appearance-model.js';
import { createOceanPreview } from './ocean-preview.js';
import { createOceanSettingsPage, PANEL_DICTS } from './settings-panel.js';

// Compatibility adapter for the inspected DSH 0.2.1-rc.5 DOM, not a public slot contract.
const FRAME = '.PIRFFq_frame';
const SCOPE = '.PIRFFq_frame:has(> [data-local-ocean-background="070"])';
const backgroundCSS = `
${SCOPE} { isolation: isolate; background: var(--dsw-alias-bg-base) !important; }
${SCOPE} > .PIRFFq_sidebarCol,
${SCOPE} > .PIRFFq_centerCol,
${SCOPE} > .PIRFFq_rightbarCol,
${SCOPE} > .PIRFFq_bottomRow { position: relative; z-index: 1; }
/* One continuous sea behind the session, not an opaque island in the center. */
${SCOPE} > .PIRFFq_centerCol,
${SCOPE} > .PIRFFq_centerCol .kiGsTW_root,
${SCOPE} .kiGsTW_body,
${SCOPE} .kiGsTW_scrollBody,
${SCOPE} .kiGsTW_header,
${SCOPE} .kiGsTW_composerSeat,
${SCOPE} .kiGsTW_composerStack,
${SCOPE} .kiGsTW_composerSeat .JZLxKW_root,
${SCOPE} .tnXGgG_column[data-chat-flow] {
  background: transparent !important;
  box-shadow: none !important;
}
${SCOPE} .kiGsTW_composerSeat::before,
${SCOPE} .kiGsTW_composerSeat::after { background: none !important; }
${SCOPE} > .PIRFFq_sidebarCol,
${SCOPE} > .PIRFFq_bottomRow {
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 15%, transparent) !important;
}
/* Inputs retain their border and shape, but reveal the same underlying wave field. */
${SCOPE} [data-composer-card] {
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 18%, transparent) !important;
}
/* Other main views and embedded tools remain safe opaque surfaces. */
${SCOPE} .kiGsTW_viewArea:not(:has([data-chat-flow])),
${SCOPE} > .PIRFFq_rightbarCol { background: var(--dsw-alias-bg-base); }
${SCOPE} > [data-shell-overlay],
${SCOPE} > [data-shell-leading] { z-index: 50; }

`;

window.__ModuleLoader__.load({
  id: '@local/dsh-cursor-ripples',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;
    return {
      inject: ['slots', 'theme', 'locale', 'configForms'],
      apply(ctx) {
        // The previous release did not own locale disposers; use a fresh namespace once.
        const namespace = 'local-ocean-appearance-v061';
        for (const [lang, dict] of Object.entries(PANEL_DICTS)) {
          ctx.effect(() => ctx.locale.register(namespace, lang, dict));
        }
        const t = ctx.locale.bind(namespace);
        const form = ctx.configForms.get('cursor-ripples');
        const model = createAppearanceModel(form, APPEARANCE_DEFAULTS, normalizeAppearance, () => t('oceanSettings.saveError'));
        ctx.effect(() => () => model.dispose());
        const Preview = createOceanPreview(React, ctx, t);
        const Page = createOceanSettingsPage({ React, ctx, model, t, Preview });
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'local-ocean-appearance', order: 30,
          label: () => t('oceanSettings.title'),
        }, Page));
        ctx.slots.inject('shell.overlay', () => {
          let canvas = null;
          let field = null;
          let renderer = null;
          let frame = 0;
          let previousTime = 0;
          let elapsedTime = 0;
          let accumulator = 0;
          let lastPointer = null;
          let bounds = null;
          let disposed = false;
          const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
          const options = { passive: true, capture: true };
          function stop() {
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            previousTime = 0;
            accumulator = 0;
            lastPointer = null;
          }
          function release() {
            stop();
            if (renderer) renderer.dispose();
            renderer = null;
            field = null;
          }
          function draw(now) {
            frame = 0;
            if (!renderer || disposed || document.hidden || !model.getSnapshot().settings.enabled) return;
            if (!previousTime || now - previousTime >= 1000 / 30 - 1) {
              const elapsed = previousTime ? Math.min((now - previousTime) / 1000, .08) : 1 / 30;
              previousTime = now;
              if (!motion.matches) {
                accumulator += elapsed * model.getSnapshot().settings.speed;
                while (accumulator >= 1 / 60) { field.step(model.getSnapshot().settings.damping); accumulator -= 1 / 60; }
                elapsedTime += elapsed * model.getSnapshot().settings.speed;
              }
              renderer.draw(elapsedTime, ctx.theme.getTheme().active.colorScheme === 'dark', model.getSnapshot().settings);
            }
            if (!motion.matches && model.getSnapshot().settings.speed > 0) frame = window.requestAnimationFrame(draw);
          }
          function start() {
            if (!frame && renderer && !disposed && !document.hidden && document.hasFocus() && model.getSnapshot().settings.enabled) frame = window.requestAnimationFrame(draw);
          }
          function resize() {
            release();
            if (!canvas || disposed) return;
            bounds = canvas.parentElement.getBoundingClientRect();
            const width = Math.max(1, bounds.width);
            const height = Math.max(1, bounds.height);
            const ratio = Math.min(window.devicePixelRatio || 1, 1.25, 1100 / Math.max(width, height));
            canvas.width = Math.max(1, Math.round(width * ratio));
            canvas.height = Math.max(1, Math.round(height * ratio));
            const cellSize = Math.max(width, height) / 320;
            field = new WaterField(Math.max(32, Math.round(width / cellSize)), Math.max(32, Math.round(height / cellSize)));
            try {
              renderer = createOceanRenderer(canvas, field);
              start();
            } catch (error) {
              console.warn('[Ocean background]', error);
              canvas.style.visibility = 'hidden';
            }
          }
          function disturb(event, click) {
            if (!field || !renderer || motion.matches || disposed || document.hidden || !bounds || !model.getSnapshot().settings.enabled || model.getSnapshot().settings.speed === 0) return;
            const now = window.performance.now();
            const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top, time: now };
            if (point.x < 0 || point.y < 0 || point.x > bounds.width || point.y > bounds.height) return;
            if (!click && lastPointer && now - lastPointer.time < 16) return;
            const previous = lastPointer && now - lastPointer.time < 120 ? lastPointer : point;
            const steps = click ? 1 : Math.max(1, Math.min(20, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 7)));
            const scale = field.width / bounds.width;
            for (let step = 1; step <= steps; step += 1) {
              const f = step / steps;
              field.disturb((previous.x + (point.x - previous.x) * f) * scale,
                (previous.y + (point.y - previous.y) * f) * field.height / bounds.height,
                Math.max(1.8, (click ? 24 : 14) * scale), click ? .65 : .17);
            }
            lastPointer = point;
          }
          function onMove(event) { disturb(event, false); }
          function onDown(event) { disturb(event, true); }
          function onVisibility() { if (document.hidden) stop(); else start(); }
          function onMotion() { stop(); start(); }
          function onLost(event) { event.preventDefault(); stop(); }
          function attach(node) {
            if (canvas === node) return;
            if (canvas) {
              canvas.removeEventListener('webglcontextlost', onLost);
              canvas.removeEventListener('webglcontextrestored', resize);
            }
            release();
            canvas = node;
            if (node) {
              node.addEventListener('webglcontextlost', onLost);
              node.addEventListener('webglcontextrestored', resize);
              resize();
            }
          }
          function OceanBackground() {
            const { settings } = React.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
            const marker = React.useRef(null);
            const [target, setTarget] = React.useState(null);
            React.useLayoutEffect(() => {
              const candidate = marker.current?.closest(FRAME);
              // Fail closed if the version-specific columns no longer match.
              if (!candidate || !candidate.querySelector(':scope > .PIRFFq_centerCol') ||
                  !candidate.querySelector(':scope > .PIRFFq_sidebarCol')) {
                console.warn('[Ocean background] Unsupported DSH frame; no background mounted.');
                return;
              }
              setTarget(candidate);
            }, []);
            return h(React.Fragment, null,
              h('span', { ref: marker, hidden: true, 'data-ocean-adapter': '0.7.0' }),
              target ? createPortal(h('div', {
                'data-local-ocean-background': settings.enabled ? '070' : undefined, 'aria-hidden': true,
                style: { position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' },
              },
                h('style', null, backgroundCSS),
                h('canvas', { ref: attach, style: { display: 'block', width: '100%', height: '100%', pointerEvents: 'none', opacity: settings.enabled ? settings.opacity : 0 } }),
              ), target) : null,
            );
          }
          return [
            ctx.effect(() => {
              window.addEventListener('pointermove', onMove, options);
              window.addEventListener('pointerdown', onDown, options);
              window.addEventListener('resize', resize);
              window.addEventListener('blur', stop);
              window.addEventListener('focus', start);
              document.addEventListener('visibilitychange', onVisibility);
              motion.addEventListener('change', onMotion);
              const offModel = model.subscribe(onMotion);
              const offTheme = ctx.on('theme/change', onMotion);
              return () => {
                disposed = true;
                offModel(); offTheme();
                window.removeEventListener('pointermove', onMove, options);
                window.removeEventListener('pointerdown', onDown, options);
                window.removeEventListener('resize', resize);
                window.removeEventListener('blur', stop);
                window.removeEventListener('focus', start);
                document.removeEventListener('visibilitychange', onVisibility);
                motion.removeEventListener('change', onMotion);
                attach(null);
              };
            }),
            ctx.slots.register({ name: 'shell.overlay', id: 'local-ocean-background-adapter-v070', order: -100 }, OceanBackground),
          ];
        });
      },
    };
  },
});
