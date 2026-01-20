import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.enum('active_role', ['tenant', 'landlord']).nullable().after('reliability_score')
      table.string('default_role', 20).nullable().after('active_role')
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

    const dropColumnIfExists = async (column: string) => {
      const colResult: any = await this.db.rawQuery(
        `SHOW COLUMNS FROM ${this.tableName} LIKE '${column}'`
      )
      if (colResult[0] && colResult[0].length > 0) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN ${column}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    await dropColumnIfExists('active_role')
    await dropColumnIfExists('default_role')
  }
}
