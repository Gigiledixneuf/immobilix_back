import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'visit_requests'

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

      // Relation avec l'utilisateur (locataire qui demande la visite)
      table
        .integer('tenant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Date et heure de la visite demandée
      table.date('requested_date').notNullable()
      table.time('requested_time').notNullable()

      // Message optionnel
      table.text('message').nullable()

      // Statut de la demande : pending, accepted, rejected, cancelled
      table
        .enum('status', ['pending', 'accepted', 'rejected', 'cancelled'])
        .defaultTo('pending')
        .notNullable()

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id'])
      table.index(['tenant_id'])
      table.index(['status'])
      table.index(['requested_date'])
      table.index(['property_id', 'status'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}