import * as path from 'path';
import { promises as fs } from 'fs';
import {
    Migrator,
    FileMigrationProvider,
    Kysely,
} from 'kysely';
import { db } from '../src/db/factory'; // Re-use the factory

async function migrate() {
    const migrator = new Migrator({
        db,
        provider: new FileMigrationProvider({
            fs,
            path,
            // Path to the migrations folder
            migrationFolder: path.join(import.meta.dir, '../src/db/migrations'),
        }),
    });

    const command = process.argv[2];

    if (command === 'create') {
        const migrationName = process.argv[3];
        if (!migrationName) {
            console.error('Usage: bun run migrate create <migration_name>');
            process.exit(1);
        }
        const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
        const fileName = `${timestamp}_${migrationName}.ts`;
        const filePath = path.join(import.meta.dir, '../src/db/migrations', fileName);

        const template = `import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Write your migration here
}

export async function down(db: Kysely<any>): Promise<void> {
  // Write your rollback here
}
`;
        await fs.writeFile(filePath, template);
        console.log(`Created migration: ${fileName}`);
        process.exit(0);
    }

    const { error, results } = await (async () => {
        if (command === 'up') {
            return migrator.migrateUp();
        } else if (command === 'down') {
            return migrator.migrateDown();
        } else if (command === 'latest') {
            return migrator.migrateToLatest();
        } else {
            console.error('Usage: bun run migrate <up|down|latest|create>');
            process.exit(1);
            return { error: null, results: [] }; // Unreachable but makes TS happy
        }
    })();

    results?.forEach((it) => {
        if (it.status === 'Success') {
            console.log(`migration "${it.migrationName}" was executed successfully`);
        } else if (it.status === 'Error') {
            console.error(`failed to execute migration "${it.migrationName}"`);
        }
    });

    if (error) {
        console.error('failed to migrate');
        console.error(error);
        process.exit(1);
    }

    await db.destroy();
}

migrate();
