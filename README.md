# URL复制助手 Chrome 插件

一个用于快速复制当前页面 URL 或 Markdown 链接的 Manifest V3 扩展。

## 版本

- `v2.0.0`
- 复制架构升级为扩展上下文 `offscreen` 复制通道。

## 功能特性

### 核心功能

- **复制 URL**：复制当前页面地址。
- **复制 Markdown URL**：复制 `[页面标题](URL)`。
- **等待模式**：先复制 URL，等待时间内按指定按键后自动改为复制 Markdown URL。

### 触发方式

1. **快捷键**
   - `Cmd+Shift+C`（Mac）/`Ctrl+Shift+C`（Windows/Linux）：复制 URL
   - `Cmd+Shift+M`（Mac）/`Ctrl+Shift+M`（Windows/Linux）：复制 Markdown URL
2. **插件弹窗**
3. **页面右键菜单**

### 兼容性说明

- 普通网页（如 YouTube、GitHub、百度网盘）支持页面顶部通知。
- 受保护页面（如 `chrome://`、Chrome Web Store）通常不能注入内容脚本，因此不会显示页面顶部通知；扩展会用徽标反馈复制结果。
- 复制流程在扩展上下文执行，不再依赖网页上下文 `navigator.clipboard.writeText()`，可避免站点级反复授权弹窗。

## 技术实现

- `background.js`：统一调度复制请求、读取 tab URL、等待模式控制。
- `offscreen/offscreen.js`：通过 `textarea + document.execCommand('copy')` 写入系统剪贴板。
- `content.js`：仅负责页面通知与等待模式按键监听。
- `popup.js`：设置与触发入口。

## 权限说明

- `tabs`：读取当前标签页 URL 与标题。
- `clipboardWrite`：允许扩展写入剪贴板。
- `offscreen`：在 MV3 下创建离屏文档执行复制。
- `activeTab`、`contextMenus`、`storage`：用于交互、右键菜单与配置保存。

## 安装方法

1. 打开 `chrome://extensions/`
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 选择当前项目目录 `CopyMD_URL`

## 项目结构

```text
CopyMD_URL/
├── manifest.json
├── background.js
├── content.js
├── popup.html
├── popup.js
├── popup.css
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js
├── icons/
└── README.md
```

## 验收建议

1. 在 `youtube.com -> pan.baidu.com -> github.com` 连续复制 3 次，确认不再出现站点剪贴板授权弹窗。
2. 在 `https://chromewebstore.google.com/...` 页面执行复制 URL。
3. 在 `chrome://extensions/?id=...` 页面执行复制 URL。
4. 验证弹窗按钮、快捷键、右键菜单三种触发方式都正常。
5. 验证等待模式：超时保持 URL，按键后切换为 Markdown URL。
