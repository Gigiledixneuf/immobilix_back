import { DateTime } from 'luxon'
import VisitRequest, { VisitRequestStatus } from '#models/visit_request'
import Application, { ApplicationStatus } from '#models/application'
import Contract from '#models/contract'
import User from '#models/user'
import VisitSlotService from './visit_slot_service.js'
import NotificationsService from './notifications_service.js'
import logger from '@adonisjs/core/services/logger'

/**
 * Service métier centralisé pour la gestion du flux de visite
 * 
 * Responsabilités :
 * - Confirmer une visite (double confirmation)
 * - Détecter et gérer les no-show
 * - Gérer la pré-confirmation (anti-fantôme)
 * - Créer des candidatures depuis des visites
 * - Mettre à jour les scores de fiabilité
 */
export default class VisitFlowService {
  private slotService: VisitSlotService
  private notifier: NotificationsService

  constructor() {
    this.slotService = new VisitSlotService()
    this.notifier = new NotificationsService()
  }

  /**
   * Confirme une visite (double confirmation)
   * 
   * Règles métier :
   * - Une visite ne peut être confirmée que si :
   *   1. Elle est accepted
   *   2. scheduled_at est passé
   *   3. Le délai max de confirmation n'est pas dépassé
   * - Les deux parties doivent confirmer pour passer en "completed"
   * - Si seulement le bailleur confirme et délai dépassé → "no_show"
   * 
   * @param visitRequestId ID de la demande de visite
   * @param userId ID de l'utilisateur qui confirme
   * @param confirmedBy 'landlord' | 'tenant'
   * @param notes Notes optionnelles
   */
  async confirmVisit(
    visitRequestId: number,
    userId: number,
    confirmedBy: 'landlord' | 'tenant',
    notes?: string
  ): Promise<VisitRequest> {
    const visitRequest = await VisitRequest.query()
      .where('id', visitRequestId)
      .preload('property')
      .preload('tenant')
      .first()

    if (!visitRequest) {
      throw new Error('Demande de visite introuvable')
    }

    // Vérifier que la demande est acceptée
    if (visitRequest.status !== VisitRequestStatus.ACCEPTED) {
      throw new Error(
        `Seules les visites acceptées peuvent être confirmées. Statut actuel : ${visitRequest.status}`
      )
    }

    // Vérifier que scheduled_at est défini et passé
    if (!visitRequest.scheduledAt) {
      throw new Error('La visite doit avoir une date/heure confirmée (scheduled_at)')
    }

    if (!visitRequest.canBeConfirmed()) {
      throw new Error(
        'La visite ne peut être confirmée qu\'après la date/heure prévue (scheduled_at)'
      )
    }

    // Vérifier le délai de confirmation
    if (visitRequest.isConfirmationDeadlinePassed()) {
      throw new Error(
        `Le délai de confirmation (${visitRequest.confirmationDeadlineHours}h) est dépassé. Impossible de confirmer.`
      )
    }

    // Vérifier les permissions
    const isLandlord = visitRequest.property.user_id === userId
    const isTenant = visitRequest.tenantId === userId

    if (confirmedBy === 'landlord' && !isLandlord) {
      throw new Error('Seul le bailleur peut confirmer en tant que bailleur')
    }
    if (confirmedBy === 'tenant' && !isTenant) {
      throw new Error('Seul le locataire peut confirmer en tant que locataire')
    }

    // Mettre à jour les champs de confirmation
    if (confirmedBy === 'landlord') {
      if (visitRequest.completedByLandlord) {
        throw new Error('Le bailleur a déjà confirmé cette visite')
      }
      visitRequest.completedByLandlord = true
      if (notes) {
        visitRequest.visitNotesLandlord = notes
      }
    } else {
      if (visitRequest.completedByTenant) {
        throw new Error('Le locataire a déjà confirmé cette visite')
      }
      visitRequest.completedByTenant = true
      if (notes) {
        visitRequest.visitNotesTenant = notes
      }
    }

    // Vérifier si les deux parties ont confirmé
    const bothConfirmed = visitRequest.completedByLandlord && visitRequest.completedByTenant

    if (bothConfirmed) {
      // Marquer comme complétée
      visitRequest.status = VisitRequestStatus.COMPLETED
      visitRequest.completedAt = DateTime.now()

      // Mettre à jour les scores de fiabilité
      await this.updateReliabilityScores(visitRequest, 'completed')

      // Notification aux deux parties
      await this.notifier.notifyUser(
        visitRequest.property.user_id,
        'Visite complétée',
        'La visite a été confirmée par les deux parties.',
        'visit_completed',
        { visitRequestId: visitRequest.id, propertyId: visitRequest.propertyId }
      )

      await this.notifier.notifyUser(
        visitRequest.tenantId,
        'Visite complétée',
        'La visite a été confirmée par les deux parties.',
        'visit_completed',
        { visitRequestId: visitRequest.id, propertyId: visitRequest.propertyId }
      )

      logger.info(`Visit ${visitRequestId} marked as completed by both parties`)
    } else {
      // Notification à l'autre partie
      const otherPartyId = confirmedBy === 'landlord' ? visitRequest.tenantId : visitRequest.property.user_id
      await this.notifier.notifyUser(
        otherPartyId,
        'Confirmation de visite',
        confirmedBy === 'landlord'
          ? 'Le bailleur a confirmé que la visite a eu lieu. Merci de confirmer également.'
          : 'Le locataire a confirmé que la visite a eu lieu. Merci de confirmer également.',
        'visit_confirmation',
        { visitRequestId: visitRequest.id, propertyId: visitRequest.propertyId }
      )
    }

    await visitRequest.save()
    return visitRequest
  }

