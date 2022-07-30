package com.ruoyi;

import cn.hutool.core.lang.Console;
import cn.hutool.core.thread.ThreadUtil;
import com.ruoyi.ccw.utils.HttpUtils;
import lombok.extern.slf4j.Slf4j;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringRunner;

import javax.annotation.Resource;
import java.util.*;

@RunWith(SpringRunner.class)
@SpringBootTest
@Slf4j
public class HttpTest {
    @Resource
    HttpUtils httpUtils;

    @Test
    public void getHttpStatus() {
        log.info("=============");
        List<WebInfo> webInfoList = Collections.synchronizedList(new ArrayList<>());
        webInfoList.add(new WebInfo("https://b213s.com/"));
        webInfoList.add(new WebInfo("https://www.baidu.com"));
        webInfoList.add(new WebInfo("https://cdn.jsdelivr.net"));
        webInfoList.add(new WebInfo("https://cdn.jsdelivr.net/"));
        webInfoList.add(new WebInfo("http://cdn.jsdelivr.net"));
        webInfoList.add(new WebInfo("http://cdn.jsdelivr.net/gh/ifwlzs/YueDuBackup@master/R18/R18BookSource.json"));
        for (WebInfo webInfo : webInfoList) {
            ThreadUtil.execute(() -> {
                        System.out.println(httpUtils.networkCheck(webInfo.getUrl()));
                        webInfo.setStatus(httpUtils.networkCheck(webInfo.getUrl()));
                    }
            );
        }

        for (WebInfo webInfo : webInfoList) {
            Console.log("{}： {}", webInfo.getUrl(), webInfo.getStatus());
        }
        log.info("=============");

    }
}

