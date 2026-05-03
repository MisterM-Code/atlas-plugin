/**
 * v0.63.0 — Comando `atlas:import-vault` que abre o wizard.
 */

import type AtlasPlugin from "../../main";

export async function importVaultCommand(plugin: AtlasPlugin): Promise<void> {
	const { ImportWizardModal } = await import("../ui/import-wizard-modal");
	new ImportWizardModal(plugin.app, plugin).open();
}
