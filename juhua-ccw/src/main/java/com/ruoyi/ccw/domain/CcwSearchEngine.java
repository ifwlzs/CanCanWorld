package com.ruoyi.ccw.domain;

import java.util.Date;
import com.fasterxml.jackson.annotation.JsonFormat;
import org.apache.commons.lang3.builder.ToStringBuilder;
import org.apache.commons.lang3.builder.ToStringStyle;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;

/**
 * 搜索引擎对象 ccw_search_engine
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
public class CcwSearchEngine extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 搜索引擎id */
    private Long id;

    /** 搜索引擎名 */
    @Excel(name = "搜索引擎名")
    private String name;

    /** 搜索url。用%s代替搜索字词 */
    @Excel(name = "搜索url。用%s代替搜索字词")
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
    public void setDeleted(Integer deleted) 
    {
        this.deleted = deleted;
    }

    public Integer getDeleted() 
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
    public void setSort(Long sort) 
    {
        this.sort = sort;
    }

    public Long getSort() 
    {
        return sort;
    }
    public void setStatus(Long status) 
    {
        this.status = status;
    }

    public Long getStatus() 
    {
        return status;
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
            .append("name", getName())
            .append("url", getUrl())
            .append("icon", getIcon())
            .append("deleted", getDeleted())
            .append("creator", getCreator())
            .append("createTime", getCreateTime())
            .append("updater", getUpdater())
            .append("updateTime", getUpdateTime())
            .append("remark", getRemark())
            .append("sort", getSort())
            .append("status", getStatus())
            .append("detectionTime", getDetectionTime())
            .append("createDate", getCreateDate())
            .append("updateDate", getUpdateDate())
            .append("detectionDate", getDetectionDate())
            .toString();
    }
}
