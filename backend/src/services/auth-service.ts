import { hash, verify } from '@node-rs/argon2'
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise'
import { AppError } from '../errors.js'
import type { AppEnv } from '../config/env.js'
import { randomToken, tokenHash } from '../utils/crypto.js'

interface UserRow extends RowDataPacket {
  id: number
  username: string
  password_hash: string
}

/** 认证服务封装初始化、登录、会话创建和撤销，Route 不接触密码哈希。 */
export class AuthService {
  constructor(private readonly pool: Pool, private readonly env: AppEnv) {}

  async isInitialized(): Promise<boolean> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT id FROM app_user LIMIT 1')
    return rows.length > 0
  }

  /** 首次初始化在事务中锁定用户表读取，避免并发创建两个管理员。 */
  async initialize(username: string, password: string): Promise<{ sessionToken: string; csrfToken: string; expiresAt: Date }> {
    validateCredentials(username, password)
    const connection = await this.pool.getConnection()
    try {
      await connection.beginTransaction()
      const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM app_user LIMIT 1 FOR UPDATE')
      if (existing.length > 0) throw new AppError(409, 40901, '系统已经完成初始化')
      const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 })
      const now = new Date()
      const [result] = await connection.execute('INSERT INTO app_user (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)', [username.trim(), passwordHash, now, now])
      const userId = Number((result as { insertId: number }).insertId)
      const session = await this.createSession(connection, userId)
      await connection.commit()
      return session
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }

  /** 登录失败统一返回相同错误，避免枚举用户名。 */
  async login(username: string, password: string): Promise<{ sessionToken: string; csrfToken: string; expiresAt: Date }> {
    const [rows] = await this.pool.execute<UserRow[]>('SELECT id, username, password_hash FROM app_user WHERE username = ? LIMIT 1', [username.trim()])
    const user = rows[0]
    if (!user || !(await verify(user.password_hash, password))) throw new AppError(401, 40101, '账号或密码错误')
    const connection = await this.pool.getConnection()
    try {
      return await this.createSession(connection, user.id)
    } finally {
      connection.release()
    }
  }

  /** 注销只删除当前会话，不影响其他设备。 */
  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return
    await this.pool.execute('DELETE FROM app_session WHERE token_hash = ?', [tokenHash(rawToken)])
  }

  private async createSession(connection: PoolConnection, userId: number) {
    const sessionToken = randomToken()
    const csrfToken = randomToken()
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_SECONDS * 1000)
    await connection.execute(
      'INSERT INTO app_session (user_id, token_hash, csrf_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, tokenHash(sessionToken), tokenHash(csrfToken), expiresAt, new Date()]
    )
    return { sessionToken, csrfToken, expiresAt }
  }
}

/** 第一版管理员密码至少 6 位，并限制异常超长输入带来的哈希资源消耗。 */
export function validateCredentials(username: string, password: string): void {
  if (username.trim().length < 3 || username.trim().length > 128) throw new AppError(422, 42202, '管理员账号长度必须为 3 到 128 个字符')
  if (password.length < 6 || password.length > 1024) throw new AppError(422, 42203, '管理员密码长度必须为 6 到 1024 个字符')
}
