const http = require('http')
const fs = require('fs')
const path = require('path')
const { rewriteImports } = require('./utils')
const { resolveModule } = require('./resolveModule')
const { transform } = require('./transform')
const { ModuleGraph } = require('./moduleGraph')
const { getImportUrls } = require('./utils')
const moduleGraph = new ModuleGraph()
const { createHMRServer } = require('./hmr')

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

// HTML 注入客户端脚本
const HMR_CLIENT_CODE = `
  <script>
    const ws = new WebSocket("ws://" + location.host)
    ws.addEventListener("message", ({data}) => {
      const msg = JSON.parse(data)
      if(msg.type === "full-reload"){
        location.reload()
      }
    })
  </script>
`

const server = http.createServer(async (req, res) => {
  // 解析路径（去掉查询参数和 hash）
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`)
  let pathname = parsedUrl.pathname

  // 如果是根路径，指向 index.html
  if (pathname === '/') {
    pathname = '/index.html'
  }

  // 增加 __graph 接口查看模块图
  if (pathname === '/__graph') {
    const graphData = Array.from(moduleGraph.nodes.values()).map((node) => ({
      url: node.url,
      importers: Array.from(node.importers.values().map((n) => n.url)),
      importedModules: Array.from(node.importedModules.values()).map(
        (n) => n.url,
      ),
      isSelfAccepting: node.isSelfAccepting,
    }))

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(graphData, null, 2))
    return
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

    const importUrls = await getImportUrls(content)
    importUrls.forEach((importUrl) => {
      // 相对路径解析成绝对 URL
      const resolvedImport = importUrl.startsWith('.')
        ? path.posix.join(path.posix.dirname(pathname), importUrl)
        : importUrl
      moduleGraph.addEdge(pathname, resolvedImport)
    })

    res.writeHead(200, { 'Content-Type': 'application/javascript' })
    res.end(content)
    return
  }

  // 映射到本地文件系统
  const filePath = path.join(process.cwd(), pathname)

  // 获取扩展名
  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  // 在返回 HTML 之前注入
  if (ext === '.html') {
    let content = fs.readFileSync(filePath, 'utf-8')
    if (content.includes('</body>')) {
      content = content.replace('</body>', HMR_CLIENT_CODE + '</body>')
    } else {
      content = content + HMR_CLIENT_CODE
    }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(content)
    return
  }

  // CSS 处理：包装成 JS 模块
  if (ext === '.css') {
    const cssContent = fs.readFileSync(filePath, 'utf-8')
    const jsContent = `
      const style = document.createElement("style")
      style.textContent = ${JSON.stringify(cssContent)}
      document.head.appendChild(style)
      export default {}
    `.trim()
    res.writeHead(200, { 'content-type': 'application/javascript' })
    res.end(jsContent)
    return
  }

  // 图片等静态资源：区分模块导入和文件加载
  const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|bmp|tiff?)$/
  const isImport = parsedUrl.searchParams.get('import') !== null
  if (ASSET_RE.test(pathname)) {
    if (isImport) {
      // 作为 ES 模块导入：返回 JS 代码，导出图片 URL
      const assetUrl = pathname
      const jsContent = `export default ${JSON.stringify(assetUrl)}`
      res.writeHead(200, { 'content-type': 'application/javascript' })
      res.end(jsContent)
    } else {
      // 作为文件加载（如 <img src>）：返回真实图片数据
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' })
        res.end('Not Found')
        return
      }
      const data = fs.readFileSync(filePath)
      res.writeHead(200, { 'Content-Type': contentType })
      res.end(data)
    }
    return
  }

  // JS/TS 文件处理
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
    const importUrls = await getImportUrls(content)
    importUrls.forEach((importUrl) => {
      // 相对路径解析成绝对 URL
      const resolvedImport = importUrl.startsWith('.')
        ? path.posix.join(path.posix.dirname(pathname), importUrl)
        : importUrl
      moduleGraph.addEdge(pathname, resolvedImport)
    })

    res.writeHead(200, { 'Content-Type': 'application/javascript' })
    res.end(content)
    return
  }

  // 其他静态文件直接返回
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

createHMRServer(server, moduleGraph)
const PORT = 3000
server.listen(PORT, () => {
  console.log(`✅ Mini-Vite dev server running at http://localhost:${PORT}`)
})
