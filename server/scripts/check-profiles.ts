/**
 * 查询 generation_profiles 表
 * 用于检查当前有多少个生成配置
 * 
 * 运行: bun run scripts/check-profiles.ts
 */
import { db } from '../src/db/client';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('='.repeat(60));
    console.log('📋 Generation Profiles 查询');
    console.log('='.repeat(60));

    // 查询所有 profiles
    const profiles = await db.all(sql`SELECT * FROM generation_profiles ORDER BY created_at`);

    console.log(`\n找到 ${profiles.length} 个 profile:\n`);

    if (profiles.length === 0) {
        console.log('(无数据)');
    } else {
        for (const p of profiles as any[]) {
            console.log(`  ID: ${p.id}`);
            console.log(`  名称: ${p.name}`);
            console.log(`  主题偏好: ${p.topic_preference || '(未设置)'}`);
            console.log(`  并发数: ${p.concurrency}`);
            console.log(`  超时时间: ${p.timeout_ms}ms`);
            console.log(`  创建时间: ${p.created_at}`);
            console.log('-'.repeat(40));
        }
    }

    console.log('\n💡 说明: 每次点击 GENERATE 会为每个 profile 创建一个任务');
    console.log(`   所以点击 1 次会创建 ${profiles.length} 个任务\n`);
}

main().catch(console.error);
