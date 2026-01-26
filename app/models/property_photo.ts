import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import Property from '#models/property'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { randomUUID } from 'node:crypto'

export default class PropertyPhoto extends BaseModel {
  @beforeCreate()
  static assignUuid(photo: PropertyPhoto) {
    if (!photo.uuid) {
      photo.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ serializeAs: null })
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