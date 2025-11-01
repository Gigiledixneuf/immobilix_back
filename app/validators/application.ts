import vine from '@vinejs/vine'

export const ApplyToPropertyValidator = vine.compile(
  vine.object({
    message: vine.string().trim().optional(),
  })
)




