package com.ruoyi.ccw.vo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.ruoyi.common.annotation.Excel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * @ClassName CcwBookmarksListVo
 * @Description TODO
 * @Author Dylan
 * @Date 2023/6/11 21:57
 * @Version 1.0
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CcwBookmarksListVo {

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

    /** 标签名称*/
    private String tagNames;

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

}
