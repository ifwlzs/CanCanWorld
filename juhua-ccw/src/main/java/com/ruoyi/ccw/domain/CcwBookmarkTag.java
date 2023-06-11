package com.ruoyi.ccw.domain;

import java.util.Date;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.*;
import org.apache.commons.lang3.builder.ToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;

/**
 * 书签-tag关联对象 ccw_bookmark_tag
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Builder
public class CcwBookmarkTag
{
    private static final long serialVersionUID = 1L;

    /** 主键id */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /** 书签表主键id */
    @Excel(name = "书签表主键id")
    private Long bookmarkId;

    /** 标签表主键id */
    @Excel(name = "标签表主键id")
    private Long tagId;

    /** 创建日 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "创建日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date createDate;

    /** 更新日 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "更新日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date updateDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "更新日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date createTime;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "更新日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date updateTime;

    private String remark;

}
