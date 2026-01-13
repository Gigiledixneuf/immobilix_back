import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Ajouter un index sur le champ price pour optimiser les requêtes MIN/MAX
      table.index(['price'], 'properties_price_index')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['price'], 'properties_price_index')
    })
  }
}