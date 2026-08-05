const fs = require('fs')
const path = require('path')

/**
 * 解析裸模块到磁盘路径 + 浏览器 URL
 * @param {string} modulePath - 裸模块名（如 lodash-es 或 lodash-es/add.js）
 * @returns {{ fullPath: string, moduleUrl: string } | null}
 */
function resolveModule(modulePath) {
  // 1. 区分包名和子路径
  let packageName, subPath
  if (modulePath.startsWith('@')) {
    // @scope/name 或 @scope/name/sub
    const parts = modulePath.split('/')
    packageName = parts.slice(0, 2).join('/')
    subPath = parts.slice(2).join('/')
  } else {
    const idx = modulePath.indexOf('/')
    if (idx === -1) {
      packageName = modulePath
      subPath = ''
    } else {
      packageName = modulePath.slice(0, idx)
      subPath = modulePath.slice(idx + 1)
    }
  }

  // 2. 找包目录
  const pkgDir = path.join(process.cwd(), 'node_modules', packageName)
  if (!fs.existsSync(pkgDir)) {
    console.error(`[resolveModule] 模块目录不存在: ${pkgDir}`)
    return null
  }

  // 3. 读 package.json 找入口
  const pkgJsonPath = path.join(pkgDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) {
    console.error(`[resolveModule] 找不到 package.json: ${pkgJsonPath}`)
    return null
  }
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
  const entry = pkg.module || pkg.main || 'index.js'

  // 4. 拼完整路径
  let fullPath = subPath ? path.join(pkgDir, subPath) : path.join(pkgDir, entry)

  // 5. 补 .js 扩展名
  if (!fs.existsSync(fullPath)) {
    if (path.extname(fullPath) === '' && fs.existsSync(fullPath + '.js')) {
      fullPath += '.js'
    } else {
      console.error(`[resolveModule] 文件不存在: ${fullPath}`)
      return null
    }
  }

  // 6. 构造浏览器侧 URL（必须带入口文件名！）
  const entryPath = subPath ? subPath : entry
  const moduleUrl = `/@modules/${packageName}/${entryPath}`

  return { fullPath, moduleUrl }
}

module.exports = { resolveModule }
