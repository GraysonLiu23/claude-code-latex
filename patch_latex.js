#!/usr/bin/env node
/**
 * Claude Code LaTeX 渲染补丁
 *
 * 与原版 patch_extension.js 的区别：
 *   - 不修改任何 CSP 策略
 *   - 只注入一个 <script> 标签加载本地 latex-render.js
 *   - KaTeX 文件全部来自本地，不依赖任何外部 CDN
 *   - 支持 --restore 恢复备份
 *
 * 用法：
 *   node patch_latex.js           # 打补丁
 *   node patch_latex.js --restore # 恢复原始 extension.js
 */

const fs   = require('fs');
const path = require('path');

// ─── 找扩展目录 ────────────────────────────────────────────────────────────────

function findExtensionDir() {
  const home    = process.env.HOME || process.env.USERPROFILE;
  const extBase = path.join(home, '.vscode-server', 'extensions');

  if (!fs.existsSync(extBase)) {
    // 也兼容 Windows 本地 VSCode
    const winBase = path.join(home, '.vscode', 'extensions');
    if (fs.existsSync(winBase)) return pickLatest(winBase);
    console.error('[Patch] 未找到 VSCode extensions 目录');
    process.exit(1);
  }
  return pickLatest(extBase);
}

function pickLatest(extBase) {
  const dirs = fs.readdirSync(extBase).filter(d => d.startsWith('anthropic.claude-code-'));
  if (dirs.length === 0) {
    console.error('[Patch] 未找到 Claude Code 扩展');
    process.exit(1);
  }
  return path.join(extBase, dirs.sort().pop());
}

// ─── 恢复备份 ──────────────────────────────────────────────────────────────────

function restore(extDir) {
  const orig = path.join(extDir, 'extension.js');
  const bak  = path.join(extDir, 'extension.js.bak');
  if (!fs.existsSync(bak)) {
    console.error('[Restore] 未找到备份文件 extension.js.bak');
    process.exit(1);
  }
  fs.copyFileSync(bak, orig);
  console.log('[Restore] 已恢复 extension.js，请重新加载 VSCode 窗口。');
}

// ─── 主逻辑 ───────────────────────────────────────────────────────────────────

const RESTORE = process.argv.includes('--restore');
const extDir  = findExtensionDir();
console.log('[Patch] 扩展目录:', extDir);

if (RESTORE) { restore(extDir); process.exit(0); }

const extensionJs = path.join(extDir, 'extension.js');
const extensionBak = path.join(extDir, 'extension.js.bak');
const webviewDir  = path.join(extDir, 'webview');

// ─── 步骤 1：复制本地 KaTeX 文件 ─────────────────────────────────────────────

