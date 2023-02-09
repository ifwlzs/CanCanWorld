package com.ruoyi.ccw.service.impl;

import java.util.List;
import com.ruoyi.common.utils.DateUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.ruoyi.ccw.mapper.CcwBookmarksMapper;
import com.ruoyi.ccw.domain.CcwBookmarks;
import com.ruoyi.ccw.service.ICcwBookmarksService;
import com.ruoyi.common.core.text.Convert;

/**
 * 书签Service业务层处理
 * 
 * @author ifwlzs
 * @date 2023-02-09
 */
@Service
public class CcwBookmarksServiceImpl implements ICcwBookmarksService 
{
    @Autowired
    private CcwBookmarksMapper ccwBookmarksMapper;

    /**
     * 查询书签
     * 
     * @param id 书签主键
     * @return 书签
     */
    @Override
    public CcwBookmarks selectCcwBookmarksById(Long id)
    {
        return ccwBookmarksMapper.selectCcwBookmarksById(id);
    }

    /**
     * 查询书签列表
     * 
     * @param ccwBookmarks 书签
     * @return 书签
     */
    @Override
    public List<CcwBookmarks> selectCcwBookmarksList(CcwBookmarks ccwBookmarks)
    {
        return ccwBookmarksMapper.selectCcwBookmarksList(ccwBookmarks);
    }

    /**
     * 新增书签
     * 
     * @param ccwBookmarks 书签
     * @return 结果
     */
    @Override
    public int insertCcwBookmarks(CcwBookmarks ccwBookmarks)
    {
        ccwBookmarks.setCreateTime(DateUtils.getNowDate());
        return ccwBookmarksMapper.insertCcwBookmarks(ccwBookmarks);
    }

    /**
     * 修改书签
     * 
     * @param ccwBookmarks 书签
     * @return 结果
     */
    @Override
    public int updateCcwBookmarks(CcwBookmarks ccwBookmarks)
    {
        ccwBookmarks.setUpdateTime(DateUtils.getNowDate());
        return ccwBookmarksMapper.updateCcwBookmarks(ccwBookmarks);
    }

    /**
     * 批量删除书签
     * 
     * @param ids 需要删除的书签主键
     * @return 结果
     */
    @Override
    public int deleteCcwBookmarksByIds(String ids)
    {
        return ccwBookmarksMapper.deleteCcwBookmarksByIds(Convert.toStrArray(ids));
    }

    /**
     * 删除书签信息
     * 
     * @param id 书签主键
     * @return 结果
     */
    @Override
    public int deleteCcwBookmarksById(Long id)
    {
        return ccwBookmarksMapper.deleteCcwBookmarksById(id);
    }
}
