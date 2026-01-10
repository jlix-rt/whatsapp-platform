import { pool } from './pool';

/**
 * Script para verificar los datos de prueba insertados
 */
async function verifyTestData() {
  try {
    console.log('🔍 Verificando datos de prueba...\n');

    // Obtener todas las conversaciones con prefijo +502
    const result = await pool.query(
      `SELECT 
        c.id,
        c.phone_number,
        c.mode,
        c.human_handled,
        c.created_at,
        c.updated_at,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
        (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message
      FROM conversations c
      WHERE c.phone_number LIKE 'whatsapp:+502%'
      ORDER BY c.updated_at DESC`
    );

    console.log(`📊 Total de conversaciones encontradas: ${result.rows.length}\n`);

    result.rows.forEach((row: any, index: number) => {
      console.log(`${index + 1}. ${row.phone_number}`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Modo: ${row.mode}`);
      console.log(`   Atendida: ${row.human_handled ? 'Sí' : 'No'}`);
      console.log(`   Mensajes: ${row.message_count}`);
      console.log(`   Último mensaje: ${row.last_message || 'N/A'}`);
      console.log(`   Actualizado: ${row.updated_at}`);
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Error verificando datos:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

if (require.main === module) {
  verifyTestData();
}

export { verifyTestData };
