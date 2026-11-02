import { WaterField } from './water-field.js';
import { createOceanRenderer } from './ocean-renderer.js';

// Compatibility adapter for the inspected DSH 0.2.1-rc.5 DOM, not a public slot contract.
const FRAME = '.PIRFFq_frame';
const SCOPE = '.PIRFFq_frame:has(> [data-local-ocean-background="040"])';
const backgroundCSS = `
${SCOPE} { isolation: isolate; }
${SCOPE} > .PIRFFq_sidebarCol,
${SCOPE} > .PIRFFq_centerCol,
${SCOPE} > .PIRFFq_rightbarCol,
${SCOPE} > .PIRFFq_bottomRow { position: relative; z-index: 1; }
${SCOPE} > .PIRFFq_sidebarCol { background: var(--dsw-specific-sidebar-fill) !important; }
${SCOPE} > .PIRFFq_rightbarCol,
${SCOPE} > .PIRFFq_bottomRow { background: var(--dsw-alias-bg-base); }
${SCOPE} > .PIRFFq_centerCol,
${SCOPE} > .PIRFFq_centerCol .kiGsTW_root { background: transparent !important; }
${SCOPE} .kiGsTW_header { background: var(--dsw-alias-bg-base) !important; }
${SCOPE} .tnXGgG_column[data-chat-flow] {
  background: var(--dsw-alias-bg-base);
  border-radius: 16px;
  box-shadow: 0 0 0 16px var(--dsw-alias-bg-base);
}
${SCOPE} .kiGsTW_viewArea:not(:has([data-chat-flow])),
${SCOPE} .kiGsTW_composerStack,
${SCOPE} [data-composer-card] { background: var(--dsw-alias-bg-base) !important; }
${SCOPE} .kiGsTW_composerStack { border-radius: 16px; }
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
      inject: ['slots', 'theme'],
      apply(ctx) {
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
            if (!renderer || disposed || document.hidden) return;
            if (!previousTime || now - previousTime >= 1000 / 30 - 1) {
              const elapsed = previousTime ? Math.min((now - previousTime) / 1000, .08) : 1 / 30;
              previousTime = now;
              if (!motion.matches) {
                accumulator += elapsed;
                while (accumulator >= 1 / 60) { field.step(); accumulator -= 1 / 60; }
                elapsedTime += elapsed;
              }
              renderer.draw(elapsedTime, ctx.theme.getTheme().active.colorScheme === 'dark');
            }
            if (!motion.matches) frame = window.requestAnimationFrame(draw);
          }
          function start() {
            if (!frame && renderer && !disposed && !document.hidden) frame = window.requestAnimationFrame(draw);
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
            if (!field || !renderer || motion.matches || disposed || document.hidden || !bounds) return;
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
              h('span', { ref: marker, hidden: true, 'data-ocean-adapter': '0.4.0' }),
              target ? createPortal(h('div', {
                'data-local-ocean-background': '040', 'aria-hidden': true,
                style: { position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden' },
              },
                h('style', null, backgroundCSS),
                h('canvas', { ref: attach, style: { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' } }),
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
              return () => {
                disposed = true;
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
            ctx.slots.register({ name: 'shell.overlay', id: 'local-ocean-background-adapter-v040', order: -100 }, OceanBackground),
          ];
        });
      },
    };
  },
});
