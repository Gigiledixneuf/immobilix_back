import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Message from '#models/message'
import Property from '#models/property'
import { randomUUID } from 'node:crypto'

export default class Conversation extends BaseModel {
  @beforeCreate()
  static assignUuid(conversation: Conversation) {
    if (!conversation.uuid) {
      conversation.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ columnName: 'user1_id', serializeAs: null })
  declare user1Id: number

  @column({ columnName: 'user2_id', serializeAs: null })
  declare user2Id: number

  @column({ columnName: 'property_id', serializeAs: null })
  declare propertyId: number | null

  @column({ columnName: 'last_message_id', serializeAs: null })
  declare lastMessageId: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User, { foreignKey: 'user1Id' })
  declare user1: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'user2Id' })
  declare user2: BelongsTo<typeof User>

  @belongsTo(() => Property, { foreignKey: 'propertyId' })
  declare property: BelongsTo<typeof Property>

  @belongsTo(() => Message, { foreignKey: 'lastMessageId' })
  declare lastMessage: BelongsTo<typeof Message>

  @hasMany(() => Message, { foreignKey: 'conversation_id' })
  declare messages: HasMany<typeof Message>

  /**
   * Retourne l'ID de l'autre utilisateur
   */
  getOtherUserId(currentUserId: number): number {
    return this.user1Id === currentUserId ? this.user2Id : this.user1Id
  }
}
