import server from '@adonisjs/core/services/server'
import { getWebSocketService } from '#services/websocket_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Initialise le service WebSocket après le démarrage du serveur HTTP
 */
server.ready(async () => {
  try {
    const httpServer = server.getHttpServer()
    if (!httpServer) {
      logger.warn('HTTP server not available, WebSocket will not be initialized')
      return
    }

    const websocketService = getWebSocketService()
    websocketService.initialize(httpServer)
    logger.info('✅ WebSocket service initialized successfully')
  } catch (error) {
    logger.error('❌ Failed to initialize WebSocket service:', error)
  }
})

/**
 * Ferme proprement le service WebSocket lors de l'arrêt du serveur
 */
server.close(async () => {
  try {
    const websocketService = getWebSocketService()
    websocketService.close()
    logger.info('✅ WebSocket service closed')
  } catch (error) {
    logger.error('❌ Error closing WebSocket service:', error)
  }
})

