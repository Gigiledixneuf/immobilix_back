import { BaseSchema } from '@adonisjs/lucid/schema'

// Le nom de la classe et du fichier de migration est bon pour indiquer l'action
export default class AddHederaContractIdToContracts extends BaseSchema {
  // Nous ciblons la table qui doit être modifiée
  protected tableName = 'contracts'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // 🎯 C'est la seule ligne qui est nécessaire dans la méthode up()
      table
        .string('hedera_contract_id')
        .nullable()
        .unique() // L'ID doit être unique s'il référence un Smart Contract
        .comment('ID du Smart Contract Hedera')
        .after('deposit_status') // Optionnel, pour un meilleur ordre des colonnes
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

    const colResult: any = await this.db.rawQuery(
      `SHOW COLUMNS FROM ${this.tableName} LIKE 'hedera_contract_id'`
    )
    if (colResult[0] && colResult[0].length > 0) {
      try {
        await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN hedera_contract_id`)
      } catch {
        // Ignore if already dropped
      }
    }
  }
}
