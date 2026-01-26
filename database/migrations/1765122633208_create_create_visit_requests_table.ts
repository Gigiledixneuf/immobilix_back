import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'visit_requests'

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

      // Relation avec l'utilisateur (locataire qui demande la visite)
      table
        .integer('tenant_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Date et heure de la visite demandée
      table.date('requested_date').notNullable()
      table.time('requested_time').notNullable()

      // Message optionnel
      table.text('message').nullable()

      // Statut de la demande : pending, accepted, rejected, cancelled
      table
        .enum('status', ['pending', 'accepted', 'rejected', 'cancelled'])
        .defaultTo('pending')
        .notNullable()

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id'])
      table.index(['tenant_id'])
      table.index(['status'])
      table.index(['requested_date'])
      table.index(['property_id', 'status'])
    })
  }

  async down() {
    const tableResult: any = await this.db.rawQuery(
      `
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      LIMIT 1
    `,
      [this.tableName]
    )
    const hasTable = (tableResult[0] || []).length > 0
    if (!hasTable) {
      return
    }

    const fkResult: any = await this.db.rawQuery(
      `
      SELECT TABLE_NAME, CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = ?
    `,
      [this.tableName]
    )
    const fkRows = fkResult[0] || []
    for (const row of fkRows) {
      if (!row.TABLE_NAME || !row.CONSTRAINT_NAME) continue
      try {
        await this.db.rawQuery(
          `ALTER TABLE ${row.TABLE_NAME} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`
        )
      } catch {
        // Ignore if already dropped
      }
    }

    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}