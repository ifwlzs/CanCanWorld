import {
  bigint,
  boolean,
  customType,
  datetime,
  index,
  int,
  json,
  longtext,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  uniqueIndex,
  varchar
} from 'drizzle-orm/mysql-core'

/** favicon 使用 MEDIUMBLOB 容纳受 256 KiB 业务上限约束的二进制内容。 */
const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'mediumblob'
})

/** 管理员表第一版只允许一条有效记录，后续可平滑扩展用户空间。 */
export const appUsers = mysqlTable('app_user', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  username: varchar('username', { length: 128 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull()
}, (table) => [uniqueIndex('uk_app_user_username').on(table.username)])

/** 会话只保存令牌哈希，数据库泄露时不暴露仍可直接使用的 Cookie。 */
export const appSessions = mysqlTable('app_session', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull(),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  csrfHash: varchar('csrf_hash', { length: 64 }).notNull(),
  expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull()
}, (table) => [uniqueIndex('uk_app_session_token_hash').on(table.tokenHash), index('idx_app_session_expires_at').on(table.expiresAt)])

/** 统一节点表保存目录和书签；separator 枚举仅兼容旧迁移，业务层不再创建。 */
export const navigationNodes = mysqlTable('navigation_node', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  parentId: bigint('parent_id', { mode: 'number', unsigned: true }),
  nodeType: mysqlEnum('node_type', ['root', 'folder', 'bookmark', 'separator']).notNull(),
  title: varchar('title', { length: 512 }).notNull(),
  url: longtext('url'),
  urlHash: varchar('url_hash', { length: 64 }),
  description: text('description'),
  remark: text('remark'),
  iconUrl: varchar('icon_url', { length: 4096 }),
  sortKey: bigint('sort_key', { mode: 'bigint', unsigned: true }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  visibility: mysqlEnum('visibility', ['public', 'private']).notNull().default('public'),
  sourceMetadata: json('source_metadata').$type<Record<string, unknown> | null>(),
  lastCheckedAt: datetime('last_checked_at', { mode: 'date', fsp: 3 }),
  lastCheckStatus: varchar('last_check_status', { length: 32 }),
  lastHttpStatus: int('last_http_status', { unsigned: true }),
  lastResponseTime: int('last_response_time', { unsigned: true }),
  clickCount: bigint('click_count', { mode: 'number', unsigned: true }).notNull().default(0),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull()
}, (table) => [
  index('idx_navigation_node_parent_sort').on(table.parentId, table.sortKey, table.id),
  index('idx_navigation_node_type_enabled').on(table.nodeType, table.enabled),
  index('idx_navigation_node_url_hash').on(table.urlHash),
  index('idx_navigation_node_title').on(table.title),
  index('idx_navigation_node_click_count').on(table.clickCount)
])

