package com.ruoyi.ccw.vo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.fasterxml.jackson.annotation.JsonFormat;
import com.ruoyi.common.annotation.Excel;
import com.ruoyi.common.core.domain.BaseEntity;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Date;

/**
 * @ClassName CcwTagListVo
 * @Description TODO
 * @Author Dylan
 * @Date 2023/6/3 17:06
 * @Version 1.0
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CcwTagListVo extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    /** 标签id */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    /** 标签名 */
    @Excel(name = "标签名")
    private String name;

    /** 分类级别 */
    @Excel(name = "分类级别")
    private Long level;

    /** 父级分类 */
    @Excel(name = "父级分类")
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

    /** 更新日 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "更新日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date createDate;

    /** 更新日 */
    @JsonFormat(pattern = "yyyy-MM-dd")
    @Excel(name = "更新日", width = 30, dateFormat = "yyyy-MM-dd")
    private Date updateDate;

}
