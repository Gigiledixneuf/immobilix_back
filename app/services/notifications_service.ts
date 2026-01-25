import logger from '@adonisjs/core/services/logger'
import Notification from '#models/notification'
import FirebaseService from '#services/firebase_service'
import { getRealtimeEventBus } from '#services/realtime_event_bus'

export default class NotificationsService {
  /**
   * Crée une notification pour un utilisateur
   */
  async notifyUser(
    userId: number,
    title: string,
    message: string,
    type: string = 'info',
    data?: Record<string, unknown>
  ) {
    // Créer la notification dans la base de données
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      isRead: false,
      data: data || null,
    })

    // Envoyer via WebSocket en temps réel
    try {
      const eventBus = getRealtimeEventBus()
      await eventBus.publish({
        type: 'notification.created',
        payload: {
          userId,
          notification: {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            isRead: notification.isRead,
            data: notification.data,
            createdAt: notification.createdAt.toISO(),
          },
        },
      })
    } catch (error: any) {
      const msg = error?.message ?? error?.code ?? String(error)
      logger.warn(`WebSocket notification failed (user ${userId}): ${msg}`)
    }

    // Envoyer via FCM (push notification)
    try {
      // Convertir les données en format string pour FCM
      const fcmData = data
        ? Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, String(value)])
          )
        : undefined

      // Ajouter l'ID de la notification dans les données
      const finalFcmData = {
        ...fcmData,
        notificationId: String(notification.uuid),
        type: notification.type,
      }

      await FirebaseService.sendToUser(userId, title, message, finalFcmData)
    } catch (error: any) {
      const msg = error?.message ?? error?.code ?? String(error)
      logger.warn(`FCM send failed (user ${userId}): ${msg}`)
    }

    return notification
  }

  /**
   * Envoie une notification push FCM uniquement (sans créer de notification en base)
   * Utilisé pour les messages qui ne doivent pas apparaître dans la page de notifications
   */
  async sendFcmOnly(
    userId: number,
    title: string,
    message: string,
    data?: Record<string, unknown>
  ) {
    try {
      // Convertir les données en format string pour FCM
      const fcmData = data
        ? Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, String(value)])
          )
        : undefined

      // Ajouter le type dans les données
      const finalFcmData = {
        ...fcmData,
        type: 'message', // Type pour identifier que c'est un message
      }

      await FirebaseService.sendToUser(userId, title, message, finalFcmData)
    } catch (error: any) {
      const msg = error?.message ?? error?.code ?? String(error)
      logger.warn(`FCM send failed (user ${userId}): ${msg}`)
    }
  }

  /**
   * Notifie un contact via SMS/Email (pour usage futur)
   */
  async notifyContact(
    contact: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
  ) {
    // SMS/Email provider à implémenter
    logger.debug(`[NOTIFY contact:${contact}] ${title} - ${body}`, data ?? {})
  }
}


