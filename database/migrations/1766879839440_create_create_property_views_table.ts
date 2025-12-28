import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'property_views'

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

      // Relation avec l'utilisateur qui a consulté
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id'])
      table.index(['user_id'])
      table.index(['user_id', 'created_at'])
      // Index composite pour éviter les doublons multiples (même utilisateur, même propriété)
      // Note: On gère les doublons au niveau applicatif (une vue par jour max)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}