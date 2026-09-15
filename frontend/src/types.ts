export type User = {
  id: string;
  email: string;
  name?: string;
};

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

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED';

export type Order = {
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

export type AuthResponse = {
  accessToken: string;
  user: User;
};

export type SearchQuery = {
  city?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
};
