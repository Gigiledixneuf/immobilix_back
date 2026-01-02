import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

/**
 * Modèle LandlordAvailability
 * 
 * Représente les disponibilités configurées par un bailleur pour recevoir des visites.
 * Un bailleur peut configurer ses jours et heures de travail, ainsi que la durée standard d'une visite.
 */
export default class LandlordAvailability extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare landlordId: number

  /**
   * Jours de disponibilité (JSON array)
   * Format: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
   */
  @column({
    prepare: (value: string[]) => JSON.stringify(value),
    consume: (value: string | string[]) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch {
          return []
        }
      }
      return value
    },
  })
  declare availableDays: string[]

  /**
   * Heure de début de disponibilité (format HH:mm)
   * Exemple: "08:00"
   */
  @column()
  declare startTime: string

  /**
   * Heure de fin de disponibilité (format HH:mm)
   * Exemple: "17:00"
   */
  @column()
  declare endTime: string

  /**
   * Durée standard d'une visite en minutes
   * Exemple: 30, 45, 60
   */
  @column()
  declare visitDurationMinutes: number

  /**
   * Indicateur si cette configuration est active
   * Seule une configuration active par bailleur est utilisée pour générer les créneaux
   */
  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, {
    foreignKey: 'landlordId',
  })
  declare landlord: BelongsTo<typeof User>

  /**
   * Vérifie si un jour donné est disponible
   */
  isDayAvailable(dayName: string): boolean {
    return this.availableDays.includes(dayName.toLowerCase())
  }

  /**
   * Retourne les jours disponibles formatés
   */
  getFormattedDays(): string[] {
    const dayMap: Record<string, string> = {
      monday: 'Lundi',
      tuesday: 'Mardi',
      wednesday: 'Mercredi',
      thursday: 'Jeudi',
      friday: 'Vendredi',
      saturday: 'Samedi',
      sunday: 'Dimanche',
    }
    return this.availableDays.map((day) => dayMap[day.toLowerCase()] || day)
  }
}

