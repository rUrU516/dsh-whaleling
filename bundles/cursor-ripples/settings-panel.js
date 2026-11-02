import { APPEARANCE_DEFAULTS } from './appearance.js';
import { createBuoyIcon } from './buoy-icons.js';

export const PANEL_DICTS = {
  en: {
    'oceanSettings.title': 'Ocean appearance',
    'oceanSettings.description': 'Your own little sea',
    'oceanSettings.instruction': 'Touch a buoy to adjust. Brush the water to feel it.',
    'oceanSettings.previewLabel': 'Interactive ocean appearance canvas',
    'oceanSettings.previewError': 'WebGL is unavailable. You can still change and save your settings.',
    'oceanSettings.tint': 'Water color',
    'oceanSettings.brightness': 'Sunlight',
    'oceanSettings.opacity': 'Presence',
    'oceanSettings.waveStrength': 'Waves',
    'oceanSettings.speed': 'Flow',
    'oceanSettings.damping': 'Settling',
    'oceanSettings.tintHint': 'Choose the color of your water.',
    'oceanSettings.brightnessHint': 'A soft glow or a sunlit sea.',
    'oceanSettings.opacityHint': 'Quiet texture or a more visible sea. Text stays solid.',
    'oceanSettings.waveStrengthHint': 'From a smooth surface to sculpted waves.',
    'oceanSettings.speedHint': 'Let it drift slowly, or flow a little faster.',
    'oceanSettings.dampingHint': 'How soon pointer ripples fade. The natural swell keeps flowing.',
    'oceanSettings.brightnessLow': 'Soft', 'oceanSettings.brightnessHigh': 'Bright',
    'oceanSettings.opacityLow': 'Subtle', 'oceanSettings.opacityHigh': 'Vivid',
    'oceanSettings.waveStrengthLow': 'Smooth', 'oceanSettings.waveStrengthHigh': 'Rolling',
    'oceanSettings.speedLow': 'Still', 'oceanSettings.speedHigh': 'Swift',
    'oceanSettings.dampingLow': 'Lingering', 'oceanSettings.dampingHigh': 'Quick to calm',
    'oceanSettings.customColor': 'Your own shade',
    'oceanSettings.presetLagoon': 'Lagoon', 'oceanSettings.presetAzure': 'Azure',
    'oceanSettings.presetDeepSea': 'Deep sea', 'oceanSettings.presetJade': 'Jade',
    'oceanSettings.presetMist': 'Sea mist', 'oceanSettings.presetDusk': 'Dusk',
    'oceanSettings.enabled': 'Ocean background',
    'oceanSettings.enable': 'Turn ocean on', 'oceanSettings.disable': 'Turn ocean off',
    'oceanSettings.offHint': 'The sea is resting. Turn it on below.',
    'oceanSettings.reset': 'Restore defaults', 'oceanSettings.closeControl': 'Done',
    'oceanSettings.loading': 'Loading…', 'oceanSettings.saving': 'Saving…',
    'oceanSettings.saved': 'Saved automatically', 'oceanSettings.readOnly': 'Read-only settings',
    'oceanSettings.saveError': 'Could not save your changes.',
  },
  zh: {
    'oceanSettings.title': '海面外观',
    'oceanSettings.description': '一片属于你的海',
    'oceanSettings.instruction': '点一下浮标，调成喜欢的模样；划过水面，感受变化。',
    'oceanSettings.previewLabel': '可交互的海面外观画布',
    'oceanSettings.previewError': '当前设备无法显示 WebGL，仍可调整并保存设置。',
    'oceanSettings.tint': '水色', 'oceanSettings.brightness': '日光',
    'oceanSettings.opacity': '浓淡', 'oceanSettings.waveStrength': '浪高',
    'oceanSettings.speed': '流动', 'oceanSettings.damping': '余波',
    'oceanSettings.tintHint': '为这片海，选一个喜欢的颜色。',
    'oceanSettings.brightnessHint': '柔和一点，或让阳光明亮一些。',
    'oceanSettings.opacityHint': '若隐若现，或更有存在感；不改变文字透明度。',
    'oceanSettings.waveStrengthHint': '从平滑的水面，到起伏的波峰。',
    'oceanSettings.speedHint': '慢慢漂流，或流动得轻快一些。',
    'oceanSettings.dampingHint': '调节鼠标余波多久平息（阻尼），自然涌浪仍会继续。',
    'oceanSettings.brightnessLow': '柔和', 'oceanSettings.brightnessHigh': '明亮',
    'oceanSettings.opacityLow': '淡淡的', 'oceanSettings.opacityHigh': '更明显',
    'oceanSettings.waveStrengthLow': '平静', 'oceanSettings.waveStrengthHigh': '起伏',
    'oceanSettings.speedLow': '静止', 'oceanSettings.speedHigh': '轻快',
    'oceanSettings.dampingLow': '余波悠长', 'oceanSettings.dampingHigh': '更快平息',
    'oceanSettings.customColor': '自己的颜色',
    'oceanSettings.presetLagoon': '潟湖', 'oceanSettings.presetAzure': '蔚蓝',
    'oceanSettings.presetDeepSea': '深海', 'oceanSettings.presetJade': '碧玉',
    'oceanSettings.presetMist': '海雾', 'oceanSettings.presetDusk': '暮色',
    'oceanSettings.enabled': '海面背景',
    'oceanSettings.enable': '开启海面', 'oceanSettings.disable': '关闭海面',
    'oceanSettings.offHint': '海面正在休息，点击下方开关唤醒它。',
    'oceanSettings.reset': '恢复默认', 'oceanSettings.closeControl': '收起',
    'oceanSettings.loading': '正在加载…', 'oceanSettings.saving': '正在保存…',
    'oceanSettings.saved': '已自动保存', 'oceanSettings.readOnly': '当前设置只读',
    'oceanSettings.saveError': '未能保存更改。',
  },
};

