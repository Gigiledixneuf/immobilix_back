/*
|--------------------------------------------------------------------------
| HTTP server entrypoint
|--------------------------------------------------------------------------
|
| The "server.ts" file is the entrypoint for starting the AdonisJS HTTP
| server. Either you can run this file directly or use the "serve"
| command to run this file and monitor file changes
|
*/

import 'reflect-metadata'
import { Ignitor, prettyPrintError } from '@adonisjs/core'

/**
 * URL to the application root. AdonisJS need it to resolve
 * paths to file and directories for scaffolding commands
 */
const APP_ROOT = new URL('../', import.meta.url)

/**
 * The importer is used to import files in context of the
 * application.
 */
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

const ignitor = new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => {
    app.booting(async () => {
      await import('#start/env')
    })
    app.listen('SIGTERM', () => app.terminate())
    app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
  })

ignitor
  .httpServer()
  .start()
  .then(async () => {
    // Initialiser WebSocket après le démarrage du serveur HTTP
    // Attendre un peu pour s'assurer que le serveur est prêt
    await new Promise((resolve) => setTimeout(resolve, 500))
    
    try {
      // Accéder au serveur HTTP via le service server d'AdonisJS
      const server = await import('@adonisjs/core/services/server')
      const serverService = server.default
      
      // Vérifier si getHttpServer existe
      let httpServer: any = null
      
      if (typeof serverService.getHttpServer === 'function') {
        httpServer = serverService.getHttpServer()
      } else if (serverService.instance) {
        httpServer = serverService.instance
      } else if (serverService.server) {
        httpServer = serverService.server
      } else {
        // Essayer d'accéder directement à la propriété
        httpServer = (serverService as any).getHttpServer?.() || (serverService as any).instance
      }
      
      if (!httpServer) {
        console.error('❌ HTTP server not available for WebSocket initialization')
        console.error('   Server service:', Object.keys(serverService))
        return
      }

      const { getWebSocketService } = await import('#services/websocket_service')
      const logger = (await import('@adonisjs/core/services/logger')).default
      
      const websocketService = getWebSocketService()
      websocketService.initialize(httpServer)
      logger.info('✅ WebSocket service initialized successfully')
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket service:', error)
      console.error('   Error details:', error instanceof Error ? error.stack : error)
    }
  })
  .catch((error) => {
    process.exitCode = 1
    prettyPrintError(error)
  })
