package com.ruoyi.ccw.service;

import java.util.List;
import com.ruoyi.ccw.domain.CcwBookmarkTag;

/**
 * 书签-tag关联Service接口
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
public interface ICcwBookmarkTagService 
{
    /**
     * 查询书签-tag关联
     * 
     * @param id 书签-tag关联主键
     * @return 书签-tag关联
     */
    public CcwBookmarkTag selectCcwBookmarkTagById(Long id);

    /**
     * 查询书签-tag关联列表
     * 
     * @param ccwBookmarkTag 书签-tag关联
     * @return 书签-tag关联集合
     */
    public List<CcwBookmarkTag> selectCcwBookmarkTagList(CcwBookmarkTag ccwBookmarkTag);

    /**
     * 新增书签-tag关联
     * 
     * @param ccwBookmarkTag 书签-tag关联
     * @return 结果
     */
    public int insertCcwBookmarkTag(CcwBookmarkTag ccwBookmarkTag);

    /**
     * 修改书签-tag关联
     * 
     * @param ccwBookmarkTag 书签-tag关联
     * @return 结果
     */
    public int updateCcwBookmarkTag(CcwBookmarkTag ccwBookmarkTag);

    /**
     * 批量删除书签-tag关联
     * 
     * @param ids 需要删除的书签-tag关联主键集合
     * @return 结果
     */
    public int deleteCcwBookmarkTagByIds(String ids);

    /**
     * 删除书签-tag关联信息
     * 
     * @param id 书签-tag关联主键
     * @return 结果
     */
    public int deleteCcwBookmarkTagById(Long id);
}
