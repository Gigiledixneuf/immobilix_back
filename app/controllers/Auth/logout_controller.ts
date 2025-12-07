import { HttpContext } from '@adonisjs/core/http'

export default class LogoutController {
  /**
   * Déconnecte l'utilisateur en révoquant tous ses tokens d'accès
   */
  async logout({ auth, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()

      // Révoquer tous les tokens de l'utilisateur
      await user.accessTokens().delete()

      return response.ok({
        status: 'success',
        message: 'Logout successful',
      })
    } catch (error) {
      return response.internalServerError({
        status: 'error',
        message: 'Logout failed',
        error: error.message,
      })
    }
  }
}

