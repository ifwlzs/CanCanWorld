package com.ruoyi.ccw.domain;

import org.apache.commons.lang3.builder.ToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;

/**
 * 书签标签对象 ccw_tag
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
public class CcwTag extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 标签id */
    private Long id;

    /** 标签名 */
    @Excel(name = "标签名")
    private String name;

    /** 分类级别：0-&gt;1级；1-&gt;2级 */
    @Excel(name = "分类级别：0-&gt;1级；1-&gt;2级")
    private String level;

    /** 上级分类的编号：0表示一级分类 */
    @Excel(name = "上级分类的编号：0表示一级分类")
    private Long parentId;

    /** 关键词 */
    @Excel(name = "关键词")
    private String keywords;

    /** 图标 */
    @Excel(name = "图标")
    private String icon;

    /** 排序因子 */
    @Excel(name = "排序因子")
    private Long sort;

    /** 描述 */
    @Excel(name = "描述")
    private String description;

    /** 删除状态 */
    @Excel(name = "删除状态")
    private Long deleted;

    /** 创建者id */
    @Excel(name = "创建者id")
    private Long creator;

    /** 更新者id */
    @Excel(name = "更新者id")
    private Long updater;

    public void setId(Long id) 
    {
        this.id = id;
    }

    public Long getId() 
    {
        return id;
    }
    public void setName(String name) 
    {
        this.name = name;
    }

    public String getName() 
    {
        return name;
    }
    public void setLevel(String level) 
    {
        this.level = level;
    }

    public String getLevel() 
    {
        return level;
    }
    public void setParentId(Long parentId) 
    {
        this.parentId = parentId;
    }

    public Long getParentId() 
    {
        return parentId;
    }
    public void setKeywords(String keywords) 
    {
        this.keywords = keywords;
    }

    public String getKeywords() 
    {
        return keywords;
    }
    public void setIcon(String icon) 
    {
        this.icon = icon;
    }

    public String getIcon() 
    {
        return icon;
    }
    public void setSort(Long sort) 
    {
        this.sort = sort;
    }

    public Long getSort() 
    {
        return sort;
    }
    public void setDescription(String description) 
    {
        this.description = description;
    }

    public String getDescription() 
    {
        return description;
    }
    public void setDeleted(Long deleted) 
    {
        this.deleted = deleted;
    }

    public Long getDeleted() 
    {
        return deleted;
    }
    public void setCreator(Long creator) 
    {
        this.creator = creator;
    }

    public Long getCreator() 
    {
        return creator;
    }
    public void setUpdater(Long updater) 
    {
        this.updater = updater;
    }

    public Long getUpdater() 
    {
        return updater;
    }

    @Override
    public String toString() {
        return new ToStringBuilder(this,ToStringStyle.MULTI_LINE_STYLE)
            .append("id", getId())
            .append("name", getName())
            .append("level", getLevel())
            .append("parentId", getParentId())
            .append("keywords", getKeywords())
            .append("icon", getIcon())
            .append("sort", getSort())
            .append("description", getDescription())
            .append("deleted", getDeleted())
            .append("creator", getCreator())
            .append("createTime", getCreateTime())
            .append("updater", getUpdater())
            .append("updateTime", getUpdateTime())
            .append("remark", getRemark())
            .toString();
    }
}
