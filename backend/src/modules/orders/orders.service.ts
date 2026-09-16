import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MOCK_HOTELS } from '../hotels/hotels.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.toResponse(order));
  }

  async create(userId: string, dto: CreateOrderDto) {
    this.assertDateRange(dto.checkIn, dto.checkOut);

    const hotel = MOCK_HOTELS.find((item) =>
      item.rooms.some((room) => room.id === dto.roomId),
    );
    const room = hotel?.rooms.find((item) => item.id === dto.roomId);
    if (!hotel || !room) {
      throw new NotFoundException('房型不存在');
    }
    if (dto.guests && room.capacity < dto.guests) {
      throw new BadRequestException(
        `该房型最多 ${room.capacity} 人，无法预订 ${dto.guests} 人`,
      );
    }

    const order = await this.prisma.order.create({
      data: {
        userId,
        hotelId: hotel.id,
        hotelName: hotel.name,
        roomId: room.id,
        roomName: room.name,
        price: room.price,
        guests: dto.guests,
        checkIn: this.parseDate(dto.checkIn),
        checkOut: this.parseDate(dto.checkOut),
      },
    });
    return this.toResponse(order);
  }

  async update(userId: string, id: string, dto: UpdateOrderDto) {
    const current = await this.findOwned(userId, id);
    const checkIn = dto.checkIn ?? this.formatDate(current.checkIn);
    const checkOut = dto.checkOut ?? this.formatDate(current.checkOut);
    this.assertDateRange(checkIn, checkOut);

    const order = await this.prisma.order.update({
      where: { id: current.id },
      data: {
        checkIn: this.parseDate(checkIn),
        checkOut: this.parseDate(checkOut),
      },
    });
    return this.toResponse(order);
  }

  async remove(userId: string, id: string) {
    const current = await this.findOwned(userId, id);
    await this.prisma.order.delete({ where: { id: current.id } });
    return { ok: true };
  }

  private async findOwned(userId: string, id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
    });
    if (!order) {
      throw new NotFoundException(`订单 ${id} 不存在`);
    }
    return order;
  }

  private assertDateRange(checkIn: string, checkOut: string) {
    const today = new Date().toLocaleDateString('en-CA', {
      timeZone: 'Asia/Shanghai',
    });
    if (checkIn < today) {
      throw new BadRequestException('入住日期不能早于今天');
    }
    if (checkOut <= checkIn) {
      throw new BadRequestException('离店日期必须晚于入住日期');
    }
  }

  private parseDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private toResponse(order: {
    id: string;
    userId: string;
    hotelId: string;
    hotelName: string;
    roomId: string;
    roomName: string;
    price: number;
    guests: number | null;
    checkIn: Date;
    checkOut: Date;
  }) {
    return {
      id: order.id,
      userId: order.userId,
      hotelId: order.hotelId,
      hotelName: order.hotelName,
      roomId: order.roomId,
      roomName: order.roomName,
      price: order.price,
      guests: order.guests ?? undefined,
      checkIn: this.formatDate(order.checkIn),
      checkOut: this.formatDate(order.checkOut),
    };
  }
}
