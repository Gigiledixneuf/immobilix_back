import { WebSocketServer, WebSocket } from 'ws'
import type { Server as HTTPServer } from 'node:http'
import { URL } from 'node:url'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import Notification from '#models/notification'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'

/**
 * Service WebSocket natif pour les notifications temps réel
 * Compatible avec web_socket_channel (Flutter)
 */
export default class WebSocketService {
  private wss: WebSocketServer | null = null
  private connectedUsers: Map<number, Set<WebSocket>> = new Map() // userId -> Set of WebSockets

  /**
   * Initialise le serveur WebSocket natif
   */
  initialize(httpServer: HTTPServer) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: '/notifications',
    })

    this.wss.on('connection', async (ws: WebSocket, req) => {
      try {
        // Extraire le token de l'URL
        const url = new URL(req.url || '', `http://${req.headers.host}`)
        const token = url.searchParams.get('token')

        if (!token) {
          logger.warn('WebSocket connection rejected: no token')
          ws.close(1008, 'Token manquant')
          return
        }

        // Vérifier le token et récupérer l'utilisateur
        const user = await this.authenticateToken(token)

        if (!user) {
          logger.warn('WebSocket connection rejected: invalid token')
          ws.close(1008, 'Authentification échouée')
          return
        }

        const userId = user.id
        logger.info(`WebSocket: User ${userId} connected`)

        // Ajouter l'utilisateur aux utilisateurs connectés
        if (!this.connectedUsers.has(userId)) {
          this.connectedUsers.set(userId, new Set())
        }
        this.connectedUsers.get(userId)!.add(ws)

        // Envoyer un message de bienvenue
        ws.send(
          JSON.stringify({
            type: 'connected',
            message: 'Connexion WebSocket établie',
          })
        )

        // Gestion des messages entrants (ping/pong)
        ws.on('message', async (data) => {
          try {
            const message = JSON.parse(data.toString())
            if (message.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }))
            }
          } catch (error) {
            // Ignorer les erreurs de parsing
          }
        })

        // Gestion de la déconnexion
        ws.on('close', () => {
          logger.info(`WebSocket: User ${userId} disconnected`)

          const userSockets = this.connectedUsers.get(userId)
          if (userSockets) {
            userSockets.delete(ws)
            if (userSockets.size === 0) {
              this.connectedUsers.delete(userId)
            }
          }
        })

        // Gestion des erreurs
        ws.on('error', (error) => {
          logger.error(`WebSocket error for user ${userId}:`, error)
        })
      } catch (error) {
        logger.error('Error in WebSocket connection:', error)
        ws.close(1011, 'Erreur serveur')
      }
    })

    logger.info('WebSocket service initialized on path /notifications')
  }

  /**
   * Authentifie un token AdonisJS access token
   */
  private async authenticateToken(token: string): Promise<User | null> {
    try {
      // Utiliser le provider de tokens d'AdonisJS
      const tokensProvider = User.accessTokens
      
      // Vérifier le token - la méthode verify retourne l'utilisateur directement
      const user = await tokensProvider.verify(token)
      
      return user || null
    } catch (error) {
      logger.error('Token authentication error:', error)
      return null
    }
  }

  /**
   * Envoie une notification à un utilisateur spécifique
   */
  async sendToUser(userId: number, notification: Notification) {
    if (!this.wss) {
      logger.warn('WebSocket service not initialized')
      return
    }

    const userSockets = this.connectedUsers.get(userId)
    if (!userSockets || userSockets.size === 0) {
      logger.debug(`User ${userId} is not connected, notification will be retrieved on next connection`)
      return
    }

    try {
      const notificationData = {
        type: 'notification',
        data: {
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          isRead: notification.isRead,
          data: notification.data,
          createdAt: notification.createdAt.toISO(),
        },
      }

      // Envoyer à toutes les connexions WebSocket de l'utilisateur
      const message = JSON.stringify(notificationData)
      userSockets.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message)
        }
      })

      logger.info(`Notification sent to user ${userId} via WebSocket (${userSockets.size} connection(s))`)
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
    if (this.wss) {
      this.wss.close()
      this.wss = null
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
