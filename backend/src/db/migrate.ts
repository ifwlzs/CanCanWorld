import { readdir, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import mysql from 'mysql2/promise'
import { readEnv } from '../config/env.js'

/** 顺序执行尚未登记的 SQL 迁移；每个文件执行成功后才写入版本记录。 */
async function migrate(): Promise<void> {
  const env = readEnv()
  const connection = await mysql.createConnection({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    charset: 'utf8mb4',
    timezone: 'Z',
    multipleStatements: true
  })
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migration (
        version VARCHAR(255) NOT NULL PRIMARY KEY COMMENT '迁移文件名，确保同一迁移只执行一次',
        applied_at DATETIME(3) NOT NULL COMMENT '迁移成功执行的 UTC 时间'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='数据库迁移执行记录'
    `)
    const migrationDir = resolve(import.meta.dirname, '../../migrations')
    const files = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) {
      const [rows] = await connection.query<mysql.RowDataPacket[]>('SELECT version FROM schema_migration WHERE version = ?', [file])
      if (rows.length > 0) continue
      const sql = await readFile(resolve(migrationDir, file), 'utf8')
      await connection.query(sql)
      await connection.query('INSERT INTO schema_migration (version, applied_at) VALUES (?, UTC_TIMESTAMP(3))', [basename(file)])
      process.stdout.write(`已执行迁移：${file}\n`)
    }
  } finally {
    await connection.end()
  }
}

await migrate()
