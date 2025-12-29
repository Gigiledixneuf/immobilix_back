import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'property_photos'

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

      // URL du fichier photo
      table.string('photo_url').notNullable().comment('URL de la photo')

      // Ordre d'affichage
      table.integer('display_order').unsigned().defaultTo(0).comment('Ordre d\'affichage des photos')

      // Photo principale (une seule par propriété)
      table.boolean('is_main').defaultTo(false).comment('Photo principale')

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id'])
      table.index(['property_id', 'display_order'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}