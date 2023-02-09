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
import com.ruoyi.ccw.domain.CcwBookmarks;
import com.ruoyi.ccw.service.ICcwBookmarksService;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.utils.poi.ExcelUtil;
import com.ruoyi.common.core.page.TableDataInfo;

/**
 * 书签Controller
 * 
 * @author ifwlzs
 * @date 2023-02-09
 */
@Controller
@RequestMapping("/ccw/bookmarks")
public class CcwBookmarksController extends BaseController
{
    private String prefix = "ccw/bookmarks";

    @Autowired
    private ICcwBookmarksService ccwBookmarksService;

    @RequiresPermissions("ccw:bookmarks:view")
    @GetMapping()
    public String bookmarks()
    {
        return prefix + "/bookmarks";
    }

    /**
     * 查询书签列表
     */
    @RequiresPermissions("ccw:bookmarks:list")
    @PostMapping("/list")
    @ResponseBody
    public TableDataInfo list(CcwBookmarks ccwBookmarks)
    {
        startPage();
        List<CcwBookmarks> list = ccwBookmarksService.selectCcwBookmarksList(ccwBookmarks);
        return getDataTable(list);
    }

    /**
     * 导出书签列表
     */
    @RequiresPermissions("ccw:bookmarks:export")
    @Log(title = "书签", businessType = BusinessType.EXPORT)
    @PostMapping("/export")
    @ResponseBody
    public AjaxResult export(CcwBookmarks ccwBookmarks)
    {
        List<CcwBookmarks> list = ccwBookmarksService.selectCcwBookmarksList(ccwBookmarks);
        ExcelUtil<CcwBookmarks> util = new ExcelUtil<CcwBookmarks>(CcwBookmarks.class);
        return util.exportExcel(list, "书签数据");
    }

    /**
     * 新增书签
     */
    @GetMapping("/add")
    public String add()
    {
        return prefix + "/add";
    }

    /**
     * 新增保存书签
     */
    @RequiresPermissions("ccw:bookmarks:add")
    @Log(title = "书签", businessType = BusinessType.INSERT)
    @PostMapping("/add")
    @ResponseBody
    public AjaxResult addSave(CcwBookmarks ccwBookmarks)
    {
        return toAjax(ccwBookmarksService.insertCcwBookmarks(ccwBookmarks));
    }

    /**
     * 修改书签
     */
    @RequiresPermissions("ccw:bookmarks:edit")
    @GetMapping("/edit/{id}")
    public String edit(@PathVariable("id") Long id, ModelMap mmap)
    {
        CcwBookmarks ccwBookmarks = ccwBookmarksService.selectCcwBookmarksById(id);
        mmap.put("ccwBookmarks", ccwBookmarks);
        return prefix + "/edit";
    }

    /**
     * 修改保存书签
     */
    @RequiresPermissions("ccw:bookmarks:edit")
    @Log(title = "书签", businessType = BusinessType.UPDATE)
    @PostMapping("/edit")
    @ResponseBody
    public AjaxResult editSave(CcwBookmarks ccwBookmarks)
    {
        return toAjax(ccwBookmarksService.updateCcwBookmarks(ccwBookmarks));
    }

    /**
     * 删除书签
     */
    @RequiresPermissions("ccw:bookmarks:remove")
    @Log(title = "书签", businessType = BusinessType.DELETE)
    @PostMapping( "/remove")
    @ResponseBody
    public AjaxResult remove(String ids)
    {
        return toAjax(ccwBookmarksService.deleteCcwBookmarksByIds(ids));
    }
}
