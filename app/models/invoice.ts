import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Contract from './contract.js'
import User from './user.js'

export enum InvoiceStatus {
  PENDING = 'pending',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}

export default class Invoice extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare contractId: number

  @column()
  declare tenantId: number

  @column()
  declare landlordId: number

  @column()
  declare amount: number

  @column.date()
  declare dueDate: DateTime

  @column()
  declare status: InvoiceStatus

  @column.dateTime()
  declare paidAt: DateTime | null

  @column()
  declare transactionHash: string | null

  @column()
  declare description: string | null // Description de la facture (ex: "Loyer du mois de janvier")

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // Relations
  @belongsTo(() => Contract)
  declare contract: BelongsTo<typeof Contract>

  @belongsTo(() => User, { foreignKey: 'tenantId' })
  declare tenant: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'landlordId' })
  declare landlord: BelongsTo<typeof User>
}


