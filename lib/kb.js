import fs from 'node:fs'
import path from 'node:path'

export const KB_EXTENSIONS = ['.md', '.docx']

export function createKb({ kbDir, broadcast, docxExtract, docxWrite }) {
  function safeKbName(name) {
    const raw = String(name ?? '').trim().replace(/\\/g, '/')
    if (!raw) throw new Error('缺少 name')
    const parts = raw.split('/').filter((part) => part.length > 0)
    if (!parts.length) throw new Error('缺少 name')
    for (const part of parts) {
      if (part === '.' || part === '..') throw new Error('name 里不能有 . 或 ..')
      if (/[:*?"<>|]/.test(part)) throw new Error('name 里有非法字符')
    }
    const rel = parts.join('/')
    if (!KB_EXTENSIONS.some((ext) => rel.toLowerCase().endsWith(ext))) throw new Error('name 必须是以 .md 或 .docx 结尾')
    return rel
  }

  // 允许 "Linux/实验五.md" 这类相对路径，但解析后必须还在 kb 目录里
  function kbPathOf(rel) {
    const root = path.resolve(kbDir)
    const abs = path.resolve(root, rel)
    if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('路径越出知识库')
    return abs
  }

  function kbSummary(value) {
    if (Array.isArray(value?.files)) {
      if (value.files.length === 0) return '知识库为空。'
      return (
        `知识库共 ${value.files.length} 个文件：\n` +
        value.files.map((f) => `- ${f.name}${f.type === 'docx' ? '（Word）' : ''} (${f.bytes} B)`).join('\n')
      )
    }
    if (typeof value?.content === 'string') {
      const clipped = value.content.slice(0, 4000) + (value.content.length > 4000 ? '…' : '')
      return value.type === 'docx' ? `${clipped}\n\n（以上是 Word 文档抽取的文本）` : clipped
    }
    if (value?.deleted) return `已删除 ${value.name}`
    if (value?.imported) return `已导入 Word：${value.name}（${value.bytes} B）`
    if (value?.type === 'docx' && value?.bytes !== undefined) {
      return `已生成 Word：${value.name}（${value.bytes} B，${value.paragraphs ?? 0} 段 / ${value.tables ?? 0} 表）`
    }
    if (value?.bytes !== undefined) return `已保存 ${value.name}（${value.bytes} B）`
    return JSON.stringify(value)
  }

  function kbListFiles(dir = kbDir, prefix = '', depth = 0, out = []) {
    if (depth > 4) return out
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return out
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        kbListFiles(path.join(dir, entry.name), rel, depth + 1, out)
        continue
      }
      if (!KB_EXTENSIONS.some((ext) => entry.name.toLowerCase().endsWith(ext))) continue
      const stat = fs.statSync(path.join(dir, entry.name))
      out.push({
        name: rel,
        type: entry.name.toLowerCase().endsWith('.docx') ? 'docx' : 'md',
        bytes: stat.size,
        modified: stat.mtime.toISOString(),
      })
    }
    return out
  }

  async function kbRun(args = {}) {
    const action = args.action
    if (action === 'list') return { files: kbListFiles() }
    const name = safeKbName(args.name)
    const file = kbPathOf(name)
    const isDocx = name.toLowerCase().endsWith('.docx')
    if (action === 'read') {
      if (isDocx) return { name, type: 'docx', content: await docxExtract(file) }
      return { name, type: 'md', content: fs.readFileSync(file, 'utf8') }
    }
    if (action === 'save') {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      if (isDocx && args.source) {
        const source = path.resolve(String(args.source))
        if (!fs.existsSync(source)) throw new Error(`找不到源文件 ${source}`)
        fs.copyFileSync(source, file)
        let preview = ''
        try {
          preview = await docxExtract(file)
        } catch {
          /* the copy is still valid even if extraction fails */
        }
        broadcast('kb', { files: kbListFiles(), saved: name })
        return { name, type: 'docx', bytes: fs.statSync(file).size, imported: true, preview: preview.slice(0, 400) }
      }
      const content = String(args.content ?? '')
      if (content.length > 400000) throw new Error('内容过大（超过 400KB）')
      if (isDocx) {
        if (!content.trim()) throw new Error('生成 Word 需要 content')
        const result = await docxWrite(file, content)
        broadcast('kb', { files: kbListFiles(), saved: name })
        return {
          name,
          type: 'docx',
          bytes: fs.statSync(file).size,
          paragraphs: result.paragraphs,
          tables: result.tables,
        }
      }
      fs.writeFileSync(file, content, 'utf8')
      broadcast('kb', { files: kbListFiles(), saved: name })
      return { name, type: 'md', bytes: Buffer.byteLength(content, 'utf8') }
    }
    if (action === 'delete') {
      fs.rmSync(file, { force: true })
      // 删完顺手清掉空掉的上层目录，别留一堆空壳（不越过 kb 根）
      const root = path.resolve(kbDir)
      let dir = path.dirname(file)
      while (dir !== root && dir.startsWith(root + path.sep)) {
        try {
          if (fs.readdirSync(dir).length) break
          fs.rmdirSync(dir)
        } catch {
          break
        }
        dir = path.dirname(dir)
      }
      broadcast('kb', { files: kbListFiles(), deleted: name })
      return { name, deleted: true }
    }
    throw new Error(`未知 action: ${action}`)
  }

  const tool = {
    name: 'guide_kb',
    description:
      '教学文件知识库，支持 Markdown（.md）和 Word（.docx）。action=list 列出；read 读取（.docx 会抽取成 Markdown 文本）；save 保存或覆盖（.docx 会用 Markdown 生成排版好的 Word，给 source 则导入已有文件）；delete 删除。name 可以带子目录，写成「课程/文件名.md」，目录会自动创建。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'read', 'save', 'delete'] },
        name: { type: 'string' },
        content: { type: 'string', description: 'save 的内容；.docx 下按 Markdown 解析成标题/列表/表格' },
        source: { type: 'string', description: 'save .docx 时可选：已有 Word 文件的绝对路径，直接导入' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (args, value) => [{ type: 'text', text: kbSummary(value) }],
    },
    async execute(args = {}) {
      return await kbRun(args)
    },
  }

  return { tool, run: kbRun, list: kbListFiles, summary: kbSummary }
}
