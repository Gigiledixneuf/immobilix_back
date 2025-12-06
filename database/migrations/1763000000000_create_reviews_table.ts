import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reviews'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')

      // Relation avec la propriété
      table
        .integer('property_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('properties')
        .onDelete('CASCADE')

      // Relation avec l'utilisateur qui a écrit l'avis (locataire)
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      // Note (rating) de 1 à 5
      // Note: MySQL ne supporte pas les CHECK constraints de la même manière
      // La validation sera faite au niveau de l'application
      table.integer('rating').unsigned().notNullable()

      // Commentaire
      table.text('comment').nullable()

      // Dates automatiques
      table.timestamp('created_at', { useTz: true }).nullable()
      table.timestamp('updated_at', { useTz: true }).nullable()

      // Index pour améliorer les performances
      table.index(['property_id'])
      table.index(['user_id'])
      table.index(['property_id', 'created_at'])

      // Un utilisateur ne peut laisser qu'un seul avis par propriété
      table.unique(['property_id', 'user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}

