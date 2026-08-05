const { init, parse } = require('es-module-lexer')

/**
 * 重写 import 路径
 * @param {string} source - 源码
 * @param {string} moduleUrl - 当前模块的浏览器侧 URL（如 /main.js）
 */
async function rewriteImports(source, moduleUrl = '/') {
  await init
  const [imports] = parse(source)

  let newSource = source
  // 从后往前替换，避免位置偏移
  for (let i = imports.length - 1; i >= 0; i--) {
    const { s, e, n } = imports[i]
    if (!n) continue

    let replacement = n
    if (!n.startsWith('.') && !n.startsWith('/') && !n.startsWith('http')) {
      replacement = `/@modules/${n}`
    } else if (n.startsWith('./') || n.startsWith('../')) {
      const baseUrl = new URL(moduleUrl, 'http://localhost')
      const targetUrl = new URL(n, baseUrl)
      replacement = targetUrl.pathname
    }

    newSource = newSource.slice(0, s) + replacement + newSource.slice(e)
  }

  return newSource
}

module.exports = { rewriteImports }
