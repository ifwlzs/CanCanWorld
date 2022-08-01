package com.ruoyi;

import cn.hutool.core.lang.tree.Tree;
import com.alibaba.fastjson.JSON;
import com.ruoyi.ccw.controller.CcwTagController;
import com.ruoyi.ccw.dto.CcwTagTreeDTO;
import com.ruoyi.ccw.service.ICcwTagService;
import com.ruoyi.common.core.page.TableDataInfo;
import lombok.extern.slf4j.Slf4j;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringRunner;

import javax.annotation.Resource;
import java.util.List;

@RunWith(SpringRunner.class)
@SpringBootTest
@Slf4j
public class InterfaceTest {
    @Resource
    ICcwTagService ccwTagService;

    @Test
    public void tagTreeTest() {
        System.out.println("====================\n\n");
        List<Tree<Long>> tree = ccwTagService.selectCcwTagTree();
        System.out.println(JSON.toJSONString(tree));
        System.out.println("\n\n====================");
    }
}
