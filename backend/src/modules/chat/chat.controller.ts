import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { ChatService } from './chat.service';
import { streamChatSchema, type StreamChatDto } from './dto/stream-chat.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthUser) {
    return this.chatService.listConversations(user.userId);
  }

  @Get('conversations/:id')
  getConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chatService.getConversation(user.userId, id);
  }

  @Delete('conversations/:id')
  removeConversation(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.chatService.removeConversation(user.userId, id);
  }

  @Post('stream')
  stream(
    @CurrentUser() user: AuthUser,
    @ZodBody(streamChatSchema) dto: StreamChatDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.chatService.writeSse(user.userId, dto, req, res);
  }
}
