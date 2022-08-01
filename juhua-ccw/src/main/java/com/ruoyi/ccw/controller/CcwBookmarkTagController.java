package com.ruoyi.ccw.controller;

import java.util.List;
import org.apache.shiro.authz.annotation.RequiresPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.ModelMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import com.ruoyi.common.annotation.Log;
import com.ruoyi.common.enums.BusinessType;
import com.ruoyi.ccw.domain.CcwBookmarkTag;
import com.ruoyi.ccw.service.ICcwBookmarkTagService;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.utils.poi.ExcelUtil;
import com.ruoyi.common.core.page.TableDataInfo;

/**
 * 书签-tag关联Controller
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
@Controller
@RequestMapping("/ccw/bookmarkTag")
public class CcwBookmarkTagController extends BaseController
{
    private String prefix = "ccw/bookmarkTag";

    @Autowired
    private ICcwBookmarkTagService ccwBookmarkTagService;

    @RequiresPermissions("ccw:bookmarkTag:view")
    @GetMapping()
    public String bookmarkTag()
    {
        return prefix + "/bookmarkTag";
    }

    /**
     * 查询书签-tag关联列表
     */
    @RequiresPermissions("ccw:bookmarkTag:list")
    @PostMapping("/list")
    @ResponseBody
    public TableDataInfo list(CcwBookmarkTag ccwBookmarkTag)
    {
        startPage();
        List<CcwBookmarkTag> list = ccwBookmarkTagService.selectCcwBookmarkTagList(ccwBookmarkTag);
        return getDataTable(list);
    }

    /**
     * 导出书签-tag关联列表
     */
    @RequiresPermissions("ccw:bookmarkTag:export")
    @Log(title = "书签-tag关联", businessType = BusinessType.EXPORT)
    @PostMapping("/export")
    @ResponseBody
    public AjaxResult export(CcwBookmarkTag ccwBookmarkTag)
    {
        List<CcwBookmarkTag> list = ccwBookmarkTagService.selectCcwBookmarkTagList(ccwBookmarkTag);
        ExcelUtil<CcwBookmarkTag> util = new ExcelUtil<CcwBookmarkTag>(CcwBookmarkTag.class);
        return util.exportExcel(list, "书签-tag关联数据");
    }

    /**
     * 新增书签-tag关联
     */
    @GetMapping("/add")
    public String add()
    {
        return prefix + "/add";
    }

    /**
     * 新增保存书签-tag关联
     */
    @RequiresPermissions("ccw:bookmarkTag:add")
    @Log(title = "书签-tag关联", businessType = BusinessType.INSERT)
    @PostMapping("/add")
    @ResponseBody
    public AjaxResult addSave(CcwBookmarkTag ccwBookmarkTag)
    {
        return toAjax(ccwBookmarkTagService.insertCcwBookmarkTag(ccwBookmarkTag));
    }

    /**
     * 修改书签-tag关联
     */
    @RequiresPermissions("ccw:bookmarkTag:edit")
    @GetMapping("/edit/{id}")
    public String edit(@PathVariable("id") Long id, ModelMap mmap)
    {
        CcwBookmarkTag ccwBookmarkTag = ccwBookmarkTagService.selectCcwBookmarkTagById(id);
        mmap.put("ccwBookmarkTag", ccwBookmarkTag);
        return prefix + "/edit";
    }

    /**
     * 修改保存书签-tag关联
     */
    @RequiresPermissions("ccw:bookmarkTag:edit")
    @Log(title = "书签-tag关联", businessType = BusinessType.UPDATE)
    @PostMapping("/edit")
    @ResponseBody
    public AjaxResult editSave(CcwBookmarkTag ccwBookmarkTag)
    {
        return toAjax(ccwBookmarkTagService.updateCcwBookmarkTag(ccwBookmarkTag));
    }

    /**
     * 删除书签-tag关联
     */
    @RequiresPermissions("ccw:bookmarkTag:remove")
    @Log(title = "书签-tag关联", businessType = BusinessType.DELETE)
    @PostMapping( "/remove")
    @ResponseBody
    public AjaxResult remove(String ids)
    {
        return toAjax(ccwBookmarkTagService.deleteCcwBookmarkTagByIds(ids));
    }
}
