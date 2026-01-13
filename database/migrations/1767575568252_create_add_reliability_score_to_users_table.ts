import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Migration pour ajouter le score de fiabilité aux utilisateurs
 * Permet de tracker la fiabilité des locataires (visites complétées, no-show, etc.)
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('reliability_score')
        .defaultTo(0)
        .notNullable()
        .comment('Score de fiabilité : +10 visite complétée, -20 no-show, -5 annulation tardive')
      
      // Index pour trier/filtrer par score
      table.index(['reliability_score'])
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(['reliability_score'])
      table.dropColumn('reliability_score')
    })
  }
}
