const http = require('http')
const fs = require('fs')
const path = require('path')
const { rewriteImports } = require('./utils')
const { resolveModule } = require('./resolveModule')
const { transform } = require('./transform')

// 简易 MIME 映射表
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

const server = http.createServer(async (req, res) => {
  // 解析路径（去掉查询参数和 hash）
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`)
  let pathname = parsedUrl.pathname

  // 如果是根路径，指向 index.html
  if (pathname === '/') {
    pathname = '/index.html'
  }

  // 处理 /@modules/ 请求
  if (pathname.startsWith('/@modules/')) {
    const moduleName = pathname.replace('/@modules/', '')
    const result = resolveModule(moduleName)

    if (!result) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Module not found')
      return
    }

    const { fullPath, moduleUrl } = result
    let content = fs.readFileSync(fullPath, 'utf-8')
    // 对 node_modules 里的文件也要重写其内部 import
    content = await rewriteImports(content, moduleUrl)
    res.writeHead(200, { 'Content-Type': 'application/javascript' })
    res.end(content)
    return
  }

  // 映射到本地文件系统
  const filePath = path.join(process.cwd(), pathname)

  // 获取扩展名
  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  // 处理 JS 文件：重写 import 路径
  if (
    ext === '.js' ||
    ext === '.mjs' ||
    ext === '.ts' ||
    ext === '.tsx' ||
    ext === '.jsx'
  ) {
    let content = fs.readFileSync(filePath, 'utf-8')

    // 编译 ts jsx =》 js
    if (ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
      content = await transform(content, filePath)
    }

    content = await rewriteImports(content, pathname)
    res.writeHead(200, { 'Content-Type': 'application/javascript' })
    res.end(content)
    return
  }

  // 读取文件并返回
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not Found')
      return
    }
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(data)
  })
})

const PORT = 3000
server.listen(PORT, () => {
  console.log(`✅ Mini-Vite dev server running at http://localhost:${PORT}`)
})
