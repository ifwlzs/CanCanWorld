-- 产品不再展示或创建视觉分割线；历史分割线没有子节点，可直接删除且不影响目录和书签。
DELETE FROM navigation_node WHERE node_type = 'separator';
