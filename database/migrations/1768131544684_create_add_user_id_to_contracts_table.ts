import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

export default class extends BaseSchema {
  protected tableName = 'contracts'

  async up() {
    // Ajouter la colonne user_id
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .after('id')
      
      table.index(['user_id'])
    })
    
    // Remplir user_id avec les données existantes (via property.user_id)
    await db.raw(`
      UPDATE contracts c
      INNER JOIN properties p ON c.property_id = p.id
      SET c.user_id = p.user_id
      WHERE c.user_id IS NULL
    `)
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['user_id'])
      table.dropColumn('user_id')
    })
  }
}