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
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('profile_photo_url')
    })
  }
}

