import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'
import VisitRequest from '#models/visit_request'

export enum Currencies {
  USD = 'USD',
  HBAR = 'HBAR',
}

export default class Contract extends BaseModel {
  @column({ isPrimary: true })
  declare id: number
  @column()
  declare user_id: string | null

  @column()
  declare propertyId: number

  @column()
  declare tenantId: string

  @column.date()
  declare startDate: DateTime

  @column.date()
  declare endDate: DateTime | null

  @column()
  declare description: string | null

  @column()
  declare rentAmount: number

  @column()
  declare currency: string

  @column()
  declare status: string

  // New security deposit fields
  @column()
  declare depositMonths: number

  @column()
  declare depositAmount: number | null

  @column()
  declare depositStatus: string

  @column()
  declare hederaContractId: string | null

  /**
   * Lien avec la visite qui a mené à ce contrat
   */
  @column()
  declare visitRequestId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // 🔗 Relations

  // A contract belongs to a property
  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>

  // A contract belongs to a tenant (user)
  @belongsTo(() => User, {
    foreignKey: 'tenantId', // 🥇 CORRECTION : Utiliser tenantId comme clé étrangère
  })
  declare tenant: BelongsTo<typeof User>

  @belongsTo(() => VisitRequest, {
    foreignKey: 'visitRequestId',
  })
  declare visitRequest: BelongsTo<typeof VisitRequest> | null
}
