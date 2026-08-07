# Mini-Vite 从零搭建教程

> 本教程带你从零实现一个类 Vite 的构建工具，涵盖开发服务器、HMR、插件系统、预构建、生产构建等核心特性。每一步都有明确目标、原理、代码示例和验证方法。

## 🧭 学习路线图（共 10 步）

| 步骤 | 主题                                               | 成果                                             |
| ---- | -------------------------------------------------- | ------------------------------------------------ |
| 1    | **搭建最简静态文件服务器**                         | 让浏览器可以请求到本地文件                       |
| 2    | **支持第三方依赖 （node_modules）**                | 处理裸路径导入，重定向到 node_modules            |
| 3    | **编译 TS / JSX 等非 JS 文件**                     | 用 esbuild 实时编译                              |
| 4    | **处理 CSS 和静态资源**                            | 支持 import './style.css'，图片等                |
| 5    | **模块图（Module Graph）**                         | 建立依赖关系，为 HMR 打基础                      |
| 6    | **HMR 热更新（上）：客户端注入与服务端 WebSocket** | 建立起服务端与浏览器的 WebSocket 连接            |
| 7    | **HMR 热更新（下）：精确模块替换**                 | 收到更新通知后，只更新改动的模块                 |
| 8    | **插件系统（简易版）**                             | 实现类似 Vite 的 resolveId、load、transform 钩子 |
| 9    | **预构建（Pre-bundling）**                         | 用 esbuild 将 CommonJS 包和大型依赖预打包成 ESM  |
| 10   | **生产构建（Rollup 简单包装）**                    | 将整个 Mini-Vite 的构建流程对接到 Rollup         |

---

## 目录

