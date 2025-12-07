import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class PasswordResetToken extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare token: string

  @column()
  declare email: string

  @column({
    prepare: (value: DateTime) => value.toFormat('yyyy-MM-dd HH:mm:ss'),
    consume: (value: string | DateTime) => {
      if (value instanceof DateTime) {
        return value
      }
      if (typeof value === 'string') {
        return DateTime.fromSQL(value) || DateTime.fromISO(value)
      }
      return null as any
    },
  })
  declare expiresAt: DateTime

  @column()
  declare used: boolean

  @column({
    prepare: (value: DateTime | null) => value ? value.toFormat('yyyy-MM-dd HH:mm:ss') : null,
    consume: (value: string | DateTime | null) => {
      if (!value) return null
      if (value instanceof DateTime) {
        return value
      }
      if (typeof value === 'string') {
        return DateTime.fromSQL(value) || DateTime.fromISO(value)
      }
      return null
    },
  })
  declare usedAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}

