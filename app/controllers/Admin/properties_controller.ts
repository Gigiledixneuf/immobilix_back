import type { HttpContext } from '@adonisjs/core/http'
import Property from '#models/property'
import User from '#models/user'
import { ensureUuid } from '#utils/uuid'

/**
 * Contrôleur pour la gestion des propriétés par l'admin
 */
export default class AdminPropertiesController {
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
   * Liste toutes les propriétés avec pagination et filtres
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
      const search = request.input('search', '')
      // Note: Le modèle Property n'a pas de colonne is_active
      // Le filtre status est désactivé pour l'instant
      const city = request.input('city', '')

      let query = Property.query().preload('user').preload('photos').preload('amenities')

      // Filtre par recherche (nom, adresse, ville)
      if (search) {
        query = query.where((q) => {
          q.where('name', 'like', `%${search}%`)
            .orWhere('address', 'like', `%${search}%`)
            .orWhere('city', 'like', `%${search}%`)
        })
      }

      // Filtre par statut - Désactivé car la colonne is_active n'existe pas
      // TODO: Ajouter la colonne is_active à la table properties si nécessaire

      // Filtre par ville
      if (city) {
        query = query.where('city', 'like', `%${city}%`)
      }

      // Trier par date de création (plus récentes en premier)
      query = query.orderBy('created_at', 'desc')

      const properties = await query.paginate(page, limit)

      return response.ok(properties)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des propriétés',
        error: error.message,
      })
    }
  }

  /**
   * Affiche une propriété spécifique
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
      ensureUuid(params.id, 'UUID propriété invalide')
      const property = await Property.query()
        .where('uuid', params.id)
        .preload('user')
        .preload('photos')
        .preload('amenities')
        .preload('reviews')
        .first()

      if (!property) {
        return response.notFound({
          status: 'error',
          message: 'Propriété introuvable',
        })
      }

      return response.ok(property)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération de la propriété',
        error: error.message,
      })
    }
  }

  /**
   * Met à jour une propriété (activer/désactiver, modérer)
   */
  async update({ auth, params, request, response }: HttpContext) {
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
      ensureUuid(params.id, 'UUID propriété invalide')
      const property = await Property.findBy('uuid', params.id)

      if (!property) {
        return response.notFound({
          status: 'error',
          message: 'Propriété introuvable',
        })
      }

      // Note: Le modèle Property n'a pas de colonnes is_active et is_verified
      // Ces fonctionnalités sont désactivées pour l'instant
      // TODO: Ajouter ces colonnes à la table properties si nécessaire
      const payload = request.only([]) // Aucun champ modifiable pour l'instant

      await property.save()

      await property.load('user')
      await property.load('photos')
      await property.load('amenities')

      return response.ok({
        message: 'Propriété mise à jour avec succès',
        property,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la mise à jour de la propriété',
        error: error.message,
      })
    }
  }

  /**
   * Supprime une propriété
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({
        status: 'error',
        message: 'Non authentifié',
      })
    }

    await user.load('roles')
    const isSuperAdmin = user.roles?.some((r) => r.name === 'super_admin')

    if (!isSuperAdmin) {
      return response.forbidden({
        status: 'error',
        message: 'Accès refusé. Rôle super_admin requis pour supprimer une propriété.',
      })
    }

    try {
      ensureUuid(params.id, 'UUID propriété invalide')
      const property = await Property.findBy('uuid', params.id)

      if (!property) {
        return response.notFound({
          status: 'error',
          message: 'Propriété introuvable',
        })
      }

      await property.delete()

      return response.ok({
        message: 'Propriété supprimée avec succès',
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la suppression de la propriété',
        error: error.message,
      })
    }
  }
}
