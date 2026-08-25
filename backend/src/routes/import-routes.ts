import { duplicateStrategySchema, importGroupOverrideSchema } from '@cancanworld/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { AppError, validationError } from '../errors.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseBookmarkHtml } from '../parsers/bookmark-html.js'
import { ImportRepository } from '../repositories/import-repository.js'
import type { AppDependencies, AppVariables } from '../types.js'

const confirmSchema = z.object({ parentId: z.number().int().positive(), duplicateStrategy: duplicateStrategySchema })

/** 导入路由严格分离预览和确认，预览阶段不写正式节点表。 */
export function createImportRoutes(dependencies: AppDependencies) {
  const routes = new Hono<{ Variables: AppVariables }>()
  const repository = new ImportRepository(dependencies.pool)
  routes.use('*', requireAdmin())

  routes.post('/html/preview', async (context) => {
    const body = await context.req.parseBody({ all: false })
    const file = body.file
    if (!(file instanceof File)) throw new AppError(422, 42208, '请选择 HTML 书签文件')
    if (file.size > dependencies.env.IMPORT_MAX_FILE_BYTES) throw new AppError(413, 41301, '导入文件超过大小限制')
    const html = await file.text()
    const parsed = parseBookmarkHtml(html, {
      maxFileBytes: dependencies.env.IMPORT_MAX_FILE_BYTES,
      maxNodes: dependencies.env.IMPORT_MAX_NODES,
      maxDepth: dependencies.env.IMPORT_MAX_DEPTH
    })
    const jobId = await repository.createPreview(file.name, parsed.nodes, parsed.stats, parsed.issues, dependencies.env.IMPORT_JOB_TTL_SECONDS)
    return context.json({ code: 0, message: 'success', data: { jobId, ...parsed } }, 201)
  })

  routes.get('/:jobId', async (context) => {
    const preview = await repository.getPreview(context.req.param('jobId'))
    return context.json({ code: 0, message: 'success', data: { jobId: context.req.param('jobId'), ...preview } })
  })

  routes.put('/:jobId/groups/:nodeIndex', async (context) => {
    const nodeIndex = Number(context.req.param('nodeIndex'))
    if (!Number.isSafeInteger(nodeIndex) || nodeIndex <= 0) throw new AppError(422, 42210, '分组标记序号无效')
    const parsed = importGroupOverrideSchema.safeParse(await context.req.json())
    if (!parsed.success) throw validationError(parsed.error)
    const preview = await repository.overrideGroup(context.req.param('jobId'), nodeIndex, parsed.data)
    return context.json({ code: 0, message: 'success', data: { jobId: context.req.param('jobId'), ...preview } })
  })

  routes.post('/:jobId/confirm', async (context) => {
    const parsed = confirmSchema.safeParse(await context.req.json())
    if (!parsed.success) throw validationError(parsed.error)
    const idempotencyKey = context.req.header('idempotency-key')
    if (!idempotencyKey || idempotencyKey.length > 128) throw new AppError(422, 42209, '确认导入需要有效的 Idempotency-Key')
    const result = await repository.confirm(context.req.param('jobId'), parsed.data.parentId, parsed.data.duplicateStrategy, idempotencyKey)
    return context.json({ code: 0, message: 'success', data: result })
  })
  return routes
}
