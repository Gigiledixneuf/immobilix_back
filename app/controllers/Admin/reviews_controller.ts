import type { HttpContext } from '@adonisjs/core/http'
import Review from '#models/review'
import User from '#models/user'
import { ensureUuid } from '#utils/uuid'

/**
 * Contrôleur pour la gestion des avis par l'admin
 */
export default class AdminReviewsController {
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
   * Liste tous les avis avec pagination et filtres
   */
  async index({ auth, request, response }: HttpContext) {
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
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)
      const type = request.input('type', '') // 'property', 'tenant', 'all'
      const minRating = request.input('min_rating', 0)

      let query = Review.query()
        .preload('user')
        .preload('property')
        .preload('reviewee')
        .orderBy('created_at', 'desc')

      // Filtre par type
      if (type === 'property') {
        query = query.where('review_type', 'property')
      } else if (type === 'tenant') {
        query = query.where('review_type', 'tenant')
      }

      // Filtre par note minimale
      if (minRating > 0) {
        query = query.where('rating', '>=', minRating)
      }

      const reviews = await query.paginate(page, limit)

      return response.ok(reviews)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des avis',
        error: error.message,
      })
    }
  }

  /**
   * Affiche un avis spécifique
   */
  async show({ auth, params, response }: HttpContext) {
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
      ensureUuid(params.id, 'UUID avis invalide')
      const review = await Review.query()
        .where('uuid', params.id)
        .preload('user')
        .preload('property')
        .preload('reviewee')
        .first()

      if (!review) {
        return response.notFound({
          status: 'error',
          message: 'Avis introuvable',
        })
      }

      return response.ok(review)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération de l\'avis',
        error: error.message,
      })
    }
  }

  /**
   * Supprime un avis (modération)
   */
  async destroy({ auth, params, response }: HttpContext) {
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
      ensureUuid(params.id, 'UUID avis invalide')
      const review = await Review.findBy('uuid', params.id)

      if (!review) {
        return response.notFound({
          status: 'error',
          message: 'Avis introuvable',
        })
      }

      await review.delete()

      return response.ok({
        message: 'Avis supprimé avec succès',
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la suppression de l\'avis',
        error: error.message,
      })
    }
  }
}
