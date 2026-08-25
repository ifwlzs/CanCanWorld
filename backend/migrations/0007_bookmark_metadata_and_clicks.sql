-- 个人备注与网站注释分开保存；点击数使用无符号大整数支持长期累计。
ALTER TABLE navigation_node
  ADD COLUMN remark TEXT NULL COMMENT '管理员填写的个人备注，始终按纯文本展示' AFTER description,
  ADD COLUMN click_count BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '书签累计打开次数，由后端原子递增' AFTER last_response_time,
  ADD KEY idx_navigation_node_click_count (click_count) COMMENT '支持按点击次数排序';
