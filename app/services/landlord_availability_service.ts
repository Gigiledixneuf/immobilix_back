import LandlordAvailability from '#models/landlord_availability'
import logger from '@adonisjs/core/services/logger'
import VisitSlotService from './visit_slot_service.js'

/**
 * Service de gestion des disponibilités du bailleur
 * 
 * Responsabilités :
 * - Créer/mettre à jour les disponibilités d'un bailleur
 * - Désactiver automatiquement les anciennes disponibilités
 * - Générer les créneaux après modification des disponibilités
 */
export default class LandlordAvailabilityService {
  private visitSlotService: VisitSlotService

  constructor() {
    this.visitSlotService = new VisitSlotService()
  }

  /**
   * Crée ou met à jour la disponibilité d'un bailleur
   * Si une disponibilité active existe déjà, elle est désactivée
   * 
   * @param landlordId ID du bailleur
   * @param availableDays Jours disponibles (ex: ["monday", "tuesday", ...])
   * @param startTime Heure de début (format HH:mm)
   * @param endTime Heure de fin (format HH:mm)
   * @param visitDurationMinutes Durée d'une visite en minutes
   * @returns La nouvelle disponibilité créée
   */
  async createOrUpdateAvailability(
    landlordId: number,
    availableDays: string[],
    startTime: string,
    endTime: string,
    visitDurationMinutes: number = 30
  ): Promise<LandlordAvailability> {
    const db = await import('@adonisjs/lucid/services/db')

    return await db.default.transaction(async (trx) => {
      // Désactiver toutes les disponibilités actives existantes
      await LandlordAvailability.query({ client: trx })
        .where('landlord_id', landlordId)
        .where('is_active', true)
        .update({ is_active: false })

      // Créer la nouvelle disponibilité
      const availability = await LandlordAvailability.create(
        {
          landlordId,
          availableDays,
          startTime,
          endTime,
          visitDurationMinutes,
          isActive: true,
        },
        { client: trx }
      )

      logger.info(`Availability created/updated for landlord ${landlordId}`)

      return availability
    })
  }

  /**
   * Récupère la disponibilité active d'un bailleur
   * 
   * @param landlordId ID du bailleur
   * @returns La disponibilité active ou null
   */
  async getActiveAvailability(landlordId: number): Promise<LandlordAvailability | null> {
    return await LandlordAvailability.query()
      .where('landlord_id', landlordId)
      .where('is_active', true)
      .first()
  }

  /**
   * Génère les créneaux pour toutes les propriétés d'un bailleur
   * Utile après modification des disponibilités
   * 
   * @param landlordId ID du bailleur
   * @param daysAhead Nombre de jours à générer à partir d'aujourd'hui (par défaut: 30)
   */
  async generateSlotsForAllProperties(landlordId: number, daysAhead: number = 30): Promise<void> {
    const { DateTime } = await import('luxon')
    const Property = (await import('#models/property')).default

    // Récupérer toutes les propriétés du bailleur
    const properties = await Property.query().where('user_id', landlordId)

    const startDate = DateTime.now().startOf('day')
    const endDate = startDate.plus({ days: daysAhead })

    // Générer les créneaux pour chaque propriété
    for (const property of properties) {
      try {
        await this.visitSlotService.generateTimeSlots(property.id, startDate, endDate, true)
      } catch (error: any) {
        logger.error(`Error generating slots for property ${property.id}:`, error)
        // Continue avec les autres propriétés même en cas d'erreur
      }
    }

    logger.info(`Generated slots for ${properties.length} properties of landlord ${landlordId}`)
  }
}


