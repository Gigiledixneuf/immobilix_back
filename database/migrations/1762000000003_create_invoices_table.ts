import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invoices'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('contract_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('contracts')
        .onDelete('CASCADE')
      table
        .integer('tenant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table
        .integer('landlord_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.decimal('amount', 15, 2).notNullable()
      table.date('due_date').notNullable()
      table
        .enum('status', ['pending', 'paid', 'overdue', 'cancelled'])
        .defaultTo('pending')
      table.dateTime('paid_at').nullable()
      table.string('transaction_hash').nullable()
      table.text('description').nullable()
      table.timestamps(true, true)

      // Index pour améliorer les performances
      table.index(['contract_id'])
      table.index(['tenant_id', 'status'])
      table.index(['landlord_id', 'status'])
      table.index(['due_date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}


