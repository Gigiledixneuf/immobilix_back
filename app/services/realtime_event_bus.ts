import logger from '@adonisjs/core/services/logger'
import { createClient, type RedisClientType } from 'redis'

type RealtimeEvent =
  | { type: 'message.created'; payload: Record<string, any> }
  | { type: 'message.delivered'; payload: Record<string, any> }
  | { type: 'notification.created'; payload: Record<string, any> }
  | { type: 'slot.updated'; payload: Record<string, any> }

const CHANNEL = 'realtime:events'

export default class RealtimeEventBus {
  private publisher: RedisClientType | null = null
  private subscriber: RedisClientType | null = null
  private handlers: Set<(event: RealtimeEvent) => void> = new Set()
  private useRedis: boolean = false

  async initialize() {
    if (this.publisher && this.subscriber) {
      return
    }

    const url = process.env.REDIS_URL
    if (!url) {
      logger.warn('REDIS_URL is not set, realtime bus will run in memory')
      this.useRedis = false
      return
    }

    const publisher = createClient({
      url,
      socket: {
        reconnectStrategy: () => false,
      },
    })
    const subscriber = publisher.duplicate()

    publisher.on('error', (error) => {
      logger.error('Redis publisher error', error)
    })
    subscriber.on('error', (error) => {
      logger.error('Redis subscriber error', error)
    })

    try {
      await publisher.connect()
      await subscriber.connect()
    } catch (error) {
      logger.warn('Redis unavailable, realtime bus will run in memory', error)
      this.useRedis = false
      try {
        await publisher.quit()
        await subscriber.quit()
      } catch {}
      return
    }

    await subscriber.subscribe(CHANNEL, (message) => {
      try {
        const event = JSON.parse(message) as RealtimeEvent
        this.handlers.forEach((handler) => handler(event))
      } catch (error) {
        logger.warn('Failed to parse realtime event', error)
      }
    })

    this.publisher = publisher
    this.subscriber = subscriber
    this.useRedis = true
    logger.info('RealtimeEventBus connected to Redis')
  }

  on(handler: (event: RealtimeEvent) => void) {
    this.handlers.add(handler)
  }

  async publish(event: RealtimeEvent) {
    if (!this.publisher && this.useRedis) {
      await this.initialize()
    }
    if (!this.useRedis || !this.publisher) {
      this.handlers.forEach((handler) => handler(event))
      return
    }
    try {
      await this.publisher!.publish(CHANNEL, JSON.stringify(event))
    } catch (error) {
      logger.error('Failed to publish realtime event', error)
    }
  }

  async close() {
    await this.subscriber?.quit()
    await this.publisher?.quit()
    this.subscriber = null
    this.publisher = null
  }
}

let realtimeEventBus: RealtimeEventBus | null = null

export function getRealtimeEventBus(): RealtimeEventBus {
  if (!realtimeEventBus) {
    realtimeEventBus = new RealtimeEventBus()
  }
  return realtimeEventBus
}
