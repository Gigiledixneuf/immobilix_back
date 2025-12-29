import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import { errors } from '@vinejs/vine'
import { LoginValidator } from '#validators/Auth/login'
import LoginLoggingService from '#services/login_logging_service'
import { DateTime } from 'luxon'

export default class LoginController {
  async login({ request, response }: HttpContext) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    const clientIp = request.ip() || 'unknown'
    
    logger.info('🔐 [LOGIN] Tentative de connexion reçue')
    logger.info(`🔐 [LOGIN] IP client: ${clientIp}`)
    
    try {
      // Validation des entrées
      logger.info('🔐 [LOGIN] Début de la validation des entrées...')
      const { email, password } = await request.validateUsing(LoginValidator)
      logger.info(`🔐 [LOGIN] Validation réussie - Email: ${email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : 3)}***`)

      // Normaliser l'email (trim + lowercase) pour assurer la cohérence
      const normalizedEmail = email.trim().toLowerCase()
      logger.info(`🔐 [LOGIN] Email normalisé: ${normalizedEmail}`)

      /**
       * Find a user by email. Return error if a user does
       * not exist
       */
      logger.info(`🔐 [LOGIN] Recherche de l'utilisateur avec l'email: ${normalizedEmail}`)
      // Récupérer l'utilisateur avec le champ password explicitement
      const user = await User.query().where('email', normalizedEmail).first()

      if (!user) {
        logger.warn(`❌ [LOGIN] Utilisateur non trouvé pour l'email: ${normalizedEmail}`)
        
        // Logger la tentative échouée
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
          message: 'Invalid credentials',
        })
      }

      logger.info(`✅ [LOGIN] Utilisateur trouvé - ID: ${user.id}, Email: ${user.email}`)

      /**
       * Verify the password using the hash service
       * IMPORTANT: hash.verify() retourne un booléen, pas une exception
       */
      logger.info('🔐 [LOGIN] Vérification du mot de passe...')
      
      // Vérifier que le mot de passe hashé existe
      if (!user.password) {
        logger.error(`❌ [LOGIN] Pas de mot de passe hashé pour l'utilisateur ID: ${user.id}`)
        return response.unauthorized({
          status: 'error',
          message: 'Invalid credentials',
        })
      }
      
      // Vérifier le mot de passe
      let isValidPassword = await hash.verify(user.password, password)
      
      // Si la vérification échoue, essayer avec scrypt explicitement (fallback)
      if (!isValidPassword) {
        isValidPassword = await hash.use('scrypt').verify(user.password, password)
      }
      
      if (!isValidPassword) {
        logger.warn(`❌ [LOGIN] Mot de passe incorrect pour l'utilisateur ID: ${user.id}`)
        logger.warn(`❌ [LOGIN] Email: ${normalizedEmail}`)
        logger.warn(`❌ [LOGIN] Hash attendu: ${user.password.substring(0, 30)}...`)
        
        // Logger la tentative échouée
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
          message: 'Invalid credentials',
        })
      }
      
      logger.info('✅ [LOGIN] Mot de passe vérifié avec succès')

      // Charger les rôles pour la réponse
      logger.info('🔐 [LOGIN] Chargement des rôles de l\'utilisateur...')
      await user.load('roles')
      logger.info(`✅ [LOGIN] Rôles chargés: ${user.roles?.map(r => r.name).join(', ') || 'aucun'}`)

      logger.info('🔐 [LOGIN] Génération des tokens (access + refresh)...')
      
      // Créer un access token (courte durée : 15 minutes)
      const accessToken = await User.accessTokens.create(user, {
        name: 'access_token',
        expiresAt: DateTime.now().plus({ minutes: 15 }),
        type: 'access_token',
      })
      const accessTokenValue = accessToken.value!.release()
      logger.info(`✅ [LOGIN] Access token généré (expire dans 15 minutes)`)

      // Créer un refresh token (longue durée : 7 jours)
      const refreshToken = await User.accessTokens.create(user, {
        name: 'refresh_token',
        expiresAt: DateTime.now().plus({ days: 7 }),
        type: 'refresh_token',
      })
      const refreshTokenValue = refreshToken.value!.release()
      logger.info(`✅ [LOGIN] Refresh token généré (expire dans 7 jours)`)

      logger.info('✅ [LOGIN] Connexion réussie - Préparation de la réponse...')
      const serializedUser = user.serialize({
        fields: { omit: ['password', 'created_at', 'updated_at'] },
        relations: { roles: { fields: ['id', 'name'] } },
      })
      
      logger.info(`✅ [LOGIN] Utilisateur sérialisé - ID: ${serializedUser.id}, Email: ${serializedUser.email}`)

      // Logger la tentative réussie
      await LoginLoggingService.logAttempt({
        email: normalizedEmail,
        userId: user.id,
        ipAddress: clientIp,
        userAgent: request.header('user-agent') || null,
        status: 'success',
      })

      return response.ok({
        status: 'success',
        message: 'Login successful',
        data: {
          user: serializedUser,
          token: accessTokenValue,
          refreshToken: refreshTokenValue,
          expiresAt: accessToken.expiresAt?.toISO(),
        },
      })
    } catch (error) {
      logger.error('❌ [LOGIN] Erreur lors du processus de connexion')
      logger.error(`❌ [LOGIN] Type d'erreur: ${error.constructor.name}`)
      logger.error(`❌ [LOGIN] Message: ${error.message}`)
      
      if (error instanceof errors.E_VALIDATION_ERROR) {
        logger.warn(`❌ [LOGIN] Erreur de validation: ${JSON.stringify(error.messages)}`)
        return response.badRequest({
          status: 'error',
          message: 'Validation failed',
          errors: error.messages,
        })
      }

      if (error.code === 'E_ROW_NOT_FOUND') {
        logger.warn('❌ [LOGIN] Erreur E_ROW_NOT_FOUND')
        return response.unauthorized({
          status: 'error',
          message: 'Invalid credentials',
        })
      }

      logger.error(`❌ [LOGIN] Erreur serveur: ${error.stack || error.message}`)
      return response.internalServerError({
        status: 'error',
        message: 'Login failed',
        error: error.message,
      })
    }
  }
}
