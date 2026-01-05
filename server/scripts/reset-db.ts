import * as fs from 'fs/promises';
import * as path from 'path';

const DB_PATH = path.join(__dirname, '../local.db');

async function reset() {
    try {
        await fs.unlink(DB_PATH);
        console.log('✅ Deleted local.db');
    } catch (e: any) {
        if (e.code === 'ENOENT') {
            console.log('ℹ️ local.db does not exist, skipping delete.');
        } else {
            console.error('❌ Failed to delete local.db:', e.message);
            process.exit(1);
        }
    }
}

reset();
