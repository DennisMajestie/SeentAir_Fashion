import { IsNotEmpty, IsString } from 'class-validator';

export class RegisterBarcodeDto {
  /** Barcode value scanned from the printed QR/1D label. */
  @IsString()
  @IsNotEmpty()
  barcode: string;
}