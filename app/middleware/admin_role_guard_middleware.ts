import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Middleware pour vérifier que l'utilisateur a un rôle administrateur
 * Rôles autorisés: 'super_admin', 'admin', 'moderator'
 */
export default class AdminRoleGuardMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.user

    if (!user) {
      return ctx.response.unauthorized({
        status: 'error',
        message: 'Non authentifié',
      })
    }

    // Charger les rôles de l'utilisateur
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    // Rôles admin autorisés
    const adminRoles = ['super_admin', 'admin', 'moderator']
    const hasAdminRole = userRoles.some((role) => adminRoles.includes(role))

    if (!hasAdminRole) {
      return ctx.response.forbidden({
        status: 'error',
        message: 'Accès refusé. Rôle administrateur requis.',
      })
    }

    return next()
  }
}
