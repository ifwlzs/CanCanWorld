-- 管理员账号。第一版由初始化接口创建唯一管理员，业务层限制记录数量。
CREATE TABLE IF NOT EXISTS app_user (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '管理员主键',
  username VARCHAR(128) NOT NULL COMMENT '管理员登录名，比较时区分大小写策略由业务层统一处理',
  password_hash VARCHAR(255) NOT NULL COMMENT 'Argon2id 密码哈希，永不保存明文密码',
  created_at DATETIME(3) NOT NULL COMMENT '创建 UTC 时间',
  updated_at DATETIME(3) NOT NULL COMMENT '最后更新 UTC 时间，用于审计和并发控制',
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_user_username (username) COMMENT '防止重复管理员登录名'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='系统管理员账号';

-- 服务端会话。浏览器只持有原始随机令牌，数据库保存不可逆摘要。
CREATE TABLE IF NOT EXISTS app_session (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话主键',
  user_id BIGINT UNSIGNED NOT NULL COMMENT '所属管理员主键',
  token_hash CHAR(64) NOT NULL COMMENT '会话随机令牌的 SHA-256 摘要',
  csrf_hash CHAR(64) NOT NULL COMMENT 'CSRF 随机令牌的 SHA-256 摘要',
  expires_at DATETIME(3) NOT NULL COMMENT '会话过期 UTC 时间',
  created_at DATETIME(3) NOT NULL COMMENT '会话创建 UTC 时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_session_token_hash (token_hash) COMMENT '通过令牌摘要唯一定位会话',
  KEY idx_app_session_expires_at (expires_at) COMMENT '支持批量清理过期会话'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='管理员服务端会话';

-- 统一导航节点。三类业务节点共享父子关系和排序，保证导入原始顺序可还原。
CREATE TABLE IF NOT EXISTS navigation_node (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '导航节点主键，系统根固定为 1',
  parent_id BIGINT UNSIGNED NULL COMMENT '父节点主键，仅系统根为空',
  node_type ENUM('root','folder','bookmark','separator') NOT NULL COMMENT '节点类型：系统根、目录、书签或视觉分割线',
  title VARCHAR(512) NOT NULL COMMENT '展示标题；分割线允许为空字符串',
  url LONGTEXT NULL COMMENT '普通 URL 或 JavaScript 书签原文，目录和分割线为空',
  url_hash CHAR(64) NULL COMMENT '规范化 URL 的 SHA-256 摘要，用于查询和重复提示',
  description TEXT NULL COMMENT '书签描述，始终按纯文本渲染',
  icon_url VARCHAR(4096) NULL COMMENT '用户指定或安全获取的图标 URL',
  sort_key BIGINT UNSIGNED NOT NULL COMMENT '同级排序键，按间隔分配并在必要时局部重排',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '书签或节点是否启用',
  visibility ENUM('public','private') NOT NULL DEFAULT 'public' COMMENT '公开读取或仅管理员可见',
  source_metadata JSON NULL COMMENT '导入源属性、源路径和原始分组标记等可追踪信息',
  last_checked_at DATETIME(3) NULL COMMENT '最近一次链接检测 UTC 时间',
  last_check_status VARCHAR(32) NULL COMMENT '最近一次标准化链接状态',
  last_http_status INT UNSIGNED NULL COMMENT '最近一次 HTTP 状态码，无响应时为空',
  last_response_time INT UNSIGNED NULL COMMENT '最近一次响应耗时，单位毫秒',
  created_at DATETIME(3) NOT NULL COMMENT '创建 UTC 时间',
  updated_at DATETIME(3) NOT NULL COMMENT '最后更新 UTC 时间，同时用于乐观锁',
  PRIMARY KEY (id),
  KEY idx_navigation_node_parent_sort (parent_id, sort_key, id) COMMENT '按父节点稳定读取混合子节点',
  KEY idx_navigation_node_type_enabled (node_type, enabled) COMMENT '筛选可检测或可展示节点',
  KEY idx_navigation_node_url_hash (url_hash) COMMENT 'URL 重复检查和精确查询',
  KEY idx_navigation_node_title (title) COMMENT '标题前缀和关键词查询辅助索引',
  CONSTRAINT ck_navigation_node_shape CHECK (
    (node_type = 'root' AND parent_id IS NULL AND url IS NULL)
    OR (node_type = 'folder' AND parent_id IS NOT NULL AND url IS NULL)
    OR (node_type = 'separator' AND parent_id IS NOT NULL AND url IS NULL)
    OR (node_type = 'bookmark' AND parent_id IS NOT NULL AND url IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='统一目录、书签和分割线节点树';

-- 系统根作为所有顶层节点的真实父节点，避免 NULL 父键破坏根级排序约束。
INSERT INTO navigation_node (
  id, parent_id, node_type, title, url, url_hash, description, icon_url,
  sort_key, enabled, visibility, source_metadata, created_at, updated_at
) VALUES (
  1, NULL, 'root', 'ROOT', NULL, NULL, NULL, NULL,
  1024, 1, 'private', JSON_OBJECT('system', TRUE), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
) ON DUPLICATE KEY UPDATE id = id;

-- 标签表以规范化名称唯一，显示名称保留首次创建时的用户输入。
CREATE TABLE IF NOT EXISTS tag (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '标签主键',
  name VARCHAR(64) NOT NULL COMMENT '标签展示名称',
  normalized_name VARCHAR(64) NOT NULL COMMENT '去除首尾空白并转小写后的唯一名称',
  created_at DATETIME(3) NOT NULL COMMENT '创建 UTC 时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tag_normalized_name (normalized_name) COMMENT '避免大小写或空白差异造成重复标签'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='书签标签';

-- 书签和标签为多对多关系，业务层禁止目录与分割线关联标签。
CREATE TABLE IF NOT EXISTS node_tag (
  node_id BIGINT UNSIGNED NOT NULL COMMENT '书签节点主键',
  tag_id BIGINT UNSIGNED NOT NULL COMMENT '标签主键',
  PRIMARY KEY (node_id, tag_id),
  KEY idx_node_tag_tag_id (tag_id) COMMENT '按标签反查书签'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='书签标签关联';

-- 导入任务保存解析后的预览树；确认成功或过期后可由清理任务移除大字段。
CREATE TABLE IF NOT EXISTS import_job (
  id CHAR(36) NOT NULL COMMENT '导入任务 UUID',
  status ENUM('pending','running','completed','failed','cancelled') NOT NULL COMMENT '导入任务状态',
  file_name VARCHAR(512) NOT NULL COMMENT '上传时经过清理的原始文件名',
  payload LONGTEXT NOT NULL COMMENT '解析和规范化后的预览树 JSON',
  report LONGTEXT NOT NULL COMMENT '统计、警告和错误报告 JSON',
  idempotency_key VARCHAR(128) NULL COMMENT '确认请求幂等键，阻止重复落库',
  created_at DATETIME(3) NOT NULL COMMENT '任务创建 UTC 时间',
  expires_at DATETIME(3) NOT NULL COMMENT '预览数据过期 UTC 时间',
  completed_at DATETIME(3) NULL COMMENT '确认完成 UTC 时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_import_job_idempotency_key (idempotency_key) COMMENT '同一确认操作只允许成功一次',
  KEY idx_import_job_expires_at (expires_at) COMMENT '支持清理过期预览任务'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='HTML 书签导入预览和确认任务';

-- 批量检测任务通过数据库租约协调定时任务和手动任务。
CREATE TABLE IF NOT EXISTS bookmark_check_job (
  id CHAR(36) NOT NULL COMMENT '检测任务 UUID',
  status ENUM('pending','running','completed','failed','cancelled') NOT NULL COMMENT '检测任务状态',
  total INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '计划检测书签总数',
  processed INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已经处理书签数',
  succeeded INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '得到有效 HTTP 响应的数量',
  failed INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '网络或策略失败数量',
  lease_owner VARCHAR(128) NULL COMMENT '当前任务执行进程标识',
  lease_expires_at DATETIME(3) NULL COMMENT '执行租约过期 UTC 时间',
  created_at DATETIME(3) NOT NULL COMMENT '任务创建 UTC 时间',
  updated_at DATETIME(3) NOT NULL COMMENT '任务进度最后更新 UTC 时间',
  completed_at DATETIME(3) NULL COMMENT '任务完成 UTC 时间',
  PRIMARY KEY (id),
  KEY idx_bookmark_check_job_status_lease (status, lease_expires_at) COMMENT '获取待执行或租约过期任务'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='链接批量检测任务';

-- 任务项目固定创建任务时的书签集合，并支持逐条恢复进度。
CREATE TABLE IF NOT EXISTS bookmark_check_job_item (
  job_id CHAR(36) NOT NULL COMMENT '所属检测任务 UUID',
  bookmark_id BIGINT UNSIGNED NOT NULL COMMENT '待检测书签节点主键',
  status ENUM('pending','running','completed','failed','cancelled') NOT NULL COMMENT '单条书签检测状态',
  PRIMARY KEY (job_id, bookmark_id),
  KEY idx_check_job_item_status (job_id, status) COMMENT '按任务获取待处理项目'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='链接检测任务书签快照';

-- 检测历史按书签和时间建立联合索引，支持趋势和可用率统计。
CREATE TABLE IF NOT EXISTS bookmark_check_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '检测历史主键',
  bookmark_id BIGINT UNSIGNED NOT NULL COMMENT '被检测书签节点主键',
  job_id CHAR(36) NULL COMMENT '所属批量检测任务，单条检测时也可关联独立任务',
  status VARCHAR(32) NOT NULL COMMENT '标准化状态，例如 UP、TIMEOUT 或 DNS_ERROR',
  http_status INT UNSIGNED NULL COMMENT 'HTTP 状态码，无响应时为空',
  response_time INT UNSIGNED NULL COMMENT '完整检测耗时，单位毫秒',
  error_message VARCHAR(2048) NULL COMMENT '经过清理的错误原因，不包含凭据',
  checked_at DATETIME(3) NOT NULL COMMENT '检测完成 UTC 时间',
  PRIMARY KEY (id),
  KEY idx_bookmark_check_log_bookmark_checked (bookmark_id, checked_at) COMMENT '查询单个书签历史和统计',
  KEY idx_bookmark_check_log_job_id (job_id) COMMENT '查询批量任务明细'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='书签链接检测历史';

-- 设置表只保存主题和非密钥运行参数，密钥继续从部署环境读取。
CREATE TABLE IF NOT EXISTS app_setting (
  setting_key VARCHAR(128) NOT NULL COMMENT '设置项稳定键名',
  setting_value LONGTEXT NOT NULL COMMENT '设置项 JSON 值',
  updated_at DATETIME(3) NOT NULL COMMENT '最后更新 UTC 时间',
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='非敏感应用设置';
