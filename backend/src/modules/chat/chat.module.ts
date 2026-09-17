import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ChatIntentService } from './chat-intent.service';
import { ChatLlmService } from './chat-llm.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationService } from './conversation.service';

@Module({
  imports: [KnowledgeModule],
  controllers: [ChatController],
  providers: [ChatService, ChatLlmService, ChatIntentService, ConversationService],
})
export class ChatModule {}
