import { EnvironmentOutlined, StarFilled } from '@ant-design/icons';
import { Button, Card, DatePicker, Empty, Spin, Tag, message } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchHotel } from '../api/hotels';
import { createOrder } from '../api/orders';
import type { Hotel } from '../types';

export function HotelDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<[Dayjs, Dayjs] | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchHotel(id)
      .then(({ data }) => {
        if (!cancelled) {
          setHotel(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHotel(null);
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
  }, [id]);

  async function bookRoom(roomId: string) {
    if (!dates) {
      message.warning('请先选择入住和离店日期');
      return;
    }
    setSubmitting(roomId);
    try {
      await createOrder({
        roomId,
        checkIn: dates[0].format('YYYY-MM-DD'),
        checkOut: dates[1].format('YYYY-MM-DD'),
      });
      message.success('预订成功');
      navigate('/orders');
    } catch {
      message.error('预订失败，请确认后端已启动');
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spin size="large" />
      </div>
    );
  }

  if (!hotel) {
    return <Empty description="酒店不存在" />;
  }

  return (
    <div className="space-y-6">
      <img
        src={hotel.imageUrl}
        alt={hotel.name}
        className="h-72 w-full rounded-2xl object-cover"
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-800">{hotel.name}</h1>
          <p className="mt-2 text-slate-500">
            <EnvironmentOutlined className="mr-1" />
            {hotel.address}
          </p>
        </div>
        <Tag color="gold" icon={<StarFilled />} className="px-3 py-1 text-base">
          {hotel.rating}
        </Tag>
      </div>
      <p className="max-w-3xl text-slate-600">{hotel.description}</p>

      <Card title="选择入住时间">
        <DatePicker.RangePicker
          value={dates}
          onChange={(value) => setDates(value as [Dayjs, Dayjs] | null)}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {hotel.rooms.map((room) => (
          <Card key={room.id} title={room.name}>
            <p className="text-slate-500">最多 {room.capacity} 人</p>
            <p className="my-3 text-2xl font-semibold text-teal-700">
              ￥{room.price}
              <span className="ml-1 text-sm font-normal text-slate-400">
                / 晚
              </span>
            </p>
            <Button
              type="primary"
              loading={submitting === room.id}
              onClick={() => bookRoom(room.id)}
            >
              立即预订
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
