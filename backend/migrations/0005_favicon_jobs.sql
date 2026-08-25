-- 图标二进制独立保存，navigation_node 只记录稳定的同源读取地址。
CREATE TABLE IF NOT EXISTS bookmark_icon (
  bookmark_id BIGINT UNSIGNED NOT NULL COMMENT '书签节点主键，由 Repository 显式维护关联',
  mime_type VARCHAR(64) NOT NULL COMMENT '经过嗅探确认的安全图片 MIME 类型',
  content MEDIUMBLOB NOT NULL COMMENT '最大 256 KiB 的 favicon 原始二进制',
  content_hash CHAR(64) NOT NULL COMMENT '图标内容 SHA-256，用于缓存标识',
  source_url VARCHAR(4096) NOT NULL COMMENT '实际获取图标的最终 URL',
  fetched_at DATETIME(3) NOT NULL COMMENT '图标获取完成 UTC 时间',
  PRIMARY KEY (bookmark_id),
  KEY idx_bookmark_icon_fetched_at (fetched_at) COMMENT '支持按获取时间执行刷新任务'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='书签 favicon 二进制缓存';

-- favicon 批量任务使用与链接检测一致的租约模型，进程重启后可以继续执行。
CREATE TABLE IF NOT EXISTS favicon_job (
  id CHAR(36) NOT NULL COMMENT '图标任务 UUID',
  status ENUM('pending','running','completed','failed','cancelled') NOT NULL COMMENT '任务状态',
  total INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '计划获取图标的书签总数',
  processed INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '已经处理的书签数',
  succeeded INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '成功保存图标的数量',
  failed INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '获取或格式校验失败数量',
  lease_owner VARCHAR(128) NULL COMMENT '当前执行进程标识',
  lease_expires_at DATETIME(3) NULL COMMENT '执行租约过期 UTC 时间',
  created_at DATETIME(3) NOT NULL COMMENT '任务创建 UTC 时间',
  updated_at DATETIME(3) NOT NULL COMMENT '任务进度最后更新 UTC 时间',
  completed_at DATETIME(3) NULL COMMENT '任务完成 UTC 时间',
  PRIMARY KEY (id),
  KEY idx_favicon_job_status_lease (status, lease_expires_at) COMMENT '获取待执行或租约过期任务'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='favicon 批量获取任务';

-- 任务项目是创建任务时的书签快照，不使用数据库外键。
CREATE TABLE IF NOT EXISTS favicon_job_item (
  job_id CHAR(36) NOT NULL COMMENT '所属 favicon 任务 UUID',
  bookmark_id BIGINT UNSIGNED NOT NULL COMMENT '待获取图标的书签节点主键',
  status ENUM('pending','running','completed','failed','cancelled') NOT NULL COMMENT '单条图标任务状态',
  error_message VARCHAR(2048) NULL COMMENT '清理后的失败原因',
  PRIMARY KEY (job_id, bookmark_id),
  KEY idx_favicon_job_item_status (job_id, status) COMMENT '按任务获取待处理项目'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='favicon 任务书签快照';
