import type { HttpContext } from '@adonisjs/core/http'
import { CreateVisitRequestValidator, UpdateVisitRequestStatusValidator } from '#validators/visit_request'
import Property from '#models/property'
import VisitRequest, { VisitRequestStatus } from '#models/visit_request'
import { DateTime } from 'luxon'
import NotificationsService from '#services/notifications_service'

export default class VisitRequestsController {
  /**
   * POST /api/properties/:id/visit-requests
   * Créer une demande de visite pour une propriété
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    const payload = await request.validateUsing(CreateVisitRequestValidator)

    // Vérifier que la date n'est pas dans le passé
    const requestedDate = DateTime.fromISO(payload.requested_date)
    if (requestedDate.startOf('day') < DateTime.now().startOf('day')) {
      return response.badRequest({ message: 'La date demandée ne peut pas être dans le passé' })
    }

    // Vérifier qu'il n'y a pas déjà une demande en attente pour cette propriété et cette date/heure
    const existing = await VisitRequest.query()
      .where('property_id', propertyId)
      .where('tenant_id', user.id)
      .where('requested_date', requestedDate.toSQLDate()!)
      .where('requested_time', payload.requested_time)
      .where('status', VisitRequestStatus.PENDING)
      .first()

    if (existing) {
      return response.badRequest({ message: 'Une demande de visite est déjà en attente pour cette date et heure' })
    }

    // Convertir l'heure HH:mm en HH:mm:ss pour la base de données
    const timeWithSeconds = payload.requested_time.includes(':') && payload.requested_time.split(':').length === 2
      ? `${payload.requested_time}:00`
      : payload.requested_time

    // Créer la demande de visite
    const visitRequest = await VisitRequest.create({
      propertyId: propertyId,
      tenantId: user.id,
      requestedDate: requestedDate,
      requestedTime: timeWithSeconds,
      message: payload.message ?? null,
      status: VisitRequestStatus.PENDING,
    })

    // Notification au bailleur propriétaire
    const notifier = new NotificationsService()
    await notifier.notifyUser(
      property.user_id,
      'Nouvelle demande de visite',
      `Un locataire souhaite visiter votre logement "${property.name}" le ${requestedDate.toLocaleString({ locale: 'fr' })} à ${payload.requested_time}`,
      'visit_request',
      {
        propertyId,
        visitRequestId: visitRequest.id,
      }
    )

    // Charger les relations pour la réponse
    await visitRequest.load('property')
    await visitRequest.load('tenant')

    return response.created({
      status: 'success',
      message: 'Demande de visite créée avec succès',
      data: visitRequest,
    })
  }

  /**
   * GET /api/properties/:id/visit-requests
   * Lister les demandes de visite pour une propriété (bailleur)
   */
  async index({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    // Vérifier que l'utilisateur est le propriétaire
    if (property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas propriétaire de ce logement" })
    }

    const visitRequests = await VisitRequest.query()
      .where('property_id', propertyId)
      .preload('tenant', (t) => t.select(['id', 'fullName', 'email', 'portable']))
      .orderBy('requested_date', 'asc')
      .orderBy('requested_time', 'asc')

    return response.ok({
      status: 'success',
      message: 'Demandes de visite',
      data: visitRequests,
    })
  }

  /**
   * GET /api/visit-requests/me
   * Lister mes demandes de visite
   * - Locataire : ses propres demandes
   * - Bailleur : toutes les demandes pour toutes ses propriétés
   */
  async myRequests({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // Charger les rôles de l'utilisateur
    await user.load('roles')
    const userRoles = user.roles.map((r) => r.name)

    let visitRequests

    if (userRoles.includes('bailleur')) {
      // Le bailleur voit toutes les demandes pour toutes ses propriétés
      const userProperties = await Property.query().where('user_id', user.id).select('id')
      const propertyIds = userProperties.map((prop) => prop.id)

      if (propertyIds.length === 0) {
        // Pas de propriétés, retourner une liste vide
        visitRequests = []
      } else {
        visitRequests = await VisitRequest.query()
          .whereIn('property_id', propertyIds)
          .preload('property', (p) => p.select(['id', 'name', 'address', 'city', 'mainPhotoUrl']))
          .preload('tenant', (t) => t.select(['id', 'fullName', 'email', 'portable']))
          .orderBy('requested_date', 'asc')
          .orderBy('requested_time', 'asc')
      }
    } else {
      // Le locataire voit seulement ses propres demandes
      visitRequests = await VisitRequest.query()
        .where('tenant_id', user.id)
        .preload('property', (p) => p.select(['id', 'name', 'address', 'city', 'mainPhotoUrl']))
        .orderBy('requested_date', 'asc')
        .orderBy('requested_time', 'asc')
    }

    return response.ok({
      status: 'success',
      message: 'Mes demandes de visite',
      data: visitRequests,
    })
  }

  /**
   * PATCH /api/visit-requests/:id/status
   * Mettre à jour le statut d'une demande de visite (bailleur)
   */
  async updateStatus({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const visitRequestId = Number(params.id)
    const visitRequest = await VisitRequest.query()
      .where('id', visitRequestId)
      .preload('property')
      .preload('tenant')
      .first()

    if (!visitRequest) {
      return response.notFound({ message: 'Demande de visite introuvable' })
    }

    // Vérifier que l'utilisateur est le propriétaire
    if (visitRequest.property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à modifier cette demande" })
    }

    const payload = await request.validateUsing(UpdateVisitRequestStatusValidator)

    // Mettre à jour le statut
    visitRequest.status = payload.status as VisitRequestStatus

    // Si acceptée, on peut définir la date/heure confirmée
    if (payload.status === 'accepted' && payload.scheduled_at) {
      visitRequest.scheduledAt = payload.scheduled_at
    }

    await visitRequest.save()

    // Notification au locataire
    const notifier = new NotificationsService()
    const statusMessages = {
      accepted: 'acceptée',
      rejected: 'refusée',
      cancelled: 'annulée',
    }
    
    await notifier.notifyUser(
      visitRequest.tenantId,
      `Demande de visite ${statusMessages[payload.status as keyof typeof statusMessages]}`,
      `Votre demande de visite pour "${visitRequest.property.name}" a été ${statusMessages[payload.status as keyof typeof statusMessages]}`,
      'visit_request',
      {
        propertyId: visitRequest.propertyId,
        visitRequestId: visitRequest.id,
      }
    )

    return response.ok({
      status: 'success',
      message: `Demande de visite ${statusMessages[payload.status as keyof typeof statusMessages]}`,
      data: visitRequest,
    })
  }

  /**
   * DELETE /api/visit-requests/:id
   * Annuler une demande de visite (locataire)
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const visitRequestId = Number(params.id)
    const visitRequest = await VisitRequest.find(visitRequestId)

    if (!visitRequest) {
      return response.notFound({ message: 'Demande de visite introuvable' })
    }

    // Vérifier que l'utilisateur est le locataire qui a fait la demande
    if (visitRequest.tenantId !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à annuler cette demande" })
    }

    // Vérifier que la demande peut encore être annulée
    if (visitRequest.status !== VisitRequestStatus.PENDING) {
      return response.badRequest({ message: 'Cette demande ne peut plus être annulée' })
    }

    await visitRequest.delete()

    return response.ok({
      status: 'success',
      message: 'Demande de visite annulée',
    })
  }
}
