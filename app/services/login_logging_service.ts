import logger from '@adonisjs/core/services/logger'
import LoginAttempt from '#models/login_attempt'

export default class LoginLoggingService {
  /**
   * Enregistre une tentative de connexion en base de données
   */
  static async logAttempt(data: {
    email: string | null
    userId: number | null
    ipAddress: string | null
    userAgent: string | null
    status: 'success' | 'failed' | 'blocked'
    failureReason?: string | null
  }): Promise<void> {
    try {
      await LoginAttempt.create({
        email: data.email,
        userId: data.userId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        status: data.status,
        failureReason: data.failureReason || null,
      })
    } catch (error) {
      // Ne pas faire échouer le login si le logging échoue
      logger.error('Erreur lors du logging de la tentative de connexion:', error)
    }
  }

  /**
   * Compte le nombre de tentatives échouées récentes pour un email ou une IP
   */
  static async getRecentFailedAttempts(
    email: string | null,
    ipAddress: string | null,
    windowMinutes: number = 15
  ): Promise<number> {
    const windowDate = new Date()
    windowDate.setMinutes(windowDate.getMinutes() - windowMinutes)

    const query = LoginAttempt.query()
      .where('status', 'failed')
      .where('created_at', '>', windowDate.toISOString())

    if (email || ipAddress) {
      query.andWhere((builder) => {
        if (email) {
          builder.orWhere('email', email)
        }
        if (ipAddress) {
          builder.orWhere('ip_address', ipAddress)
        }
      })
    }

    const result = await query.count('* as total')
    return Number(result[0]?.$extras?.total || 0)
  }
}

