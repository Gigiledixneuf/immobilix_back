import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Participants de la conversation (utilisateur 1 et utilisateur 2)
      table
        .integer('user1_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      table
        .integer('user2_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Dernier message (pour trier les conversations)
      // Note: La référence sera ajoutée après la création de la table messages
      table
        .integer('last_message_id')
        .unsigned()
        .nullable()

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['user1_id'])
      table.index(['user2_id'])
      table.index(['user1_id', 'user2_id'])
      table.index(['last_message_id'])

      // Contrainte unique pour éviter les doublons (une conversation par paire d'utilisateurs)
      table.unique(['user1_id', 'user2_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