  /**
   * Pré-confirme une visite (anti-fantôme)
   * 
   * Règles métier :
   * - Peut être fait entre 12h et 24h avant scheduled_at
   * - Seul le locataire peut pré-confirmer
   * - Empêche l'auto-cancellation
   * 
   * @param visitRequestId ID de la demande de visite
   * @param userId ID du locataire
   */
  async preConfirmVisit(visitRequestId: number, userId: number): Promise<VisitRequest> {
    const visitRequest = await VisitRequest.query()
      .where('id', visitRequestId)
      .preload('property')
      .first()

    if (!visitRequest) {
      throw new Error('Demande de visite introuvable')
    }

    // Vérifier que l'utilisateur est le locataire
    if (visitRequest.tenantId !== userId) {
      throw new Error('Seul le locataire peut pré-confirmer sa présence')
    }

    // Vérifier que la visite est acceptée
    if (visitRequest.status !== VisitRequestStatus.ACCEPTED) {
      throw new Error('Seules les visites acceptées peuvent être pré-confirmées')
    }

    // Vérifier que la pré-confirmation est possible (12h-24h avant)
    if (!visitRequest.canBePreConfirmed()) {
      throw new Error(
        'La pré-confirmation n\'est possible que entre 12h et 24h avant la visite prévue'
      )
    }

    // Marquer comme pré-confirmée
    visitRequest.tenantPreConfirmed = true
    visitRequest.preConfirmedAt = DateTime.now()

    await visitRequest.save()

    // Notification au bailleur
    await this.notifier.notifyUser(
      visitRequest.property.user_id,
      'Pré-confirmation de visite',
      'Le locataire a confirmé sa présence pour la visite.',
      'visit_pre_confirmed',
      { visitRequestId: visitRequest.id, propertyId: visitRequest.propertyId }
    )

    logger.info(`Visit ${visitRequestId} pre-confirmed by tenant ${userId}`)
    return visitRequest
  }

