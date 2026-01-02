import { DateTime } from 'luxon'
import Property from '#models/property'
import LandlordAvailability from '#models/landlord_availability'
import VisitTimeSlot, { VisitTimeSlotStatus } from '#models/visit_time_slot'
import logger from '@adonisjs/core/services/logger'

/**
 * Service de gestion des créneaux horaires pour les visites
 * 
 * Responsabilités :
 * - Génération automatique des créneaux basés sur les disponibilités du bailleur
 * - Gestion des conflits (empêche les doubles réservations)
 * - Blocage/déblocage de créneaux
 * - Vérification de disponibilité en temps réel
 */
export default class VisitSlotService {
  /**
   * Génère les créneaux horaires disponibles pour une propriété sur une période donnée
   * 
   * @param propertyId ID de la propriété
   * @param startDate Date de début (inclusive)
   * @param endDate Date de fin (inclusive)
   * @param regenerate Si true, régénère même les créneaux existants (pour mise à jour)
   * @returns Nombre de créneaux générés
   */
  async generateTimeSlots(
    propertyId: number,
    startDate: DateTime,
    endDate: DateTime,
    regenerate: boolean = false
  ): Promise<number> {
    try {
      // Récupérer la propriété et son propriétaire
      const property = await Property.find(propertyId)
      if (!property) {
        throw new Error(`Property ${propertyId} not found`)
      }

      // Récupérer la disponibilité active du bailleur
      const availability = await LandlordAvailability.query()
        .where('landlord_id', property.user_id)
        .where('is_active', true)
        .first()

      if (!availability) {
        logger.warn(`No active availability found for landlord ${property.user_id}`)
        return 0
      }

      let generatedCount = 0
      const slotsToCreate: Partial<VisitTimeSlot>[] = []

      // Parcourir chaque jour de la période
      let currentDate = startDate.startOf('day')
      const end = endDate.endOf('day')

      while (currentDate <= end) {
        // Obtenir le nom du jour (ex: "monday", "tuesday")
        const dayName = currentDate.toFormat('cccc').toLowerCase() // "monday", "tuesday", etc.

        // Vérifier si ce jour est disponible
        if (!availability.isDayAvailable(dayName)) {
          currentDate = currentDate.plus({ days: 1 })
          continue
        }

        // Générer les créneaux pour ce jour
        const daySlots = this.generateSlotsForDay(
          currentDate,
          availability.startTime,
          availability.endTime,
          availability.visitDurationMinutes
        )

        // Pour chaque créneau, vérifier s'il existe déjà
        for (const slot of daySlots) {
          const existingSlot = await VisitTimeSlot.query()
            .where('property_id', propertyId)
            .where('slot_date', slot.slotDate.toSQLDate()!)
            .where('start_time', slot.startTime)
            .first()

          if (existingSlot) {
            // Si on régénère, mettre à jour le statut si nécessaire
            if (regenerate && existingSlot.status === VisitTimeSlotStatus.AVAILABLE) {
              // Ne pas toucher aux créneaux réservés ou bloqués
              continue
            }
            continue // Créneau déjà existant, on passe
          }

          // Ajouter le créneau à créer
          slotsToCreate.push({
            propertyId,
            slotDate: slot.slotDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: VisitTimeSlotStatus.AVAILABLE,
            visitRequestId: null,
          })
          generatedCount++
        }

        currentDate = currentDate.plus({ days: 1 })
      }

      // Créer tous les créneaux en batch
      if (slotsToCreate.length > 0) {
        await VisitTimeSlot.createMany(slotsToCreate)
        logger.info(`Generated ${slotsToCreate.length} time slots for property ${propertyId}`)
      }

      return generatedCount
    } catch (error: any) {
      logger.error('Error generating time slots:', error)
      throw error
    }
  }

