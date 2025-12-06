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
    
    // Logger pour debug
    if (request.url().includes('/notifications')) {
      logger.debug('WebSocket middleware: Request to /notifications', {
        upgrade: upgradeHeader,
        connection: connectionHeader,
        method: request.method(),
        url: request.url(),
      })
    }
    
    if (
      upgradeHeader?.toLowerCase() === 'websocket' &&
      connectionHeader?.toLowerCase().includes('upgrade') &&
      request.url().includes('/notifications')
    ) {
      try {
        logger.info('WebSocket middleware: Attempting to handle upgrade')
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
            logger.info('WebSocket middleware: Upgrade handled successfully')
            // L'upgrade a été géré, ne pas continuer avec le middleware
            return
          } else {
            logger.warn('WebSocket middleware: Upgrade was not handled')
          }
        } else {
          logger.warn('WebSocket middleware: Missing nodeRequest or nodeSocket', {
            hasNodeRequest: !!nodeRequest,
            hasNodeSocket: !!nodeSocket,
          })
        }
      } catch (error) {
        logger.error('Error handling WebSocket upgrade:', error)
      }
    }

    return next()
  }
}
