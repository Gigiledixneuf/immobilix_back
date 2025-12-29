import { WebSocketServer, WebSocket } from 'ws'
import type { IncomingMessage } from 'node:http'
import { URL } from 'node:url'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import Notification from '#models/notification'

/**
 * Service WebSocket natif pour les notifications temps réel
 * Compatible avec web_socket_channel (Flutter)
 * Utilise noServer: true pour gérer les upgrades manuellement
 */
export default class WebSocketService {
  private wss: WebSocketServer | null = null
  private connectedUsers: Map<number, Set<WebSocket>> = new Map() // userId -> Set of WebSockets

  /**
   * Initialise le serveur WebSocket avec noServer: true
   */
  initialize() {
    this.wss = new WebSocketServer({
      noServer: true,
      path: '/notifications',
    })

    // Utiliser console.log car logger peut ne pas être disponible lors de l'initialisation
    try {
      logger.info('WebSocket service initialized (noServer mode)')
    } catch {
      console.log('✅ WebSocket service initialized (noServer mode)')
    }
  }

  /**
   * Gère l'upgrade HTTP vers WebSocket
   * À appeler depuis un middleware ou un gestionnaire de route
   */
  async handleUpgrade(
    request: IncomingMessage,
    socket: any,
    head: Buffer
  ): Promise<boolean> {
    if (!this.wss) {
      logger.warn('WebSocket service not initialized')
      return false
    }

    try {
      // Extraire le token de l'URL
      const url = new URL(request.url || '', `http://${request.headers.host}`)
      
      // Vérifier que c'est le bon chemin
      if (!url.pathname.includes('/notifications')) {
        return false
      }

      const token = url.searchParams.get('token')

      if (!token) {
        logger.warn('WebSocket connection rejected: no token')
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return false
      }

      // Vérifier le token et récupérer l'utilisateur
      // Le token est passé comme string dans l'URL, on doit le vérifier
      const user = await this.authenticateToken(token)

      if (!user) {
        logger.warn('WebSocket connection rejected: invalid token')
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return false
      }

      // Accepter l'upgrade WebSocket
      this.wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        this.handleConnection(ws, request, user.id)
      })

      return true
    } catch (error) {
      logger.error('Error in WebSocket upgrade:', error)
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n')
      socket.destroy()
      return false
    }
  }

  /**
   * Gère une nouvelle connexion WebSocket
   */
  private handleConnection(ws: WebSocket, req: IncomingMessage, userId: number) {
    try {
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
  }

  /**
   * Authentifie un token AdonisJS access token
   */
  /**
   * Authentifie un token AdonisJS access token
   * Le problème: verify() attend un objet AccessTokenValue, pas une string
   * Solution: Vérification manuelle en cherchant le token dans la DB
   */
  private async authenticateToken(tokenString: string): Promise<User | null> {
    try {
      // Le format du token AdonisJS est: oat_<id>.<hash>
      if (!tokenString || !tokenString.startsWith('oat_')) {
        logger.warn('Token format invalid: must start with "oat_"')
        return null
      }

      logger.debug(`Attempting to verify token: ${tokenString.substring(0, 30)}...`)
      
      // Utiliser une vérification manuelle car verify() a un bug avec les strings
      const user = await this.verifyTokenManually(tokenString)
      return user
    } catch (error: any) {
      logger.error('Token authentication error:', {
        message: error?.message || String(error),
        name: error?.name || 'Unknown',
        stack: error?.stack,
      })
      return null
    }
  }

  /**
   * Vérifie manuellement un token en cherchant dans la base de données
   */
  private async verifyTokenManually(tokenString: string): Promise<User | null> {
    try {
      // Parser le token: format est oat_<id>.<hash>
      const tokenParts = tokenString.split('.')
      if (tokenParts.length !== 2) {
        logger.warn('Token format invalid: expected oat_<id>.<hash>')
        return null
      }

      const prefixAndId = tokenParts[0] // oat_<id>
      if (!prefixAndId.startsWith('oat_')) {
        logger.warn('Token format invalid: must start with "oat_"')
        return null
      }

      // L'ID du token peut être en base64 (MTI0 = 124 en base64)
      // Essayer de décoder d'abord, sinon utiliser directement
      let tokenId: string | number = prefixAndId.replace('oat_', '')
      const tokenHash = tokenParts[1]

      // Essayer de décoder l'ID si c'est du base64
      try {
        // Si c'est du base64, décoder
        const decoded = Buffer.from(tokenId, 'base64').toString('utf-8')
        const numericId = parseInt(decoded, 10)
        if (!isNaN(numericId)) {
          tokenId = numericId
        }
      } catch {
        // Si le décodage échoue, utiliser l'ID tel quel
        // Essayer de parser directement comme nombre
        const numericId = parseInt(tokenId, 10)
        if (!isNaN(numericId)) {
          tokenId = numericId
        }
      }

      // Chercher le token dans la base de données
      const db = (await import('@adonisjs/lucid/services/db')).default
      const hash = (await import('@adonisjs/core/services/hash')).default

      // Récupérer le token depuis la DB (l'ID est numérique dans la table)
      const tokenRecord = await db
        .from('auth_access_tokens')
        .where('id', tokenId)
        .first()

      if (!tokenRecord) {
        logger.warn(`Token not found in database: ${tokenId}`)
        return null
      }

      // Vérifier que le token n'est pas expiré
      if (tokenRecord.expires_at) {
        const expiresAt = new Date(tokenRecord.expires_at)
        if (expiresAt < new Date()) {
          logger.warn(`Token expired: ${tokenId}`)
          return null
        }
      }

      // Vérifier le hash du token
      // Le hash stocké dans la DB est le hash du token complet
      const isValid = await hash.verify(tokenRecord.hash, tokenString)

      if (!isValid) {
        logger.warn(`Token hash mismatch: ${tokenId}`)
        return null
      }

      // Récupérer l'utilisateur associé
      const user = await User.find(tokenRecord.tokenable_id)

      if (!user) {
        logger.warn(`User not found for token: ${tokenId}`)
        return null
      }

      // Mettre à jour last_used_at
      await db
        .from('auth_access_tokens')
        .where('id', tokenId)
        .update({ last_used_at: new Date() })

      logger.debug(`Token verified successfully for user: ${user.id}`)
      return user
    } catch (error: any) {
      logger.error('Error in manual token verification:', {
        message: error?.message || String(error),
        stack: error?.stack,
      })
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
      // Utiliser console au lieu de logger car le logger peut ne pas être disponible pendant le shutdown
      try {
        logger.info('WebSocket service closed')
      } catch {
        console.log('WebSocket service closed')
      }
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
