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
    this.nodes = new Map() // url => ModuleNode
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
