#!/usr/bin/env node
/**
 * Build a single-file wiki site (zread-style SPA) from docs/wiki/*.md.
 *
 * Usage:  node docs/wiki/build_site.mjs
 * Needs:  /tmp/wikiassets/marked.min.js and /tmp/wikiassets/mermaid.min.js
 *         (downloaded from jsdelivr; see README "浏览方式")
 * Output: docs/wiki/index.html — self-contained, open directly in a browser.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const markedPath = "/tmp/wikiassets/marked.min.js";
const mermaidPath = "/tmp/wikiassets/mermaid.min.js";

for (const p of [markedPath, mermaidPath]) {
  if (!existsSync(p)) {
    console.error(`Missing ${p}. Download:
  curl -L -o /tmp/wikiassets/marked.min.js https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js
  curl -L -o /tmp/wikiassets/mermaid.min.js https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js`);
    process.exit(1);
  }
}

const FILES = [
  "README.md",
  "01-project-overview.md",
  "02-core-architecture.md",
  "03-frames.md",
  "04-frame-processor.md",
  "05-pipeline-and-worker.md",
  "06-llm-context-aggregation.md",
  "07-turn-management.md",
  "08-transports-serializers.md",
  "09-services.md",
  "10-multi-worker.md",
  "11-rtvi.md",
  "12-observers-metrics.md",
  "13-testing-evals.md",
  "14-examples-guide.md",
  "15-audio-subsystem.md",
  "16-flows-and-support.md",
];

const TITLE_RE = /^#\s+(.+)$/m;

const pages = FILES.map((file, i) => {
  const content = readFileSync(join(here, file), "utf8");
  const m = content.match(TITLE_RE);
  let title = m ? m[1].trim() : file;
  // "05 · Pipeline 与 PipelineWorker" → sidebar shows "05 · Pipeline 与 PipelineWorker"
  return { id: i, file, title, content };
});

const pagesJson = JSON.stringify(pages)
  .replace(/<\/script/gi, "<\\/script")
  .replace(/<!--/g, "<\\!--");

const markedJs = readFileSync(markedPath, "utf8");
const mermaidJs = readFileSync(mermaidPath, "utf8");

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pipecat 深度 Wiki</title>
<style>
:root{
  --bg:#ffffff; --bg2:#f7f8fa; --fg:#1f2328; --fg2:#57606a; --line:#e4e7ec;
  --accent:#1f6feb; --accent-soft:#eaf1fe; --code-bg:#f6f8fa; --side-w:300px;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;color:var(--fg);background:var(--bg)}
#app{display:flex;height:100vh;overflow:hidden}
/* ---------- sidebar ---------- */
#side{width:var(--side-w);min-width:var(--side-w);border-right:1px solid var(--line);background:var(--bg2);display:flex;flex-direction:column}
#logo{padding:16px 16px 8px;font-weight:700;font-size:16px;letter-spacing:.2px}
#logo small{display:block;color:var(--fg2);font-weight:400;font-size:11px;margin-top:2px}
#searchbox{padding:10px 12px}
#search{width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;outline:none;background:var(--bg)}
#search:focus{border-color:var(--accent)}
#nav{overflow-y:auto;padding:4px 8px 20px;flex:1}
#nav a{display:block;padding:7px 10px;margin:2px 0;border-radius:8px;color:var(--fg);text-decoration:none;font-size:13.5px;line-height:1.45}
#nav a:hover{background:#ececf1}
#nav a.active{background:var(--accent-soft);color:var(--accent);font-weight:600}
#nav .grp{margin:10px 10px 2px;font-size:11px;color:var(--fg2);text-transform:uppercase;letter-spacing:.5px}
mark{background:#fff3c4;padding:0 2px;border-radius:3px}
/* ---------- content ---------- */
#main{flex:1;overflow-y:auto;scroll-behavior:smooth}
#content{max-width:880px;margin:0 auto;padding:36px 44px 80px}
h1{font-size:27px;border-bottom:1px solid var(--line);padding-bottom:12px}
h2{font-size:21px;margin-top:36px;border-bottom:1px solid var(--line);padding-bottom:6px}
h3{font-size:17px;margin-top:26px}
a{color:var(--accent)}
code{background:var(--code-bg);padding:2px 5px;border-radius:5px;font-size:.9em;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
pre{background:var(--code-bg);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;line-height:1.55}
pre code{background:none;padding:0;font-size:13px}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:13.5px;display:block;overflow-x:auto}
th,td{border:1px solid var(--line);padding:7px 10px;text-align:left;vertical-align:top}
th{background:var(--bg2)}
blockquote{border-left:4px solid var(--accent);background:var(--accent-soft);margin:14px 0;padding:10px 16px;border-radius:0 10px 10px 0}
blockquote p{margin:4px 0}
.mermaid{display:flex;justify-content:center;margin:18px 0;overflow-x:auto;background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px}
.mermaid svg{max-width:100%;height:auto}
.mermaid-err{color:#b42318;white-space:pre-wrap}
#pager{display:flex;justify-content:space-between;gap:12px;margin-top:52px}
#pager a{flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 14px;text-decoration:none;font-size:13.5px}
#pager a:hover{border-color:var(--accent)}
#pager .next{text-align:right}
#pager small{color:var(--fg2);display:block}
#topbar{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:10px 44px;font-size:12.5px;color:var(--fg2);display:none}
/* ---------- search results ---------- */
#results{display:none;overflow-y:auto;flex:1;padding:6px 8px 20px}
#results .r{display:block;padding:8px 10px;border-radius:8px;text-decoration:none;color:var(--fg);font-size:13px;line-height:1.5}
#results .r:hover{background:#ececf1}
#results .r b{display:block;color:var(--accent);font-size:12.5px}
#results .r span{color:var(--fg2)}
@media (max-width:900px){#side{display:none}#content{padding:24px 20px 60px}}
</style>
</head>
<body>
<div id="app">
  <nav id="side">
    <div id="logo">Pipecat 深度 Wiki<small>基于 v1.15.0 源码 · DeepWiki 风格</small></div>
    <div id="searchbox"><input id="search" type="search" placeholder="搜索全部章节… (Ctrl+K)"></div>
    <div id="nav"></div>
    <div id="results"></div>
  </nav>
  <main id="main">
    <div id="topbar"></div>
    <article id="content"></article>
  </main>
</div>

<script>${markedJs}<\/script>
<script>${mermaidJs}<\/script>
<script id="pages-data" type="application/json">${pagesJson}</script>
<script>
const PAGES = JSON.parse(document.getElementById("pages-data").textContent);
const contentEl = document.getElementById("content");
const navEl = document.getElementById("nav");
const resEl = document.getElementById("results");
const navElBox = document.getElementById("nav");
const mainEl = document.getElementById("main");
const topbar = document.getElementById("topbar");
let mermaidReady = false;
let renderToken = 0;

marked.setOptions({ gfm: true, breaks: false });

async function ensureMermaid() {
  if (mermaidReady) return;
  try {
    mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose", fontFamily: "inherit" });
    mermaidReady = true;
  } catch (e) { console.error("mermaid init failed", e); }
}

async function renderDiagrams() {
  await ensureMermaid();
  const token = ++renderToken;
  const nodes = contentEl.querySelectorAll("pre > code.language-mermaid");
  let i = 0;
  for (const code of nodes) {
    if (token !== renderToken) return;   // page changed mid-render; abort
    const src = code.textContent;
    const holder = document.createElement("div");
    holder.className = "mermaid";
    const pre = code.parentElement;
    pre.replaceWith(holder);
    try {
      const { svg } = await mermaid.render("mmd-" + Date.now() + "-" + i++, src);
      if (token !== renderToken) return;
      holder.innerHTML = svg;
    } catch (err) {
      if (token !== renderToken) return;
      holder.classList.add("mermaid-err");
      holder.textContent = "Mermaid 渲染失败：\\n" + src;
    }
  }
  if (token === renderToken) {
    // Remove stray mermaid temp/error nodes that a cancelled render may
    // have appended directly to <body>.
    document.querySelectorAll("body > div").forEach(n => { if (n.id !== "app") n.remove(); });
  }
}

function renderPage(i) {
  const p = PAGES[i];
  document.title = p.title + " · Pipecat Wiki";
  topbar.textContent = p.title;
  topbar.style.display = "block";
  // Resolve relative links between wiki pages inside the SPA.
  const html = marked.parse(p.content).replace(/href="((?:\\d\\d-)?[\\w-]+\\.md)(#[^"]*)?"/g, (m, file, hash) => {
    const idx = PAGES.findIndex(x => x.file === file);
    if (idx < 0) return m;
    return 'href="#/' + idx + '"' + (hash ? ' data-anchor="' + hash.slice(1) + '"' : "");
  });
  contentEl.innerHTML = html;
  window.scrollTo(0, 0); mainEl.scrollTop = 0;
  renderPager(i);
  highlightNav(i);
  renderDiagrams().then(() => {
    // jump to #anchor if requested
    const jump = p._jump;
    if (jump) { const el = document.getElementById(jump); if (el) el.scrollIntoView(); }
  });
}

