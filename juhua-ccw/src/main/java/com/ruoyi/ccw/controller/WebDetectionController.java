package com.ruoyi.ccw.controller;

import cn.hutool.core.lang.Console;
import cn.hutool.core.thread.ThreadUtil;
import cn.hutool.http.HttpRequest;
import com.ruoyi.ccw.domain.CcwBookmarks;
import com.ruoyi.ccw.service.ICcwBookmarksService;
import com.ruoyi.ccw.utils.HttpUtils;
import com.ruoyi.common.core.domain.AjaxResult;
import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;
import lombok.extern.slf4j.Slf4j;
import org.apache.shiro.authz.annotation.RequiresPermissions;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import javax.annotation.Resource;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CountDownLatch;

/**
 * 网络状态检测
 */
@RestController
@RequestMapping("/web/detection")
@Api(tags = "网络状态检测Controller")
@Slf4j
public class WebDetectionController {
    @Resource
    ICcwBookmarksService ccwBookmarksService;

    /**
     * 全部网络测试
     *
     * @return
     */
    @RequiresPermissions("web:detection:all")
    @PostMapping("/all")
    @ResponseBody
    @ApiOperation("")
    public AjaxResult testAll() throws InterruptedException {
        List<CcwBookmarks> ccwBookmarks = ccwBookmarksService.selectCcwBookmarksList(null);
        CountDownLatch countDownLatch = ThreadUtil.newCountDownLatch(ccwBookmarks.size());
        List<CcwBookmarks> ccwBookmarksList = new ArrayList<>();
        for (CcwBookmarks ccwBookmark : ccwBookmarks) {
            ThreadUtil.execAsync(() -> {
                HttpUtils httpUtils = new HttpUtils();
                String url = ccwBookmark.getUrl();
                log.info("url: {}",url);
                boolean pingStatus = httpUtils.networkCheck(url);
                int code;
                try {
                    code = HttpRequest.get(url).execute().getStatus();
                } catch (Exception e) {
                    code = -1;
                }
                CcwBookmarks ccwBookmarks1 = CcwBookmarks.builder()
                        .id(ccwBookmark.getId())
                        .pingStatus(pingStatus ? 1 : 0)
                        .statusCode(Long.valueOf(code))
                        .detectionDate(new Date())
                        .build();
                ccwBookmarksList.add(ccwBookmarks1);
                log.info("ccwBookmarks1:{}", ccwBookmarks1);
                countDownLatch.countDown();
            });
            countDownLatch.await();
            log.info("测试：ccwBookmarksList: {}", ccwBookmarksList);
        }


        return AjaxResult.success();
    }

    @ApiOperation("检测存活")
    @PostMapping("/checkAlive")
    public AjaxResult checkAlive(){
        return ccwBookmarksService.checkAlive();
    }
}
