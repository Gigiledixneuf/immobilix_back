import type { HttpContext } from '@adonisjs/core/http'
import Conversation from '#models/conversation'
import Message from '#models/message'
import { CreateMessageValidator } from '#validators/message'
import NotificationsService from '#services/notifications_service'
import { getWebSocketService } from '#services/websocket_service'

export default class MessagesController {
  /**
   * GET /api/conversations
   * Liste toutes les conversations de l'utilisateur connecté
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      const conversations = await Conversation.query()
        .where((query) => {
          query.where('user1_id', user.id).orWhere('user2_id', user.id)
        })
        .preload('user1', (userQuery) => {
          userQuery.select(['id', 'fullName', 'email'])
        })
        .preload('user2', (userQuery) => {
          userQuery.select(['id', 'fullName', 'email'])
        })
        .preload('property', (propertyQuery) => {
          propertyQuery.select(['id', 'name', 'address', 'city', 'mainPhotoUrl'])
        })
        .orderBy('updated_at', 'desc')

      // Charger les lastMessage manuellement pour éviter les erreurs si lastMessageId est null
      const lastMessageIds = conversations
        .filter((conv) => conv.lastMessageId !== null)
        .map((conv) => conv.lastMessageId!)
        .filter((id, index, self) => self.indexOf(id) === index) // Unique IDs

      const lastMessages = lastMessageIds.length > 0
        ? await Message.query()
            .whereIn('id', lastMessageIds)
            .preload('sender', (senderQuery) => {
              senderQuery.select(['id', 'fullName'])
            })
        : []

      const lastMessagesMap = new Map(lastMessages.map((msg) => [msg.id, msg]))

      const formattedConversations = conversations.map((conv) => {
        const otherUser = conv.user1Id === user.id ? conv.user2 : conv.user1
        const lastMessage = conv.lastMessageId ? lastMessagesMap.get(conv.lastMessageId) : null

        return {
          id: conv.id,
          otherUser: {
            id: otherUser?.id || 0,
            fullName: otherUser?.fullName || 'Utilisateur inconnu',
            email: otherUser?.email || null,
          },
          property: conv.property
            ? {
                id: conv.property.id,
                name: conv.property.name,
                address: conv.property.address,
                city: conv.property.city,
                mainPhotoUrl: conv.property.mainPhotoUrl,
              }
            : null,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                content: lastMessage.content,
                senderId: lastMessage.senderId,
                createdAt: lastMessage.createdAt.toISO(),
              }
            : null,
          updatedAt: conv.updatedAt.toISO(),
        }
      })

      return response.ok({
        data: formattedConversations,
        count: formattedConversations.length,
      })
    } catch (error: any) {
      console.error('Error in MessagesController.index:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération des conversations',
        error: error.message,
        stack: error.stack,
      })
    }
  }

  /**
   * GET /api/conversations/:id/messages
   * Récupère tous les messages d'une conversation
   */
  async getMessages({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const conversationId = Number(params.id)

    try {
      const conversation = await Conversation.find(conversationId)
      if (!conversation) {
        return response.notFound({ message: 'Conversation introuvable' })
      }

      // Vérifier que l'utilisateur fait partie de la conversation
      if (conversation.user1Id !== user.id && conversation.user2Id !== user.id) {
        return response.forbidden({ message: "Vous n'avez pas accès à cette conversation" })
      }

      const messages = await Message.query()
        .where('conversation_id', conversationId)
        .preload('sender', (senderQuery) => {
          senderQuery.select(['id', 'fullName', 'email'])
        })
        .orderBy('created_at', 'asc')

      // Marquer les messages comme lus
      await Message.query()
        .where('conversation_id', conversationId)
        .where('sender_id', '!=', user.id)
        .where('is_read', false)
        .update({ is_read: true })

      const formattedMessages = messages.map((msg) => ({
        id: msg.id,
        content: msg.content,
        type: msg.type,
        senderId: msg.senderId,
        sender: msg.sender
          ? {
              id: msg.sender.id,
              fullName: msg.sender.fullName,
            }
          : {
              id: msg.senderId,
              fullName: 'Utilisateur inconnu',
            },
        isRead: msg.isRead,
        createdAt: msg.createdAt.toISO(),
      }))

      return response.ok({
        data: formattedMessages,
        count: formattedMessages.length,
      })
    } catch (error: any) {
      console.error('Error in MessagesController.getMessages:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération des messages',
        error: error.message,
        stack: error.stack,
      })
    }
  }

