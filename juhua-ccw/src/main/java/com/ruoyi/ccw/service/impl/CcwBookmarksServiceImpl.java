package com.ruoyi.ccw.service.impl;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.core.util.ObjectUtil;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.ruoyi.ccw.bo.CcwBookmardksAddBo;
import com.ruoyi.ccw.bo.CcwBookmarksSearchBo;
import com.ruoyi.ccw.domain.CcwBookmarkTag;
import com.ruoyi.ccw.domain.CcwTag;
import com.ruoyi.ccw.service.ICcwBookmarkTagService;
import com.ruoyi.ccw.service.ICcwTagService;
import com.ruoyi.ccw.utils.HttpUtils;
import com.ruoyi.ccw.vo.CcwBookmarksListVo;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.utils.DateUtils;
import com.ruoyi.common.utils.StringUtils;
import org.apache.shiro.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.ruoyi.ccw.mapper.CcwBookmarksMapper;
import com.ruoyi.ccw.domain.CcwBookmarks;
import com.ruoyi.ccw.service.ICcwBookmarksService;
import com.ruoyi.common.core.text.Convert;
import org.springframework.transaction.annotation.Transactional;

/**
 * 书签Service业务层处理
 * 
 * @author ifwlzs
 * @date 2023-02-09
 */
@Service
public class CcwBookmarksServiceImpl extends ServiceImpl<CcwBookmarksMapper, CcwBookmarks> implements ICcwBookmarksService
{
    @Autowired
    private CcwBookmarksMapper ccwBookmarksMapper;
    @Autowired
    private ICcwBookmarkTagService bookmarkTagService;
    @Autowired
    private ICcwTagService tagService;

    /**
     * 查询书签
     * 
     * @param id 书签主键
     * @return 书签
     */
    @Override
    public CcwBookmarks selectCcwBookmarksById(Long id)
    {
        return ccwBookmarksMapper.selectCcwBookmarksById(id);
    }

    /**
     * 查询书签列表
     * 
     * @param ccwBookmarks 书签
     * @return 书签
     */
    @Override
    public List<CcwBookmarks> selectCcwBookmarksList(CcwBookmarks ccwBookmarks)
    {
        return ccwBookmarksMapper.selectCcwBookmarksList(ccwBookmarks);
    }

    @Override
    public List<CcwBookmarksListVo> pageList(CcwBookmarksSearchBo ccwBookmarks) {
        List<CcwBookmarksListVo> vos = new ArrayList<>();
        // 根据条件查询书签
        List<CcwBookmarks> bookmarks = ccwBookmarksMapper.selectCcwBookmarksVoList(ccwBookmarks);
        // 提取其中的id
        if (ObjectUtil.isNotEmpty(bookmarks)){
            List<Long> bookmarkIdList = bookmarks.stream().map(CcwBookmarks::getId).distinct().collect(Collectors.toList());
            // 查询其中所有的书签Tag
            List<CcwBookmarkTag> bookmarkTags = bookmarkTagService.list(new QueryWrapper<CcwBookmarkTag>().lambda()
                    .in(CcwBookmarkTag::getBookmarkId, bookmarkIdList));
            if (ObjectUtil.isNotEmpty(bookmarkTags)){
                List<Long> tagIdList = bookmarkTags.stream().map(CcwBookmarkTag::getTagId).collect(Collectors.toList());
                // 查询tag相关信息
                List<CcwTag> tags = tagService.list(new QueryWrapper<CcwTag>().lambda()
                        .in(CcwTag::getId, tagIdList)
                        .eq(CcwTag::getDeleted, 0));
                if (ObjectUtil.isNotEmpty(tags)){
                    bookmarks.forEach(bookmark -> vos.add(getVoExpand(bookmark, bookmarkTags, tags)));
                }
            }
        }
        return vos;
    }

    /**
     * 获取书签信息
     * @param bookmark
     * @param bookmarkTags
     * @param tags
     * @return
     */
    private CcwBookmarksListVo getVoExpand(CcwBookmarks bookmark, List<CcwBookmarkTag> bookmarkTags, List<CcwTag> tags) {
        CcwBookmarksListVo vo = BeanUtil.toBean(bookmark, CcwBookmarksListVo.class);
        // 根据书签id筛选出自己的tag
        List<CcwBookmarkTag> tmpBookTags = bookmarkTags.stream().filter(val -> val.getBookmarkId().equals(bookmark.getId())).collect(Collectors.toList());
        if (ObjectUtil.isNotEmpty(tmpBookTags)){
            List<Long> tagIdList = tmpBookTags.stream().map(CcwBookmarkTag::getTagId).distinct().collect(Collectors.toList());
            if (ObjectUtil.isNotEmpty(tags)){
                List<CcwTag> tmpTags = tags.stream().filter(va -> tagIdList.contains(va.getId())).distinct().collect(Collectors.toList());
                if (ObjectUtil.isNotEmpty(tmpTags)){
                    StringBuilder tagName = new StringBuilder();
                    for (CcwTag tmpTag : tmpTags) {
                        tagName.append(",").append(tmpTag.getName());
                    }
                    vo.setTagNames(tagName.substring(1));
                }
            }
        }
        return vo;
    }

