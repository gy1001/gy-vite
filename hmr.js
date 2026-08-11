const chokidar = require('chokidar')
const { WebSocketServer } = require('ws')
const path = require('path')

function findAcceptBoundary(modNode, visited = new Set()) {
  // 1. 自身 accept
  if (modNode.isSelfAccepting) {
    return modNode
  }
  // 2. 到顶了还没找到
  if (modNode.importers.size === 0) {
    return null
  }
  // 3. 防循环
  if (visited.has(modNode.url)) {
    return null
  }
  visited.add(modNode.url)
  // 4. 递归向上找
  let boundary = null
  for (const importer of modNode.importers) {
    const b = findAcceptBoundary(importer, visited)
    if (!b) return null // 任一链路找不到 → 降级
    if (!boundary) boundary = b
  }
  return boundary
}

function createHMRServer(server, moduleGraph) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', () => {
    console.log('[HMR] 客户端已连接')
  })

  // 广播，发送消息
  function send(msg) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        // OPEN
        client.send(JSON.stringify(msg))
      }
    })
  }

  const watcher = chokidar.watch(process.cwd(), {
    ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  })

  watcher.on('change', (filePath) => {
    // 把磁盘路径转成 URL
    const url = '/' + path.relative(process.cwd(), filePath).replace(/\\/g, '/')
    const node = moduleGraph.getNode(url)

    if (!node) {
      // 模块图里没有，全量刷新
      send({ type: 'full-reload' })
      return
    }

    const boundary = findAcceptBoundary(node)

    if (boundary) {
      console.log(`[HMR] 局部更新: ${url} → boundary: ${boundary.url}`)
      send({
        type: 'update',
        updates: [url],
        boundary: boundary.url,
      })
    } else {
      console.log(`[HMR] 全量更新: ${url}`)
      send({ type: 'full-reload' })
    }
  })

  return { server, watcher }
}

module.exports = { createHMRServer }
