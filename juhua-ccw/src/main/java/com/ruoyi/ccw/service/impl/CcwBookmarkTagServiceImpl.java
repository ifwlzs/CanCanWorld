package com.ruoyi.ccw.service.impl;

import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.ruoyi.ccw.mapper.CcwBookmarkTagMapper;
import com.ruoyi.ccw.domain.CcwBookmarkTag;
import com.ruoyi.ccw.service.ICcwBookmarkTagService;
import com.ruoyi.common.core.text.Convert;
import org.springframework.transaction.annotation.Transactional;

/**
 * 书签-tag关联Service业务层处理
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
@Service
public class CcwBookmarkTagServiceImpl implements ICcwBookmarkTagService 
{
    @Autowired
    private CcwBookmarkTagMapper ccwBookmarkTagMapper;

    /**
     * 查询书签-tag关联
     * 
     * @param id 书签-tag关联主键
     * @return 书签-tag关联
     */
    @Override
    public CcwBookmarkTag selectCcwBookmarkTagById(Long id)
    {
        return ccwBookmarkTagMapper.selectCcwBookmarkTagById(id);
    }

    /**
     * 查询书签-tag关联列表
     * 
     * @param ccwBookmarkTag 书签-tag关联
     * @return 书签-tag关联
     */
    @Override
    public List<CcwBookmarkTag> selectCcwBookmarkTagList(CcwBookmarkTag ccwBookmarkTag)
    {
        return ccwBookmarkTagMapper.selectCcwBookmarkTagList(ccwBookmarkTag);
    }

    /**
     * 新增书签-tag关联
     * 
     * @param ccwBookmarkTag 书签-tag关联
     * @return 结果
     */
    @Override
    @Transactional
    public int insertCcwBookmarkTag(CcwBookmarkTag ccwBookmarkTag)
    {
        return ccwBookmarkTagMapper.insertCcwBookmarkTag(ccwBookmarkTag);
    }

    /**
     * 修改书签-tag关联
     * 
     * @param ccwBookmarkTag 书签-tag关联
     * @return 结果
     */
    @Override
    @Transactional
    public int updateCcwBookmarkTag(CcwBookmarkTag ccwBookmarkTag)
    {
        return ccwBookmarkTagMapper.updateCcwBookmarkTag(ccwBookmarkTag);
    }

    /**
     * 批量删除书签-tag关联
     * 
     * @param ids 需要删除的书签-tag关联主键
     * @return 结果
     */
    @Override
    @Transactional
    public int deleteCcwBookmarkTagByIds(String ids)
    {
        return ccwBookmarkTagMapper.deleteCcwBookmarkTagByIds(Convert.toStrArray(ids));
    }

    /**
     * 删除书签-tag关联信息
     * 
     * @param id 书签-tag关联主键
     * @return 结果
     */
    @Override
    @Transactional
    public int deleteCcwBookmarkTagById(Long id)
    {
        return ccwBookmarkTagMapper.deleteCcwBookmarkTagById(id);
    }
}
