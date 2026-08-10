const chokidar = require('chokidar')
const { WebSocketServer } = require('ws')

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
    console.log(`[HMR] 文件改动: ${filePath}`)
    // 简单粗暴：全量刷新
    send({ type: 'full-reload' })
  })

  return { server, watcher }
}

module.exports = { createHMRServer }
