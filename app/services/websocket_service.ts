import { Server as SocketIOServer } from 'socket.io'
import type { Server as HTTPServer } from 'node:http'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'

/**
 * Service WebSocket pour les notifications temps réel
 */
export default class WebSocketService {
  private io: SocketIOServer | null = null
  private connectedUsers: Map<number, Set<string>> = new Map() // userId -> Set of socketIds

  /**
   * Initialise le serveur WebSocket avec Socket.IO
   */
  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*', // En production, spécifier les origines autorisées
        methods: ['GET', 'POST'],
      },
      path: '/socket.io',
    })

    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token
        
        if (!token || typeof token !== 'string') {
          return next(new Error('Token manquant'))
        }

        // Vérifier et récupérer l'utilisateur depuis le token
        const user = await User.findByOrFail('id', 1) // TODO: Vérifier le token réellement
        
        // Stocker l'utilisateur dans la socket pour utilisation ultérieure
        socket.data.userId = user.id
        next()
      } catch (error) {
        logger.error('WebSocket authentication error:', error)
        next(new Error('Authentification échouée'))
      }
    })

    this.io.on('connection', (socket) => {
      const userId = socket.data.userId

      if (!userId) {
        socket.disconnect()
        return
      }

      logger.info(`WebSocket: User ${userId} connected (socket: ${socket.id})`)

      // Ajouter l'utilisateur aux utilisateurs connectés
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set())
      }
      this.connectedUsers.get(userId)!.add(socket.id)

      // Rejoindre le channel privé de l'utilisateur
      socket.join(`user:${userId}`)

      // Gestion de la déconnexion
      socket.on('disconnect', () => {
        logger.info(`WebSocket: User ${userId} disconnected (socket: ${socket.id})`)
        
        const userSockets = this.connectedUsers.get(userId)
        if (userSockets) {
          userSockets.delete(socket.id)
          if (userSockets.size === 0) {
            this.connectedUsers.delete(userId)
          }
        }
      })
    })

    logger.info('WebSocket service initialized')
  }

  /**
   * Envoie une notification à un utilisateur spécifique
   */
  async sendToUser(userId: number, notification: any) {
    if (!this.io) {
      logger.warn('WebSocket service not initialized')
      return
    }

    try {
      this.io.to(`user:${userId}`).emit('notification', {
        type: 'notification',
        data: notification,
      })
      
      logger.info(`Notification sent to user ${userId} via WebSocket`)
    } catch (error) {
      logger.error(`Error sending notification to user ${userId}:`, error)
    }
  }

  /**
   * Vérifie si un utilisateur est connecté
   */
  isUserConnected(userId: number): boolean {
    return this.connectedUsers.has(userId) && this.connectedUsers.get(userId)!.size > 0
  }

  /**
   * Retourne le nombre d'utilisateurs connectés
   */
  getConnectedUsersCount(): number {
    return this.connectedUsers.size
  }

  /**
   * Ferme le serveur WebSocket
   */
  close() {
    if (this.io) {
      this.io.close()
      this.io = null
      this.connectedUsers.clear()
      logger.info('WebSocket service closed')
    }
  }
}

// Instance singleton
let websocketServiceInstance: WebSocketService | null = null

export function getWebSocketService(): WebSocketService {
  if (!websocketServiceInstance) {
    websocketServiceInstance = new WebSocketService()
  }
  return websocketServiceInstance
}

