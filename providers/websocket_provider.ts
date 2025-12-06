import type { ApplicationService } from '@adonisjs/core/types'
import app from '@adonisjs/core/services/app'
import { getWebSocketService } from '#services/websocket_service'
import type { Server as HTTPServer } from 'node:http'

export default class WebSocketProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Initialise le service WebSocket après le boot de l'application
   */
  async boot() {
    try {
      // Initialiser WebSocket avec noServer: true
      const websocketService = getWebSocketService()
      websocketService.initialize()
      
      console.log('✅ WebSocket service initialized (noServer mode)')
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket service:', error)
    }
  }

  /**
   * Configure l'écouteur d'upgrade HTTP après que l'application soit prête
   */
  async ready() {
    // Attendre que l'application soit prête
    if (!app.isReady) {
      return
    }

    try {
      // Essayer d'accéder au serveur HTTP via le container
      const server = this.app.container.use('server') || await import('@adonisjs/core/services/server').then(m => m.default)
      
      // Essayer différentes méthodes pour accéder au serveur HTTP
      let httpServer: HTTPServer | null = null
      
      if (server) {
        // Essayer d'accéder via getHttpServer() si disponible
        if (typeof (server as any).getHttpServer === 'function') {
          httpServer = (server as any).getHttpServer()
        }
        // Essayer d'accéder via instance
        else if ((server as any).instance) {
          httpServer = (server as any).instance
        }
        // Essayer d'accéder via server
        else if ((server as any).server) {
          httpServer = (server as any).server
        }
      }
      
      if (httpServer && typeof httpServer.on === 'function') {
        // Écouter les événements 'upgrade' sur le serveur HTTP
        httpServer.on('upgrade', async (request: any, socket: any, head: Buffer) => {
          const websocketService = getWebSocketService()
          await websocketService.handleUpgrade(request, socket, head)
        })
        
        logger.info('✅ WebSocket upgrade listener configured on HTTP server')
      } else {
        logger.warn('⚠️  HTTP server not accessible for WebSocket upgrades')
        logger.info('   Server type:', typeof server)
        logger.info('   Server keys:', server ? Object.keys(server) : 'null')
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
      const logger = (await import('@adonisjs/core/services/logger')).default
      logger.info('✅ WebSocket service closed')
    } catch (error) {
      console.error('❌ Error closing WebSocket service:', error)
    }
  }
}