  /**
   * Vérifie et détecte les no-show
   * 
   * Règles métier :
   * - Si bailleur a confirmé mais locataire n'a pas confirmé
   * - Et délai de confirmation dépassé
   * - → Statut "no_show"
   * 
   * @param visitRequestId ID de la demande de visite
   */
  async detectNoShow(visitRequestId: number): Promise<VisitRequest | null> {
    const visitRequest = await VisitRequest.query()
      .where('id', visitRequestId)
      .preload('tenant')
      .first()

    if (!visitRequest) {
      return null
    }

    // Vérifier les conditions de no-show
    if (
      visitRequest.status !== VisitRequestStatus.ACCEPTED ||
      !visitRequest.scheduledAt ||
      !visitRequest.completedByLandlord ||
      visitRequest.completedByTenant ||
      !visitRequest.isConfirmationDeadlinePassed()
    ) {
      return null
    }

    // Marquer comme no-show
    visitRequest.status = VisitRequestStatus.NO_SHOW

    // Mettre à jour le score de fiabilité
    await this.updateReliabilityScores(visitRequest, 'no_show')

    await visitRequest.save()

    // Notification au bailleur
    await this.notifier.notifyUser(
      visitRequest.property.user_id,
      'Visite non effectuée (no-show)',
      `Le locataire n'a pas confirmé la visite. La demande a été marquée comme no-show.`,
      'visit_no_show',
      { visitRequestId: visitRequest.id, propertyId: visitRequest.propertyId }
    )

    logger.info(`Visit ${visitRequestId} marked as no-show`)
    return visitRequest
  }

  /**
   * Auto-annule une visite si pas de pré-confirmation
   * 
   * Règles métier :
   * - Si pas de pré-confirmation 12h avant scheduled_at
   * - → Statut "auto_cancelled"
   * - → Libérer le créneau
   * 
   * @param visitRequestId ID de la demande de visite
   */
  async autoCancelIfNoPreConfirmation(visitRequestId: number): Promise<VisitRequest | null> {
    const visitRequest = await VisitRequest.query()
      .where('id', visitRequestId)
      .preload('property')
      .preload('tenant')
      .first()

    if (!visitRequest) {
      return null
    }

    // Vérifier les conditions
    if (
      visitRequest.status !== VisitRequestStatus.ACCEPTED ||
      !visitRequest.scheduledAt ||
      visitRequest.tenantPreConfirmed ||
      !visitRequest.isPreConfirmationRequired()
    ) {
      return null
    }

    // Auto-annuler
    visitRequest.status = VisitRequestStatus.AUTO_CANCELLED

    // Libérer le créneau
    if (visitRequest.timeSlotId) {
      try {
        await this.slotService.releaseSlot(visitRequest.timeSlotId)
      } catch (error: any) {
        logger.warn(`Error releasing slot for auto-cancelled visit ${visitRequestId}: ${error.message}`)
      }
    }

    await visitRequest.save()

    // Mettre à jour le score de fiabilité
    await this.updateReliabilityScores(visitRequest, 'auto_cancelled')

    // Notification au bailleur
    await this.notifier.notifyUser(
      visitRequest.property.user_id,
      'Visite annulée automatiquement',
      'La visite a été annulée automatiquement car le locataire n\'a pas confirmé sa présence.',
      'visit_auto_cancelled',
      { visitRequestId: visitRequest.id, propertyId: visitRequest.propertyId }
    )

    // Notification au locataire
    await this.notifier.notifyUser(
      visitRequest.tenantId,
      'Visite annulée automatiquement',
      'Votre visite a été annulée automatiquement car vous n\'avez pas confirmé votre présence à temps.',
      'visit_auto_cancelled',
      { visitRequestId: visitRequest.id, propertyId: visitRequest.propertyId }
    )

    logger.info(`Visit ${visitRequestId} auto-cancelled (no pre-confirmation)`)
    return visitRequest
  }

