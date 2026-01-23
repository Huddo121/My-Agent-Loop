export type Branded<T, TAG extends string> = T & { __brand: TAG };
