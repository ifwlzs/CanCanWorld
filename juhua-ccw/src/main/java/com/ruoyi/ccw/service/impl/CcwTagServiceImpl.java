package com.ruoyi.ccw.service.impl;

import java.util.*;
import java.util.stream.Collectors;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.lang.tree.Tree;
import cn.hutool.core.lang.tree.TreeNodeConfig;
import cn.hutool.core.lang.tree.TreeUtil;
import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.ruoyi.ccw.domain.CcwBookmarkTag;
import com.ruoyi.ccw.dto.CcwTagTreeDTO;
import com.ruoyi.ccw.service.ICcwBookmarkTagService;
import com.ruoyi.ccw.vo.CcwTagTreeVo;
import com.ruoyi.common.core.domain.AjaxResult;
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
 * @date 2022-07-31
 */
@Service
public class CcwTagServiceImpl extends ServiceImpl<CcwTagMapper, CcwTag> implements ICcwTagService {
    @Autowired
    private CcwTagMapper ccwTagMapper;
    @Autowired
    private ICcwBookmarkTagService ccwBookmarkTagService;

    /**
     * 查询书签标签
     *
     * @param id 书签标签主键
     * @return 书签标签
     */
    @Override
    public CcwTag selectCcwTagById(Long id) {
        return ccwTagMapper.selectCcwTagById(id);
    }

    /**
     * 查询书签标签列表
     *
     * @param ccwTag 书签标签
     * @return 书签标签
     */
    @Override
    public List<CcwTag> selectCcwTagList(CcwTag ccwTag) {
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
    public int insertCcwTag(CcwTag ccwTag) {
        ccwTag.setCreateTime(DateUtils.getNowDate());
        long level = 0;
        if (ccwTag.getParentId() != null) {
            CcwTag parent = ccwTagMapper.selectCcwTagById(ccwTag.getParentId());
            if (parent != null) {
                level = parent.getLevel() + 1;
            }
        }
        ccwTag.setLevel(level);
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
    public int updateCcwTag(CcwTag ccwTag) {
        ccwTag.setUpdateTime(DateUtils.getNowDate());
        long level = 0;
        if (ccwTag.getParentId() != null) {
            CcwTag parent = ccwTagMapper.selectCcwTagById(ccwTag.getParentId());
            if (parent != null) {
                level = parent.getLevel() + 1;
            }
        }
        ccwTag.setLevel(level);
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
    public int deleteCcwTagByIds(String ids) {
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
    public int deleteCcwTagById(Long id) {
        return ccwTagMapper.deleteCcwTagById(id);
    }

    /***
     *
     * @param
     * @return
     */
    @Override
    public List<Tree<Long>> selectCcwTagTree() {
        List<CcwTag> ccwTagList = ccwTagMapper.selectCcwTagList(null);
        //按照父级id排序，升序，空的置前。
        ccwTagList = ccwTagList.stream()
                .sorted(Comparator.comparing(CcwTag::getParentId, Comparator.nullsFirst(Long::compareTo))).collect(Collectors.toList());
        List<CcwTagTreeDTO> ccwTagTreeDTOList = new ArrayList<>();
        // 1.查数据
        for (CcwTag tag : ccwTagList) {
            ccwTagTreeDTOList.add(CcwTagTreeDTO.builder()
                    .id(tag.getId())
                    .name(tag.getName())
                    .level(tag.getLevel())
                    .parentId(tag.getParentId())
                    .keywords(tag.getKeywords())
                    .icon(tag.getIcon())
                    .sort(tag.getSort())
                    .description(tag.getDescription())
                    .deleted(tag.getDeleted())
                    .creator(tag.getCreator())
                    .updater(tag.getUpdater())
                    .createDate(tag.getCreateDate())
                    .updateDate(tag.getUpdateDate())
                    .child(new ArrayList<>())
                    .build());
        }


        // 2.配置
        TreeNodeConfig config = new TreeNodeConfig();
        config.setIdKey("id");//默认为id可以不设置
        config.setParentIdKey("parentId");//默认为parentId可以不设置
//      config.setDeep(4);//最⼤递归深度
        config.setWeightKey("sort");//排序字段
        config.setChildrenKey("child");//⼦节点
        // 3.转树，Tree<>⾥⾯泛型为id的类型
        List<Tree<Long>> build = TreeUtil.build(ccwTagTreeDTOList, null, config,
                // treeNode – 源数据实体
                // tree – 树节点实体
                ((treeNode, tree) -> {
                    tree.setId(treeNode.getId());
                    tree.setParentId(treeNode.getParentId());
                    tree.setWeight(treeNode.getSort());
                    tree.setName(treeNode.getName());
                    // 扩展属性 ...
                    //tree.putExtra("extraField", 666);
                }));
        return build;
    }

    /**
     * 获取新的标签树
     * @return
     */
    @Override
    public AjaxResult getTreeInfo() {
        // 查询所有标签
        List<CcwTag> tags = list();
        // 构建新的树结构
        List<CcwTagTreeVo> vos = new ArrayList<>();
        if (ObjectUtil.isNotEmpty(tags)){
            for (CcwTag tag : tags) {
                CcwTagTreeVo vo = BeanUtil.toBean(tag, CcwTagTreeVo.class);
                vos.add(vo);
            }
            vos = CcwTagTreeVo.buildTree(vos);
        }
        return AjaxResult.success(vos);
    }

    @Override
    public List<CcwTagTreeVo> selectTagTreeList() {
        // 查询所有标签
        List<CcwTag> tags = list();
        // 构建新的树结构
        List<CcwTagTreeVo> vos = new ArrayList<>();
        if (ObjectUtil.isNotEmpty(tags)){
            for (CcwTag tag : tags) {
                CcwTagTreeVo vo = BeanUtil.toBean(tag, CcwTagTreeVo.class);
                vos.add(vo);
            }
            vos = CcwTagTreeVo.buildTree(vos);
        }
        return vos;
    }

    @Override
    public List<CcwTagTreeVo> selectTagTreeList(Long id) {
        // 查询所有标签
        List<CcwTag> tags = list();
        // 构建新的树结构
        List<CcwTagTreeVo> vos = new ArrayList<>();
        // 根据id查询对应的tag
        List<CcwBookmarkTag> bookmarkTags = ccwBookmarkTagService.list(new QueryWrapper<CcwBookmarkTag>().lambda()
                .eq(CcwBookmarkTag::getBookmarkId, id));
        if (ObjectUtil.isNotEmpty(tags)){
            for (CcwTag tag : tags) {
                CcwTagTreeVo vo = BeanUtil.toBean(tag, CcwTagTreeVo.class);
                if (ObjectUtil.isNotEmpty(bookmarkTags)){
                    List<Long> tagIdList = bookmarkTags.stream().map(CcwBookmarkTag::getTagId).distinct().collect(Collectors.toList());
                    vo.setChecked(tagIdList.contains(vo.getId()));
                }
                vos.add(vo);
            }
            vos = CcwTagTreeVo.buildTree(vos);
        }
        return vos;
    }


}
