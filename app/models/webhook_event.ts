import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class WebhookEvent extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare eventId: string

  @column()
  declare eventType: string

  @column()
  declare provider: string

  @column()
  declare paymentId: number | null

  @column()
  declare payload: Record<string, any>

  @column()
  declare status: 'pending' | 'processed' | 'failed'

  @column()
  declare errorMessage: string | null

  @column()
  declare retryCount: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relation payment supprimée - les paiements ne sont plus gérés dans le MVP
}

