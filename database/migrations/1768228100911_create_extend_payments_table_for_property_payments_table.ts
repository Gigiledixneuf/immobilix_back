import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'payments'

  async up() {
    // Paiements désactivés pour l'instant
    return
    // Vérifier quelles colonnes existent déjà
    const result: any = await this.db.rawQuery(`SHOW COLUMNS FROM payments`)
    const columns = result[0] || []
    const columnNames = columns.map((col: any) => col.Field)
    
    // Rendre contract_id nullable (car les paiements peuvent être liés directement à une propriété)
    if (columnNames.includes('contract_id')) {
      await this.schema.raw(`ALTER TABLE payments MODIFY COLUMN contract_id INT UNSIGNED NULL`)
    }
    
    // Ajouter les nouveaux champs pour les paiements de propriété (seulement s'ils n'existent pas)
    if (!columnNames.includes('payment_type')) {
      await this.schema.raw(`
        ALTER TABLE payments 
        ADD COLUMN payment_type ENUM('deposit', 'rent') NULL 
        COMMENT 'Type de paiement: deposit (caution) ou rent (loyer)'
      `)
    }
    
    if (!columnNames.includes('property_id')) {
      await this.schema.raw(`ALTER TABLE payments ADD COLUMN property_id INT UNSIGNED NULL`)
      await this.schema.raw(`
        ALTER TABLE payments 
        ADD CONSTRAINT payments_property_id_foreign 
        FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE
      `)
    }
    
    if (!columnNames.includes('tenant_id')) {
      await this.schema.raw(`ALTER TABLE payments ADD COLUMN tenant_id INT UNSIGNED NULL`)
      await this.schema.raw(`
        ALTER TABLE payments 
        ADD CONSTRAINT payments_tenant_id_foreign 
        FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE
      `)
    }
    
    if (!columnNames.includes('landlord_id')) {
      await this.schema.raw(`ALTER TABLE payments ADD COLUMN landlord_id INT UNSIGNED NULL`)
      await this.schema.raw(`
        ALTER TABLE payments 
        ADD CONSTRAINT payments_landlord_id_foreign 
        FOREIGN KEY (landlord_id) REFERENCES users(id) ON DELETE CASCADE
      `)
    }
    
    if (!columnNames.includes('month')) {
      await this.schema.raw(`
        ALTER TABLE payments 
        ADD COLUMN month VARCHAR(255) NULL 
        COMMENT 'Mois concerné pour le loyer (format: YYYY-MM)'
      `)
    }
    
    if (!columnNames.includes('paid_at')) {
      await this.schema.raw(`
        ALTER TABLE payments 
        ADD COLUMN paid_at DATETIME NULL 
        COMMENT 'Date de confirmation du paiement par le bailleur'
      `)
    }
    
    // Modifier l'enum status pour ajouter waiting_landlord_confirmation
    // Vérifier d'abord si le statut existe déjà dans l'enum
    const statusResult: any = await this.db.rawQuery(`SHOW COLUMNS FROM payments WHERE Field = 'status'`)
    const statusColumns = statusResult[0] || []
    if (statusColumns && statusColumns.length > 0) {
      const columnDef = statusColumns[0].Type
      if (typeof columnDef === 'string' && !columnDef.includes('waiting_landlord_confirmation')) {
        await this.schema.raw(`
          ALTER TABLE payments 
          MODIFY COLUMN status ENUM('pending', 'paid', 'failed', 'waiting_landlord_confirmation') 
          DEFAULT 'pending'
        `)
      }
    }
  }

  async down() {
    // Paiements désactivés pour l'instant
    return
    // Remettre l'enum status original AVANT de supprimer les colonnes
    // (attention: peut échouer si des données avec waiting_landlord_confirmation existent)
    try {
      await this.schema.raw(`
        ALTER TABLE payments 
        MODIFY COLUMN status ENUM('pending', 'paid', 'failed') 
        DEFAULT 'pending'
      `)
    } catch (error) {
      // Si des paiements avec waiting_landlord_confirmation existent, on ne peut pas rollback l'enum
      // On continue quand même avec la suppression des colonnes
    }
    
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('payment_type')
      table.dropColumn('property_id')
      table.dropColumn('tenant_id')
      table.dropColumn('landlord_id')
      table.dropColumn('month')
      table.dropColumn('paid_at')
      // Remettre contract_id comme notNullable si nécessaire
      // (mais on garde nullable pour compatibilité)
    })
  }
}