// Stable anchors leave the middle open for touching and observing the water.
export const OCEAN_BUOYS = [
  { key: 'tint', x: .19, y: .30 },
  { key: 'brightness', x: .78, y: .25, min: .5, max: 2, step: .01 },
  { key: 'waveStrength', x: .30, y: .51, min: 0, max: 2, step: .05 },
  { key: 'opacity', x: .74, y: .55, min: 0, max: .5, step: .01 },
  { key: 'speed', x: .17, y: .75, min: 0, max: 2, step: .05 },
  { key: 'damping', x: .69, y: .80, min: 0, max: 1, step: .01 },
];
const OCEAN_PALETTE = [
  ['#4896a6', 'presetLagoon'], ['#4b8fc1', 'presetAzure'], ['#406b91', 'presetDeepSea'],
  ['#529b85', 'presetJade'], ['#8caeb3', 'presetMist'], ['#8784ad', 'presetDusk'],
];

/** Local, bounded placement; no body portal or knowledge of the settings shell DOM. */
export function placeBuoyControl(width, height, buoy, requestedWidth = 238, requestedHeight = 164) {
  const pad = 12, gap = 40;
  const w = Math.min(requestedWidth, Math.max(1, width - pad * 2));
  const h = Math.min(requestedHeight, Math.max(1, height - pad * 2));
  const x = width * buoy.x, y = height * buoy.y;
  let left = x + gap;
  let top = y - h / 2;
  if (left + w > width - pad) {
    if (x - gap - w >= pad) left = x - gap - w;
    else { left = x - w / 2; top = y + gap; }
  }
  if (top + h > height - pad) top = y - gap - h;
  return { left: Math.max(pad, Math.min(left, width - pad - w)),
    top: Math.max(pad, Math.min(top, height - pad - h)), width: w, maxHeight: height - 2 * pad };
}

