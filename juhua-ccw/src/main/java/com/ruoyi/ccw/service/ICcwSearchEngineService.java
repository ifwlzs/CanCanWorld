package com.ruoyi.ccw.service;

import java.util.List;
import com.ruoyi.ccw.domain.CcwSearchEngine;

/**
 * 搜索引擎Service接口
 * 
 * @author ifwlzs
 * @date 2022-07-27
 */
public interface ICcwSearchEngineService 
{
    /**
     * 查询搜索引擎
     * 
     * @param id 搜索引擎主键
     * @return 搜索引擎
     */
    public CcwSearchEngine selectCcwSearchEngineById(Long id);

    /**
     * 查询搜索引擎列表
     * 
     * @param ccwSearchEngine 搜索引擎
     * @return 搜索引擎集合
     */
    public List<CcwSearchEngine> selectCcwSearchEngineList(CcwSearchEngine ccwSearchEngine);

    /**
     * 新增搜索引擎
     * 
     * @param ccwSearchEngine 搜索引擎
     * @return 结果
     */
    public int insertCcwSearchEngine(CcwSearchEngine ccwSearchEngine);

    /**
     * 修改搜索引擎
     * 
     * @param ccwSearchEngine 搜索引擎
     * @return 结果
     */
    public int updateCcwSearchEngine(CcwSearchEngine ccwSearchEngine);

    /**
     * 批量删除搜索引擎
     * 
     * @param ids 需要删除的搜索引擎主键集合
     * @return 结果
     */
    public int deleteCcwSearchEngineByIds(String ids);

    /**
     * 删除搜索引擎信息
     * 
     * @param id 搜索引擎主键
     * @return 结果
     */
    public int deleteCcwSearchEngineById(Long id);
}
