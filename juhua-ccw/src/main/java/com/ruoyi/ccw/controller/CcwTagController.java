package com.ruoyi.ccw.controller;

import java.security.AccessControlContext;
import java.util.List;

import cn.hutool.core.lang.tree.Tree;
import cn.hutool.core.util.ObjectUtil;
import com.ruoyi.ccw.dto.CcwTagTreeDTO;
import com.ruoyi.ccw.vo.CcwTagListVo;
import com.ruoyi.ccw.vo.CcwTagTreeVo;
import com.ruoyi.common.core.domain.entity.SysMenu;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
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
import com.ruoyi.ccw.domain.CcwTag;
import com.ruoyi.ccw.service.ICcwTagService;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.utils.poi.ExcelUtil;
import com.ruoyi.common.core.page.TableDataInfo;

/**
 * 书签标签Controller
 *
 * @author ifwlzs
 * @date 2022-07-31
 */
@Controller
@RequestMapping("/ccw/tag")
@Api(tags = "书签标签Controller")
public class CcwTagController extends BaseController {
    private String prefix = "ccw/tag";

    @Autowired
    private ICcwTagService ccwTagService;

    @RequiresPermissions("ccw:tag:view")
    @GetMapping()
    public String tag() {
        return prefix + "/tag";
    }

    /**
     * 查询书签标签列表
     */
    @RequiresPermissions("ccw:tag:list")
    @PostMapping("/list")
    @ResponseBody
    public TableDataInfo list(CcwTag ccwTag) {
        startPage();
        List<CcwTag> list = ccwTagService.selectCcwTagList(ccwTag);
        return getDataTable(list);
    }

    /**
     * 导出书签标签列表
     */
    @RequiresPermissions("ccw:tag:export")
    @Log(title = "书签标签", businessType = BusinessType.EXPORT)
    @PostMapping("/export")
    @ResponseBody
    public AjaxResult export(CcwTag ccwTag) {
        List<CcwTag> list = ccwTagService.selectCcwTagList(ccwTag);
        ExcelUtil<CcwTag> util = new ExcelUtil<CcwTag>(CcwTag.class);
        return util.exportExcel(list, "书签标签数据");
    }

    /**
     * 新增书签标签
     */
    @GetMapping("/add")
    public String add(ModelMap mmp) {
        CcwTag ccwTag = null;
        ccwTag = new CcwTag();
        ccwTag.setId(0L);
        ccwTag.setName("主标签");
        mmp.put("ccwTag", ccwTag);
        return prefix + "/add";
    }

    /**
     * 新增保存书签标签
     */
    @RequiresPermissions("ccw:tag:add")
    @Log(title = "书签标签", businessType = BusinessType.INSERT)
    @PostMapping("/add")
    @ResponseBody
    public AjaxResult addSave(CcwTag ccwTag) {
        return toAjax(ccwTagService.insertCcwTag(ccwTag));
    }

    /**
     * 修改书签标签
     */
    @RequiresPermissions("ccw:tag:edit")
    @GetMapping("/edit/{id}")
    public String edit(@PathVariable("id") Long id, ModelMap mmap) {
        CcwTag ccwTag = ccwTagService.selectCcwTagById(id);
        mmap.put("ccwTag", ccwTag);
        return prefix + "/edit";
    }

    /**
     * 修改保存书签标签
     */
    @RequiresPermissions("ccw:tag:edit")
    @Log(title = "书签标签", businessType = BusinessType.UPDATE)
    @PostMapping("/edit")
    @ResponseBody
    public AjaxResult editSave(CcwTag ccwTag) {
        return toAjax(ccwTagService.updateCcwTag(ccwTag));
    }

    /**
     * 删除书签标签
     */
    @RequiresPermissions("ccw:tag:remove")
    @Log(title = "书签标签", businessType = BusinessType.DELETE)
    @GetMapping("/remove/{ids}")
    @ResponseBody
    public AjaxResult remove(@PathVariable("ids") String ids) {
        return ccwTagService.deleteCcwTagByIds(ids);
    }

    /**
     * 查询书签标签树
     */
    @RequiresPermissions("ccw:tag:tree")
    @PostMapping("/tree")
    @ResponseBody
    @ApiOperation("查询书签标签树")
    public TableDataInfo tree() {
        //startPage();
        List<Tree<Long>> list = ccwTagService.selectCcwTagTree();

        return getDataTable(list);
    }

    /**
     * 新查询书签标签树
     */
    @GetMapping("/treeInfo")
    @ApiOperation("新查询书签标签树")
    @ResponseBody
    public AjaxResult treeInfo(){
        return ccwTagService.getTreeInfo();
    }

    /**
     * 新-tag树列表
     */
    @PostMapping("/treeList")
    @ApiOperation("新-tag树列表")
    @ResponseBody
    public List<CcwTagListVo> treeList(CcwTag ccwTag){
        return ccwTagService.getTreeList(ccwTag);
    }

    @GetMapping("/selectTagTree/{id}")
    public String selectTagTree(@PathVariable("id") Long id, ModelMap mmp){
        CcwTag tag = new CcwTag();
        if (ObjectUtil.isNotNull(id)){
            tag = ccwTagService.getById(id);
        }else {
            tag = ccwTagService.getById(1);
        }
        mmp.put("tag", tag);
        return prefix + "/tree";
    }

    @GetMapping("/treeData")
    @ResponseBody
    public List<CcwTagTreeVo> treeData(){
        List<CcwTagTreeVo> vos = ccwTagService.selectTagTreeList();
        return vos;
    }

}
