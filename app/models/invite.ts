import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Property from '#models/property'
import { randomUUID } from 'node:crypto'

export enum InviteStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  CANCELLED = 'cancelled',
}

export default class Invite extends BaseModel {
  @beforeCreate()
  static assignUuid(invite: Invite) {
    if (!invite.uuid) {
      invite.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ serializeAs: null })
  declare landlordId: number

  @column({ serializeAs: null })
  declare propertyId: number | null

  @column()
  declare contact: string // email ou téléphone

  @column()
  declare code: string

  @column()
  declare status: InviteStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'landlordId' })
  declare landlord: BelongsTo<typeof User>

  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>
}




