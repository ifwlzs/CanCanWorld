<script setup lang="ts">
import type { NavigationNode } from '@cancanworld/contracts'
import { Bookmark, Folder, Wrench } from 'lucide-vue-next'
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{ node: NavigationNode; size?: number }>(), { size: 20 })
const failed = ref(false)

// 节点图标地址刷新后允许重新加载，单次图片失败则回退到稳定的本地图标。
watch(() => props.node.iconUrl, () => { failed.value = false })
</script>

<template>
  <Folder v-if="props.node.nodeType === 'folder'" :size="props.size" />
  <Wrench v-else-if="props.node.bookmarkType === 'javascript'" :size="props.size" />
  <img
    v-else-if="props.node.iconUrl && !failed"
    class="bookmark-favicon"
    :src="props.node.iconUrl"
    :alt="`${props.node.title} 图标`"
    :width="props.size"
    :height="props.size"
    loading="lazy"
    @error="failed = true"
  />
  <Bookmark v-else :size="props.size" />
</template>
