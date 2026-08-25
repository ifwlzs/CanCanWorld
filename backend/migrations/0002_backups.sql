-- 业务数据备份不保存管理员密码、会话或环境密钥，恢复前会自动再创建一份快照。
CREATE TABLE IF NOT EXISTS app_backup (
  id CHAR(36) NOT NULL COMMENT '备份 UUID',
  backup_type ENUM('manual','before_restore') NOT NULL COMMENT '手动备份或恢复前自动保护备份',
  schema_version INT UNSIGNED NOT NULL COMMENT '备份数据结构版本，用于恢复兼容性检查',
  item_count INT UNSIGNED NOT NULL COMMENT '备份中的导航节点数量，不含系统根',
  payload LONGTEXT NOT NULL COMMENT '导航节点、标签、关联和非敏感设置的 JSON 快照',
  checksum CHAR(64) NOT NULL COMMENT '快照 JSON 的 SHA-256 完整性摘要',
  created_at DATETIME(3) NOT NULL COMMENT '备份创建 UTC 时间',
  PRIMARY KEY (id),
  KEY idx_app_backup_created_at (created_at) COMMENT '按时间倒序查询和执行保留策略'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='书签业务数据备份';
