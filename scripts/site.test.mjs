import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const root = resolve('dist')
test('发布物包含实验入口、两个实验和明确的 404', () => {
  for (const file of ['index.html', 'soft-matter/index.html', 'liquid-reality/index.html', '404.html']) {
    assert.ok(existsSync(resolve(root, file)), `缺少可直接访问的页面 ${file}`)
  }
  assert.match(readFileSync(resolve(root, 'index.html'), 'utf8'), /有趣实验/)
})
test('页面引用的本地资源都存在，包括子目录相对路径', () => {
  for (const file of ['index.html', 'soft-matter/index.html', 'liquid-reality/index.html']) {
    assert.ok(existsSync(resolve(root, file)), `缺少页面 ${file}`)
    const html = readFileSync(resolve(root, file), 'utf8')
    for (const [, url] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if (/^(https?:|data:|mailto:)/.test(url)) continue
      const local = url.split(/[?#]/)[0]
      if (!local) continue
      const target = local.startsWith('/') ? resolve(root, '.' + local) : resolve(root, dirname(file), local)
      assert.ok(target.startsWith(root + '/') || target === root, `资源不能越过发布根目录 ${url}`)
      assert.ok(existsSync(target), `${file} 中资源不存在：${url}`)
    }
  }
})
