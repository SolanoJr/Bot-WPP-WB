// Declaração mínima para o módulo 'qrcode' (a lib não traz tipos próprios).
// Usado apenas no BaileysAdapter para gerar o QR em terminal/arquivo.
declare module 'qrcode' {
  export function toDataURL(text: string, opts?: any): Promise<string>;
  export function toString(text: string, opts?: any): Promise<string>;
  export function toFile(path: string, text: string, opts?: any): Promise<void>;
}
