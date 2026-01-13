import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'invoices'

  async up() {
    // Vérifier quelles colonnes existent déjà
    const result: any = await this.db.rawQuery(`SHOW COLUMNS FROM invoices`)
    const columns = result[0] || []
    const columnNames = columns.map((col: any) => col.Field)
    
    // Vérifier les contraintes de clé étrangère existantes
    const fkResult: any = await this.db.rawQuery(`
      SELECT CONSTRAINT_NAME 
      FROM information_schema.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'invoices' 
      AND COLUMN_NAME = 'contract_id' 
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `)
    const hasForeignKey = fkResult[0] && fkResult[0].length > 0
    const fkName = hasForeignKey ? fkResult[0][0].CONSTRAINT_NAME : null
    
    // Supprimer la contrainte de clé étrangère si elle existe
    if (fkName) {
      await this.schema.raw(`ALTER TABLE invoices DROP FOREIGN KEY ${fkName}`)
    }
    
    // Rendre contract_id nullable (car les factures peuvent être liées directement à une propriété)
    if (columnNames.includes('contract_id')) {
      await this.schema.raw(`ALTER TABLE invoices MODIFY COLUMN contract_id INT UNSIGNED NULL`)
    }
    
    // Recréer la contrainte de clé étrangère si elle existait
    if (fkName) {
      await this.schema.raw(`
        ALTER TABLE invoices 
        ADD CONSTRAINT invoices_contract_id_foreign 
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
      `)
    }
    
    // Ajouter les nouveaux champs pour les factures de propriété (seulement s'ils n'existent pas)
    if (!columnNames.includes('payment_type')) {
      await this.schema.raw(`
        ALTER TABLE invoices 
        ADD COLUMN payment_type ENUM('deposit', 'rent') NULL 
        COMMENT 'Type de paiement: deposit (caution) ou rent (loyer)'
      `)
    }
    
    if (!columnNames.includes('property_id')) {
      await this.schema.raw(`ALTER TABLE invoices ADD COLUMN property_id INT UNSIGNED NULL`)
      await this.schema.raw(`
        ALTER TABLE invoices 
        ADD CONSTRAINT invoices_property_id_foreign 
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      `)
    }
    
    if (!columnNames.includes('month')) {
      await this.schema.raw(`
        ALTER TABLE invoices 
        ADD COLUMN month VARCHAR(255) NULL 
        COMMENT 'Mois concerné pour le loyer (format: YYYY-MM)'
      `)
    }
    
    // Ajouter les index pour améliorer les performances (seulement s'ils n'existent pas)
    const allIndexesResult: any = await this.db.rawQuery(`SHOW INDEXES FROM invoices`)
    const allIndexes = allIndexesResult[0] || []
    const indexNames = [...new Set(allIndexes.map((idx: any) => idx.Key_name))]
    
    if (!indexNames.includes('invoices_property_id_index') && columnNames.includes('property_id')) {
      try {
        await this.schema.raw(`CREATE INDEX invoices_property_id_index ON invoices(property_id)`)
      } catch (error: any) {
        // Ignorer si l'index existe déjà
        if (!error.message.includes('Duplicate key name')) {
          throw error
        }
      }
    }
    
    if (!indexNames.includes('invoices_payment_type_property_id_index') && columnNames.includes('payment_type') && columnNames.includes('property_id')) {
      try {
        await this.schema.raw(`CREATE INDEX invoices_payment_type_property_id_index ON invoices(payment_type, property_id)`)
      } catch (error: any) {
        // Ignorer si l'index existe déjà
        if (!error.message.includes('Duplicate key name')) {
          throw error
        }
      }
    }
  }

  async down() {
    // Supprimer les index
    try {
      await this.schema.raw(`DROP INDEX invoices_payment_type_property_id_index ON invoices`)
    } catch (error) {
      // Ignorer si l'index n'existe pas
    }
    
    try {
      await this.schema.raw(`DROP INDEX invoices_property_id_index ON invoices`)
    } catch (error) {
      // Ignorer si l'index n'existe pas
    }
    
    // Supprimer les contraintes de clé étrangère
    try {
      await this.schema.raw(`ALTER TABLE invoices DROP FOREIGN KEY invoices_property_id_foreign`)
    } catch (error) {
      // Ignorer si la contrainte n'existe pas
    }
    
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('payment_type')
      table.dropColumn('property_id')
      table.dropColumn('month')
      // Remettre contract_id comme notNullable si nécessaire
      // (mais on garde nullable pour compatibilité)
    })
  }
}
