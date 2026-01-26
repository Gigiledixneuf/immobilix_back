import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import { UpdateProfileValidator } from '#validators/profile'
import { ensureUuid } from '#utils/uuid'

export default class AdminUsersController {
  /**
   * Liste tous les utilisateurs. Réservé aux administrateurs.
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized()

    await user.load('roles')
    const isAdmin = user.roles && user.roles.some((role) => role.name === 'admin')

    if (!isAdmin) {
      return response.forbidden({ message: 'Accès refusé.' })
    }

    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)
      const search = request.input('search', '')

      let query = User.query().preload('roles')

      // Filtre par recherche (nom, email)
      if (search) {
        query = query.where((q) => {
          q.where('email', 'like', `%${search}%`)
            .orWhere('first_name', 'like', `%${search}%`)
            .orWhere('last_name', 'like', `%${search}%`)
        })
      }

      // Trier par date de création (plus récents en premier)
      query = query.orderBy('created_at', 'desc')

      const users = await query.paginate(page, limit)
      return response.ok(users)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des utilisateurs',
        error: error.message,
      })
    }
  }

  /**
   * Affiche un utilisateur spécifique. Réservé aux administrateurs.
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized()

    await user.load('roles')
    const isAdmin = user.roles && user.roles.some((role) => role.name === 'admin')

    if (!isAdmin) {
      return response.forbidden({ message: 'Accès refusé.' })
    }

    ensureUuid(params.id, 'UUID utilisateur invalide')
    const targetUser = await User.findBy('uuid', params.id)
    if (!targetUser) {
      return response.notFound({ message: 'Utilisateur introuvable' })
    }
    await targetUser.load('roles')

    return response.ok(targetUser)
  }

  /**
   * Met à jour un utilisateur spécifique. Réservé aux administrateurs.
   */
  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized()

    await user.load('roles')
    const isAdmin = user.roles && user.roles.some((role) => role.name === 'admin')

    if (!isAdmin) {
      return response.forbidden({ message: 'Accès refusé.' })
    }

    ensureUuid(params.id, 'UUID utilisateur invalide')
    const targetUser = await User.findBy('uuid', params.id)
    if (!targetUser) {
      return response.notFound({ message: 'Utilisateur introuvable' })
    }

    const payload = await request.validateUsing(UpdateProfileValidator, {
      meta: {
        userId: targetUser.id,
      },
    })

    targetUser.merge(payload)
    await targetUser.save()

    await targetUser.load('roles')

    return response.ok({
      message: 'Utilisateur mis à jour avec succès.',
      user: targetUser,
    })
  }
}
