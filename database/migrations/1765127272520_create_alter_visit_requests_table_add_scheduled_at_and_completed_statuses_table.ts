import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'visit_requests'

  async up() {
    // Ajouter la colonne scheduled_at
    this.schema.alterTable(this.tableName, (table) => {
      table.dateTime('scheduled_at').nullable().comment('Date/heure confirmée par le bailleur')
    })

    // Modifier l'enum status pour ajouter 'completed'
    // MySQL nécessite une requête SQL brute pour modifier un enum
    this.defer(async (db) => {
      await db.rawQuery(
        "ALTER TABLE `visit_requests` MODIFY COLUMN `status` ENUM('pending', 'accepted', 'rejected', 'completed', 'cancelled') DEFAULT 'pending' NOT NULL"
      )
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

    this.defer(async (db) => {
      try {
        await db.rawQuery(
          "ALTER TABLE `visit_requests` MODIFY COLUMN `status` ENUM('pending', 'accepted', 'rejected', 'cancelled') DEFAULT 'pending' NOT NULL"
        )
      } catch {
        // Ignore if already reverted
      }
    })

    const colResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'scheduled_at'`
    )
    if (colResult[0] && colResult[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN scheduled_at`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}