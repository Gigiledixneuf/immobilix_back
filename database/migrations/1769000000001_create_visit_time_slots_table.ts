import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour la table visit_time_slots
 * 
 * Stocke les créneaux horaires générés automatiquement basés sur les disponibilités du bailleur.
 * Un créneau représente un slot temporel disponible pour une visite.
 * Une fois réservé (accepté), le créneau devient indisponible.
 */
export default class extends BaseSchema {
  protected tableName = 'visit_time_slots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()

      // Relation avec la propriété concernée
      table
        .integer('property_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('properties')
        .onDelete('CASCADE')

      // Date du créneau (YYYY-MM-DD)
      table.date('slot_date').notNullable()

      // Heure de début du créneau (format HH:mm)
      table.string('start_time', 5).notNullable()

      // Heure de fin du créneau (format HH:mm) - calculée automatiquement selon visit_duration
      table.string('end_time', 5).notNullable()

      // Statut du créneau: 'available', 'reserved', 'blocked'
      // - available: créneau libre, peut être réservé
      // - reserved: créneau réservé par une demande acceptée
      // - blocked: créneau bloqué manuellement par le bailleur
      table.enum('status', ['available', 'reserved', 'blocked']).defaultTo('available').notNullable()

      // Relation optionnelle avec la demande de visite qui a réservé ce créneau
      // NULL si le créneau est disponible ou bloqué
      table
        .integer('visit_request_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('visit_requests')
        .onDelete('SET NULL')

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id', 'slot_date'])
      table.index(['slot_date', 'start_time'])
      table.index(['status'])
      table.index(['visit_request_id'])

      // Contrainte unique : un créneau (property_id + date + start_time) doit être unique
      // Pour éviter les doublons de créneaux pour la même propriété, date et heure
      table.unique(['property_id', 'slot_date', 'start_time'], {
        indexName: 'unique_slot',
      })
    })
  }

  async down() {
    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}

