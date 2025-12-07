import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'password_reset_tokens'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Relation avec l'utilisateur
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Token unique pour la réinitialisation
      table.string('token', 255).notNullable().unique()

      // Email de l'utilisateur (pour faciliter la recherche)
      table.string('email', 191).notNullable()

      // Date d'expiration (par défaut 1 heure)
      table.timestamp('expires_at').notNullable()

      // Indique si le token a été utilisé
      table.boolean('used').defaultTo(false)

      // Date d'utilisation (si utilisé)
      table.timestamp('used_at').nullable()

      // Timestamps
      table.timestamp('created_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['token'])
      table.index(['email'])
      table.index(['user_id'])
      table.index(['expires_at'])
      table.index(['used'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}