import { EnvironmentOutlined, StarFilled } from '@ant-design/icons';
import { Card, Empty, Spin, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchHotels } from '../api/hotels';
import type { Hotel } from '../types';

export function HotelListPage() {
  const [searchParams] = useSearchParams();
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [loading, setLoading] = useState(true);

  const city = searchParams.get('city') ?? undefined;
  const checkIn = searchParams.get('checkIn') ?? undefined;
  const checkOut = searchParams.get('checkOut') ?? undefined;
  const guests = searchParams.get('guests') ?? undefined;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchHotels({ city, checkIn, checkOut, guests })
      .then(({ data }) => {
        if (!cancelled) {
          setHotels(data.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHotels([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [city, checkIn, checkOut, guests]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">酒店列表</h1>
        <p className="mt-1 text-slate-500">
          {city ?? '全部城市'}
          {checkIn && checkOut ? ` · ${checkIn} 至 ${checkOut}` : ''}
          {guests ? ` · ${guests} 人` : ''}
        </p>
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : hotels.length === 0 ? (
        <Empty description="没有找到符合条件的酒店" />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {hotels.map((hotel) => (
            <Link key={hotel.id} to={`/hotels/${hotel.id}`} className="block">
              <Card
                hoverable
                cover={
                  <img
                    src={hotel.imageUrl}
                    alt={hotel.name}
                    className="h-52 w-full object-cover"
                  />
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-medium text-slate-800">
                      {hotel.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      <EnvironmentOutlined className="mr-1" />
                      {hotel.address}
                    </p>
                  </div>
                  <Tag color="gold" icon={<StarFilled />}>
                    {hotel.rating}
                  </Tag>
                </div>
                <p className="mt-3 line-clamp-2 text-slate-600">
                  {hotel.description}
                </p>
                <p className="mt-3 text-teal-700">
                  ￥{Math.min(...hotel.rooms.map((room) => room.price))} 起
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
