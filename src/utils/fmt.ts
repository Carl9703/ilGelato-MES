/** Formatuje liczbę z przecinkiem jako separatorem dziesiętnym (polska notacja) */
export const fmtL = (n: number, dec: number): string => n.toFixed(dec).replace('.', ',');
