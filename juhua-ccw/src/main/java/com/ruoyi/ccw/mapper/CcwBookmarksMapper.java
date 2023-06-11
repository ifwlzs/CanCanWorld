package com.ruoyi.ccw.mapper;

import java.util.List;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ruoyi.ccw.bo.CcwBookmarksSearchBo;
import com.ruoyi.ccw.domain.CcwBookmarks;
import org.apache.ibatis.annotations.Mapper;

/**
 * 书签Mapper接口
 * 
 * @author ifwlzs
 * @date 2023-02-09
 */
@Mapper
public interface CcwBookmarksMapper extends BaseMapper<CcwBookmarks>
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
     * 新-查询书签列表
     * @param ccwBookmarks
     * @return
     */
    public List<CcwBookmarks> selectCcwBookmarksVoList(CcwBookmarksSearchBo ccwBookmarks);

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
     * 删除书签
     * 
     * @param id 书签主键
     * @return 结果
     */
    public int deleteCcwBookmarksById(Long id);

    /**
     * 批量删除书签
     * 
     * @param ids 需要删除的数据主键集合
     * @return 结果
     */
    public int deleteCcwBookmarksByIds(String[] ids);
}
