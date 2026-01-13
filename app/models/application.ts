import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'
import VisitRequest from '#models/visit_request'

export enum ApplicationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export default class Application extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare propertyId: number

  @column()
  declare tenantId: number

  @column()
  declare message: string | null

  @column()
  declare status: ApplicationStatus

  /**
   * Lien avec la visite qui a mené à cette candidature
   */
  @column()
  declare visitRequestId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Property)
  declare property: BelongsTo<typeof Property>

  @belongsTo(() => User, { foreignKey: 'tenantId' })
  declare tenant: BelongsTo<typeof User>

  @belongsTo(() => VisitRequest, {
    foreignKey: 'visitRequestId',
  })
  declare visitRequest: BelongsTo<typeof VisitRequest> | null
}




