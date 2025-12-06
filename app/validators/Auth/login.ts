import vine from '@vinejs/vine'

/**
 * Validation pour la connexion d'un utilisateur
 */
export const LoginValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    password: vine.string().minLength(1),
  })
)

