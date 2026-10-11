import { ApiClient } from "../client/apiClient.js";
import { showMenuWithBack } from "../ui/menuHelper.js";
import { prompt, confirm, pause } from "../ui/input.js";
import { COLORS, showStatus } from "../ui/display.js";

export async function showCombosMenu(breadcrumb: string[] = ["Mapigate", "Combos"]): Promise<void> {
  await showMenuWithBack({
    title: "Combos & Fallback Chains",
    breadcrumb,
    refresh: async () => {
      const res = await ApiClient.getCombos();
      return res.success && Array.isArray(res.data) ? res.data : [];
    },
    headerContent: (combos: any[]) => {
      const activeCount = combos.filter((c) => c.isActive !== false).length;
      return `Total Combos: ${COLORS.cyan}${combos.length}${COLORS.reset} | Active: ${COLORS.green}${activeCount}${COLORS.reset}`;
    },
    items: [
      {
        label: "+ Create New Combo",
        action: async () => {
          await promptCreateCombo();
        },
      },
      {
        label: (combos: any[]) => `Manage Existing Combos (${combos.length})`,
        action: async (combos: any[]) => {
          await showManageCombosList(combos, [...breadcrumb, "Combos"]);
        },
      },
    ],
  });
}

async function promptCreateCombo(): Promise<void> {
  console.log(`\n${COLORS.bold}Create New Combo:${COLORS.reset}`);
  const name = await prompt("Combo Name (e.g. smart-coding, fallback-claude): ");
  if (!name) {
    showStatus("Creation cancelled (empty name).", "warning");
    await pause();
    return;
  }

  const modelsStr = await prompt("Model IDs in chain, comma-separated (e.g. anthropic/claude-3-7-sonnet, openai/gpt-4o): ");
  const models = modelsStr
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  if (!models.length) {
    showStatus("At least one model ID is required.", "error");
    await pause();
    return;
  }

  const strategy = (await prompt("Routing Strategy (fallback or round-robin, default: fallback): ")) || "fallback";

  const res = await ApiClient.createCombo({ name, models, strategy });
  if (res.success) {
    showStatus(`Combo "${name}" created successfully!`, "success");
  } else {
    showStatus(res.error || "Failed to create combo.", "error");
  }
  await pause();
}

async function showManageCombosList(combos: any[], breadcrumb: string[]): Promise<void> {
  if (!combos.length) {
    showStatus("No combos found. Create a combo first.", "warning");
    await pause();
    return;
  }

  await showMenuWithBack({
    title: "Select Combo",
    breadcrumb,
    items: combos.map((c) => ({
      label: `${c.name} (${c.models?.length || 0} models) ${c.isActive !== false ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`}`,
      action: async () => {
        await showComboDetails(c, [...breadcrumb, c.name]);
      },
    })),
  });
}

async function showComboDetails(combo: any, breadcrumb: string[]): Promise<void> {
  await showMenuWithBack({
    title: `Combo: ${combo.name}`,
    breadcrumb,
    headerContent: [
      `Strategy: ${COLORS.cyan}${combo.strategy || "fallback"}${COLORS.reset}`,
      `Status:   ${combo.isActive !== false ? `${COLORS.green}Active${COLORS.reset}` : `${COLORS.red}Disabled${COLORS.reset}`}`,
      `Models:`,
      ...(combo.models || []).map((m: string, i: number) => `  ${i + 1}. ${m}`),
    ].join("\n"),
    items: [
      {
        label: combo.isActive !== false ? "Disable Combo" : "Enable Combo",
        action: async () => {
          const res = await ApiClient.toggleCombo(combo.id || combo.name);
          if (res.success) {
            showStatus("Combo status updated.", "success");
          } else {
            showStatus(res.error || "Failed to toggle combo.", "error");
          }
          await pause();
          return false;
        },
      },
      {
        label: `${COLORS.red}Delete Combo${COLORS.reset}`,
        action: async () => {
          const confirmed = await confirm(`Are you sure you want to delete combo "${combo.name}"?`);
          if (confirmed) {
            const res = await ApiClient.deleteCombo(combo.id || combo.name);
            if (res.success) {
              showStatus("Combo deleted.", "success");
            } else {
              showStatus(res.error || "Failed to delete combo.", "error");
            }
            await pause();
            return false;
          }
        },
      },
    ],
  });
}
