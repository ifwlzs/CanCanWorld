-- 补偿已经登记旧版 0004 但仍残留约束的数据库；每项均按实际存在状态幂等处理。
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
