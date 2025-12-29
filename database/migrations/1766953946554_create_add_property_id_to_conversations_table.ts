import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Ajouter property_id pour lier les conversations aux propriétés
      table
        .integer('property_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('properties')
        .onDelete('SET NULL')

      // Ajouter un index pour améliorer les performances
      table.index(['property_id'])

      // Modifier la contrainte unique pour inclure property_id
      // Cela permet d'avoir plusieurs conversations entre les mêmes utilisateurs pour différentes propriétés
      // Note: MySQL traite les NULL comme distincts dans les contraintes UNIQUE, donc cela fonctionne
      table.dropUnique(['user1_id', 'user2_id'])
      table.unique(['user1_id', 'user2_id', 'property_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(['user1_id', 'user2_id', 'property_id'])
      table.unique(['user1_id', 'user2_id'])
      table.dropIndex(['property_id'])
      table.dropColumn('property_id')
    })
  }
}
