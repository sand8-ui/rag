import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ChatLlmService } from './chat-llm.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationService } from './conversation.service';

@Module({
  imports: [KnowledgeModule],
  controllers: [ChatController],
  providers: [ChatService, ChatLlmService, ConversationService],
})
export class ChatModule {}
