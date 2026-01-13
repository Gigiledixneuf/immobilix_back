import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import {
  CreateVisitRequestValidator,
  UpdateVisitRequestStatusValidator,
  CompleteVisitValidator,
  CreateApplicationFromVisitValidator,
} from '#validators/visit_request'
import Property from '#models/property'
import VisitRequest, { VisitRequestStatus } from '#models/visit_request'
import { DateTime } from 'luxon'
import NotificationsService from '#services/notifications_service'
import VisitSlotService from '#services/visit_slot_service'
import VisitFlowService from '#services/visit_flow_service'

export default class VisitRequestsController {
  private slotService: VisitSlotService
  private flowService: VisitFlowService

  constructor() {
    this.slotService = new VisitSlotService()
    this.flowService = new VisitFlowService()
  }
  /**
   * POST /api/properties/:id/visit-requests
   * Créer une demande de visite pour une propriété
   * ISOLATION STRICTE : Seuls les utilisateurs en mode LOCATAIRE peuvent créer une demande
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif
    if (user.activeRole !== 'tenant') {
      return response.forbidden({
        message: 'Vous devez être en mode LOCATAIRE pour créer une demande de visite. Changez de rôle dans votre profil.',
      })
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

    // Extraire l'heure au format HH:mm (sans les secondes)
    const startTime = payload.requested_time.includes(':') && payload.requested_time.split(':').length === 2
      ? payload.requested_time
      : payload.requested_time.split(':').slice(0, 2).join(':')

    // Convertir l'heure HH:mm en HH:mm:ss pour la base de données
    const timeWithSeconds = `${startTime}:00`

    // Trouver ou créer le créneau correspondant
    let timeSlotId: number | null = null
    try {
      const slot = await this.slotService.findOrCreateSlot(propertyId, requestedDate, startTime)
      
      // Vérifier que le créneau est disponible
      if (slot.status !== 'available') {
        return response.badRequest({ 
          message: 'Ce créneau n\'est plus disponible. Veuillez choisir un autre horaire.' 
        })
      }

      timeSlotId = slot.id
    } catch (error: any) {
      // Si le créneau n'existe pas ou n'est pas dans les disponibilités, on continue sans créneau
      // (compatibilité avec l'ancien système)
      logger.warn(`Could not find/create slot: ${error.message}`)
    }

    // Créer la demande de visite
    const visitRequest = await VisitRequest.create({
      propertyId: propertyId,
      tenantId: user.id,
      requestedDate: requestedDate,
      requestedTime: timeWithSeconds,
      message: payload.message ?? null,
      status: VisitRequestStatus.PENDING,
      timeSlotId: timeSlotId,
    })

    // Charger les relations pour la réponse et la notification
    await visitRequest.load('property')
    await visitRequest.load('tenant')

    // Notification au bailleur propriétaire (via notification service qui envoie aussi WebSocket)
    const notifier = new NotificationsService()
    
    // Envoyer notification (créée en DB + WebSocket + FCM)
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

    // Envoyer également un message WebSocket personnalisé pour mise à jour temps réel de la liste
    setImmediate(async () => {
      try {
        const { getWebSocketService } = await import('#services/websocket_service')
        const websocketService = getWebSocketService()
        
        // Envoyer les données de la demande de visite pour mise à jour temps réel
        await websocketService.sendMessageToUser(property.user_id, {
          type: 'new_visit_request',
          visitRequest: {
            id: visitRequest.id,
            propertyId: visitRequest.propertyId,
            tenantId: visitRequest.tenantId,
            requestedDate: visitRequest.requestedDate.toISODate(),
            requestedTime: visitRequest.requestedTime,
            message: visitRequest.message,
            status: visitRequest.status,
            createdAt: visitRequest.createdAt.toISO(),
            tenant: {
              id: visitRequest.tenant.id,
              fullName: visitRequest.tenant.fullName,
              email: visitRequest.tenant.email,
              portable: visitRequest.tenant.portable,
              profilePhotoUrl: visitRequest.tenant.profilePhotoUrl,
            },
          },
        })
      } catch (error: any) {
        // Logger mais ne pas bloquer
        logger.error('Error sending visit request via WebSocket:', error)
      }
    })

    return response.created({
      status: 'success',
      message: 'Demande de visite créée avec succès',
      data: visitRequest,
    })
  }

  /**
   * GET /api/properties/:id/visit-requests
   * Lister les demandes de visite pour une propriété (bailleur)
   * ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent voir les demandes
   */
  async index({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour voir les demandes de visite. Changez de rôle dans votre profil.',
      })
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
      .preload('tenant', (t) => t.select(['id', 'fullName', 'email', 'portable', 'profilePhotoUrl']))
      .preload('timeSlot')
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

