import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import { randomUUID } from 'node:crypto'

export default class LoginAttempt extends BaseModel {
  @beforeCreate()
  static assignUuid(attempt: LoginAttempt) {
    if (!attempt.uuid) {
      attempt.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column()
  declare email: string | null

  @column({ serializeAs: null })
  declare userId: number | null

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


