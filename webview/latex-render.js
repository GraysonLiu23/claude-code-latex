/**
 * Claude Code LaTeX 渲染脚本
 * 仅依赖本地 KaTeX，不访问任何外部 URL。
 * 支持: $$...$$  \[...\]  \(...\)
 * （\[...\] 和 \(...\) 在 markdown 渲染前已被 patch_latex.js 替换为 Unicode 占位符）
 *
 * 渲染范围：仅限 [data-testid="assistant-message"] 内部。
 */
(function () {
  'use strict';

  const base = window.__KATEX_BASE__
    ? window.__KATEX_BASE__.replace(/\/?$/, '/')
    : new URL('.', document.currentScript && document.currentScript.src || location.href).href;

  function injectKaTeXCSS() {
    if (document.getElementById('latex-render-css')) return;
    const link = document.createElement('link');
    link.id = 'latex-render-css';
    link.rel = 'stylesheet';
    link.href = base + 'katex.min.css';
    document.head.appendChild(link);
  }

  function loadKaTeX(callback) {
    if (typeof katex !== 'undefined') { callback(); return; }
    if (window._katexLoading) { window._katexCallbacks.push(callback); return; }

    window._katexLoading = true;
    window._katexCallbacks = [callback];

    const script = document.createElement('script');
    script.src = base + 'katex.min.js';
    script.onload = () => {
      window._katexCallbacks.forEach(fn => fn());
      window._katexCallbacks = [];
    };
    document.head.appendChild(script);
  }

  // $$...$$         → 块级
  // ⟦...⟧ (U+27E6/27E7) → 块级（由 \[...\] 转换而来）
  // ⟨...⟩ (U+27E8/27E9) → 行内（由 \(...\) 转换而来）
  const PATTERNS = [
    { re: /\$\$([\s\S]+?)\$\$/g,   display: true  },
    { re: /⟦([\s\S]+?)⟧/g,        display: true  },
    { re: /⟨([\s\S]+?)⟩/g,        display: false },
  ];

  function renderTextNode(textNode) {
    const text = textNode.textContent;
    let hasMatch = false;
    for (const { re } of PATTERNS) {
      re.lastIndex = 0;
      if (re.test(text)) { hasMatch = true; break; }
    }
    if (!hasMatch) return;

    let html = text;
    for (const { re, display } of PATTERNS) {
      re.lastIndex = 0;
      html = html.replace(re, (match, formula) => {
        try {
          return katex.renderToString(formula.trim(), {
            displayMode: display,
            throwOnError: false,
          });
        } catch {
          return match;
        }
      });
    }

    if (html === text) return;
    const span = document.createElement('span');
    span.innerHTML = html;
    textNode.parentNode.replaceChild(span, textNode);
  }

  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'BUTTON']);

  function renderAssistantMessage(msgEl) {
    const walker = document.createTreeWalker(msgEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentNode;
        if (!p || p.nodeType !== 1) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        if (p.closest('.katex')) return NodeFilter.FILTER_REJECT;
        const t = node.textContent;
        if (t.includes('$$') || t.includes('⟦') || t.includes('⟨')) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      },
    });

    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(renderTextNode);
  }

  function renderAll() {
    if (typeof katex === 'undefined') return;
    if (window._latexRendering) return;
    window._latexRendering = true;

    try {
      document.querySelectorAll('[data-testid="assistant-message"]').forEach(renderAssistantMessage);
    } finally {
      window._latexRendering = false;
    }
  }

  function setupObserver() {
    let timer = null;
    const observer = new MutationObserver((mutations) => {
      const real = mutations.some(m =>
        Array.from(m.addedNodes).some(
          node => node.nodeType === 1 && !node.classList?.contains('katex')
        )
      );
      if (!real) return;
      clearTimeout(timer);
      timer = setTimeout(renderAll, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    injectKaTeXCSS();
    loadKaTeX(() => {
      renderAll();
      setupObserver();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
