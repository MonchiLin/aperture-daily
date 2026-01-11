// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://monchilin.github.io',
	base: '/upword',
	integrations: [
		starlight({
			title: 'UpWord Docs',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
			defaultLocale: 'root',
			locales: {
				root: {
					label: 'English',
					lang: 'en',
				},
				'zh-cn': {
					label: '简体中文',
					lang: 'zh-CN',
				},
			},
			sidebar: [
				{
					label: 'Start Here',
					translations: {
						'zh-CN': '开始',
					},
					items: [
						{ label: 'Environment Variables', slug: 'guides/env-vars', translations: { 'zh-CN': '环境变量' } },
					],
				},
				{
					label: 'Guides',
					translations: {
						'zh-CN': '指南',
					},
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'guides/example' },
					],
				},
				{
					label: 'Reference',
					translations: {
						'zh-CN': '参考',
					},
					autogenerate: { directory: 'reference' },
				},
			],
		}),
	],
});
