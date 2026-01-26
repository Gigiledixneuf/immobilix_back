import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Ajoute les nouveaux statuts de créneaux:
 * pending, booked, expired
 */
export default class extends BaseSchema {
  protected tableName = 'visit_time_slots'

  async up() {
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName} MODIFY status ENUM('available','pending','reserved','booked','blocked','expired') NOT NULL DEFAULT 'available'`
    )
    await this.db.rawQuery(
      `UPDATE ${this.tableName} SET status='booked' WHERE status='reserved'`
    )
  }

  async down() {
    await this.db.rawQuery(
      `ALTER TABLE ${this.tableName} MODIFY status ENUM('available','reserved','blocked') NOT NULL DEFAULT 'available'`
    )
  }
}
