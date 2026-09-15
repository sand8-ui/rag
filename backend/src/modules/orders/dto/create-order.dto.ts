import { IsDateString, IsString } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  roomId: string;

  @IsDateString()
  checkIn: string;

  @IsDateString()
  checkOut: string;
}
