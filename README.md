# whaleling

A tiny floating whale for DeepSeek Harness (DSH).

- Hovers above every window as a see-through glass widget
- Bubbles while an agent is running, spins a badge when a turn finishes while you are away
- Hover to open a session list; click a session to read its last exchange
- Double-click the whale to bring DSH to the front

## Layout

| Path | What |
|---|---|
| `float-icon/` | The widget: a standalone AppKit app (Swift, no Electron) |
| `bundles/dshfloat-bridge/` | A DSH host plugin that exposes live session state to the widget |

## Build and run the widget

```bash
cd float-icon
./build.sh                 # compile + assemble build/DshFloat.app
open build/DshFloat.app
```

Requires macOS 13+ and the Xcode command line tools. The widget is unsigned; if macOS
refuses to open it, right-click → Open, or `xattr -dr com.apple.quarantine build/DshFloat.app`.

## Install the bridge plugin

```bash
dsh plugin --profile desktop add /absolute/path/to/bundles/dshfloat-bridge
```

The widget falls back to reading `~/.dsh/sessions` directly when the bridge is absent.

## Releasing

The bridge is published to npm under one name, `dsh-whaleling`. There is no separate
dev package: the local checkout is installed with `dsh plugin add <path>` (a pnpm link),
so edits take effect immediately and never reach the registry until you publish.

```sh
cd bundles/dsh-whaleling
npm version patch          # 0.1.0 -> 0.1.1
npm publish
cd ../..
git push --follow-tags origin public-export:main
```

The widget is shipped separately as a GitHub Release asset:

```sh
cd float-icon
./build.sh
codesign --force --deep -s - build/DshFloat.app   # ad-hoc; users still need right-click → Open
ditto -c -k --keepParent build/DshFloat.app DshFloat.zip
gh release create v0.1.1 DshFloat.zip --title v0.1.1 --notes "..."
```