const PANEL_CSS = `
.ocean-settings { width:100%; min-width:0; color:var(--dsw-alias-label-primary); font:inherit; container-type:inline-size; }
.ocean-settings *, .ocean-settings *::before, .ocean-settings *::after { box-sizing:border-box; }
.ocean-settings h2, .ocean-settings h3, .ocean-settings p { margin:0; }
.ocean-settings button, .ocean-settings input { font:inherit; }
.ocean-settings button { cursor:pointer; -webkit-tap-highlight-color:transparent; }
.ocean-settings button:disabled, .ocean-settings input:disabled { opacity:.45; cursor:not-allowed; }
.ocean-settings button:focus-visible, .ocean-settings input:focus-visible { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:4px; }
.ocean-settings-scene { position:relative; isolation:isolate; width:100%; height:clamp(500px, 72vh, 720px); min-height:500px; overflow:hidden; border:1px solid var(--dsw-alias-border-l1); border-radius:22px; background:var(--dsw-alias-bg-base); }
.ocean-settings-water { position:absolute; inset:0; }
.ocean-settings-intro { position:absolute; z-index:1; top:25px; left:25px; right:25px; pointer-events:none; }
.ocean-settings-eyebrow { color:var(--dsw-alias-label-secondary); font-size:11px; letter-spacing:.08em; margin-bottom:7px !important; }
.ocean-settings-title { font-size:23px; font-weight:500; line-height:1.3; letter-spacing:-.03em; }
.ocean-settings-instruction { color:var(--dsw-alias-label-secondary); font-size:12px; margin-top:8px !important; max-width:36ch; line-height:1.65; }
.ocean-settings-buoy { position:absolute; z-index:2; transform:translate(-50%,-50%); display:flex; align-items:center; flex-direction:column; gap:8px; width:82px; padding:0; border:0; background:none; color:var(--dsw-alias-label-primary); }
.ocean-settings-buoy-face { position:relative; display:grid; place-items:center; width:49px; height:49px; border-radius:50%; border:1px solid var(--dsw-alias-border-l2); background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,transparent); box-shadow:0 8px 20px color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent), inset 0 1px 0 color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent); backdrop-filter:blur(14px); transition:border-color .15s, background .15s; }
.ocean-settings-buoy-face::after { content:''; position:absolute; bottom:-11px; width:62px; height:12px; border:1px solid color-mix(in srgb,var(--dsw-alias-label-secondary) 23%,transparent); border-radius:50%; pointer-events:none; }
.ocean-settings-buoy:hover .ocean-settings-buoy-face, .ocean-settings-buoy[aria-expanded=true] .ocean-settings-buoy-face { border-color:var(--dsw-alias-brand-primary); background:var(--dsw-alias-bg-layer-2); }
.ocean-settings-buoy[aria-expanded=true] { z-index:4; }
.ocean-settings-buoy-label { padding:2px 7px; border-radius:9px; font-size:11px; line-height:1.4; background:color-mix(in srgb,var(--dsw-alias-bg-base) 76%,transparent); }
.ocean-settings-tint-dot { position:absolute; right:3px; bottom:3px; width:10px; height:10px; border:2px solid var(--dsw-alias-bg-overlay); border-radius:50%; }
.ocean-settings-control { position:absolute; z-index:5; border:1px solid var(--dsw-alias-border-l2); border-radius:16px; padding:15px; background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 95%,transparent); backdrop-filter:blur(20px); box-shadow:0 12px 35px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent); overflow:auto; animation:ocean-settings-reveal .14s ease-out; }
.ocean-settings-control-heading { display:flex; gap:8px; align-items:center; }
.ocean-settings-control-title { font-size:13px; font-weight:600; flex:1; }
.ocean-settings-icon-button { border:0; background:none; color:var(--dsw-alias-label-secondary); width:28px; height:28px; display:grid; place-items:center; padding:3px; border-radius:8px; }
.ocean-settings-icon-button:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.ocean-settings-control-hint { color:var(--dsw-alias-label-secondary); font-size:11px; line-height:1.6; margin:7px 0 12px !important; }
.ocean-settings-range { width:100%; min-width:0; height:24px; margin:0; padding:0; background:none; cursor:pointer; accent-color:var(--dsw-alias-brand-primary); }
.ocean-settings-range-ends { display:flex; justify-content:space-between; align-items:center; gap:4px; font-size:10px; color:var(--dsw-alias-label-secondary); }
.ocean-settings-range-value { font-size:10px; font-variant-numeric:tabular-nums; padding:2px 5px; border-radius:5px; background:var(--dsw-alias-bg-layer-2); }
.ocean-settings-palette { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.ocean-settings-color-dot { width:27px; height:27px; flex:none; border:2px solid var(--dsw-alias-bg-overlay); border-radius:50%; box-shadow:0 0 0 1px var(--dsw-alias-border-l2); }
.ocean-settings-color-dot[aria-pressed=true] { outline:2px solid var(--dsw-alias-brand-primary); outline-offset:2px; }
.ocean-settings-custom { display:flex; justify-content:space-between; align-items:center; gap:12px; font-size:11px; color:var(--dsw-alias-label-secondary); }
.ocean-settings-custom input { width:38px; height:28px; padding:2px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; background:var(--dsw-alias-bg-layer-1); cursor:pointer; }
.ocean-settings-dock { position:absolute; z-index:3; inset:auto 15px 15px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; pointer-events:none; }
.ocean-settings-dock-actions { display:flex; align-items:center; gap:6px; pointer-events:auto; }
.ocean-settings-dock-button { display:flex; gap:6px; align-items:center; min-height:34px; padding:5px 10px; font-size:11px !important; border:1px solid var(--dsw-alias-border-l2); border-radius:20px; background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 90%,transparent); color:var(--dsw-alias-label-secondary); backdrop-filter:blur(12px); }
.ocean-settings-dock-button[aria-checked=true] { color:var(--dsw-alias-label-primary); }
.ocean-settings-status { margin-left:auto !important; padding:4px 7px; border-radius:8px; font-size:10px; background:color-mix(in srgb,var(--dsw-alias-bg-base) 85%,transparent); color:var(--dsw-alias-label-secondary); }
.ocean-settings-off { position:absolute; left:15%; right:15%; top:43%; text-align:center; pointer-events:none; font-size:12px; color:var(--dsw-alias-label-secondary); }
.ocean-settings-error { font-size:12px; color:var(--dsw-alias-state-error-primary); line-height:1.6; padding:10px 4px; overflow-wrap:anywhere; }
@keyframes ocean-settings-reveal { from{opacity:0} to{opacity:1} }
@container (max-width:350px) { .ocean-settings-intro{left:18px;top:20px;right:18px} .ocean-settings-title{font-size:21px} .ocean-settings-scene{min-height:540px;height:72vh} .ocean-settings-dock{inset:auto 10px 10px} .ocean-settings-dock-button{padding:5px 8px} }
@media(prefers-reduced-motion:reduce) { .ocean-settings-control{animation:none} .ocean-settings-buoy-face{transition:none} }
`;