  /**
   * Crée une candidature depuis une visite complétée
   * 
   * Règles métier :
   * - La visite doit être complétée
   * - Une seule candidature active par visite
   * - Créée par le bailleur
   * 
   * @param visitRequestId ID de la demande de visite
   * @param landlordId ID du bailleur
   * @param message Message optionnel pour la candidature
   */
  async createApplicationFromVisit(
    visitRequestId: number,
    landlordId: number,
    message?: string
  ): Promise<Application> {
    const visitRequest = await VisitRequest.query()
      .where('id', visitRequestId)
      .preload('property')
      .first()

    if (!visitRequest) {
      throw new Error('Demande de visite introuvable')
    }

    // Vérifier que l'utilisateur est le bailleur
    if (visitRequest.property.user_id !== landlordId) {
      throw new Error('Seul le bailleur peut créer une candidature depuis une visite')
    }

    // Vérifier que la visite est complétée
    if (visitRequest.status !== VisitRequestStatus.COMPLETED) {
      throw new Error(
        `Seules les visites complétées peuvent donner lieu à une candidature. Statut actuel : ${visitRequest.status}`
      )
    }

    // Vérifier qu'il n'y a pas déjà une candidature active
    const existing = await Application.query()
      .where('property_id', visitRequest.propertyId)
      .where('tenant_id', visitRequest.tenantId)
      .where('visit_request_id', visitRequestId)
      .whereIn('status', [ApplicationStatus.PENDING, ApplicationStatus.ACCEPTED])
      .first()

    if (existing) {
      throw new Error('Une candidature active existe déjà pour cette visite')
    }

    // Créer la candidature
    const application = await Application.create({
      propertyId: visitRequest.propertyId,
      tenantId: visitRequest.tenantId,
      visitRequestId: visitRequest.id,
      message:
        message ||
        `Candidature suite à la visite du ${visitRequest.scheduledAt?.toLocaleString({ locale: 'fr' })}`,
      status: ApplicationStatus.PENDING,
    })

    // Notification au locataire
    await this.notifier.notifyUser(
      visitRequest.tenantId,
      'Nouvelle candidature',
      `Le bailleur a créé une candidature suite à votre visite du ${visitRequest.scheduledAt?.toLocaleString({ locale: 'fr' })}`,
      'application',
      { applicationId: application.id, propertyId: visitRequest.propertyId }
    )

    logger.info(`Application ${application.id} created from visit ${visitRequestId}`)
    return application
  }

  /**
   * Met à jour les scores de fiabilité
   * 
   * Scores :
   * - +10 : visite complétée
   * - -20 : no-show
   * - -5 : auto-cancelled (annulation tardive)
   * 
   * @param visitRequest Demande de visite
   * @param reason Raison du changement de score
   */
  private async updateReliabilityScores(
    visitRequest: VisitRequest,
    reason: 'completed' | 'no_show' | 'auto_cancelled'
  ): Promise<void> {
    const tenant = await User.find(visitRequest.tenantId)
    if (!tenant) {
      return
    }

    let scoreChange = 0
    switch (reason) {
      case 'completed':
        scoreChange = 10
        break
      case 'no_show':
        scoreChange = -20
        break
      case 'auto_cancelled':
        scoreChange = -5
        break
    }

    tenant.reliabilityScore = (tenant.reliabilityScore || 0) + scoreChange
    await tenant.save()

    logger.info(
      `Reliability score updated for tenant ${tenant.id}: ${scoreChange} (new score: ${tenant.reliabilityScore}, reason: ${reason})`
    )
  }

  /**
   * Vérifie et traite toutes les visites qui nécessitent une action automatique
   * À exécuter périodiquement (cron job)
   * 
   * Actions :
   * - Détecter les no-show
   * - Auto-annuler les visites sans pré-confirmation
   */
  async processAutomaticActions(): Promise<{ noShows: number; autoCancelled: number }> {
    const results = { noShows: 0, autoCancelled: 0 }

    // Récupérer toutes les visites acceptées avec scheduled_at passé
    const acceptedVisits = await VisitRequest.query()
      .where('status', VisitRequestStatus.ACCEPTED)
      .whereNotNull('scheduled_at')
      .where('scheduled_at', '<', DateTime.now().toJSDate())

    for (const visit of acceptedVisits) {
      // Détecter no-show
      try {
        const noShowResult = await this.detectNoShow(visit.id)
        if (noShowResult) {
          results.noShows++
        }
      } catch (error: any) {
        logger.error(`Error detecting no-show for visit ${visit.id}: ${error.message}`)
      }

      // Auto-annuler si pas de pré-confirmation
      try {
        const autoCancelResult = await this.autoCancelIfNoPreConfirmation(visit.id)
        if (autoCancelResult) {
          results.autoCancelled++
        }
      } catch (error: any) {
        logger.error(`Error auto-cancelling visit ${visit.id}: ${error.message}`)
      }
    }

    logger.info(
      `Automatic actions processed: ${results.noShows} no-shows, ${results.autoCancelled} auto-cancelled`
    )
    return results
  }
}
