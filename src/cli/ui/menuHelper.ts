import { selectMenu, MenuItem } from "./input.js";

export interface MenuActionItem<T = any> {
  label: string | ((data: T) => string);
  action: (data: T) => Promise<boolean | void>;
  icon?: string;
  isSeparator?: boolean;
}

export interface ShowMenuWithBackConfig<T = any> {
  title: string;
  items: MenuActionItem<T>[];
  breadcrumb?: string[];
  headerContent?: string | ((data: T) => Promise<string> | string);
  subtitle?: string;
  backLabel?: string;
  defaultIndex?: number;
  refresh?: () => Promise<T>;
}

export async function showMenuWithBack<T = any>(config: ShowMenuWithBackConfig<T>): Promise<void> {
  const {
    title,
    items,
    breadcrumb = [],
    headerContent = "",
    subtitle = "",
    backLabel = "← Back",
    defaultIndex = 0,
    refresh,
  } = config;

  while (true) {
    let refreshedData: any = null;
    if (refresh) {
      refreshedData = await refresh();
      if (refreshedData === null) {
        return;
      }
    }

    const cleanBack = backLabel.replace(/^[←‹<]\s*/, "");
    const menuItems: MenuItem[] = [
      { label: `‹ ${cleanBack}` },
      ...items.map((item) => ({
        label: typeof item.label === "function" ? item.label(refreshedData) : item.label,
        icon: item.icon,
      })),
    ];

    let resolvedHeader = "";
    if (typeof headerContent === "function") {
      resolvedHeader = await headerContent(refreshedData);
    } else {
      resolvedHeader = headerContent;
    }

    const selected = await selectMenu(
      title,
      menuItems,
      defaultIndex,
      subtitle,
      resolvedHeader,
      breadcrumb
    );

    // Back or Escape
    if (selected === -1 || selected === 0) {
      return;
    }

    const actionIndex = selected - 1;
    const item = items[actionIndex];
    if (item && item.action) {
      const shouldContinue = await item.action(refreshedData);
      if (shouldContinue === false) {
        return;
      }
    }
  }
}

export interface ShowListMenuConfig<T = any> {
  title: string;
  breadcrumb?: string[];
  headerContent?: string | (() => Promise<string> | string);
  fetchItems: () => Promise<{ items: T[]; metadata?: any } | null>;
  formatItem: (item: T) => { label: string; icon?: string };
  onSelect: (item: T) => Promise<boolean | void>;
  createAction?: { label: string; action: () => Promise<void> };
  backLabel?: string;
}

export async function showListMenu<T = any>(config: ShowListMenuConfig<T>): Promise<void> {
  const {
    title,
    breadcrumb = [],
    headerContent = "",
    fetchItems,
    formatItem,
    onSelect,
    createAction,
    backLabel = "← Back",
  } = config;

  while (true) {
    const result = await fetchItems();
    if (!result) return;

    const { items } = result;
    const cleanBack = backLabel.replace(/^[←‹<]\s*/, "");
    const menuItems: MenuItem[] = [{ label: `‹ ${cleanBack}` }];

    if (createAction) {
      const cleanCreate = createAction.label.replace(/^\+\s*/, "");
      menuItems.push({ label: `+ ${cleanCreate}` });
    }

    for (const item of items) {
      menuItems.push(formatItem(item));
    }

    let resolvedHeader = "";
    if (typeof headerContent === "function") {
      resolvedHeader = await headerContent();
    } else {
      resolvedHeader = headerContent;
    }

    const selected = await selectMenu(
      title,
      menuItems,
      0,
      "",
      resolvedHeader,
      breadcrumb
    );

    if (selected === -1 || selected === 0) {
      return;
    }

    if (createAction && selected === 1) {
      await createAction.action();
      continue;
    }

    const itemIndex = createAction ? selected - 2 : selected - 1;
    const selectedItem = items[itemIndex];
    if (selectedItem) {
      const shouldContinue = await onSelect(selectedItem);
      if (shouldContinue === false) return;
    }
  }
}
