package com.ruoyi.ccw.service;

import java.util.List;

import com.baomidou.mybatisplus.extension.service.IService;
import com.ruoyi.ccw.bo.CcwBookmardksAddBo;
import com.ruoyi.ccw.domain.CcwBookmarks;
import com.ruoyi.common.core.domain.AjaxResult;

/**
 * 书签Service接口
 * 
 * @author ifwlzs
 * @date 2023-02-09
 */
public interface ICcwBookmarksService extends IService<CcwBookmarks>
{
    /**
     * 查询书签
     * 
     * @param id 书签主键
     * @return 书签
     */
    public CcwBookmarks selectCcwBookmarksById(Long id);

    /**
     * 查询书签列表
     * 
     * @param ccwBookmarks 书签
     * @return 书签集合
     */
    public List<CcwBookmarks> selectCcwBookmarksList(CcwBookmarks ccwBookmarks);

    /**
     * 新增书签
     * 
     * @param ccwBookmarks 书签
     * @return 结果
     */
    public int insertCcwBookmarks(CcwBookmarks ccwBookmarks);

    /**
     * 修改书签
     * 
     * @param ccwBookmarks 书签
     * @return 结果
     */
    public int updateCcwBookmarks(CcwBookmarks ccwBookmarks);

    /**
     * 批量删除书签
     * 
     * @param ids 需要删除的书签主键集合
     * @return 结果
     */
    public int deleteCcwBookmarksByIds(String ids);

    /**
     * 删除书签信息
     * 
     * @param id 书签主键
     * @return 结果
     */
    public int deleteCcwBookmarksById(Long id);

    /**
     * 确认存活
     * @return
     */
    AjaxResult checkAlive();

    AjaxResult addBook(CcwBookmardksAddBo bo);
}
