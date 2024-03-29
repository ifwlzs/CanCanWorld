package com.ruoyi.ccw.service;

import java.util.List;

import cn.hutool.core.lang.tree.Tree;
import com.baomidou.mybatisplus.extension.service.IService;
import com.ruoyi.ccw.domain.CcwTag;
import com.ruoyi.ccw.dto.CcwTagTreeDTO;
import com.ruoyi.ccw.vo.CcwTagListVo;
import com.ruoyi.ccw.vo.CcwTagTreeVo;
import com.ruoyi.common.core.domain.AjaxResult;

/**
 * 书签标签Service接口
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
public interface ICcwTagService extends IService<CcwTag>
{
    /**
     * 查询书签标签
     * 
     * @param id 书签标签主键
     * @return 书签标签
     */
    public CcwTag selectCcwTagById(Long id);

    /**
     * 查询书签标签列表
     * 
     * @param ccwTag 书签标签
     * @return 书签标签集合
     */
    public List<CcwTag> selectCcwTagList(CcwTag ccwTag);

    /**
     * 新增书签标签
     * 
     * @param ccwTag 书签标签
     * @return 结果
     */
    public int insertCcwTag(CcwTag ccwTag);

    /**
     * 修改书签标签
     * 
     * @param ccwTag 书签标签
     * @return 结果
     */
    public int updateCcwTag(CcwTag ccwTag);

    /**
     * 批量删除书签标签
     * 
     * @param ids 需要删除的书签标签主键集合
     * @return 结果
     */
    public AjaxResult deleteCcwTagByIds(String ids);

    /**
     * 删除书签标签信息
     * 
     * @param id 书签标签主键
     * @return 结果
     */
    public int deleteCcwTagById(Long id);

    /**
     * 获取书签树
     * @param ccwTag
     * @return
     */
    public List<Tree<Long>>  selectCcwTagTree();

    /**
     * 新获取标签树
     * @return
     */
    AjaxResult getTreeInfo();

    List<CcwTagTreeVo> selectTagTreeList();

    List<CcwTagTreeVo> selectTagTreeList(Long id);

    List<CcwTagListVo> getTreeList(CcwTag ccwTag);
}
