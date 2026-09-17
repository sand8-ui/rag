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

export type Order = {
  id: string;
  userId: string;
  hotelId: string;
  hotelName: string;
  roomId: string;
  roomName: string;
  price: number;
  guests?: number;
  checkIn: string;
  checkOut: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = TokenPair & {
  user: User;
};

export type RefreshResponse = TokenPair & {
  user?: User;
};

export type SearchQuery = {
  city?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: string;
};

export type ChatCitation = {
  chunkId: string;
  sourcePath: string;
  documentTitle: string;
  sectionTitle: string | null;
  score: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type ChatMessageRecord = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  createdAt: string;
};

export type ConversationDetail = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageRecord[];
};
