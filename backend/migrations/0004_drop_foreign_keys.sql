-- 关联完整性统一由 Repository 事务维护；升级已有数据库时只删除实际存在的旧外键。
SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_app_session_user'),
  'ALTER TABLE app_session DROP FOREIGN KEY fk_app_session_user',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_navigation_node_parent'),
  'ALTER TABLE navigation_node DROP FOREIGN KEY fk_navigation_node_parent',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_node_tag_node'),
  'ALTER TABLE node_tag DROP FOREIGN KEY fk_node_tag_node',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_node_tag_tag'),
  'ALTER TABLE node_tag DROP FOREIGN KEY fk_node_tag_tag',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_check_job_item_job'),
  'ALTER TABLE bookmark_check_job_item DROP FOREIGN KEY fk_check_job_item_job',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_check_job_item_bookmark'),
  'ALTER TABLE bookmark_check_job_item DROP FOREIGN KEY fk_check_job_item_bookmark',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_bookmark_check_log_bookmark'),
  'ALTER TABLE bookmark_check_log DROP FOREIGN KEY fk_bookmark_check_log_bookmark',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_bookmark_check_log_job'),
  'ALTER TABLE bookmark_check_log DROP FOREIGN KEY fk_bookmark_check_log_job',
  'SELECT 1'
);
PREPARE drop_fk_statement FROM @drop_fk_sql;
EXECUTE drop_fk_statement;
DEALLOCATE PREPARE drop_fk_statement;

SET @drop_fk_sql = NULL;
