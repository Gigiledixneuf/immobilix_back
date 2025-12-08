import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'visit_requests'

  async up() {
    // Ajouter la colonne scheduled_at
    this.schema.alterTable(this.tableName, (table) => {
      table.dateTime('scheduled_at').nullable().comment('Date/heure confirmée par le bailleur')
    })

    // Modifier l'enum status pour ajouter 'completed'
    // MySQL nécessite une requête SQL brute pour modifier un enum
    this.defer(async (db) => {
      await db.rawQuery(
        "ALTER TABLE `visit_requests` MODIFY COLUMN `status` ENUM('pending', 'accepted', 'rejected', 'completed', 'cancelled') DEFAULT 'pending' NOT NULL"
      )
    })
  }

  async down() {
    // Restaurer l'enum original (sans 'completed') d'abord
    this.defer(async (db) => {
      await db.rawQuery(
        "ALTER TABLE `visit_requests` MODIFY COLUMN `status` ENUM('pending', 'accepted', 'rejected', 'cancelled') DEFAULT 'pending' NOT NULL"
      )
    })

    // Retirer la colonne scheduled_at
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('scheduled_at')
    })
  }
}