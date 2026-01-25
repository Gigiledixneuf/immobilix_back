/**
 * Custom createServer factory for the Ignitor.
 * Creates the Node HTTP server, attaches Socket.IO to it, then returns the server.
 * This ensures /socket.io is handled before any request hits Adonis.
 */
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { getSocketIoService } from '#services/socket_io_service'

export function createServerWithSocketIo(
  handler: (req: IncomingMessage, res: ServerResponse) => void
) {
  const server = createServer(handler)
  getSocketIoService().attachToServer(server)
  getSocketIoService().scheduleFinishInit()
  return server
}
