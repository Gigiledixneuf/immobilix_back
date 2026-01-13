import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enum('active_role', ['tenant', 'landlord']).nullable().after('reliability_score')
      table.string('default_role', 20).nullable().after('active_role')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('active_role')
      table.dropColumn('default_role')
    })
  }
}
