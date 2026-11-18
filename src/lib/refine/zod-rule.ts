import type { Rule } from 'antd/es/form'
import type { ZodType } from 'zod'

/**
 * antd Form rule backed by a zod schema, so a form and the API route that
 * validates the same entity can never disagree. Shows the schema's message.
 * Empty inputs (undefined / null) are validated as "".
 */
export const zodRule = (schema: ZodType): Rule => ({
  validator: async (_rule, value) => {
    const result = schema.safeParse(value ?? '')
    if (!result.success) throw new Error(result.error.issues[0]?.message ?? 'Invalid value')
  },
})
