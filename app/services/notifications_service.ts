import Notification from '#models/notification'

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

    // TODO: Envoyer via WebSocket en temps réel
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


