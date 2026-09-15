import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

type PublicUser = {
  id: string;
  email: string;
  name: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const matches = await bcrypt.compare(dto.password, user.password);
    if (!matches) {
      throw new UnauthorizedException('邮箱或密码错误');
    }

    return this.issueTokens(user);
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('该邮箱已注册');
    }

    const password = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password,
        name: dto.name,
      },
    });

    return this.issueTokens(user);
  }

  async refresh(dto: RefreshDto) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefresh(dto.refreshToken) },
      include: { user: true },
    });

    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(record.user);
  }

  async logout(dto: RefreshDto) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashRefresh(dto.refreshToken) },
    });

    if (record && !record.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }

    return { ok: true };
  }

  private async issueTokens(user: PublicUser) {
    const refreshDays = Number(
      this.configService.get<string>('JWT_REFRESH_DAYS') ?? 7,
    );
    const refreshToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + refreshDays);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashRefresh(refreshToken),
        expiresAt,
      },
    });

    const accessExpires = (this.configService.get<string>(
      'JWT_ACCESS_EXPIRES',
    ) ?? '15m') as StringValue;

    return {
      accessToken: this.jwtService.sign(
        { sub: user.id, email: user.email, typ: 'access' },
        { expiresIn: accessExpires },
      ),
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name ?? undefined,
      },
    };
  }

  private hashRefresh(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
