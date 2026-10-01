export type CatalogActionState = { message: string; error?: boolean; values?: Record<string, string | string[] | boolean> };

export const EMPTY_CATALOG_ACTION_STATE: CatalogActionState = { message: "" };

export function fieldValue(state: CatalogActionState, name: string, fallback: string): string {
  const value = state.values?.[name];
  return typeof value === "string" ? value : fallback;
}

export function fieldChecked(state: CatalogActionState, name: string, fallback: boolean): boolean {
  const value = state.values?.[name];
  return typeof value === "boolean" ? value : fallback;
}

export function fieldValues(state: CatalogActionState, name: string, fallback: string[]): string[] {
  const value = state.values?.[name];
  return Array.isArray(value) ? value : fallback;
}
