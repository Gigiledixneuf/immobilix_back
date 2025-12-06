import type { HttpContext } from '@adonisjs/core/http'
import Notification from '#models/notification'

export default class NotificationsController {
  /**
   * GET /api/notifications
   * Récupère toutes les notifications de l'utilisateur authentifié
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user!
    
    const notifications = await Notification.query()
      .where('user_id', user.id)
      .orderBy('created_at', 'desc')

    return response.ok({
      message: 'Notifications récupérées avec succès',
      data: notifications,
    })
  }

  /**
   * PUT /api/notifications/:id/read
   * Marque une notification comme lue
   */
  async markAsRead({ params, auth, response }: HttpContext) {
    const user = auth.user!
    const notification = await Notification.find(params.id)

    if (!notification) {
      return response.notFound({ message: 'Notification introuvable' })
    }

    if (notification.userId !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à modifier cette notification" })
    }

    notification.isRead = true
    await notification.save()

    return response.ok({
      message: 'Notification marquée comme lue',
      data: notification,
    })
  }

  /**
   * PUT /api/notifications/read-all
   * Marque toutes les notifications de l'utilisateur comme lues
   */
  async markAllAsRead({ auth, response }: HttpContext) {
    const user = auth.user!

    await Notification.query()
      .where('user_id', user.id)
      .where('is_read', false)
      .update({ is_read: true })

    return response.ok({
      message: 'Toutes les notifications ont été marquées comme lues',
    })
  }

  /**
   * DELETE /api/notifications/:id
   * Supprime une notification
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.user!
    const notification = await Notification.find(params.id)

    if (!notification) {
      return response.notFound({ message: 'Notification introuvable' })
    }

    if (notification.userId !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à supprimer cette notification" })
    }

    await notification.delete()

    return response.ok({
      message: 'Notification supprimée avec succès',
    })
  }
}



