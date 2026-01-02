import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import VisitRequest from '#models/visit_request'

/**
 * Énumération des statuts de créneau horaire
 */
export enum VisitTimeSlotStatus {
  AVAILABLE = 'available',
  RESERVED = 'reserved',
  BLOCKED = 'blocked',
}

/**
 * Modèle VisitTimeSlot
 * 
 * Représente un créneau horaire généré automatiquement basé sur les disponibilités du bailleur.
 * Un créneau peut être disponible, réservé (lié à une demande acceptée) ou bloqué manuellement.
 */
export default class VisitTimeSlot extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare propertyId: number

  /**
   * Date du créneau (YYYY-MM-DD)
   */
  @column.date()
  declare slotDate: DateTime

  /**
   * Heure de début du créneau (format HH:mm)
   * Exemple: "09:00"
   */
  @column()
  declare startTime: string

  /**
   * Heure de fin du créneau (format HH:mm)
   * Exemple: "09:30"
   * Calculée automatiquement selon la durée de visite configurée
   */
  @column()
  declare endTime: string

  /**
   * Statut du créneau
   * - available: créneau libre, peut être réservé
   * - reserved: créneau réservé par une demande acceptée
   * - blocked: créneau bloqué manuellement par le bailleur
   */
  @column()
  declare status: VisitTimeSlotStatus

  /**
   * ID de la demande de visite qui a réservé ce créneau
   * NULL si le créneau est disponible ou bloqué
   */
  @column()
  declare visitRequestId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>

  @belongsTo(() => VisitRequest, {
    foreignKey: 'visitRequestId',
  })
  declare visitRequest: BelongsTo<typeof VisitRequest> | null

  /**
   * Vérifie si le créneau est disponible pour réservation
   */
  isAvailable(): boolean {
    return this.status === VisitTimeSlotStatus.AVAILABLE
  }

  /**
   * Vérifie si le créneau est réservé
   */
  isReserved(): boolean {
    return this.status === VisitTimeSlotStatus.RESERVED
  }

  /**
   * Vérifie si le créneau est bloqué
   */
  isBlocked(): boolean {
    return this.status === VisitTimeSlotStatus.BLOCKED
  }

  /**
   * Retourne le créneau au format lisible
   * Exemple: "09:00 - 09:30"
   */
  getFormattedTimeSlot(): string {
    return `${this.startTime} - ${this.endTime}`
  }
}

