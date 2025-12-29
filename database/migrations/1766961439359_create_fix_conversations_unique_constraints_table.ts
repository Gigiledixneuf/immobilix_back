import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    // Utiliser alterTable pour modifier la table
    this.schema.alterTable(this.tableName, (table) => {
      // Vérifier et ajouter property_id si nécessaire (sera ignoré si existe déjà)
      // Note: On ne peut pas vérifier directement, donc on essaie de l'ajouter
      // Si la colonne existe déjà, cela échouera mais on peut l'ignorer
    })

    // Utiliser des requêtes SQL brutes pour gérer les contraintes
    // Supprimer l'ancienne contrainte unique si elle existe
    try {
      await this.db.rawQuery(
        `ALTER TABLE conversations DROP INDEX conversations_user1_id_user2_id_unique`
      )
    } catch (error: any) {
      // Ignorer l'erreur si la contrainte n'existe pas
      if (!error.message?.includes("doesn't exist") && !error.message?.includes("Unknown key")) {
        console.log('Note: Ancienne contrainte déjà supprimée ou inexistante')
      }
    }

    // Vérifier si property_id existe, sinon l'ajouter
    const columnExists = await this.db
      .from('information_schema.COLUMNS')
      .where('TABLE_SCHEMA', this.db.rawQuery('DATABASE()'))
      .where('TABLE_NAME', 'conversations')
      .where('COLUMN_NAME', 'property_id')
      .count('* as count')
      .first()

    if (!columnExists || (columnExists as any).count === 0) {
      await this.db.rawQuery(`
        ALTER TABLE conversations 
        ADD COLUMN property_id INT UNSIGNED NULL,
        ADD INDEX idx_property_id (property_id),
        ADD FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL
      `)
    }

    // Supprimer la nouvelle contrainte si elle existe déjà
    try {
      await this.db.rawQuery(
        `ALTER TABLE conversations DROP INDEX conversations_user1_id_user2_id_property_id_unique`
      )
    } catch (error: any) {
      // Ignorer l'erreur si la contrainte n'existe pas
      if (!error.message?.includes("doesn't exist") && !error.message?.includes("Unknown key")) {
        console.log('Note: Nouvelle contrainte déjà supprimée ou inexistante')
      }
    }

    // Créer la nouvelle contrainte unique avec property_id
    await this.db.rawQuery(`
      ALTER TABLE conversations 
      ADD UNIQUE KEY conversations_user1_id_user2_id_property_id_unique (user1_id, user2_id, property_id)
    `)
  }

  async down() {
    // Supprimer la nouvelle contrainte
    try {
      await this.db.rawQuery(
        `ALTER TABLE conversations DROP INDEX conversations_user1_id_user2_id_property_id_unique`
      )
    } catch (error: any) {
      // Ignorer l'erreur si la contrainte n'existe pas
      console.log('Note: Contrainte déjà supprimée ou inexistante')
    }

    // Recréer l'ancienne contrainte
    try {
      await this.db.rawQuery(`
        ALTER TABLE conversations 
        ADD UNIQUE KEY conversations_user1_id_user2_id_unique (user1_id, user2_id)
      `)
    } catch (error: any) {
      // Ignorer l'erreur si la contrainte existe déjà
      console.log('Note: Contrainte déjà existante')
    }
  }
}
