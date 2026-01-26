import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import { randomUUID } from 'node:crypto'

export default class PasswordResetToken extends BaseModel {
  @beforeCreate()
  static assignUuid(reset: PasswordResetToken) {
    if (!reset.uuid) {
      reset.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ serializeAs: null })
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

