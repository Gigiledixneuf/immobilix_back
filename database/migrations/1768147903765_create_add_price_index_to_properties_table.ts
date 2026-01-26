import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Ajouter un index sur le champ price pour optimiser les requêtes MIN/MAX
      table.index(['price'], 'properties_price_index')
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
    if (indexNames.has('properties_price_index')) {
      try {
        await this.db.rawQuery(`DROP INDEX properties_price_index ON ${this.tableName}`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}