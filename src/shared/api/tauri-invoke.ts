export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
	const { invoke } = await import('@tauri-apps/api/core');
	try {
		return await invoke<T>(command, args);
	} catch (error) {
		if (error && typeof error === 'object' && 'kind' in error) {
			throw error;
		}
		throw error instanceof Error ? error : new Error(String(error));
	}
}

export type AppError = {
	kind: string;
	message: string;
};

export function isAppError(error: unknown): error is AppError {
	return Boolean(error && typeof error === 'object' && 'kind' in error && 'message' in error);
}
