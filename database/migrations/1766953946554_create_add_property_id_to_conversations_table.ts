import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Ajouter property_id pour lier les conversations aux propriétés
      table
        .integer('property_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('properties')
        .onDelete('SET NULL')

      // Ajouter un index pour améliorer les performances
      table.index(['property_id'])

      // Modifier la contrainte unique pour inclure property_id
      // Cela permet d'avoir plusieurs conversations entre les mêmes utilisateurs pour différentes propriétés
      // Note: MySQL traite les NULL comme distincts dans les contraintes UNIQUE, donc cela fonctionne
      table.dropUnique(['user1_id', 'user2_id'])
      table.unique(['user1_id', 'user2_id', 'property_id'])
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

    const dropForeignKeyIfExists = async (column: string) => {
      const fkResult: any = await this.db.rawQuery(
        `
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `,
        [this.tableName, column]
      )
      const fkRows = fkResult[0] || []
      for (const row of fkRows) {
        if (!row.CONSTRAINT_NAME) {
          continue
        }
        try {
          await this.db.rawQuery(
            `ALTER TABLE ${this.tableName} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`
          )
        } catch {
          // Ignore if already dropped
        }
      }
    }

    const dropIndexByName = async (indexName: string) => {
      if (indexNames.has(indexName)) {
        try {
          await this.db.rawQuery(`DROP INDEX ${indexName} ON ${this.tableName}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    await dropForeignKeyIfExists('property_id')
    await dropIndexByName('conversations_user1_id_user2_id_property_id_unique')
    await dropIndexByName('conversations_user1_id_user2_id_unique')
    await dropIndexByName('conversations_property_id_index')
    await dropIndexByName('property_id')

    const columnResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'property_id'`
    )
    if (columnResult[0] && columnResult[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN property_id`)
      } catch {
        // Ignore if already dropped
      }
    }

    // Recréer l'unique index original si absent
    const refreshedIndexes: any = await this.db.rawQuery(`SHOW INDEXES FROM ${this.tableName}`)
    const refreshedRows = refreshedIndexes[0] || []
    const refreshedNames = new Set(refreshedRows.map((idx: any) => idx.Key_name))
    if (!refreshedNames.has('conversations_user1_id_user2_id_unique')) {
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
          await this.db.rawQuery(
            `CREATE UNIQUE INDEX conversations_user1_id_user2_id_unique ON ${this.tableName}(user1_id, user2_id)`
          )
        } catch {
          // Ignore if already exists
        }
      }
    }
  }
}
