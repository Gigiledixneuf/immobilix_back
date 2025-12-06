import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { getWebSocketService } from '#services/websocket_service'
import logger from '@adonisjs/core/services/logger'

/**
 * Middleware pour gérer les upgrades WebSocket
 * Ce middleware intercepte les requêtes HTTP avec l'en-tête "Upgrade: websocket"
 */
export default class WebSocketMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { request, response } = ctx

    // Vérifier si c'est une requête WebSocket upgrade
    const upgradeHeader = request.header('upgrade')
    const connectionHeader = request.header('connection')
    
    if (
      upgradeHeader?.toLowerCase() === 'websocket' &&
      connectionHeader?.toLowerCase().includes('upgrade') &&
      request.url().includes('/notifications')
    ) {
      try {
        const websocketService = getWebSocketService()
        
        // Accéder aux objets Node.js bruts pour l'upgrade
        const nodeRequest = (request as any).request
        const nodeResponse = (response as any).response
        const nodeSocket = (request as any).socket || (nodeRequest as any).socket
        
        if (nodeRequest && nodeSocket) {
          // Gérer l'upgrade WebSocket
          const handled = await websocketService.handleUpgrade(
            nodeRequest,
            nodeSocket,
            Buffer.alloc(0) // head est généralement vide pour les upgrades WebSocket
          )
          
          if (handled) {
            // L'upgrade a été géré, ne pas continuer avec le middleware
            return
          }
        }
      } catch (error) {
        logger.error('Error handling WebSocket upgrade:', error)
      }
    }

    return next()
  }
}
