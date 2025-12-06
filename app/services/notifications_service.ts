import Notification from '#models/notification'
import { getWebSocketService } from './websocket_service'

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
      const websocketService = getWebSocketService()
      await websocketService.sendToUser(userId, notification)
    } catch (error) {
      // Ne pas bloquer si WebSocket échoue (l'utilisateur récupérera la notification à la prochaine connexion)
      console.error('Error sending notification via WebSocket:', error)
    }

    // TODO: Brancher FCM pour les push notifications

    return notification
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
    // TODO: SMS/Email provider
    console.log(`[NOTIFY contact:${contact}] ${title} - ${body}`, data ?? {})
  }
}


