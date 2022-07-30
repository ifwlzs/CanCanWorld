package com.ruoyi;

import cn.hutool.core.util.ReUtil;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.text.SimpleDateFormat;
import java.util.Date;

public class TestNetwork {

    public static final String PING = "ping ";

    private String REQUEST_URL;
    public static final String GBK = "gbk";

    public static final String TTL = "TTL";

    public static final String NORMAL = "Network normal,The time is : ";

    public static final String EXCEPTION = "Network exception,The time is : ";

    public static final String DATE_FORMAT = "yyyy-MM-dd HH:mm:ss";

    public boolean isNetWorkStatus() {

        boolean flag = false;
        String line = null;
        StringBuffer sb = new StringBuffer();
        //TODO 正则匹配域名
        try {
            Process process = Runtime.getRuntime().exec(PING + REQUEST_URL);
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
                    runLog = NORMAL + getCurrentTime();
//                    System.out.println(runLog);
                } else {
                    //Network exception
                    flag = false;
                    runLog = EXCEPTION + getCurrentTime();
//                    System.err.println(runLog);
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
        } finally {

        }
        return flag;
    }


    public static String getCurrentTime() {
        SimpleDateFormat sdf = new SimpleDateFormat(DATE_FORMAT);
        String time = sdf.format(new Date());
        return time;
    }

    public static void main(String[] args) {
        TestNetwork testNetwork = new TestNetwork();
        System.out.println(testNetwork.isNetWorkStatus());
    }
}
