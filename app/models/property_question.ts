import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'

export enum PropertyQuestionStatus {
  PENDING = 'pending',
  ANSWERED = 'answered',
}

export default class PropertyQuestion extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare propertyId: number

  @column()
  declare userId: string

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
