import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'properties'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Localisation étendue
      table.string('street_number').nullable().after('address')
      table.string('state').nullable().after('city')
      table.string('postal_code').nullable().after('state')
      
      // Disponibilité
      table.dateTime('available_from').nullable().comment('Date de disponibilité pour la location')
      
      // Raison de la location (optionnel)
      table.string('rental_reason').nullable().comment('Raison de la location')
      table.text('rental_reason_other').nullable().comment('Autre raison (si autre est sélectionné)')
      
      // Type d'utilisation (résidentiel ou commercial)
      table.enum('property_use_type', ['residential', 'commercial']).nullable().comment('Type d\'utilisation : résidentiel ou commercial')
      
      // Caractéristiques étendues
      table.integer('year_built').unsigned().nullable().comment('Année de construction')
      table.integer('bathrooms').unsigned().nullable().comment('Nombre de salles de bain')
      table.decimal('security_deposit', 10, 2).nullable().comment('Montant du dépôt de garantie')
      table.integer('deposit_months').unsigned().nullable().comment('Nombre de mois de garantie locative')
      table.integer('land_size').unsigned().nullable().comment('Taille du terrain (m²)')
      
      // Contact
      table.string('contact_phone').nullable().comment('Téléphone de contact')
      table.text('additional_info').nullable().comment('Autres informations')
      
      // Statut de création (pour le processus en plusieurs étapes)
      table.integer('creation_step').unsigned().defaultTo(0).comment('Étape actuelle de création (0-8)')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('street_number')
      table.dropColumn('state')
      table.dropColumn('postal_code')
      table.dropColumn('available_from')
      table.dropColumn('rental_reason')
      table.dropColumn('rental_reason_other')
      table.dropColumn('property_use_type')
      table.dropColumn('year_built')
      table.dropColumn('bathrooms')
      table.dropColumn('security_deposit')
      table.dropColumn('deposit_months')
      table.dropColumn('land_size')
      table.dropColumn('contact_phone')
      table.dropColumn('additional_info')
      table.dropColumn('creation_step')
    })
  }
}