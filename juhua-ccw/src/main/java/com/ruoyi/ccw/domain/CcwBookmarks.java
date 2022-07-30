package com.ruoyi.ccw.domain;

import java.util.Date;
import com.fasterxml.jackson.annotation.JsonFormat;
import org.apache.commons.lang3.builder.ToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;

/**
 * 书签对象 ccw_bookmarks
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
public class CcwBookmarks extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 书签表id */
    private Long id;

    /** 用户id */
    @Excel(name = "用户id")
    private Long uid;

    /** 网站名 */
    @Excel(name = "网站名")
    private String name;

    /** 摘要 */
    @Excel(name = "摘要")
    private String summary;

    /** 详细描述 */
    @Excel(name = "详细描述")
    private String description;

    /** 网址 */
    @Excel(name = "网址")
    private String url;

    /** 网站icon */
    @Excel(name = "网站icon")
    private String icon;

    /** 标签id列表 */
    @Excel(name = "标签id列表")
    private String tagId;

    /** 网页状态码 */
    @Excel(name = "网页状态码")
    private Long statusCode;

    /** 删除状态 */
    @Excel(name = "删除状态")
    private Integer deleted;

    /** 排序因子 */
    @Excel(name = "排序因子")
    private Long sort;

    /** 创建人uid */
    @Excel(name = "创建人uid")
    private Long creator;

    /** 更新人uid */
    @Excel(name = "更新人uid")
    private Long updater;

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

    public void setId(Long id) 
    {
        this.id = id;
    }

    public Long getId() 
    {
        return id;
    }
    public void setUid(Long uid) 
    {
        this.uid = uid;
    }

    public Long getUid() 
    {
        return uid;
    }
    public void setName(String name) 
    {
        this.name = name;
    }

    public String getName() 
    {
        return name;
    }
    public void setSummary(String summary) 
    {
        this.summary = summary;
    }

    public String getSummary() 
    {
        return summary;
    }
    public void setDescription(String description) 
    {
        this.description = description;
    }

    public String getDescription() 
    {
        return description;
    }
    public void setUrl(String url) 
    {
        this.url = url;
    }

    public String getUrl() 
    {
        return url;
    }
    public void setIcon(String icon) 
    {
        this.icon = icon;
    }

    public String getIcon() 
    {
        return icon;
    }
    public void setTagId(String tagId) 
    {
        this.tagId = tagId;
    }

    public String getTagId() 
    {
        return tagId;
    }
    public void setStatusCode(Long statusCode) 
    {
        this.statusCode = statusCode;
    }

    public Long getStatusCode() 
    {
        return statusCode;
    }
    public void setDeleted(Integer deleted) 
    {
        this.deleted = deleted;
    }

    public Integer getDeleted() 
    {
        return deleted;
    }
    public void setSort(Long sort) 
    {
        this.sort = sort;
    }

    public Long getSort() 
    {
        return sort;
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
    public void setDetectionTime(Date detectionTime) 
    {
        this.detectionTime = detectionTime;
    }

    public Date getDetectionTime() 
    {
        return detectionTime;
    }
    public void setCreateDate(Date createDate) 
    {
        this.createDate = createDate;
    }

    public Date getCreateDate() 
    {
        return createDate;
    }
    public void setUpdateDate(Date updateDate) 
    {
        this.updateDate = updateDate;
    }

    public Date getUpdateDate() 
    {
        return updateDate;
    }
    public void setDetectionDate(Date detectionDate) 
    {
        this.detectionDate = detectionDate;
    }

    public Date getDetectionDate() 
    {
        return detectionDate;
    }

    @Override
    public String toString() {
        return new ToStringBuilder(this,ToStringStyle.MULTI_LINE_STYLE)
            .append("id", getId())
            .append("uid", getUid())
            .append("name", getName())
            .append("summary", getSummary())
            .append("description", getDescription())
            .append("url", getUrl())
            .append("icon", getIcon())
            .append("tagId", getTagId())
            .append("statusCode", getStatusCode())
            .append("deleted", getDeleted())
            .append("sort", getSort())
            .append("creator", getCreator())
            .append("createTime", getCreateTime())
            .append("updater", getUpdater())
            .append("updateTime", getUpdateTime())
            .append("remark", getRemark())
            .append("detectionTime", getDetectionTime())
            .append("createDate", getCreateDate())
            .append("updateDate", getUpdateDate())
            .append("detectionDate", getDetectionDate())
            .toString();
    }
}
