import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Retirer la contrainte unique d'abord (si elle existe)
      table.dropUnique(['transaction_id'])
      // Puis rendre la colonne nullable
      table.string('transaction_id').nullable().alter()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      // Remettre la colonne comme notNullable
      table.string('transaction_id').notNullable().alter()
      // Puis remettre la contrainte unique (peut échouer si des valeurs null existent)
      table.unique(['transaction_id'])
    })
  }
}