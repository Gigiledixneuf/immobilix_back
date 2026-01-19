import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'
import VisitTimeSlot from '#models/visit_time_slot'
import logger from '@adonisjs/core/services/logger'

export enum VisitRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  AUTO_CANCELLED = 'auto_cancelled', // Annulée automatiquement (pas de pré-confirmation)
  NO_SHOW = 'no_show', // Locataire absent (bailleur a confirmé mais pas le locataire)
}

export default class VisitRequest extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare propertyId: number

  @column()
  declare tenantId: string

  @column.date()
  declare requestedDate: DateTime

  @column()
  declare requestedTime: string // Format HH:mm:ss

  @column()
  declare message: string | null

  @column()
  declare status: VisitRequestStatus

  @column.dateTime({ nullable: true })
  declare scheduledAt: DateTime | null

  /**
   * ID du créneau horaire réservé par cette demande
   * NULL si la demande n'est pas encore liée à un créneau
   */
  @column()
  declare timeSlotId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * Confirmation de visite (double confirmation)
   */
  @column.dateTime({ nullable: true })
  declare completedAt: DateTime | null

  @column()
  declare completedByLandlord: boolean

  @column()
  declare completedByTenant: boolean

  /**
   * Pré-confirmation (anti-fantôme)
   */
  @column()
  declare tenantPreConfirmed: boolean

  @column.dateTime({ nullable: true })
  declare preConfirmedAt: DateTime | null

  /**
   * Notes post-visite
   */
  @column()
  declare visitNotesLandlord: string | null

  @column()
  declare visitNotesTenant: string | null

  /**
   * Délai de confirmation en heures (défaut: 48h)
   */
  @column()
  declare confirmationDeadlineHours: number

  /**
   * Initialise les valeurs par défaut
   */
  static async creating(visitRequest: VisitRequest) {
    if (!visitRequest.confirmationDeadlineHours) {
      visitRequest.confirmationDeadlineHours = 48
    }
  }

  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>

  @belongsTo(() => User, { foreignKey: 'tenantId' })
  declare tenant: BelongsTo<typeof User>

  @belongsTo(() => VisitTimeSlot, {
    foreignKey: 'timeSlotId',
  })
  declare timeSlot: BelongsTo<typeof VisitTimeSlot> | null

  /**
   * Vérifie si la visite est complétée (les deux parties ont confirmé)
   */
  isCompleted(): boolean {
    return this.status === VisitRequestStatus.COMPLETED
  }

  /**
   * Vérifie si les deux parties ont confirmé
   */
  isFullyConfirmed(): boolean {
    return this.completedByLandlord && this.completedByTenant
  }

  /**
   * Vérifie si la visite peut être confirmée (scheduled_at est passé ou égal)
   * Permet une marge de 5 minutes avant l'heure exacte pour gérer les problèmes de timezone
   */
    canBeConfirmed(): boolean {
    logger.info(`[VisitRequest.canBeConfirmed] Début vérification visite ${this.id}`)

    if (!this.scheduledAt) {
      logger.warn(`[VisitRequest.canBeConfirmed] Visit ${this.id}: scheduledAt is null`)
      return false
    }

    try {
      // scheduledAt est déjà un DateTime (AdonisJS/Lucid le gère automatiquement)
      // On ne doit PAS utiliser DateTime.fromJSDate() sur un DateTime
      // Comparer directement en UTC pour éviter les problèmes de fuseau horaire
      const scheduled = this.scheduledAt.toUTC()
      const now = DateTime.utc()

      logger.info(`[VisitRequest.canBeConfirmed] Visit ${this.id}:`, {
        scheduledAtType: typeof this.scheduledAt,
        scheduledAtIsDateTime: this.scheduledAt instanceof DateTime,
        scheduledAtISO: this.scheduledAt.toISO(),
        scheduledUTC: scheduled.toISO(),
        nowUTC: now.toISO(),
        comparison: now >= scheduled,
        diffMs: now.valueOf() - scheduled.valueOf(),
        diffMinutes: (now.valueOf() - scheduled.valueOf()) / 1000 / 60,
      })

      // Permettre la confirmation après ou à partir de scheduled_at
      const result = now >= scheduled

      if (!result) {
        logger.warn(
          `[VisitRequest.canBeConfirmed] Visit ${this.id}: Refusé - now (${now.toISO()}) < scheduled (${scheduled.toISO()})`
        )
      } else {
        logger.info(`[VisitRequest.canBeConfirmed] Visit ${this.id}: Autorisé`)
      }

      return result
    } catch (error: any) {
      logger.error(`[VisitRequest.canBeConfirmed] Visit ${this.id}: Erreur`, {
        error: error.message,
        stack: error.stack,
        scheduledAt: this.scheduledAt?.toString(),
      })
      throw error
    }
  }

  /**
   * Vérifie si le délai de confirmation est dépassé
   */
  isConfirmationDeadlinePassed(): boolean {
    if (!this.scheduledAt) {
      return false
    }
    const deadline = DateTime.fromJSDate(this.scheduledAt).plus({
      hours: this.confirmationDeadlineHours || 48,
    })
    return DateTime.now() > deadline
  }

  /**
   * Vérifie si la visite peut être pré-confirmée (12h-24h avant scheduled_at)
   */
  canBePreConfirmed(): boolean {
    if (!this.scheduledAt || this.tenantPreConfirmed) {
      return false
    }
    const scheduled = DateTime.fromJSDate(this.scheduledAt)
    const now = DateTime.now()
    const hoursUntilVisit = scheduled.diff(now, 'hours').hours

    // Entre 12h et 24h avant la visite
    return hoursUntilVisit >= 12 && hoursUntilVisit <= 24
  }

  /**
   * Vérifie si la pré-confirmation est requise (12h avant scheduled_at)
   */
  isPreConfirmationRequired(): boolean {
    if (!this.scheduledAt || this.tenantPreConfirmed) {
      return false
    }
    const scheduled = DateTime.fromJSDate(this.scheduledAt)
    const now = DateTime.now()
    const hoursUntilVisit = scheduled.diff(now, 'hours').hours

    // 12h ou moins avant la visite
    return hoursUntilVisit <= 12 && hoursUntilVisit > 0
  }
}
