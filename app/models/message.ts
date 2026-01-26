import { DateTime } from 'luxon'
import { BaseModel, beforeCreate, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Conversation from '#models/conversation'
import { randomUUID } from 'node:crypto'

export default class Message extends BaseModel {
  @beforeCreate()
  static assignUuid(message: Message) {
    if (!message.uuid) {
      message.uuid = randomUUID()
    }
  }

  @column({ isPrimary: true, serializeAs: null })
  declare id: number

  @column({ serializeAs: 'id' })
  declare uuid: string

  @column({ columnName: 'conversation_id', serializeAs: null })
  declare conversationId: number

  @column({ columnName: 'sender_id', serializeAs: null })
  declare senderId: number

  @column()
  declare content: string

  @column()
  declare type: string // 'text', 'image', etc.

  @column({ columnName: 'is_read' })
  declare isRead: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Conversation, { foreignKey: 'conversationId' })
  declare conversation: BelongsTo<typeof Conversation>

  @belongsTo(() => User, { foreignKey: 'senderId' })
  declare sender: BelongsTo<typeof User>
}
