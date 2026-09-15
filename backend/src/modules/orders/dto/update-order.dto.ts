import { IsDateString, IsOptional } from 'class-validator';

export class UpdateOrderDto {
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;
}
