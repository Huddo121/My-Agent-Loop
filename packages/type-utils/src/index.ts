export type Branded<T, BrandName extends string> = T & {
  readonly __brand: BrandName;
};
