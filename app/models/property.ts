import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import User from '#models/user'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Contract from '#models/contract'
import Review from '#models/review'
import PropertyPhoto from '#models/property_photo'
import PropertyAmenity from '#models/property_amenity'

export enum PropertyType {
  HOUSE = 'house',
  APARTMENT = 'apartment',
  STUDIO = 'studio',
  ROOM = 'room',
}

export default class Property extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare user_id: string

  @column()
  declare name: string

  @column()
  declare address: string

  @column()
  declare city: string

  @column()
  declare street_number?: string

  @column()
  declare state?: string

  @column()
  declare postal_code?: string

  @column()
  declare latitude?: number

  @column()
  declare longitude?: number

  @column()
  declare formatted_address?: string

  @column()
  declare type: PropertyType | string

  @column()
  declare property_use_type?: 'residential' | 'commercial'

  @column()
  declare surface: number | null

  @column()
  declare rooms: number | null

  @column()
  declare capacity: number

  @column()
  declare price: number

  @column()
  declare description?: string

  @column({ columnName: 'main_photo_url' })
  declare mainPhotoUrl?: string

  // Nouveaux champs
  @column.dateTime()
  declare available_from?: DateTime

  @column()
  declare available_time?: string

  @column()
  declare rental_reason?: string

  @column()
  declare rental_reason_other?: string

  @column()
  declare year_built?: number

  @column()
  declare bathrooms?: number

  @column()
  declare security_deposit?: number

  @column()
  declare deposit_months?: number

  @column()
  declare land_size?: number

  @column()
  declare contact_phone?: string

  @column()
  declare additional_info?: string

  @column()
  declare creation_step: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, {
    foreignKey: 'user_id',
  })
  declare user: BelongsTo<typeof User>

  @hasMany(() => Contract)
  declare contracts: HasMany<typeof Contract>

  @hasMany(() => Review)
  declare reviews: HasMany<typeof Review>

  @hasMany(() => PropertyPhoto, {
    foreignKey: 'property_id',
  })
  declare photos: HasMany<typeof PropertyPhoto>

  @hasMany(() => PropertyAmenity, {
    foreignKey: 'property_id',
  })
  declare amenities: HasMany<typeof PropertyAmenity>
}
