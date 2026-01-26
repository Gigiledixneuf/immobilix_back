import { BaseSchema } from '@adonisjs/lucid/schema'
import { Currencies } from '../../app/models/contract.js'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    // Paiements désactivés pour l'instant
    return
  }

  async down() {
    await this.schema.raw(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}