    // ISOLATION STRICTE : Filtrer par rôle actif
    if (!user.activeRole) {
      return response.forbidden({
        message: 'Aucun rôle actif défini. Veuillez sélectionner un rôle dans votre profil.',
      })
    }

    let visitRequests

    if (user.activeRole === 'landlord') {
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
          .preload('tenant', (t) => t.select(['id', 'fullName', 'email', 'portable', 'profilePhotoUrl']))
          .preload('timeSlot')
          .orderBy('requested_date', 'asc')
          .orderBy('requested_time', 'asc')
      }
    } else if (user.activeRole === 'tenant') {
      // Le locataire voit seulement ses propres demandes
      visitRequests = await VisitRequest.query()
        .where('tenant_id', user.id)
        .preload('property', (p) => p.select(['id', 'name', 'address', 'city', 'mainPhotoUrl']))
        .orderBy('requested_date', 'asc')
        .orderBy('requested_time', 'asc')
    } else {
      return response.forbidden({
        message: "Vous n'avez pas accès aux demandes de visite",
      })
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
   * ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent modifier le statut
   */
  async updateStatus({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour modifier le statut d\'une demande de visite. Changez de rôle dans votre profil.',
      })
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

    // Si acceptée, réserver le créneau et définir la date/heure confirmée
    if (payload.status === 'accepted') {
      if (payload.scheduled_at) {
        // Convertir scheduled_at en DateTime de Luxon
        if (payload.scheduled_at instanceof DateTime) {
          visitRequest.scheduledAt = payload.scheduled_at
        } else if (payload.scheduled_at instanceof Date) {
          visitRequest.scheduledAt = DateTime.fromJSDate(payload.scheduled_at)
        } else if (typeof payload.scheduled_at === 'string') {
          visitRequest.scheduledAt = DateTime.fromISO(payload.scheduled_at)
        } else {
          // Fallback: essayer de parser comme ISO string
          visitRequest.scheduledAt = DateTime.fromISO(String(payload.scheduled_at))
        }
      } else {
        // Si pas de scheduled_at fourni, utiliser requestedDate et requestedTime
        visitRequest.scheduledAt = DateTime.fromISO(
          `${visitRequest.requestedDate.toISODate()}T${visitRequest.requestedTime}`
        )
      }

      // Initialiser le délai de confirmation à 48h par défaut
      if (!visitRequest.confirmationDeadlineHours) {
        visitRequest.confirmationDeadlineHours = 48
      }

      // Si un créneau est associé, le réserver
      if (visitRequest.timeSlotId) {
        try {
          await this.slotService.reserveSlot(
            visitRequest.propertyId,
            visitRequest.requestedDate,
            visitRequest.requestedTime.split(':').slice(0, 2).join(':'),
            visitRequest.id
          )
        } catch (error: any) {
          // Si le créneau est déjà réservé, retourner une erreur
          return response.badRequest({
            status: 'error',
            message: 'Ce créneau a déjà été réservé par une autre demande',
          })
        }
      }
    } else if (payload.status === 'rejected' || payload.status === 'cancelled') {
      // Si refusée ou annulée, libérer le créneau s'il était réservé
      if (visitRequest.timeSlotId) {
        try {
          await this.slotService.releaseSlot(visitRequest.timeSlotId)
          visitRequest.timeSlotId = null
        } catch (error: any) {
          // Log l'erreur mais continue (le créneau peut déjà être libéré)
          logger.warn(`Error releasing slot: ${error.message}`)
        }
      }
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

    // Envoyer également un message WebSocket personnalisé pour mise à jour temps réel
    setImmediate(async () => {
      try {
        const { getWebSocketService } = await import('#services/websocket_service')
        const websocketService = getWebSocketService()
        
        // Envoyer au locataire
        await websocketService.sendMessageToUser(visitRequest.tenantId, {
          type: 'visit_request_status_updated',
          visitRequest: {
            id: visitRequest.id,
            propertyId: visitRequest.propertyId,
            status: visitRequest.status,
            scheduledAt: visitRequest.scheduledAt?.toISO() || null,
            updatedAt: visitRequest.updatedAt.toISO(),
          },
        })

        // Envoyer aussi au bailleur pour mettre à jour sa liste
        await websocketService.sendMessageToUser(visitRequest.property.user_id, {
          type: 'visit_request_status_updated',
          visitRequest: {
            id: visitRequest.id,
            propertyId: visitRequest.propertyId,
            status: visitRequest.status,
            scheduledAt: visitRequest.scheduledAt?.toISO() || null,
            updatedAt: visitRequest.updatedAt.toISO(),
            tenant: {
              id: visitRequest.tenant.id,
              fullName: visitRequest.tenant.fullName,
              email: visitRequest.tenant.email,
              portable: visitRequest.tenant.portable,
              profilePhotoUrl: visitRequest.tenant.profilePhotoUrl,
            },
          },
        })
      } catch (error: any) {
        // Logger mais ne pas bloquer
        logger.error('Error sending visit request update via WebSocket:', error)
      }
    })

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

    // ISOLATION STRICTE : Seuls les utilisateurs en mode LOCATAIRE peuvent supprimer leurs demandes
    if (user.activeRole !== 'tenant') {
      return response.forbidden({
        message: 'Vous devez être en mode LOCATAIRE pour annuler une demande de visite. Changez de rôle dans votre profil.',
      })
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

    // Libérer le créneau s'il était associé
    if (visitRequest.timeSlotId) {
      try {
        await this.slotService.releaseSlot(visitRequest.timeSlotId)
      } catch (error: any) {
        // Log l'erreur mais continue avec la suppression
        logger.warn(`Error releasing slot: ${error.message}`)
      }
    }

    await visitRequest.delete()

    return response.ok({
      status: 'success',
      message: 'Demande de visite annulée',
    })
  }

  /**
   * PATCH /api/visit-requests/:id/complete
   * Confirmer une visite (double confirmation)
   */
  async complete({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const visitRequestId = Number(params.id)
    const payload = await request.validateUsing(CompleteVisitValidator)

    try {
      const visitRequest = await this.flowService.confirmVisit(
        visitRequestId,
        user.id,
        payload.confirmed_by,
        payload.notes
      )

      return response.ok({
        status: 'success',
        message:
          visitRequest.status === VisitRequestStatus.COMPLETED
            ? 'Visite confirmée par les deux parties'
            : 'Confirmation enregistrée. En attente de la confirmation de l\'autre partie.',
        data: visitRequest,
      })
    } catch (error: any) {
      return response.badRequest({
        status: 'error',
        message: error.message || 'Erreur lors de la confirmation de la visite',
      })
    }
  }

  /**
   * POST /api/visit-requests/:id/pre-confirm
   * Pré-confirmer une visite (anti-fantôme)
   */
  async preConfirm({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const visitRequestId = Number(params.id)

    try {
      const visitRequest = await this.flowService.preConfirmVisit(visitRequestId, user.id)

      return response.ok({
        status: 'success',
        message: 'Pré-confirmation enregistrée',
        data: visitRequest,
      })
    } catch (error: any) {
      return response.badRequest({
        status: 'error',
        message: error.message || 'Erreur lors de la pré-confirmation',
      })
    }
  }

  /**
   * POST /api/visit-requests/:id/create-application
   * Créer une candidature depuis une visite complétée
   */
  async createApplicationFromVisit({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const visitRequestId = Number(params.id)
    const payload = await request.validateUsing(CreateApplicationFromVisitValidator)

    try {
      const application = await this.flowService.createApplicationFromVisit(
        visitRequestId,
        user.id,
        payload.message
      )

      return response.created({
        status: 'success',
        message: 'Candidature créée avec succès',
        data: application,
      })
    } catch (error: any) {
      return response.badRequest({
        status: 'error',
        message: error.message || 'Erreur lors de la création de la candidature',
      })
    }
  }
}
