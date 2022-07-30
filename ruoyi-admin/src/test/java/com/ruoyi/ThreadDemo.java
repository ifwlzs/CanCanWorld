package com.ruoyi;

import cn.hutool.core.thread.ThreadUtil;
import com.ruoyi.ccw.utils.HttpUtils;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import java.util.concurrent.ExecutorService;

public class ThreadDemo {

    private static ExecutorService executor = ThreadUtil.newExecutor(20);

    public static void main(String[] args) throws InterruptedException {
//        final CopyOnWriteArrayList<WebInfo> webInfoList = new CopyOnWriteArrayList<>();
        List<WebInfo> webInfoList = Collections.synchronizedList(new ArrayList<>());
        webInfoList.add(new WebInfo("https://b213s.com/"));
        webInfoList.add(new WebInfo("https://www.baidu.com"));
        webInfoList.add(new WebInfo("https://cdn.jsdelivr.net"));
        webInfoList.add(new WebInfo("https://cdn.jsdelivr.net/"));
        webInfoList.add(new WebInfo("http://cdn.jsdelivr.net"));
        webInfoList.add(new WebInfo("http://cdn.jsdelivr.net/gh/ifwlzs/YueDuBackup@master/R18/R18BookSource.json"));

      for (int i = 0; i < webInfoList.size(); i++) {
            int t = i;
            executor.execute(() -> {
                //业务处理
                HttpUtils httpUtils=new HttpUtils();
                boolean success = httpUtils.networkCheck(webInfoList.get(t).getUrl());
                webInfoList.get(t).setStatus(success);
                System.out.println(success);
            });
      }

        ThreadUtil.sleep(20000);
        executor.shutdown();

        webInfoList.stream().forEach(System.out::println);
    }
}
class WebInfo {
    private String url;
    private Boolean status = false;

    public WebInfo(String url) {
        this.url = url;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public Boolean getStatus() {
        return status;
    }

    public void setStatus(Boolean status) {
        this.status = status;
    }

    @Override
    public String toString() {
        return "WebInfo{" +
                "url='" + url + '\'' +
                ", status=" + status +
                '}';
    }
}