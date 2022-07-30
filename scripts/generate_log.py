import re

str = []
first_title = 0
index = 0
with open(r"D:/MyCode/github/CanCanWord/README.md", 'r', encoding='utf-8-sig') as f:
    for line in f:
        if (len(line) > 0 and line != '\n'):
            if (re.search('# 更新日志', line) != None and first_title == 0):
                # print(line, index)
                first_title = index
            str.append(line.replace("\n", ""))
            index += 1
str = str[first_title + 1:]
# print(str)
# print("\n\n========================")
log_list = []
log_detail = []
log_str = ""
index = 0
for i in str:
    if (re.search(r'##### V.*', i) != None):
        index = 0
        log_detail.append(log_str)
        log_detail = []
        log_list.append(log_detail)
        log_str = ""
        i = i.split(' ')
        log_detail.append(i[1].replace(".", ""))
        log_detail.append(i[1])
        log_detail.append(i[2])
    else:
        if index == 1:
            log_str += "<li>" + i.split(">- ")[1] + "</li>"
        else:
            log_str += "\n\t\t\t\t\t\t\t\t\t\t\t<li>" + i.split(">- ")[1] + "</li>"
    index += 1
log_detail.append(log_str)
log_list.append(log_detail)
# print(log_list)
show_str = """<!DOCTYPE html>
<html lang="zh" xmlns:th="http://www.thymeleaf.org">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!--360浏览器优先以webkit内核解析-->
    <title>若依介绍</title>
    <link rel="shortcut icon" href="favicon.ico">
    <link href="../static/css/bootstrap.min.css" th:href="@{/css/bootstrap.min.css}" rel="stylesheet"/>
    <link href="../static/css/font-awesome.min.css" th:href="@{/css/font-awesome.min.css}" rel="stylesheet"/>
    <link href="../static/css/style.min.css" th:href="@{/css/style.min.css}" rel="stylesheet"/>
</head>

<body class="gray-bg">

<div class="wrapper wrapper-content">
    <div class="row">
        <div class="col-xs-12">

            <div class="ibox float-e-margins">
                <div class="ibox-title">
                    <h5>联系信息</h5>

                </div>
                <div class="ibox-content">
                    <p><i class="fa fa-send-o"></i> 官网：<a href="http://ccw.juhua.fun" target="_blank">http://ccw.juhua.fun</a>
                    </p>
                </div>
            </div>
        </div>
        <div class="col-xs-12">
            <div class="ibox float-e-margins">
                <div class="ibox-title">
                    <h5>更新日志</h5>
                </div>

                <div class="ibox-content no-padding">
                    <div class="panel-body">
                        <div class="panel-group" id="version">
                            <!--日志开始-->
                            
                            <div class="panel panel-default">
                                <div class="panel-heading">
                                    <h5 class="panel-title">
                                        <a data-toggle="collapse" data-parent="#version" href="#@#1#@">@#2#@</a>
                                        <code class="pull-right">@#3#@</code>
                                    </h5>
                                </div>
                                <div id="@#1#@" class="panel-collapse collapse in">
                                    <div class="panel-body">
                                        <ol>
                                            @#4#@    
                                        </ol>
                                    </div>
                                </div>
                            </div>
"""
"""
@#1#@ v000
@#2#@ v0.0.0
@#3#@ 2022.06.22
@#4#@ <li></li>
"""
hind_str = """
                            <div class="panel panel-default">
                                <div class="panel-heading">
                                    <h4 class="panel-title">
                                        <a data-toggle="collapse" data-parent="#version" href="#@#1#@"
                                           class="collapsed" aria-expanded="false">@#2#@</a>
                                        <code class="pull-right">@#3#@</code>
                                    </h4>
                                </div>
                                <div id="@#1#@" class="panel-collapse collapse" aria-expanded="false"
                                     style="height: 0px;">
                                    <div class="panel-body">
                                        <ol>
                                            @#4#@
                                        </ol>
                                    </div>
                                </div>
                            </div>
"""
res = ""
hind = ""
index = 0
log_list = log_list[:len(log_list) - 1]
for i in log_list:
    if (index == 0):
        show_str = show_str.replace("@#1#@", i[0])
        show_str = show_str.replace("@#2#@", i[1])
        show_str = show_str.replace("@#3#@", i[2])
        show_str = show_str.replace("@#4#@", i[3])
        res += show_str
    else:
        res += hind_str
        res = res.replace("@#1#@", i[0])
        res = res.replace("@#2#@", i[1])
        res = res.replace("@#3#@", i[2])
        res = res.replace("@#4#@", i[3])
    index += 1
res += """
                        <!--日志结束-->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
</div>

<script th:src="@{/js/jquery.min.js}"></script>
<script th:src="@{/js/bootstrap.min.js}"></script>
<script th:src="@{/ajax/libs/layer/layer.min.js}"></script>
<script type="text/javascript">
    $('#pay-qrcode').click(function () {
        var html = $(this).html();
        parent.layer.open({
            title: false,
            type: 1,
            closeBtn: false,
            shadeClose: true,
            area: ['600px', '360px'],
            content: html
        });
    });
</script>

</body>
</html>
"""

# with open(r"D:\the-plum-is-ripe\out\log.txt", "w", encoding="utf-8") as out:
#     out.write(res)
#     out.flush()
path = "D:/MyCode/github/CanCanWord/ruoyi-admin/"
with open(path + "src/main/resources/templates/main.html", "w", encoding="utf-8") as out:
    out.write(res)
    out.flush()
# print(res)