/** 标签名称按规范化值唯一，展示名称保留用户输入。 */
export const tags = mysqlTable('tag', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  normalizedName: varchar('normalized_name', { length: 64 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull()
}, (table) => [uniqueIndex('uk_tag_normalized_name').on(table.normalizedName)])

/** 节点标签关联只允许业务层为书签创建。 */
export const nodeTags = mysqlTable('node_tag', {
  nodeId: bigint('node_id', { mode: 'number', unsigned: true }).notNull(),
  tagId: bigint('tag_id', { mode: 'number', unsigned: true }).notNull()
}, (table) => [primaryKey({ columns: [table.nodeId, table.tagId] }), index('idx_node_tag_tag_id').on(table.tagId)])

/** 导入任务保存预览树和报告，过期后由清理任务删除。 */
export const importJobs = mysqlTable('import_job', {
  id: varchar('id', { length: 36 }).primaryKey(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).notNull(),
  fileName: varchar('file_name', { length: 512 }).notNull(),
  payload: longtext('payload').notNull(),
  report: longtext('report').notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  expiresAt: datetime('expires_at', { mode: 'date', fsp: 3 }).notNull(),
  completedAt: datetime('completed_at', { mode: 'date', fsp: 3 })
}, (table) => [uniqueIndex('uk_import_job_idempotency_key').on(table.idempotencyKey), index('idx_import_job_expires_at').on(table.expiresAt)])

/** 检测任务通过租约字段支持进程重启后的恢复和重复消费防护。 */
export const bookmarkCheckJobs = mysqlTable('bookmark_check_job', {
  id: varchar('id', { length: 36 }).primaryKey(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).notNull(),
  total: int('total', { unsigned: true }).notNull().default(0),
  processed: int('processed', { unsigned: true }).notNull().default(0),
  succeeded: int('succeeded', { unsigned: true }).notNull().default(0),
  failed: int('failed', { unsigned: true }).notNull().default(0),
  leaseOwner: varchar('lease_owner', { length: 128 }),
  leaseExpiresAt: datetime('lease_expires_at', { mode: 'date', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  completedAt: datetime('completed_at', { mode: 'date', fsp: 3 })
}, (table) => [index('idx_bookmark_check_job_status_lease').on(table.status, table.leaseExpiresAt)])

/** 任务项目表固定任务创建时的书签集合，避免执行期间新增书签改变总数。 */
export const bookmarkCheckJobItems = mysqlTable('bookmark_check_job_item', {
  jobId: varchar('job_id', { length: 36 }).notNull(),
  bookmarkId: bigint('bookmark_id', { mode: 'number', unsigned: true }).notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).notNull()
}, (table) => [primaryKey({ columns: [table.jobId, table.bookmarkId] }), index('idx_check_job_item_status').on(table.jobId, table.status)])

/** 每次链接检测独立记录，便于计算可用率和响应时间趋势。 */
export const bookmarkCheckLogs = mysqlTable('bookmark_check_log', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  bookmarkId: bigint('bookmark_id', { mode: 'number', unsigned: true }).notNull(),
  jobId: varchar('job_id', { length: 36 }),
  status: varchar('status', { length: 32 }).notNull(),
  httpStatus: int('http_status', { unsigned: true }),
  responseTime: int('response_time', { unsigned: true }),
  errorMessage: varchar('error_message', { length: 2048 }),
  checkedAt: datetime('checked_at', { mode: 'date', fsp: 3 }).notNull()
}, (table) => [index('idx_bookmark_check_log_bookmark_checked').on(table.bookmarkId, table.checkedAt), index('idx_bookmark_check_log_job_id').on(table.jobId)])

/** favicon 二进制通过同源 API 读取，不让前端直接向第三方站点泄露访问行为。 */
export const bookmarkIcons = mysqlTable('bookmark_icon', {
  bookmarkId: bigint('bookmark_id', { mode: 'number', unsigned: true }).primaryKey(),
  mimeType: varchar('mime_type', { length: 64 }).notNull(),
  content: mediumblob('content').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  sourceUrl: varchar('source_url', { length: 4096 }).notNull(),
  fetchedAt: datetime('fetched_at', { mode: 'date', fsp: 3 }).notNull()
}, (table) => [index('idx_bookmark_icon_fetched_at').on(table.fetchedAt)])

/** favicon 批量任务通过数据库租约支持恢复和唯一消费。 */
export const faviconJobs = mysqlTable('favicon_job', {
  id: varchar('id', { length: 36 }).primaryKey(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).notNull(),
  total: int('total', { unsigned: true }).notNull().default(0),
  processed: int('processed', { unsigned: true }).notNull().default(0),
  succeeded: int('succeeded', { unsigned: true }).notNull().default(0),
  failed: int('failed', { unsigned: true }).notNull().default(0),
  leaseOwner: varchar('lease_owner', { length: 128 }),
  leaseExpiresAt: datetime('lease_expires_at', { mode: 'date', fsp: 3 }),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull(),
  completedAt: datetime('completed_at', { mode: 'date', fsp: 3 })
}, (table) => [index('idx_favicon_job_status_lease').on(table.status, table.leaseExpiresAt)])

/** favicon 项目表固定任务创建时的书签集合，不声明数据库外键。 */
export const faviconJobItems = mysqlTable('favicon_job_item', {
  jobId: varchar('job_id', { length: 36 }).notNull(),
  bookmarkId: bigint('bookmark_id', { mode: 'number', unsigned: true }).notNull(),
  status: mysqlEnum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).notNull(),
  errorMessage: varchar('error_message', { length: 2048 })
}, (table) => [primaryKey({ columns: [table.jobId, table.bookmarkId] }), index('idx_favicon_job_item_status').on(table.jobId, table.status)])

/** 可配置项只保存非密钥设置，密钥仍由部署环境注入。 */
export const appSettings = mysqlTable('app_setting', {
  settingKey: varchar('setting_key', { length: 128 }).primaryKey(),
  settingValue: longtext('setting_value').notNull(),
  updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).notNull()
})

/** 备份保存带版本的业务数据快照，不包含管理员密码、会话和部署密钥。 */
export const appBackups = mysqlTable('app_backup', {
  id: varchar('id', { length: 36 }).primaryKey(),
  backupType: mysqlEnum('backup_type', ['manual', 'before_restore']).notNull(),
  schemaVersion: int('schema_version', { unsigned: true }).notNull(),
  itemCount: int('item_count', { unsigned: true }).notNull(),
  payload: longtext('payload').notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull(),
  createdAt: datetime('created_at', { mode: 'date', fsp: 3 }).notNull()
}, (table) => [index('idx_app_backup_created_at').on(table.createdAt)])
