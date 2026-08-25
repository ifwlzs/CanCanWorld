import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import ipaddr from 'ipaddr.js'
import type { AppEnv } from '../config/env.js'
import { AppError } from '../errors.js'

export interface ResolvedTarget {
  url: URL
  address: string
  family: 4 | 6
}

/** URL 安全策略在每次请求和每次重定向前执行，返回已经固定的目标地址。 */
export class UrlPolicy {
  private readonly allowedPorts: Set<number>
  private readonly allowedNetworks: Array<[ipaddr.IPv4 | ipaddr.IPv6, number]>

  constructor(env: AppEnv) {
    this.allowedPorts = new Set(env.LINK_CHECK_ALLOWED_PORTS.split(',').map(Number).filter(Number.isInteger))
    this.allowedNetworks = env.LINK_CHECK_ALLOWED_CIDRS.split(',').map((value) => value.trim()).filter(Boolean).map((value) => ipaddr.parseCIDR(value))
  }

  /** 拒绝非 HTTP 协议、内嵌凭据、非常规端口和所有未放行的非公网地址。 */
  async resolve(rawUrl: string): Promise<ResolvedTarget> {
    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      throw new AppError(422, 42210, '链接地址格式无效')
    }
    if (!['http:', 'https:'].includes(url.protocol)) throw new AppError(422, 42211, '链接检测只支持 HTTP 和 HTTPS')
    if (url.username || url.password) throw new AppError(422, 42212, '链接地址不能包含用户凭据')
    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
    if (!this.allowedPorts.has(port)) throw new AppError(403, 40302, `端口 ${port} 不在链接检测允许列表中`)

    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
      : await lookup(hostname, { all: true, verbatim: true })
    if (addresses.length === 0) throw new AppError(422, 42213, '域名没有可用解析地址')
    for (const item of addresses) {
      if (!this.isAllowedAddress(item.address)) throw new AppError(403, 40303, `目标解析到受限地址：${item.address}`)
    }
    const selected = addresses[0]
    if (!selected || (selected.family !== 4 && selected.family !== 6)) throw new AppError(422, 42213, '域名没有可用解析地址')
    return { url, address: selected.address, family: selected.family }
  }

  /** 显式 CIDR 白名单优先；其余地址必须属于公开单播范围。 */
  private isAllowedAddress(value: string): boolean {
    const address = ipaddr.parse(value.split('%')[0] ?? value)
    for (const [network, prefix] of this.allowedNetworks) {
      if (address.kind() === network.kind() && address.match(network, prefix)) return true
    }
    return address.range() === 'unicast'
  }
}
