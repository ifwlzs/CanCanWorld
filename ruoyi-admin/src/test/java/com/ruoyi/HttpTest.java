package com.ruoyi;

import cn.hutool.core.lang.Console;
import cn.hutool.core.thread.ThreadUtil;
import cn.hutool.http.HttpRequest;
import com.ruoyi.ccw.utils.HttpUtils;
import lombok.extern.slf4j.Slf4j;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.junit4.SpringRunner;

import javax.annotation.Resource;
import java.util.*;
import java.util.concurrent.CountDownLatch;

@RunWith(SpringRunner.class)
@SpringBootTest
@Slf4j
public class HttpTest {
    @Resource
    HttpUtils httpUtils;

    /**
     * 测试demo，1.根据url获取ping的状态。ping通为true。2.获取该url的网络状态码
     */
    @Test
    public void getHttpStatus() throws InterruptedException {
        log.info("=============");

        List<WebInfo> webInfoList = Collections.synchronizedList(new ArrayList<>());
        webInfoList.add(new WebInfo("https://b213s.com/"));
        webInfoList.add(new WebInfo("https://www.baidu.com"));
        webInfoList.add(new WebInfo("https://cdn.jsdelivr.net"));
        webInfoList.add(new WebInfo("https://www.bilibili.com/"));
        webInfoList.add(new WebInfo("https://github.com"));
        webInfoList.add(new WebInfo("http://cdn.jsdelivr.net/gh/ifwlzs/YueDuBackup@master/R18/R18BookSource.json"));
        CountDownLatch countDownLatch = ThreadUtil.newCountDownLatch(webInfoList.size());
        List<WebInfo> webInfoList1 = new ArrayList<>();
        for (WebInfo webInfo : webInfoList) {
            ThreadUtil.execute(() -> {
                        HttpUtils httpUtils = new HttpUtils();
                        String url = webInfo.getUrl();
                        boolean success = httpUtils.networkCheck(url);
                        int code;
                        try {
                            code = HttpRequest.get(url).execute().getStatus();
                        } catch (Exception e) {
                            code = -1;
                        }
//                        System.out.println(httpUtils.networkCheck(webInfo.getUrl()));
                        webInfoList1.add(new WebInfo(url, success, code));
                        Console.log("测试：{}： {}, {}", url, success, code);
                        countDownLatch.countDown();

                    }
            );
        }
//        ThreadUtil.waitForDie();
        countDownLatch.await();
        log.info("=======结果======");
        for (WebInfo webInfo : webInfoList1) {
            Console.log("{}： {}, {}", webInfo.getUrl(), webInfo.getStatus(), webInfo.getCode());
        }
        log.info("=============");

    }
}

