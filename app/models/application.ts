import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import User from '#models/user'
import VisitRequest from '#models/visit_request'
import { randomUUID } from 'node:crypto'

export enum ApplicationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export default class Application extends BaseModel {
  @beforeCreate()
  static assignUuid(application: Application) {
    if (!application.uuid) {
      application.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ serializeAs: null })
  declare propertyId: number

  @column({ serializeAs: null })
  declare tenantId: number

  @column()
  declare message: string | null

  @column()
  declare status: ApplicationStatus

  /**
   * Lien avec la visite qui a mené à cette candidature
   */
  @column({ serializeAs: null })
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




