import { resolve } from 'node:path'
import type { RowDataPacket } from 'mysql2/promise'
import { readEnv } from '../src/config/env.js'
import { createDatabase } from '../src/db/client.js'
import { BackupRepository } from '../src/repositories/backup-repository.js'
import { createOneNavImportPlan, importOneNavSource, readOneNavSource } from '../src/services/onenav-importer.js'

/** OneNav 导入命令支持的显式参数。 */
interface Arguments {
  sourcePath: string
  parentId: number
  folderName: string
  confirm: boolean
}

/** 命令行默认只输出预检报告，只有明确传入 --confirm 才连接正式库执行写入。 */
async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2))
  const source = await readOneNavSource(args.sourcePath)
  const plan = createOneNavImportPlan(source)
  process.stdout.write(`${JSON.stringify({ mode: args.confirm ? 'confirm' : 'preview', folderName: args.folderName, parentId: args.parentId, ...plan }, null, 2)}\n`)
  if (!args.confirm) {
    process.stdout.write('\n预检完成。确认报告无误后追加 --confirm 执行事务导入。\n')
    return
  }

  const { pool } = createDatabase(readEnv())
  try {
    // 先做轻量幂等检查，避免用户重复执行时生成没有用途的大体积备份。
    const [existing] = await pool.execute<RowDataPacket[]>("SELECT id FROM navigation_node WHERE JSON_UNQUOTE(JSON_EXTRACT(source_metadata, '$.importKey')) = ? LIMIT 1", [plan.importKey])
    if (existing.length > 0) throw new Error(`该 OneNav 数据库已经导入，根目录节点 ID 为 ${String(existing[0]?.id)}`)
    const backup = await new BackupRepository(pool).create('manual')
    process.stdout.write(`写入前备份已创建：${String(backup.id)}\n`)
    const result = await importOneNavSource(pool, source, args.parentId, args.folderName)
    process.stdout.write(`${JSON.stringify({ status: 'completed', backupId: backup.id, ...result }, null, 2)}\n`)
  } finally {
    await pool.end()
  }
}

/** 支持 source、目标父目录和导入目录名；未知参数直接报错以避免静默误操作。 */
function parseArguments(values: string[]): Arguments {
  const result: Arguments = {
    sourcePath: resolve(process.cwd(), 'onenav.db3'),
    parentId: 1,
    folderName: 'OneNav 导入',
    confirm: false
  }
  for (let index = 0; index < values.length; index++) {
    const value = values[index]
    if (value === '--confirm') result.confirm = true
    else if (value === '--source') result.sourcePath = resolve(process.cwd(), requireValue(values, ++index, '--source'))
    else if (value === '--parent-id') result.parentId = positiveInteger(requireValue(values, ++index, '--parent-id'), '--parent-id')
    else if (value === '--folder-name') result.folderName = requireValue(values, ++index, '--folder-name').trim()
    else throw new Error(`未知参数：${value}`)
  }
  if (!result.folderName) throw new Error('--folder-name 不能为空')
  return result
}

/** 读取带值选项的下一个参数。 */
function requireValue(values: string[], index: number, option: string): string {
  const value = values[index]
  if (!value) throw new Error(`${option} 缺少参数值`)
  return value
}

/** 校验目标目录 ID 为 JavaScript 安全范围内的正整数。 */
function positiveInteger(value: string, option: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1) throw new Error(`${option} 必须是正整数`)
  return number
}

await main()
