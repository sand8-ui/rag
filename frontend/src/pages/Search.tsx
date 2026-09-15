import { SearchOutlined } from '@ant-design/icons';
import { Button, Card, DatePicker, Form, InputNumber, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router-dom';

type SearchForm = {
  city: string;
  dates: [Dayjs, Dayjs];
  guests: number;
};

const CITIES = ['上海', '杭州', '成都', '北京'];

export function SearchPage() {
  const navigate = useNavigate();

  function onFinish(values: SearchForm) {
    const params = new URLSearchParams({
      city: values.city,
      checkIn: values.dates[0].format('YYYY-MM-DD'),
      checkOut: values.dates[1].format('YYYY-MM-DD'),
      guests: String(values.guests),
    });
    navigate(`/hotels?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#0f766e,#115e59)] px-8 py-14 text-white">
        <p className="text-sm uppercase tracking-[0.2em] text-teal-100">
          Hotel Booking
        </p>
        <h1 className="mt-2 text-4xl font-semibold">找一家今晚就想住下的酒店</h1>
        <p className="mt-3 max-w-2xl text-teal-50">
          选择城市、入住日期和人数，进入酒店列表。后续会接上真实库存与筛选。
        </p>
      </section>

      <Card>
        <Form<SearchForm>
          layout="inline"
          className="flex flex-wrap gap-4"
          onFinish={onFinish}
          initialValues={{ city: '上海', guests: 2 }}
        >
          <Form.Item
            name="city"
            label="城市"
            rules={[{ required: true, message: '请选择城市' }]}
          >
            <Select
              className="w-40"
              options={CITIES.map((city) => ({ label: city, value: city }))}
            />
          </Form.Item>
          <Form.Item
            name="dates"
            label="入住 / 离店"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker.RangePicker />
          </Form.Item>
          <Form.Item
            name="guests"
            label="人数"
            rules={[{ required: true, message: '请填写人数' }]}
          >
            <InputNumber min={1} max={8} className="w-24" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
              查询酒店
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
