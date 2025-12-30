import { Pool } from 'pg';
import * as path from 'path';
import * as dotenv from 'dotenv';


dotenv.config();
console.log('📁 Cargando .env');

// Construir configuración de base de datos
const dbConfig: any = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'whatsapp_api',
  user: process.env.DB_USER || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Manejar contraseña: solo agregar si está definida y no está vacía
const dbPassword = process.env.DB_PASSWORD;
console.log('🔍 Debug DB_PASSWORD:', {
  value: dbPassword,
  type: typeof dbPassword,
  isEmpty: !dbPassword || (typeof dbPassword === 'string' && dbPassword.trim() === ''),
  length: dbPassword?.length
});

if (dbPassword && typeof dbPassword === 'string' && dbPassword.trim().length > 0) {
  dbConfig.password = dbPassword.trim();
  console.log('ℹ️  Usando contraseña configurada para PostgreSQL');
} else {
  // Si no hay contraseña, intentar con cadena vacía o sin password
  // Algunas configuraciones de PostgreSQL requieren password explícito aunque esté vacío
  console.log('ℹ️  DB_PASSWORD no configurado, intentando conexión sin contraseña');
  // No agregar password al objeto - pg debería manejar la autenticación sin password
  // Si falla, el usuario necesitará configurar DB_PASSWORD en .env
}

// Log de configuración (sin mostrar contraseña)
console.log('📊 Configuración de BD:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  hasPassword: !!dbConfig.password,
  passwordDefined: 'password' in dbConfig
});

// Crear el pool con manejo de errores
let pool: Pool;
try {
  pool = new Pool(dbConfig);
  
  // Manejar errores de conexión del pool
  pool.on('error', (err: any) => {
    console.error('❌ Error inesperado en el pool de PostgreSQL:', err.message);
    if (err.message?.includes('password must be a string')) {
      console.error('   Solución: Elimina la línea DB_PASSWORD= del archivo .env o déjala completamente vacía');
    }
  });
} catch (error: any) {
  console.error('❌ Error creando pool de PostgreSQL:', error.message);
  throw error;
}

export { pool };

// Función para inicializar esquema (se debe llamar manualmente)
export const initSchema = async () => {
  try {
    const fs = require('fs');
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await pool.query(schema);
    console.log('Esquema de base de datos inicializado');
  } catch (error: any) {
    // No fallar la aplicación si hay error de conexión a la BD
    // Solo loguear el error con más detalles
    if (error.code === 'ECONNREFUSED') {
      console.warn('⚠️  No se pudo conectar a PostgreSQL. Asegúrate de que la base de datos esté corriendo.');
    } else if (error.message?.includes('password must be a string') || error.message?.includes('SASL')) {
      console.warn('⚠️  Error de autenticación con PostgreSQL.');
      console.warn('   El servidor puede requerir una contraseña.');
      console.warn('   Si no usas contraseña, verifica la configuración de pg_hba.conf');
      console.warn('   O configura DB_PASSWORD en apps/api/.env con tu contraseña de PostgreSQL');
    } else if (error.code === '28P01' || error.message?.includes('password authentication failed')) {
      console.warn('⚠️  Error de autenticación con PostgreSQL.');
      console.warn('   Verifica las credenciales en apps/api/.env');
      console.warn('   Host:', dbConfig.host, '| DB:', dbConfig.database, '| User:', dbConfig.user);
    } else if (error.code === '3D000' || error.message?.includes('database') && error.message?.includes('does not exist')) {
      console.warn('⚠️  La base de datos no existe.');
      console.warn('   Crea la base de datos:', dbConfig.database);
      console.warn('   O cambia DB_NAME en apps/api/.env');
    } else {
      console.error('❌ Error inicializando esquema:', error.message || error);
      console.error('   Código:', error.code);
    }
  }
};

