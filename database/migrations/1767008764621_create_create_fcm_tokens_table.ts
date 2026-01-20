import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'fcm_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      
      table.string('token').notNullable().unique()
      table.string('device_id').nullable() // Identifiant unique de l'appareil (optionnel)
      table.string('device_type').nullable() // 'ios', 'android' (optionnel)
      table.boolean('is_active').defaultTo(true)
      
      table.timestamps(true, true)

      // Index pour améliorer les performances
      table.index(['user_id', 'is_active'])
      table.index('token')
    })
  }

  async down() {
    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}