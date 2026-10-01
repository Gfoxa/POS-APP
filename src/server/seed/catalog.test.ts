import { describe, expect, it } from "vitest";
import { getSeedCatalog } from "./catalog";

describe("development seed catalog", () => {
  it("contains the required cafe categories and sample products", () => {
    const catalog = getSeedCatalog();

    expect(catalog.categories.map(({ name }) => name)).toEqual([
      "Coffee",
      "Non Coffee",
      "Tea",
      "Food",
      "Dessert",
    ]);
    expect(catalog.products.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "Espresso",
        "Americano",
        "Cafe Latte",
        "Cappuccino",
        "Mocha",
        "Iced Latte",
        "Matcha Latte",
        "Chocolate",
        "Croissant",
        "French Fries",
        "Cheesecake",
      ]),
    );
  });

  it("uses unique deterministic category names and product SKUs", () => {
    const firstRun = getSeedCatalog();
    const secondRun = getSeedCatalog();

    expect(firstRun).toEqual(secondRun);
    expect(new Set(firstRun.categories.map(({ name }) => name)).size).toBe(
      firstRun.categories.length,
    );
    expect(new Set(firstRun.products.map(({ sku }) => sku)).size).toBe(
      firstRun.products.length,
    );
  });
});
