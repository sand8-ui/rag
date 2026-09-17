import { DeleteOutlined, PlusOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Card, Input, List } from 'antd';
import { useEffect, useRef, useState } from 'react';
import {
  deleteConversation,
  fetchConversation,
  fetchConversations,
  streamChat,
} from '../api/chat';
import type { ChatCitation, ChatMessageRecord, ConversationSummary } from '../types';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
};

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    '你好，我是 StayWise AI 客服。只回答酒店、预订和入住政策相关问题；无关问题我会直接说明超出范围，不会去查知识库。'
};

function titleFrom(content: string) {
  const compact = content.replace(/\s+/g, ' ').trim();
  return compact.length > 24 ? `${compact.slice(0, 24)}…` : compact;
}

function citationLabel(citation: ChatCitation) {
  return [citation.documentTitle, citation.sectionTitle].filter(Boolean).join(' / ');
}

export function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [streaming, setStreaming] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, streaming]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    void loadConversations();
  }, []);

  async function loadConversations() {
    setLoadingList(true);
    try {
      const { data } = await fetchConversations();
      setConversations(data);
    } catch {
      setConversations([]);
    } finally {
      setLoadingList(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  function startNew() {
    if (streaming) {
      stop();
    }
    setConversationId(undefined);
    setMessages([WELCOME]);
  }

  async function openConversation(id: string) {
    if (streaming) {
      stop();
    }
    setConversationId(id);
    try {
      const { data } = await fetchConversation(id);
      const records: ChatMessage[] = data.messages.map(toUiMessage);
      setMessages(records.length > 0 ? records : [WELCOME]);
    } catch {
      setMessages([
        {
          id: 'load-error',
          role: 'assistant',
          content: '会话加载失败，请稍后重试。',
        },
      ]);
    }
  }

  async function removeConversation(id: string) {
    try {
      await deleteConversation(id);
      setConversations((current) => current.filter((item) => item.id !== id));
      if (conversationId === id) {
        startNew();
      }
    } catch {
      // keep current view
    }
  }

  function rememberConversation(id: string, firstContent: string) {
    setConversationId(id);
    setConversations((current) => {
      const existing = current.find((item) => item.id === id);
      const next: ConversationSummary = {
        id,
        title: existing && existing.title !== '新对话' ? existing.title : titleFrom(firstContent),
        updatedAt: new Date().toISOString(),
      };
      return [next, ...current.filter((item) => item.id !== id)];
    });
  }

  async function send() {
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
      ...current.filter((message) => message.id !== WELCOME.id),
      userMessage,
      { id: assistantId, role: 'assistant', content: '' },
    ]);
    setInput('');
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      await streamChat(
        { conversationId, content: question },
        (payload) => {
          if (payload.conversationId) {
            rememberConversation(payload.conversationId, question);
          }
          if (payload.citations) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, citations: payload.citations }
                  : message,
              ),
            );
          }
          if (payload.error) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content: message.content || `回复失败：${payload.error}`,
                    }
                  : message,
              ),
            );
            return;
          }
          if (payload.token) {
            setMessages((current) =>
              current.map((message) =>
                message.id === assistantId
                  ? { ...message, content: `${message.content}${payload.token}` }
                  : message,
              ),
            );
          }
        },
        abort.signal,
      );
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }
      const text =
        error instanceof Error ? error.message : 'SSE 连接失败，请确认后端与模型服务已启动。';
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId && !message.content
            ? { ...message, content: text }
            : message,
        ),
      );
    } finally {
      if (abortRef.current === abort) {
        abortRef.current = null;
      }
      setStreaming(false);
    }
  }

  return (
    <div className="flex gap-4">
      <Card
        title="会话"
        className="w-64 shrink-0"
        extra={
          <Button type="link" size="small" icon={<PlusOutlined />} onClick={startNew}>
            新对话
          </Button>
        }
      >
        <List
          loading={loadingList}
          locale={{ emptyText: '还没有历史会话' }}
          dataSource={conversations}
          renderItem={(item) => (
            <List.Item
              className={`cursor-pointer rounded-lg px-2 ${
                item.id === conversationId ? 'bg-teal-50' : ''
              }`}
              onClick={() => void openConversation(item.id)}
              actions={[
                <Button
                  key="delete"
                  type="text"
                  size="small"
                  icon={<DeleteOutlined />}
                  onClick={(event) => {
                    event.stopPropagation();
                    void removeConversation(item.id);
                  }}
                />,
              ]}
            >
              <span className="truncate text-sm text-slate-700">{item.title}</span>
            </List.Item>
          )}
        />
      </Card>
      <Card title="AI 智能客服" className="min-w-0 flex-1">
        <div
          ref={listRef}
          className="mb-4 flex h-[420px] flex-col gap-3 overflow-y-auto rounded-lg bg-slate-50 p-4"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'ml-auto max-w-[80%] rounded-2xl bg-teal-700 px-4 py-2 text-white'
                  : 'mr-auto max-w-[80%] rounded-2xl bg-white px-4 py-2 text-slate-700 shadow-sm'
              }
            >
              <div>{message.content || (streaming ? '正在输入…' : '')}</div>
              {message.role === 'assistant' && message.citations && message.citations.length > 0 ? (
                <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-400">
                  参考：
                  {message.citations
                    .map(citationLabel)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join('；')}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={input}
            placeholder="问问取消政策、改期或房型推荐"
            onChange={(event) => setInput(event.target.value)}
            onPressEnter={() => void send()}
            disabled={streaming}
          />
          {streaming ? (
            <Button icon={<StopOutlined />} onClick={stop}>
              停止
            </Button>
          ) : (
            <Button type="primary" icon={<SendOutlined />} onClick={() => void send()}>
              发送
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function toUiMessage(message: ChatMessageRecord): ChatMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    citations: message.citations,
  };
}
