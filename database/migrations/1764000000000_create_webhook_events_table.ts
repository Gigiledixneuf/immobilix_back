import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'webhook_events'

  private async tableExists(table: string): Promise<boolean> {
    const result: any = await this.db.rawQuery(
      `
      SELECT 1
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      LIMIT 1
    `,
      [table]
    )
    return (result[0] || []).length > 0
  }

  async up() {
    if (await this.tableExists(this.tableName)) {
      return
    }

    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      
      // Identifiant unique du webhook (transaction_id, reference, etc.)
      table.string('event_id').notNullable().unique()
      
      // Type de webhook (payment, refund, etc.)
      table.string('event_type').notNullable()
      
      // Provider (flutterwave, other)
      table.string('provider').notNullable()
      
      // ID du paiement associé (si applicable)
      table
        .integer('payment_id')
        .unsigned()
        .nullable()
      
      // Payload complet du webhook (JSON)
      table.json('payload').notNullable()
      
      // Statut de traitement
      table.enum('status', ['pending', 'processed', 'failed']).defaultTo('pending')
      
      // Message d'erreur si échec
      table.text('error_message').nullable()
      
      // Nombre de tentatives de traitement
      table.integer('retry_count').defaultTo(0)
      
      // Timestamps
      table.timestamps(true, true)
      
      // Index pour recherches rapides
      table.index(['event_id'], 'webhook_events_event_id_index')
      table.index(['payment_id'], 'webhook_events_payment_id_index')
      table.index(['status'], 'webhook_events_status_index')
      table.index(['created_at'], 'webhook_events_created_at_index')
    })

    const hasPayments = await this.tableExists('payments')
    if (hasPayments) {
      try {
        const fkResult: any = await this.db.rawQuery(
          `
          SELECT CONSTRAINT_NAME
          FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = 'payment_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL
        `,
          [this.tableName]
        )
        const fkRows = fkResult[0] || []
        if (fkRows.length === 0) {
          await this.db.rawQuery(
            `ALTER TABLE ${this.tableName}
             ADD CONSTRAINT webhook_events_payment_id_foreign
             FOREIGN KEY (payment_id) REFERENCES payments(id)
             ON DELETE SET NULL`
          )
        }
      } catch {
        // Ignore if FK cannot be created in current env
      }
    }
  }

  async down() {
    await this.db.rawQuery(`DROP TABLE IF EXISTS ${this.tableName}`)
  }
}

