import type { HttpContext } from '@adonisjs/core/http'
import { UpdateProfileValidator } from '#validators/profile'
import Role from '#models/role'

export default class ProfilesController {
  /**
   * Récupère le profil de l'utilisateur actuellement authentifié.
   */
  async show({ auth, response }: HttpContext) {
    const user = auth.user!

    await user.load('roles')

    return response.ok({
      success: true,
      data: user,
    })
  }

  /**
   * Met à jour le profil de l'utilisateur authentifié.
   */
  async update({ auth, request, response }: HttpContext) {
    const user = auth.user!

    const payload = await request.validateUsing(UpdateProfileValidator, {
      meta: {
        userId: user.id,
      },
    })

    user.merge(payload)
    await user.save()

    await user.load('roles')

    return response.ok({
      success: true,
      message: 'Profil mis à jour avec succès.',
      data: user,
    })
  }

  /**
   * Ajoute un rôle à l'utilisateur authentifié.
   */
  async addRole({ auth, request, response }: HttpContext) {
    const user = auth.user!
    const { role_name } = request.only(['role_name'])

    if (!role_name) {
      return response.badRequest({
        message: 'Le nom du rôle est requis.',
      })
    }

    // Charger les rôles actuels
    await user.load('roles')

    // Vérifier si l'utilisateur a déjà ce rôle
    const hasRole = user.roles?.some((r) => r.name === role_name) ?? false
    if (hasRole) {
      return response.badRequest({
        message: `L'utilisateur a déjà le rôle "${role_name}".`,
      })
    }

    // Trouver le rôle à ajouter
    const role = await Role.query().where('name', role_name).first()

    if (!role) {
      return response.notFound({
        message: `Le rôle "${role_name}" n'existe pas.`,
      })
    }

    // Ajouter le rôle à l'utilisateur
    await user.related('roles').attach([role.id])

    // Recharger les rôles
    await user.load('roles')

    return response.ok({
      success: true,
      message: `Le rôle "${role_name}" a été ajouté avec succès.`,
      data: user,
    })
  }

  /**
   * Change le rôle actif de l'utilisateur (tenant | landlord)
   * POST /api/profile/change-active-role
   * 
   * ISOLATION STRICTE : Permet de basculer entre les modes locataire et bailleur
   */
  async changeActiveRole({ auth, request, response }: HttpContext) {
    const user = auth.user!
    const { activeRole } = request.only(['activeRole'])

    if (!activeRole || !['tenant', 'landlord'].includes(activeRole)) {
      return response.badRequest({
        success: false,
        message: 'Le rôle actif doit être "tenant" ou "landlord"',
      })
    }

    // Charger les rôles de l'utilisateur
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    // Vérifier que l'utilisateur a le rôle correspondant
    const requiredRoleName = activeRole === 'tenant' ? 'locataire' : 'bailleur'
    if (!userRoles.includes(requiredRoleName)) {
      return response.forbidden({
        success: false,
        message: `Vous n'avez pas le rôle "${requiredRoleName}" nécessaire pour activer ce mode.`,
      })
    }

    // Changer le rôle actif
    user.activeRole = activeRole as 'tenant' | 'landlord'
    await user.save()

    await user.load('roles')

    return response.ok({
      success: true,
      message: `Rôle actif changé en mode ${activeRole === 'tenant' ? 'LOCATAIRE' : 'BAILLEUR'}`,
      data: user,
    })
  }
}