function renderPager(i) {
  const old = document.getElementById("pager"); if (old) old.remove();
  if (i === 0 && PAGES.length <= 1) return;
  const div = document.createElement("div"); div.id = "pager";
  const prev = i > 0 ? PAGES[i - 1] : null;
  const next = i < PAGES.length - 1 ? PAGES[i + 1] : null;
  div.innerHTML =
    (prev ? '<a href="#/' + (i - 1) + '"><small>← 上一篇</small>' + prev.title + "</a>" : "<span></span>") +
    (next ? '<a class="next" href="#/' + (i + 1) + '"><small>下一篇 →</small>' + next.title + "</a>" : "<span></span>");
  contentEl.appendChild(div);
}

function highlightNav(i) {
  navElBox.querySelectorAll("a").forEach(a => a.classList.toggle("active", a.dataset.idx == i));
}

function buildNav() {
  navElBox.innerHTML = '<div class="grp">目录</div>';
  PAGES.forEach((p, i) => {
    const a = document.createElement("a");
    a.href = "#/" + i; a.dataset.idx = i; a.textContent = p.title;
    navElBox.appendChild(a);
  });
}

function buildIndex() {
  PAGES.forEach((p, i) => { p._text = p.content.replace(/\\x60{3}[\\s\\S]*?\\x60{3}/g, " "); });
}

