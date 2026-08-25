<script setup lang="ts">
import type { NavigationNode } from '@cancanworld/contracts'
import { ChevronRight, Folder, FolderOpen } from 'lucide-vue-next'
import { ref } from 'vue'

const props = defineProps<{
  nodes: NavigationNode[]
  selectedId: number
  level?: number
}>()

const emit = defineEmits<{ select: [id: number]; move: [nodeId: number, folderId: number] }>()
const expanded = ref(new Set<number>([1]))

/** 展开状态保留在树组件内，选择目录时同时自动展开该目录。 */
function select(node: NavigationNode): void {
  expanded.value.add(node.id)
  expanded.value = new Set(expanded.value)
  emit('select', node.id)
}

/** 折叠按钮不改变当前目录，方便快速浏览同级结构。 */
function toggle(id: number): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

/** 目录树接收导航节点 ID，实际循环检测和移动由后端事务完成。 */
function dropInto(event: DragEvent, folderId: number): void {
  const nodeId = Number(event.dataTransfer?.getData('application/x-cancanworld-node'))
  if (Number.isInteger(nodeId) && nodeId > 0) emit('move', nodeId, folderId)
}

/** 递归子树透传原始目标目录，避免父组件覆盖深层目录 ID。 */
function forwardMove(nodeId: number, folderId: number): void {
  emit('move', nodeId, folderId)
}
</script>

<template>
  <ul class="folder-tree" :class="{ 'folder-tree--nested': (props.level ?? 0) > 0 }">
    <li v-for="node in props.nodes.filter((item) => item.nodeType === 'folder')" :key="node.id">
      <div class="tree-row" :class="{ 'is-selected': node.id === props.selectedId }">
        <button
          class="icon-button tree-toggle"
          type="button"
          :aria-label="expanded.has(node.id) ? '折叠目录' : '展开目录'"
          @click.stop="toggle(node.id)"
        >
          <ChevronRight :size="14" :class="{ 'is-open': expanded.has(node.id) }" />
        </button>
        <button class="tree-label" type="button" @click="select(node)" @dragover.prevent @drop.prevent="dropInto($event, node.id)">
          <FolderOpen v-if="node.id === props.selectedId" :size="16" />
          <Folder v-else :size="16" />
          <span>{{ node.title }}</span>
        </button>
      </div>
      <FolderTree
        v-if="expanded.has(node.id) && node.children?.length"
        :nodes="node.children"
        :selected-id="props.selectedId"
        :level="(props.level ?? 0) + 1"
        @select="emit('select', $event)"
        @move="forwardMove"
      />
    </li>
  </ul>
</template>
