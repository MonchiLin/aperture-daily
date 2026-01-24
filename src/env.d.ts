/// <reference types="@cloudflare/workers-types" />

import type { Runtime } from '@astrojs/cloudflare';

declare global {
	namespace App {
		interface Locals extends Runtime {
			auth: import('./types/auth').AdminState;
		}
	}
}

export { };
