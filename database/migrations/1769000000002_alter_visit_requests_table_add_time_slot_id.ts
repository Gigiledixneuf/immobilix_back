import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour ajouter la référence au créneau horaire dans visit_requests
 * 
 * Permet de lier une demande de visite à un créneau horaire spécifique,
 * facilitant la gestion des conflits et la génération automatique des créneaux.
 */
export default class extends BaseSchema {
  protected tableName = 'visit_requests'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Relation avec le créneau horaire réservé
      table
        .integer('time_slot_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('visit_time_slots')
        .onDelete('SET NULL')
        .after('scheduled_at')
        .comment('Créneau horaire réservé par cette demande')

      // Index pour améliorer les performances
      table.index(['time_slot_id'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropForeign(['time_slot_id'])
      table.dropColumn('time_slot_id')
    })
  }
}