export function createOceanSettingsPage({ React, ctx, model, t, Preview }) {
  const h = React.createElement;
  const Icon = createBuoyIcon(React);
  const text = key => t(`oceanSettings.${key}`);
  const subscribeLocale = listener => ctx.locale.subscribe(listener);
  const getLocale = () => ctx.locale.getSnapshot();
  return function OceanSettingsPage() {
    const snapshot = React.useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
    React.useSyncExternalStore(subscribeLocale, getLocale, getLocale);
    const [active, setActive] = React.useState(null);
    const [size, setSize] = React.useState({ width: 540, height: 580 });
    const [popoverSize, setPopoverSize] = React.useState({ width:238, height:170 });
    const stage = React.useRef(null), popup = React.useRef(null);
    const buttons = React.useRef({});
    const id = React.useId();
    const settings = { ...APPEARANCE_DEFAULTS, ...snapshot.settings };
    const disabled = !snapshot.loaded || !snapshot.writable;
    const selected = OCEAN_BUOYS.find(buoy => buoy.key === active);
    function close(returnFocus = false) {
      setActive(null);
      if (returnFocus) buttons.current[active]?.focus();
    }
    React.useLayoutEffect(() => {
      const observer = new ResizeObserver(([entry]) => {
        setSize({ width:entry.contentRect.width, height:entry.contentRect.height });
      });
      observer.observe(stage.current);
      return () => observer.disconnect();
    }, []);
    React.useLayoutEffect(() => {
      if (!active || !popup.current) return;
      const node = popup.current;
      const observer = new ResizeObserver(() => {
        const rect = node.getBoundingClientRect();
        setPopoverSize(previous => Math.abs(previous.width-rect.width)<1 && Math.abs(previous.height-rect.height)<1
          ? previous : {width:rect.width,height:rect.height});
      });
      observer.observe(node);
      node.querySelector('input, button[data-palette]')?.focus({ preventScroll:true });
      return () => observer.disconnect();
    }, [active]);
    // Dismiss without swallowing water interaction; Escape stays local to this editor.
    React.useEffect(() => {
      if (!active) return;
      const outside = event => {
        if (popup.current?.contains(event.target) || Object.values(buttons.current).some(node => node?.contains(event.target))) return;
        setActive(null);
      };
      document.addEventListener('pointerdown', outside, true);
      return () => document.removeEventListener('pointerdown', outside, true);
    }, [active]);
    const status = !snapshot.loaded ? 'loading' : snapshot.error ? 'saveError'
      : snapshot.saving ? 'saving' : !snapshot.writable ? 'readOnly' : 'saved';
    const position = selected ? placeBuoyControl(size.width,size.height,selected,238,popoverSize.height) : null;
    return h('section', { className:'ocean-settings', 'aria-labelledby':`${id}-title`,
      onKeyDown:event => { if (event.key==='Escape' && active) {event.preventDefault();event.stopPropagation();close(true);} },
      onBlur:event => { if (active && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setActive(null); },
    },
      h('style',null,PANEL_CSS),
      h('div',{ref:stage,className:'ocean-settings-scene','data-ocean-settings-version':'0.7.0'},
        h('div',{className:'ocean-settings-water'},h(Preview,{settings, immersive:true})),
        h('header',{className:'ocean-settings-intro'},
          h('p',{className:'ocean-settings-eyebrow'},text('title')),
          h('h2',{id:`${id}-title`,className:'ocean-settings-title'},text('description')),
          h('p',{className:'ocean-settings-instruction'},text('instruction'))),
        ...OCEAN_BUOYS.map(buoy => h('button',{
          key:buoy.key,ref:node=>{buttons.current[buoy.key]=node;},type:'button',
          className:'ocean-settings-buoy',style:{left:`${buoy.x*100}%`,top:`${buoy.y*100}%`},
          title:text(buoy.key),'aria-label':text(buoy.key),'aria-expanded':active===buoy.key,
          'aria-controls':active===buoy.key?`${id}-control`:undefined,
          onClick:()=>{setPopoverSize({width:238,height:buoy.key==='tint'?185:170});setActive(active===buoy.key?null:buoy.key);},
        },h('span',{className:'ocean-settings-buoy-face'},h(Icon,{kind:buoy.key}),
          buoy.key==='tint'?h('span',{className:'ocean-settings-tint-dot',style:{background:settings.tint}}):null),
          h('span',{className:'ocean-settings-buoy-label'},text(buoy.key)))),
        selected?h('div',{key:active,ref:popup,id:`${id}-control`,className:'ocean-settings-control',role:'group',
          'aria-labelledby':`${id}-control-title`,style:position},
          h('div',{className:'ocean-settings-control-heading'},h(Icon,{kind:active}),
            h('h3',{id:`${id}-control-title`,className:'ocean-settings-control-title'},text(active)),
            h('button',{type:'button',className:'ocean-settings-icon-button','aria-label':text('closeControl'),title:text('closeControl'),onClick:()=>close(true)},h(Icon,{kind:'close'}))),
          h('p',{id:`${id}-hint`,className:'ocean-settings-control-hint'},text(`${active}Hint`)),
          active==='tint'?h(React.Fragment,null,
            h('div',{className:'ocean-settings-palette'},...OCEAN_PALETTE.map(([color,name])=>h('button',{
              key:color,type:'button','data-palette':true,className:'ocean-settings-color-dot',style:{background:color},
              title:text(name),'aria-label':text(name),'aria-pressed':settings.tint===color,disabled,
              onClick:()=>model.update({tint:color})}))),
            h('label',{className:'ocean-settings-custom'},text('customColor'),h('input',{
              type:'color',value:settings.tint,disabled,onChange:event=>model.update({tint:event.target.value})})))
          :h(React.Fragment,null,
            h('input',{type:'range',className:'ocean-settings-range',min:selected.min,max:selected.max,step:selected.step,
              value:settings[active],disabled,'aria-label':text(active),'aria-describedby':`${id}-hint`,
              onChange:event=>model.update({[active]:Number(event.target.value)})}),
            h('div',{className:'ocean-settings-range-ends'},h('span',null,text(`${active}Low`)),
              h('output',{className:'ocean-settings-range-value'},Number(settings[active]).toFixed(2)),
              h('span',null,text(`${active}High`))))) :null,
        !settings.enabled?h('p',{className:'ocean-settings-off'},text('offHint')):null,
        h('footer',{className:'ocean-settings-dock'},
          h('div',{className:'ocean-settings-dock-actions'},
            h('button',{type:'button',className:'ocean-settings-dock-button',role:'switch','aria-checked':settings.enabled,
              'aria-label':text('enabled'),title:text(settings.enabled?'disable':'enable'),disabled,
              onClick:()=>model.update({enabled:!settings.enabled})},h(Icon,{kind:'power'}),text(settings.enabled?'disable':'enable')),
            h('button',{type:'button',className:'ocean-settings-dock-button',disabled,onClick:()=>model.reset()},h(Icon,{kind:'reset'}),text('reset'))),
          h('p',{className:'ocean-settings-status',role:'status','aria-live':'polite'},text(status)))),
      snapshot.error?h('p',{className:'ocean-settings-error',role:'alert'},snapshot.error):null);
  };
}
