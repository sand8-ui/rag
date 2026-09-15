import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Tabs, Typography, message } from 'antd';
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getApiErrorMessage, login, register } from '../api/auth';
import { useAuth } from '../stores/auth';
import type { AuthResponse } from '../types';

type LoginForm = {
  email: string;
  password: string;
};

type RegisterForm = LoginForm & {
  name?: string;
};

function isValidAuthResponse(data: AuthResponse) {
  return Boolean(data?.accessToken && data?.refreshToken && data?.user?.id);
}

export function LoginPage() {
  const navigate = useNavigate();
  const { isReady, isAuthenticated, login: setSession } = useAuth();
  const [loading, setLoading] = useState(false);

  async function applySession(data: AuthResponse, successText: string) {
    if (!isValidAuthResponse(data)) {
      throw new Error('登录响应缺少双 token，请确认后端已启用 JWT 双 token');
    }
    setSession(data);
    message.success(successText);
    navigate('/');
  }

  async function onLogin(values: LoginForm) {
    setLoading(true);
    try {
      const { data } = await login(values.email, values.password);
      await applySession(data, '登录成功');
    } catch (error) {
      message.error(getApiErrorMessage(error, '登录失败，请检查账号或稍后重试'));
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(values: RegisterForm) {
    setLoading(true);
    try {
      const { data } = await register(values.email, values.password, values.name);
      await applySession(data, '注册成功');
    } catch (error) {
      message.error(getApiErrorMessage(error, '注册失败，请稍后重试'));
    } finally {
      setLoading(false);
    }
  }

  if (!isReady) {
    return null;
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#0f766e_0%,#134e4a_45%,#1c1917_100%)] px-4">
      <Card className="w-full max-w-md shadow-xl">
        <Typography.Title level={3} className="!mb-1">
          欢迎来到 StayWise
        </Typography.Title>
        <Tabs
          items={[
            {
              key: 'login',
              label: '登录',
              children: (
                <Form<LoginForm>
                  layout="vertical"
                  onFinish={onLogin}
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
              ),
            },
            {
              key: 'register',
              label: '注册',
              children: (
                <Form<RegisterForm> layout="vertical" onFinish={onRegister}>
                  <Form.Item name="name" label="昵称">
                    <Input prefix={<UserOutlined />} placeholder="可选" />
                  </Form.Item>
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
                    <Input.Password prefix={<LockOutlined />} placeholder="至少 6 位" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" block loading={loading}>
                    注册并登录
                  </Button>
                </Form>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
