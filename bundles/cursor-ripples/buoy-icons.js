export function createBuoyIcon(React) {
  const h = React.createElement;
  const path = (key, d, props = {}) => h('path', { key, d, ...props });
  const circle = (key, cx, cy, r, props = {}) =>
    h('circle', { key, cx, cy, r, ...props });

  return function BuoyIcon({ kind, value }) {
    let shapes;

    switch (kind) {
      case 'tint':
        shapes = [
          path('palette', 'M12 3a9 9 0 1 0 0 18h1.3a2.2 2.2 0 0 0 1.6-3.7 1.4 1.4 0 0 1 1-2.4H18a3 3 0 0 0 3-3C21 6.9 17 3 12 3Z'),
          circle('dot-a', 7.5, 10, 0.9, { fill: 'currentColor', strokeWidth: 0 }),
          circle('dot-b', 11, 6.8, 0.9, { fill: 'currentColor', strokeWidth: 0 }),
          circle('dot-c', 15.6, 8.1, 0.9, { fill: 'currentColor', strokeWidth: 0 }),
        ];
        break;
      case 'brightness':
        shapes = [
          circle('sun', 12, 12, 4),
          path('rays', 'M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'),
        ];
        break;
      case 'opacity':
        shapes = [
          circle('outline', 12, 12, 9),
          path('divide', 'M12 3v18'),
          path('hatching', 'M12 6l2.3-2.3M12 10l5.2-5.2M12 14l7.2-7.2M12 18l8.7-8.7M13.1 20.9l7.8-7.8M18 18l1.8-1.8', { opacity: 0.6 }),
        ];
        break;
      case 'waveStrength':
        shapes = [
          path('crest', 'M3 18c2.8 0 3.7-2.7 4.9-5.7C9.4 8.4 11.3 5 15.3 5c3.1 0 5.2 1.9 5.2 4.5 0 2.1-1.5 3.6-3.4 3.6-1.9 0-3.2-1.4-2.8-3.3-2.5 1.1-3.1 4.6-1.1 6.7 1.1 1.1 2.7 1.5 4.8 1.5h3'),
        ];
        break;
      case 'speed':
        shapes = [
          path('upper-flow', 'M3 8h17M16 4l4 4-4 4'),
          path('lower-flow', 'M3 17h14M13 13l4 4-4 4'),
        ];
        break;
      case 'damping':
        shapes = [
          circle('near-ripple', 10, 12, 3, { opacity: 1 }),
          circle('middle-ripple', 10, 12, 6, { opacity: 0.5 }),
          circle('far-ripple', 10, 12, 9, { opacity: 0.22 }),
          path('stop', 'M9 12h2'),
        ];
        break;
      case 'power':
        shapes = [
          path('switch', 'M12 3v9'),
          path('ring', 'M6.3 5.9a8 8 0 1 0 11.4 0'),
        ];
        break;
      case 'reset':
        shapes = [
          path('return', 'M3 4v6h6'),
          path('loop', 'M3.3 10a9 9 0 1 1 1.5 7'),
        ];
        break;
      case 'close':
        shapes = [path('cross', 'M6 6l12 12M18 6 6 18')];
        break;
      default:
        shapes = [];
    }

    return h('svg', {
      width: 24,
      height: 24,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true,
      focusable: false,
    }, ...shapes);
  };
}
