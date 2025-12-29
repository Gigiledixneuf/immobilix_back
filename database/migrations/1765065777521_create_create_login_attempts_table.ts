import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'login_attempts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Email utilisé pour la tentative (peut être null si l'utilisateur n'existe pas)
      table.string('email', 191).nullable()

      // ID de l'utilisateur si trouvé (peut être null)
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      // IP du client
      table.string('ip_address', 45).nullable() // IPv6 peut être jusqu'à 45 caractères

      // User Agent du client
      table.text('user_agent').nullable()

      // Résultat de la tentative
      table
        .enum('status', ['success', 'failed', 'blocked'])
        .notNullable()
        .defaultTo('failed')

      // Raison de l'échec (si applicable)
      table.string('failure_reason', 100).nullable() // 'invalid_email', 'invalid_password', 'rate_limited', etc.

      // Timestamps
      table.timestamp('created_at', { useTz: true }).nullable()

      // Index pour améliorer les performances et les requêtes
      table.index(['email', 'created_at'])
      table.index(['user_id', 'created_at'])
      table.index(['ip_address', 'created_at'])
      table.index(['status', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}