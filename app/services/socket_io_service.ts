import type { Server as HTTPServer } from 'node:http'
import logger from '@adonisjs/core/services/logger'
import { Server as SocketIOServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { createClient } from 'redis'
import Conversation from '#models/conversation'
import NotificationsService from '#services/notifications_service'
import { getWebSocketService } from '#services/websocket_service'
import { getRealtimeEventBus } from '#services/realtime_event_bus'

export default class SocketIoService {
  private io: SocketIOServer | null = null
  private _finishInitStarted = false
  private _finishInitDone = false

  /**
   * Attach Socket.IO to an HTTP server synchronously.
   * Call this when creating the Node HTTP server (e.g. custom createServer factory).
   * Then call scheduleFinishInit() or initialize() to complete Redis/event-bus setup.
   */
  attachToServer(httpServer: HTTPServer): void {
    if (this.io) {
      return
    }

    const io = new SocketIOServer(httpServer, {
      path: '/socket.io',
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    })

    io.use(async (socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.replace('Bearer ', '') ||
          socket.handshake.query?.token

        if (!token || typeof token !== 'string') {
          return next(new Error('Unauthorized'))
        }

        const websocketService = getWebSocketService()
        const user = await websocketService.authenticateTokenString(token)
        if (!user) {
          return next(new Error('Unauthorized'))
        }

        socket.data.userId = user.id
        socket.data.userUuid = user.uuid
        return next()
      } catch (error) {
        return next(new Error('Unauthorized'))
      }
    })

    io.on('connection', (socket) => {
      const userId = socket.data.userId as number
      socket.join(`user:${userId}`)
      logger.info(`Socket.IO connected user:${userId}`)

      socket.on('conversations:join', async (conversationIds: string[]) => {
        if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
          return
        }
        const rows = await Conversation.query()
          .whereIn('uuid', conversationIds)
          .where((q) => {
            q.where('user1_id', userId).orWhere('user2_id', userId)
          })
          .select(['uuid'])

        rows.forEach((conversation) => {
          socket.join(`conversations:${conversation.uuid}`)
        })
      })

      socket.on('conversations:leave', (conversationIds: string[]) => {
        if (!Array.isArray(conversationIds)) {
          return
        }
        conversationIds.forEach((id) => socket.leave(`conversations:${id}`))
      })

      socket.on('property:subscribe', (propertyId: string) => {
        if (propertyId) {
          socket.join(`property:${propertyId}`)
        }
      })

      socket.on('property:unsubscribe', (propertyId: string) => {
        if (propertyId) {
          socket.leave(`property:${propertyId}`)
        }
      })
    })

    this.io = io
    logger.info('[OK] Socket.IO attached to HTTP server')
  }

  /** Schedule async setup (Redis, event bus) after attach. Use when not calling initialize(). */
  scheduleFinishInit(): void {
    if (this._finishInitStarted) return
    this._finishInitStarted = true
    setImmediate(() => {
      void this.finishInit()
    })
  }

  /**
   * Async setup: Redis adapter, event bus, event handlers.
   */
  private async finishInit(): Promise<void> {
    if (!this.io) return
    if (this._finishInitDone) return
    this._finishInitDone = true

    const redisUrl = process.env.REDIS_URL
    if (redisUrl) {
      try {
        const pubClient = createClient({
          url: redisUrl,
          socket: { reconnectStrategy: () => false },
        })
        const subClient = pubClient.duplicate()
        await Promise.all([pubClient.connect(), subClient.connect()])
        this.io.adapter(createAdapter(pubClient, subClient))
      } catch (error) {
        logger.warn('Redis adapter not available, using in-memory adapter', error)
      }
    } else {
      logger.warn('REDIS_URL not set, using in-memory adapter')
    }

    const eventBus = getRealtimeEventBus()
    await eventBus.initialize()
    eventBus.on(async (event) => {
      if (!this.io) return

      if (event.type === 'message.created') {
        const { recipientId, senderId, message, clientId } = event.payload
        this.io.to(`user:${recipientId}`).emit('message:received', message)
        this.io.to(`user:${senderId}`).emit('message:ack', { clientId, message })
        try {
          const notifier = new NotificationsService()
          await notifier.sendFcmOnly(
            recipientId,
            'Nouveau message',
            message?.content?.substring(0, 50) ?? 'Nouveau message',
            {
              conversationId: String(message.conversationId),
              messageId: String(message.id),
              type: 'message',
            }
          )
        } catch (error) {
          logger.warn('Failed to send FCM for message', error)
        }
      }

      if (event.type === 'notification.created') {
        const { userId, notification } = event.payload
        this.io.to(`user:${userId}`).emit('notification:received', {
          type: 'notification:received',
          data: notification,
        })
      }

      if (event.type === 'slot.updated') {
        const { propertyId, slot } = event.payload
        this.io.to(`property:${propertyId}`).emit('slot:updated', {
          type: 'slot:updated',
          propertyId,
          slot,
        })
      }
    })
  }

  async initialize(httpServer: HTTPServer) {
    if (this.io) return
    this.attachToServer(httpServer)
    this._finishInitStarted = true
    await this.finishInit()
  }

  async close() {
    if (this.io) {
      await this.io.close()
      this.io = null
    }
  }
}

let socketIoService: SocketIoService | null = null

export function getSocketIoService(): SocketIoService {
  if (!socketIoService) {
    socketIoService = new SocketIoService()
  }
  return socketIoService
}