const srcDir = path.join(__dirname, 'webview');

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.error(`[Patch] 源文件不存在: ${src}`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyFile(path.join(srcDir, 'latex-render.js'), path.join(webviewDir, 'latex-render.js'));
copyFile(path.join(srcDir, 'katex.min.js'),    path.join(webviewDir, 'katex.min.js'));
copyFile(path.join(srcDir, 'katex.min.css'),   path.join(webviewDir, 'katex.min.css'));
copyDir(path.join(srcDir, 'fonts'),            path.join(webviewDir, 'fonts'));
console.log('[Patch] KaTeX 文件已复制到扩展 webview 目录');

// ─── 步骤 2：读取 extension.js 并检查是否已打过补丁 ──────────────────────────

let content = fs.readFileSync(extensionJs, 'utf8');

if (content.includes('latex-render.js')) {
  console.log('[Patch] 检测到已注入 latex-render.js，无需重复打补丁。');
  console.log('[Patch] 若需重打，请先运行: node patch_latex.js --restore');
  process.exit(0);
}

// ─── 步骤 3：动态解析变量名 ───────────────────────────────────────────────────
//
// 在 extension.js 中寻找形如：
//   Uri.joinPath(this.extensionUri,"webview","index.js"),<srcVar>=<webviewObj>.asWebviewUri
// 以提取：
//   - webviewObj: 持有 asWebviewUri 方法的变量（通常为 z）
//   - vscodeUri:  F4.Uri.joinPath 中的 F4（vscode 模块别名）
//
// 以及注入点：
//   nonce="${<nonceVar>}" src="${<srcVar>}" type="module"></script>

const uriPattern = /(\w+)\.Uri\.joinPath\(this\.extensionUri,"webview","index\.js"\),(\w+)=(\w+)\.asWebviewUri/;
const uriMatch = content.match(uriPattern);
if (!uriMatch) {
  console.error('[Patch] 无法解析扩展内部变量名（extensionUri 上下文未找到）。');
  console.error('[Patch] 当前扩展版本可能不兼容，请检查 extension.js 是否结构发生变化。');
  process.exit(1);
}
const [, vscodeUri, , webviewObj] = uriMatch;
console.log(`[Patch] 解析到变量名: vscodeUri=${vscodeUri}, webviewObj=${webviewObj}`);

const scriptPattern = /nonce="\$\{(\w+)\}" src="\$\{(\w+)\}" type="module"><\/script>/;
const scriptMatch = content.match(scriptPattern);
if (!scriptMatch) {
  console.error('[Patch] 未找到 <script> 注入点。');
  process.exit(1);
}
const [fullMatch, nonceVar] = scriptMatch;
console.log(`[Patch] 解析到注入点 nonce 变量: ${nonceVar}`);

// ─── 步骤 4：备份并注入 ───────────────────────────────────────────────────────

// 备份（如果还没有）
if (!fs.existsSync(extensionBak)) {
  fs.copyFileSync(extensionJs, extensionBak);
  console.log('[Patch] 已备份原始 extension.js → extension.js.bak');
} else {
  console.log('[Patch] 备份已存在，跳过备份步骤');
}

// ─── 步骤 4a：修改 script-src，追加 cspSource ──────────────────────────────
//
// 原始 CSP: script-src 'nonce-${D}'
// 修改后:   script-src 'nonce-${D}' ${z.cspSource}
//
// cspSource 仅允许扩展自身 webview 目录下的资源（vscode-webview-resource: 协议），
// 不引入任何外部 CDN，安全边界与 style-src / font-src 保持一致。
//
// 动态插入 <script src="katex.min.js"> 没有 nonce，必须靠 cspSource 覆盖才能通过 CSP。
const scriptSrcRe = new RegExp(`script-src 'nonce-\\$\\{${nonceVar}\\}'`);
if (scriptSrcRe.test(content)) {
  content = content.replace(
    scriptSrcRe,
    `script-src 'nonce-\${${nonceVar}}' \${${webviewObj}.cspSource}`
  );
  console.log('[Patch] 已更新 script-src CSP（追加 cspSource，仅允许扩展本地资源）');
} else {
  console.log('[Patch] script-src：未找到目标模式，跳过（可能已修改过）');
}

// 注入两段内容：
//   1. 内联 <script>：把 webview 目录的 URI 写入 window.__KATEX_BASE__
//      （在模板求值时由扩展填入，比在运行时用 document.currentScript 更可靠）
//   2. 外部 <script>：加载 latex-render.js
const injection =
  `${fullMatch}` +
  `<script nonce="\${${nonceVar}}">window.__KATEX_BASE__="\${${webviewObj}.asWebviewUri(${vscodeUri}.Uri.joinPath(this.extensionUri,"webview"))}";</script>` +
  `<script nonce="\${${nonceVar}}" src="\${${webviewObj}.asWebviewUri(${vscodeUri}.Uri.joinPath(this.extensionUri,"webview","latex-render.js"))}"></script>`;

content = content.replace(fullMatch, injection);
fs.writeFileSync(extensionJs, content, 'utf8');

console.log('[Patch] 已注入 latex-render.js');
console.log('[Patch] 完成！请在 VSCode 中执行: Developer: Reload Window');
