export function toHex(n: number): string {
  return `0x${n.toString(16)}`;
}

export function fromHex(hexString: string): number {
  return Number.parseInt(hexString, 16);
}
