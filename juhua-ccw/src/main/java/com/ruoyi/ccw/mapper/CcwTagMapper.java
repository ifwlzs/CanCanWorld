package com.ruoyi.ccw.mapper;

import java.util.List;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.ruoyi.ccw.domain.CcwTag;
import com.ruoyi.ccw.dto.CcwTagTreeDTO;
import org.apache.ibatis.annotations.Mapper;

/**
 * 书签标签Mapper接口
 * 
 * @author ifwlzs
 * @date 2022-07-31
 */
@Mapper
public interface CcwTagMapper extends BaseMapper<CcwTag>
{
    /**
     * 查询书签标签
     * 
     * @param id 书签标签主键
     * @return 书签标签
     */
    public CcwTag selectCcwTagById(Long id);

    /**
     * 查询书签标签列表
     * 
     * @param ccwTag 书签标签
     * @return 书签标签集合
     */
    public List<CcwTag> selectCcwTagList(CcwTag ccwTag);

    /**
     * 新增书签标签
     * 
     * @param ccwTag 书签标签
     * @return 结果
     */
    public int insertCcwTag(CcwTag ccwTag);

    /**
     * 修改书签标签
     * 
     * @param ccwTag 书签标签
     * @return 结果
     */
    public int updateCcwTag(CcwTag ccwTag);

    /**
     * 删除书签标签
     * 
     * @param id 书签标签主键
     * @return 结果
     */
    public int deleteCcwTagById(Long id);

    /**
     * 批量删除书签标签
     * 
     * @param ids 需要删除的数据主键集合
     * @return 结果
     */
    public int deleteCcwTagByIds(String[] ids);
    /**
     * 获取tree
     * @param ccwTag
     * @return
     */

}
