# claude-code-latex

为 VSCode Claude Code 插件添加 **LaTeX 公式渲染**支持。

使用本地 KaTeX（不依赖任何外部 CDN），仅最小化修改 CSP，不引入第三方脚本风险。

## 支持的语法

| 语法 | 说明 |
|------|------|
| `$$...$$` | 块级公式（居中独占一行） |
| `\[...\]` | 块级公式 |
| `\(...\)` | 行内公式 |

不支持 `$...$`（误触发率高，已主动排除）。

## 使用方法

### 打补丁

```bash
cd ~/projects/claude-code-latex
node patch_latex.js
```

然后在 VSCode 中执行：`Ctrl+Shift+P` → **Developer: Reload Window**

### 回滚

```bash
node patch_latex.js --restore
```

然后执行 **Developer: Reload Window**。

## 注意事项

- 适用平台：**VSCode Remote (WSL)**，扩展位于 `~/.vscode-server/extensions/`
- 适用扩展版本：`anthropic.claude-code-2.1.31` 及以上
- **扩展更新后补丁会被覆盖**，需重新执行 `node patch_latex.js`
- 补丁会自动备份原始 `extension.js` 为 `extension.js.bak`，重复打补丁是安全的

## 文件说明

```
claude-code-latex/
├── patch_latex.js          # 补丁脚本（打补丁 / 回滚）
└── webview/
    ├── latex-render.js     # LaTeX 渲染逻辑（注入到扩展 WebView）
    ├── katex.min.js        # KaTeX 0.16.9 本地副本
    ├── katex.min.css       # KaTeX 样式
    └── fonts/              # KaTeX 字体文件
```

## 与同类工具的区别

原版 [claude-code-enhance](https://github.com/buffbeard920/claude-code-enhance) 在运行时从 `cdnjs.cloudflare.com` 拉取 KaTeX，
并将 CDN 域名加入 CSP 白名单。本工具改为：

- KaTeX 完全本地化，无网络请求
- CSP 仅追加 `cspSource`（扩展自身资源的 `vscode-webview-resource:` 协议），不引入外部域名
- 功能精简为仅 LaTeX 渲染，无其他副作用
