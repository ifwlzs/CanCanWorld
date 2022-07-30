package com.ruoyi.ccw.mapper;

import java.util.List;
import com.ruoyi.ccw.domain.CcwBookmarkTag;

/**
 * 书签-tag关联Mapper接口
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
public interface CcwBookmarkTagMapper 
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
     * 删除书签-tag关联
     * 
     * @param id 书签-tag关联主键
     * @return 结果
     */
    public int deleteCcwBookmarkTagById(Long id);

    /**
     * 批量删除书签-tag关联
     * 
     * @param ids 需要删除的数据主键集合
     * @return 结果
     */
    public int deleteCcwBookmarkTagByIds(String[] ids);
}
