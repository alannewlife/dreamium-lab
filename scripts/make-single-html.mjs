// 单 HTML 打包后处理：把 dist-single/index.html 里的 <script>/<link> 外链替换为内联内容，
// 产出独立可双击打开的 soft-matter.html（file:// 协议可用），随后清掉中间产物。
// 用法：node scripts/make-single-html.mjs [distDir]，默认 dist-single。
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { resolve, join } from "node:path"

const dist = resolve(process.argv[2] ?? "dist-single")
const htmlPath = join(dist, "soft-matter/index.html")
if (!existsSync(htmlPath)) {
  console.error(`[make-single-html] 找不到 ${htmlPath}，请先跑 vite build --config vite.config.single.ts`)
  process.exit(1)
}

let html = readFileSync(htmlPath, "utf8")
// 独立文件从 file:// 打开时，返回入口也应指向线上实验站。
html = html.replace("<head>", '<head><base href="https://lab.dreamium.si/">')

// 内联 CSS：<link rel="stylesheet" ... href="./assets/*.css"> → <style>
html = html.replace(
  /<link\s+[^>]*rel="stylesheet"[^>]*href="\.\.\/assets\/([^"]+\.css)"[^>]*>/g,
  (_, file) => {
    const css = readFileSync(join(dist, "assets", file), "utf8")
    return `<style>\n${css}\n</style>`
  },
)

// 内联 JS：<script type="module" ... src="./assets/*.js"></script> → 内联 module script。
// JS 内容里的 </script 必须转义，否则会提前闭合标签；\/ 在字符串/正则/模板串里都等价于 /，安全。
html = html.replace(
  /<script\s+[^>]*type="module"[^>]*src="\.\.\/assets\/([^"]+\.js)"[^>]*><\/script>/g,
  (_, file) => {
    const js = readFileSync(join(dist, "assets", file), "utf8")
    const safe = js.replace(/<\/script/g, "<\\/script")
    if (js.includes("<!--")) {
      // HTML 规范里 script 内的 <!-- 会进入怪异解析状态，先报警人工确认
      console.warn("[make-single-html] 警告：JS 内含 <!-- 序列，请检查内联后是否正常")
    }
    return `<script type="module">\n${safe}\n</script>`
  },
)

// 子目录入口的 favicon 也内联，保证导出后移动文件仍能独立打开。
html = html.replace(/href="\.\.\/assets\/([^" ]+\.svg)"/g, (_, file) => {
  const data = readFileSync(join(dist, "assets", file)).toString("base64")
  return `href="data:image/svg+xml;base64,${data}"`
})

// 兜底校验：不允许残留任何对 assets/ 的外链引用
const leftover = html.match(/(src|href)="\.\.\/assets\/[^"]+"/g)
if (leftover) {
  console.error(`[make-single-html] 仍有未内联的外链引用：\n${leftover.join("\n")}`)
  process.exit(1)
}

writeFileSync(join(dist, "soft-matter.html"), html)

// 清理中间产物：index.html 与 assets/，只留单个 HTML
rmSync(htmlPath)
rmSync(join(dist, "assets"), { recursive: true, force: true })

const sizeMb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2)
console.log(`[make-single-html] 完成：dist-single/soft-matter.html（${sizeMb} MB）`)
