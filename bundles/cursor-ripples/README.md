# 海面 · 鼠标涟漪 / Ocean Surface · Cursor Ripples

当前 **0.7.0**：统一淡水纹背景 + 沉浸式浮标调节页，不再罗列参数表。默认保留0.5.1的微亮观感；0.4.0分层版保留在历史提交 `4dbf3ed`。

## 使用

打开 DSH **设置 → 海面外观**（位于 Agent 预设之后、插件市场之前）：

页面主体是一整片真实水面，六个带原创SVG图标与短标签的浮标分布其上，默认全部收起：

| 浮标 | 标志 | 对应参数 |
|---|---|---|
| 水色 | 调色盘+当前色点 | 六预设色/自定义色 |
| 日光 | 太阳 | 亮度 |
| 浪高 | 卷曲波峰 | 波浪强度 |
| 浓淡 | 半透斜纹圆 | 底纹强度 |
| 流动 | 流线箭头 | 流速 |
| 余波 | 渐隐同心圆 | 阻尼 |

一次只展开一个就近的小控件，滑动立即看见水面变化；点空白水面、再次点浮标、按Esc或点击收起可关闭；Esc/收起把焦点还给浮标。控件在本页画布内计算位置，窄宽度下调整方向并限制边界，不使用body portal。底部只保留开关、恢复默认和保存状态。页面不再画模拟输入框，不展示多块表单。

数值范围（仅供开发/说明，界面常态不列参数）：
- 亮度：0.5–2，默认1.12。
- 底纹强度：0–0.5，默认0.16；只影响底层Canvas，不改变文字/控件透明度。
- 波浪强度：0–2，默认1；调整波面坡度和水痕呈现。
- 流速：0–2，默认1；0暂停，保留当前水面。
- 阻尼：0–1，默认0.15；越高鼠标余波越快平息，越低余波越久。实时改变模拟衰减系数（每tick保留率 `1 - 0.1*damping`），默认保留原0.985；不是物理黏度，不衰减shader持续驱动的自然涌浪。
- 启用开关与恢复默认。

滑动时立即更新预览和真实背景，停止操作约220ms后合并成一次原子设置写入。页面显示加载/保存/只读/失败状态；保存拒绝或网络异常会提示，并回退到Host已接受的值，不假报已保存。

参数声明在Host插件 `Config` 的 `.volatile()` 字段，使用 DSH `configForms.get('cursor-ripples')` 和Host Settings保存。**不是浏览器localStorage**；同一profile的会话/已认证客户端共享，重启保留。模型工具 `ocean_appearance` 支持get/update/reset，与UI走相同的Host Settings路径。

## 背景层级

1. 应用框架形成独立堆叠上下文。
2. React Portal把海面节点放到框架下，绝对定位 `z-index:0`。
3. 工作列在 `z-index:1`。正文、会话外壳和输入区外壳透明，同片水面贯穿留白与正文。
4. 输入卡片18%主题底色，侧栏/底部15%；非Chat视图和右侧工具保留正常背景。
5. 原生弹窗/提示层仍在上方，设置页预览位于自己的正式内容区。

鼠标事件passive，背景Canvas `pointer-events:none`，不遮挡工作组件。关闭海面开关会移除用于激活兼容CSS的属性，从而恢复原生背景。

## 接口与兼容性

设置页使用公开的 `settings.section` 扩展点，独立ID `local-ocean-appearance`，中英本地化，控件使用主题tokens，不导入私有Harness Client组件。

**背景本身仍是用户授权的版本特定兼容适配，不是公开背景接口**：针对已读取DSH `0.2.1-rc.5`的布局/Conversation/Chat结构，React Portal + CSS选择器；没有修改DSH本体或启动另一个服务器。

关键类：`.PIRFFq_frame`、三列容器、`.kiGsTW_root`、`.kiGsTW_header`、`.tnXGgG_column[data-chat-flow]`、`.kiGsTW_composerStack`。不改Chat测量几何/padding/width/margin、不操作会话数据。

兼容CSS仅在框架有直属标记 `data-local-ocean-background="070"` 时生效。框架/列结构不匹配不挂载，卸载清理Portal/style/listeners/RAF/GL。**DSH升级可能需要重新适配，其他插件可能使用不同表面结构。**

背景生命周期入口 `local-ocean-background-adapter-v070` 虽登记于 `shell.overlay`，可见画布实际Portal到底层，并不在组件上方盖光影。

## 开发

```sh
node build.js
node --test water-field.test.js appearance.test.js
node --check client.js
```

- `appearance.js`：Host/Client共享默认值与范围归一化。
- `index.js`：Config与同源设置操作工具；schemastery为运行时peer。
- `appearance-model.js`：实时预览状态、防抖保存、失败处理。
- `settings-panel.js`：沉浸式浮标设置页、就近控件定位、双语文案。
- `buoy-icons.js`：六个参数与开关/恢复/关闭的原创统一描边SVG。
- `ocean-preview.js`：有界真实水面预览，卸载清理。
- `client-entry.js`：背景Portal、兼容CSS和输入/绘制生命周期。
- `water-field.js` / `water-field.test.js`：原创二维阻尼波动场及13项测试。
- `appearance.test.js`：9项参数/保存/错误/重置/双语/浮标覆盖/定位边界测试。
- `ocean-renderer.js`：多方向海浪、颜色/亮度/法线/反光与GL清理。
- `build.js` / `client.js`：无构建依赖本地合并脚本与生成产物；不直接编辑产物。
- `locale/` / `icon.svg`：中英元信息与原创光标水波图标。

React/react-dom来自浏览器模块表，无额外React实例。背景30fps、长边最多1100px、模拟长边约320格；设置预览最多600px、模拟宽160格，只在设置页挂载时分配。失焦/隐藏暂停，减少动态效果时静态水面，WebGL失败显示不可用提示。

## 部署与核验

通过 `plugin_manager` 安装本目录，工具提示已有包时remove再install；关闭/卸载本插件撤销背景。0.7.0安装返回applied/warnings[]，Host Config已投射全部8项字段，Client新背景入口与设置页入口均active，工具已注册。

构建、JS语法、22项测试、manifest资源/双语文案检查通过；经真实工具读取观察到面板选色已进入Host配置；同值亮度写入成功，未重置用户正在选择的配色。

**没有浏览器控制，不能代替用户验收设置页的实际排版、GPU画面、浅深色效果与图标渲染。** 插槽active不等于所有控件实际视觉已核验。沿用原创SVG图标，无默认模板资源。

高度场思路参考 [WebGL Water](https://madebyevan.com/webgl-water/) 与 [jQuery Ripples](https://github.com/sirxemic/jquery.ripples)，未引入其代码、图片或运行依赖。
