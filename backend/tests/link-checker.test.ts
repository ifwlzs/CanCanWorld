import { describe, expect, it } from 'vitest'
import { createPinnedLookup } from '../src/services/link-checker.js'

const target = {
  url: new URL('https://example.com'),
  address: '93.184.216.34',
  family: 4 as const
}

/** 调用固定地址 lookup，并保留 Node 回调的地址与地址族形态供断言。 */
function lookup(all: boolean): Promise<{ address: string | Array<{ address: string; family: number }>; family?: number }> {
  const pinnedLookup = createPinnedLookup(target)
  return new Promise((resolve, reject) => {
    pinnedLookup('example.com', { all }, (error, address, family) => {
      if (error) {
        reject(error)
        return
      }
      resolve({ address, ...(family === undefined ? {} : { family }) })
    })
  })
}

describe('链接检测固定 DNS 回调', () => {
  it('all 模式返回地址数组，兼容 Node 24 和 Bun HTTP 客户端', async () => {
    await expect(lookup(true)).resolves.toEqual({
      address: [{ address: target.address, family: target.family }]
    })
  })

  it('普通模式返回单个地址和地址族', async () => {
    await expect(lookup(false)).resolves.toEqual({
      address: target.address,
      family: target.family
    })
  })
})
