import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'
import VisitRequest from '#models/visit_request'
import { randomUUID } from 'node:crypto'

export default class Review extends BaseModel {
  @beforeCreate()
  static assignUuid(review: Review) {
    if (!review.uuid) {
      review.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ serializeAs: null })
  declare propertyId: number | null

  @column({ serializeAs: null })
  declare userId: number

  @column({ columnName: 'reviewed_user_id', serializeAs: null })
  declare reviewedUserId: number | null

  @column({ columnName: 'visit_request_id', serializeAs: null })
  declare visitRequestId: number | null

  @column({ columnName: 'review_type' })
  declare reviewType: 'property' | 'tenant' | null

  @column()
  declare rating: number

  @column()
  declare comment: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'reviewedUserId' })
  declare reviewee: BelongsTo<typeof User>

  @belongsTo(() => VisitRequest)
  declare visitRequest: BelongsTo<typeof VisitRequest>
}


