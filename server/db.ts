import mysql, { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface DbQueryResult<T> {
  rows: T[];
  rowCount?: number;
}

export interface DbConnection {
  query<T = any>(sql: string, params?: any[]): Promise<DbQueryResult<T>>;
  release(): void;
}

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL || 'mysql://lotto_user:lotto_password@localhost:3306/lotto_db';
    const url = new URL(connectionString);
    pool = mysql.createPool({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 20,
      waitForConnections: true,
      enableKeepAlive: true,
      connectTimeout: 5000,
      multipleStatements: true,
    });

    pool.on('error', (err) => {
      console.error('Unexpected error on idle MySQL client', err);
    });
  }
  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
  const [result] = await getDbPool().query<RowDataPacket[] | ResultSetHeader>(text, params);
  if (Array.isArray(result)) {
    return { rows: result as T[], rowCount: result.length };
  }
  return { rows: [], rowCount: result.affectedRows };
}

export async function getDbConnection(): Promise<DbConnection> {
  const connection = await getDbPool().getConnection();
  return {
    query: async <T = any>(text: string, params?: any[]) => {
      const [result] = await connection.query<RowDataPacket[] | ResultSetHeader>(text, params);
      if (Array.isArray(result)) {
        return { rows: result as T[], rowCount: result.length };
      }
      return { rows: [], rowCount: result.affectedRows };
    },
    release: () => connection.release(),
  };
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
