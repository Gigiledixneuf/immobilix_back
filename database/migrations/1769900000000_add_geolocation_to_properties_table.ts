import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.double('latitude').nullable().after('city')
      table.double('longitude').nullable().after('latitude')
      table.string('formatted_address', 255).nullable().after('longitude')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('latitude')
      table.dropColumn('longitude')
      table.dropColumn('formatted_address')
    })
  }
}
