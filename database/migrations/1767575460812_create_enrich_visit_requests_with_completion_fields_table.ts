import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour enrichir la table visit_requests avec :
 * - Champs de confirmation de visite (double confirmation)
 * - Statuts supplémentaires (no_show, auto_cancelled)
 * - Pré-confirmation (tenant_pre_confirmed)
 * - Notes post-visite
 */
export default class extends BaseSchema {
  protected tableName = 'visit_requests'

  async up() {
    // Ajouter les nouveaux champs pour la confirmation de visite
    this.schema.alterTable(this.tableName, (table) => {
      // Confirmation de visite
      table.dateTime('completed_at').nullable().comment('Date/heure de confirmation finale de la visite')
      table.boolean('completed_by_landlord').defaultTo(false).comment('Confirmé par le bailleur')
      table.boolean('completed_by_tenant').defaultTo(false).comment('Confirmé par le locataire')
      
      // Pré-confirmation (anti-fantôme)
      table.boolean('tenant_pre_confirmed').defaultTo(false).comment('Locataire a confirmé sa présence avant la visite')
      table.dateTime('pre_confirmed_at').nullable().comment('Date/heure de pré-confirmation')
      
      // Notes post-visite
      table.text('visit_notes_landlord').nullable().comment('Notes post-visite du bailleur')
      table.text('visit_notes_tenant').nullable().comment('Notes post-visite du locataire')
      
      // Délai de confirmation (configurable, en heures)
      table.integer('confirmation_deadline_hours').defaultTo(48).comment('Délai max pour confirmer après scheduled_at (heures)')
    })

    // Modifier l'enum status pour ajouter 'no_show' et 'auto_cancelled'
    // MySQL nécessite une requête SQL brute pour modifier un enum
    this.defer(async (db) => {
      await db.rawQuery(
        "ALTER TABLE `visit_requests` MODIFY COLUMN `status` ENUM('pending', 'accepted', 'rejected', 'completed', 'cancelled', 'auto_cancelled', 'no_show') DEFAULT 'pending' NOT NULL"
      )
    })
  }

  async down() {
    // Restaurer l'enum original
    this.defer(async (db) => {
      await db.rawQuery(
        "ALTER TABLE `visit_requests` MODIFY COLUMN `status` ENUM('pending', 'accepted', 'rejected', 'completed', 'cancelled') DEFAULT 'pending' NOT NULL"
      )
    })

    // Retirer les colonnes ajoutées
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('completed_at')
      table.dropColumn('completed_by_landlord')
      table.dropColumn('completed_by_tenant')
      table.dropColumn('tenant_pre_confirmed')
      table.dropColumn('pre_confirmed_at')
      table.dropColumn('visit_notes_landlord')
      table.dropColumn('visit_notes_tenant')
      table.dropColumn('confirmation_deadline_hours')
    })
  }
}
