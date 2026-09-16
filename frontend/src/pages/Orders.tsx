import { Button, DatePicker, Modal, Table, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '../api/auth';
import { deleteOrder, fetchOrders, updateOrder } from '../api/orders';
import type { Order } from '../types';
import { disablePastDate } from '../utils/booking-dates';

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Order | null>(null);
  const [dates, setDates] = useState<[Dayjs, Dayjs] | null>(null);

  async function loadOrders() {
    setLoading(true);
    try {
      const { data } = await fetchOrders();
      setOrders(data);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  function onDelete(order: Order) {
    Modal.confirm({
      title: '删除订单',
      content: `确定删除「${order.hotelName}」的预订吗？删除后不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '返回',
      onOk: async () => {
        try {
          await deleteOrder(order.id);
          message.success('订单已删除');
          await loadOrders();
        } catch (error) {
          message.error(getApiErrorMessage(error, '删除失败'));
        }
      },
    });
  }

  async function onSaveDates() {
    if (!editing || !dates) {
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
    try {
      await updateOrder(editing.id, {
        checkIn: dates[0].format('YYYY-MM-DD'),
        checkOut: dates[1].format('YYYY-MM-DD'),
      });
      message.success('入住时间已更新');
      setEditing(null);
      await loadOrders();
    } catch (error) {
      message.error(getApiErrorMessage(error, '改期失败'));
    }
  }

  const columns: ColumnsType<Order> = [
    { title: '酒店', dataIndex: 'hotelName' },
    { title: '房型', dataIndex: 'roomName' },
    {
      title: '人数',
      dataIndex: 'guests',
      render: (value?: number) => value ?? '-',
    },
    { title: '入住', dataIndex: 'checkIn' },
    { title: '离店', dataIndex: 'checkOut' },
    {
      title: '价格',
      dataIndex: 'price',
      render: (price: number) => `￥${price} / 晚`,
    },
    {
      title: '操作',
      render: (_, order) => (
        <div className="flex gap-2">
          <Button
            size="small"
            onClick={() => {
              setEditing(order);
              setDates([dayjs(order.checkIn), dayjs(order.checkOut)]);
            }}
          >
            改期
          </Button>
          <Button size="small" danger onClick={() => onDelete(order)}>
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">我的订单</h1>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={orders}
        pagination={false}
      />
      <Modal
        title="更改入住时间"
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={() => void onSaveDates()}
        okButtonProps={{ disabled: !dates }}
      >
        <DatePicker.RangePicker
          className="w-full"
          value={dates}
          disabledDate={disablePastDate}
          onChange={(value) => setDates(value as [Dayjs, Dayjs] | null)}
        />
      </Modal>
    </div>
  );
}
