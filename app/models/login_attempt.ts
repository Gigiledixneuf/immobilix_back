import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class LoginAttempt extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare email: string | null

  @column()
  declare userId: string | null

  @column()
  declare ipAddress: string | null

  @column()
  declare userAgent: string | null

  @column()
  declare status: 'success' | 'failed' | 'blocked'

  @column()
  declare failureReason: string | null // 'invalid_email', 'invalid_password', 'rate_limited', etc.

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User> | null
}


