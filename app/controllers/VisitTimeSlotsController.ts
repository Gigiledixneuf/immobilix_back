import type { HttpContext } from '@adonisjs/core/http'
import Property from '#models/property'
import VisitSlotService from '#services/visit_slot_service'
import { DateTime } from 'luxon'

/**
 * Contrôleur pour la gestion des créneaux horaires de visite
 * 
 * Permet aux locataires de consulter les créneaux disponibles
 * et aux bailleurs de bloquer/débloquer des créneaux.
 */
export default class VisitTimeSlotsController {
  private slotService: VisitSlotService

  constructor() {
    this.slotService = new VisitSlotService()
  }

  /**
   * GET /api/properties/:id/available-slots
   * Récupère les créneaux disponibles pour une propriété
   * 
   * Query params:
   * - start_date: Date de début (format YYYY-MM-DD, optionnel, défaut: aujourd'hui)
   * - end_date: Date de fin (format YYYY-MM-DD, optionnel, défaut: +7 jours)
   */
  async getAvailableSlots({ params, request, response }: HttpContext) {
    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    
    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    // Parser les dates de la requête
    const startDateStr = request.input('start_date')
    const endDateStr = request.input('end_date')

    const startDate = startDateStr 
      ? DateTime.fromISO(startDateStr).startOf('day')
      : DateTime.now().startOf('day')
    
    const endDate = endDateStr
      ? DateTime.fromISO(endDateStr).endOf('day')
      : DateTime.now().plus({ days: 7 }).endOf('day')

    // Vérifier que startDate <= endDate
    if (startDate > endDate) {
      return response.badRequest({ 
        message: 'La date de début doit être antérieure ou égale à la date de fin' 
      })
    }

    try {
      const slots = await this.slotService.getAvailableSlots(propertyId, startDate, endDate)

      return response.ok({
        status: 'success',
        message: 'Créneaux disponibles',
        data: slots,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des créneaux',
        error: error.message,
      })
    }
  }

  /**
   * POST /api/properties/:id/block-slot
   * Bloque un créneau manuellement (bailleur uniquement)
   */
  async blockSlot({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    
    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif et l'ownership
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour bloquer un créneau. Changez de rôle dans votre profil.',
      })
    }

    if (property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas propriétaire de ce logement" })
    }

    const slotDateStr = request.input('slot_date')
    const startTime = request.input('start_time')

    if (!slotDateStr || !startTime) {
      return response.badRequest({ 
        message: 'Les paramètres slot_date et start_time sont requis' 
      })
    }

    try {
      const slotDate = DateTime.fromISO(slotDateStr).startOf('day')
      const slot = await this.slotService.blockSlot(propertyId, slotDate, startTime)

      return response.ok({
        status: 'success',
        message: 'Créneau bloqué avec succès',
        data: slot,
      })
    } catch (error: any) {
      return response.badRequest({
        status: 'error',
        message: error.message || 'Erreur lors du blocage du créneau',
      })
    }
  }

  /**
   * DELETE /api/time-slots/:id/block
   * Débloque un créneau (bailleur uniquement)
   */
  async unblockSlot({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const slotId = Number(params.id)
    const { default: VisitTimeSlot } = await import('#models/visit_time_slot')
    
    const slot = await VisitTimeSlot.find(slotId)
    if (!slot) {
      return response.notFound({ message: 'Créneau introuvable' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif et l'ownership
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour débloquer un créneau. Changez de rôle dans votre profil.',
      })
    }

    await slot.load('property')
    if (slot.property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à débloquer ce créneau" })
    }

    try {
      await this.slotService.unblockSlot(slotId)

      return response.ok({
        status: 'success',
        message: 'Créneau débloqué avec succès',
      })
    } catch (error: any) {
      return response.badRequest({
        status: 'error',
        message: error.message || 'Erreur lors du déblocage du créneau',
      })
    }
  }
}
