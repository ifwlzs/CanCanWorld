package com.ruoyi.ccw.utils;

import cn.hutool.core.util.ReUtil;
import cn.hutool.core.util.URLUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import com.ruoyi.ccw.domain.CcwBookmarks;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;

@Component
public class HttpUtils {
    private String PING = "ping ";
    private String GBK = "gbk";
    private String TTL = "TTL";

    private String NORMAL = "Network normal,The time is : ";

    private String EXCEPTION = "Network exception,The time is : ";

    private String DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

    public boolean networkCheck(String url) {
        url = URLUtil.normalize(url);
        url = ReUtil.replaceAll(url, "http[s]?://([A-Za-z0-9.]{1,63}).*", "$1");

        boolean flag = false;
        String line = null;
        StringBuffer sb = new StringBuffer();
        //TODO 正则匹配域名
        //线程让步
        try {
            Process process = Runtime.getRuntime().exec(PING + url);
            BufferedReader buf = new BufferedReader(new InputStreamReader(
                    process.getInputStream(), Charset.forName(GBK)));
            while ((line = buf.readLine()) != null) {
                sb.append(line);
//                System.out.println(line);
            }
            buf.close();

            if (null != sb && !sb.toString().equals("")) {
                String runLog = "";
                if (sb.toString().indexOf(TTL) > 0) {
                    //Network normal
                    flag = true;
//                    runLog = NORMAL + getCurrentTime();
//                    System.out.println(runLog);
                } else {
                    //Network exception
                    flag = false;
//                    runLog = EXCEPTION + getCurrentTime();
//                    System.err.println(runLog);
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
        } finally {

        }
        return flag;
    }

    public static CcwBookmarks isUrlValid(CcwBookmarks bookmarks) {
        try {
            // 创建一个URL对象
            URL url = new URL(bookmarks.getUrl());

            // 打开一个HttpURLConnection连接
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();

            // 设置请求方法为HEAD
            connection.setRequestMethod("HEAD");

            // 获取响应码
            int responseCode = connection.getResponseCode();

            // 断开连接
            connection.disconnect();

            // 检查响应码是否在200-399之间，表示网址有效
            bookmarks.setPingStatus(responseCode >= 200 && responseCode <= 399 ? 0 : 2);

        } catch (IOException e) {
            // 发生异常，表示网址无效
            bookmarks.setPingStatus(2);
        }
        return bookmarks;
    }

}
