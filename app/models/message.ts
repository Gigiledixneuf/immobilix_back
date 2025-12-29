import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import Conversation from '#models/conversation'

export default class Message extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'conversation_id' })
  declare conversationId: number

  @column({ columnName: 'sender_id' })
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
