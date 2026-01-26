import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .boolean('is_public')
        .notNullable()
        .defaultTo(false)
        .comment('Publique uniquement si toutes les étapes sont faites et validées par le bailleur')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('is_public')
    })
  }
}
