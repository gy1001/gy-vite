const http = require('http')
const fs = require('fs')
const path = require('path')

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

const server = http.createServer((req, res) => {
  // 解析路径（去掉查询参数和 hash）
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`)
  let pathname = parsedUrl.pathname

  // 如果是根路径，指向 index.html
  if (pathname === '/') {
    pathname = '/index.html'
  }

  // 映射到本地文件系统
  const filePath = path.join(process.cwd(), pathname)

  // 获取扩展名
  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

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
