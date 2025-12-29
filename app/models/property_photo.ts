import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import Property from '#models/property'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class PropertyPhoto extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare property_id: number

  @column()
  declare photo_url: string

  @column()
  declare display_order: number

  @column()
  declare is_main: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Property, {
    foreignKey: 'property_id',
  })
  declare property: BelongsTo<typeof Property>
}