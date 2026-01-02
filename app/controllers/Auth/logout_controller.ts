import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

export default class LogoutController {
  /**
   * Déconnecte l'utilisateur en révoquant tous ses tokens d'accès
   * Gère gracieusement les cas où le token est expiré ou invalide
   */
  async logout({ auth, response }: HttpContext) {
    try {
      // Vérifier si l'utilisateur est authentifié (sans lever d'exception)
      let isAuthenticated = false
      try {
        isAuthenticated = await auth.check()
      } catch (checkError) {
        // Si auth.check() lève une exception (token invalide), considérer comme non authentifié
        logger.info(`ℹ️ [LOGOUT] auth.check() a levé une exception (token invalide): ${checkError.message}`)
        isAuthenticated = false
      }
      
      if (isAuthenticated) {
        try {
          // Récupérer l'utilisateur si authentifié
          const user = auth.user
          
          if (user) {
            // Révoquer tous les tokens de l'utilisateur
            await user.accessTokens().delete()
            logger.info(`✅ [LOGOUT] Tokens révoqués pour l'utilisateur ID: ${user.id}`)
          }
        } catch (tokenError: any) {
          // Si la révocation des tokens échoue, logger mais continuer
          logger.warn(`⚠️ [LOGOUT] Erreur lors de la révocation des tokens: ${tokenError?.message || tokenError}`)
        }
      } else {
        // Token invalide ou expiré - c'est OK, le logout local a déjà eu lieu
        logger.info('ℹ️ [LOGOUT] Token invalide ou expiré - Logout accepté quand même (logout local déjà effectué)')
      }

      // Toujours retourner success car le logout local a déjà eu lieu
      // Même si le token est invalide, on considère le logout comme réussi
      return response.ok({
        status: 'success',
        message: 'Logout successful',
      })
    } catch (error: any) {
      // En cas d'erreur inattendue, logger mais retourner success quand même
      // Car le logout local a déjà eu lieu côté client
      logger.error(`❌ [LOGOUT] Erreur inattendue lors du logout: ${error?.message || error}`, {
        error: error?.stack,
      })
      
      // Retourner success quand même car le logout local est déjà fait
      return response.ok({
        status: 'success',
        message: 'Logout successful (local logout already completed)',
      })
    }
  }
}

