package com.ruoyi;

import cn.hutool.core.thread.ThreadUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
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
        List<WebInfo> webInfoList1 = new ArrayList<>();
        for (int i = 0; i < webInfoList.size(); i++) {
            int t = i;
            executor.execute(() -> {
                //业务处理
                HttpUtils httpUtils = new HttpUtils();
                String url = webInfoList.get(t).getUrl();
                boolean success = httpUtils.networkCheck(url);
                int code = 404;
                if (success) {
                    code = HttpRequest.post(url).execute().getStatus();
                }
                WebInfo webInfo = new WebInfo(webInfoList.get(t).getUrl(), success, code);
                webInfoList1.add(webInfo);
                System.out.println(success);
            });
        }

        ThreadUtil.sleep(200);
        executor.shutdown();

        webInfoList1.stream().forEach(System.out::println);
    }
}

class WebInfo {
    private String url;
    private Boolean status = false;

    private int code = 404;

    public WebInfo(String url) {
        this.url = url;
    }

    public WebInfo(String url, Boolean status, int code) {
        this.url = url;
        this.status = status;
        this.code = code;
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

    public int getCode() {
        return code;
    }

    public void setStatus(Boolean status) {
        this.status = status;
    }

    @Override
    public String toString() {
        return "WebInfo{" +
                "url='" + url + '\'' +
                ", status=" + status +
                ", code=" + code +
                '}';
    }
}