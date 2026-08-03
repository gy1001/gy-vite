# gy-vite

learn mini-vite

## 1. 步骤 1：搭建最简静态文件服务器

好的，那我们就来一场真正的 **“手写 Mini-Vite”** 之旅！我会把整个过程分解成 10 个可操作的步骤，每一步你都要亲手敲代码，我会在旁边解释原理、给出源码参考、提示容易掉进去的坑。最终你会拥有一个能跑 ESM 开发服务器、支持模块热替换的 Mini-Vite。

---

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

## 📚 准备工作

1. 安装 Node.js（推荐 v18+）。
2. 创建一个新文件夹 `mini-vite`，之后我们的代码都在里面。
3. 初始化项目：`npm init -y` 或 `pnpm init`。
4. 后面我们会根据步骤逐步安装 `esbuild`, `ws` 等包。

---

## 🚀 现在正式开始 **步骤 1：搭建最简静态文件服务器**

### 🎯 目标

启动一个 HTTP 服务器，当浏览器访问 `http://localhost:3000` 时，能正确返回本地文件（如 `index.html`、`main.js`、`App.vue` 等）。不处理任何编译，只是把文件内容原样返回。

### 🧠 核心知识

- Vite 的开发服务器使用 `connect`（或 `http`）模块搭建。
- 它拦截浏览器的 ESM 导入请求，按需返回文件。
- 在早期版本中，Vite 会为每个请求改写导入路径（将裸路径 `lodash` 改写为 `/@modules/lodash`），但现在很多逻辑被集成到了预构建。

### ✍️ 动手实现

**任务 1.1：创建一个最简单的 HTTP 服务器**

- 在项目根目录创建 `server.js`，用 Node.js 内置的 `http` 模块写一个服务器。
- 监听 3000 端口。
- 对于任何请求，根据 URL 的路径读取项目内的文件，并返回。

参考代码框架：

```js
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
```

🔍 代码说明
MIME 映射：确保浏览器能正确识别文件类型，尤其是 .js 必须返回 application/javascript，否则浏览器会拒绝执行 ESM 模块。

根路径处理：访问 http://localhost:3000 自动返回 index.html。

读取文件：使用 fs.readFile 异步读取，错误时返回 404。

端口：暂定 3000，如有冲突可自行修改。

**任务 1.2：支持 MIME 类型判断**
根据文件扩展名设置 `Content-Type`，例如 `.js` 返回 `application/javascript`，`.html` 返回 `text/html`，`.css` 返回 `text/css`。

**任务 1.3：处理 ESM 模块**
现代浏览器通过 `import` 语句加载模块，需要服务器返回正确的 MIME type（必须是 `application/javascript` 或 `text/javascript`）。确保你的服务器对 `.js` 文件设置了正确的 `Content-Type`。

### 📖 阅读 Vite 源码建议

打开 Vite 仓库，找到 `packages/vite/src/node/server/index.ts`，搜索 `createServer` 函数，看一下它的中间件注册部分。你会看到类似 `app.use(transformMiddleware)` 这样的代码，我们未来会逐步实现这些中间件。

### ✅ 验收标准

在项目里创建 `index.html`、`main.js`，访问 `http://localhost:3000` 能看到页面，并且在浏览器的 Network 标签里看到请求的文件都被正确返回。

🧪 验证
在项目根目录创建两个文件： `index.html` `main.js`

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
  <body>
    <h1>Mini-Vite is running!</h1>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

```js
// main.js
console.log('Hello from ESM module!')
```

然后运行 node server.js，打开浏览器访问 http://localhost:3000，你应该能看到标题文字，并且控制台输出 Hello from ESM module!，Network 标签中的 main.js 状态码为 200 且类型为 application/javascript。
