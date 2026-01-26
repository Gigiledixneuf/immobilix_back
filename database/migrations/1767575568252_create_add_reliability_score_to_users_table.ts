import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour ajouter le score de fiabilité aux utilisateurs
 * Permet de tracker la fiabilité des locataires (visites complétées, no-show, etc.)
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('reliability_score')
        .defaultTo(0)
        .notNullable()
        .comment('Score de fiabilité : +10 visite complétée, -20 no-show, -5 annulation tardive')
      
      // Index pour trier/filtrer par score
      table.index(['reliability_score'])
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

    const indexResult: any = await this.db.rawQuery(`SHOW INDEXES FROM ${this.tableName}`)
    const indexRows = indexResult[0] || []
    const indexNames = new Set(indexRows.map((idx: any) => idx.Key_name))
    if (indexNames.has('users_reliability_score_index')) {
      try {
        await this.db.rawQuery(`DROP INDEX users_reliability_score_index ON ${this.tableName}`)
      } catch {
        // Ignore if already dropped
      }
    } else if (indexNames.has('reliability_score')) {
      try {
        await this.db.rawQuery(`DROP INDEX reliability_score ON ${this.tableName}`)
      } catch {
        // Ignore if already dropped
      }
    }

    const columnResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'reliability_score'`
    )
    if (columnResult[0] && columnResult[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN reliability_score`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}
