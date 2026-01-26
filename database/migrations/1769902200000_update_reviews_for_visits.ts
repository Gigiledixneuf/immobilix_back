import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reviews'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('visit_request_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('visit_requests')
        .onDelete('CASCADE')

      table.enum('review_type', ['property', 'tenant']).nullable()

      table
        .integer('reviewed_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      table.integer('property_id').unsigned().nullable().alter()

      table.index(['visit_request_id'])
      table.index(['review_type'])
      table.index(['reviewed_user_id'])
      table.index(['property_id', 'review_type'])
    })

    this.defer(async (db) => {
      await db.rawQuery("UPDATE reviews SET review_type = 'property' WHERE review_type IS NULL")

      try {
        await db.rawQuery('DROP INDEX reviews_property_id_user_id_unique ON reviews')
      } catch {
        // Ignore if the index does not exist
      }

      try {
        await db.rawQuery(
          'CREATE UNIQUE INDEX reviews_visit_request_id_user_id_unique ON reviews(visit_request_id, user_id)'
        )
      } catch {
        // Ignore if the index already exists
      }
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

    const dropIndexByName = async (indexName: string) => {
      if (indexNames.has(indexName)) {
        try {
          await this.db.rawQuery(`DROP INDEX ${indexName} ON ${this.tableName}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    await dropIndexByName('reviews_visit_request_id_index')
    await dropIndexByName('reviews_review_type_index')
    await dropIndexByName('reviews_reviewed_user_id_index')
    await dropIndexByName('reviews_property_id_review_type_index')

    const columnExists = async (column: string) => {
      const colResult: any = await this.db.rawQuery(
        `SHOW COLUMNS FROM ${this.tableName} LIKE '${column}'`
      )
      return colResult[0] && colResult[0].length > 0
    }

    if (await columnExists('visit_request_id')) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN visit_request_id`)
      } catch {
        // Ignore if already dropped
      }
    }
    if (await columnExists('review_type')) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN review_type`)
      } catch {
        // Ignore if already dropped
      }
    }
    if (await columnExists('reviewed_user_id')) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN reviewed_user_id`)
      } catch {
        // Ignore if already dropped
      }
    }

    const propertyColumnResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'property_id'`
    )
    if (propertyColumnResult[0] && propertyColumnResult[0].length > 0) {
      try {
        await this.db.rawQuery(
          `ALTER TABLE ${this.tableName} MODIFY COLUMN property_id INT UNSIGNED NOT NULL`
        )
      } catch {
        // Ignore if already altered
      }
    }

    this.defer(async (db) => {
      try {
        await db.rawQuery('DROP INDEX reviews_visit_request_id_user_id_unique ON reviews')
      } catch {
        // Ignore if the index does not exist
      }

      try {
        await db.rawQuery('CREATE UNIQUE INDEX reviews_property_id_user_id_unique ON reviews(property_id, user_id)')
      } catch {
        // Ignore if the index already exists
      }
    })
  }
}
