import { z } from 'zod'

export const idSchema = z.string().uuid()
export const nonEmptyNameSchema = z.string().trim().min(1).max(240)
export const tagsSchema = z.array(z.string().trim().min(1).max(80)).max(100)

export const createTextSchema = z.object({
  name: nonEmptyNameSchema,
  text: z.string(),
  tags: tagsSchema
})

export const importMediaSchema = z.object({
  name: nonEmptyNameSchema,
  tags: tagsSchema,
  sourcePath: z.string().min(1),
  allowLargeFile: z.boolean()
})

export const updateItemSchema = z.object({
  id: idSchema,
  name: nonEmptyNameSchema,
  tags: tagsSchema,
  text: z.string().optional()
})

export const renameTagSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80)
})

export const copyItemSchema = z.object({
  id: idSchema,
  fallbackPngDataUrl: z.string().startsWith('data:image/png;base64,').max(150_000_000).optional()
})
