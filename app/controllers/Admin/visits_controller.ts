import type { HttpContext } from '@adonisjs/core/http'
import VisitRequest from '#models/visit_request'
import User from '#models/user'
import { ensureUuid } from '#utils/uuid'
import { VisitRequestStatus } from '#models/visit_request'

/**
 * Contrôleur pour la gestion des visites par l'admin
 */
export default class AdminVisitsController {
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
   * Liste toutes les demandes de visite avec pagination et filtres
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
      const status = request.input('status', '') // 'pending', 'accepted', 'rejected', etc.
      const propertyId = request.input('property_id', '')

      let query = VisitRequest.query()
        .preload('property')
        .preload('tenant')
        .preload('timeSlot')
        .orderBy('created_at', 'desc')

      // Filtre par statut
      if (status) {
        query = query.where('status', status as VisitRequestStatus)
      }

      // Filtre par propriété
      if (propertyId) {
        ensureUuid(propertyId, 'UUID propriété invalide')
        const property = await import('#models/property')
        const Property = property.default
        const prop = await Property.findBy('uuid', propertyId)
        if (prop) {
          query = query.where('property_id', prop.id)
        }
      }

      const visits = await query.paginate(page, limit)

      return response.ok(visits)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des visites',
        error: error.message,
      })
    }
  }

  /**
   * Affiche une demande de visite spécifique
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
      ensureUuid(params.id, 'UUID visite invalide')
      const visit = await VisitRequest.query()
        .where('uuid', params.id)
        .preload('property')
        .preload('tenant')
        .preload('timeSlot')
        .first()

      if (!visit) {
        return response.notFound({
          status: 'error',
          message: 'Visite introuvable',
        })
      }

      return response.ok(visit)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération de la visite',
        error: error.message,
      })
    }
  }

  /**
   * Met à jour le statut d'une visite
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
      ensureUuid(params.id, 'UUID visite invalide')
      const visit = await VisitRequest.findBy('uuid', params.id)

      if (!visit) {
        return response.notFound({
          status: 'error',
          message: 'Visite introuvable',
        })
      }

      const { status } = request.only(['status'])

      if (status && Object.values(VisitRequestStatus).includes(status as VisitRequestStatus)) {
        visit.status = status as VisitRequestStatus
        await visit.save()
      }

      await visit.load('property')
      await visit.load('tenant')
      await visit.load('timeSlot')

      return response.ok({
        message: 'Visite mise à jour avec succès',
        visit,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la mise à jour de la visite',
        error: error.message,
      })
    }
  }
}
