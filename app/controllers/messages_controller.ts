import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import Conversation from '#models/conversation'
import Message from '#models/message'
import { CreateMessageValidator } from '#validators/message'
import { getRealtimeEventBus } from '#services/realtime_event_bus'
import { ensureUuid } from '#utils/uuid'
import User from '#models/user'
import Property from '#models/property'

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
          userQuery.select(['id', 'uuid', 'fullName', 'email'])
        })
        .preload('user2', (userQuery) => {
          userQuery.select(['id', 'uuid', 'fullName', 'email'])
        })
        .preload('property', (propertyQuery) => {
          propertyQuery.select(['id', 'uuid', 'name', 'address', 'city', 'mainPhotoUrl'])
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
              senderQuery.select(['id', 'uuid', 'fullName'])
            })
        : []

      const lastMessagesMap = new Map(lastMessages.map((msg) => [msg.id, msg]))

      const formattedConversations = conversations.map((conv) => {
        const otherUser = conv.user1Id === user.id ? conv.user2 : conv.user1
        const lastMessage = conv.lastMessageId ? lastMessagesMap.get(conv.lastMessageId) : null

        return {
          id: conv.uuid,
          otherUser: {
            id: otherUser?.uuid || null,
            fullName: otherUser?.fullName || 'Utilisateur inconnu',
            email: otherUser?.email || null,
          },
          property: conv.property
            ? {
                id: conv.property.uuid,
                name: conv.property.name,
                address: conv.property.address,
                city: conv.property.city,
                mainPhotoUrl: conv.property.mainPhotoUrl,
              }
            : null,
          lastMessage: lastMessage
            ? {
                id: lastMessage.uuid,
                content: lastMessage.content,
                senderId: lastMessage.sender?.uuid ?? null,
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
      logger.error('Error in MessagesController.index:', error)
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

    ensureUuid(params.id, 'UUID de conversation invalide')

    try {
      const conversation = await Conversation.findBy('uuid', params.id)
      if (!conversation) {
        return response.notFound({ message: 'Conversation introuvable' })
      }

      // Vérifier que l'utilisateur fait partie de la conversation
      if (conversation.user1Id !== user.id && conversation.user2Id !== user.id) {
        return response.forbidden({ message: "Vous n'avez pas accès à cette conversation" })
      }

      const messages = await Message.query()
        .where('conversation_id', conversation.id)
        .preload('sender', (senderQuery) => {
          senderQuery.select(['id', 'uuid', 'fullName', 'email'])
        })
        .orderBy('created_at', 'asc')

      // Marquer les messages comme lus
      await Message.query()
        .where('conversation_id', conversation.id)
        .where('sender_id', '!=', user.id)
        .where('is_read', false)
        .update({ is_read: true })

      const formattedMessages = messages.map((msg) => ({
        id: msg.uuid,
        content: msg.content,
        type: msg.type,
        senderId: msg.sender?.uuid ?? null,
        sender: msg.sender
          ? {
              id: msg.sender.uuid,
              fullName: msg.sender.fullName,
            }
          : {
              id: null,
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
      logger.error('Error in MessagesController.getMessages:', error)
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
      const payload = await request.validateUsing(CreateMessageValidator)

      let conversation: Conversation | null = null

      // Si conversationId est fourni, utiliser la conversation existante
      if (payload.conversationId) {
        ensureUuid(payload.conversationId, 'UUID de conversation invalide')
        conversation = await Conversation.findBy('uuid', payload.conversationId)
        if (!conversation) {
          return response.notFound({ message: 'Conversation introuvable' })
        }

        // Vérifier que l'utilisateur fait partie de la conversation
        if (conversation.user1Id !== user.id && conversation.user2Id !== user.id) {
          return response.forbidden({ message: "Vous n'avez pas accès à cette conversation" })
        }
      } else if (payload.recipientId) {
        // Créer ou récupérer une conversation existante
        ensureUuid(payload.recipientId, 'UUID de destinataire invalide')
        const recipient = await User.findBy('uuid', payload.recipientId)
        if (!recipient) {
          return response.notFound({ message: 'Destinataire introuvable' })
        }
        const propertyId = payload.propertyId || null
        let resolvedPropertyId: number | null = null
        if (propertyId) {
          ensureUuid(propertyId, 'UUID de propriété invalide')
          const property = await Property.findBy('uuid', propertyId)
          if (!property) {
            return response.notFound({ message: 'Propriété introuvable' })
          }
          resolvedPropertyId = property.id
        }


        // Chercher une conversation existante (avec propertyId si fourni)
        // Construire la requête avec les conditions appropriées
        const queryBuilder = Conversation.query()
          .where((q) => {
            q.where((subQ) => {
              subQ.where('user1_id', user.id).where('user2_id', recipient.id)
            }).orWhere((subQ) => {
              subQ.where('user1_id', recipient.id).where('user2_id', user.id)
            })
          })

        // Ajouter la condition pour propertyId
        if (resolvedPropertyId) {
          queryBuilder.where('property_id', resolvedPropertyId)
        } else {
          queryBuilder.whereNull('property_id')
        }

        conversation = await queryBuilder.first()

        // Si aucune conversation n'existe, en créer une nouvelle
        if (!conversation) {
          try {
            conversation = await Conversation.create({
              user1Id: user.id < recipient.id ? user.id : recipient.id,
              user2Id: user.id < recipient.id ? recipient.id : user.id,
              propertyId: resolvedPropertyId,
            })
          } catch (createError: any) {
            logger.error('MessagesController.store: Error creating conversation:', createError)
            // Si l'erreur est due à une contrainte unique, réessayer de trouver la conversation
            if (
              createError.code === 'ER_DUP_ENTRY' ||
              createError.code === 1062 ||
              createError.message?.includes('unique constraint') ||
              createError.message?.includes('Duplicate entry')
            ) {
              // Une conversation a été créée entre-temps, la récupérer
              // Reconstruire la requête
              const retryQuery = Conversation.query()
                .where((q) => {
                  q.where((subQ) => {
                    subQ.where('user1_id', user.id).where('user2_id', recipient.id)
                  }).orWhere((subQ) => {
                    subQ.where('user1_id', recipient.id).where('user2_id', user.id)
                  })
                })
              if (resolvedPropertyId) {
                retryQuery.where('property_id', resolvedPropertyId)
              } else {
                retryQuery.whereNull('property_id')
              }
              conversation = await retryQuery.first()
              if (!conversation) {
                logger.error('MessagesController.store: Conversation still not found after duplicate error')
                throw createError
              }
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
      const message = await Message.create({
        conversationId: conversation.id,
        senderId: user.id,
        content: payload.content,
        type: payload.type || 'text',
        isRead: false,
      })

      // Mettre à jour la conversation avec le dernier message
      await conversation.merge({ lastMessageId: message.id }).save()

      // Précharger les relations pour la réponse
      await message.load('sender', (senderQuery) => {
        senderQuery.select(['id', 'uuid', 'fullName', 'email'])
      })

      // Vérifier que sender est bien chargé
      if (!message.sender) {
        logger.warn('MessagesController.store: Sender not loaded for message:', message.id)
        // Recharger le message avec sender
        await message.refresh()
        await message.load('sender', (senderQuery) => {
          senderQuery.select(['id', 'uuid', 'fullName', 'email'])
        })
      }

      // Préparer la réponse immédiatement pour un envoi instantané
      const responseData = {
        message: 'Message envoyé avec succès',
        data: {
          id: message.uuid,
          content: message.content,
          type: message.type,
          senderId: message.sender?.uuid ?? user.uuid,
          sender: message.sender
            ? {
                id: message.sender.uuid,
                fullName: message.sender.fullName,
              }
            : {
                id: user.uuid,
                fullName: user.fullName || 'Utilisateur',
              },
          conversationId: conversation.uuid,
          createdAt: message.createdAt.toISO(),
        },
      }

      // Publier l'événement temps réel via Redis (fan-out par listener)
      const recipientId = conversation.getOtherUserId(user.id)
      const eventBus = getRealtimeEventBus()
      await eventBus.publish({
        type: 'message.created',
        payload: {
          recipientId,
          senderId: user.id,
          clientId: payload.clientId || null,
          message: {
            id: message.uuid,
            content: message.content,
            senderId: message.sender?.uuid ?? user.uuid,
            sender: message.sender
              ? {
                  id: message.sender.uuid,
                  fullName: message.sender.fullName,
                }
              : {
                  id: user.uuid,
                  fullName: user.fullName || 'Utilisateur',
                },
            conversationId: conversation.uuid,
            createdAt: message.createdAt.toISO(),
          },
        },
      })

      // Retourner la réponse immédiatement
      return response.created(responseData)
    } catch (error: any) {
      logger.error('Error in MessagesController.store:', {
        error: error.message,
        stack: error.stack,
        name: error.name,
        code: error.code,
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

    ensureUuid(params.id, 'UUID de message invalide')

    try {
      const message = await Message.findBy('uuid', params.id)
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
      logger.error('Error in MessagesController.markAsRead:', error)
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
      logger.error('Error in MessagesController.unreadCount:', error)
      return response.internalServerError({
        message: 'Erreur lors du comptage des messages non lus',
        error: error.message,
      })
    }
  }
}
