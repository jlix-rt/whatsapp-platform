import { pool } from './pool';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para insertar datos de prueba en la base de datos
 * Ejecutar con: npx ts-node src/db/insert-test-data.ts
 */
async function insertTestData() {
  try {
    console.log('🔄 Iniciando inserción de datos de prueba...');

    // Leer el archivo SQL
    const sqlFile = path.join(__dirname, 'insert-test-chats.sql');
    const sql = fs.readFileSync(sqlFile, 'utf-8');

    // Ejecutar el script SQL
    await pool.query(sql);

    console.log('✅ Datos de prueba insertados correctamente');
    console.log('📊 Se insertaron 10 conversaciones con números de Guatemala (+502)');
    
    // Verificar que se insertaron correctamente
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM conversations WHERE phone_number LIKE 'whatsapp:+502%'`
    );
    console.log(`📈 Total de conversaciones con prefijo +502: ${result.rows[0].count}`);

  } catch (error: any) {
    console.error('❌ Error insertando datos de prueba:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  insertTestData();
}

export { insertTestData };
