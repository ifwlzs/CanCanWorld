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
import com.ruoyi.ccw.domain.CcwSearchEngine;
import com.ruoyi.ccw.service.ICcwSearchEngineService;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.utils.poi.ExcelUtil;
import com.ruoyi.common.core.page.TableDataInfo;

/**
 * 搜索引擎Controller
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
@Controller
@RequestMapping("/ccw/searchEngine")
public class CcwSearchEngineController extends BaseController
{
    private String prefix = "ccw/searchEngine";

    @Autowired
    private ICcwSearchEngineService ccwSearchEngineService;

    @RequiresPermissions("ccw:searchEngine:view")
    @GetMapping()
    public String searchEngine()
    {
        return prefix + "/searchEngine";
    }

    /**
     * 查询搜索引擎列表
     */
    @RequiresPermissions("ccw:searchEngine:list")
    @PostMapping("/list")
    @ResponseBody
    public TableDataInfo list(CcwSearchEngine ccwSearchEngine)
    {
        startPage();
        List<CcwSearchEngine> list = ccwSearchEngineService.selectCcwSearchEngineList(ccwSearchEngine);
        return getDataTable(list);
    }

    /**
     * 导出搜索引擎列表
     */
    @RequiresPermissions("ccw:searchEngine:export")
    @Log(title = "搜索引擎", businessType = BusinessType.EXPORT)
    @PostMapping("/export")
    @ResponseBody
    public AjaxResult export(CcwSearchEngine ccwSearchEngine)
    {
        List<CcwSearchEngine> list = ccwSearchEngineService.selectCcwSearchEngineList(ccwSearchEngine);
        ExcelUtil<CcwSearchEngine> util = new ExcelUtil<CcwSearchEngine>(CcwSearchEngine.class);
        return util.exportExcel(list, "搜索引擎数据");
    }

    /**
     * 新增搜索引擎
     */
    @GetMapping("/add")
    public String add()
    {
        return prefix + "/add";
    }

    /**
     * 新增保存搜索引擎
     */
    @RequiresPermissions("ccw:searchEngine:add")
    @Log(title = "搜索引擎", businessType = BusinessType.INSERT)
    @PostMapping("/add")
    @ResponseBody
    public AjaxResult addSave(CcwSearchEngine ccwSearchEngine)
    {
        return toAjax(ccwSearchEngineService.insertCcwSearchEngine(ccwSearchEngine));
    }

    /**
     * 修改搜索引擎
     */
    @RequiresPermissions("ccw:searchEngine:edit")
    @GetMapping("/edit/{id}")
    public String edit(@PathVariable("id") Long id, ModelMap mmap)
    {
        CcwSearchEngine ccwSearchEngine = ccwSearchEngineService.selectCcwSearchEngineById(id);
        mmap.put("ccwSearchEngine", ccwSearchEngine);
        return prefix + "/edit";
    }

    /**
     * 修改保存搜索引擎
     */
    @RequiresPermissions("ccw:searchEngine:edit")
    @Log(title = "搜索引擎", businessType = BusinessType.UPDATE)
    @PostMapping("/edit")
    @ResponseBody
    public AjaxResult editSave(CcwSearchEngine ccwSearchEngine)
    {
        return toAjax(ccwSearchEngineService.updateCcwSearchEngine(ccwSearchEngine));
    }

    /**
     * 删除搜索引擎
     */
    @RequiresPermissions("ccw:searchEngine:remove")
    @Log(title = "搜索引擎", businessType = BusinessType.DELETE)
    @PostMapping( "/remove")
    @ResponseBody
    public AjaxResult remove(String ids)
    {
        return toAjax(ccwSearchEngineService.deleteCcwSearchEngineByIds(ids));
    }
}
