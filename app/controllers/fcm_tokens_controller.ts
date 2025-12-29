import type { HttpContext } from '@adonisjs/core/http'
import FcmToken from '#models/fcm_token'
import { fcmTokenValidator } from '#validators/fcm_token'

export default class FcmTokensController {
  /**
   * POST /api/fcm-tokens
   * Enregistre ou met à jour un token FCM pour l'utilisateur authentifié
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user!

    const payload = await request.validateUsing(fcmTokenValidator)

    const db = (await import('@adonisjs/lucid/services/db')).default

    // Utiliser une transaction pour éviter les conditions de course
    const fcmToken = await db.transaction(async (trx) => {
      // Chercher le token dans la transaction
      let existingToken = await FcmToken.query({ client: trx })
        .where('token', payload.token)
        .first()

      if (existingToken) {
        // Mettre à jour le token existant
        existingToken.userId = user.id
        existingToken.deviceId = payload.deviceId || existingToken.deviceId
        existingToken.deviceType = payload.deviceType || existingToken.deviceType
        existingToken.isActive = true
        await existingToken.useTransaction(trx).save()
        return existingToken
      } else {
        // Créer un nouveau token dans la transaction
        return await FcmToken.create(
          {
            userId: user.id,
            token: payload.token,
            deviceId: payload.deviceId || null,
            deviceType: payload.deviceType || null,
            isActive: true,
          },
          { client: trx }
        )
      }
    })

    return response.created({
      message: 'Token FCM enregistré avec succès',
      data: fcmToken,
    })
  }

  /**
   * DELETE /api/fcm-tokens/:token
   * Désactive ou supprime un token FCM
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.user!

    const fcmToken = await FcmToken.query()
      .where('user_id', user.id)
      .where('token', params.token)
      .first()

    if (!fcmToken) {
      return response.notFound({ message: 'Token FCM introuvable' })
    }

    await fcmToken.delete()

    return response.ok({
      message: 'Token FCM supprimé avec succès',
    })
  }

  /**
   * GET /api/fcm-tokens
   * Récupère tous les tokens FCM actifs de l'utilisateur authentifié
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user!

    const tokens = await FcmToken.query()
      .where('user_id', user.id)
      .where('is_active', true)
      .orderBy('created_at', 'desc')

    return response.ok({
      message: 'Tokens FCM récupérés avec succès',
      data: tokens,
    })
  }
}

