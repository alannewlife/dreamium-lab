import path from "path"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

// 单 HTML 打包专用配置：与 vite.config.ts 完全独立，常规 dev/build 流程零影响。
// 原理：assetsInlineLimit 拉满让 woff2 字体以 base64 内联进 CSS；
// 项目无动态 import，构建天然单 chunk；JS/CSS 的内联由 scripts/make-single-html.mjs 后处理完成。
export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist-single",
    emptyOutDir: true,
    // 任何资源（woff2 字体等）一律内联为 data URI，不产出独立资源文件
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
