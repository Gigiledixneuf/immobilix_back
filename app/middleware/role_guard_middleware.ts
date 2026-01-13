import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Middleware pour vérifier et isoler strictement les données par rôle actif
 * 
 * RÈGLE CRITIQUE :
 * - Un utilisateur avec plusieurs rôles NE DOIT voir que les données de son rôle actif
 * - Le rôle actif est stocké dans user.activeRole ('tenant' | 'landlord')
 * - Toutes les requêtes doivent être filtrées par activeRole
 */
export default class RoleGuardMiddleware {
  async handle(ctx: HttpContext, next: NextFn, options?: { requiredRole?: 'tenant' | 'landlord' }) {
    const user = ctx.auth.user

    if (!user) {
      return ctx.response.unauthorized({ 
        success: false,
        message: 'Non authentifié' 
      })
    }

    // Charger les rôles de l'utilisateur
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    // Si l'utilisateur n'a pas de rôle actif défini, définir le premier rôle disponible
    if (!user.activeRole) {
      if (userRoles.includes('locataire')) {
        user.activeRole = 'tenant'
        await user.save()
      } else if (userRoles.includes('bailleur')) {
        user.activeRole = 'landlord'
        await user.save()
      } else {
        return ctx.response.forbidden({
          success: false,
          message: 'Aucun rôle valide trouvé pour cet utilisateur',
        })
      }
    }

    // Vérifier que le rôle actif correspond à un rôle réel de l'utilisateur
    const activeRoleName = user.activeRole === 'tenant' ? 'locataire' : 'bailleur'
    if (!userRoles.includes(activeRoleName)) {
      return ctx.response.forbidden({
        success: false,
        message: `Le rôle actif (${user.activeRole}) ne correspond à aucun rôle de l'utilisateur`,
      })
    }

    // Si une route nécessite un rôle spécifique, vérifier
    if (options?.requiredRole) {
      const requiredRoleName = options.requiredRole === 'tenant' ? 'locataire' : 'bailleur'
      if (!userRoles.includes(requiredRoleName) || user.activeRole !== options.requiredRole) {
        return ctx.response.forbidden({
          success: false,
          message: `Cette action nécessite le rôle ${requiredRoleName} en mode actif`,
        })
      }
    }

    // Ajouter le rôle actif au contexte pour utilisation dans les contrôleurs
    ctx.activeRole = user.activeRole

    return next()
  }
}
