import vine from '@vinejs/vine'

export const CreateInviteValidator = vine.compile(
  vine.object({
    contact: vine.string().trim(), // email ou téléphone (validation spécifique à ajouter si besoin)
    propertyId: vine
      .string()
      .trim()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      .optional(),
  })
)




