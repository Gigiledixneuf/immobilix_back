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

    // Vérifier si le token existe déjà pour cet utilisateur
    let fcmToken = await FcmToken.query()
      .where('user_id', user.id)
      .where('token', payload.token)
      .first()

    if (fcmToken) {
      // Mettre à jour le token existant
      fcmToken.deviceId = payload.deviceId || fcmToken.deviceId
      fcmToken.deviceType = payload.deviceType || fcmToken.deviceType
      fcmToken.isActive = true
      await fcmToken.save()
    } else {
      // Créer un nouveau token
      fcmToken = await FcmToken.create({
        userId: user.id,
        token: payload.token,
        deviceId: payload.deviceId || null,
        deviceType: payload.deviceType || null,
        isActive: true,
      })
    }

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

