import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'

export enum VisitRequestStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export default class VisitRequest extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare propertyId: number

  @column()
  declare tenantId: number

  @column.date()
  declare requestedDate: DateTime

  @column()
  declare requestedTime: string // Format HH:mm:ss

  @column()
  declare message: string | null

  @column()
  declare status: VisitRequestStatus

  @column.dateTime({ nullable: true })
  declare scheduledAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>

  @belongsTo(() => User, { foreignKey: 'tenantId' })
  declare tenant: BelongsTo<typeof User>
}