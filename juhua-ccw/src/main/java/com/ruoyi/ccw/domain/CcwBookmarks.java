package com.ruoyi.ccw.domain;

import java.util.Date;

import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.*;
import org.apache.commons.lang3.builder.ToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;

/**
 * 书签对象 ccw_bookmarks
 *
 * @author ifwlzs
 * @date 2022-07-31
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Builder
public class CcwBookmarks extends BaseEntity {
    private static final long serialVersionUID = 1L;

    /**
     * 书签表id
     */
    private Long id;

    /**
     * 用户id
     */
    @Excel(name = "用户id")
    private Long uid;

    /**
     * 网站名
     */
    @Excel(name = "网站名")
    private String name;

    /**
     * 简介
     */
    @Excel(name = "简介")
    private String info;

    /**
     * 详细描述
     */
    @Excel(name = "详细描述")
    private String description;

    /**
     * 网址
     */
    @Excel(name = "网址")
    private String url;

    /**
     * 网站icon
     */
    @Excel(name = "网站icon")
    private String icon;

    /**
     * 网页状态码
     */
    @Excel(name = "网页状态码")
    private Long statusCode;

    /**
     * 删除状态
     */
    @Excel(name = "删除状态")
    private Integer deleted;

    /**
     * 排序因子
     */
    @Excel(name = "排序因子")
    private Long sort;

    /**
     * 创建人uid
     */
    @Excel(name = "创建人uid")
    private Long creator;

    /**
     * 更新人uid
     */
    @Excel(name = "更新人uid")
    private Long updater;

    /**
     * 检测时间
     */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "检测时间", width = 30, dateFormat = "yyyy-MM-dd")
    private Date detectionTime;

    /**
     * 创建日
     */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "创建日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date createDate;

    /**
     * 更新日
     */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "更新日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date updateDate;

    /**
     * 检测日
     */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "检测日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date detectionDate;

}
