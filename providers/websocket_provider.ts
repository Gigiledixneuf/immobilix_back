import type { ApplicationService } from '@adonisjs/core/types'
import app from '@adonisjs/core/services/app'
import { getWebSocketService } from '#services/websocket_service'
import logger from '@adonisjs/core/services/logger'
import type { Server as HTTPServer } from 'node:http'

export default class WebSocketProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Initialise le service WebSocket après que l'application soit prête
   */
  async ready() {
    // Attendre que l'application soit prête
    if (!app.isReady) {
      return
    }

    try {
      // Initialiser WebSocket avec noServer: true
      const websocketService = getWebSocketService()
      websocketService.initialize()
      
      // Essayer d'accéder au serveur HTTP pour écouter les upgrades
      // Dans AdonisJS 6, nous devons trouver le serveur HTTP
      await this.setupUpgradeListener()
      
      logger.info('✅ WebSocket service initialized successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize WebSocket service:', error)
    }
  }

  /**
   * Configure l'écouteur d'upgrade HTTP pour WebSocket
   */
  private async setupUpgradeListener() {
    try {
      // Essayer d'accéder au serveur HTTP via différentes méthodes
      const server = await import('@adonisjs/core/services/server')
      const serverService = server.default
      
      // Le serveur HTTP pourrait être dans différentes propriétés
      const httpServer = (serverService as any).instance || 
                         (serverService as any).server ||
                         (serverService as any).getHttpServer?.()
      
      if (httpServer && typeof httpServer.on === 'function') {
        // Écouter les événements 'upgrade' sur le serveur HTTP
        httpServer.on('upgrade', async (request: any, socket: any, head: Buffer) => {
          const websocketService = getWebSocketService()
          await websocketService.handleUpgrade(request, socket, head)
        })
        
        logger.info('✅ WebSocket upgrade listener configured')
      } else {
        logger.warn('⚠️  HTTP server not accessible for WebSocket upgrades')
        logger.info('   Server service type:', typeof serverService)
        logger.info('   Server service keys:', Object.keys(serverService))
      }
    } catch (error) {
      logger.error('Error setting up WebSocket upgrade listener:', error)
    }
  }

  /**
   * Ferme proprement le service WebSocket lors de l'arrêt de l'application
   */
  async shutdown() {
    try {
      const websocketService = getWebSocketService()
      websocketService.close()
      logger.info('✅ WebSocket service closed')
    } catch (error) {
      logger.error('❌ Error closing WebSocket service:', error)
    }
  }
}

