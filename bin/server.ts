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
    // Initialiser WebSocket avec noServer: true
    // Les upgrades seront gérés par le middleware websocket_middleware
    try {
      const { getWebSocketService } = await import('#services/websocket_service')
      const logger = (await import('@adonisjs/core/services/logger')).default
      
      const websocketService = getWebSocketService()
      websocketService.initialize()
      logger.info('✅ WebSocket service initialized successfully (noServer mode)')
    } catch (error) {
      console.error('❌ Failed to initialize WebSocket service:', error)
      console.error('   Error details:', error instanceof Error ? error.stack : error)
    }
  })
  .catch((error) => {
    process.exitCode = 1
    prettyPrintError(error)
  })
