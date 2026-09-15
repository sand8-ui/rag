import { Controller, HttpCode, Post } from '@nestjs/common';
import { ZodBody } from '../../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { loginSchema, type LoginDto } from './dto/login.dto';
import { refreshSchema, type RefreshDto } from './dto/refresh.dto';
import { registerSchema, type RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@ZodBody(loginSchema) dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  register(@ZodBody(registerSchema) dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@ZodBody(refreshSchema) dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@ZodBody(refreshSchema) dto: RefreshDto) {
    return this.authService.logout(dto);
  }
}
