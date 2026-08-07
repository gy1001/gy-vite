const esbuild = require('esbuild')

/**
 * 用 esbuild 编译 ts jsx
 * @param {*} code 源码
 * @param {*} id 文件路径，用于判断 loader
 * @returns
 */
async function transform(code, id) {
  const ext = id.split('.').pop()

  const extObj = {
    tsx: 'tsx',
    jsx: 'jsx',
    ts: 'ts',
  }
  const loader = extObj[ext] || 'js'

  const result = await esbuild.transform(code, {
    loader,
    target: 'es2020',
    format: 'esm',
  })

  return result.code
}

module.exports = { transform }
