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
    this.schema.alterTable('applications', (table) => {
      table.dropIndex(['visit_request_id'])
      table.dropColumn('visit_request_id')
    })

    this.schema.alterTable('contracts', (table) => {
      table.dropIndex(['visit_request_id'])
      table.dropColumn('visit_request_id')
    })
  }
}
