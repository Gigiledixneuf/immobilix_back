import vine from '@vinejs/vine'

export const CreateMessageValidator = vine.compile(
  vine.object({
    conversationId: vine
      .string()
      .trim()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      .optional(),
    recipientId: vine
      .string()
      .trim()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      .optional(),
    propertyId: vine
      .string()
      .trim()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      .optional(),
    content: vine.string().trim().minLength(1),
    type: vine.string().in(['text', 'image']).optional(),
    clientId: vine.string().trim().optional(),
  })
)
