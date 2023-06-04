package com.ruoyi.ccw.bo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.ruoyi.common.annotation.Excel;
import io.swagger.annotations.ApiModelProperty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * @ClassName CcwBookmardksAddBo
 * @Description TODO
 * @Author Dylan
 * @Date 2023/6/4 16:02
 * @Version 1.0
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CcwBookmardksAddBo {

    private static final long serialVersionUID = 1L;

    /** 书签表id */
    @TableId(value = "id", type = IdType.AUTO)
    @ApiModelProperty("主键id")
    private Long id;

    /** 用户id */
    @ApiModelProperty("用户id")
    private Long uid;

    /** 网站名 */
    @ApiModelProperty("网站名")
    private String name;

    /** 简介 */
    @ApiModelProperty("简介")
    private String info;

    /** 详细描述 */
    @ApiModelProperty("详细描述")
    private String description;

    /** 网址 */
    @ApiModelProperty("网址")
    private String url;

    /** 网站icon */
    @ApiModelProperty("网站icon")
    private String icon;

    /** ping状态 */
    @ApiModelProperty("ping状态")
    private Integer pingStatus;

    /** 网页状态码 */
    @ApiModelProperty("网页状态码")
    private Long statusCode;

    @ApiModelProperty("标签id")
    private String tagIds;

    /** 排序因子 */
    @ApiModelProperty("排序因子")
    private Long sort;

}
