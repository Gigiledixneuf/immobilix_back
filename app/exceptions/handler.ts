import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import { errors } from '@vinejs/vine'
import type { HttpException } from '@adonisjs/core/http/exceptions'

/**
 * Gestionnaire global d'exceptions amélioré
 * 
 * Ce handler standardise toutes les réponses d'erreur et ajoute
 * un logging structuré pour faciliter le debugging.
 */
export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * En mode debug, les erreurs sont affichées avec des stack traces détaillées
   */
  protected debug = !app.inProduction

  /**
   * Gère les erreurs et retourne une réponse standardisée au client
   */
  async handle(error: unknown, ctx: HttpContext) {
    // Format standardisé de réponse d'erreur
    const responseFormat = {
      status: 'error' as const,
      message: '',
      code: '',
      ...(this.debug && { details: {} }),
    }

    // Cas 1 : Erreurs de validation VineJS
    if (error instanceof errors.E_VALIDATION_ERROR) {
      return ctx.response.status(422).json({
        ...responseFormat,
        message: 'Erreur de validation',
        code: 'VALIDATION_ERROR',
        errors: error.messages,
        ...(this.debug && { details: { field: error.field } }),
      })
    }

    // Cas 2 : Erreurs HTTP standardes (404, 403, etc.)
    if ('status' in error && typeof error.status === 'number') {
      const httpError = error as HttpException
      const statusCode = httpError.status || 500
      
      return ctx.response.status(statusCode).json({
        ...responseFormat,
        message: httpError.message || this.getDefaultMessage(statusCode),
        code: httpError.code || this.getErrorCode(statusCode),
        ...(this.debug && { 
          details: {
            stack: httpError.stack,
            originalError: error,
          },
        }),
      })
    }

    // Cas 3 : Erreurs de base de données (Lucid)
    if (error && typeof error === 'object' && 'code' in error) {
      const dbError = error as { code: string; message: string }
      
      // Erreur de ligne non trouvée
      if (dbError.code === 'E_ROW_NOT_FOUND') {
        return ctx.response.status(404).json({
          ...responseFormat,
          message: 'Ressource introuvable',
          code: 'NOT_FOUND',
        })
      }

      // Erreur de contrainte unique
      if (dbError.code === '23505' || dbError.message?.includes('unique constraint')) {
        return ctx.response.status(409).json({
          ...responseFormat,
          message: 'Cette ressource existe déjà',
          code: 'DUPLICATE_ENTRY',
        })
      }

      // Erreur de clé étrangère
      if (dbError.code === '23503' || dbError.message?.includes('foreign key')) {
        return ctx.response.status(400).json({
          ...responseFormat,
          message: 'Référence invalide',
          code: 'FOREIGN_KEY_VIOLATION',
        })
      }
    }

    // Cas 4 : Erreurs d'authentification
    if (error && typeof error === 'object' && 'message' in error) {
      const err = error as Error
      
      if (err.message?.includes('Unauthorized') || err.message?.includes('unauthorized')) {
        return ctx.response.status(401).json({
          ...responseFormat,
          message: 'Non autorisé',
          code: 'UNAUTHORIZED',
        })
      }

      if (err.message?.includes('Forbidden') || err.message?.includes('forbidden')) {
        return ctx.response.status(403).json({
          ...responseFormat,
          message: 'Accès interdit',
          code: 'FORBIDDEN',
        })
      }
    }

    // Cas 5 : Erreurs génériques (500)
    const errorMessage = error instanceof Error ? error.message : 'Une erreur interne est survenue'
    
    return ctx.response.status(500).json({
      ...responseFormat,
      message: app.inProduction 
        ? 'Une erreur interne est survenue. Veuillez réessayer plus tard.' 
        : errorMessage,
      code: 'INTERNAL_SERVER_ERROR',
      ...(this.debug && {
        details: {
          stack: error instanceof Error ? error.stack : undefined,
          originalError: error,
        },
      }),
    })
  }

  /**
   * Rapport des erreurs pour logging et monitoring
   */
  async report(error: unknown, ctx: HttpContext) {
    // Ne pas logger les erreurs de validation (trop verbeux)
    if (error instanceof errors.E_VALIDATION_ERROR) {
      logger.debug({ 
        type: 'validation_error',
        messages: error.messages,
        url: ctx.request.url(),
        method: ctx.request.method(),
        userId: ctx.auth?.user?.id,
      }, 'Validation error')
      return
    }

    // Construire le contexte de l'erreur
    const errorContext = {
      url: ctx.request.url(),
      method: ctx.request.method(),
      ip: ctx.request.ip(),
      userAgent: ctx.request.header('user-agent'),
      userId: ctx.auth?.user?.id,
      body: this.shouldLogBody(ctx.request.method()) 
        ? ctx.request.body() 
        : '[REDACTED]',
      query: ctx.request.qs(),
    }

    // Logger selon le type d'erreur
    if (error instanceof Error) {
      // Erreur avec stack trace
      logger.error(
        {
          error: {
            message: error.message,
            name: error.name,
            stack: error.stack,
          },
          context: errorContext,
        },
        `Unhandled exception: ${error.message}`
      )
    } else {
      // Erreur sans stack trace
      logger.error(
        {
          error: { message: String(error), type: typeof error },
          context: errorContext,
        },
        `Unhandled exception: ${String(error)}`
      )
    }

    // En production, vous pourriez envoyer à un service de monitoring
    // comme Sentry, LogRocket, etc.
    if (app.inProduction) {
      // TODO: Intégrer un service de monitoring d'erreurs
      // Example: Sentry.captureException(error, { extra: errorContext })
    }
  }

  /**
   * Retourne un message par défaut selon le code de statut HTTP
   */
  private getDefaultMessage(statusCode: number): string {
    const messages: Record<number, string> = {
      400: 'Requête invalide',
      401: 'Non autorisé',
      403: 'Accès interdit',
      404: 'Ressource introuvable',
      409: 'Conflit',
      422: 'Erreur de validation',
      500: 'Erreur interne du serveur',
      502: 'Mauvaise passerelle',
      503: 'Service indisponible',
    }
    return messages[statusCode] || 'Une erreur est survenue'
  }

  /**
   * Retourne un code d'erreur standardisé selon le code de statut HTTP
   */
  private getErrorCode(statusCode: number): string {
    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'VALIDATION_ERROR',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    }
    return codes[statusCode] || 'UNKNOWN_ERROR'
  }

  /**
   * Détermine si le corps de la requête doit être loggé
   * (pour éviter de logger les mots de passe, tokens, etc.)
   */
  private shouldLogBody(method: string): boolean {
    // Ne logger le body que pour les méthodes qui ne contiennent pas de données sensibles
    return ['GET', 'HEAD'].includes(method.toUpperCase())
  }
}
