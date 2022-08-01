package com.ruoyi.ccw.domain;

import java.util.Date;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.*;
import org.apache.commons.lang3.builder.ToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;

/**
 * 搜索引擎对象 ccw_search_engine
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Builder
public class CcwSearchEngine extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 搜索引擎id */
    private Long id;

    /** 搜索引擎名 */
    @Excel(name = "搜索引擎名")
    private String name;

    /** 搜索url */
    @Excel(name = "搜索url")
    private String url;

    /** 图标 */
    @Excel(name = "图标")
    private String icon;

    /** 删除状态 */
    @Excel(name = "删除状态")
    private Integer deleted;

    /** 创建者id */
    @Excel(name = "创建者id")
    private Long creator;

    /** 更新者id */
    @Excel(name = "更新者id")
    private Long updater;

    /** 排序因子 */
    @Excel(name = "排序因子")
    private Long sort;

    /** 状态码 */
    @Excel(name = "状态码")
    private Long status;

    /** 检测时间 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "检测时间", width = 30, dateFormat = "yyyy-MM-dd")
    private Date detectionTime;

    /** 创建日 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "创建日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date createDate;

    /** 更新日 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "更新日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date updateDate;

    /** 检测日 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "检测日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date detectionDate;

}
