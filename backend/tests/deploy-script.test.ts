import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** 读取仓库唯一 Linux 安装入口，部署能力以发布包中的同一文件为准。 */
async function readInstaller(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../deploy/install.sh'), 'utf8')
}

/** 读取 systemd 单元模板，验证安装脚本承诺的异常重启和开机启动基础。 */
async function readServiceUnit(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../deploy/cancanworld.service'), 'utf8')
}

describe('Linux 交互式部署脚本', () => {
  it('提供完整管理菜单和安装后固定入口', async () => {
    const installer = await readInstaller()
    for (const label of ['安装 / 升级', '启动服务', '停止服务', '重启服务', '查看状态', '查看实时日志', '健康检查', '启用开机启动', '关闭开机启动']) {
      expect(installer).toContain(label)
    }
    expect(installer).toContain('MANAGER_FILE="/usr/local/sbin/cancanworldctl"')
  })

  it('默认使用 3080 并启用 systemd 开机启动', async () => {
    const installer = await readInstaller()
    const serviceUnit = await readServiceUnit()
    expect(installer).toContain('SERVER_PORT="${SERVER_PORT:-3080}"')
    expect(installer).toContain('systemctl enable cancanworld.service')
    expect(serviceUnit).toContain('Restart=on-failure')
    expect(serviceUnit).toContain('WantedBy=multi-user.target')
  })

  it('数据库密码隐藏输入并自动生成两份随机密钥', async () => {
    const installer = await readInstaller()
    expect(installer).toContain('read -e -r -s -p')
    expect(installer).toContain('session_secret="$(generate_secret)"')
    expect(installer).toContain('csrf_secret="$(generate_secret)"')
  })

  it('所有交互输入启用 Bash Readline 编辑', async () => {
    const installer = await readInstaller()
    expect(installer).toContain('read -e -r -p')
    expect(installer).not.toMatch(/read -r -p/)
    expect(installer).not.toMatch(/read -r -s -p/)
  })
})
