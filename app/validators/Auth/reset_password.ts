import vine from '@vinejs/vine'

/**
 * Validation pour la réinitialisation du mot de passe
 */
export const ResetPasswordValidator = vine.compile(
  vine.object({
    token: vine.string().trim().minLength(1),
    password: vine.string().trim().minLength(8).confirmed(),
  })
)
