import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
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

    if (indexNames.has('conversations_user1_id_user2_id_unique')) {
      try {
        await this.db.rawQuery(
          `ALTER TABLE ${this.tableName} DROP INDEX conversations_user1_id_user2_id_unique`
        )
      } catch {
        // Ignore if already dropped
      }
    }

    const columnResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'property_id'`
    )
    const hasPropertyId = columnResult[0] && columnResult[0].length > 0
    if (!hasPropertyId) {
      try {
        await this.db.rawQuery(`
          ALTER TABLE ${this.tableName}
          ADD COLUMN property_id INT UNSIGNED NULL,
          ADD INDEX idx_property_id (property_id),
          ADD FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL
        `)
      } catch {
        // Ignore if cannot add due to existing partial state
      }
    }

    if (indexNames.has('conversations_user1_id_user2_id_property_id_unique')) {
      try {
        await this.db.rawQuery(
          `ALTER TABLE ${this.tableName} DROP INDEX conversations_user1_id_user2_id_property_id_unique`
        )
      } catch {
        // Ignore if already dropped
      }
    }

    const duplicateResult: any = await this.db.rawQuery(
      `
      SELECT user1_id, user2_id, property_id, COUNT(*) as cnt
      FROM ${this.tableName}
      GROUP BY user1_id, user2_id, property_id
      HAVING cnt > 1
      LIMIT 1
    `
    )
    const hasDuplicates = (duplicateResult[0] || []).length > 0
    if (!hasDuplicates) {
      try {
        await this.db.rawQuery(`
          ALTER TABLE ${this.tableName}
          ADD UNIQUE KEY conversations_user1_id_user2_id_property_id_unique (user1_id, user2_id, property_id)
        `)
      } catch {
        // Ignore if already exists
      }
    }
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

    if (indexNames.has('conversations_user1_id_user2_id_property_id_unique')) {
      try {
        await this.db.rawQuery(
          `ALTER TABLE ${this.tableName} DROP INDEX conversations_user1_id_user2_id_property_id_unique`
        )
      } catch {
        // Ignore if already dropped
      }
    }

    if (!indexNames.has('conversations_user1_id_user2_id_unique')) {
      const duplicateResult: any = await this.db.rawQuery(
        `
        SELECT user1_id, user2_id, COUNT(*) as cnt
        FROM ${this.tableName}
        GROUP BY user1_id, user2_id
        HAVING cnt > 1
        LIMIT 1
      `
      )
      const hasDuplicates = (duplicateResult[0] || []).length > 0
      if (!hasDuplicates) {
        try {
          await this.db.rawQuery(`
            ALTER TABLE ${this.tableName}
            ADD UNIQUE KEY conversations_user1_id_user2_id_unique (user1_id, user2_id)
          `)
        } catch {
          // Ignore if already exists
        }
      }
    }
  }
}
