/**
 * v0.60: Electron remote graceful wrapper.
 *
 * Permite controlar always-on-top + persistir bounds da janela popout sem quebrar
 * se Electron remote não estiver acessível (sandbox/contextIsolation).
 */

interface ElectronWindow {
	setAlwaysOnTop?: (on: boolean, level?: string) => void;
	isAlwaysOnTop?: () => boolean;
	getBounds?: () => { x: number; y: number; width: number; height: number };
	setBounds?: (b: { x?: number; y?: number; width?: number; height?: number }) => void;
}

function getCurrentWindow(): ElectronWindow | null {
	try {
		const w = window as unknown as { electronAPI?: { getCurrentWindow?: () => ElectronWindow } };
		const fromAPI = w.electronAPI?.getCurrentWindow?.();
		if (fromAPI) return fromAPI;
	} catch {/* ignore */}
	try {
		const req = (globalThis as { require?: (m: string) => unknown }).require ?? eval("require");
		const remote = (req as (m: string) => { getCurrentWindow?: () => ElectronWindow })("@electron/remote");
		return remote?.getCurrentWindow?.() ?? null;
	} catch {/* ignore */}
	return null;
}

export function setAlwaysOnTop(on: boolean): boolean {
	const w = getCurrentWindow();
	if (!w?.setAlwaysOnTop) return false;
	try {
		w.setAlwaysOnTop(on, "floating");
		return true;
	} catch {
		return false;
	}
}

export function isAlwaysOnTop(): boolean {
	const w = getCurrentWindow();
	if (!w?.isAlwaysOnTop) return false;
	try { return w.isAlwaysOnTop(); } catch { return false; }
}

export function getCurrentWindowBounds(): { x: number; y: number; width: number; height: number } | null {
	const w = getCurrentWindow();
	if (!w?.getBounds) return null;
	try { return w.getBounds(); } catch { return null; }
}

export function applyBounds(b: { x?: number; y?: number; width?: number; height?: number }): boolean {
	const w = getCurrentWindow();
	if (!w?.setBounds) return false;
	try { w.setBounds(b); return true; } catch { return false; }
}
