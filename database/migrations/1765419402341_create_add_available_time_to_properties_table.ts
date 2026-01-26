import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('available_time').nullable().after('available_from').comment('Heure de disponibilité')
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

    const colResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'available_time'`
    )
    if (colResult[0] && colResult[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN available_time`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}
