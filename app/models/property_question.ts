import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'
import { randomUUID } from 'node:crypto'

export enum PropertyQuestionStatus {
  PENDING = 'pending',
  ANSWERED = 'answered',
}

export default class PropertyQuestion extends BaseModel {
  @beforeCreate()
  static assignUuid(question: PropertyQuestion) {
    if (!question.uuid) {
      question.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ serializeAs: null })
  declare propertyId: number

  @column({ serializeAs: null })
  declare userId: number

  @column()
  declare question: string

  @column()
  declare answer: string | null

  @column()
  declare status: PropertyQuestionStatus

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
