package com.ruoyi.ccw.service.impl;

import java.util.List;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.ruoyi.common.utils.DateUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.ruoyi.ccw.mapper.CcwSearchEngineMapper;
import com.ruoyi.ccw.domain.CcwSearchEngine;
import com.ruoyi.ccw.service.ICcwSearchEngineService;
import com.ruoyi.common.core.text.Convert;
import org.springframework.transaction.annotation.Transactional;

/**
 * 搜索引擎Service业务层处理
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
@Service
public class CcwSearchEngineServiceImpl extends ServiceImpl<CcwSearchEngineMapper, CcwSearchEngine> implements ICcwSearchEngineService
{
    @Autowired
    private CcwSearchEngineMapper ccwSearchEngineMapper;

    /**
     * 查询搜索引擎
     * 
     * @param id 搜索引擎主键
     * @return 搜索引擎
     */
    @Override
    public CcwSearchEngine selectCcwSearchEngineById(Long id)
    {
        return ccwSearchEngineMapper.selectCcwSearchEngineById(id);
    }

    /**
     * 查询搜索引擎列表
     * 
     * @param ccwSearchEngine 搜索引擎
     * @return 搜索引擎
     */
    @Override
    public List<CcwSearchEngine> selectCcwSearchEngineList(CcwSearchEngine ccwSearchEngine)
    {
        return ccwSearchEngineMapper.selectCcwSearchEngineList(ccwSearchEngine);
    }

    /**
     * 新增搜索引擎
     * 
     * @param ccwSearchEngine 搜索引擎
     * @return 结果
     */
    @Override
    @Transactional
    public int insertCcwSearchEngine(CcwSearchEngine ccwSearchEngine)
    {
        ccwSearchEngine.setCreateTime(DateUtils.getNowDate());
        return ccwSearchEngineMapper.insertCcwSearchEngine(ccwSearchEngine);
    }

    /**
     * 修改搜索引擎
     * 
     * @param ccwSearchEngine 搜索引擎
     * @return 结果
     */
    @Override
    @Transactional
    public int updateCcwSearchEngine(CcwSearchEngine ccwSearchEngine)
    {
        ccwSearchEngine.setUpdateTime(DateUtils.getNowDate());
        return ccwSearchEngineMapper.updateCcwSearchEngine(ccwSearchEngine);
    }

    /**
     * 批量删除搜索引擎
     * 
     * @param ids 需要删除的搜索引擎主键
     * @return 结果
     */
    @Override
    @Transactional
    public int deleteCcwSearchEngineByIds(String ids)
    {
        return ccwSearchEngineMapper.deleteCcwSearchEngineByIds(Convert.toStrArray(ids));
    }

    /**
     * 删除搜索引擎信息
     * 
     * @param id 搜索引擎主键
     * @return 结果
     */
    @Override
    @Transactional
    public int deleteCcwSearchEngineById(Long id)
    {
        return ccwSearchEngineMapper.deleteCcwSearchEngineById(id);
    }
}