- [第 0 步：项目初始化](#第-0-步项目初始化)
- [第 1 步：静态文件服务器](#第-1-步静态文件服务器)
- [第 2 步：模块路径重写](#第-2-步模块路径重写)
- [第 3 步：TS/JSX 编译](#第-3-步tsjsx-编译)
- [第 4 步：CSS 处理](#第-4-步css-处理)
- [第 5 步：静态资源处理](#第-5-步静态资源处理)
- [第 6 步：模块依赖图](#第-6-步模块依赖图)
- [第 7 步：HMR 热更新（上）—— 全量更新](#第-7-步hmr-热更新上--全量更新)
- [第 8 步：HMR 热更新（下）—— 精确模块替换](#第-8-步hmr-热更新下--精确模块替换)
- [第 9 步：插件系统](#第-9-步插件系统)
- [第 10 步：依赖预构建](#第-10-步依赖预构建)
- [第 11 步：生产构建（Rollup）](#第-11-步生产构建rollup)
- [扩展方向](#扩展方向)

---

## 第 0 步：项目初始化

### 目标

搭建项目骨架，安装基础依赖。

### 步骤

```bash
mkdir mini-vite && cd mini-vite
pnpm init
```

安装依赖：

```bash
pnpm add esbuild es-module-lexer chokidar ws lodash-es
pnpm add -D rollup @rollup/plugin-html rollup-plugin-terser
```

创建基础目录结构：

```
mini-vite/
├── index.html          # 测试页面
├── main.js             # 入口 JS
├── test/
│   ├── test.ts         # TS 模块
│   └── style.css       # CSS 模块
├── logo.png            # 静态资源
├── server.js           # 开发服务器
├── utils.js            # 工具函数
├── resolveModule.js    # 模块解析
├── transform.js        # esbuild 编译
├── moduleGraph.js      # 模块依赖图
├── hmr.js              # HMR 核心
├── pluginContainer.js  # 插件容器
├── prebuild.js         # 预构建
└── build.js            # 生产构建
```

### 测试文件内容

**index.html**：

```html
<!doctype html>
<html>
  <body>
    <h1>server is running!</h1>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

**main.js**：

```javascript
import { add } from 'lodash-es'
import './test/style.css'
import logo from './logo.png'

console.log(add(1, 2))
```

**test/test.ts**：

```ts
export function greet(name: string): string {
  return `Hello, ${name}`
}
```

**test/style.css**：

```css
body {
  background-color: #f0f0f0;
}
```

### package.json 配置

```json
{
  "name": "mini-vite",
  "version": "1.0.0",
  "scripts": {
    "dev": "node server.js",
    "build": "node build.js"
  }
}
```

### 验证

```bash
node -v  # 确保 Node 18+
```

---

## 第 1 步：静态文件服务器

### 目标

实现一个能返回静态文件的 HTTP 服务器，访问 `http://localhost:3000/` 能看到 index.html。

### 原理

- 用 Node.js `http` 模块创建服务器
- 根据 URL 路径映射到磁盘文件
- 根据扩展名设置正确的 Content-Type

### 实现

**server.js**：

```js
const http = require('http')
const fs = require('fs')
const path = require('path')

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let pathname = url.pathname

  // / 默认返回 index.html
  if (pathname === '/') {
    pathname = '/index.html'
  }

  const filePath = path.join(process.cwd(), pathname)

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }

  const ext = path.extname(filePath)
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  const data = fs.readFileSync(filePath)
  res.writeHead(200, { 'Content-Type': contentType })
  res.end(data)
})

server.listen(3000, () => {
  console.log('✅ Mini-Vite dev server running at http://localhost:3000')
})
```

### 验证

1. `node server.js`
2. 访问 `http://localhost:3000/` → 看到 "server is running!"
3. 访问 `http://localhost:3000/main.js` → 看到 main.js 源码

### 容易踩的坑

- 浏览器打开 main.js 里的 `import { add } from 'lodash-es'` 会报错，因为浏览器不认识裸模块。这是第 2 步要解决的问题。

---

## 第 2 步：模块路径重写

### 目标

把 main.js 里的 `import { add } from 'lodash-es'` 重写成 `import { add } from '/@modules/lodash-es'`，并让 server 能处理 `/@modules/` 请求。

### 原理

1. 用 `es-module-lexer` 解析 JS 源码，找到所有 import 语句
2. 裸模块（不以 `./` `../` `/` `http` 开头）→ 加 `/@modules/` 前缀
3. 相对路径 → 基于 moduleUrl 解析成绝对路径
4. server 收到 `/@modules/xxx` 请求时，从 node_modules 解析真实文件路径返回

### 实现

**utils.js**：

```js
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

    // n 为 undefined 说明不是带 from 的 import（如 import.meta），跳过
    if (!n) continue

    let replacement = n
    if (!n.startsWith('.') && !n.startsWith('/') && !n.startsWith('http')) {
      // 裸模块 → /@modules/xxx
      replacement = `/@modules/${n}`
    } else if (n.startsWith('./') || n.startsWith('../')) {
      // 相对路径 → 基于 moduleUrl 解析成绝对路径
      const baseUrl = new URL(moduleUrl, 'http://localhost')
      const targetUrl = new URL(n, baseUrl)
      replacement = targetUrl.pathname
    }

    newSource = newSource.slice(0, s) + replacement + newSource.slice(e)
  }

  return newSource
}

module.exports = { rewriteImports }
```

**resolveModule.js**：

```js
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
```

**server.js**（在第 1 步基础上增加）：

```js
const { rewriteImports } = require('./utils')
const { resolveModule } = require('./resolveModule')

// 在 http.createServer 回调里加：
const ext = path.extname(filePath)

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

// 处理 JS 文件：重写 import 路径
if (ext === '.js' || ext === '.mjs') {
  let content = fs.readFileSync(filePath, 'utf-8')
  content = await rewriteImports(content, pathname)
  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(content)
  return
}

// 其他文件原样返回（第 1 步的逻辑）
```

⚠️ **注意**：`http.createServer` 的回调要改成 `async` 函数。

### 验证

1. 访问 `http://localhost:3000/` → 页面正常显示
2. F12 → Network → main.js 请求 → 响应里 `from 'lodash-es'` 应被重写成 `from '/@modules/lodash-es'`
3. 控制台打印 `3`（add(1,2) 的结果）

### 容易踩的坑

- **`rewriteImports` 第二个参数必须传浏览器侧 URL（含入口文件名）**，如 `/@modules/lodash-es/lodash.js`，不能传磁盘绝对路径。否则 `./add.js` 这种相对导入会解析错。
- **es-module-lexer 的 `parse` 对非 JS 文件（如 HTML）会抛错**，所以重写前要判断扩展名。
- **`n` 可能为 undefined**（如 `import.meta.hot`），要先判空再调用 `n.startsWith`。

---

## 第 3 步：TS/JSX 编译

### 目标

支持 `.ts` `.tsx` `.jsx` 文件，用 esbuild 编译成浏览器能识别的 JS。

### 原理

- esbuild 的 `transform` API 能把 TS/JSX 转成 JS
- 在返回 JS 文件前，先判断扩展名，是 TS/JSX 就先编译

### 实现

**transform.js**：

```js
const esbuild = require('esbuild')

/**
 * 用 esbuild 编译 TS/JSX
 * @param {string} code - 源码
 * @param {string} id - 文件路径（用于判断 loader）
 */
async function transform(code, id) {
  const ext = id.split('.').pop()
  const loader =
    ext === 'tsx' ? 'tsx' : ext === 'jsx' ? 'jsx' : ext === 'ts' ? 'ts' : 'js'

  const result = await esbuild.transform(code, {
    loader,
    target: 'es2020',
    format: 'esm',
  })

  return result.code
}

module.exports = { transform }
```

**server.js** 增加 TS 处理：

```js
const { transform } = require('./transform')

// 修改 JS 分支判断，加入 TS/JSX
if (
  ext === '.js' ||
  ext === '.mjs' ||
  ext === '.ts' ||
  ext === '.tsx' ||
  ext === '.jsx'
) {
  let content = fs.readFileSync(filePath, 'utf-8')

  // 先编译 TS/JSX → JS
  if (ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
    content = await transform(content, filePath)
  }

  // 再重写 import 路径
  content = await rewriteImports(content, pathname)

  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(content)
  return
}
```

**test/test.ts** 里加个使用：

```ts
export function greet(name: string): string {
  return `Hello, ${name}`
}

console.log(greet('mini-vite'))
```

**main.js** 里 import：

```js
import { greet } from './test/test.ts'
console.log(greet('mini-vite'))
```

### 验证

1. 访问 `http://localhost:3000/test/test.ts` → 返回编译后的 JS
2. 控制台打印 `Hello, mini-vite`

### 容易踩的坑

- **编译和重写的顺序**：先 `transform`（TS→JS），再 `rewriteImports`（路径重写）。顺序反了会出错。
- **import 路径要带扩展名**：`import { greet } from './test/test.ts'`，不能写成 `./test/test`。Vite 会自动补全扩展名，mini-vite 暂不实现。

---

## 第 4 步：CSS 处理

### 目标

浏览器原生不支持 `import './style.css'`，要把 CSS 包装成 JS 模块（通过 `<style>` 标签注入）。

### 原理

- 收到 `.css` 请求时，把 CSS 内容包装成 JS 代码
- JS 代码创建 `<style>` 标签，`textContent` 设为 CSS 内容，插入 `<head>`
- 导出空对象，让 `import` 语法合法

### 实现

**server.js** 增加 CSS 分支：

```js
if (ext === '.css') {
  const cssContent = fs.readFileSync(filePath, 'utf-8')
  const jsContent = `
const style = document.createElement('style')
style.textContent = ${JSON.stringify(cssContent)}
document.head.appendChild(style)
export default {}
  `.trim()

  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(jsContent)
  return
}
```

### 验证

1. 访问 `http://localhost:3000/test/style.css` → 返回 JS 代码（不是 CSS）
2. 页面背景色变成 `#f0f0f0`
3. F12 → Elements → `<head>` 里有动态插入的 `<style>`

### 容易踩的坑

- **Content-Type 要是 `application/javascript`**，不是 `text/css`，因为返回的是 JS 代码。
- **CSS 内容用 `JSON.stringify` 转义**，避免引号、换行破坏 JS 字符串。

---

## 第 5 步：静态资源处理

### 目标

支持 `import logo from './logo.png'`，让图片能在 JS 中作为模块导入。

### 原理

- `.png` `.jpg` `.svg` 等静态资源，包装成 JS 模块
- 导出图片的 URL 路径，浏览器按 URL 加载图片

### 实现

**server.js** 增加静态资源分支：

```js
const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico)$/

if (ASSET_RE.test(pathname)) {
  const jsContent = `export default ${JSON.stringify(pathname)}`
  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(jsContent)
  return
}
```

**main.js** 使用：

```js
import logo from './logo.png'
console.log(logo) // /logo.png

const img = document.createElement('img')
img.src = logo
document.body.appendChild(img)
```

### 验证

1. 访问 `http://localhost:3000/logo.png` → 返回 `export default "/logo.png"`
2. 页面显示图片

---

## 第 6 步：模块依赖图

### 目标

记录模块间的依赖关系，为 HMR 提供"谁依赖了谁"的数据结构。

### 原理

- 每个模块是一个 `ModuleNode`，记录 `url`、`importers`（谁引用了我）、`importedModules`（我引用了谁）
- 请求处理时，解析 import 语句，建立双向边

### 实现

**moduleGraph.js**：

```js
class ModuleNode {
  constructor(url) {
    this.url = url
    this.importers = new Set() // 谁引用了我
    this.importedModules = new Set() // 我引用了谁
    this.isSelfAccepting = false // 是否调用了 import.meta.hot.accept()
    this.lastHMRTimestamp = 0
  }
}

class ModuleGraph {
  constructor() {
    this.nodes = new Map() // url -> ModuleNode
  }

  // 获取或创建节点
  ensureNode(url) {
    if (!this.nodes.has(url)) {
      this.nodes.set(url, new ModuleNode(url))
    }
    return this.nodes.get(url)
  }

  // 建立依赖边：importer 依赖 imported
  addEdge(importerUrl, importedUrl) {
    const importer = this.ensureNode(importerUrl)
    const imported = this.ensureNode(importedUrl)
    importer.importedModules.add(imported)
    imported.importers.add(importer)
  }

  // 获取节点
  getNode(url) {
    return this.nodes.get(url)
  }
}

module.exports = { ModuleGraph, ModuleNode }
```

**utils.js** 增加 `getImportUrls`：

```js
async function getImportUrls(source) {
  await init
  const [imports] = parse(source)
  return imports.map((imp) => imp.n).filter(Boolean)
}

module.exports = { rewriteImports, getImportUrls }
```

**server.js** 在 rewriteImports 之后记录依赖：

```js
const { ModuleGraph } = require('./moduleGraph')
const { getImportUrls } = require('./utils')
const moduleGraph = new ModuleGraph()

// 在 JS/TS 分支，rewriteImports 之后：
const importUrls = await getImportUrls(content)
importUrls.forEach((importUrl) => {
  // 相对路径解析成绝对 URL
  const resolvedImport = importUrl.startsWith('.')
    ? path.posix.join(path.posix.dirname(pathname), importUrl)
    : importUrl
  moduleGraph.addEdge(pathname, resolvedImport)
})

// /@modules/ 分支也要记录
// （在 rewriteImports 之后加同样的逻辑）
```

增加 `__graph` 接口查看模块图：

```js
if (pathname === '/__graph') {
  const graphData = Array.from(moduleGraph.nodes.values()).map((node) => ({
    url: node.url,
    importers: Array.from(node.importers.values()).map((n) => n.url),
    importedModules: Array.from(node.importedModules.values()).map(
      (n) => n.url,
    ),
    isSelfAccepting: node.isSelfAccepting,
  }))
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(graphData, null, 2))
  return
}
```

### 验证

1. 访问 `http://localhost:3000/` 让模块图建立
2. 访问 `http://localhost:3000/__graph` → 看到 JSON，包含 `/main.js` → `/@modules/lodash-es` 等依赖关系

### 容易踩的坑

- **模块图是请求时建立的**，必须先访问页面让请求触发，模块图才有数据。
- **`getImportUrls` 只能解析 JS/TS，不能解析 HTML/CSS**，调用前要判断扩展名。

---

## 第 7 步：HMR 热更新（上）—— 全量更新

### 目标

实现文件改动监听 + WebSocket 推送 + 浏览器接收消息后刷新页面。

### 原理

1. `chokidar` 监听项目文件变化
2. 文件改动 → 通过 WebSocket 推送 `{ type: 'full-reload' }` 消息
3. HTML 注入客户端脚本，建立 WebSocket 连接
4. 收到 `full-reload` 消息 → `location.reload()`

### 实现

**hmr.js**：

```js
const chokidar = require('chokidar')
const { WebSocketServer } = require('ws')

function createHMRServer(server, moduleGraph) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    console.log('[HMR] 客户端已连接')
  })

  // 广播消息
  function send(msg) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        // OPEN
        client.send(JSON.stringify(msg))
      }
    })
  }

  // 监听文件变化
  const watcher = chokidar.watch(process.cwd(), {
    ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
  })

  watcher.on('change', (filePath) => {
    console.log(`[HMR] 文件改动: ${filePath}`)
    // 简单粗暴：全量刷新
    send({ type: 'full-reload' })
  })

  return { send, watcher }
}

module.exports = { createHMRServer }
```

**server.js** 引入 HMR：

```js
const { createHMRServer } = require('./hmr')

// server 创建后：
const hmrServer = createHMRServer(server, moduleGraph)

// HTML 注入客户端脚本
const HMR_CLIENT_CODE = `
<script>
  const ws = new WebSocket('ws://' + location.host)
  ws.addEventListener('message', ({ data }) => {
    const msg = JSON.parse(data)
    if (msg.type === 'full-reload') {
      location.reload()
    }
  })
</script>
`

// 在返回 HTML 之前注入：
if (ext === '.html') {
  let content = fs.readFileSync(filePath, 'utf-8')
  if (content.includes('</body>')) {
    content = content.replace('</body>', HMR_CLIENT_CODE + '</body>')
  } else {
    content = content + HMR_CLIENT_CODE
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(content)
  return
}
```

### 验证

1. `node server.js`
2. 访问 `http://localhost:3000/`
3. 改 main.js（如改 console.log 内容）→ 终端打印 `[HMR] 文件改动` → 浏览器自动刷新

### 容易踩的坑

- **WebSocket 升级**：`new WebSocketServer({ server })` 会自动处理 `upgrade` 事件，不用手动监听。
- **`ignored` 要排除 node_modules**，否则改 node_modules 会触发刷新。

---

## 第 8 步：HMR 热更新（下）—— 精确模块替换

### 目标

文件改动后只更新改动的模块，不刷新整个页面。需要：

1. 模块声明 `import.meta.hot.accept(cb)` 表示"我能自己处理更新"
2. 服务端沿模块图向上找 accept 边界
3. 找到边界 → 推送精确更新；找不到 → 降级全量刷新

### 原理

- **self-accept**：模块自己调用 `import.meta.hot.accept(cb)`，改动时重新 import 自己，执行 cb
- **boundary 冒泡**：子模块改动，自身没 accept → 沿 importers 向上找，找到第一个 accept 的祖先作为边界
- **降级**：任一 importer 链路找不到 accept → 全量刷新

### 实现

#### 8.1 HMR 客户端模块（`/@vite/hmr-client`）

**server.js** 增加路由：

```js
if (pathname === '/@vite/hmr-client') {
  const clientCode = `
    const hotModules = new Map()
    const dataMap = new Map()

    export function createHotContext(moduleUrl) {
      const hot = {
        data: dataMap.get(moduleUrl) || {},
        accept(cb) {
          hotModules.set(moduleUrl, { deps: new Set([moduleUrl]), cb })
        },
        acceptDeps(deps, cb) {
          const depSet = new Set(deps.map(d => new URL(d, moduleUrl).pathname))
          hotModules.set(moduleUrl, { deps: depSet, cb })
        },
        dispose(cb) {}
      }
      return hot
    }

    const ws = new WebSocket('ws://' + location.host)
    ws.addEventListener('message', async ({ data }) => {
      const msg = JSON.parse(data)
      if (msg.type === 'update') {
        const { boundary } = msg
        if (boundary && hotModules.has(boundary)) {
          const { deps, cb } = hotModules.get(boundary)
          const newModules = []
          for (const dep of deps) {
            try {
              const mod = await import(dep + '?t=' + Date.now())
              newModules.push(mod.default ?? mod)
            } catch (e) {
              console.error('HMR 更新失败:', dep, e)
              return
            }
          }
          if (cb) cb(...newModules)
          console.log('[HMR] 精确更新成功', boundary)
        } else {
          console.log('[HMR] 无精确边界，全量刷新')
          location.reload()
        }
      } else if (msg.type === 'full-reload') {
        location.reload()
      }
    })
  `
  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(clientCode)
  return
}
```

#### 8.2 HTML 注入改为加载模块

```js
// 不再注入大段 script，改为加载 ES 模块
if (ext === '.html') {
  let content = fs.readFileSync(filePath, 'utf-8')
  const hmrScript = '<script type="module" src="/@vite/hmr-client"></script>'
  if (content.includes('</body>')) {
    content = content.replace('</body>', hmrScript + '</body>')
  } else {
    content = content + hmrScript
  }
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(content)
  return
}
```

#### 8.3 hmr-inject 插件（手动版，先不引入插件系统）

在 server.js 的 JS/TS 分支，`transform` 之后、`rewriteImports` 之前，手动注入：

```js
// 注入 HMR 上下文
const injected = `
import { createHotContext } from '/@vite/hmr-client'
import.meta.hot = createHotContext(${JSON.stringify(pathname)})
${content}
`
content = injected
```

⚠️ 注意：浏览器原生 `import.meta` 没有 `.hot` 属性，直接赋值会报错。实际要用 `Object.defineProperty` 或 esbuild 的 define 注入。简化做法：

```js
// 用 var 声明一个变量，让 import.meta.hot 可写
const injected = `
import { createHotContext } from '/@vite/hmr-client'
const __hmr = createHotContext(${JSON.stringify(pathname)})
${content.replace(/import\.meta\.hot/g, '__hmr')}
`
content = injected
```

#### 8.4 标记 isSelfAccepting

在 rewriteImports 之后、记录模块图之前：

```js
const node = moduleGraph.ensureNode(pathname)
node.isSelfAccepting = /import\.meta\.hot\.accept\s*\(/.test(content)
// 或者如果用了上面的替换：/__hmr\.accept\s*\(/.test(content)
```

#### 8.5 findAcceptBoundary 递归查找

**hmr.js** 改写：

```js
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
```

watcher 的 change 事件改写：

```js
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
```

#### 8.6 main.js 声明 accept

```js
import { add } from 'lodash-es'

console.log(add(1, 2))

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    console.log('main.js 自我更新了')
  })
}
```

#### 8.7 CSS 模块默认 self-accept

CSS 分支的包装代码里加 accept：

```js
if (ext === '.css') {
  const cssContent = fs.readFileSync(filePath, 'utf-8')
  const jsContent = `
import { createHotContext } from '/@vite/hmr-client'
const __hmr = createHotContext(${JSON.stringify(pathname)})

const style = document.createElement('style')
style.textContent = ${JSON.stringify(cssContent)}
document.head.appendChild(style)
export default { css: ${JSON.stringify(cssContent)} }

__hmr.accept((newMod) => {
  style.textContent = newMod.css
})
  `.trim()

  // CSS 也要加入模块图
  const cssNode = moduleGraph.ensureNode(pathname)
  cssNode.isSelfAccepting = true

  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(jsContent)
  return
}
```

### 验证

1. 访问 `http://localhost:3000/`，模块图建立
2. 访问 `http://localhost:3000/__graph`，`/main.js` 的 `isSelfAccepting: true`
3. 改 main.js → 终端打印 `局部更新` → 浏览器控制台打印 `main.js 自我更新了` → **不刷新页面**
4. 改 style.css 背景色 → 样式立刻变化 → **不刷新页面**

### 容易踩的坑

- **`import.meta.hot` 浏览器原生不支持**，必须注入。用 `createHotContext` 替换 `import.meta.hot`。
- **accept 回调的参数**：客户端 push 时用 `mod.default ?? mod`，否则 CSS 模块拿不到 `default.css`。
- **CSS 模块要走模块图**：CSS 分支不能直接 `return`，要先 `ensureNode` + `isSelfAccepting = true`。
- **冷启动**：`isSelfAccepting` 是请求时标记的，server 刚启动还没访问页面就改文件，会全量刷新。这是正常的。

---

## 第 9 步：插件系统

### 目标

把 HMR 注入、CSS 处理等逻辑抽成插件，通过插件容器统一管理。

### 原理

- 定义插件接口：`{ name, resolveId, load, transform }`
- `PluginContainer` 按顺序调用各插件的钩子
- 内置插件：`hmr-inject`（注入 HMR 代码）

### 实现

**pluginContainer.js**：

```js
class PluginContainer {
  constructor(plugins) {
    this.plugins = plugins
  }

  // 解析模块 ID
  async resolveId(id, importer) {
    for (const plugin of this.plugins) {
      if (plugin.resolveId) {
        const result = await plugin.resolveId(id, importer)
        if (result) return result
      }
    }
    return null
  }

  // 加载模块内容
  async load(id) {
    for (const plugin of this.plugins) {
      if (plugin.load) {
        const result = await plugin.load(id)
        if (result !== null && result !== undefined) {
          return result
        }
      }
    }
    return null
  }

  // 转换模块代码
  async transform(code, id) {
    for (const plugin of this.plugins) {
      if (plugin.transform) {
        const result = await plugin.transform(code, id)
        if (result !== null && result !== undefined) {
          code = result
        }
      }
    }
    return code
  }
}

module.exports = { PluginContainer }
```

**server.js** 定义内置插件：

```js
const { PluginContainer } = require('./pluginContainer')

// hmr-inject 插件：给 JS/TS 模块注入 HMR 代码
const hmrInjectPlugin = {
  name: 'hmr-inject',
  transform(code, id) {
    // 只对 JS/TS 文件注入
    if (
      !id.endsWith('.js') &&
      !id.endsWith('.ts') &&
      !id.endsWith('.jsx') &&
      !id.endsWith('.tsx')
    ) {
      return null
    }
    return `
import { createHotContext } from '/@vite/hmr-client'
const __hmr = createHotContext(${JSON.stringify(id)})
${code.replace(/import\.meta\.hot/g, '__hmr')}
    `
  },
}

const builtInPlugins = [hmrInjectPlugin]
const pluginContainer = new PluginContainer(builtInPlugins)
```

**server.js** JS/TS 分支改用 pluginContainer：

```js
if (
  ext === '.js' ||
  ext === '.mjs' ||
  ext === '.ts' ||
  ext === '.tsx' ||
  ext === '.jsx'
) {
  let content = fs.readFileSync(filePath, 'utf-8')

  // 1. 编译 TS/JSX
  if (ext === '.ts' || ext === '.tsx' || ext === '.jsx') {
    content = await transform(content, filePath)
  }

  // 2. 走插件管道（hmr-inject 在这里注入 HMR 代码）
  content = await pluginContainer.transform(content, pathname)

  // 3. 重写 import 路径
  content = await rewriteImports(content, pathname)

  // 4. 标记 isSelfAccepting
  const node = moduleGraph.ensureNode(pathname)
  node.isSelfAccepting = /__hmr\.accept\s*\(/.test(content)

  // 5. 记录模块图
  const importUrls = await getImportUrls(content)
  importUrls.forEach((importUrl) => {
    const resolvedImport = importUrl.startsWith('.')
      ? path.posix.join(path.posix.dirname(pathname), importUrl)
      : importUrl
    moduleGraph.addEdge(pathname, resolvedImport)
  })

  res.writeHead(200, { 'Content-Type': 'application/javascript' })
  res.end(content)
  return
}
```

### 验证

1. 访问 `/main.js` → 响应体开头应有 `import { createHotContext } from '/@vite/hmr-client'`
2. HMR 仍正常工作

---

## 第 10 步：依赖预构建

### 目标

用 esbuild 把 node_modules 里的依赖预打包成单文件 ESM，减少浏览器请求数。

### 原理

1. 扫描入口找裸模块（手动指定或用 esbuild 扫描）
2. 用 esbuild `bundle: true` 把每个 dep 打包成单文件
3. 输出到 `node_modules/.vite/deps/`
4. rewriteImports 把裸模块重写成预构建产物路径

### 实现

**prebuild.js**：

```js
const esbuild = require('esbuild')
const fs = require('fs')
const path = require('path')

const PREBUILD_DIR = path.join(process.cwd(), 'node_modules', '.vite')

/**
 * 预构建指定模块列表
 * @param {string[]} modules - 需要预构建的包名列表
 */
async function prebuild(modules) {
  if (!fs.existsSync(PREBUILD_DIR)) {
    fs.mkdirSync(PREBUILD_DIR, { recursive: true })
  }

  for (const mod of modules) {
    const pkgPath = path.join(process.cwd(), 'node_modules', mod)
    if (!fs.existsSync(pkgPath)) {
      console.warn(`[prebuild] 跳过不存在的模块：${mod}`)
      continue
    }

    const entry = findEntry(pkgPath)
    if (!entry) {
      console.warn(`[prebuild] 找不到入口：${mod}`)
      continue
    }

    const outFile = path.join(PREBUILD_DIR, `${mod}.js`)

    await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      outfile: outFile,
      target: 'es2020',
      platform: 'browser',
      plugins: [
        {
          name: 'external-node-modules',
          setup(build) {
            // entryPoint 不标记为 external
            build.onResolve({ filter: /.*/ }, (args) => {
              if (args.kind === 'entry-point') {
                return null
              }
              // 其他裸模块标记为 external
              if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
                return { external: true }
              }
              return null
            })
          },
        },
      ],
    })

    console.log(`[prebuild] 完成: ${mod} → ${outFile}`)
  }
}

/**
 * 找到模块的 ESM 入口文件
 */
function findEntry(moduleDir) {
  const pkgPath = path.join(moduleDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return null
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const entry = pkg.module || pkg.main || 'index.js'
  const fullPath = path.join(moduleDir, entry)
  if (fs.existsSync(fullPath)) return fullPath
  if (fs.existsSync(fullPath + '.js')) return fullPath + '.js'
  return null
}

module.exports = { prebuild, PREBUILD_DIR }
```

**server.js** 启动时预构建：

```js
const { prebuild, PREBUILD_DIR } = require('./prebuild')

// 手动指定要预构建的模块（后续可改成自动扫描）
const depsToPrebuild = ['lodash-es']

// 启动前同步预构建
;(async () => {
  await prebuild(depsToPrebuild)

  // 启动服务器
  server.listen(3000, () => {
    console.log('✅ Mini-Vite dev server running at http://localhost:3000')
  })
})()
```

**server.js** 增加预构建产物路由：

```js
// 处理预构建产物请求
if (pathname.startsWith('/node_modules/.vite/deps/')) {
  const depPath = path.join(process.cwd(), pathname)
  if (fs.existsSync(depPath)) {
    const content = fs.readFileSync(depPath, 'utf-8')
    res.writeHead(200, { 'Content-Type': 'application/javascript' })
    res.end(content)
    return
  }
}
```

**utils.js** rewriteImports 改写裸模块路径：

```js
// 在 rewriteImports 里，裸模块判断改为：
if (!n.startsWith('.') && !n.startsWith('/') && !n.startsWith('http')) {
  // 检查是否有预构建产物
  const prebuildPath = `/node_modules/.vite/deps/${n}.js`
  // 简化：直接用预构建路径（假设所有裸模块都预构建了）
  replacement = prebuildPath
}
```

### 验证

1. `node server.js` → 终端打印 `[prebuild] 完成: lodash-es → ...`
2. `node_modules/.vite/deps/lodash-es.js` 文件存在
3. 访问 `/main.js` → `from 'lodash-es'` 被重写成 `from '/node_modules/.vite/deps/lodash-es.js'`
4. F12 → Network → lodash 相关请求只有 **1 个**（之前是几十个）

### 容易踩的坑

- **esbuild onResolve 会匹配 entryPoint**：要判断 `args.kind === 'entry-point'` 返回 null，否则报 "entry point cannot be marked as external"。
- **模板字符串语法**：`` `${mod}.js` `` 不要写成 `` `${mod.js}` ``（后者是访问 mod 对象的 js 属性）。
- **预构建产物不需要再走 rewriteImports**：它已经是单文件 ESM，没有相对 import 了。

---

## 第 11 步：生产构建（Rollup）

### 目标

用 Rollup 把项目打包成生产环境的静态文件，支持 tree-shaking。

### 原理

1. Rollup 从 main.js 入口递归解析依赖
2. 自定义 `resolveId` / `load` / `transform` 钩子处理模块解析和编译
3. **生产构建不走预构建**，直接解析 node_modules 源码，让 Rollup 做 tree-shaking
4. 用 `@rollup/plugin-node-resolve` 解析裸模块
5. 用 `rollup-plugin-terser` 压缩代码
6. 用 `@rollup/plugin-html` 生成 HTML

### 实现

**build.js**：

```js
const rollup = require('rollup')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const { terser } = require('rollup-plugin-terser')
const html = require('@rollup/plugin-html')
const path = require('path')
const fs = require('fs')
const { transform } = require('./transform')

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|ico|bmp|tiff?)$/i

async function build() {
  const outputDir = path.resolve(process.cwd(), 'dist')

  // 清除输出目录
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true })
  }

  const bundle = await rollup.rollup({
    input: path.resolve(process.cwd(), 'main.js'),
    plugins: [
      // 1. 解析 node_modules 裸模块（必须放第一个）
      nodeResolve({ browser: true }),

      // 2. 自定义插件：处理 TS 编译、CSS/图片包装
      {
        name: 'mini-vite-build',
        async resolveId(id, importer) {
          // 绝对路径直接返回
          if (/^[A-Za-z]:[\\/]/.test(id)) {
            if (fs.existsSync(id)) return id
            if (fs.existsSync(id + '.js')) return id + '.js'
            return null
          }
          // 相对路径
          if (id.startsWith('.') || id.startsWith('/')) {
            const resolved = path.resolve(
              importer ? path.dirname(importer) : process.cwd(),
              id,
            )
            if (fs.existsSync(resolved)) return resolved
            if (fs.existsSync(resolved + '.js')) return resolved + '.js'
            if (fs.existsSync(resolved + '.ts')) return resolved + '.ts'
            if (fs.existsSync(resolved + '.tsx')) return resolved + '.tsx'
            return null
          }
          // 裸模块交给 nodeResolve 处理
          return null
        },
        async load(id) {
          // CSS：包装成 JS 模块
          if (id.endsWith('.css')) {
            const code = fs.readFileSync(id, 'utf-8')
            return `const style = document.createElement('style')
style.textContent = ${JSON.stringify(code)}
document.head.appendChild(style)
export default {}`
          }
          // 图片等静态资源：导出文件名
          if (ASSET_RE.test(id)) {
            const filename = path.basename(id)
            return `export default ${JSON.stringify(filename)}`
          }
          // HTML：不作为模块加载
          if (id.endsWith('.html')) {
            return null
          }
          // JS/TS 文件
          return fs.readFileSync(id, 'utf-8')
        },
        async transform(code, id) {
          // TS/JSX 编译
          if (
            id.endsWith('.ts') ||
            id.endsWith('.tsx') ||
            id.endsWith('.jsx')
          ) {
            return await transform(code, id)
          }
          return code
        },
      },

      // 3. 压缩
      terser(),

      // 4. 生成 HTML（用原 index.html 作模板）
      html({
        title: 'Mini-Vite App',
        template: ({ files, publicPath }) => {
          let html = fs.readFileSync(
            path.resolve(process.cwd(), 'index.html'),
            'utf-8',
          )
          const jsFiles = files.js || []
          const scriptTags = jsFiles
            .map(
              (f) =>
                `<script src="${publicPath}${f.fileName}" type="module"></script>`,
            )
            .join('\n')
          // 替换原来的 <script src="./main.js"></script>
          html = html.replace(
            /<script[^>]*src=["']\.\/main\.js["'][^>]*><\/script>/,
            scriptTags,
          )
          return html
        },
      }),
    ],
  })

  // 输出
  await bundle.write({
    dir: outputDir,
    format: 'esm',
    entryFileNames: '[name]-[hash].js',
    chunkFileNames: '[name]-[hash].js',
    assetFileNames: '[name]-[hash][extname]',
    sourcemap: false,
  })

  // 复制静态资源
  copyAssets(outputDir)

  console.log('✅ 构建完成！输出目录：dist')
}

function copyAssets(outputDir) {
  // 复制 assets/ 目录
  const assetsDir = path.join(process.cwd(), 'assets')
  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, path.join(outputDir, 'assets'), { recursive: true })
  }
  // 复制根目录图片
  const rootFiles = fs.readdirSync(process.cwd())
  rootFiles.forEach((file) => {
    if (ASSET_RE.test(file)) {
      fs.copyFileSync(
        path.join(process.cwd(), file),
        path.join(outputDir, file),
      )
    }
  })
}

build().catch((err) => {
  console.error('❌ 构建失败:', err)
  process.exit(1)
})
```

**package.json** 加构建脚本：

```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "node build.js"
  }
}
```

安装构建依赖：

```bash
pnpm add -D rollup @rollup/plugin-node-resolve @rollup/plugin-html rollup-plugin-terser
```

### 验证

1. `node build.js` → 终端打印 `✅ 构建完成！输出目录：dist`
2. `dist/` 目录有 `main-[hash].js`、`logo.png`、`index.html`
3. `dist/index.html` 里有 `<h1>server is running!</h1>`（保留了原 HTML 内容）
4. `dist/index.html` 的 `<script>` src 是带 hash 的文件名
5. 检查 `dist/main-[hash].js` 大小：应只有几 KB（tree-shaking 生效，只包含 `add` 函数）
6. 用浏览器打开 `dist/index.html` → 页面正常显示

### 容易踩的坑

- **`nodeResolve` 必须放 plugins 数组第一个**，否则裸模块解析不了。
- **生产构建不走预构建**：预构建会破坏 tree-shaking，让 Rollup 直接解析 node_modules 源码。
- **图片要转成 JS 模块**：Rollup 默认不认识 `.png`，要在 `load` 钩子里返回 `export default "filename"`。
- **HTML 模板要替换 script 标签**：`@rollup/plugin-html` 默认不读原 index.html，要用 `template` 函数手动替换。
- **tree-shaking 验证**：在打包文件里搜 `debounce` `cloneDeep` 等未使用函数，应该搜不到。

---

## 扩展方向

完成以上 11 步后，可以继续扩展：

### 1. Vue 单文件组件支持

- 安装 `@vitejs/plugin-vue`
- 在插件系统里注册该插件
- 处理 `.vue` 文件的 `resolveId` / `load` / `transform`

### 2. 更完善的 CSS 处理

- **PostCSS**：用 `postcss` 处理 CSS，支持 autoprefixer、嵌套语法等
- **CSS Modules**：`.module.css` 文件，把 class 名 hash 化，导出映射对象
- **CSS 预处理器**：支持 SCSS/Less，用 esbuild 或对应 loader 编译

### 3. 自动依赖扫描

- 用 esbuild 构建 `index.html`，配自定义 plugin 的 `onResolve` 钩子
- 在 `onResolve` 里捕获裸模块导入，收集成 deps 数组
- 启动时自动扫描，不用手动指定 `depsToPrebuild`

### 4. 更精准的 HMR

- **acceptDeps**：支持 `import.meta.hot.acceptDeps(['./test.ts'], cb)`，指定依赖更新时的回调
- **dispose 回调**：模块卸载时清理副作用（如清除定时器、解绑事件）
- **Vue/React 组件 HMR**：组件级热替换，保留组件状态

### 5. 开发体验优化

- **错误覆盖层**：编译错误时在页面上显示错误信息（类似 Vite 的 overlay）
- ** sourcemap**：开发模式生成 sourcemap，方便调试
- **HTTPS 支持**：用 `https` 模块替代 `http`，支持本地 HTTPS 开发

### 6. 构建优化

- **代码分割**：动态 import 的模块自动分割成独立 chunk
- **CSS 提取**：把 CSS 提取成独立文件，不用 JS 注入
- **CDN 上传**：构建产物自动上传到 CDN
- **增量构建**：只构建改动过的模块

---

## 附录：完整文件清单

```
mini-vite/
├── index.html              # 测试页面
├── main.js                 # 入口 JS
├── logo.png                # 静态资源
├── test/
│   ├── test.ts             # TS 模块
│   └── style.css           # CSS 模块
├── package.json
├── server.js               # 开发服务器（第 1-9 步）
├── utils.js                # 工具函数（rewriteImports, getImportUrls）
├── resolveModule.js        # 模块解析
├── transform.js            # esbuild 编译
├── moduleGraph.js          # 模块依赖图
├── hmr.js                  # HMR 核心
├── pluginContainer.js      # 插件容器
├── prebuild.js             # 预构建
└── build.js                # 生产构建
```

## 附录：依赖清单

```bash
# 运行时依赖
pnpm add esbuild es-module-lexer chokidar ws lodash-es

# 构建依赖
pnpm add -D rollup @rollup/plugin-node-resolve @rollup/plugin-html rollup-plugin-terser
```

## 附录：常用命令

```bash
# 开发
node server.js

# 构建
node build.js

# 查看模块图
# 浏览器访问 http://localhost:3000/__graph
```
