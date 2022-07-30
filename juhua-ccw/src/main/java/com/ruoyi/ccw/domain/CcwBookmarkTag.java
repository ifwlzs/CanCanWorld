package com.ruoyi.ccw.domain;

import org.apache.commons.lang3.builder.ToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;

/**
 * 书签-tag关联对象 ccw_bookmark_tag
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
public class CcwBookmarkTag extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 主键id */
    private Long id;

    /** 书签表主键id */
    @Excel(name = "书签表主键id")
    private Long bookmarkId;

    /** 标签表主键id */
    @Excel(name = "标签表主键id")
    private Long tagId;

    public void setId(Long id) 
    {
        this.id = id;
    }

    public Long getId() 
    {
        return id;
    }
    public void setBookmarkId(Long bookmarkId) 
    {
        this.bookmarkId = bookmarkId;
    }

    public Long getBookmarkId() 
    {
        return bookmarkId;
    }
    public void setTagId(Long tagId) 
    {
        this.tagId = tagId;
    }

    public Long getTagId() 
    {
        return tagId;
    }

    @Override
    public String toString() {
        return new ToStringBuilder(this,ToStringStyle.MULTI_LINE_STYLE)
            .append("id", getId())
            .append("bookmarkId", getBookmarkId())
            .append("tagId", getTagId())
            .toString();
    }
}
