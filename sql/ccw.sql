/*
 Navicat Premium Data Transfer

 Source Server         : localhost_3306
 Source Server Type    : MySQL
 Source Server Version : 80017
 Source Host           : localhost:3306
 Source Schema         : can_can_word

 Target Server Type    : MySQL
 Target Server Version : 80017
 File Encoding         : 65001

 Date: 01/08/2022 21:55:53
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for ccw_bookmark_tag
-- ----------------------------
DROP TABLE IF EXISTS `ccw_bookmark_tag`;
CREATE TABLE `ccw_bookmark_tag`  (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键id',
  `bookmark_id` bigint(20) NULL DEFAULT NULL COMMENT '书签表主键id',
  `tag_id` bigint(20) NULL DEFAULT NULL COMMENT '标签表主键id',
  `create_time` datetime NULL DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `create_date` date NULL DEFAULT NULL COMMENT '创建日',
  `update_date` date NULL DEFAULT NULL COMMENT '更新日',
  `remark` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `i_bookmark_tag`(`bookmark_id` ASC, `tag_id` ASC) USING BTREE,
  INDEX `i_bookmark_id`(`bookmark_id` ASC) USING BTREE,
  INDEX `i_tag_id`(`tag_id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1184 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '书签-tag关联表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ccw_bookmarks
-- ----------------------------
DROP TABLE IF EXISTS `ccw_bookmarks`;
CREATE TABLE `ccw_bookmarks`  (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '书签表id',
  `uid` bigint(20) NULL DEFAULT NULL COMMENT '用户id',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '网站名',
  `info` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '简介',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '详细描述',
  `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '网址',
  `icon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '网站icon',
  `status_code` int(11) NULL DEFAULT NULL COMMENT '网页状态码',
  `deleted` tinyint(1) UNSIGNED ZEROFILL NOT NULL DEFAULT 0 COMMENT '删除状态，0->未删除，1->已删除',
  `sort` int(11) NULL DEFAULT NULL COMMENT '排序因子',
  `creator` bigint(20) NULL DEFAULT NULL COMMENT '创建人uid',
  `create_time` datetime NULL DEFAULT NULL COMMENT '创建时间',
  `updater` bigint(20) NULL DEFAULT NULL COMMENT '更新人uid',
  `update_time` datetime NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '备注',
  `detection_time` datetime NULL DEFAULT NULL COMMENT '检测时间',
  `create_date` date NULL DEFAULT NULL COMMENT '创建日',
  `update_date` date NULL DEFAULT NULL COMMENT '更新日',
  `detection_date` date NULL DEFAULT NULL COMMENT '检测日',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `i_id`(`id` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1100 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '书签表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ccw_search_engine
-- ----------------------------
DROP TABLE IF EXISTS `ccw_search_engine`;
CREATE TABLE `ccw_search_engine`  (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '搜索引擎id',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '搜索引擎名',
  `url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '搜索url。用%s代替搜索字词',
  `icon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '图标',
  `deleted` tinyint(1) UNSIGNED ZEROFILL NOT NULL DEFAULT 0 COMMENT '删除状态，0->未删除，1->已删除',
  `creator` bigint(20) NULL DEFAULT NULL COMMENT '创建者id',
  `create_time` datetime NULL DEFAULT NULL COMMENT '创建时间',
  `updater` bigint(20) NULL DEFAULT NULL COMMENT '更新者id',
  `update_time` datetime NULL DEFAULT NULL COMMENT '更新时间',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '备注',
  `sort` int(11) NULL DEFAULT NULL COMMENT '排序因子',
  `status` int(11) NULL DEFAULT NULL COMMENT '状态码',
  `detection_time` datetime NULL DEFAULT NULL COMMENT '检测时间',
  `create_date` date NULL DEFAULT NULL COMMENT '创建日',
  `update_date` date NULL DEFAULT NULL COMMENT '更新日',
  `detection_date` date NULL DEFAULT NULL COMMENT '检测日',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 11 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '搜索引擎表' ROW_FORMAT = Dynamic;

-- ----------------------------
-- Table structure for ccw_tag
-- ----------------------------
DROP TABLE IF EXISTS `ccw_tag`;
CREATE TABLE `ccw_tag`  (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '标签id',
  `name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '标签名',
  `level` int(11) NULL DEFAULT NULL COMMENT '分类级别：0->1级；1->2级',
  `parent_id` bigint(20) NULL DEFAULT NULL COMMENT '父级分类：0表示一级分类',
  `keywords` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '关键词',
  `icon` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL COMMENT '图标',
  `sort` int(255) NULL DEFAULT NULL COMMENT '排序因子',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '描述',
  `deleted` int(11) NULL DEFAULT 0 COMMENT '删除状态',
  `creator` bigint(20) NULL DEFAULT NULL COMMENT '创建者id',
  `create_time` datetime NULL DEFAULT NULL COMMENT '创建时间',
  `updater` bigint(20) NULL DEFAULT NULL COMMENT '更新者id',
  `update_time` datetime NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `remark` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL COMMENT '备注',
  `create_date` date NULL DEFAULT NULL COMMENT '创建日',
  `update_date` date NULL DEFAULT NULL COMMENT '更新日',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 54 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci COMMENT = '书签标签表' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
