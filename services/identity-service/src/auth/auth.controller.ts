import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('.well-known/jwks.json')
  getJwks() {
    return this.authService.getKeyManager().getJwks();
  }

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { username: string; password: string; deviceId?: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    const userAgent = req.headers['user-agent'];
    return this.authService.login({
      username: body.username,
      password: body.password,
      deviceId: body.deviceId,
      ip,
      userAgent,
    });
  }

  @Post('auth/2fa/verify')
  @HttpCode(HttpStatus.OK)
  async verify2fa(
    @Body() body: { challengeToken: string; code: string; deviceId?: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    const userAgent = req.headers['user-agent'];
    return this.authService.verify2fa({
      challengeToken: body.challengeToken,
      code: body.code,
      deviceId: body.deviceId,
      ip,
      userAgent,
    });
  }

  @Post('auth/refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() body: { refreshToken: string },
    @Req() req: Request,
  ) {
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || undefined;
    const userAgent = req.headers['user-agent'];
    return this.authService.refresh({
      refreshToken: body.refreshToken,
      ip,
      userAgent,
    });
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body() body: { refreshToken?: string },
    @Req() req: Request,
  ) {
    const userId = (req.headers['x-user-id'] as string) || '';
    await this.authService.logout(userId, body.refreshToken);
  }

  @Post('auth/password/change')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() body: { oldPassword: string; newPassword: string },
    @Req() req: Request,
  ) {
    const userId = req.headers['x-user-id'] as string;
    await this.authService.changePassword(userId, body);
    return { success: true, message: 'Password updated successfully.' };
  }

  @Post('auth/2fa/setup')
  @HttpCode(HttpStatus.OK)
  async setup2fa(@Req() req: Request) {
    const userId = req.headers['x-user-id'] as string;
    return this.authService.setup2fa(userId);
  }

  @Post('auth/2fa/enable')
  @HttpCode(HttpStatus.OK)
  async enable2fa(@Body() body: { code: string }, @Req() req: Request) {
    const userId = req.headers['x-user-id'] as string;
    await this.authService.enable2fa(userId, body.code);
    return { success: true, message: '2FA enabled successfully.' };
  }
}
