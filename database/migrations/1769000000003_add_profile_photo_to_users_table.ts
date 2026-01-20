import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour ajouter le champ photo de profil aux utilisateurs
 * 
 * Permet d'afficher la photo du demandeur dans les demandes de visite.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .string('profile_photo_url')
        .nullable()
        .after('portable')
        .comment('URL de la photo de profil de l\'utilisateur')
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
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'profile_photo_url'`
    )
    if (colResult[0] && colResult[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN profile_photo_url`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}

