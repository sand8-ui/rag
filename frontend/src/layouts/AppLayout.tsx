import {
  CustomerServiceOutlined,
  LogoutOutlined,
  OrderedListOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { Button, Layout, Menu } from 'antd';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../stores/auth';

const { Header, Content, Footer } = Layout;

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const selectedKey = location.pathname.startsWith('/orders')
    ? '/orders'
    : location.pathname.startsWith('/chat')
      ? '/chat'
      : location.pathname.startsWith('/hotels')
        ? '/hotels'
        : '/';

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center gap-6 bg-white px-6 shadow-sm">
        <Link to="/" className="shrink-0 text-lg font-semibold text-teal-800">
          StayWise 酒店预订
        </Link>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          className="min-w-0 flex-1 border-0"
          items={[
            {
              key: '/',
              icon: <SearchOutlined />,
              label: <Link to="/">搜索酒店</Link>,
            },
            {
              key: '/hotels',
              label: <Link to="/hotels">酒店列表</Link>,
            },
            {
              key: '/orders',
              icon: <OrderedListOutlined />,
              label: <Link to="/orders">我的订单</Link>,
            },
            {
              key: '/chat',
              icon: <CustomerServiceOutlined />,
              label: <Link to="/chat">AI 客服</Link>,
            },
          ]}
        />
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-slate-500 sm:inline">
            {user?.name ?? user?.email}
          </span>
          <Button
            icon={<LogoutOutlined />}
            onClick={() => {
              void logout().finally(() => {
                navigate('/login');
              });
            }}
          >
            退出
          </Button>
        </div>
      </Header>
      <Content className="px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </Content>
      <Footer className="text-center text-slate-500">
        StayWise 酒店预订平台 · 框架骨架
      </Footer>
    </Layout>
  );
}
