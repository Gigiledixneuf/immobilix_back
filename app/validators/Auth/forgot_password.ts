import vine from '@vinejs/vine'

/**
 * Validation pour la demande de réinitialisation de mot de passe
 */
export const ForgotPasswordValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
  })
)
