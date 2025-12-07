import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Rate limiting middleware pour protéger contre les attaques par force brute
 * Limite le nombre de tentatives de login par IP et par email
 */
export default class RateLimitMiddleware {
  // Stockage en mémoire des tentatives (IP -> nombre de tentatives)
  private static attemptsByIp: Map<string, { count: number; resetAt: number }> = new Map()
  
  // Stockage en mémoire des tentatives (Email -> nombre de tentatives)
  private static attemptsByEmail: Map<string, { count: number; resetAt: number }> = new Map()

  // Configuration
  private readonly maxAttempts: number
  private readonly windowMs: number // Fenêtre de temps en millisecondes

  constructor(maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000) {
    // Par défaut: 5 tentatives par 15 minutes
    this.maxAttempts = maxAttempts
    this.windowMs = windowMs
  }

  async handle(ctx: HttpContext, next: NextFn) {
    const request = ctx.request
    const response = ctx.response

    // Nettoyer les entrées expirées périodiquement
    this.cleanupExpiredEntries()

    // Obtenir l'IP du client
    const clientIp = request.ip() || request.header('x-forwarded-for') || 'unknown'

    // Pour les routes de login, on peut aussi vérifier par email si disponible
    let email: string | undefined
    if (request.url().includes('/login')) {
      try {
        // Le bodyparser middleware devrait avoir déjà parsé le body
        const body = request.all()
        if (body && typeof body.email === 'string') {
          email = body.email.toLowerCase().trim()
        }
      } catch (e) {
        // Si le body n'est pas encore parsé ou accessible, on continue sans email
        // Le rate limiting par IP fonctionnera toujours
      }
    }

    // Vérifier les tentatives par IP
    const ipAttempts = RateLimitMiddleware.attemptsByIp.get(clientIp)
    if (ipAttempts) {
      const logger = (await import('@adonisjs/core/services/logger')).default
      logger.info(`🛡️ [RATE-LIMIT] IP: ${clientIp}, Tentatives: ${ipAttempts.count}/${this.maxAttempts}, Reset dans: ${Math.ceil((ipAttempts.resetAt - Date.now()) / 1000)}s`)
      
      if (ipAttempts.resetAt > Date.now() && ipAttempts.count >= this.maxAttempts) {
        const retryAfter = Math.ceil((ipAttempts.resetAt - Date.now()) / 1000)
        logger.warn(`🚫 [RATE-LIMIT] Blocage IP ${clientIp} - Trop de tentatives`)
        return response.status(429).json({
          status: 'error',
          message: 'Trop de tentatives de connexion. Veuillez réessayer plus tard.',
          retryAfter: retryAfter,
        })
      }
    }

    // Vérifier les tentatives par email si disponible
    if (email) {
      const emailAttempts = RateLimitMiddleware.attemptsByEmail.get(email)
      if (emailAttempts) {
        const logger = (await import('@adonisjs/core/services/logger')).default
        logger.info(`🛡️ [RATE-LIMIT] Email: ${email.substring(0, 3)}***, Tentatives: ${emailAttempts.count}/${this.maxAttempts}, Reset dans: ${Math.ceil((emailAttempts.resetAt - Date.now()) / 1000)}s`)
        
        if (emailAttempts.resetAt > Date.now() && emailAttempts.count >= this.maxAttempts) {
          const retryAfter = Math.ceil((emailAttempts.resetAt - Date.now()) / 1000)
          logger.warn(`🚫 [RATE-LIMIT] Blocage email ${email.substring(0, 3)}*** - Trop de tentatives`)
          return response.status(429).json({
            status: 'error',
            message: 'Trop de tentatives de connexion. Veuillez réessayer plus tard.',
            retryAfter: retryAfter,
          })
        }
      }
    }

    // Exécuter la requête suivante
    try {
      await next()
    } catch (error) {
      // Si une erreur se produit, enregistrer comme tentative échouée
      this.recordFailedAttempt(clientIp, email)
      throw error
    }

    // Vérifier le statut de la réponse après exécution
    const statusCode = response.response.statusCode || 200
    
    // Si la réponse est un échec d'authentification (401, 400), incrémenter le compteur
    if (statusCode === 401 || statusCode === 400) {
      this.recordFailedAttempt(clientIp, email)
    } else if (statusCode >= 200 && statusCode < 300) {
      // En cas de succès, réinitialiser les compteurs
      this.resetAttempts(clientIp, email)
    }
  }

  /**
   * Enregistre une tentative échouée
   */
  private recordFailedAttempt(ip: string, email?: string) {
    const now = Date.now()
    const resetAt = now + this.windowMs

    // Incrémenter pour l'IP
    const ipAttempts = RateLimitMiddleware.attemptsByIp.get(ip)
    if (ipAttempts && ipAttempts.resetAt > now) {
      ipAttempts.count++
    } else {
      RateLimitMiddleware.attemptsByIp.set(ip, { count: 1, resetAt })
    }

    // Incrémenter pour l'email si disponible
    if (email) {
      const emailAttempts = RateLimitMiddleware.attemptsByEmail.get(email)
      if (emailAttempts && emailAttempts.resetAt > now) {
        emailAttempts.count++
      } else {
        RateLimitMiddleware.attemptsByEmail.set(email, { count: 1, resetAt })
      }
    }
  }

  /**
   * Réinitialise les compteurs après un succès
   */
  private resetAttempts(ip: string, email?: string) {
    RateLimitMiddleware.attemptsByIp.delete(ip)
    if (email) {
      RateLimitMiddleware.attemptsByEmail.delete(email)
    }
  }

  /**
   * Nettoie les entrées expirées pour éviter la fuite mémoire
   */
  private cleanupExpiredEntries() {
    const now = Date.now()

    // Nettoyer les entrées IP expirées
    for (const [ip, data] of RateLimitMiddleware.attemptsByIp.entries()) {
      if (data.resetAt <= now) {
        RateLimitMiddleware.attemptsByIp.delete(ip)
      }
    }

    // Nettoyer les entrées email expirées
    for (const [email, data] of RateLimitMiddleware.attemptsByEmail.entries()) {
      if (data.resetAt <= now) {
        RateLimitMiddleware.attemptsByEmail.delete(email)
      }
    }
  }
}

