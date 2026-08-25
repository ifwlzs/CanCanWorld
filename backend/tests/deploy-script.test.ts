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

/** 读取 Docker Compose 模板，验证容器重启策略与 MySQL 持久化约定。 */
async function readDockerCompose(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../deploy/docker/compose.yaml'), 'utf8')
}

/** 读取 Docker 配置样例，验证默认端口和内置数据库可以直接配置。 */
async function readDockerEnvironmentExample(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../deploy/docker/cancanworld.env.example'), 'utf8')
}

/** 读取容器内 Nginx 配置，验证前端和 API 使用同一个对外端口。 */
async function readDockerNginx(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../deploy/docker/nginx.conf'), 'utf8')
}

/** 读取容器入口脚本，验证迁移前的生产配置防呆。 */
async function readDockerEntrypoint(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../deploy/docker/entrypoint.sh'), 'utf8')
}

/** 读取发布脚本，确保 Docker 运行文件确实进入最终压缩包。 */
async function readLinuxPackager(): Promise<string> {
  return readFile(resolve(import.meta.dirname, '../../scripts/package-linux.ps1'), 'utf8')
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

  it('跳过 Nginx 时明确提示后端根路径只提供 API', async () => {
    const installer = await readInstaller()
    expect(installer).toContain('后端端口 ${server_port} 仅提供 API')
    expect(installer).toContain('前端需启用 Nginx 或单独托管 current/public')
  })
})

describe('Linux Docker Compose 部署', () => {
  it('默认通过 3080 暴露容器内置 Nginx', async () => {
    const compose = await readDockerCompose()
    const environment = await readDockerEnvironmentExample()
    const nginx = await readDockerNginx()
    expect(environment).toContain('CANCANWORLD_PORT=3080')
    expect(compose).toContain('"${CANCANWORLD_PORT:-3080}:3080"')
    expect(nginx).toContain('listen 3080;')
    expect(nginx).toContain('proxy_pass http://127.0.0.1:3081;')
    expect(nginx).toContain('try_files $uri $uri/ /index.html;')
  })

  it('默认提供 MySQL 8 持久卷和容器开机恢复', async () => {
    const compose = await readDockerCompose()
    const environment = await readDockerEnvironmentExample()
    expect(environment).toContain('COMPOSE_PROFILES=bundled-db')
    expect(compose).toContain('image: mysql:8.4')
    expect(compose).toContain('mysql_data:/var/lib/mysql')
    expect(compose).toContain('restart: unless-stopped')
  })

  it('Compose 直接构建镜像并注入根目录配置', async () => {
    const compose = await readDockerCompose()
    const entrypoint = await readDockerEntrypoint()
    expect(compose).toContain('context: .')
    expect(compose).toContain('dockerfile: deploy/docker/Dockerfile')
    expect(compose).toContain('- ./.env')
    expect(entrypoint).toContain('Docker 配置仍使用示例占位值')
  })

  it('Linux 发布包包含完整 Docker 构建上下文', async () => {
    const packager = await readLinuxPackager()
    expect(packager).toContain("'deploy/docker'")
    expect(packager).toContain("'.dockerignore'")
    expect(packager).toContain("'compose.yaml'")
    expect(packager).toContain("'config/docker.env.example'")
  })
})
