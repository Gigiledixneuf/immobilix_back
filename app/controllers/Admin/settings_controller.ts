import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

/**
 * Contrôleur pour les paramètres admin
 */
export default class AdminSettingsController {
  /**
   * Vérifie que l'utilisateur a un rôle admin
   */
  private async checkAdminRole(user: User): Promise<boolean> {
    await user.load('roles')
    const adminRoles = ['super_admin', 'admin', 'moderator']
    const userRoles = user.roles?.map((r) => r.name) || []
    return userRoles.some((role) => adminRoles.includes(role))
  }

  /**
   * Récupère les paramètres de l'admin connecté
   */
  async show({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({
        status: 'error',
        message: 'Non authentifié',
      })
    }

    const isAdmin = await this.checkAdminRole(user)
    if (!isAdmin) {
      return response.forbidden({
        status: 'error',
        message: 'Accès refusé. Rôle administrateur requis.',
      })
    }

    try {
      await user.load('roles')

      return response.ok({
        user: {
          id: user.uuid,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          roles: user.roles?.map((r) => r.name) || [],
        },
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des paramètres',
        error: error.message,
      })
    }
  }

  /**
   * Met à jour le profil de l'admin
   */
  async update({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({
        status: 'error',
        message: 'Non authentifié',
      })
    }

    const isAdmin = await this.checkAdminRole(user)
    if (!isAdmin) {
      return response.forbidden({
        status: 'error',
        message: 'Accès refusé. Rôle administrateur requis.',
      })
    }

    try {
      const { firstName, lastName } = request.only(['firstName', 'lastName'])

      if (firstName) {
        user.firstName = firstName
      }

      if (lastName) {
        user.lastName = lastName
      }

      await user.save()
      await user.load('roles')

      return response.ok({
        message: 'Profil mis à jour avec succès',
        user: {
          id: user.uuid,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: user.fullName,
          roles: user.roles?.map((r) => r.name) || [],
        },
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la mise à jour du profil',
        error: error.message,
      })
    }
  }
}
