import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'notifications'

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
      table.string('title').notNullable()
      table.text('message').notNullable()
      table.string('type').defaultTo('info') // 'info', 'success', 'warning', 'error', 'application', 'payment', etc.
      table.boolean('is_read').defaultTo(false)
      table.json('data').nullable() // Données supplémentaires (propertyId, applicationId, etc.)
      table.timestamps(true, true)

      // Index pour améliorer les performances
      table.index(['user_id', 'is_read'])
      table.index(['user_id', 'created_at'])
    })
  }

  async down() {
    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}



