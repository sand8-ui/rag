import { Controller, Get, Param, Query } from '@nestjs/common';
import { HotelsService } from './hotels.service';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Get()
  findAll(
    @Query('city') city?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('guests') guests?: string,
  ) {
    return this.hotelsService.findAll({ city, checkIn, checkOut, guests });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hotelsService.findOne(id);
  }
}
