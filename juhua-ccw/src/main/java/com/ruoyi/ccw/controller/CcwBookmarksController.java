package com.ruoyi.ccw.controller;

import java.util.List;

import com.ruoyi.ccw.bo.CcwBookmardksAddBo;
import com.ruoyi.ccw.bo.CcwBookmarksSearchBo;
import com.ruoyi.ccw.domain.CcwTag;
import com.ruoyi.ccw.service.ICcwTagService;
import com.ruoyi.ccw.vo.CcwBookmarksListVo;
import com.ruoyi.ccw.vo.CcwTagTreeVo;
import io.swagger.annotations.ApiOperation;
import org.apache.shiro.authz.annotation.RequiresPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.ModelMap;
import org.springframework.web.bind.annotation.*;
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
    @Autowired
    private ICcwTagService ccwTagService;

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
     * 查询书签列表
     */
    @RequiresPermissions("ccw:bookmarks:list")
    @PostMapping("/page")
    @ResponseBody
    public TableDataInfo page(CcwBookmarksSearchBo ccwBookmarks)
    {
        startPage();
        List<CcwBookmarksListVo> list = ccwBookmarksService.pageList(ccwBookmarks);
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
     * 获取当前选择的书签标签
     * @param sortId
     * @param map
     * @return
     */
    @GetMapping("selectTree/{sortId}")
    public String selectTree(@PathVariable("sortId") Long sortId, ModelMap map){
        CcwTag tag = ccwTagService.getById(sortId);
        map.put("tag", tag);
        return prefix + "/tree";
    }

    @GetMapping("/treeData")
    @ResponseBody
    public List<CcwTagTreeVo> treeData(){
        List<CcwTagTreeVo> vos = ccwTagService.selectTagTreeList();
        return vos;
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

    /**
     * 2023-新增书签
     */
    @ApiOperation("2023-新增书签")
    @Log(title = "书签", businessType = BusinessType.OTHER)
    @PostMapping("/addBook")
    @ResponseBody
    public AjaxResult addBook(CcwBookmardksAddBo bo){
        return ccwBookmarksService.addBook(bo);
    }
}
