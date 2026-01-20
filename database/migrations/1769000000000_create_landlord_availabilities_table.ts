import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour la table landlord_availabilities
 * 
 * Stocke les disponibilités configurées par le bailleur pour recevoir des visites.
 * Permet de définir les jours et heures de travail, ainsi que la durée standard d'une visite.
 */
export default class extends BaseSchema {
  protected tableName = 'landlord_availabilities'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()

      // Relation avec l'utilisateur bailleur
      table
        .integer('landlord_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Jours de disponibilité (JSON array: ["monday", "tuesday", "wednesday", etc.])
      // Format: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
      table.json('available_days').notNullable().comment('Jours de la semaine disponibles (JSON array)')

      // Heure de début de disponibilité (format HH:mm)
      table.string('start_time', 5).notNullable().comment('Heure de début (ex: 08:00)')

      // Heure de fin de disponibilité (format HH:mm)
      table.string('end_time', 5).notNullable().comment('Heure de fin (ex: 17:00)')

      // Durée standard d'une visite en minutes (ex: 30, 45, 60)
      table.integer('visit_duration_minutes').notNullable().defaultTo(30).comment('Durée d\'une visite en minutes')

      // Indicateur si cette configuration est active
      table.boolean('is_active').defaultTo(true).notNullable()

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['landlord_id'])
      table.index(['is_active'])
      
      // Contrainte unique : un bailleur ne peut avoir qu'une seule configuration active à la fois
      // On utilisera une logique applicative pour gérer cela plutôt qu'une contrainte DB
    })
  }

  async down() {
    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}

