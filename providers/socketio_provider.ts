import type { ApplicationService } from '@adonisjs/core/types'
import type { Server as HTTPServer } from 'node:http'
import { getSocketIoService } from '#services/socket_io_service'

/**
 * Attach Socket.IO to the Node HTTP server when it becomes available.
 * The server is created inside the Ignitor's start callback, after providers ready().
 * We listen for http:server_ready and poll getNodeServer() as fallback.
 */
export default class SocketIoProvider {
  constructor(protected app: ApplicationService) {}

  async ready() {
    try {
      const logger = (await import('@adonisjs/core/services/logger')).default
      const emitter = await this.app.container.make('emitter')
      const server = await this.app.container.make('server')

      const getHttpServer = (): HTTPServer | null => {
        const n = (server as any).getNodeServer
        if (typeof n !== 'function') return null
        const out = n.call(server)
        return (out != null && typeof out.then !== 'function' ? out : null) as HTTPServer | null
      }

      let attached = false
      let attaching = false
      let intervalId: ReturnType<typeof setInterval> | null = null

      const tryAttach = async (): Promise<boolean> => {
        if (attached) return true
        if (attaching) return false
        const httpServer = getHttpServer()
        if (!httpServer) return false
        attaching = true
        try {
          const svc = getSocketIoService()
          await svc.initialize(httpServer)
          attached = true
          if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
          }
          return true
        } finally {
          attaching = false
        }
      }

      emitter.on('http:server_ready', async () => {
        if (attached) return
        await tryAttach()
      })

      const pollMs = 200
      const pollMax = 15000
      const deadline = Date.now() + pollMax
      intervalId = setInterval(async () => {
        if (attached || Date.now() > deadline) {
          if (intervalId) clearInterval(intervalId)
          intervalId = null
          return
        }
        if (await tryAttach()) {
          if (intervalId) clearInterval(intervalId)
          intervalId = null
        }
      }, pollMs)
    } catch (e) {
      console.error('Socket.IO provider error:', e)
    }
  }

  async shutdown() {
    try {
      await getSocketIoService().close()
    } catch (e) {
      console.error('Error closing Socket.IO:', e)
    }
  }
}
