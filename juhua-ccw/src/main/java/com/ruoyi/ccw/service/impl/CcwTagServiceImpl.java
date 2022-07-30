package com.ruoyi.ccw.service.impl;

import java.util.List;
import com.ruoyi.common.utils.DateUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.ruoyi.ccw.mapper.CcwTagMapper;
import com.ruoyi.ccw.domain.CcwTag;
import com.ruoyi.ccw.service.ICcwTagService;
import com.ruoyi.common.core.text.Convert;
import org.springframework.transaction.annotation.Transactional;

/**
 * 书签标签Service业务层处理
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
@Service
public class CcwTagServiceImpl implements ICcwTagService 
{
    @Autowired
    private CcwTagMapper ccwTagMapper;

    /**
     * 查询书签标签
     * 
     * @param id 书签标签主键
     * @return 书签标签
     */
    @Override
    public CcwTag selectCcwTagById(Long id)
    {
        return ccwTagMapper.selectCcwTagById(id);
    }

    /**
     * 查询书签标签列表
     * 
     * @param ccwTag 书签标签
     * @return 书签标签
     */
    @Override
    public List<CcwTag> selectCcwTagList(CcwTag ccwTag)
    {
        return ccwTagMapper.selectCcwTagList(ccwTag);
    }

    /**
     * 新增书签标签
     * 
     * @param ccwTag 书签标签
     * @return 结果
     */
    @Override
    @Transactional
    public int insertCcwTag(CcwTag ccwTag)
    {
        ccwTag.setCreateTime(DateUtils.getNowDate());
        return ccwTagMapper.insertCcwTag(ccwTag);
    }

    /**
     * 修改书签标签
     * 
     * @param ccwTag 书签标签
     * @return 结果
     */
    @Override
    @Transactional
    public int updateCcwTag(CcwTag ccwTag)
    {
        ccwTag.setUpdateTime(DateUtils.getNowDate());
        return ccwTagMapper.updateCcwTag(ccwTag);
    }

    /**
     * 批量删除书签标签
     * 
     * @param ids 需要删除的书签标签主键
     * @return 结果
     */
    @Override
    @Transactional
    public int deleteCcwTagByIds(String ids)
    {
        return ccwTagMapper.deleteCcwTagByIds(Convert.toStrArray(ids));
    }

    /**
     * 删除书签标签信息
     * 
     * @param id 书签标签主键
     * @return 结果
     */
    @Override
    @Transactional
    public int deleteCcwTagById(Long id)
    {
        return ccwTagMapper.deleteCcwTagById(id);
    }
}
