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
    const tableResult: any = await this.db.rawQuery(`
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contracts'
      LIMIT 1
    `)
    const hasContractsTable = (tableResult[0] || []).length > 0

    if (!hasContractsTable) {
      return
    }

    const indexResult: any = await this.db.rawQuery(`SHOW INDEXES FROM contracts`)
    const indexRows = indexResult[0] || []
    const indexNames = new Set(indexRows.map((idx: any) => idx.Key_name))

    const fkResult: any = await this.db.rawQuery(
      `
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contracts'
      AND COLUMN_NAME = 'user_id'
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `
    )
    const fkRows = fkResult[0] || []
    for (const row of fkRows) {
      if (!row.CONSTRAINT_NAME) continue
      try {
        await this.db.rawQuery(`ALTER TABLE contracts DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`)
      } catch {
        // Ignore if already dropped
      }
    }

    if (indexNames.has('contracts_user_id_index')) {
      try {
        await this.db.rawQuery(`DROP INDEX contracts_user_id_index ON contracts`)
      } catch {
        // Ignore if already dropped
      }
    } else if (indexNames.has('user_id')) {
      try {
        await this.db.rawQuery(`DROP INDEX user_id ON contracts`)
      } catch {
        // Ignore if already dropped
      }
    }

    const hasUserId: any = await this.db.rawQuery(`SHOW COLUMNS FROM contracts LIKE 'user_id'`)
    if (hasUserId[0] && hasUserId[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE contracts DROP COLUMN user_id`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}