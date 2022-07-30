package com.ruoyi.ccw.utils;

import cn.hutool.core.util.ReUtil;
import cn.hutool.core.util.URLUtil;
import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.InputStreamReader;
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

}
