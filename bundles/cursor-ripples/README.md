# 海面 · 鼠标涟漪 / Ocean Surface · Cursor Ripples

当前 **0.4.0 为背景分层适配版**。保留明显的自然波浪、反光与交互水痕，改变的是层级，不再用全屏光影盖住工作组件。

## 层级设计

1. 应用框架形成独立堆叠上下文。
2. React Portal 将本插件的海面节点放到框架下，绝对定位 `z-index:0`。
3. 侧栏、中央区、右栏等工作列在 `z-index:1`。
4. 中央 Conversation 外壳透明，聊天实际窄正文列保留**实色底板**；波浪露在周围留白。
5. 标题栏、侧栏、输入区、非Chat视图保留实色背景，不让波光穿过文字。
6. 原生弹窗/提示层仍在工作列上方。

鼠标事件仍是 passive 监听，不拦截输入。画布 `pointer-events:none`。保留二维高度场、连续路径扰动、点击大水波、多方向涌浪与光影；不再用0.3.0的6%透明度/160px局部mask隐藏效果。

## 兼容性与授权

当前公开 Slot API 没有背景槽。**本实现不是稳定公开背景接口**：用户明确同意后，针对已读取的 DSH `0.2.1-rc.5` 布局/Conversation/Chat打包源码，使用版本特定CSS选择器与React Portal做兼容适配。没有修改DSH本体或重建应用。

关键类名：`.PIRFFq_frame`、三列容器、`.kiGsTW_root`、`.kiGsTW_header`、`.tnXGgG_column[data-chat-flow]`、`.kiGsTW_composerStack`。不改Chat列padding/width/margin，不重建聊天组件、不操作其数据。

所有兼容CSS仅在框架存在本插件直属标记 `data-local-ocean-background="040"` 时生效；移除插件会卸载Portal和style。框架/列结构不匹配时不挂载。**DSH升级后仍可能出现部分样式不匹配，需要重新适配；不是完整版本兼容保证。** 其他第三方插件也可能有不同表面结构。

## 安装、更新与关闭

通过 Harness `plugin_manager install_bundle` 安装本目录绝对路径。当前 profile 的所有会话生效、重启保留。已有包升级按工具提示remove后install。通过插件管理关闭/卸载“海面 · 鼠标涟漪”即可撤销适配。

当前登记入口 `local-ocean-background-adapter-v040` 仍位于 `shell.overlay`，但该入口只负责挂载React组件；实际海面通过Portal放在框架底层，不是浮层中的可见画布。不应从插槽名称误判实际堆叠层级。

## 开发

```sh
node build.js
node --test water-field.test.js
node --check client.js
```

- `client-entry.js`：Portal、兼容CSS、事件与Canvas生命周期。
- `water-field.js` / `water-field.test.js`：原创二维阻尼波动场及10项测试。
- `ocean-renderer.js`：海浪、反光、坡度纹理与GL资源清理。
- `build.js` / `client.js`：无依赖本地合并脚本与构建产物；不直接编辑产物。
- `index.js`：空Host入口，无网络或会话数据操作。
- `locale/` / `icon.svg`：中英元信息与原创光标水波图标。

React和react-dom来自浏览器模块表，无额外React实例。绘制预算30fps、长边最多1100像素，模拟长边约320网格、60Hz。失焦/隐藏暂停；减少动态效果时静态水面。WebGL失败时隐藏画布并输出原因。

## 验证边界

构建、JS语法、manifest/资源、中英文元信息及10项模拟测试通过；安装返回0.4.0/applied，当前Client已注册新入口。**没有浏览器控制，尚未核验实际Portal DOM位置、computed z-index、GPU编译、文字可读性或页面切换/缩放后的布局。** 用户需要在真实GUI验收，注册成功不等于层级视觉验收。

高度场思路参考 [WebGL Water](https://madebyevan.com/webgl-water/) 与 [jQuery Ripples](https://github.com/sirxemic/jquery.ripples)，未引入其代码、图片或运行依赖。
