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

    // Envoyer via WebSocket en temps réel
    try {
      // Importer dynamiquement pour éviter les erreurs si le service n'est pas disponible
      // Utiliser un chemin relatif avec l'extension .js pour ESM
      const websocketModule = await import('#services/websocket_service')
      const websocketService = websocketModule.getWebSocketService()
      await websocketService.sendToUser(userId, notification)
    } catch (error: any) {
      // Ne pas bloquer si WebSocket échoue (l'utilisateur récupérera la notification à la prochaine connexion)
      // Logger l'erreur mais continuer l'exécution
      const logger = await import('@adonisjs/core/services/logger')
      logger.default.warn('Error sending notification via WebSocket:', error?.message || String(error))
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


