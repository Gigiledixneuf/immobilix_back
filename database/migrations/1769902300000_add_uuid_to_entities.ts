import { BaseSchema } from '@adonisjs/lucid/schema'

type UuidTable = {
  table: string
  column?: string
}

export default class extends BaseSchema {
  private tables: UuidTable[] = [
    { table: 'users' },
    { table: 'roles' },
    { table: 'properties' },
    { table: 'visit_requests' },
    { table: 'reviews' },
    { table: 'applications' },
    { table: 'contracts' },
    { table: 'messages' },
    { table: 'conversations' },
    { table: 'property_questions' },
    { table: 'notifications' },
    { table: 'invites' },
    { table: 'favorites' },
    { table: 'property_views' },
    { table: 'property_photos' },
    { table: 'property_amenities' },
    { table: 'visit_time_slots' },
    { table: 'landlord_availabilities' },
    { table: 'fcm_tokens' },
    { table: 'login_attempts' },
    { table: 'password_reset_tokens' },
    { table: 'webhook_events' },
  ]

  private async tableExists(table: string): Promise<boolean> {
    const result: any = await this.db.rawQuery(
      `
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      LIMIT 1
    `,
      [table]
    )
    return (result[0] || []).length > 0
  }

  private async columnExists(table: string, column: string): Promise<boolean> {
    const result: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${table} LIKE '${column}'`
    )
    return result[0] && result[0].length > 0
  }

  private async indexExists(table: string, indexName: string): Promise<boolean> {
    const result: any = await this.db.rawQuery(`SHOW INDEXES FROM ${table}`)
    const rows = result[0] || []
    return rows.some((row: any) => row.Key_name === indexName)
  }

  async up() {
    for (const entry of this.tables) {
      const table = entry.table
      if (!(await this.tableExists(table))) {
        continue
      }

      if (!(await this.columnExists(table, 'uuid'))) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${table} ADD COLUMN uuid CHAR(36) NULL`)
        } catch {
          // Ignore if already exists
        }
      }

      if (await this.columnExists(table, 'uuid')) {
        try {
          await this.db.rawQuery(`UPDATE ${table} SET uuid = UUID() WHERE uuid IS NULL`)
        } catch {
          // Ignore if table is locked or unavailable
        }

        try {
          await this.db.rawQuery(`ALTER TABLE ${table} MODIFY COLUMN uuid CHAR(36) NOT NULL`)
        } catch {
          // Ignore if already NOT NULL
        }
      }

      const indexName = `${table}_uuid_unique`
      if (!(await this.indexExists(table, indexName))) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${table} ADD UNIQUE KEY ${indexName} (uuid)`)
        } catch {
          // Ignore if already exists
        }
      }
    }
  }

  async down() {
    for (const entry of this.tables) {
      const table = entry.table
      if (!(await this.tableExists(table))) {
        continue
      }

      const indexName = `${table}_uuid_unique`
      if (await this.indexExists(table, indexName)) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${table} DROP INDEX ${indexName}`)
        } catch {
          // Ignore if already dropped
        }
      }

      if (await this.columnExists(table, 'uuid')) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${table} DROP COLUMN uuid`)
        } catch {
          // Ignore if already dropped
        }
      }
    }
  }
}
