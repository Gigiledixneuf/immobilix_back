import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour ajouter visit_request_id aux tables applications et contracts
 * Permet de lier explicitement les candidatures et contrats aux visites
 */
export default class extends BaseSchema {
  async up() {
    // Ajouter visit_request_id à applications
    this.schema.alterTable('applications', (table) => {
      table
        .integer('visit_request_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('visit_requests')
        .onDelete('SET NULL')
        .comment('Lien avec la visite qui a mené à cette candidature')
      
      // Index pour améliorer les performances
      table.index(['visit_request_id'])
    })

    // Ajouter visit_request_id à contracts
    this.schema.alterTable('contracts', (table) => {
      table
        .integer('visit_request_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('visit_requests')
        .onDelete('SET NULL')
        .comment('Lien avec la visite qui a mené à ce contrat')
      
      // Index pour améliorer les performances
      table.index(['visit_request_id'])
    })
  }

  async down() {
    const tableExists = async (table: string) => {
      const tableResult: any = await this.db.rawQuery(
        `
        SELECT 1
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        LIMIT 1
      `,
        [table]
      )
      return (tableResult[0] || []).length > 0
    }

    const dropFkIfExists = async (table: string, column: string) => {
      if (!(await tableExists(table))) {
        return
      }
      const fkResult: any = await this.db.rawQuery(
        `
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `,
        [table, column]
      )
      const rows = fkResult[0] || []
      if (rows.length > 0) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${table} DROP FOREIGN KEY ${rows[0].CONSTRAINT_NAME}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    const dropIndexIfExists = async (table: string, indexName: string) => {
      if (!(await tableExists(table))) {
        return
      }
      const indexResult: any = await this.db.rawQuery(`SHOW INDEXES FROM ${table}`)
      const indexRows = indexResult[0] || []
      const indexNames = new Set(indexRows.map((idx: any) => idx.Key_name))
      if (indexNames.has(indexName)) {
        try {
          await this.db.rawQuery(`DROP INDEX ${indexName} ON ${table}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    const dropColumnIfExists = async (table: string, column: string) => {
      if (!(await tableExists(table))) {
        return
      }
      const colResult: any = await this.db.rawQuery(`SHOW COLUMNS FROM ${table} LIKE '${column}'`)
      if (colResult[0] && colResult[0].length > 0) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${table} DROP COLUMN ${column}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    await dropFkIfExists('applications', 'visit_request_id')
    await dropIndexIfExists('applications', 'applications_visit_request_id_index')
    await dropColumnIfExists('applications', 'visit_request_id')

    await dropFkIfExists('contracts', 'visit_request_id')
    await dropIndexIfExists('contracts', 'contracts_visit_request_id_index')
    await dropColumnIfExists('contracts', 'visit_request_id')
  }
}
