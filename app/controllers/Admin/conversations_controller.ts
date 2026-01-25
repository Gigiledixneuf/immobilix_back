import type { HttpContext } from '@adonisjs/core/http'
import Conversation from '#models/conversation'
import Message from '#models/message'
import User from '#models/user'
import { ensureUuid } from '#utils/uuid'

/**
 * Contrôleur pour la gestion des conversations par l'admin
 */
export default class AdminConversationsController {
  /**
   * Vérifie que l'utilisateur a un rôle admin
   */
  private async checkAdminRole(user: User): Promise<boolean> {
    await user.load('roles')
    const adminRoles = ['super_admin', 'admin', 'moderator']
    const userRoles = user.roles?.map((r) => r.name) || []
    return userRoles.some((role) => adminRoles.includes(role))
  }

  /**
   * Liste toutes les conversations avec pagination
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({
        status: 'error',
        message: 'Non authentifié',
      })
    }

    const isAdmin = await this.checkAdminRole(user)
    if (!isAdmin) {
      return response.forbidden({
        status: 'error',
        message: 'Accès refusé. Rôle administrateur requis.',
      })
    }

    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 20)

      const conversations = await Conversation.query()
        .preload('user1')
        .preload('user2')
        .preload('property')
        .preload('lastMessage', (query) => {
          query.preload('sender')
        })
        .orderBy('updated_at', 'desc')
        .paginate(page, limit)

      return response.ok(conversations)
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des conversations',
        error: error.message,
      })
    }
  }

  /**
   * Affiche une conversation spécifique avec ses messages
   */
  async show({ auth, params, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({
        status: 'error',
        message: 'Non authentifié',
      })
    }

    const isAdmin = await this.checkAdminRole(user)
    if (!isAdmin) {
      return response.forbidden({
        status: 'error',
        message: 'Accès refusé. Rôle administrateur requis.',
      })
    }

    try {
      ensureUuid(params.id, 'UUID conversation invalide')
      const page = request.input('page', 1)
      const limit = request.input('limit', 50)

      const conversation = await Conversation.query()
        .where('uuid', params.id)
        .preload('user1')
        .preload('user2')
        .preload('property')
        .first()

      if (!conversation) {
        return response.notFound({
          status: 'error',
          message: 'Conversation introuvable',
        })
      }

      // Récupérer les messages avec pagination
      const messages = await Message.query()
        .where('conversation_id', conversation.id)
        .preload('sender')
        .orderBy('created_at', 'desc')
        .paginate(page, limit)

      return response.ok({
        conversation,
        messages,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération de la conversation',
        error: error.message,
      })
    }
  }
}
