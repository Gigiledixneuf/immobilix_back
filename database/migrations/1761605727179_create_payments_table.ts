import { BaseSchema } from '@adonisjs/lucid/schema'
import { Currencies } from '../../app/models/contract.js'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('contract_id')
        .unsigned()
        .references('id')
        .inTable('contracts')
        .onDelete('CASCADE')
      table.decimal('amount', 12, 2).notNullable()
      table.enum('currency', Object.values(Currencies)).defaultTo(Currencies.USD)
      table.enum('payment_method', ['CASH', 'MOBILE_MONEY', 'HBAR', 'USDC']).defaultTo('HBAR')
      table.string('transaction_id').unique()
      table.enum('status', ['PENDING', 'PAID', 'FAILED', 'WAITING_LANDLORD_CONFIRMATION']).defaultTo('PENDING')
      table.timestamps(true, true)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
