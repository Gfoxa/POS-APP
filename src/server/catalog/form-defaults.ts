type MoneyValue = string | { toFixed(digits: number): string };

function formMoney(value: MoneyValue): string {
  return typeof value === "string" ? value : value.toFixed(2);
}

export type ProductFormDefaults = {
  id: string;
  name: string;
  sku: string;
  categoryId: string;
  description: string | null;
  imageUrl: string | null;
  basePrice: string;
  isActive: boolean;
  trackInventory: boolean;
};

export function productFormDefaults(product: Omit<ProductFormDefaults, "basePrice"> & { basePrice: MoneyValue }): ProductFormDefaults {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    categoryId: product.categoryId,
    description: product.description,
    imageUrl: product.imageUrl,
    basePrice: formMoney(product.basePrice),
    isActive: product.isActive,
    trackInventory: product.trackInventory,
  };
}

export type VariantFormDefaults = { id: string; name: string; sku: string; price: string; isActive: boolean };

export function variantFormDefaults(variant: Omit<VariantFormDefaults, "price"> & { price: MoneyValue }): VariantFormDefaults {
  return { id: variant.id, name: variant.name, sku: variant.sku, price: formMoney(variant.price), isActive: variant.isActive };
}

export type AddonFormDefaults = { id: string; name: string; price: string; isActive: boolean; productIds: string[] };

export function addonFormDefaults(addon: Omit<AddonFormDefaults, "price"> & { price: MoneyValue }): AddonFormDefaults {
  return { id: addon.id, name: addon.name, price: formMoney(addon.price), isActive: addon.isActive, productIds: addon.productIds };
}

export type CategoryFormDefaults = { id: string; name: string; description: string | null; isActive: boolean };

export function categoryFormDefaults(category: CategoryFormDefaults): CategoryFormDefaults {
  return { id: category.id, name: category.name, description: category.description, isActive: category.isActive };
}