  /**
   * POST /api/messages
   * Envoie un nouveau message
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      console.log('MessagesController.store: Starting message creation')
      const payload = await request.validateUsing(CreateMessageValidator)
      console.log('MessagesController.store: Payload validated:', { 
        conversationId: payload.conversationId, 
        recipientId: payload.recipientId,
        propertyId: payload.propertyId,
        contentLength: payload.content?.length 
      })

      let conversation: Conversation | null = null

      // Si conversationId est fourni, utiliser la conversation existante
      if (payload.conversationId) {
        conversation = await Conversation.find(payload.conversationId)
        if (!conversation) {
          return response.notFound({ message: 'Conversation introuvable' })
        }

        // Vérifier que l'utilisateur fait partie de la conversation
        if (conversation.user1Id !== user.id && conversation.user2Id !== user.id) {
          return response.forbidden({ message: "Vous n'avez pas accès à cette conversation" })
        }
      } else if (payload.recipientId) {
        // Créer ou récupérer une conversation existante
        const recipientId = payload.recipientId
        const propertyId = payload.propertyId || null

        console.log('MessagesController.store: Looking for conversation', { 
          userId: user.id, 
          recipientId, 
          propertyId 
        })

        // Chercher une conversation existante (avec propertyId si fourni)
        // Construire la requête avec les conditions appropriées
        const queryBuilder = Conversation.query()
          .where((q) => {
            q.where((subQ) => {
              subQ.where('user1_id', user.id).where('user2_id', recipientId)
            }).orWhere((subQ) => {
              subQ.where('user1_id', recipientId).where('user2_id', user.id)
            })
          })

        // Ajouter la condition pour propertyId
        if (propertyId) {
          queryBuilder.where('property_id', propertyId)
        } else {
          queryBuilder.whereNull('property_id')
        }

        conversation = await queryBuilder.first()
        console.log('MessagesController.store: Conversation found:', conversation ? conversation.id : 'none')

        // Si aucune conversation n'existe, en créer une nouvelle
        if (!conversation) {
          console.log('MessagesController.store: Creating new conversation')
          try {
            conversation = await Conversation.create({
              user1Id: user.id < recipientId ? user.id : recipientId,
              user2Id: user.id < recipientId ? recipientId : user.id,
              propertyId: propertyId,
            })
            console.log('MessagesController.store: Conversation created:', conversation.id)
          } catch (createError: any) {
            console.error('MessagesController.store: Error creating conversation:', createError)
            // Si l'erreur est due à une contrainte unique, réessayer de trouver la conversation
            if (
              createError.code === 'ER_DUP_ENTRY' ||
              createError.code === 1062 ||
              createError.message?.includes('unique constraint') ||
              createError.message?.includes('Duplicate entry')
            ) {
              console.log('MessagesController.store: Duplicate entry, retrying query')
              // Une conversation a été créée entre-temps, la récupérer
              // Reconstruire la requête
              const retryQuery = Conversation.query()
                .where((q) => {
                  q.where((subQ) => {
                    subQ.where('user1_id', user.id).where('user2_id', recipientId)
                  }).orWhere((subQ) => {
                    subQ.where('user1_id', recipientId).where('user2_id', user.id)
                  })
                })
              if (propertyId) {
                retryQuery.where('property_id', propertyId)
              } else {
                retryQuery.whereNull('property_id')
              }
              conversation = await retryQuery.first()
              if (!conversation) {
                console.error('MessagesController.store: Conversation still not found after duplicate error')
                throw createError
              }
              console.log('MessagesController.store: Conversation found after retry:', conversation.id)
            } else {
              throw createError
            }
          }
        }
      } else {
        return response.badRequest({
          message: 'conversationId ou recipientId est requis',
        })
      }

      // Créer le message
      console.log('MessagesController.store: Creating message', { 
        conversationId: conversation.id, 
        senderId: user.id 
      })
      const message = await Message.create({
        conversationId: conversation.id,
        senderId: user.id,
        content: payload.content,
        type: payload.type || 'text',
        isRead: false,
      })
      console.log('MessagesController.store: Message created:', message.id)

      // Mettre à jour la conversation avec le dernier message
      await conversation.merge({ lastMessageId: message.id }).save()

      // Précharger les relations pour la réponse
      await message.load('sender', (senderQuery) => {
        senderQuery.select(['id', 'fullName', 'email'])
      })

      // Vérifier que sender est bien chargé
      if (!message.sender) {
        console.error('MessagesController.store: Sender not loaded for message:', message.id)
        // Recharger le message avec sender
        await message.refresh()
        await message.load('sender', (senderQuery) => {
          senderQuery.select(['id', 'fullName', 'email'])
        })
      }

      // Préparer la réponse immédiatement pour un envoi instantané
      const responseData = {
        message: 'Message envoyé avec succès',
        data: {
          id: message.id,
          content: message.content,
          type: message.type,
          senderId: message.senderId,
          sender: message.sender
            ? {
                id: message.sender.id,
                fullName: message.sender.fullName,
              }
            : {
                id: user.id,
                fullName: user.fullName || 'Utilisateur',
              },
          conversationId: conversation.id,
          createdAt: message.createdAt.toISO(),
        },
      }

      // Envoyer les notifications de manière asynchrone (ne pas bloquer la réponse)
      const recipientId = conversation.getOtherUserId(user.id)
      
      // WebSocket et FCM en parallèle et asynchrone (fire and forget)
      setImmediate(async () => {
        try {
          // Envoyer WebSocket et FCM en parallèle
          const [wsResult, fcmResult] = await Promise.allSettled([
            (async () => {
              const websocketService = getWebSocketService()
              await websocketService.sendMessageToUser(recipientId, {
                type: 'new_message',
                conversationId: conversation.id,
                message: {
                  id: message.id,
                  content: message.content,
                  senderId: message.senderId,
                  sender: message.sender
                    ? {
                        id: message.sender.id,
                        fullName: message.sender.fullName,
                      }
                    : {
                        id: user.id,
                        fullName: user.fullName || 'Utilisateur',
                      },
                  createdAt: message.createdAt.toISO(),
                },
              })
            })(),
            (async () => {
              const notifier = new NotificationsService()
              await notifier.sendFcmOnly(
                recipientId,
                'Nouveau message',
                `${user.fullName}: ${payload.content.substring(0, 50)}${payload.content.length > 50 ? '...' : ''}`,
                {
                  conversationId: String(conversation.id),
                  messageId: String(message.id),
                  type: 'message',
                }
              )
            })(),
          ])

          // Logger les erreurs si nécessaire
          if (wsResult.status === 'rejected') {
            console.error('WebSocket error:', wsResult.reason)
          }
          if (fcmResult.status === 'rejected') {
            console.error('FCM notification error:', fcmResult.reason)
          }
        } catch (error) {
          // Logger les erreurs mais ne pas bloquer
          console.error('Error sending notifications:', error)
        }
      })

      // Retourner la réponse immédiatement
      return response.created(responseData)
    } catch (error: any) {
      console.error('Error in MessagesController.store:', error)
      console.error('Error stack:', error.stack)
      console.error('Error details:', {
        name: error.name,
        code: error.code,
        message: error.message,
        sql: error.sql,
        errno: error.errno,
        sqlState: error.sqlState,
      })
      
      if (error.messages) {
        return response.badRequest({
          message: 'Erreur de validation',
          errors: error.messages,
        })
      }

      return response.internalServerError({
        message: 'Erreur lors de l\'envoi du message',
        error: error.message,
        stack: error.stack,
        details: {
          name: error.name,
          code: error.code,
          sql: error.sql,
          errno: error.errno,
        },
      })
    }
  }

  /**
   * PATCH /api/messages/:id/read
   * Marque un message comme lu
   */
  async markAsRead({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const messageId = Number(params.id)

    try {
      const message = await Message.find(messageId)
      if (!message) {
        return response.notFound({ message: 'Message introuvable' })
      }

      // Vérifier que l'utilisateur n'est pas l'expéditeur
      if (message.senderId === user.id) {
        return response.badRequest({ message: 'Vous ne pouvez pas marquer votre propre message comme lu' })
      }

      // Vérifier que l'utilisateur fait partie de la conversation
      const conversation = await Conversation.find(message.conversationId)
      if (!conversation) {
        return response.notFound({ message: 'Conversation introuvable' })
      }

      if (conversation.user1Id !== user.id && conversation.user2Id !== user.id) {
        return response.forbidden({ message: "Vous n'avez pas accès à cette conversation" })
      }

      message.isRead = true
      await message.save()

      return response.ok({
        message: 'Message marqué comme lu',
        data: message,
      })
    } catch (error: any) {
      console.error('Error in MessagesController.markAsRead:', error)
      return response.internalServerError({
        message: 'Erreur lors de la mise à jour du message',
        error: error.message,
        stack: error.stack,
      })
    }
  }

  /**
   * GET /api/conversations/unread-count
   * Compte le nombre total de messages non lus de l'utilisateur
   */
  async unreadCount({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      // Récupérer toutes les conversations de l'utilisateur
      const conversations = await Conversation.query()
        .where((query) => {
          query.where('user1_id', user.id).orWhere('user2_id', user.id)
        })
        .select('id')

      const conversationIds = conversations.map((conv) => conv.id)

      // Compter les messages non lus dans ces conversations (pas envoyés par l'utilisateur)
      const unreadCount =
        conversationIds.length > 0
          ? await Message.query()
              .whereIn('conversation_id', conversationIds)
              .where('sender_id', '!=', user.id)
              .where('is_read', false)
              .count('* as total')
          : [{ $extras: { total: 0 } }]

      const count = Number(unreadCount[0].$extras.total)

      return response.ok({
        message: 'Nombre de messages non lus récupéré avec succès',
        data: {
          unreadCount: count,
        },
      })
    } catch (error: any) {
      console.error('Error in MessagesController.unreadCount:', error)
      return response.internalServerError({
        message: 'Erreur lors du comptage des messages non lus',
        error: error.message,
      })
    }
  }
}
