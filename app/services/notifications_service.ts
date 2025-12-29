import Notification from '#models/notification'
import FirebaseService from '#services/firebase_service'

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
        notificationId: String(notification.id),
        type: notification.type,
      }

      await FirebaseService.sendToUser(userId, title, message, finalFcmData)
    } catch (error: any) {
      // Ne pas bloquer si FCM échoue
      const logger = await import('@adonisjs/core/services/logger')
      logger.default.warn('Error sending notification via FCM:', error?.message || String(error))
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
      // Ne pas bloquer si FCM échoue
      const logger = await import('@adonisjs/core/services/logger')
      logger.default.warn('Error sending FCM notification:', error?.message || String(error))
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
    // TODO: SMS/Email provider
    console.log(`[NOTIFY contact:${contact}] ${title} - ${body}`, data ?? {})
  }
}


