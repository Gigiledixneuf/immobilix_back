import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import { errors } from '@vinejs/vine'
import { LoginValidator } from '#validators/Auth/login'
import LoginLoggingService from '#services/login_logging_service'
import { DateTime } from 'luxon'

/**
 * Contrôleur d'authentification pour l'admin
 * Vérifie que l'utilisateur a un rôle admin (super_admin, admin, ou moderator)
 */
export default class AdminAuthController {
  async login({ request, response }: HttpContext) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    const clientIp = request.ip() || 'unknown'
    
    logger.info('🔐 [ADMIN LOGIN] Tentative de connexion admin reçue')
    logger.info(`🔐 [ADMIN LOGIN] IP client: ${clientIp}`)
    
    try {
      // Validation des entrées
      logger.info('🔐 [ADMIN LOGIN] Début de la validation des entrées...')
      const { email, password } = await request.validateUsing(LoginValidator)
      logger.info(`🔐 [ADMIN LOGIN] Validation réussie - Email: ${email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : 3)}***`)

      // Normaliser l'email
      const normalizedEmail = email.trim().toLowerCase()
      logger.info(`🔐 [ADMIN LOGIN] Email normalisé: ${normalizedEmail}`)

      // Récupérer l'utilisateur avec ses rôles
      logger.info(`🔐 [ADMIN LOGIN] Recherche de l'utilisateur avec l'email: ${normalizedEmail}`)
      const user = await User.query()
        .where('email', normalizedEmail)
        .preload('roles')
        .first()

      if (!user) {
        logger.warn(`❌ [ADMIN LOGIN] Utilisateur non trouvé pour l'email: ${normalizedEmail}`)
        
        await LoginLoggingService.logAttempt({
          email: normalizedEmail,
          userId: null,
          ipAddress: clientIp,
          userAgent: request.header('user-agent') || null,
          status: 'failed',
          failureReason: 'invalid_email',
        })
        
        return response.unauthorized({
          status: 'error',
          message: 'Email ou mot de passe incorrect. Veuillez réessayer.',
        })
      }

      logger.info(`✅ [ADMIN LOGIN] Utilisateur trouvé - ID: ${user.id}, Email: ${user.email}`)

      // Vérifier le mot de passe
      logger.info('🔐 [ADMIN LOGIN] Vérification du mot de passe...')
      
      if (!user.password) {
        logger.error(`❌ [ADMIN LOGIN] Pas de mot de passe hashé pour l'utilisateur ID: ${user.id}`)
        return response.unauthorized({
          status: 'error',
          message: 'Email ou mot de passe incorrect. Veuillez réessayer.',
        })
      }
      
      let isValidPassword = await hash.verify(user.password, password)
      
      if (!isValidPassword) {
        isValidPassword = await hash.use('scrypt').verify(user.password, password)
      }
      
      if (!isValidPassword) {
        logger.warn(`❌ [ADMIN LOGIN] Mot de passe incorrect pour l'utilisateur ID: ${user.id}`)
        
        await LoginLoggingService.logAttempt({
          email: normalizedEmail,
          userId: user.id,
          ipAddress: clientIp,
          userAgent: request.header('user-agent') || null,
          status: 'failed',
          failureReason: 'invalid_password',
        })
        
        return response.unauthorized({
          status: 'error',
          message: 'Email ou mot de passe incorrect. Veuillez réessayer.',
        })
      }
      
      logger.info('✅ [ADMIN LOGIN] Mot de passe vérifié avec succès')

      // Vérifier que l'utilisateur a un rôle admin
      const adminRoles = ['super_admin', 'admin', 'moderator']
      const userRoles = user.roles?.map(r => r.name) || []
      const hasAdminRole = userRoles.some(role => adminRoles.includes(role))
      
      if (!hasAdminRole) {
        logger.warn(`❌ [ADMIN LOGIN] Utilisateur sans rôle admin - ID: ${user.id}, Rôles: ${userRoles.join(', ')}`)
        
        await LoginLoggingService.logAttempt({
          email: normalizedEmail,
          userId: user.id,
          ipAddress: clientIp,
          userAgent: request.header('user-agent') || null,
          status: 'failed',
          failureReason: 'insufficient_permissions',
        })
        
        return response.forbidden({
          status: 'error',
          message: 'Accès refusé. Vous devez avoir un rôle administrateur pour accéder à cette interface.',
        })
      }

      logger.info(`✅ [ADMIN LOGIN] Rôles admin vérifiés: ${userRoles.join(', ')}`)

      // Générer les tokens
      logger.info('🔐 [ADMIN LOGIN] Génération des tokens (access + refresh)...')
      
      // Access token (courte durée : 15 minutes)
      const accessToken = await User.accessTokens.create(user, {
        name: 'admin_access_token',
        expiresAt: DateTime.now().plus({ minutes: 15 }),
        type: 'access_token',
      })
      const accessTokenValue = accessToken.value!.release()
      logger.info(`✅ [ADMIN LOGIN] Access token généré (expire dans 15 minutes)`)

      // Refresh token (longue durée : 7 jours)
      const refreshToken = await User.accessTokens.create(user, {
        name: 'admin_refresh_token',
        expiresAt: DateTime.now().plus({ days: 7 }),
        type: 'refresh_token',
      })
      const refreshTokenValue = refreshToken.value!.release()
      logger.info(`✅ [ADMIN LOGIN] Refresh token généré (expire dans 7 jours)`)

      logger.info('✅ [ADMIN LOGIN] Connexion réussie - Préparation de la réponse...')
      
      // Sérialiser l'utilisateur avec ses rôles
      const serializedUser = user.serialize({
        fields: { omit: ['password', 'created_at', 'updated_at'] },
        relations: { roles: { fields: ['id', 'name'] } },
      })
      
      // Déterminer le rôle principal (priorité: super_admin > admin > moderator)
      const primaryRole = userRoles.find(r => r === 'super_admin') 
        || userRoles.find(r => r === 'admin')
        || userRoles.find(r => r === 'moderator')
        || userRoles[0] || 'user'

      // Formater la réponse selon ce que le frontend attend
      const responseData = {
        token: accessTokenValue,
        refreshToken: refreshTokenValue,
        user: {
          id: serializedUser.id,
          email: serializedUser.email,
          name: serializedUser.fullName || `${serializedUser.firstName || ''} ${serializedUser.lastName || ''}`.trim() || serializedUser.email,
          role: primaryRole,
        },
      }

      logger.info(`✅ [ADMIN LOGIN] Utilisateur sérialisé - ID: ${responseData.user.id}, Email: ${responseData.user.email}, Role: ${responseData.user.role}`)

      // Logger la tentative réussie
      await LoginLoggingService.logAttempt({
        email: normalizedEmail,
        userId: user.id,
        ipAddress: clientIp,
        userAgent: request.header('user-agent') || null,
        status: 'success',
      })

      return response.ok(responseData)
    } catch (error) {
      logger.error('❌ [ADMIN LOGIN] Erreur lors du processus de connexion')
      logger.error(`❌ [ADMIN LOGIN] Type d'erreur: ${error.constructor.name}`)
      logger.error(`❌ [ADMIN LOGIN] Message: ${error.message}`)
      
      if (error instanceof errors.E_VALIDATION_ERROR) {
        logger.warn(`❌ [ADMIN LOGIN] Erreur de validation: ${JSON.stringify(error.messages)}`)
        return response.badRequest({
          status: 'error',
          message: 'Les données fournies sont invalides. Veuillez vérifier votre saisie.',
          errors: error.messages,
        })
      }

      if (error.code === 'E_ROW_NOT_FOUND') {
        logger.warn('❌ [ADMIN LOGIN] Erreur E_ROW_NOT_FOUND')
        return response.unauthorized({
          status: 'error',
          message: 'Email ou mot de passe incorrect. Veuillez réessayer.',
        })
      }

      logger.error(`❌ [ADMIN LOGIN] Erreur serveur: ${error.stack || error.message}`)
      return response.internalServerError({
        status: 'error',
        message: 'Une erreur est survenue lors de la connexion. Veuillez réessayer plus tard.',
        error: error.message,
      })
    }
  }

  /**
   * Rafraîchit le token d'accès avec le refresh token
   */
  async refresh({ request, response }: HttpContext) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    
    try {
      const body = request.body()
      const refreshToken = body.refreshToken || body.refresh_token
      
      if (!refreshToken || typeof refreshToken !== 'string') {
        return response.badRequest({
          status: 'error',
          message: 'Le token de rafraîchissement est requis.',
        })
      }

      // Vérifier le refresh token
      // Format du token: oat_<id>.<secret>
      const tokenParts = refreshToken.split('.')
      if (tokenParts.length !== 2) {
        return response.unauthorized({
          status: 'error',
          message: 'Format de token invalide.',
        })
      }

      const prefixAndId = tokenParts[0] // oat_<id>
      if (!prefixAndId.startsWith('oat_')) {
        return response.unauthorized({
          status: 'error',
          message: 'Format de token invalide.',
        })
      }

      const tokenId = prefixAndId.replace('oat_', '')
      const tokenSecret = tokenParts[1]

      // Chercher le token dans la base de données
      const db = await import('@adonisjs/lucid/services/db')
      const hashService = await import('@adonisjs/core/services/hash')
      
      const tokenRecord = await db.default
        .from('auth_access_tokens')
        .where('id', tokenId)
        .where('type', 'refresh_token')
        .first()
      
      if (!tokenRecord) {
        return response.unauthorized({
          status: 'error',
          message: 'Token de rafraîchissement invalide ou expiré.',
        })
      }

      // Vérifier que le token n'est pas expiré
      if (tokenRecord.expires_at) {
        const expiresAt = DateTime.fromSQL(tokenRecord.expires_at)
        if (expiresAt < DateTime.now()) {
          return response.unauthorized({
            status: 'error',
            message: 'Token de rafraîchissement expiré.',
          })
        }
      }

      // Vérifier le hash du secret
      const isValid = await hashService.default.verify(tokenRecord.hash, tokenSecret)
      
      if (!isValid) {
        return response.unauthorized({
          status: 'error',
          message: 'Token de rafraîchissement invalide.',
        })
      }

      const user = await User.findOrFail(tokenRecord.tokenable_id)
      await user.load('roles')

      // Vérifier que l'utilisateur a toujours un rôle admin
      const adminRoles = ['super_admin', 'admin', 'moderator']
      const userRoles = user.roles?.map(r => r.name) || []
      const hasAdminRole = userRoles.some(role => adminRoles.includes(role))
      
      if (!hasAdminRole) {
        return response.forbidden({
          status: 'error',
          message: 'Accès refusé. Vous devez avoir un rôle administrateur.',
        })
      }

      // Générer un nouveau access token
      const accessToken = await User.accessTokens.create(user, {
        name: 'admin_access_token',
        expiresAt: DateTime.now().plus({ minutes: 15 }),
        type: 'access_token',
      })
      const accessTokenValue = accessToken.value!.release()

      return response.ok({
        token: accessTokenValue,
      })
    } catch (error) {
      logger.error('❌ [ADMIN REFRESH] Erreur lors du rafraîchissement du token')
      return response.unauthorized({
        status: 'error',
        message: 'Token de rafraîchissement invalide ou expiré.',
      })
    }
  }
}
