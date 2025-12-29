import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('available_time').nullable().after('available_from').comment('Heure de disponibilité')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('available_time')
    })
  }
}
