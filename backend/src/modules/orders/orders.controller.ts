import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { createOrderSchema, type CreateOrderDto } from './dto/create-order.dto';
import { updateOrderSchema, type UpdateOrderDto } from './dto/update-order.dto';
import { OrdersService } from './orders.service';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.ordersService.findAll(user.userId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @ZodBody(createOrderSchema) dto: CreateOrderDto,
  ) {
    return this.ordersService.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @ZodBody(updateOrderSchema) dto: UpdateOrderDto,
  ) {
    return this.ordersService.update(user.userId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.ordersService.remove(user.userId, id);
  }
}
