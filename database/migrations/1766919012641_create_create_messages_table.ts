import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'messages'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Relation avec la conversation
      table
        .integer('conversation_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('conversations')
        .onDelete('CASCADE')

      // Auteur du message
      table
        .integer('sender_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Contenu du message
      table.text('content').notNullable()

      // Type de message (text, image, etc.)
      table.string('type').defaultTo('text').notNullable()

      // Statut de lecture
      table.boolean('is_read').defaultTo(false).notNullable()

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['conversation_id'])
      table.index(['sender_id'])
      table.index(['conversation_id', 'created_at'])
      table.index(['is_read'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