    /**
     * 新增书签
     * 
     * @param ccwBookmarks 书签
     * @return 结果
     */
    @Override
    public int insertCcwBookmarks(CcwBookmarks ccwBookmarks)
    {
        ccwBookmarks.setCreateTime(DateUtils.getNowDate());
        return ccwBookmarksMapper.insertCcwBookmarks(ccwBookmarks);
    }

    /**
     * 修改书签
     * 
     * @param ccwBookmarks 书签
     * @return 结果
     */
    @Override
    public int updateCcwBookmarks(CcwBookmarks ccwBookmarks)
    {
        ccwBookmarks.setUpdateTime(DateUtils.getNowDate());
        return ccwBookmarksMapper.updateCcwBookmarks(ccwBookmarks);
    }

    /**
     * 批量删除书签
     * 
     * @param ids 需要删除的书签主键
     * @return 结果
     */
    @Override
    public int deleteCcwBookmarksByIds(String ids)
    {
        return ccwBookmarksMapper.deleteCcwBookmarksByIds(Convert.toStrArray(ids));
    }

    /**
     * 删除书签信息
     * 
     * @param id 书签主键
     * @return 结果
     */
    @Override
    public int deleteCcwBookmarksById(Long id)
    {
        return ccwBookmarksMapper.deleteCcwBookmarksById(id);
    }

    /**
     * 确认存活
     * @return
     */
    @Override
    public AjaxResult checkAlive() {
        // 定义要进行查询的网站
        List<CcwBookmarks> checkList = new ArrayList<>();
        // 查询所有的网站
        List<CcwBookmarks> bookList = list();
        if (ObjectUtil.isEmpty(bookList)){
            return AjaxResult.error("没有网站可检测");
        }
        // 筛选有url的
        checkList = bookList.stream().filter(book -> StringUtils.isNotBlank(book.getUrl())).collect(Collectors.toList());
        checkList = checkUrls(checkList);
        boolean res = updateBatchById(checkList);
        return res ? AjaxResult.success("检测成功") : AjaxResult.error("检测失败");
    }

    /**
     * 新增书签
     * @param bo
     * @return
     */
    @Override
    @Transactional(rollbackFor = Exception.class)
    public AjaxResult addBook(CcwBookmardksAddBo bo) {
        // 初始化书签信息
        CcwBookmarks bookmarks = BeanUtil.toBean(bo, CcwBookmarks.class);
        bookmarks = getBookInit(bookmarks);
        // 执行书签新增操作
        boolean bookRes = save(bookmarks);
        if (!bookRes){
            return AjaxResult.error("新增失败");
        }
        // 提取相关的tagId
        List<Long> tagIdList = Arrays.asList(bo.getTagIds().split(",")).stream().map(Long::parseLong).distinct().collect(Collectors.toList());
        List<CcwBookmarkTag> bookmarkTags = new ArrayList<>();
        for (Long tagId : tagIdList) {
            CcwBookmarkTag bookmarkTag = new CcwBookmarkTag();
            bookmarkTag.setTagId(tagId);
            bookmarkTag.setBookmarkId(bookmarks.getId());
            bookmarkTags.add(bookmarkTag);
        }
        // 执行书签标签页新增
        if (ObjectUtil.isNotEmpty(bookmarkTags)){
            boolean bookTagRes = bookmarkTagService.saveBatch(bookmarkTags);
            if (!bookTagRes){
                return AjaxResult.error("新增失败");
            }
        }

        return AjaxResult.success("新增成功");
    }

    /**
     * 初始化书签信息
     * @param bookmarks
     * @return
     */
    private CcwBookmarks getBookInit(CcwBookmarks bookmarks) {
        if (ObjectUtil.isNotNull(bookmarks.getId())){
            bookmarks.setCreateTime(new Date());
            bookmarks.setCreateDate(new Date());
            bookmarks.setDeleted(0);
        }
        bookmarks.setUpdateTime(new Date());
        bookmarks.setUpdateDate(new Date());
        return bookmarks;
    }

    /**
     * 多线程检测存活
     * @param bookList
     * @return
     */
    public static List<CcwBookmarks> checkUrls(List<CcwBookmarks> bookList) {
        // 创建一个固定大小的线程池，根据你的硬件和需求调整线程数量
        int numThreads = 25;
        ExecutorService executor = Executors.newFixedThreadPool(numThreads);

        // 创建一个Future列表，用于存储每个网址的检测结果
        List<Future<CcwBookmarks>> futures = new ArrayList<>();

        // 为每个网址创建一个Callable任务，并将其提交给线程池
        for (CcwBookmarks book : bookList) {
            Callable<CcwBookmarks> task = () -> HttpUtils.isUrlValid(book);
            Future<CcwBookmarks> future = executor.submit(task);
            futures.add(future);
        }

        // 获取每个网址的检测结果，并将其添加到结果列表中
        List<CcwBookmarks> results = new ArrayList<>();
        for (Future<CcwBookmarks> future : futures) {
            try {
                results.add(future.get());
            } catch (Exception e) {
                // 发生异常，将结果设置为false
                e.printStackTrace();
            }
        }

        // 关闭线程池
        executor.shutdown();

        return results;
    }
}
