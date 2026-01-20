import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour ajouter la référence au créneau horaire dans visit_requests
 * 
 * Permet de lier une demande de visite à un créneau horaire spécifique,
 * facilitant la gestion des conflits et la génération automatique des créneaux.
 */
export default class extends BaseSchema {
  protected tableName = 'visit_requests'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Relation avec le créneau horaire réservé
      table
        .integer('time_slot_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('visit_time_slots')
        .onDelete('SET NULL')
        .after('scheduled_at')
        .comment('Créneau horaire réservé par cette demande')

      // Index pour améliorer les performances
      table.index(['time_slot_id'])
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
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = 'time_slot_id'
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `,
      [this.tableName]
    )
    const fkRows = fkResult[0] || []
    for (const row of fkRows) {
      if (!row.CONSTRAINT_NAME) continue
      try {
        await this.db.rawQuery(
          `ALTER TABLE ${this.tableName} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`
        )
      } catch {
        // Ignore if already dropped
      }
    }

    const indexResult: any = await this.db.rawQuery(`SHOW INDEXES FROM ${this.tableName}`)
    const indexRows = indexResult[0] || []
    const indexNames = new Set(indexRows.map((idx: any) => idx.Key_name))
    if (indexNames.has('visit_requests_time_slot_id_index')) {
      try {
        await this.db.rawQuery(`DROP INDEX visit_requests_time_slot_id_index ON ${this.tableName}`)
      } catch {
        // Ignore if already dropped
      }
    }

    const colResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'time_slot_id'`
    )
    if (colResult[0] && colResult[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN time_slot_id`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}

