import vine from '@vinejs/vine'

export const CreateMessageValidator = vine.compile(
  vine.object({
    conversationId: vine.number().positive().optional(),
    recipientId: vine.number().positive().optional(),
    propertyId: vine.number().positive().optional(),
    content: vine.string().trim().minLength(1),
    type: vine.string().in(['text', 'image']).optional(),
  })
)
