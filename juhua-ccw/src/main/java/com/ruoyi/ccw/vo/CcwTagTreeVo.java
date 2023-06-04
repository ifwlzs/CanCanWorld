package com.ruoyi.ccw.vo;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.ruoyi.common.annotation.Excel;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * @ClassName CcwTagTreeVo
 * @Description TODO
 * @Author Dylan
 * @Date 2023/6/3 16:44
 * @Version 1.0
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CcwTagTreeVo {
    private static final long serialVersionUID = 1L;

    /** 标签id */
    private Long id;

    /** 标签名 */
    private String name;

    /** 分类级别 */
    private Long level;

    /** 父级分类 */
    private Long parentId;

    /** 关键词 */
    private String keywords;

    private List<CcwTagTreeVo> children;

    // 添加子节点的方法
    public void addChild(CcwTagTreeVo child) {
        if (children == null) {
            children = new ArrayList<>();
        }
        children.add(child);
    }

    public static List<CcwTagTreeVo> buildTree(List<CcwTagTreeVo> nodes) {
        List<CcwTagTreeVo> tree = new ArrayList<>();
        for (CcwTagTreeVo node : nodes) {
            if (node.getParentId() == null) { // 如果是根节点，直接添加到tree中
                tree.add(node);
            } else {
                for (CcwTagTreeVo parentNode : nodes) {
                    if (parentNode.getId() == node.getParentId()) { // 如果找到父节点，将当前节点添加为子节点
                        parentNode.addChild(node);
                        break;
                    }
                }
            }
        }
        return tree;
    }

}
