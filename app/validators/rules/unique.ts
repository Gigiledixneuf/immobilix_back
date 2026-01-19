import vine from '@vinejs/vine'
import db from '@adonisjs/lucid/services/db'

// Define a custom validation rule for uniqueness
export const uniqueRule = vine.createRule(
  async (value: any, options: { table: string; column: string; except?: any }, field) => {
    const query = db.from(options.table).where(options.column, value)

    let exceptValue = options.except
    if (typeof exceptValue === 'function') {
      exceptValue = exceptValue(field)
    }

    if (exceptValue !== undefined && exceptValue !== null && String(exceptValue).length > 0) {
      query.whereNot('id', exceptValue)
    }

    const row = await query.first()

    if (row) {
      field.report('The {{ field }} has already been taken.', 'unique', field)
    }
  }
)
