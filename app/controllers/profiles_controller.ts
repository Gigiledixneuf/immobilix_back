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

    return response.ok(user)
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
      message: 'Profil mis à jour avec succès.',
      user,
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
      message: `Le rôle "${role_name}" a été ajouté avec succès.`,
      user,
    })
  }
}