  /**
   * Génère les créneaux pour un jour donné
   * 
   * @param date Date du jour
   * @param startTime Heure de début (format HH:mm)
   * @param endTime Heure de fin (format HH:mm)
   * @param durationMinutes Durée d'un créneau en minutes
   * @returns Liste des créneaux pour ce jour
   */
  private generateSlotsForDay(
    date: DateTime,
    startTime: string,
    endTime: string,
    durationMinutes: number
  ): Array<{ slotDate: DateTime; startTime: string; endTime: string }> {
    const slots: Array<{ slotDate: DateTime; startTime: string; endTime: string }> = []

    // Parser les heures
    const [startHour, startMinute] = startTime.split(':').map(Number)
    const [endHour, endMinute] = endTime.split(':').map(Number)

    let currentHour = startHour
    let currentMinute = startMinute

    // Générer les créneaux jusqu'à l'heure de fin
    while (true) {
      // Calculer l'heure de début du créneau
      const slotStartTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`

      // Calculer l'heure de fin du créneau
      const slotEndDateTime = DateTime.fromObject({
        year: date.year,
        month: date.month,
        day: date.day,
        hour: currentHour,
        minute: currentMinute,
      }).plus({ minutes: durationMinutes })

      const slotEndTime = `${String(slotEndDateTime.hour).padStart(2, '0')}:${String(slotEndDateTime.minute).padStart(2, '0')}`

      // Vérifier si le créneau dépasse l'heure de fin
      if (slotEndDateTime.hour > endHour || (slotEndDateTime.hour === endHour && slotEndDateTime.minute > endMinute)) {
        break
      }

      slots.push({
        slotDate: date.startOf('day'),
        startTime: slotStartTime,
        endTime: slotEndTime,
      })

      // Passer au créneau suivant
      currentMinute += durationMinutes
      if (currentMinute >= 60) {
        currentHour += Math.floor(currentMinute / 60)
        currentMinute = currentMinute % 60
      }

      // Vérifier si on a dépassé l'heure de fin
      if (currentHour > endHour || (currentHour === endHour && currentMinute > endMinute)) {
        break
      }
    }

    return slots
  }

  /**
   * Récupère les créneaux disponibles pour une propriété sur une période
   * 
   * @param propertyId ID de la propriété
   * @param startDate Date de début (inclusive)
   * @param endDate Date de fin (inclusive)
   * @returns Liste des créneaux disponibles
   */
  async getAvailableSlots(
    propertyId: number,
    startDate: DateTime,
    endDate: DateTime
  ): Promise<VisitTimeSlot[]> {
    // S'assurer que les créneaux sont générés pour cette période
    await this.generateTimeSlots(propertyId, startDate, endDate)

    // Récupérer les créneaux disponibles
    const slots = await VisitTimeSlot.query()
      .where('property_id', propertyId)
      .where('slot_date', '>=', startDate.toSQLDate()!)
      .where('slot_date', '<=', endDate.toSQLDate()!)
      .where('status', VisitTimeSlotStatus.AVAILABLE)
      .orderBy('slot_date', 'asc')
      .orderBy('start_time', 'asc')

    return slots
  }

  /**
   * Récupère les créneaux disponibles pour une date spécifique
   * 
   * @param propertyId ID de la propriété
   * @param date Date spécifique
   * @returns Liste des créneaux disponibles pour ce jour
   */
  async getAvailableSlotsForDate(propertyId: number, date: DateTime): Promise<VisitTimeSlot[]> {
    return this.getAvailableSlots(propertyId, date.startOf('day'), date.endOf('day'))
  }

  /**
   * Réserve un créneau pour une demande de visite
   * Vérifie la disponibilité et bloque le créneau pour éviter les conflits
   * 
   * @param propertyId ID de la propriété
   * @param slotDate Date du créneau
   * @param startTime Heure de début (format HH:mm)
   * @param visitRequestId ID de la demande de visite
   * @returns Le créneau réservé
   * @throws Error si le créneau n'est pas disponible
   */
  async reserveSlot(
    propertyId: number,
    slotDate: DateTime,
    startTime: string,
    visitRequestId: number
  ): Promise<VisitTimeSlot> {
    // Utiliser une transaction pour éviter les conditions de course
    const db = await import('@adonisjs/lucid/services/db')
    
    return await db.default.transaction(async (trx) => {
      // Chercher le créneau
      const slot = await VisitTimeSlot.query({ client: trx })
        .where('property_id', propertyId)
        .where('slot_date', slotDate.toSQLDate()!)
        .where('start_time', startTime)
        .first()

      if (!slot) {
        throw new Error(`Time slot not found for property ${propertyId} on ${slotDate.toSQLDate()} at ${startTime}`)
      }

      // Vérifier que le créneau est disponible
      if (!slot.isAvailable()) {
        throw new Error(`Time slot is not available (status: ${slot.status})`)
      }

      // Réserver le créneau
      slot.status = VisitTimeSlotStatus.RESERVED
      slot.visitRequestId = visitRequestId
      await slot.useTransaction(trx).save()

      logger.info(`Time slot ${slot.id} reserved for visit request ${visitRequestId}`)

      return slot
    })
  }

  /**
   * Libère un créneau (lorsqu'une demande est annulée ou refusée)
   * 
   * @param slotId ID du créneau à libérer
   */
  async releaseSlot(slotId: number): Promise<void> {
    const slot = await VisitTimeSlot.find(slotId)
    if (!slot) {
      throw new Error(`Time slot ${slotId} not found`)
    }

    slot.status = VisitTimeSlotStatus.AVAILABLE
    slot.visitRequestId = null
    await slot.save()

    logger.info(`Time slot ${slotId} released`)
  }

  /**
   * Bloque un créneau manuellement (par le bailleur)
   * 
   * @param propertyId ID de la propriété
   * @param slotDate Date du créneau
   * @param startTime Heure de début (format HH:mm)
   */
  async blockSlot(propertyId: number, slotDate: DateTime, startTime: string): Promise<VisitTimeSlot> {
    // S'assurer que le créneau existe
    await this.generateTimeSlots(propertyId, slotDate.startOf('day'), slotDate.endOf('day'))

    const slot = await VisitTimeSlot.query()
      .where('property_id', propertyId)
      .where('slot_date', slotDate.toSQLDate()!)
      .where('start_time', startTime)
      .first()

    if (!slot) {
      throw new Error(`Time slot not found`)
    }

    if (slot.status === VisitTimeSlotStatus.RESERVED) {
      throw new Error('Cannot block a reserved slot')
    }

    slot.status = VisitTimeSlotStatus.BLOCKED
    await slot.save()

    logger.info(`Time slot ${slot.id} blocked by landlord`)
    return slot
  }

  /**
   * Débloque un créneau (le rend disponible)
   * 
   * @param slotId ID du créneau à débloquer
   */
  async unblockSlot(slotId: number): Promise<void> {
    const slot = await VisitTimeSlot.find(slotId)
    if (!slot) {
      throw new Error(`Time slot ${slotId} not found`)
    }

    if (slot.status !== VisitTimeSlotStatus.BLOCKED) {
      throw new Error('Slot is not blocked')
    }

    slot.status = VisitTimeSlotStatus.AVAILABLE
    await slot.save()

    logger.info(`Time slot ${slotId} unblocked`)
  }

  /**
   * Trouve ou crée un créneau correspondant à une date/heure donnée
   * Utile pour la compatibilité avec l'ancien système
   * 
   * @param propertyId ID de la propriété
   * @param slotDate Date du créneau
   * @param startTime Heure de début (format HH:mm)
   * @returns Le créneau trouvé ou créé
   */
  async findOrCreateSlot(
    propertyId: number,
    slotDate: DateTime,
    startTime: string
  ): Promise<VisitTimeSlot> {
    // Chercher le créneau existant
    let slot = await VisitTimeSlot.query()
      .where('property_id', propertyId)
      .where('slot_date', slotDate.toSQLDate()!)
      .where('start_time', startTime)
      .first()

    if (slot) {
      return slot
    }

    // Si le créneau n'existe pas, générer les créneaux pour cette date
    await this.generateTimeSlots(propertyId, slotDate.startOf('day'), slotDate.endOf('day'))

    // Chercher à nouveau
    slot = await VisitTimeSlot.query()
      .where('property_id', propertyId)
      .where('slot_date', slotDate.toSQLDate()!)
      .where('start_time', startTime)
      .first()

    if (!slot) {
      // Si toujours pas trouvé, c'est que l'heure demandée est hors disponibilité
      // Dans ce cas, on ne peut pas créer de créneau
      throw new Error(`Time slot ${startTime} is not within available hours`)
    }

    return slot
  }
}
