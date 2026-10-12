"use client";

import { createContext, useContext } from "react";
import type { Brand } from "@/brand";

const BrandContext = createContext<Brand | null>(null);

export function BrandProvider({ brand, children }: { brand: Brand; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  const brand = useContext(BrandContext);
  if (brand === null) {
    throw new Error("useBrand must be used inside BrandProvider");
  }
  return brand;
}
