import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'property_amenities'

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

      // Nom de la commodité
      table.string('name').notNullable().comment('Nom de la commodité (ex: WiFi gratuit, Piscine, etc.)')

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id'])
      
      // Un bailleur ne peut pas ajouter deux fois la même commodité pour une propriété
      table.unique(['property_id', 'name'])
    })
  }

  async down() {
    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}