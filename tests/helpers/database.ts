import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";

/** SQLite-backed D1 adapter for HTTP integration tests. */
export function testDatabase(onRead: (sql: string) => void = () => {}) {
  const sqlite = new DatabaseSync(":memory:");
  const migrations = new URL("../../migrations/", import.meta.url);
  for (const migration of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(new URL(migration, migrations), "utf8"));

  const prepare = (sql: string) => {
    let args: SQLInputValue[] = [];
    const statement = {
      bind: (...values: SQLInputValue[]) => {
        args = values;
        return statement;
      },
      first: async () => {
        onRead(sql);
        return sqlite.prepare(sql).get(...args) ?? null;
      },
      all: async () => {
        onRead(sql);
        return { results: sqlite.prepare(sql).all(...args) };
      },
      run: async () => ({ meta: sqlite.prepare(sql).run(...args) }),
    };
    return statement;
  };

  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) => {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;

  return { sqlite, db };
}
