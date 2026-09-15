import { Injectable, NotFoundException } from '@nestjs/common';
import { MOCK_HOTELS } from '../hotels/hotels.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

type Order = {
  id: string;
  userId: string;
  hotelId: string;
  hotelName: string;
  roomId: string;
  roomName: string;
  checkIn: string;
  checkOut: string;
  status: OrderStatus;
};

@Injectable()
export class OrdersService {
  private orders: Order[] = [
    {
      id: 'order-1',
      userId: 'user-1',
      hotelId: 'hotel-1',
      hotelName: '上海外滩华尔道夫酒店',
      roomId: 'room-1-1',
      roomName: '江景豪华大床房',
      checkIn: '2026-09-20',
      checkOut: '2026-09-22',
      status: 'CONFIRMED',
    },
  ];

  findAll(userId: string) {
    return this.orders.filter((order) => order.userId === userId);
  }

  create(userId: string, dto: CreateOrderDto) {
    const hotel = MOCK_HOTELS.find((item) =>
      item.rooms.some((room) => room.id === dto.roomId),
    );
    const room = hotel?.rooms.find((item) => item.id === dto.roomId);

    const order: Order = {
      id: `order-${this.orders.length + 1}`,
      userId,
      hotelId: hotel?.id ?? 'hotel-unknown',
      hotelName: hotel?.name ?? '未知酒店',
      roomId: dto.roomId,
      roomName: room?.name ?? '未知房型',
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      status: 'PENDING',
    };

    this.orders = [order, ...this.orders];
    return order;
  }

  update(userId: string, id: string, dto: UpdateOrderDto) {
    const order = this.findOwned(userId, id);

    if (dto.checkIn) {
      order.checkIn = dto.checkIn;
    }
    if (dto.checkOut) {
      order.checkOut = dto.checkOut;
    }
    return order;
  }

  remove(userId: string, id: string) {
    const order = this.findOwned(userId, id);
    order.status = 'CANCELLED';
    return order;
  }

  private findOwned(userId: string, id: string) {
    const order = this.orders.find(
      (item) => item.id === id && item.userId === userId,
    );
    if (!order) {
      throw new NotFoundException(`订单 ${id} 不存在`);
    }
    return order;
  }
}
