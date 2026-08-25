/** 该文件声明模板中按需加载的全局组件，由项目手工维护。 */
// TypeScript 只读取本文件中的类型声明，不参与运行时代码生成。
// @ts-nocheck

export {}

declare module 'vue' {
  export interface GlobalComponents {
    AuthDialog: typeof import('./components/AuthDialog.vue')['default']
    BackupDialog: typeof import('./components/BackupDialog.vue')['default']
    ElAlert: typeof import('element-plus/es')['ElAlert']
    ElButton: typeof import('element-plus/es')['ElButton']
    ElDialog: typeof import('element-plus/es')['ElDialog']
    ElDropdown: typeof import('element-plus/es')['ElDropdown']
    ElDropdownItem: typeof import('element-plus/es')['ElDropdownItem']
    ElDropdownMenu: typeof import('element-plus/es')['ElDropdownMenu']
    ElEmpty: typeof import('element-plus/es')['ElEmpty']
    ElForm: typeof import('element-plus/es')['ElForm']
    ElFormItem: typeof import('element-plus/es')['ElFormItem']
    ElInput: typeof import('element-plus/es')['ElInput']
    ElProgress: typeof import('element-plus/es')['ElProgress']
    ElSegmented: typeof import('element-plus/es')['ElSegmented']
    ElSelect: typeof import('element-plus/es')['ElSelect']
    ElTable: typeof import('element-plus/es')['ElTable']
    ElTableColumn: typeof import('element-plus/es')['ElTableColumn']
    ElTag: typeof import('element-plus/es')['ElTag']
    ElTree: typeof import('element-plus/es')['ElTree']
    FolderTree: typeof import('./components/FolderTree.vue')['default']
    ImportDialog: typeof import('./components/ImportDialog.vue')['default']
    NodeEditor: typeof import('./components/NodeEditor.vue')['default']
    RouterLink: typeof import('vue-router')['RouterLink']
    RouterView: typeof import('vue-router')['RouterView']
  }
  export interface GlobalDirectives {
    vLoading: typeof import('element-plus/es')['ElLoadingDirective']
  }
}
