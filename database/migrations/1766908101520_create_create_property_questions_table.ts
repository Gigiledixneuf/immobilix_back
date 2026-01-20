import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'property_questions'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Relation avec la propriété
      table
        .integer('property_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('properties')
        .onDelete('CASCADE')

      // Relation avec l'utilisateur qui pose la question
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Question
      table.text('question').notNullable()

      // Réponse (optionnelle, remplie par le bailleur)
      table.text('answer').nullable()

      // Statut : pending, answered
      table
        .enum('status', ['pending', 'answered'])
        .defaultTo('pending')
        .notNullable()

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id'])
      table.index(['user_id'])
      table.index(['status'])
      table.index(['property_id', 'status'])
    })
  }

  async down() {
    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
