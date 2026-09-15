import { Button, DatePicker, Modal, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useEffect, useState } from 'react';
import { cancelOrder, fetchOrders, updateOrder } from '../api/orders';
import type { Order } from '../types';

const STATUS_LABEL: Record<Order['status'], { color: string; text: string }> = {
  PENDING: { color: 'blue', text: '待确认' },
  CONFIRMED: { color: 'green', text: '已确认' },
  CANCELLED: { color: 'default', text: '已取消' },
};

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

  async function onCancel(order: Order) {
    try {
      await cancelOrder(order.id);
      message.success('订单已取消');
      await loadOrders();
    } catch {
      message.error('取消失败');
    }
  }

  async function onSaveDates() {
    if (!editing || !dates) {
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
    } catch {
      message.error('改期失败');
    }
  }

  const columns: ColumnsType<Order> = [
    { title: '酒店', dataIndex: 'hotelName' },
    { title: '房型', dataIndex: 'roomName' },
    { title: '入住', dataIndex: 'checkIn' },
    { title: '离店', dataIndex: 'checkOut' },
    {
      title: '状态',
      dataIndex: 'status',
      render: (status: Order['status']) => (
        <Tag color={STATUS_LABEL[status].color}>{STATUS_LABEL[status].text}</Tag>
      ),
    },
    {
      title: '操作',
      render: (_, order) => (
        <div className="flex gap-2">
          <Button
            size="small"
            disabled={order.status === 'CANCELLED'}
            onClick={() => setEditing(order)}
          >
            改期
          </Button>
          <Button
            size="small"
            danger
            disabled={order.status === 'CANCELLED'}
            onClick={() => onCancel(order)}
          >
            取消
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
          onChange={(value) => setDates(value as [Dayjs, Dayjs] | null)}
        />
      </Modal>
    </div>
  );
}
