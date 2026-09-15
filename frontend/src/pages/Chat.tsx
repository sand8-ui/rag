import { SendOutlined } from '@ant-design/icons';
import { Button, Card, Input } from 'antd';
import { useRef, useState } from 'react';
import { API_BASE_URL } from '../api/client';
import { getAccessToken } from '../auth/tokens';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '你好，我是 StayWise AI 客服。现在是 SSE 占位流式输出，后续会接上 RAG。',
    },
  ]);
  const [streaming, setStreaming] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  function send() {
    const question = input.trim();
    if (!question || streaming) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };
    const assistantId = `assistant-${Date.now()}`;
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setStreaming(true);

    const token = getAccessToken();
    const source = new EventSource(
      `${API_BASE_URL}/chat/stream?q=${encodeURIComponent(question)}${
        token ? `&access_token=${encodeURIComponent(token)}` : ''
      }`,
    );
    sourceRef.current = source;

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as { token: string; done: boolean };
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? { ...message, content: `${message.content}${payload.token}` }
            : message,
        ),
      );
      if (payload.done) {
        source.close();
        setStreaming(false);
      }
    };

    source.onerror = () => {
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId && !message.content
            ? { ...message, content: 'SSE 连接失败，请确认后端已启动。' }
            : message,
        ),
      );
      source.close();
      setStreaming(false);
    };
  }

  return (
    <Card title="AI 智能客服">
      <div className="mb-4 flex h-[420px] flex-col gap-3 overflow-y-auto rounded-lg bg-slate-50 p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user'
                ? 'ml-auto max-w-[80%] rounded-2xl bg-teal-700 px-4 py-2 text-white'
                : 'mr-auto max-w-[80%] rounded-2xl bg-white px-4 py-2 text-slate-700 shadow-sm'
            }
          >
            {message.content || (streaming ? '正在输入…' : '')}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          placeholder="问问取消政策、改期或房型推荐"
          onChange={(event) => setInput(event.target.value)}
          onPressEnter={send}
          disabled={streaming}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={send}
          loading={streaming}
        >
          发送
        </Button>
      </div>
    </Card>
  );
}
