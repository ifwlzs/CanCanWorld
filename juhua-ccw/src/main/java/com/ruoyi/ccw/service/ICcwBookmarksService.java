package com.ruoyi.ccw.service;

import java.util.List;
import com.ruoyi.ccw.domain.CcwBookmarks;

/**
 * 书签Service接口
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
public interface ICcwBookmarksService 
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
}
