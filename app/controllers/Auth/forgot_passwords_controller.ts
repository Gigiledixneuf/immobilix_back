import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'
import { ForgotPasswordValidator } from '#validators/Auth/forgot_password'
import { ResetPasswordValidator } from '#validators/Auth/reset_password'
import PasswordResetToken from '#models/password_reset_token'
import { DateTime } from 'luxon'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'

const randomBytesAsync = promisify(randomBytes)

export default class ForgotPasswordsController {
  /**
   * Demande une réinitialisation de mot de passe
   * POST /api/forgot-password
   */
  async requestReset({ request, response }: HttpContext) {
    const logger = (await import('@adonisjs/core/services/logger')).default

    try {
      const { email } = await request.validateUsing(ForgotPasswordValidator)
      const normalizedEmail = email.trim().toLowerCase()

      logger.info(`🔑 [FORGOT-PASSWORD] Demande de réinitialisation pour: ${normalizedEmail.substring(0, 3)}***`)

      // Rechercher l'utilisateur
      const user = await User.findBy('email', normalizedEmail)

      // Pour des raisons de sécurité, on ne révèle pas si l'email existe ou non
      // On retourne toujours un succès pour éviter l'énumération d'emails
      if (!user) {
        logger.warn(`⚠️ [FORGOT-PASSWORD] Email non trouvé: ${normalizedEmail.substring(0, 3)}***`)
        // Retourner un succès même si l'utilisateur n'existe pas (sécurité)
        return response.ok({
          status: 'success',
          message: 'Si cet email existe, vous recevrez un lien de réinitialisation.',
        })
      }

      logger.info(`✅ [FORGOT-PASSWORD] Utilisateur trouvé - ID: ${user.id}`)

      // Invalider tous les tokens de réinitialisation existants pour cet utilisateur
      // Convertir DateTime en string pour éviter le problème de timezone
      const nowString = DateTime.now().toFormat('yyyy-MM-dd HH:mm:ss')
      await PasswordResetToken.query()
        .where('user_id', user.id)
        .where('used', false)
        .update({ used: true, used_at: nowString })

      // Générer un token sécurisé
      const tokenBytes = await randomBytesAsync(32)
      const token = tokenBytes.toString('hex')

      // Créer le token de réinitialisation (valide pendant 1 heure)
      const resetToken = await PasswordResetToken.create({
        userId: user.id,
        email: normalizedEmail,
        token: token,
        expiresAt: DateTime.now().plus({ hours: 1 }),
        used: false,
      })

      logger.info(`✅ [FORGOT-PASSWORD] Token créé - Expire à: ${resetToken.expiresAt.toISO()}`)

      // TODO: Envoyer l'email avec le lien de réinitialisation
      // Pour l'instant, on log le token (en développement uniquement)
      logger.info(`🔗 [FORGOT-PASSWORD] Token de réinitialisation: ${token}`)
      logger.info(`🔗 [FORGOT-PASSWORD] Lien: ${request.header('origin') || 'http://localhost'}/reset-password?token=${token}`)

      // En production, envoyer l'email ici
      // await Mail.send(new PasswordResetMail(user, token))

      return response.ok({
        status: 'success',
        message: 'Si cet email existe, vous recevrez un lien de réinitialisation.',
        // En développement, on peut retourner le token pour faciliter les tests
        ...(process.env.NODE_ENV !== 'production' && { token: token }),
      })
    } catch (error) {
      logger.error(`❌ [FORGOT-PASSWORD] Erreur: ${error.message}`)
      return response.internalServerError({
        status: 'error',
        message: 'Une erreur est survenue lors de la demande de réinitialisation.',
      })
    }
  }

  /**
   * Réinitialise le mot de passe avec un token
   * POST /api/reset-password
   */
  async resetPassword({ request, response }: HttpContext) {
    const logger = (await import('@adonisjs/core/services/logger')).default

    try {
      const { token, password } = await request.validateUsing(ResetPasswordValidator)

      logger.info(`🔑 [RESET-PASSWORD] Tentative de réinitialisation avec token...`)

      // Rechercher le token de réinitialisation
      const resetToken = await PasswordResetToken.query()
        .where('token', token)
        .where('used', false)
        .where('expires_at', '>', DateTime.now().toISO())
        .first()

      if (!resetToken) {
        logger.warn('❌ [RESET-PASSWORD] Token invalide, expiré ou déjà utilisé')
        return response.badRequest({
          status: 'error',
          message: 'Le lien de réinitialisation est invalide ou a expiré.',
        })
      }

      logger.info(`✅ [RESET-PASSWORD] Token valide trouvé - User ID: ${resetToken.userId}`)

      // Récupérer l'utilisateur
      const user = await User.find(resetToken.userId)

      if (!user) {
        logger.error(`❌ [RESET-PASSWORD] Utilisateur non trouvé - ID: ${resetToken.userId}`)
        return response.badRequest({
          status: 'error',
          message: 'Utilisateur non trouvé.',
        })
      }

      // Hacher le nouveau mot de passe
      const hashedPassword = await hash.use('scrypt').make(password)

      // Mettre à jour le mot de passe directement avec SQL pour éviter le re-hash par withAuthFinder
      const db = (await import('@adonisjs/lucid/services/db')).default
      await db.from('users').where('id', user.id).update({ password: hashedPassword })
      await user.refresh()

      logger.info(`✅ [RESET-PASSWORD] Mot de passe mis à jour pour l'utilisateur ID: ${user.id}`)

      // Marquer le token comme utilisé
      resetToken.used = true
      resetToken.usedAt = DateTime.now()
      await resetToken.save()

      logger.info(`✅ [RESET-PASSWORD] Token marqué comme utilisé`)

      // Invalider tous les tokens de l'utilisateur (sécurité)
      await User.accessTokens.query()
        .where('tokenable_id', user.id)
        .delete()

      logger.info(`✅ [RESET-PASSWORD] Tous les tokens de l'utilisateur ont été révoqués`)

      return response.ok({
        status: 'success',
        message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.',
      })
    } catch (error) {
      logger.error(`❌ [RESET-PASSWORD] Erreur: ${error.message}`)
      
      if (error.name === 'E_VALIDATION_ERROR') {
        return response.badRequest({
          status: 'error',
          message: 'Les données fournies sont invalides.',
          errors: error.messages,
        })
      }

      return response.internalServerError({
        status: 'error',
        message: 'Une erreur est survenue lors de la réinitialisation du mot de passe.',
      })
    }
  }
}
