import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../stores/auth';

type LoginForm = {
  email: string;
  password: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const { login: setSession } = useAuth();
  const [loading, setLoading] = useState(false);

  async function onFinish(values: LoginForm) {
    setLoading(true);
    try {
      const { data } = await login(values.email, values.password);
      setSession(data.accessToken, data.user);
      message.success('登录成功');
      navigate('/');
    } catch {
      setSession('placeholder-token', {
        id: 'user-1',
        email: values.email,
        name: '演示用户',
      });
      message.info('后端暂不可用，已使用本地占位登录');
      navigate('/');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#0f766e_0%,#134e4a_45%,#1c1917_100%)] px-4">
      <Card className="w-full max-w-md shadow-xl">
        <Typography.Title level={3} className="!mb-1">
          欢迎来到 StayWise
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          登录后即可搜索酒店、管理订单，并使用 AI 客服。
        </Typography.Paragraph>
        <Form<LoginForm>
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ email: 'guest@staywise.com', password: '123456' }}
        >
          <Form.Item
            name="email"
            label="邮箱"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@example.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, min: 6, message: '密码至少 6 位' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  );
}
