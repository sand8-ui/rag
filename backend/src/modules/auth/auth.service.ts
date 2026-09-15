import { Injectable } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  login(dto: LoginDto) {
    return {
      accessToken: 'placeholder-token',
      user: {
        id: 'user-1',
        email: dto.email,
        name: '演示用户',
      },
    };
  }

  register(dto: RegisterDto) {
    return {
      accessToken: 'placeholder-token',
      user: {
        id: 'user-1',
        email: dto.email,
        name: dto.name ?? '演示用户',
      },
    };
  }
}
