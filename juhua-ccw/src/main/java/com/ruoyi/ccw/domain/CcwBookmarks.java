package com.ruoyi.ccw.domain;

import java.util.Date;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
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
 * @date 2023-02-09
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@ToString
@Builder
public class CcwBookmarks
{
    private static final long serialVersionUID = 1L;

    /** 书签表id */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /** 用户id */
    @Excel(name = "用户id")
    private Long uid;

    /** 网站名 */
    @Excel(name = "网站名")
    private String name;

    /** 简介 */
    @Excel(name = "简介")
    private String info;

    /** 详细描述 */
    @Excel(name = "详细描述")
    private String description;

    /** 网址 */
    @Excel(name = "网址")
    private String url;

    /** 网站icon */
    @Excel(name = "网站icon")
    private String icon;

    /** ping状态 */
    @Excel(name = "ping状态")
    private Integer pingStatus;

    /** 网页状态码 */
    @Excel(name = "网页状态码")
    private Long statusCode;

    /** 删除状态，0->未删除，1->已删除 */
    @TableLogic(value = "0", delval = "1")
    @Excel(name = "删除状态，0->未删除，1->已删除")
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

    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date updateTime;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private Date createTime;

    private String remark;

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
    public void setInfo(String info) 
    {
        this.info = info;
    }

    public String getInfo() 
    {
        return info;
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
    public void setPingStatus(Integer pingStatus) 
    {
        this.pingStatus = pingStatus;
    }

    public Integer getPingStatus() 
    {
        return pingStatus;
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

    public Date getUpdateTime() {
        return updateTime;
    }

    public void setUpdateTime(Date updateTime) {
        this.updateTime = updateTime;
    }

    public Date getCreateTime() {
        return createTime;
    }

    public void setCreateTime(Date createTime) {
        this.createTime = createTime;
    }

    public String getRemark() {
        return remark;
    }

    public void setRemark(String remark) {
        this.remark = remark;
    }
}
