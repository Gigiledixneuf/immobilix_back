import { DateTime } from 'luxon'
import User from '#models/user'
import logger from '@adonisjs/core/services/logger'

/**
 * Service de gestion des scores de fiabilité des utilisateurs
 * 
 * Permet de tracker la fiabilité des locataires basée sur leur comportement :
 * - Visites complétées : +10 points
 * - No-show : -20 points
 * - Annulation tardive : -5 points
 */
export default class ReliabilityScoreService {
  /**
   * Points attribués selon les actions
   */
  private static readonly SCORES = {
    VISIT_COMPLETED: 10,
    NO_SHOW: -20,
    LATE_CANCELLATION: -5,
    PRE_CONFIRMED: 2, // Bonus pour pré-confirmation
  }

  /**
   * Incrémente le score de fiabilité d'un utilisateur
   * 
   * @param userId ID de l'utilisateur
   * @param points Nombre de points à ajouter (positif ou négatif)
   */
  async updateScore(userId: string, points: number): Promise<void> {
    try {
      const user = await User.find(userId)
      if (!user) {
        logger.warn(`User ${userId} not found when updating reliability score`)
        return
      }

      const currentScore = user.reliabilityScore || 0
      const newScore = Math.max(0, currentScore + points) // Score minimum: 0

      user.reliabilityScore = newScore
      await user.save()

      logger.info(`Reliability score updated for user ${userId}: ${currentScore} → ${newScore} (+${points})`)
    } catch (error: any) {
      logger.error(`Error updating reliability score for user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Ajoute des points pour une visite complétée
   */
  async addVisitCompletedScore(userId: string): Promise<void> {
    await this.updateScore(userId, ReliabilityScoreService.SCORES.VISIT_COMPLETED)
  }

  /**
   * Retire des points pour un no-show
   */
  async addNoShowScore(userId: string): Promise<void> {
    await this.updateScore(userId, ReliabilityScoreService.SCORES.NO_SHOW)
  }

  /**
   * Retire des points pour une annulation tardive
   */
  async addLateCancellationScore(userId: string): Promise<void> {
    await this.updateScore(userId, ReliabilityScoreService.SCORES.LATE_CANCELLATION)
  }

  /**
   * Ajoute des points pour une pré-confirmation
   */
  async addPreConfirmedScore(userId: string): Promise<void> {
    await this.updateScore(userId, ReliabilityScoreService.SCORES.PRE_CONFIRMED)
  }

  /**
   * Récupère le score de fiabilité d'un utilisateur
   */
  async getScore(userId: string): Promise<number> {
    const user = await User.find(userId)
    if (!user) {
      throw new Error(`User ${userId} not found`)
    }
    return user.reliabilityScore || 0
  }
}