function search(q) {
  q = q.trim().toLowerCase();
  resEl.innerHTML = "";
  if (!q) { resEl.style.display = "none"; navElBox.style.display = "block"; return; }
  navElBox.style.display = "none"; resEl.style.display = "block";
  const frag = document.createDocumentFragment();
  PAGES.forEach((p, i) => {
    const t = p._text.toLowerCase();
    let at = t.indexOf(q);
    if (at < 0 && !p.title.toLowerCase().includes(q)) return;
    const a = document.createElement("a"); a.className = "r"; a.href = "#/" + i;
    const snippet = at >= 0 ? p._text.slice(Math.max(0, at - 40), at + 80).replace(/\\s+/g, " ") : p.title;
    a.innerHTML = "<b>" + esc(p.title) + "</b><span>" + esc("…" + snippet + "…") + "</span>";
    frag.appendChild(a);
  });
  if (!frag.childNodes.length) { const d = document.createElement("div"); d.className = "r"; d.textContent = "没有匹配结果"; frag.appendChild(d); }
  resEl.appendChild(frag);
}

function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function route() {
  const m = location.hash.match(/^#\\/(\\d+)(?:#(.*))?$/);
  const idx = m ? Math.min(+m[1], PAGES.length - 1) : 0;
  if (m && m[2]) PAGES[idx]._jump = m[2]; else delete PAGES[idx]._jump;
  search("");
  document.getElementById("search").value = "";
  renderPage(idx);
}

document.getElementById("search").addEventListener("input", e => search(e.target.value));
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); document.getElementById("search").focus(); }
});
window.addEventListener("hashchange", route);

buildNav(); buildIndex(); route();
<\/script>
</body>
</html>`;

const out = join(here, "index.html");
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB, ${pages.length} pages)`);
