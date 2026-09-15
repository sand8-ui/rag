import { Injectable, NotFoundException } from '@nestjs/common';

export type HotelRoom = {
  id: string;
  name: string;
  price: number;
  capacity: number;
};

export type Hotel = {
  id: string;
  name: string;
  city: string;
  address: string;
  description: string;
  rating: number;
  imageUrl: string;
  rooms: HotelRoom[];
};

export const MOCK_HOTELS: Hotel[] = [
  {
    id: 'hotel-1',
    name: '上海外滩华尔道夫酒店',
    city: '上海',
    address: '上海市黄浦区中山东一路2号',
    description: '外滩历史建筑中的奢华酒店，可俯瞰黄浦江夜景。',
    rating: 4.8,
    imageUrl:
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80',
    rooms: [
      { id: 'room-1-1', name: '江景豪华大床房', price: 1888, capacity: 2 },
      { id: 'room-1-2', name: '行政套房', price: 3288, capacity: 3 },
    ],
  },
  {
    id: 'hotel-2',
    name: '杭州西溪悦榕庄',
    city: '杭州',
    address: '杭州市西湖区西溪湿地东南角',
    description: '隐于湿地的度假酒店， spa 与园林客房。',
    rating: 4.7,
    imageUrl:
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80',
    rooms: [
      { id: 'room-2-1', name: '湿地别墅', price: 2580, capacity: 2 },
      { id: 'room-2-2', name: '家庭套房', price: 3180, capacity: 4 },
    ],
  },
  {
    id: 'hotel-3',
    name: '成都太古里博舍',
    city: '成都',
    address: '成都市锦江区中纱帽街81号',
    description: '大慈寺旁的设计酒店，步行即达太古里。',
    rating: 4.6,
    imageUrl:
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=1200&q=80',
    rooms: [
      { id: 'room-3-1', name: '城市景观房', price: 1280, capacity: 2 },
      { id: 'room-3-2', name: '禅意套房', price: 2180, capacity: 2 },
    ],
  },
  {
    id: 'hotel-4',
    name: '北京王府井文华东方',
    city: '北京',
    address: '北京市东城区王府井大街1号',
    description: '紫禁城东侧的城市度假酒店，近王府井步行街。',
    rating: 4.9,
    imageUrl:
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80',
    rooms: [
      { id: 'room-4-1', name: '豪华客房', price: 2100, capacity: 2 },
      { id: 'room-4-2', name: '紫禁城景观套房', price: 5600, capacity: 3 },
    ],
  },
];

@Injectable()
export class HotelsService {
  findAll(query: {
    city?: string;
    checkIn?: string;
    checkOut?: string;
    guests?: string;
  }) {
    const guests = query.guests ? Number(query.guests) : undefined;
    const hotels = MOCK_HOTELS.filter((hotel) => {
      const cityMatch = !query.city || hotel.city.includes(query.city);
      const guestMatch =
        !guests || hotel.rooms.some((room) => room.capacity >= guests);
      return cityMatch && guestMatch;
    });

    return {
      items: hotels,
      query,
    };
  }

  findOne(id: string) {
    const hotel = MOCK_HOTELS.find((item) => item.id === id);
    if (!hotel) {
      throw new NotFoundException(`酒店 ${id} 不存在`);
    }
    return hotel;
  }
}
