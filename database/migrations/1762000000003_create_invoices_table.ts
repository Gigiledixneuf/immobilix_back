import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invoices'

  async up() {
    // Paiements/factures désactivés pour l'instant
    return
  }

  async down() {
    await this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}


