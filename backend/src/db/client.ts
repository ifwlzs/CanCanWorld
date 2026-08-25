import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2/promise'
import type { AppEnv } from '../config/env.js'
import * as schema from './schema.js'

/** 创建 MySQL 连接池；连接统一使用 utf8mb4 和 UTC，避免导入字符及时间偏移损坏。 */
export function createDatabase(env: AppEnv) {
  const pool = mysql.createPool({
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    user: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    connectionLimit: env.DATABASE_POOL_SIZE,
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    enableKeepAlive: true
  })
  return { pool, db: drizzle(pool, { schema, mode: 'default' }) }
}

export type AppDatabase = ReturnType<typeof createDatabase>['db']
