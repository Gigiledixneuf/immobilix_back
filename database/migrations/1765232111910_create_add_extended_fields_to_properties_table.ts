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

    const dropColumnIfExists = async (column: string) => {
      const colResult: any = await this.db.rawQuery(
        `SHOW COLUMNS FROM ${this.tableName} LIKE '${column}'`
      )
      if (colResult[0] && colResult[0].length > 0) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN ${column}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    await dropColumnIfExists('street_number')
    await dropColumnIfExists('state')
    await dropColumnIfExists('postal_code')
    await dropColumnIfExists('available_from')
    await dropColumnIfExists('available_time')
    await dropColumnIfExists('rental_reason')
    await dropColumnIfExists('rental_reason_other')
    await dropColumnIfExists('property_use_type')
    await dropColumnIfExists('year_built')
    await dropColumnIfExists('bathrooms')
    await dropColumnIfExists('security_deposit')
    await dropColumnIfExists('deposit_months')
    await dropColumnIfExists('land_size')
    await dropColumnIfExists('contact_phone')
    await dropColumnIfExists('additional_info')
    await dropColumnIfExists('creation_step')
  }
}