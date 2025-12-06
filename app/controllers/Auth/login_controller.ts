import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import { errors } from '@vinejs/vine'
import { LoginValidator } from '#validators/Auth/login'

export default class LoginController {
  async login({ request, response }: HttpContext) {
    try {
      // Validation des entrées
      const { email, password } = await request.validateUsing(LoginValidator)

      // Normaliser l'email (trim + lowercase) pour assurer la cohérence
      const normalizedEmail = email.trim().toLowerCase()

      /**
       * Find a user by email. Return error if a user does
       * not exist
       */
      const user = await User.findBy('email', normalizedEmail)

      if (!user) {
        return response.unauthorized({
          status: 'error',
          message: 'Invalid credentials',
        })
      }

      /**
       * Verify the password using the hash service
       */
      try {
        await hash.verify(user.password, password)
      } catch (hashError) {
        // Erreur spécifique pour mot de passe incorrect
        return response.unauthorized({
          status: 'error',
          message: 'Invalid credentials',
        })
      }

      // Charger les rôles pour la réponse
      await user.load('roles')

      const token = await User.accessTokens.create(user)

      return response.ok({
        status: 'success',
        message: 'Login successful',
        data: {
          user: user.serialize({
            fields: { omit: ['password', 'created_at', 'updated_at'] },
            relations: { roles: { fields: ['id', 'name'] } },
          }),
          token: token.value!.release(),
        },
      })
    } catch (error) {
      if (error instanceof errors.E_VALIDATION_ERROR) {
        return response.badRequest({
          status: 'error',
          message: 'Validation failed',
          errors: error.messages,
        })
      }

      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.unauthorized({
          status: 'error',
          message: 'Invalid credentials',
        })
      }

      return response.internalServerError({
        status: 'error',
        message: 'Login failed',
        error: error.message,
      })
    }
  }
}
