import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'webhook_events'

  async up() {
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
        .references('id')
        .inTable('payments')
        .onDelete('SET NULL')
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
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

