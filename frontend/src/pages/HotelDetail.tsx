import { EnvironmentOutlined, StarFilled } from '@ant-design/icons';
import { Button, Card, DatePicker, Empty, Spin, Tag, message } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getApiErrorMessage } from '../api/auth';
import { fetchHotel } from '../api/hotels';
import { createOrder } from '../api/orders';
import type { Hotel } from '../types';
import { disablePastDate } from '../utils/booking-dates';

function readDates(
  checkIn?: string | null,
  checkOut?: string | null,
): [Dayjs, Dayjs] | null {
  if (!checkIn || !checkOut) {
    return null;
  }
  const start = dayjs(checkIn);
  const end = dayjs(checkOut);
  if (!start.isValid() || !end.isValid()) {
    return null;
  }
  return [start, end];
}

export function HotelDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [hotel, setHotel] = useState<Hotel | null>(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<[Dayjs, Dayjs] | null>(() =>
    readDates(searchParams.get('checkIn'), searchParams.get('checkOut')),
  );
  const [submitting, setSubmitting] = useState<string | null>(null);
  const guestsParam = searchParams.get('guests');
  const guests = guestsParam ? Number(guestsParam) : undefined;

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
    if (dates[0].isBefore(dayjs(), 'day')) {
      message.warning('入住日期不能早于今天');
      return;
    }
    if (!dates[1].isAfter(dates[0], 'day')) {
      message.warning('离店日期必须晚于入住日期');
      return;
    }
    setSubmitting(roomId);
    try {
      await createOrder({
        roomId,
        checkIn: dates[0].format('YYYY-MM-DD'),
        checkOut: dates[1].format('YYYY-MM-DD'),
        guests: guests && !Number.isNaN(guests) ? guests : undefined,
      });
      message.success('预订成功');
      navigate('/orders');
    } catch (error) {
      message.error(getApiErrorMessage(error, '预订失败，请稍后重试'));
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
      {guests ? (
        <p className="text-slate-500">本次查询人数：{guests} 人</p>
      ) : null}

      <Card title="选择入住时间">
        <DatePicker.RangePicker
          value={dates}
          disabledDate={disablePastDate}
          onChange={(value) => setDates(value as [Dayjs, Dayjs] | null)}
        />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {hotel.rooms.map((room) => {
          const overCapacity =
            Boolean(guests) && !Number.isNaN(guests) && room.capacity < guests!;
          return (
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
                disabled={overCapacity}
                onClick={() => bookRoom(room.id)}
              >
                {overCapacity ? '人数超出房型' : '立即预订'}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
